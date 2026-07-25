import Link from 'next/link';
import Logo from '@/components/Logo';
import { getStages } from '@/lib/supabase/data';

export const revalidate = 300; // تحديث كل 5 دقائق مع تخزين مؤقت للسرعة

/** أوصاف قصيرة تظهر تحت اسم كل مرحلة */
const STAGE_META: Record<string, { desc: string; grades: string }> = {
  primary: { desc: 'من الصف الأول إلى الخامس', grades: '٥ صفوف' },
  middle: { desc: 'من الصف السادس إلى التاسع', grades: '٤ صفوف' },
};

export default async function HomePage() {
  const stages = await getStages();

  return (
    <main className="min-h-dvh flex flex-col">
      {/* البطل: الشعار والرسالة */}
      <section className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-10 text-center">
        <div className="animate-float-in">
          <Logo size={110} />
        </div>
        <h1
          className="animate-float-in mt-6 text-4xl sm:text-5xl font-black text-sage-deep tracking-tight"
          style={{ animationDelay: '0.1s' }}
        >
          غراس المعلم
        </h1>
        <div
          className="gold-thread w-40 mx-auto mt-5 animate-float-in"
          style={{ animationDelay: '0.2s' }}
          aria-hidden="true"
        />
        <p
          className="animate-float-in mt-5 max-w-md text-lg text-ink/70 leading-relaxed"
          style={{ animationDelay: '0.25s' }}
        >
          مكتبة الألعاب التعليمية التفاعلية
          <br />
          للمعلمين والمعلمات — اختر المرحلة وابدأ
        </p>

        {/* بطاقتا المرحلتين */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 w-full max-w-2xl">
          {stages.map((stage, i) => {
            const meta = STAGE_META[stage.slug] ?? { desc: '', grades: '' };
            const isPrimary = stage.slug === 'primary';
            return (
              <Link
                key={stage.id}
                href={`/stage/${stage.slug}`}
                className="card-3d group relative overflow-hidden p-8 text-right animate-float-in"
                style={{ animationDelay: `${0.35 + i * 0.12}s` }}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-1.5 ${
                    isPrimary ? 'bg-sage' : 'bg-gold'
                  }`}
                />
                <div
                  aria-hidden="true"
                  className={`absolute -left-10 -bottom-10 w-40 h-40 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40 ${
                    isPrimary ? 'bg-sage' : 'bg-gold'
                  }`}
                />
                <span
                  className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
                    isPrimary
                      ? 'bg-sage-light text-sage-deep'
                      : 'bg-gold-light text-gold-dark'
                  }`}
                >
                  {meta.grades}
                </span>
                <h2 className="mt-4 text-2xl font-extrabold text-ink">
                  {stage.name}
                </h2>
                <p className="mt-1.5 text-ink/60">{meta.desc}</p>
                <span
                  className={`mt-6 inline-flex items-center gap-2 font-bold ${
                    isPrimary ? 'text-sage-dark' : 'text-gold-dark'
                  }`}
                >
                  دخول المرحلة
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:-translate-x-1"
                  >
                    ←
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* أداة سجل الدرجات الذكي */}
        <a
          href="https://ghiras-games.vercel.app/gradebook/full-review"
          target="_blank"
          rel="noopener noreferrer"
          className="card-3d group relative overflow-hidden p-8 text-right animate-float-in block mt-6 w-full max-w-2xl"
          style={{ animationDelay: '0.6s' }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1.5 bg-gold"
          />
          <div
            aria-hidden="true"
            className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40 bg-gold"
          />
          <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-gold-light text-gold-dark">
            أداة المعلم
          </span>
          <h2 className="mt-4 text-2xl font-extrabold text-ink">
            سجل الدرجات الذكي
          </h2>
          <p className="mt-1.5 text-ink/60">
            رصد الدرجات وخصمها بالأسباب، وطباعتها PDF بضغطة
          </p>
          <span className="mt-6 inline-flex items-center gap-2 font-bold text-gold-dark">
            افتح الأداة
            <span
              aria-hidden="true"
              className="transition-transform group-hover:-translate-x-1"
            >
              ←
            </span>
          </span>
        </a>
      </section>

      <footer className="py-6 text-center text-sm text-ink/45">
        غراس المعلم © ١٤٤٧هـ — جميع الحقوق محفوظة
      </footer>
    </main>
  );
}
