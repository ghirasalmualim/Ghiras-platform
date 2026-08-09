import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import GameLauncher from '@/components/GameLauncher';
import LogoutButton from '@/components/LogoutButton';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  getStageBySlug,
  getGradeBySlug,
  getSubjects,
} from '@/lib/supabase/data';
import { Game } from '@/lib/types';

export const dynamic = 'force-dynamic'; // صفحة محمية — تُبنى لكل زائر حسب صلاحياته

// ── النسخ المجانية (الدرس الأول) المتوفّرة ──
// المفتاح: `${subjectSlug}|${gradeSlug}` — القيمة: رابط اللعبة المجانية.
// لإضافة نسخة مجانية جديدة مستقبلاً: أضِف سطراً هنا فقط.
const FREE_GAMES: Record<string, string> = {
  'social|grade-9': 'https://ghiras-games.vercel.app/free-social-g9/full-review',
  'social|grade-8': 'https://ghiras-games.vercel.app/free-social-g8/full-review',
  'social|grade-7': 'https://ghiras-games.vercel.app/free-social-g7/full-review',
  'social|grade-6': 'https://ghiras-games.vercel.app/free-social-g6/full-review',
  'social|grade-5': 'https://ghiras-games.vercel.app/free-social-g5/full-review',
  'social|grade-4': 'https://ghiras-games.vercel.app/free-social-g4/full-review',
  'social|grade-3': 'https://ghiras-games.vercel.app/free-social-g3/full-review',
  'social|grade-2': 'https://ghiras-games.vercel.app/free-social-g2/full-review',
  'social|grade-1': 'https://ghiras-games.vercel.app/free-social-g1/full-review',
  'science|grade-9': 'https://ghiras-games.vercel.app/free-science-g9/full-review',
  'science|grade-8': 'https://ghiras-games.vercel.app/free-science-g8/full-review',
  'science|grade-7': 'https://ghiras-games.vercel.app/free-science-g7/full-review',
  'science|grade-6': 'https://ghiras-games.vercel.app/free-science-g6/full-review',
  'science|grade-3': 'https://ghiras-games.vercel.app/free-science-g3/full-review',
  'science|grade-1': 'https://ghiras-games.vercel.app/free-science-g1/full-review',
  'arabic|grade-9': 'https://ghiras-games.vercel.app/free-arabic-g9/full-review',
  'arabic|grade-8': 'https://ghiras-games.vercel.app/free-arabic-g8/full-review',
  'arabic|grade-7': 'https://ghiras-games.vercel.app/free-arabic-g7/full-review',
  'arabic|grade-6': 'https://ghiras-games.vercel.app/free-arabic-g6/full-review',
  'arabic|grade-5': 'https://ghiras-games.vercel.app/free-arabic-g5/full-review',
  'arabic|grade-4': 'https://ghiras-games.vercel.app/free-arabic-g4/full-review',
  'arabic|grade-3': 'https://ghiras-games.vercel.app/free-arabic-g3/full-review',
  'arabic|grade-2': 'https://ghiras-games.vercel.app/free-arabic-g2/full-review',
  'arabic|grade-1': 'https://ghiras-games.vercel.app/free-arabic-g1/full-review',
  'islamic|grade-9': 'https://ghiras-games.vercel.app/free-islamic-g9/full-review',
  'islamic|grade-8': 'https://ghiras-games.vercel.app/free-islamic-g8/full-review',
  'islamic|grade-7': 'https://ghiras-games.vercel.app/free-islamic-g7/full-review',
  'islamic|grade-6': 'https://ghiras-games.vercel.app/free-islamic-g6/full-review',
  'islamic|grade-5': 'https://ghiras-games.vercel.app/free-islamic-g5/full-review',
  'islamic|grade-4': 'https://ghiras-games.vercel.app/free-islamic-g4/full-review',
  'islamic|grade-3': 'https://ghiras-games.vercel.app/free-islamic-g3/full-review',
  'islamic|grade-2': 'https://ghiras-games.vercel.app/free-islamic-g2/full-review',
  'islamic|grade-1': 'https://ghiras-games.vercel.app/free-islamic-g1/full-review',
};

export default async function SubjectPage({
  params,
}: {
  params: { stageSlug: string; gradeSlug: string; subjectSlug: string };
}) {
  const stage = await getStageBySlug(params.stageSlug);
  if (!stage) notFound();
  const grade = await getGradeBySlug(stage.id, params.gradeSlug);
  if (!grade) notFound();
  const subjects = await getSubjects(grade.id);
  const subject = subjects.find((s) => s.slug === params.subjectSlug);
  if (!subject) notFound();
  const path = `/stage/${stage.slug}/${grade.slug}/${subject.slug}`;

  // رابط النسخة المجانية لهذه المادة/الصف (إن وُجدت)
  const freeUrl = FREE_GAMES[`${subject.slug}|${grade.slug}`];

  // ── التحقق من تسجيل الدخول ──
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  // ── الملف الشخصي والحالة ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end')
    .eq('id', user.id)
    .single();
  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());
  const blocked =
    !profile || profile.status !== 'active' || Boolean(expired);
  // ── التحقق من الصلاحية على هذه المادة تحديداً ──
  let canAccess = false;
  if (!blocked) {
    const { data } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    canAccess = data === true;
  }
  // ── جلب الألعاب (سياسات الأمان لا تُعيدها إلا لمن يملك الصلاحية) ──
  let games: Game[] = [];
  if (canAccess) {
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('subject_id', subject.id)
      .eq('is_visible', true)
      .order('sort_order');
    games = (data as Game[]) ?? [];
  }
  return (
    <main className="min-h-dvh flex flex-col">
      <Header
        crumbs={[
          { label: stage.name, href: `/stage/${stage.slug}` },
          { label: grade.name, href: `/stage/${stage.slug}/${grade.slug}` },
          { label: subject.name },
        ]}
      />
      <section className="flex-1 w-full max-w-5xl mx-auto px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 animate-float-in">
            <span
              aria-hidden="true"
              className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl shadow-inset3d"
              style={{ backgroundColor: `${subject.color ?? '#7A9E7E'}1f` }}
            >
              {subject.icon ?? '📚'}
            </span>
            <div>
              <h1 className="text-2xl font-black text-sage-deep">
                {subject.name}
              </h1>
              <p className="text-sm text-ink/55">
                {grade.name} · {stage.name}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-3 animate-float-in"
            style={{ animationDelay: '0.08s' }}
          >
            {profile?.full_name && (
              <span className="text-sm text-ink/60">
                أهلاً، <b className="text-sage-deep">{profile.full_name}</b>
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
        {/* ── لا يملك صلاحية ── */}
        {!canAccess && (
          <div
            className="card-3d mt-10 p-10 text-center animate-float-in"
            style={{ animationDelay: '0.12s' }}
          >
            <span aria-hidden="true" className="text-5xl">
              🔒
            </span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">
              ليس لديك صلاحية للوصول إلى هذا المحتوى
            </h2>
            <p className="mt-2 text-ink/60 leading-relaxed">
              اشتراكك الحالي لا يشمل هذه المادة.
              <br />
              للاشتراك أو الترقية، يرجى التواصل مع إدارة غراس المعلم.
            </p>

            {/* زر التجربة المجانية — يظهر فقط للمواد التي لها نسخة مجانية */}
            {freeUrl && (
              <div className="mt-6">
                <a
                  href={freeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl text-white font-extrabold px-8 py-3 shadow-soft transition-all hover:brightness-105"
                  style={{ backgroundColor: '#C9A84C' }}
                >
                  🎁 جرّب النسخة المجانية
                </a>
                <p className="mt-2 text-xs text-ink/45">
                  تجربة مجانية — بدون اشتراك
                </p>
              </div>
            )}

            <div className="mt-6">
              <Link
                href={`/stage/${stage.slug}/${grade.slug}`}
                className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
              >
                العودة للمواد
              </Link>
            </div>
          </div>
        )}
        {/* ── يملك صلاحية لكن لا توجد ألعاب بعد ── */}
        {canAccess && games.length === 0 && (
          <div
            className="card-3d mt-10 p-10 text-center animate-float-in"
            style={{ animationDelay: '0.12s' }}
          >
            <span aria-hidden="true" className="text-5xl">
              🌱
            </span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">
              الألعاب قادمة قريباً
            </h2>
            <p className="mt-2 text-ink/60">
              هذه المادة قيد التجهيز — تُضاف الألعاب تباعاً بإذن الله
            </p>
          </div>
        )}
        {/* ── قائمة الألعاب ── */}
        {canAccess && games.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game, i) => (
              <div
                key={game.id}
                className="card-3d overflow-hidden flex flex-col animate-float-in"
                style={{ animationDelay: `${0.12 + i * 0.06}s` }}
              >
                {/* الغلاف */}
                <div
                  className="h-36 flex items-center justify-center text-5xl"
                  style={{
                    background: game.cover_url
                      ? undefined
                      : `linear-gradient(135deg, ${game.accent_color ?? '#7A9E7E'}22, ${game.accent_color ?? '#7A9E7E'}08)`,
                  }}
                >
                  {game.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={game.cover_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span aria-hidden="true">🎮</span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  {game.category && (
                    <span
                      className="self-start text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-2"
                      style={{
                        backgroundColor: `${game.accent_color ?? '#7A9E7E'}1f`,
                        color: game.accent_color ?? '#5C7F60',
                      }}
                    >
                      {game.category}
                    </span>
                  )}
                  <h3 className="font-extrabold text-lg text-ink">
                    {game.title}
                  </h3>
                  {game.description && (
                    <p className="mt-1 text-sm text-ink/60 leading-relaxed flex-1">
                      {game.description}
                    </p>
                  )}
                  <GameLauncher
                    gameId={game.id}
                    url={game.game_url}
                    accent={game.accent_color ?? '#7A9E7E'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
