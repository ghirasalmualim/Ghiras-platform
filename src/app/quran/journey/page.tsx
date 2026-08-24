import Link from 'next/link';
import JourneyScreen from '@/features/quran/components/JourneyScreen';

/**
 * 📖 رحلتي مع القرآن — صفحةٌ شخصية هادئة.
 *
 * ⚠️ خاصةٌ بصاحبتها: لا رابط عام ولا مشاركة ولا ترتيب بين مستخدمين
 * — المسار وراء الجلسة، والـAPI يرفض الزائر.
 */
export const metadata = { title: 'رحلتي مع القرآن | غراس' };

export default function JourneyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          📖 رحلتي مع القرآن
        </h1>
        <Link href="/quran" className="tap text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]">
          → القرآن
        </Link>
      </div>
      <JourneyScreen />
    </main>
  );
}
