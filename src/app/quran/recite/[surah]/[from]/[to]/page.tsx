import { notFound } from 'next/navigation';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import { getReciter } from '@/features/quran/engine/reciters';
import ReciteScreen from '@/features/quran/components/ReciteScreen';

/**
 * شاشة «سمّع لي».
 *
 * ⚠️ نفس المسار للمنهج وللقسم العام — ونفس المحرّك. الفرق في المدى
 * وحده: المنهج يثبّته على درسه، والقسم العام تختاره الطالبة. ولو
 * بنينا شاشتين لافترقتا بعد شهر وصار للتسميع سلوكان.
 *
 * ⚠️ والمدى يُتحقَّق هنا من المصحف: الأرقام تأتي من العنوان، أي من
 * المستخدم، فلا تُصدَّق قبل الفحص.
 */

export const revalidate = 3600;

export default function RecitePage({
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
  )
    notFound();

  const surah = getSurah(surahNo);
  if (!surah || to > surah.ayah_count) notFound();

  const ayahs = getAyahs(surahNo, from, to);
  if (!ayahs.length) notFound();

  const lesson = searchParams.lesson?.slice(0, 80);

  return (
    <ReciteScreen
      surah={surah}
      ayahs={ayahs}
      from={from}
      to={to}
      reciter={getReciter()}
      {...(lesson
        ? { backHref: '/quran/curriculum', backLabel: 'منهجي الدراسي', lessonTitle: lesson }
        : {
            backHref: `/quran/study/${surahNo}/${from}/${to}`,
            backLabel: 'ارجعي للمقطع',
          })}
    />
  );
}
