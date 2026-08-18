import Link from 'next/link';
import { getManifest, getSurahs } from '@/features/quran/data/corpus';
import ResumeCard from '@/features/quran/components/ResumeCard';

/**
 * بوابة قسم القرآن — أول شاشة.
 *
 * عنصران فقط. أي زيادة هنا تُضعف الاختيار بدل أن تُثريه: الطفل الذي
 * يفتح القسم يحتاج أن يعرف من أول نظرة إلى أين يذهب.
 *
 * القراءة والاستماع مفتوحان للزائر بلا حساب — لا نضع بابًا قبل المصحف.
 */

export const revalidate = 3600;

export default function QuranGate() {
  const manifest = getManifest();
  const surahNames = getSurahs().map((s) => s.name_ar);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:pt-12">
      <nav className="mb-8">
        <Link
          href="/"
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> غراس
        </Link>
      </nav>

      <header className="mb-10 text-center">
        <p className="mb-3 text-4xl" aria-hidden>
          🌿
        </p>
        <h1 className="font-[family-name:var(--font-cairo)] text-3xl font-extrabold text-[var(--q-ink)] sm:text-4xl">
          القرآن الكريم
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-relaxed text-[var(--q-mute)]">
          اقرأ واستمع واحفظ، على مهلك
        </p>
      </header>

      <ResumeCard surahNames={surahNames} />

      <div className="grid gap-4 sm:grid-cols-2">
        <GateCard
          href="/quran/curriculum"
          emoji="📚"
          title="منهجي الدراسي"
          desc="احفظ وراجع القرآن المقرر في منهجك الدراسي"
        />
        <GateCard
          href="/quran/browse"
          emoji="🌿"
          title="القرآن الكريم"
          desc="اقرأ واحفظ وراجع من سور القرآن الكريم"
        />
      </div>

      {/* الإسناد — واجب ترخيصي، وموضعه هنا هادئ وقابل للوصول */}
      <footer className="mt-12 text-center">
        <Link
          href="/quran/source"
          className="tap inline-flex items-center text-[0.78rem] leading-loose text-[var(--q-mute)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--q-accent)]"
        >
          النص العثماني من {manifest.source_name} · {manifest.licence}
        </Link>
      </footer>
    </main>
  );
}

function GateCard({
  href,
  emoji,
  title,
  desc,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-[1.5rem] border border-[var(--q-line)] bg-white p-7 text-center shadow-[0_2px_10px_rgba(47,59,51,0.05)] transition hover:-translate-y-0.5 hover:border-[#cfe0d5] hover:shadow-[0_10px_28px_rgba(47,59,51,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
    >
      <span className="mb-3 text-4xl" aria-hidden>
        {emoji}
      </span>
      <span className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
        {title}
      </span>
      <span className="mt-2 text-[0.88rem] leading-relaxed text-[var(--q-mute)]">
        {desc}
      </span>
    </Link>
  );
}
