import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة الاشتراك في «بنك غراس» — منتج مستقل: ٦ أشهر بثمانية دنانير.
 * تظهر لغير المشتركات، والتفعيل عبر إدارة غراس.
 */
export const dynamic = 'force-dynamic';

const FEATURES: string[] = [
  '📄 آلاف أوراق العمل والوسائل الجاهزة لكل مواد الابتدائي',
  '🎨 محرر كامل: عدّلي النصوص والألوان والأسئلة واطبعي خلال ثوانٍ',
  '🌱 شخصيات غراس الخمس بوضعياتها تنضم لأي وسيلة',
  '🖨️ طباعة A4 بنسخة أو نسختين أو أربع في الصفحة الواحدة',
  '💾 نسختك المعدلة تُحفظ لك وترجعين لها متى شئت',
];

export default function GharasBankLockedPage() {
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
          🌱
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">بنك غراس</h1>
        <p className="mt-2 text-ink/60 leading-relaxed">
          أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص — منتج مستقل بسعره
          الخاص، وليس ضمن الاشتراك المشترك.
        </p>

        {/* السعر */}
        <div className="mt-5 inline-flex items-baseline gap-2 rounded-2xl bg-sage/10 border border-sage/30 px-6 py-3">
          <span className="text-4xl font-extrabold text-sage-dark">٨</span>
          <span className="text-lg font-extrabold text-sage-dark">دنانير</span>
          <span className="text-ink/50 text-sm font-bold">· اشتراك ٦ أشهر</span>
        </div>

        <ul className="mt-6 text-right space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-ink/75 text-sm font-semibold leading-relaxed">
              <span className="mt-0.5">✅</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 w-full rounded-xl bg-sage/10 border border-sage/30 px-6 py-4 text-sage-dark font-extrabold">
          للاشتراك في بنك غراس، تواصل مع إدارة غراس المعلم
        </div>
        <Link
          href="/support"
          className="mt-4 inline-block w-full rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
        >
          💬 تواصل معنا
        </Link>
        <p className="mt-3 text-ink/45 text-xs font-semibold">
          بعد إتمام الدفع يُفعَّل البنك على حسابك مباشرةً لمدة ستة أشهر.
        </p>

        <Link
          href="/"
          className="mt-5 inline-block text-ink/55 hover:text-ink font-bold text-sm transition-colors"
        >
          ← رجوع لمنصة غراس
        </Link>
      </div>
    </main>
  );
}
