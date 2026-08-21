import { notFound } from 'next/navigation';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import { activeReciters, getReciter } from '@/features/quran/engine/reciters';
import StudyScreen from '@/features/quran/components/StudyScreen';

/**
 * شاشة الدراسة — تُصيَّر على الخادم.
 *
 * المتصفح لا ينزّل المصحف: الخادم يقرأ الملف ويرسل الآيات المطلوبة
 * وحدها. مقطع من عشر آيات يصل في كيلوبايتات، بدل ٧٣٠ كيلوبايت لو
 * أرسلنا المصحف كله إلى الجهاز.
 *
 * المعاملات من عنوان الصفحة، أي من المستخدم، فتُتحقَّق كلها قبل
 * الاستعمال: سورة موجودة، ومدى داخل حدودها، وبداية قبل نهاية.
 */

export const revalidate = 3600;

export default function StudyPage({
  params,
  searchParams,
}: {
  params: { surah: string; from: string; to: string };
  searchParams: { lesson?: string };
}) {
  const surahNo = Number(params.surah);
  const from = Number(params.from);
  const to = Number(params.to);

  if (
    !Number.isInteger(surahNo) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < from
  ) {
    notFound();
  }

  const surah = getSurah(surahNo);
  if (!surah || to > surah.ayah_count) notFound();

  const ayahs = getAyahs(surahNo, from, to);
  if (!ayahs.length) notFound();

  /**
   * السورتان الجارتان — لتستمرّ القراءة عبر حدود السورة.
   *
   * ⚠️ يُمرَّر عدد آياتهما لا رقمهما وحده: الشاشة تحتاج أن تحسب مدًى
   * صالحًا في السورة التالية، ومقطعُ عشر آيات لا يصلح في الكوثر. ولو
   * بنت الرابط بلا هذا العدد لأنتجت مدًى خارج الحدود، ولردّت الصفحةُ
   * التالية «غير موجودة» — وهو أسوأ من زرٍّ غائب.
   */
  const nextSurah = surahNo < 114 ? getSurah(surahNo + 1) : null;
  const prevSurah = surahNo > 1 ? getSurah(surahNo - 1) : null;

  return (
    <StudyScreen
      surah={surah}
      {...(nextSurah
        ? { nextSurah: { number: nextSurah.number, name_ar: nextSurah.name_ar, ayah_count: nextSurah.ayah_count } }
        : {})}
      {...(prevSurah
        ? { prevSurah: { number: prevSurah.number, name_ar: prevSurah.name_ar, ayah_count: prevSurah.ayah_count } }
        : {})}
      ayahs={ayahs}
      from={from}
      to={to}
      reciter={getReciter()}
      reciters={activeReciters()}
      {...(searchParams.lesson
        ? {
            // جاء من المنهج: نرجعه إلى المنهج لا إلى قائمة السور،
            // ونعرض اسم الدرس فوق اسم السورة ليعرف أين هو من مقرره.
            backHref: '/quran/curriculum',
            backLabel: 'منهجي الدراسي',
            lessonTitle: searchParams.lesson.slice(0, 80),
          }
        : { backHref: '/quran/browse', backLabel: 'اختيار السورة' })}
    />
  );
}
