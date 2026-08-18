import Link from 'next/link';
import { getSurahs } from '@/features/quran/data/corpus';
import ReviewToday from '@/features/quran/components/ReviewToday';

/**
 * 🔄 مراجعة اليوم.
 *
 * تعرض **المستحق اليوم وحده** لا كل ما حفظته الطالبة. القائمة الضخمة
 * تُشعر بالعجز قبل أن تبدأ، والمطلوب أن ترى مهمة تنتهي.
 */

export const revalidate = 3600;

export default function ReviewPage() {
  const names = getSurahs().map((s) => s.name_ar);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <nav className="mb-6">
        <Link
          href="/quran"
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> القرآن الكريم
        </Link>
      </nav>

      <h1 className="mb-1 font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        🔄 مراجعة اليوم
      </h1>
      <p className="mb-6 text-[0.88rem] text-[var(--q-mute)]">
        ما يحتاج تثبيتًا اليوم فقط
      </p>

      <ReviewToday surahNames={names} />
    </main>
  );
}
