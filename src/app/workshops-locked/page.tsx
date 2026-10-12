import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «ورش غراس» القديمة — بقيت لروابط محفوظة. الورش صارت في الاستوديو وتُشترى ورشةً ورشة.
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
          ورش غراس — صارت في صفحتها الجديدة
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          عروض ورش عمل جاهزة تقدّمينها لزميلاتك داخل غراس.
          <br />
          كل ورشة ٥ د.ك وتنفتح لك شهرًا كاملًا.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://studio.ghiras-edu.com/workshops"
            className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
          >
            🎓 تصفّحي الورش
          </a>
          <Link
            href="/support"
            className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
          >
            💬 تواصل معنا
          </Link>
          <Link
            href="/workspace"
            className="inline-block rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold px-8 py-3 transition-all"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
