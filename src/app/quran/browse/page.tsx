import Link from 'next/link';
import { getSurahs } from '@/features/quran/data/corpus';
import SurahPicker from '@/features/quran/components/SurahPicker';

/**
 * اختيار السورة ثم مدى الآيات.
 *
 * خطوتان في شاشة واحدة: تُختار السورة فتنفتح تحتها بداية الآية
 * ونهايتها. صفحتان منفصلتان تعني رجوعًا وتقدّمًا لا داعي له، والطفل
 * يفقد سياقه في كل انتقال.
 */

export const revalidate = 3600;

export default function BrowsePage() {
  const surahs = getSurahs();

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

      <h1 className="mb-1 font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        اختر السورة
      </h1>
      <p className="mb-6 text-[0.88rem] text-[var(--q-mute)]">
        ثم حدّد من أي آية إلى أي آية
      </p>

      <SurahPicker surahs={surahs} />
    </main>
  );
}
