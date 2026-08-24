import Link from 'next/link';
import StabilityIntro from '@/features/quran/components/StabilityIntro';

/**
 * 🧠 اختبر ثبات حفظك — «هل حفظي القديم ما زال ثابتًا؟»
 *
 * غراس يختار المقطع، والتسميع بالمحرّك القائم، والنتيجة تغذّي
 * المراجعة بوصلة المرحلة ٦ نفسها. والاختبار دعوةٌ لا شرط.
 */
export const metadata = { title: 'اختبار ثبات الحفظ | غراس' };

export default function StabilityPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          🧠 اختبر ثبات حفظك
        </h1>
        <Link href="/quran" className="tap text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]">
          → القرآن
        </Link>
      </div>
      <StabilityIntro />
    </main>
  );
}
