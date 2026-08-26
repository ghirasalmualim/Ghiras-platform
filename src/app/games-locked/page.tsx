import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة قفل «ألعاب غراس التفاعلية» — تظهر لمن لا يحمل استحقاق القسم.
 * ⚠️ لا يُعرض سعر (OWNER INPUT) — التفعيل بالتواصل مع الإدارة.
 * هذا استحقاق القسم؛ رصيد توليد الألعاب منتج مستقل لا يتأثر به.
 */
export const dynamic = 'force-dynamic';

const FEATURES: string[] = [
  '🏆 من سيربح المليون · 🎲 السلم والثعبان · ⭕ إكس أو · 🧠 سين جيم · 🎈 صيد البالون',
  '📷 صوّر درسك والذكاء يبني الأسئلة — أو اكتب أسئلتك بنفسك',
  '📚 «ألعابي المحفوظة»: كل لعبة تنشئها تبقى لك تعيد فتحها متى شئت',
];

export default function GamesLockedPage() {
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
          🎮
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">ألعاب غراس التفاعلية</h1>
        <p className="mt-2 text-ink/60 leading-relaxed">
          مكتبة ألعاب الصف التفاعلية — قسم مستقل يُفعَّل على حسابك.
        </p>

        <ul className="mt-6 text-right space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-ink/75 text-sm font-semibold leading-relaxed">
              <span className="mt-0.5">✅</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-7 w-full rounded-xl bg-sage/10 border border-sage/30 px-6 py-4 text-sage-dark font-extrabold">
          لتفعيل ألعاب غراس التفاعلية، تواصل مع إدارة غراس المعلم
        </div>
        <p className="mt-3 text-ink/45 text-xs font-semibold">
          بعد التفعيل يفتح القسم على حسابك مباشرةً.
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
