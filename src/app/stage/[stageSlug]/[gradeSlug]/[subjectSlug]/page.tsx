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
import { subjectDisplayName } from '@/lib/subject-display';

export const dynamic = 'force-dynamic'; // صفحة محمية — تُبنى لكل زائر حسب صلاحياته

// ── النسخ المجانية (الدرس الأول) المتوفّرة ──
// المفتاح: `${subjectSlug}|${gradeSlug}` — القيمة: رابط اللعبة المجانية.
// لإضافة نسخة مجانية جديدة مستقبلاً: أضِف سطراً هنا فقط.
const FREE_GAMES: Record<string, string> = {
  'social|grade-9': 'https://games.ghiras-edu.com/free-social-g9/full-review',
  'social|grade-8': 'https://games.ghiras-edu.com/free-social-g8/full-review',
  'social|grade-7': 'https://games.ghiras-edu.com/free-social-g7/full-review',
  'social|grade-6': 'https://games.ghiras-edu.com/free-social-g6/full-review',
  'social|grade-5': 'https://games.ghiras-edu.com/free-social-g5/full-review',
  'social|grade-4': 'https://games.ghiras-edu.com/free-social-g4/full-review',
  'social|grade-3': 'https://games.ghiras-edu.com/free-social-g3/full-review',
  'social|grade-2': 'https://games.ghiras-edu.com/free-social-g2/full-review',
  'social|grade-1': 'https://games.ghiras-edu.com/free-social-g1/full-review',
  'science|grade-9': 'https://games.ghiras-edu.com/free-science-g9/full-review',
  'science|grade-8': 'https://games.ghiras-edu.com/free-science-g8/full-review',
  'science|grade-7': 'https://games.ghiras-edu.com/free-science-g7/full-review',
  'science|grade-6': 'https://games.ghiras-edu.com/free-science-g6/full-review',
  'science|grade-5': 'https://games.ghiras-edu.com/free-science-g5/full-review',
  'science|grade-4': 'https://games.ghiras-edu.com/free-science-g4/full-review',
  'science|grade-3': 'https://games.ghiras-edu.com/free-science-g3/full-review',
  'science|grade-2': 'https://games.ghiras-edu.com/free-science-g2/full-review',
  'science|grade-1': 'https://games.ghiras-edu.com/free-science-g1/full-review',
  'arabic|grade-9': 'https://games.ghiras-edu.com/free-arabic-g9/full-review',
  'arabic|grade-8': 'https://games.ghiras-edu.com/free-arabic-g8/full-review',
  'arabic|grade-7': 'https://games.ghiras-edu.com/free-arabic-g7/full-review',
  'arabic|grade-6': 'https://games.ghiras-edu.com/free-arabic-g6/full-review',
  'arabic|grade-5': 'https://games.ghiras-edu.com/free-arabic-g5/full-review',
  'english|grade-9': 'https://games.ghiras-edu.com/free-english-g9/full-review',
  'english|grade-8': 'https://games.ghiras-edu.com/free-english-g8/full-review',
  'english|grade-7': 'https://games.ghiras-edu.com/free-english-g7/full-review',
  'english|grade-6': 'https://games.ghiras-edu.com/free-english-g6/full-review',
  'math|grade-2': 'https://games.ghiras-edu.com/free-math-g2/full-review',
  'math|grade-1': 'https://games.ghiras-edu.com/free-math-g1/full-review',
  'english|grade-5': 'https://games.ghiras-edu.com/free-english-g5/full-review',
  'english|grade-4': 'https://games.ghiras-edu.com/free-english-g4/full-review',
  'english|grade-2': 'https://games.ghiras-edu.com/free-english-g2/full-review',
  'english|grade-3': 'https://games.ghiras-edu.com/free-english-g3/full-review',
  'english|grade-1': 'https://games.ghiras-edu.com/free-english-g1/full-review',
  'arabic|grade-4': 'https://games.ghiras-edu.com/free-arabic-g4/full-review',
  'arabic|grade-3': 'https://games.ghiras-edu.com/free-arabic-g3/full-review',
  'arabic|grade-2': 'https://games.ghiras-edu.com/free-arabic-g2/full-review',
  'arabic|grade-1': 'https://games.ghiras-edu.com/free-arabic-g1/full-review',
  'islamic|grade-9': 'https://games.ghiras-edu.com/free-islamic-g9/full-review',
  'islamic|grade-8': 'https://games.ghiras-edu.com/free-islamic-g8/full-review',
  'islamic|grade-7': 'https://games.ghiras-edu.com/free-islamic-g7/full-review',
  'islamic|grade-6': 'https://games.ghiras-edu.com/free-islamic-g6/full-review',
  'islamic|grade-5': 'https://games.ghiras-edu.com/free-islamic-g5/full-review',
  'islamic|grade-4': 'https://games.ghiras-edu.com/free-islamic-g4/full-review',
  'islamic|grade-3': 'https://games.ghiras-edu.com/free-islamic-g3/full-review',
  'islamic|grade-2': 'https://games.ghiras-edu.com/free-islamic-g2/full-review',
  'islamic|grade-1': 'https://games.ghiras-edu.com/free-islamic-g1/full-review',
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
  /**
   * ⚠️ `maybeSingle()` لا `single()`.
   *
   * `single()` يرمي خطأً (`PGRST116`) حين لا يجد صفًّا، فيختلط **غيابُ
   * الملف** بـ**تعثُّرِ القراءة** في قناةٍ واحدة. و`maybeSingle()` يفصلهما
   * فصلًا نظيفًا: خطأٌ ⇒ عطب، و`null` بلا خطأ ⇒ غياب.
   */
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end, role')
    .eq('id', user.id)
    .maybeSingle();

  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());

  /**
   * ⚠️ **الأدمِن معفًى من التاريخ، لا من الحالة.**
   *
   * `can_access_subject` تفعل هذا بحرفه: `pr.status = 'active'` تشمل
   * الجميع، وفحصُ `sub_end` في فرع غير الأدمِن وحده. وكان هذا الحارس
   * أقسى من القاعدة — فيمنع صاحبة المنصّة يوم ينقضي تاريخها والقاعدة
   * تُجيز لها. ولا أحد يفتحها لها، لأن الفتح نفسه يحتاج أدمِن.
   *
   * ⚠️ و«منتهٍ» كلمتان لا واحدة: `status === 'expired'` قرارٌ مسجَّل
   * يردّ الجميع، و`expired` تاريخٌ يمضي بنفسه — وهذا وحده يُستثنى منه.
   */
  const isAdmin = profile?.role === 'admin';

  /**
   * ⚠️ **حالةٌ واحدة لكل سبب — و«ليس لديك صلاحية» واحدةٌ منها فقط.**
   *
   * كان سطرٌ واحد يبتلع أربعة أسبابٍ ثم يُخرجها كلها باسم واحد: غيابَ
   * الملف، وتعثُّرَ قراءته، والإيقاف، والانقضاء. فيُتَّهم حسابٌ سليم
   * بسبب تعثُّرِ قراءة.
   *
   * **والاتهام لا يقع الآن إلا حين تقول الدالّة `false` صراحةً وبلا خطأ.**
   *
   * ⚠️ وهذا ما وقع فعلًا: معرّفٌ ليس UUID أخرج `22P02` من القاعدة،
   * فصار `data = null`، و`null !== true` — فقيل لحسابٍ صلاحيتُه
   * سليمة تمامًا «ليس لديك صلاحية».
   */
  type AuthState =
    | 'ALLOWED'
    | 'ACCESS_DENIED'
    | 'PROFILE_ERROR'
    | 'PROFILE_MISSING'
    | 'STATUS_SUSPENDED'
    | 'SUBSCRIPTION_EXPIRED'
    | 'AUTHORIZATION_ERROR'
    | 'CONTENT_MISCONFIGURED';

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let authState: AuthState;
  let faultCode: string | null = null;

  if (profileError) {
    authState = 'PROFILE_ERROR';
    faultCode = (profileError as { code?: string }).code ?? null;
  } else if (!profile) {
    authState = 'PROFILE_MISSING';
  } else if (profile.status === 'suspended') {
    authState = 'STATUS_SUSPENDED';
  } else if (profile.status === 'expired' || (!isAdmin && Boolean(expired))) {
    authState = 'SUBSCRIPTION_EXPIRED';
  } else if (!UUID_RE.test(subject.id)) {
    // ⚠️ معرّفٌ مصدرُه القاعدة وليس UUID ⇒ عطبٌ عندنا، لا نقصٌ في المحتوى
    authState = 'CONTENT_MISCONFIGURED';
  } else {
    const { data, error } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    if (error) {
      // ⚠️ خطأٌ ليس رفضًا — ولا يجوز أن يُترجَم إلى «ممنوع»
      authState = 'AUTHORIZATION_ERROR';
      faultCode = (error as { code?: string }).code ?? null;
    } else {
      authState = data === true ? 'ALLOWED' : 'ACCESS_DENIED';
    }
  }

  const canAccess = authState === 'ALLOWED';
  const isTechnicalFault =
    authState === 'PROFILE_ERROR' ||
    authState === 'AUTHORIZATION_ERROR' ||
    authState === 'CONTENT_MISCONFIGURED';

  /**
   * ⚠️ الأعطاب تُسجَّل على الخادم — **ولا يرى المستخدم رمز قاعدةٍ أبدًا.**
   * الرمز يُفشي بنية القاعدة ولا يُفيد المشتركة في شيء.
   */
  if (isTechnicalFault || authState === 'PROFILE_MISSING') {
    console.error('[SUBJECT_AUTH_FAULT]', authState, faultCode ?? '-');
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
          { label: subjectDisplayName(subject, grade.slug) },
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
                {subjectDisplayName(subject, grade.slug)}
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
            <Link
              href="/account"
              className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-bold text-ink/55 transition-colors hover:border-sage hover:text-sage-deep"
            >
              حسابي
            </Link>
            <LogoutButton />
          </div>
        </div>
        {/* ── تعذّر الوصول — والسبب يُقال كما هو ── */}
        {!canAccess && (
          <div
            className="card-3d mt-10 p-10 text-center animate-float-in"
            style={{ animationDelay: '0.12s' }}
          >
            <span aria-hidden="true" className="text-5xl">
              {authState === 'ACCESS_DENIED'
                ? '🔒'
                : authState === 'STATUS_SUSPENDED'
                ? '⛔'
                : authState === 'SUBSCRIPTION_EXPIRED'
                ? '🗓️'
                : authState === 'PROFILE_MISSING'
                ? '📄'
                : '⚠️'}
            </span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">
              {authState === 'ACCESS_DENIED'
                ? 'ليس لديك صلاحية للوصول إلى هذا المحتوى'
                : authState === 'STATUS_SUSPENDED'
                ? 'هذا الحساب موقوف'
                : authState === 'SUBSCRIPTION_EXPIRED'
                ? 'انتهى اشتراكك'
                : authState === 'PROFILE_MISSING'
                ? 'حسابك يحتاج تهيئة'
                : 'تعذّر التحقق الآن'}
            </h2>
            <p className="mt-2 text-ink/60 leading-relaxed">
              {authState === 'ACCESS_DENIED'
                ? 'اشتراكك الحالي لا يشمل هذه المادة. للاشتراك أو الترقية، يرجى التواصل مع إدارة غراس المعلم.'
                : authState === 'STATUS_SUSPENDED'
                ? 'يرجى التواصل مع إدارة غراس المعلم.'
                : authState === 'SUBSCRIPTION_EXPIRED'
                ? 'جدّدي اشتراكك للمتابعة — ومحتواك محفوظ كما هو.'
                : authState === 'PROFILE_MISSING'
                ? 'تواصلي معنا وسنُتمّها لك.'
                : 'خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.'}
            </p>

            {/*
              ⚠️ زرُّ إعادةٍ للأعطاب التقنية وحدها — ورابطٌ لا زرُّ عميل،
              فالصفحة مكوّن خادم.
            */}
            {isTechnicalFault && (
              <div className="mt-6">
                <a
                  href={path}
                  className="inline-block rounded-xl bg-sage px-8 py-3 font-extrabold text-white shadow-soft transition-colors hover:bg-sage-dark"
                >
                  إعادة المحاولة
                </a>
              </div>
            )}

            {/*
              زر التجربة المجانية — للرفض الحقيقي وحده.
              ⚠️ وعرضُه عند عطبٍ نحن سببه استغلالٌ لخللٍ من عندنا لا عرضُ خدمة.
            */}
            {authState === 'ACCESS_DENIED' && freeUrl && (
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
