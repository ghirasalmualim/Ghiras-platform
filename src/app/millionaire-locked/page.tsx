import Link from 'next/link';
import Logo from '@/components/Logo';
import SubscribeButton from '@/components/SubscribeButton';

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

        {/* باقةٌ واحدةٌ لكلِّ ألعابِ غراس التفاعلية — رصيدٌ دائمٌ مشترَك */}
        <div className="mt-6 rounded-2xl border-2 border-gold/60 bg-gold-light/40 p-5 relative">
          <span className="absolute -top-3 right-1/2 translate-x-1/2 bg-gold text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full whitespace-nowrap">
            باقة غراس
          </span>
          <div className="text-lg font-extrabold text-gold-dark">٣ ألعاب</div>
          <div className="text-3xl font-black text-gold-dark mt-1">٢ د.ك</div>
          <div className="mt-2 text-[12px] font-bold leading-relaxed text-ink/55">
            رصيدٌ دائم لا ينتهي · تختارين أيَّ ٣ ألعاب من:
            <br />
            من سيربح المليون · اكس او · سين جيم · السلم والثعبان · صيد البالونات
          </div>
        </div>

        <SubscribeButton
          productId="games_3"
          label="فعّلي باقة الألعاب"
          hint="دفعٌ إلكترونيٌّ مباشر · يُضاف الرصيد فور تأكيد الدفع"
        />

        <Link
          href="/support"
          className="mt-4 block text-ink/55 hover:text-ink font-bold text-sm transition-colors"
        >
          💬 عندك سؤال؟ تواصل معنا
        </Link>
        <Link
          href="/"
          className="mt-3 block text-ink/55 hover:text-ink font-bold text-sm transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
