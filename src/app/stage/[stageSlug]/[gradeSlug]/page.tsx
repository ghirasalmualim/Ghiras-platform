import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import {
  getStageBySlug,
  getGradeBySlug,
  getSubjects,
} from '@/lib/supabase/data';
import { subjectDisplayName } from '@/lib/subject-display';

export const revalidate = 300;

// ── لعبة الطالب: العوالم المتوفّرة حسب الصف ──
// المفتاح: gradeSlug — القيمة: أداةُ التصريح (النسخة الكاملة) + رابط النسخة المجانية.
// لإضافة صفٍّ جديد لاحقًا (كالرابع): أضِف سطرًا واحدًا هنا.
const STUDENT_GAMES: Record<string, { tool: string; free: string }> = {
  'grade-5': {
    tool: 'student-g5',
    free: 'https://games.ghiras-edu.com/free-student-g5/full-review',
  },
  'grade-4': {
    tool: 'student-g4',
    free: 'https://games.ghiras-edu.com/free-student-g4/full-review',
  },
  'grade-3': {
    tool: 'student-g3',
    free: 'https://games.ghiras-edu.com/free-student-g3/full-review',
  },
  'grade-2': {
    tool: 'student-g2',
    free: 'https://games.ghiras-edu.com/free-student-g2/full-review',
  },
  'grade-1': {
    tool: 'student-g1',
    free: 'https://games.ghiras-edu.com/free-student-g1/full-review',
  },
};

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
  const studentGame = STUDENT_GAMES[grade.slug];

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
                  {subjectDisplayName(subject, grade.slug)}
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

        {studentGame && (
          <div
            className="mt-8 animate-float-in"
            style={{ animationDelay: `${0.12 + subjects.length * 0.06}s` }}
          >
            <div className="card-3d relative overflow-hidden p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center gap-5 bg-gradient-to-l from-sage/10 to-transparent">
              <span
                aria-hidden="true"
                className="flex items-center justify-center w-16 h-16 rounded-2xl text-4xl shadow-inset3d shrink-0"
                style={{ backgroundColor: '#7A9E7E1f' }}
              >
                🎒
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-xl text-ink">لعبة الطالب</span>
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-gold-light text-gold-dark">
                    مغامرة كل المواد
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/60 leading-relaxed">
                  مغامرةٌ واحدة تجمع كل مواد الصف — كل مادةٍ عالَم، وكل درسٍ بيت.
                  مشمولةٌ ضمن اشتراك المواد.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <a
                    href={`/api/tool-access?tool=${studentGame.tool}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-sage-deep text-white font-extrabold text-sm px-6 py-2.5 shadow-soft hover:brightness-110 transition active:scale-[0.98]"
                  >
                    ابدأ اللعبة ←
                  </a>
                  <a
                    href={studentGame.free}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-sage/10 border border-sage/30 text-sage-dark font-extrabold text-sm px-5 py-2.5 hover:bg-sage/20 transition"
                  >
                    🎁 جرّب الدرس الأول مجانًا
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
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
