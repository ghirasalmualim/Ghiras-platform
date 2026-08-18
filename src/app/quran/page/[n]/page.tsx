import { notFound } from 'next/navigation';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import { activeReciters, getReciter } from '@/features/quran/engine/reciters';
import {
  TOTAL_PAGES,
  ayahCountOfPage,
  getPage,
  juzOfPage,
  surahsOfPage,
} from '@/features/quran/engine/pages';
import StudyScreen from '@/features/quran/components/StudyScreen';
import { countAyahs, toArabic } from '@/features/quran/engine/numerals';

/**
 * صفحة من المصحف.
 *
 * نفس شاشة الدراسة لا شاشة ثانية: التكرار والإخفاء والتدريب والمراجعة
 * كلها تعمل هنا بلا سطر جديد، لأننا وسّعنا الشاشة لتقبل مقاطع بدل أن
 * نكتب لها نظيرة تتخلّف عنها بعد شهر.
 *
 * والصفحة العابرة تُعرض كما هي في المصحف — بسورتيها معًا — لأن إخفاء
 * ذلك يناقض سبب الميزة: الحافظة تحفظ بالورقة كما تراها.
 *
 * ⚠️ رقم الصفحة من العنوان أي من المستخدم، فيُتحقَّق قبل استعماله.
 */

export const revalidate = 3600;

export default function MushafPage({ params }: { params: { n: string } }) {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_PAGES) notFound();

  const page = getPage(n);
  if (!page) notFound();

  // آيات كل مقاطع الصفحة بترتيبها في المصحف
  const ayahs = page.segments.flatMap((s) =>
    getAyahs(s.surah, s.from_ayah, s.to_ayah)
  );
  if (!ayahs.length) notFound();

  const surahNumbers = surahsOfPage(page);
  const names = surahNumbers
    .map((no) => getSurah(no)?.name_ar)
    .filter(Boolean) as string[];

  /**
   * `surah` و`from`/`to` تبقى للتقدّم والمراجعة: سطر واحد لكل ما
   * يُفتح، مفتاحه أول مقطع. فلا تتشظّى حالة الطالبة على مقاطع الصفحة،
   * ولا نحتاج جدولًا جديدًا لأجل ثمانية بالمئة من الصفحات.
   */
  const head = page.segments[0];
  const surah = getSurah(head.surah);
  if (!surah) notFound();

  const count = ayahCountOfPage(page);

  return (
    <StudyScreen
      surah={surah}
      ayahs={ayahs}
      from={head.from_ayah}
      to={head.to_ayah}
      segments={page.segments}
      heading={`صفحة ${toArabic(n)}`}
      subheading={`${names.join(' و')} — ${countAyahs(count)} · الجزء ${toArabic(
        juzOfPage(n)
      )}`}
      prevHref={n > 1 ? `/quran/page/${n - 1}` : undefined}
      nextHref={n < TOTAL_PAGES ? `/quran/page/${n + 1}` : undefined}
      reciter={getReciter()}
      reciters={activeReciters()}
      backHref="/quran/browse?mode=page"
      backLabel="اختيار الصفحة"
    />
  );
}
