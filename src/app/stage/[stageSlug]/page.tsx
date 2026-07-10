import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { getStageBySlug, getGrades } from '@/lib/supabase/data';

export const revalidate = 300;

/** الأرقام الهندية للصفوف */
const ARABIC_DIGITS = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export default async function StagePage({
  params,
}: {
  params: { stageSlug: string };
}) {
  const stage = await getStageBySlug(params.stageSlug);
  if (!stage) notFound();

  const grades = await getGrades(stage.id);
  const isPrimary = stage.slug === 'primary';

  return (
    <main className="min-h-dvh flex flex-col">
      <Header crumbs={[{ label: stage.name }]} />

      <section className="flex-1 w-full max-w-5xl mx-auto px-5 py-8">
        <h1 className="text-3xl font-black text-sage-deep animate-float-in">
          {stage.name}
        </h1>
        <p
          className="mt-2 text-ink/60 animate-float-in"
          style={{ animationDelay: '0.08s' }}
        >
          اختاري الصف للانتقال إلى مواده
        </p>

        <div className="mt-8 grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {grades.map((grade, i) => {
            const num =
              ARABIC_DIGITS[
                (parseInt(grade.slug.replace('grade-', ''), 10) || i + 1) - 1
              ] ?? '';
            return (
              <Link
                key={grade.id}
                href={`/stage/${stage.slug}/${grade.slug}`}
                className="card-3d group p-6 flex flex-col items-center text-center animate-float-in"
                style={{ animationDelay: `${0.12 + i * 0.06}s` }}
              >
                <span
                  aria-hidden="true"
                  className={`flex items-center justify-center w-16 h-16 rounded-2xl text-3xl font-black shadow-inset3d transition-transform group-hover:scale-110 ${
                    isPrimary
                      ? 'bg-sage-light text-sage-deep'
                      : 'bg-gold-light text-gold-dark'
                  }`}
                >
                  {num}
                </span>
                <span className="mt-4 font-extrabold text-lg text-ink">
                  {grade.name}
                </span>
                <span className="mt-1 text-xs text-ink/50">٦ مواد دراسية</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
