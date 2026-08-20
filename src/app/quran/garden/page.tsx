import Link from 'next/link';
import GardenScreen from '@/features/quran/garden/components/GardenScreen';

/**
 * 🌿 حديقتي — رحلتي مع القرآن.
 *
 * ⚠️ حديقةٌ واحدة للمنهج والقرآن العام معًا. من يحفظ درس منهجه ومن
 * يختار سورةً بنفسه يسقيان النبتة نفسها — لأن الرحلة واحدة وإن تعدّدت
 * أبوابها. وحديقتان تعني رحلتين، وهو ما ليس صحيحًا.
 *
 * ⚠️ والصفحة ديناميكية: الحديقة شخصية بالكامل فلا تُخزَّن نسخةٌ منها
 * تُعرض لغير صاحبها.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'حديقتي · غراس',
  description: 'رحلتك مع القرآن — كل حفظٍ ومراجعة خطوة تنمو معها حديقتك.',
};

export default function GardenPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8" dir="rtl">
      <nav className="mb-6">
        <Link href="/quran" className="tap text-sm font-bold text-[var(--q-mute)]">
          <span aria-hidden>→</span> القرآن الكريم
        </Link>
      </nav>

      <header className="mb-7 text-center">
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          🌿 حديقتي
        </h1>
        <p className="mt-1 text-[0.88rem] text-[var(--q-mute)]">رحلتي مع القرآن</p>
      </header>

      <GardenScreen />
    </main>
  );
}
