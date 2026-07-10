import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import {
  getStageBySlug,
  getGradeBySlug,
  getSubjects,
} from '@/lib/supabase/data';

export const revalidate = 300;

export default async function GradePage({
  params,
}: {
  params: { stageSlug: string; gradeSlug: string };
}) {
  const stage = await getStageBySlug(params.stageSlug);
  if (!stage) notFound();

  const grade = await getGradeBySlug(stage.id, params.gradeSlug);
  if (!grade) notFound();

  const subjects = await getSubjects(grade.id);

  return (
    <main className="min-h-dvh flex flex-col">
      <Header
        crumbs={[
          { label: stage.name, href: `/stage/${stage.slug}` },
          { label: grade.name },
        ]}
      />

      <section className="flex-1 w-full max-w-5xl mx-auto px-5 py-8">
        <h1 className="text-3xl font-black text-sage-deep animate-float-in">
          {grade.name}
        </h1>
        <p
          className="mt-2 text-ink/60 animate-float-in"
          style={{ animationDelay: '0.08s' }}
        >
          اختر المادة — سيُطلب تسجيل الدخول قبل فتح الألعاب
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject, i) => (
            <Link
              key={subject.id}
              href={`/stage/${stage.slug}/${grade.slug}/${subject.slug}`}
              className="card-3d group relative overflow-hidden p-6 flex items-center gap-4 animate-float-in"
              style={{ animationDelay: `${0.12 + i * 0.06}s` }}
            >
              {/* شريط لون المادة */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-1.5 rounded-full"
                style={{ backgroundColor: subject.color ?? '#7A9E7E' }}
              />

              <span
                aria-hidden="true"
                className="flex items-center justify-center w-14 h-14 rounded-2xl text-3xl shadow-inset3d transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: `${subject.color ?? '#7A9E7E'}1f`,
                }}
              >
                {subject.icon ?? '📚'}
              </span>

              <span className="flex-1">
                <span className="block font-extrabold text-lg text-ink">
                  {subject.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/50">
                  <LockIcon />
                  محتوى للمشتركين
                </span>
              </span>

              <span
                aria-hidden="true"
                className="text-ink/30 transition-transform group-hover:-translate-x-1 group-hover:text-ink/60"
              >
                ←
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
