import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import DeleteWorkButton from '@/components/DeleteWorkButton';

export const dynamic = 'force-dynamic';

/**
 * أعمالي (المرحلة ب) — تجميعُ عرضٍ فقط للأعمال المحفوظة الموجودة
 * فعليًا: قراءةٌ بجلسة المعلمة (RLS) بلا نقلِ بياناتٍ وبلا مصدرِ
 * حقيقةٍ جديد. كل أداةٍ تبقى مالكةَ بياناتها. سجل الدرجات خارجيٌّ
 * وقراءته بمفتاح خدمة، فيُعرض رابطًا فقط دون قراءةٍ من هذه الصفحة.
 * لا game_results هنا (المرحلة ج).
 */

const GAME_NAMES: Record<string, string> = {
  millionaire: 'مَن سيربح', snake: 'الثعبان', xo: 'إكس-أو',
  sinjim: 'سِنجِم', balloons: 'البالونات',
};

function fmt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default async function MyWorkPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/workspace/work');

  const [gamesRes, attRes, advRes, resRes] = await Promise.all([
    supabase.from('saved_games').select('id, title, game_type, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50),
    supabase.from('attendance_data').select('updated_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('adventure_data').select('updated_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('game_results')
      .select('id, student_name, game_type, score, total, percentage, completed, created_at')
      .eq('teacher_user_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);

  const games = gamesRes.data ?? [];
  const attendance = attRes.data ?? null;
  const adventure = advRes.data ?? null;
  const results = resRes.data ?? [];
  const isEmpty = games.length === 0 && !attendance && !adventure && results.length === 0;

  return (
    <main dir="rtl" className="min-h-screen bg-cream px-4 py-6 md:px-8 md:py-10">
      <nav className="max-w-5xl mx-auto flex items-center gap-2 text-sm mb-6 flex-wrap">
        <Link href="/" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">الرئيسية</Link>
        <Link href="/workspace" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">مساحتي</Link>
        <span className="px-3 py-1.5 rounded-full bg-sage text-white font-bold">أعمالي</span>
        <Link href="/workspace/trash" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">المحذوفات</Link>
        <Link href="/account" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">حسابي</Link>
      </nav>

      <header className="max-w-5xl mx-auto mb-7">
        <h1 className="text-2xl md:text-3xl font-extrabold text-sage-dark">أعمالي 🗂️</h1>
        <p className="text-gray-500 mt-1 text-sm md:text-base">كل ما حفظتِه في أدوات غراس.</p>
      </header>

      <div className="max-w-5xl mx-auto flex flex-col gap-7">
        {isEmpty && (
          <div className="card-3d bg-white p-8 rounded-2xl text-center">
            <p className="text-gray-500">ما عندك أعمال محفوظة حتى الآن.</p>
            <Link href="/workspace" className="inline-block mt-4 text-sage-dark font-bold hover:text-sage-deep">← الرجوع إلى مساحتي</Link>
          </div>
        )}

        {games.length > 0 && (
          <section>
            <h2 className="font-bold text-sage-dark mb-3">ألعابي المحفوظة</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {games.map((g) => (
                <div key={g.id} className="card-3d bg-white p-4 rounded-xl flex flex-col gap-1">
                  <span className="font-bold text-sage-dark truncate">{g.title || 'لعبة'}</span>
                  <span className="text-xs text-gray-400">{GAME_NAMES[g.game_type] ?? g.game_type}{fmt(g.updated_at) ? ` · ${fmt(g.updated_at)}` : ''}</span>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <Link href={`/${g.game_type}`} className="text-xs font-bold text-sage-dark hover:text-sage-deep">فتح ←</Link>
                    <DeleteWorkButton id={g.id} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {attendance && (
          <section>
            <h2 className="font-bold text-sage-dark mb-3">الحضور</h2>
            <Link href="/attendance" className="card-3d bg-white p-4 rounded-xl flex items-center justify-between hover:border-sage transition">
              <span className="text-sage-dark">سجل الحضور{fmt(attendance.updated_at) ? ` · آخر تحديث ${fmt(attendance.updated_at)}` : ''}</span>
              <span className="text-xs text-sage-dark">فتح ←</span>
            </Link>
          </section>
        )}

        {adventure && (
          <section>
            <h2 className="font-bold text-sage-dark mb-3">المغامرة</h2>
            <Link href="/adventure" className="card-3d bg-white p-4 rounded-xl flex items-center justify-between hover:border-sage transition">
              <span className="text-sage-dark">مغامرة المجموعات{fmt(adventure.updated_at) ? ` · آخر تحديث ${fmt(adventure.updated_at)}` : ''}</span>
              <span className="text-xs text-sage-dark">فتح ←</span>
            </Link>
          </section>
        )}

        {results.length > 0 && (
          <section>
            <h2 className="font-bold text-sage-dark mb-3">نتائج الطلاب</h2>
            <div className="flex flex-col gap-2">
              {results.map((r) => (
                <div key={r.id} className="card-3d bg-white p-4 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col">
                    <span className="font-bold text-sage-dark">{r.student_name}</span>
                    <span className="text-xs text-gray-400">{GAME_NAMES[r.game_type] ?? r.game_type}{fmt(r.created_at) ? ` · ${fmt(r.created_at)}` : ''}{r.completed ? '' : ' · غير مكتملة'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sage-dark tabular-nums">{r.score} / {r.total}</span>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sage/10 text-sage-dark border border-sage/30 tabular-nums">{r.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-bold text-sage-dark mb-3">سجل الدرجات</h2>
          <Link href="/api/tool-access?tool=gradebook" className="card-3d bg-white p-4 rounded-xl flex items-center justify-between hover:border-sage transition">
            <span className="text-sage-dark">سجل الدرجات الذكي</span>
            <span className="text-xs text-sage-dark">فتح السجل ←</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
