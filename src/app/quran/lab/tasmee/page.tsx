import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import TasmeeLab from '@/features/quran/components/TasmeeLab';
import { isLabOwner } from '@/features/quran/speech/lab-guard';

/**
 * مختبر التسميع — مقفل خلف `QURAN_LAB=1`.
 *
 * ⚠️ ليست شاشة للطالبات ولا ميزةً معتمدة. أداة قياس تُفتح وقت
 * الاختبار وتُقفل بعده، ولا تظهر في أي قائمة ولا رابط في المنصة.
 *
 * ⚠️ والإقفال بشرطين: علَم البيئة **و** أن تكون صاحبة الطلب أدمِن.
 * فالعلَم وحده يفتح المختبر للجميع، والمختبر يفتح ميكروفونًا ويستهلك
 * رصيدًا مدفوعًا — فلا يُترك مشاعًا لمن يعرف الرابط.
 */

export const dynamic = 'force-dynamic';

export default async function TasmeeLabPage({
  searchParams,
}: {
  searchParams: { surah?: string; from?: string; to?: string };
}) {
  if (!(await isLabOwner())) notFound();

  // الإخلاص افتراضًا: قصيرة، معروفة، وتقلّ فيها المتشابهات
  const surahNo = Number(searchParams.surah ?? 112);
  const from = Number(searchParams.from ?? 1);
  const to = Number(searchParams.to ?? 4);

  const surah = getSurah(surahNo);
  if (!surah || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > surah.ayah_count)
    notFound();

  const ayahs = getAyahs(surahNo, from, to);
  if (!ayahs.length) notFound();

  const configured = Boolean(
    (process.env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_RESOURCE) &&
      process.env.AZURE_SPEECH_KEY
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <nav className="mb-4">
        <Link href="/quran" className="tap text-sm font-bold text-[var(--q-mute)]">
          <span aria-hidden>→</span> القرآن الكريم
        </Link>
      </nav>

      <h1 className="mb-1 font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        مختبر التسميع
      </h1>
      <p className="mb-4 text-[0.85rem] text-[var(--q-mute)]">
        أداة قياس داخلية — نموذج أوّلي، مو ميزة.
      </p>

      <p
        className={`mb-6 rounded-xl border p-3 text-[0.82rem] ${
          configured
            ? 'border-[var(--q-line)] bg-[var(--q-card)] text-[var(--q-mute)]'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        {configured
          ? '✅ المزوّد مضبوط — وضع الصوت جاهز.'
          : '⚠️ ما فيه مزوّد مضبوط بعد. وضع «نصّ» يشتغل كامل بلا مفتاح؛ ووضع «صوت» يحتاج ضبط المفتاح في بيئة الخادم.'}
      </p>

      <TasmeeLab ayahs={ayahs} surahName={surah.name_ar} />
    </main>
  );
}
