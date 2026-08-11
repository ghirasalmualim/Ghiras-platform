import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة الشراء لـ«جدول الضرب التفاعلي» — منتج مستقل بسعره الخاص (٣ د.ك).
 * تظهر لغير المشتركات، وتوضّح ما يفتحه الشراء + زر التواصل/الدفع.
 * ملاحظة: بدّلي رقم الواتساب أدناه برقم إدارة غراس (أو رابط الدفع لاحقًا).
 */
export const dynamic = 'force-dynamic';

// ⬇️ بدّلي هذا الرقم برقم واتساب إدارة غراس (بصيغة دولية بدون + أو أصفار بادئة)
const WHATSAPP = '96500000000';
const WA_MSG = encodeURIComponent('السلام عليكم، أرغب بشراء لعبة «جدول الضرب التفاعلي» (٣ د.ك).');

const FEATURES: string[] = [
  '🔍 استكشاف بصري: كل عملية ضرب كمستطيل ونقاط — يفهمها الطفل لا يحفظها',
  '🎯 تدريب ذكي بنظام التكرار المتباعد (لايتنر) يركّز على ما لم يُتقَن',
  '🔎 «أين الناتج» · ⏱️ سباق الوقت · 👥 مواجهة لاعبَين',
  '🗺️ خريطة إتقان ملوّنة + أوسمة تتبع تقدّم الطفل خطوة بخطوة',
  '✨ أسرار وأنماط: القطر السحري، حيلة أصابع ٩، وسرّ التبديل',
];

export default function MultiplicationLockedPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 text-center">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      <div
        className="card-3d w-full max-w-lg p-9 mt-6 animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <span aria-hidden="true" className="text-5xl">
          ✖️
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">جدول الضرب التفاعلي</h1>
        <p className="mt-2 text-ink/60 leading-relaxed">
          كورس تفاعلي كامل لإتقان جدول الضرب — منتج مستقل بسعره الخاص، وليس ضمن الاشتراك المشترك.
        </p>

        {/* السعر */}
        <div className="mt-5 inline-flex items-baseline gap-2 rounded-2xl bg-sage/10 border border-sage/30 px-6 py-3">
          <span className="text-4xl font-extrabold text-sage-dark">٣</span>
          <span className="text-lg font-extrabold text-sage-dark">دنانير</span>
          <span className="text-ink/50 text-sm font-bold">· وصول كامل</span>
        </div>

        {/* ما الذي يفتحه الشراء */}
        <ul className="mt-6 text-right space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-ink/75 text-sm font-semibold leading-relaxed">
              <span className="mt-0.5">✅</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* زر الشراء/التواصل */}
        <a
          href={`https://wa.me/${WHATSAPP}?text=${WA_MSG}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-block w-full rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-4 shadow-soft transition-all"
        >
          اشتري الآن · تواصل مع إدارة غراس
        </a>
        <p className="mt-3 text-ink/45 text-xs font-semibold">
          بعد إتمام الدفع تُفعَّل اللعبة على حسابك مباشرةً وتفتح النسخة الكاملة.
        </p>

        <Link
          href="/games"
          className="mt-5 inline-block text-ink/55 hover:text-ink font-bold text-sm transition-colors"
        >
          ← رجوع لألعاب غراس التفاعلية
        </Link>
      </div>
    </main>
  );
}
