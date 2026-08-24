import Link from 'next/link';
import { notFound } from 'next/navigation';
import SurahJourney from '@/features/quran/components/SurahJourney';

export const metadata = { title: 'رحلتي مع السورة | غراس' };

export default function SurahJourneyPage({ params }: { params: { surah: string } }) {
  const surah = Number(params.surah);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          من رحلتي
        </h1>
        <Link href="/quran/journey" className="tap text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]">
          → رحلتي
        </Link>
      </div>
      <SurahJourney surah={surah} />
    </main>
  );
}
