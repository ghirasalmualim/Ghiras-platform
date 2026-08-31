import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import TrashActions from '@/components/TrashActions';

export const dynamic = 'force-dynamic';

/**
 * سلة المحذوفات — الألعاب المحفوظة التي حذفتها المعلّمة (حذفٌ ناعم).
 * تُحفظ ٣٠ يومًا: تُستعاد أو تُحذف نهائيًّا يدويًّا، وإلا تُطهَّر تلقائيًّا.
 * قراءةٌ بجلسة المعلّمة (RLS) — كلٌّ يرى سلّته وحده. لا service-role.
 */

const GAME_NAMES: Record<string, string> = {
  millionaire: 'مَن سيربح', snake: 'الثعبان', xo: 'إكس-أو',
  sinjim: 'سِنجِم', balloons: 'البالونات',
};

const DAY = 24 * 60 * 60 * 1000;
const RETENTION = 30;

function fmt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function remainingDays(raw: string | null | undefined): number {
  if (!raw) return 0;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 0;
  const elapsed = Math.floor((Date.now() - d.getTime()) / DAY);
  return Math.max(0, RETENTION - elapsed);
}

export default async function TrashPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/workspace/trash');

  const { data } = await supabase
    .from('saved_games')
    .select('id, game_type, title, deleted_at')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(200);

  const items = (data ?? []) as {
    id: string; game_type: string; title: string | null; deleted_at: string;
  }[];

  return (
    <main dir="rtl" className="min-h-screen bg-cream px-4 py-6 md:px-8 md:py-10">
      <nav className="max-w-5xl mx-auto flex items-center gap-2 text-sm mb-6 flex-wrap">
        <Link href="/" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">الرئيسية</Link>
        <Link href="/workspace" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">مساحتي</Link>
        <Link href="/workspace/work" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">أعمالي</Link>
        <span className="px-3 py-1.5 rounded-full bg-sage text-white font-bold">المحذوفات</span>
        <Link href="/account" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">حسابي</Link>
      </nav>

      <header className="max-w-5xl mx-auto mb-7">
        <h1 className="text-2xl md:text-3xl font-extrabold text-sage-dark">سلة المحذوفات 🗑️</h1>
        <p className="text-gray-500 mt-1 text-sm md:text-base">تُحفظ الأعمال المحذوفة ٣٠ يومًا، ثم تُحذف نهائيًّا.</p>
      </header>

      <div className="max-w-5xl mx-auto">
        {items.length === 0 ? (
          <div className="card-3d bg-white p-8 rounded-2xl text-center">
            <span className="text-4xl">🗑️</span>
            <p className="text-gray-600 mt-3 font-bold">سلة المحذوفات فارغة.</p>
            <Link href="/workspace/work" className="inline-block mt-4 text-sage-dark font-bold hover:text-sage-deep">← الرجوع إلى أعمالي</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => {
              const left = remainingDays(it.deleted_at);
              return (
                <div key={it.id} className="card-3d bg-white p-4 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col">
                    <span className="font-bold text-sage-dark truncate">{it.title || 'لعبة'}</span>
                    <span className="text-xs text-gray-400">
                      {GAME_NAMES[it.game_type] ?? it.game_type}
                      {fmt(it.deleted_at) ? ` · حُذف ${fmt(it.deleted_at)}` : ''}
                      {` · يتبقّى ${left} يومًا`}
                    </span>
                  </div>
                  <TrashActions id={it.id} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
