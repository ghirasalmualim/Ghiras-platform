import Link from 'next/link';
import Logo from '@/components/Logo';
import { getStages } from '@/lib/supabase/data';

export const revalidate = 300; // تحديث كل 5 دقائق مع تخزين مؤقت للسرعة

// إظهار بطاقة «الورش التعليمية» في الرئيسية. مخفية الآن — بدّليها إلى true للإظهار.
const SHOW_WORKSHOPS = false;

// إظهار بطاقة «من سيربح المليون». مخفية الآن — بدّليها إلى true للإظهار.
const SHOW_MILLIONAIRE = false;

/** أوصاف قصيرة تظهر تحت اسم كل مرحلة */
const STAGE_META: Record<string, { desc: string; grades: string }> = {
  primary: { desc: 'من الصف الأول إلى الخامس', grades: '٥ صفوف' },
  middle: { desc: 'من الصف السادس إلى التاسع', grades: '٤ صفوف' },
};

export default async function HomePage() {
  const stages = await getStages();

  return (
    <main className="min-h-dvh flex flex-col">
      {/* شريط علوي: دخول / إنشاء حساب */}
      <header className="w-full flex items-center justify-start gap-2.5 px-5 pt-5">
        <Link
          href="/register"
          className="rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold text-sm px-5 py-2.5 shadow-soft transition-all"
        >
          إنشاء حساب
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-5 py-2.5 transition-all"
        >
          دخول
        </Link>
      </header>

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

        {/* أداة سجل الدرجات الذكي — تُفتح عبر مُصدِّر التصاريح (للمشترِكات فقط) */}
        <a
          href="/api/tool-access?tool=gradebook"
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

        {/* الورش التعليمية — تُفتح عبر مُصدِّر التصاريح (للمشتركين فقط). مخفية حالياً. */}
        {SHOW_WORKSHOPS && (
          <a
            href="/api/tool-access?tool=workshops"
            target="_blank"
            rel="noopener noreferrer"
            className="card-3d group relative overflow-hidden p-8 text-right animate-float-in block mt-6 w-full max-w-2xl"
            style={{ animationDelay: '0.7s' }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1.5 bg-sage"
            />
            <div
              aria-hidden="true"
              className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40 bg-sage"
            />
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-sage-light text-sage-deep">
              ورش تفاعلية
            </span>
            <h2 className="mt-4 text-2xl font-extrabold text-ink">
              الورش التعليمية
            </h2>
            <p className="mt-1.5 text-ink/60">
              عروض احترافية جاهزة للعرض داخل صفّك، شريحة بشريحة
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-bold text-sage-dark">
              دخول الورش
              <span
                aria-hidden="true"
                className="transition-transform group-hover:-translate-x-1"
              >
                ←
              </span>
            </span>
          </a>
        )}

        {/* مولّد «من سيربح المليون» — أداة مدفوعة برصيد. مخفية حالياً. */}
        {SHOW_MILLIONAIRE && (
          <Link
            href="/millionaire"
            className="card-3d group relative overflow-hidden p-8 text-right animate-float-in block mt-6 w-full max-w-2xl"
            style={{ animationDelay: '0.8s' }}
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
              لعبة تفاعلية
            </span>
            <h2 className="mt-4 text-2xl font-extrabold text-ink">
              من سيربح المليون
            </h2>
            <p className="mt-1.5 text-ink/60">
              صوّري درسك، والذكاء يبني لك لعبة مسابقات جاهزة للصف
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-bold text-gold-dark">
              افتح المولّد
              <span
                aria-hidden="true"
                className="transition-transform group-hover:-translate-x-1"
              >
                ←
              </span>
            </span>
          </Link>
        )}
      </section>

      <footer className="py-6 text-center text-sm text-ink/45">
        غراس المعلم © ١٤٤٧هـ — جميع الحقوق محفوظة
      </footer>
    </main>
  );
}
