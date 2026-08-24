import Link from 'next/link';
import { Suspense } from 'react';
import { getSurahs } from '@/features/quran/data/corpus';
import PlanScreen from '@/features/quran/components/PlanScreen';

/**
 * 📅 خطة حفظي.
 *
 * صفحةٌ واحدة: إن كان للطالبة هدفٌ نشط عرضت يومَها والقادمَ
 * وتقدّمَها وهدفَها، وإلا عرضت «وش حاب تحفظ؟». لا تقويم ضخمًا
 * ولا عشر خطط — هدفٌ نشط واحد، و«أكمل هدفك» قبل «ابدأ جديدًا».
 *
 * الخادم هنا يمرّر أسماء السور وعدد آياتها فقط (للمعالج)، وكل
 * الحساب في `/api/quran/plan` — نقطةٌ واحدة تقرأ منها البطاقة
 * والصفحة معًا.
 */
export const metadata = { title: 'خطة حفظي | غراس' };

export default function PlanPage() {
  const surahs = getSurahs().map((s) => ({
    number: s.number,
    name: s.name_ar,
    ayahs: s.ayah_count,
  }));

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          📅 خطة حفظي
        </h1>
        <Link
          href="/quran"
          className="tap text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          → القرآن
        </Link>
      </div>
      {/* useSearchParams يفرض Suspense في App Router */}
      <Suspense fallback={<p className="py-14 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>}>
        <PlanScreen surahs={surahs} />
      </Suspense>
    </main>
  );
}
