import Link from 'next/link';
import { getSurah, getSurahs } from '@/features/quran/data/corpus';
import { TOTAL_PAGES, getPage } from '@/features/quran/engine/pages';
import SurahPicker from '@/features/quran/components/SurahPicker';
import PagePicker from '@/features/quran/components/PagePicker';

/**
 * اختيار ما يُقرأ: بالسورة والآيات، أو بصفحة المصحف.
 *
 * ── لماذا تبويبان لا شاشتان ──
 * الطريقتان تؤدّيان إلى نفس الشاشة، والفرق بينهما مدخلٌ لا وجهة.
 * فوضعهما في شاشة واحدة يُظهر أن أمامها خيارين، والفصل يُخفي الثاني
 * عمّن لا يعرف بوجوده.
 *
 * ── لماذا في القسم العام وحده ──
 * المنهج مقرّر بالآيات كما كتبته الوزارة، فإقحام الصفحات فيه يخلط
 * تقسيمين مختلفين. الصفحة اختيار الحافظة لنفسها لا للمقرّر.
 */

export const revalidate = 3600;

export default function BrowsePage({
  searchParams,
}: {
  searchParams: { mode?: string };
}) {
  const byPage = searchParams.mode === 'page';

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <nav className="mb-6">
        <Link
          href="/quran"
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> القرآن الكريم
        </Link>
      </nav>

      <div
        className="mb-6 inline-flex rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-1"
        role="tablist"
        aria-label="طريقة الاختيار"
      >
        <Tab href="/quran/browse" active={!byPage}>
          بالسورة
        </Tab>
        <Tab href="/quran/browse?mode=page" active={byPage}>
          بصفحة المصحف
        </Tab>
      </div>

      <h1 className="mb-1 font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        {byPage ? 'اختر الصفحة' : 'اختر السورة'}
      </h1>
      <p className="mb-6 text-[0.88rem] text-[var(--q-mute)]">
        {byPage
          ? 'كما في المصحف — تبدأ الصفحة وتنتهي حيث تنتهي في الورقة'
          : 'ثم حدّد من أي آية إلى أي آية'}
      </p>

      {byPage ? <PagePicker labels={pageLabels()} /> : <SurahPicker surahs={getSurahs()} />}
    </main>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`tap rounded-xl px-4 py-2 text-[0.86rem] font-bold transition ${
        active
          ? 'bg-[var(--q-accent)] text-white'
          : 'text-[var(--q-mute)] hover:text-[var(--q-accent)]'
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * اسم السورة التي تبدأ بها كل صفحة.
 *
 * يُحسب على الخادم ويُرسل سطرًا لكل صفحة، بدل إرسال ملف حدود الصفحات
 * كله إلى المتصفح. والأسماء من `surahs.json` لا من قائمة مكتوبة بيدنا،
 * فلا تنحرف عن المصحف.
 */
function pageLabels(): string[] {
  const out: string[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const page = getPage(p);
    const first = page?.segments[0];
    out.push(first ? (getSurah(first.surah)?.name_ar ?? '') : '');
  }
  return out;
}
