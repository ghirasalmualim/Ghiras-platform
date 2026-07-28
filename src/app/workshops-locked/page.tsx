import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «الورش التعليمية — خاص بالمشتركين».
 * تظهر عند محاولة فتح الورش بدون اشتراك سارٍ.
 */
export const dynamic = 'force-dynamic';

export default function WorkshopsLockedPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 text-center">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      <div
        className="card-3d w-full max-w-md p-10 mt-6 animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <span aria-hidden="true" className="text-5xl">
          🎓
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          الورش التعليمية — خاص بالمشتركين
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          هذه الورش متاحة لمشتركي غراس المعلم.
          <br />
          فعّلي اشتراكك للاطّلاع على العروض التفاعلية الجاهزة للعرض داخل صفّك.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
