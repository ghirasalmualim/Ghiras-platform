import Link from 'next/link';
import { getStages, getGrades } from '@/lib/supabase/data';
import { getGradesWithLessons } from '@/features/quran/data/curriculum';
import { getSurahs } from '@/features/quran/data/corpus';
import CurriculumBrowser from '@/features/quran/components/CurriculumBrowser';

/**
 * منهجي الدراسي.
 *
 * المراحل والصفوف تأتي من نفس مصدر غراس (`lib/supabase/data`) فلا
 * تنشأ قائمة صفوف ثانية تفترق عن الأولى يومًا.
 *
 * ما لم يُدخل له درس لا يُعرض: الصف الفارغ يوهم الطالبة أن هناك مقررًا
 * ثم يخذلها. ونقول لها صراحةً إن المقرر لم يُدخل بعد.
 */

export const dynamic = 'force-dynamic';

export default async function CurriculumPage() {
  const stages = await getStages();
  const gradesByStage = await Promise.all(
    stages.map(async (s) => ({ stage: s, grades: await getGrades(s.id) }))
  );
  const withLessons = await getGradesWithLessons();
  const surahNames = getSurahs().map((s) => s.name_ar);

  // لا نعرض مرحلة ليس فيها درس واحد. عرضها متاحةً ثم خذلان الطالبة
  // بشاشة فارغة أسوأ من ألا تراها. والمتوسط سيظهر يوم تُدخل بياناته.
  const visible = gradesByStage
    .map(({ stage, grades }) => ({
      stage,
      grades: grades.filter((g) => withLessons.includes(g.slug)),
    }))
    .filter((s) => s.grades.length > 0);

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
        منهجي الدراسي
      </h1>
      <p className="mb-6 text-[0.88rem] text-[var(--q-mute)]">
        اختر صفك لتظهر لك دروس المقرر
      </p>

      {visible.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-12 text-center">
          <p className="mb-2 text-3xl" aria-hidden>📚</p>
          <p className="mb-1.5 font-bold text-[var(--q-ink)]">ما أُدخل المنهج بعد</p>
          <p className="text-[0.85rem] leading-relaxed text-[var(--q-mute)]">
            وحتى ذلك الحين تقدرين تقرئين وتحفظين من{' '}
            <Link href="/quran/browse" className="font-bold text-[var(--q-accent)] underline underline-offset-4">
              القرآن الكريم
            </Link>{' '}
            مباشرة.
          </p>
        </div>
      ) : (
        <CurriculumBrowser stages={visible} surahNames={surahNames} />
      )}
    </main>
  );
}
