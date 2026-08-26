import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة الشراء لـ«الساعة التفاعلية» — منتج مستقل بسعره الخاص.
 * تظهر لغير المشتركات — اشتراك ٦ أشهر بثلاثة دنانير (سعر معتمد من
 * صاحبة المنصة ٢٠٢٦-٠٨-٢٦)، والتفعيل عبر الإدارة.
 */
export const dynamic = 'force-dynamic';

const FEATURES: string[] = [
  '🕐 ساعة تفاعلية حقيقية: اسحب العقارب بإصبعك وعقرب الساعات يتحرك مع الدقائق',
  '🗣️ قراءة الوقت مكتوبًا بالعربية الفصيحة: «الثالثة والنصف إلا خمس دقائق»',
  '🔎 «كم الساعة؟» · 🎯 «اضبط الوقت» · ⏱️ سباق ٦٠ ثانية',
  '📶 خمسة مستويات متدرجة: من الساعات الكاملة حتى دقيقة بدقيقة',
  '🗺️ صفحة تقدّم بالأوسمة والدقة وأطول سلسلة — ونظام ٢٤ ساعة وعقرب الثواني',
];

export default function ClockLockedPage() {
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
          🕐
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">الساعة التفاعلية</h1>
        <p className="mt-2 text-ink/60 leading-relaxed">
          كورس تفاعلي كامل لتعلّم قراءة الساعة وضبطها — منتج مستقل بسعره الخاص،
          وليس ضمن الاشتراك المشترك.
        </p>

        {/* ما الذي يفتحه التفعيل */}
        <ul className="mt-6 text-right space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-ink/75 text-sm font-semibold leading-relaxed">
              <span className="mt-0.5">✅</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* السعر */}
        <div className="mt-5 inline-flex items-baseline gap-2 rounded-2xl bg-sage/10 border border-sage/30 px-6 py-3">
          <span className="text-4xl font-extrabold text-sage-dark">٣</span>
          <span className="text-lg font-extrabold text-sage-dark">دنانير</span>
          <span className="text-ink/50 text-sm font-bold">· اشتراك ٦ أشهر</span>
        </div>

        <div className="mt-7 w-full rounded-xl bg-sage/10 border border-sage/30 px-6 py-4 text-sage-dark font-extrabold">
          لتفعيل الساعة التفاعلية، تواصل مع إدارة غراس المعلم
        </div>
        <p className="mt-3 text-ink/45 text-xs font-semibold">
          بعد إتمام التفعيل تفتح اللعبة على حسابك مباشرةً بنسختها الكاملة.
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
