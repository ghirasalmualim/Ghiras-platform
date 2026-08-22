import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «من سيربح المليون — أداة مدفوعة برصيد».
 * تظهر لمن لا يملك رصيد ألعاب عند محاولة فتح المولّد.
 */
export const dynamic = 'force-dynamic';

export default function MillionaireLockedPage() {
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
          🏆
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          مولّد «من سيربح المليون»
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          صوّر درسك، والذكاء الاصطناعي يبني لك لعبة تفاعلية جاهزة للعرض في صفّك.
          <br />
          الأداة تعمل برصيد ألعاب — كل رصيد = لعبة كاملة.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-sage/25 bg-sage-light/40 p-4">
            <div className="text-lg font-extrabold text-sage-deep">لعبة واحدة</div>
            <div className="text-2xl font-black text-sage-dark mt-1">٢ د.ك</div>
          </div>
          <div className="rounded-2xl border-2 border-gold/60 bg-gold-light/40 p-4 relative">
            <span className="absolute -top-3 right-1/2 translate-x-1/2 bg-gold text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full whitespace-nowrap">
              الأوفر
            </span>
            <div className="text-lg font-extrabold text-gold-dark">٥ ألعاب</div>
            <div className="text-2xl font-black text-gold-dark mt-1">٨ د.ك</div>
          </div>
        </div>

        <p className="mt-6 text-sm text-ink/50 leading-relaxed">
          لتفعيل الرصيد، يرجى التواصل مع إدارة غراس المعلم.
          <br />
          والدفع الإلكتروني المباشر قريباً 🌱
        </p>

        <Link
          href="/"
          className="mt-7 inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
