import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { isStillValid, TOOL_COLS } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

/**
 * مساحتي — الصفحة الشخصية الموحّدة للمعلمة (المرحلة أ).
 * طبقةُ عرضٍ وتجميعٍ فقط: تقرأ صفَّ profiles مرةً واحدة وتعرض
 * بطاقات الأدوات بحالتها. لا تمنح وصولًا ولا تخوّل — بوّابةُ كلِّ
 * أداةٍ القائمة تبقى هي المتحقّقة عند الفتح. لا جدولَ جديدًا،
 * ولا منطقَ اشتراكٍ جديدًا، ولا service-role.
 */

type Tool = {
  name: string;
  desc: string;
  href: string;
  col: (typeof TOOL_COLS)[number] | null; // null = مجاني
  emoji: string;
};

const TOOLS: Tool[] = [
  { name: 'الألعاب التعليمية', desc: 'ألعابٌ تفاعلية بالذكاء', href: '/games', col: null, emoji: '🎮' },
  { name: 'القرآن الكريم', desc: 'منهجٌ وتسميعٌ وحفظ', href: '/quran', col: null, emoji: '📖' },
  { name: 'مغامرة المجموعات', desc: 'تحدٍّ جماعيٌّ تفاعلي', href: '/adventure', col: 'adventure_until', emoji: '🚀' },
  { name: 'بنك غراس', desc: 'أوراق عملٍ ووسائل', href: '/gharas-bank', col: 'gharas_bank_until', emoji: '🏦' },
  { name: 'سجل الحضور الذكي', desc: 'حضورُ الصفِّ بسرعة', href: '/attendance', col: 'attendance_until', emoji: '📋' },
  { name: 'جدول الضرب', desc: 'تدريبٌ تفاعليّ', href: '/multiplication', col: 'multiplication_until', emoji: '✖️' },
  { name: 'الساعة التفاعلية', desc: 'تعلُّمُ الوقت', href: '/clock', col: 'clock_until', emoji: '🕐' },
  { name: 'سجل الدرجات الذكي', desc: 'رصدُ درجات الطلاب', href: '/gradebook-locked', col: 'gradebook_until', emoji: '📊' },
  { name: 'الورش التعليمية', desc: 'ورشٌ مهنية', href: '/workshops-locked', col: 'workshops_until', emoji: '🎓' },
  { name: 'سجلات رئيس القسم', desc: 'متابعةٌ إدارية', href: '/head-records-locked', col: 'head_records_until', emoji: '🗂️' },
];

function statusOf(tool: Tool, profile: Record<string, unknown>, isAdmin: boolean):
  { label: string; tone: 'free' | 'available' | 'expired' | 'locked' } {
  if (isAdmin) return { label: 'متاح', tone: 'available' };
  if (tool.col === null) return { label: 'مجاني', tone: 'free' };
  const raw = (profile[tool.col] as string | null) ?? null;
  if (isStillValid(raw)) return { label: 'متاح', tone: 'available' };
  if (raw) return { label: 'انتهى الاشتراك', tone: 'expired' };
  return { label: 'غير مشترك', tone: 'locked' };
}

const TONE: Record<string, string> = {
  free: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  available: 'bg-sage/10 text-sage-dark border-sage/30',
  expired: 'bg-amber-50 text-amber-700 border-amber-200',
  locked: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default async function WorkspacePage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/workspace');

  const { data: profile } = await supabase
    .from('profiles')
    .select(['full_name', 'role', 'status', 'game_credits', ...TOOL_COLS].join(', '))
    .eq('id', user.id)
    .maybeSingle();

  const p = (profile ?? {}) as Record<string, unknown>;
  const isAdmin = p.role === 'admin';
  const name = (p.full_name as string) || 'معلمتنا';
  const credits = typeof p.game_credits === 'number' ? p.game_credits : 0;

  // ملخّصٌ صغير لنتائج الطلاب: العدد + آخر ثلاث نتائج (استعلامٌ خفيف).
  const [{ count: resultsCount }, { data: latestResults }] = await Promise.all([
    supabase.from('game_results').select('id', { count: 'exact', head: true })
      .eq('teacher_user_id', user.id),
    supabase.from('game_results').select('student_name, percentage, created_at')
      .eq('teacher_user_id', user.id).order('created_at', { ascending: false }).limit(3),
  ]);
  const latest = latestResults ?? [];

  return (
    <main dir="rtl" className="min-h-screen bg-cream px-4 py-6 md:px-8 md:py-10">
      <nav className="max-w-5xl mx-auto flex items-center gap-2 text-sm mb-6">
        <span className="px-3 py-1.5 rounded-full bg-sage text-white font-bold">مساحتي</span>
        <Link href="/workspace/work" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">أعمالي</Link>
        <Link href="/account" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">حسابي</Link>
      </nav>

      <header className="max-w-5xl mx-auto mb-7">
        <h1 className="text-2xl md:text-3xl font-extrabold text-sage-dark">مرحبًا، {name} 🌿</h1>
        <p className="text-gray-500 mt-1 text-sm md:text-base">كل أدوات غراس في مكانٍ واحد.</p>
      </header>

      <section className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((tool) => {
          const st = statusOf(tool, p, isAdmin);
          return (
            <Link key={tool.href} href={tool.href}
              className="card-3d bg-white p-5 rounded-2xl flex flex-col gap-3 hover:border-sage transition-all">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl leading-none">{tool.emoji}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TONE[st.tone]}`}>{st.label}</span>
              </div>
              <div>
                <h2 className="font-bold text-sage-dark">{tool.name}</h2>
                <p className="text-gray-400 text-sm mt-0.5">{tool.desc}</p>
              </div>
              {tool.href === '/games' && (
                <p className="text-xs text-gray-500 mt-auto">رصيد الألعاب: <span className="font-bold text-sage-dark">{isAdmin ? '∞' : credits}</span></p>
              )}
            </Link>
          );
        })}
      </section>

      <section className="max-w-5xl mx-auto mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sage-dark">نتائج الطلاب</h2>
          {(resultsCount ?? 0) > 0 && (
            <Link href="/workspace/work" className="text-xs text-sage-dark hover:text-sage-deep">عرض النتائج ←</Link>
          )}
        </div>
        {(resultsCount ?? 0) === 0 ? (
          <div className="card-3d bg-white p-5 rounded-2xl text-center text-gray-500 text-sm">لا توجد نتائج محفوظة حتى الآن.</div>
        ) : (
          <div className="card-3d bg-white p-4 rounded-2xl">
            <p className="text-xs text-gray-400 mb-2">إجمالي النتائج: <span className="font-bold text-sage-dark">{resultsCount}</span></p>
            <div className="flex flex-col gap-2">
              {latest.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-sage-dark">{r.student_name as string}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sage/10 text-sage-dark border border-sage/30 tabular-nums">{r.percentage as number}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
