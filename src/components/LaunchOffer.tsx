import Link from 'next/link';
import { OFFICIAL, LAUNCH, CURRENCY, FULL_GRADE_SAVING, LAUNCH_OFFER_ACTIVE } from '@/lib/pricing';

/**
 * إعلان عرض الانطلاقة — بانر Premium بهوية غراس، يظهر أعلى الرئيسية.
 * يُخفى تلقائيًا عند إطفاء LAUNCH_OFFER_ACTIVE. بلا عدٍّ تنازليّ ولا
 * إلحاحٍ زائف — القوة من وضوح الخصم الحقيقي.
 */
export default function LaunchOffer() {
  if (!LAUNCH_OFFER_ACTIVE) return null;
  return (
    <section dir="rtl" className="w-full max-w-2xl mx-auto animate-float-in" style={{ animationDelay: '0.15s' }}>
      <div className="card-3d bg-white rounded-3xl p-6 md:p-8 border border-gold/30 overflow-hidden">
        <span className="inline-block text-[11px] font-black px-3 py-1 rounded-full bg-gold text-white shadow-sm mb-3">عرض الانطلاقة</span>
        <p className="text-2xl md:text-3xl font-black text-sage-deep">عرض انطلاقة غراس 🌱</p>
        <p className="text-ink/70 mt-1 text-sm md:text-base">ابدئي الفصل بطريقة مختلفة — لفترة محدودة بمناسبة انطلاقة غراس.</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* المادة للصف الواحد */}
          <div className="rounded-2xl border border-sage/20 bg-sage-mist/40 p-5 text-center">
            <p className="text-sm font-bold text-sage-dark mb-2">المادة للصف الواحد</p>
            <p className="flex items-baseline justify-center gap-2">
              <span className="text-gray-400 line-through text-lg tabular-nums">{OFFICIAL.subjectPerGrade} {CURRENCY}</span>
              <span className="text-3xl font-black text-sage-deep tabular-nums">{LAUNCH.subjectPerGrade}</span>
              <span className="text-sm font-bold text-sage-deep">{CURRENCY}</span>
            </p>
          </div>

          {/* الصف كاملًا — أبرز قيمة */}
          <div className="rounded-2xl border-2 border-gold/50 bg-gold-light/40 p-5 text-center relative">
            <span className="absolute -top-3 right-1/2 translate-x-1/2 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gold text-white whitespace-nowrap">أقوى قيمة · خصم ٥٠٪</span>
            <p className="text-sm font-bold text-sage-dark mb-2 mt-1">الصف كاملًا بجميع مواده</p>
            <p className="flex items-baseline justify-center gap-2">
              <span className="text-gray-400 line-through text-lg tabular-nums">{OFFICIAL.fullGrade} {CURRENCY}</span>
              <span className="text-3xl font-black text-sage-deep tabular-nums">{LAUNCH.fullGrade}</span>
              <span className="text-sm font-bold text-sage-deep">{CURRENCY} فقط</span>
            </p>
          </div>
        </div>

        <p className="text-center text-sm font-bold text-gold-dark mt-4">وفّري {FULL_GRADE_SAVING} {CURRENCY} عند اختيار الصف كاملًا.</p>

        <div className="mt-6 flex justify-center">
          <Link href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-sage text-white font-black px-8 py-3 shadow-md hover:bg-sage-dark transition">
            ابدئي مع غراس ←
          </Link>
        </div>
      </div>
    </section>
  );
}
