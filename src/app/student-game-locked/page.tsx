import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «لعبة الطالب» لغير المشتركين.
 * لعبة الطالب مزيّةٌ ضمن اشتراك المواد الكامل (sub_end) — لا تُباع منفصلة.
 * تظهر لمن ليس لديه اشتراكٌ سارٍ في المواد؛ التفعيل عبر الإدارة.
 */
export const dynamic = 'force-dynamic';

const FEATURES: string[] = [
  '🗺️ ٦ عوالم — عالَمٌ لكل مادة: العربية والإنجليزية والإسلامية والعلوم والاجتماعيات (والرياضيات قريبًا)',
  '🏠 كل درسٍ بيت على طريق مغامرة — تفتحه بالإجابة عن أسئلة منهجه',
  '🔒 فتحٌ متسلسل: يُضيء الدرس التالي بعد إتقان نصف أسئلة السابق',
  '🚌 تنقّل بين العوالم بالحافلة أو بالزر السريع — ولكل عالم لونه وطابعه',
  '🦊 رفيقٌ يكبر وتركبه · 🚗 سيارات ومتجر ومنزل · 🏅 أوسمة ونجوم',
  '📊 لوحة ولي الأمر: تابعْ تقدّم طفلك في كل مادة درسًا درسًا',
];

export default function StudentGameLockedPage() {
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
          🎒
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">لعبة الطالب</h1>
        <p className="mt-2 text-ink/60 leading-relaxed">
          مغامرةٌ واحدة تجمع كل مواد صفّك — كل مادةٍ عالَم، وكل درسٍ بيت.
          وهي <b className="text-sage-dark">مزيّةٌ ضمن اشتراك المواد الكامل</b>،
          تُفتح تلقائيًا لكل مشترِكٍ اشتراكُه ساري المفعول.
        </p>

        {/* ما الذي يفتحه الاشتراك */}
        <ul className="mt-6 text-right space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-ink/75 text-sm font-semibold leading-relaxed">
              <span className="mt-0.5">✅</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* ضمن الباقة */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-sage/10 border border-sage/30 px-6 py-3 text-sage-dark font-extrabold">
          🎁 مشمولةٌ مع اشتراك المواد — بلا رسومٍ إضافية
        </div>

        <div className="mt-6 w-full rounded-xl bg-sage/10 border border-sage/30 px-6 py-4 text-sage-dark font-extrabold">
          للاشتراك في المواد وفتح لعبة الطالب، تواصل مع إدارة غراس المعلم
        </div>
        <Link
          href="/support"
          className="mt-4 inline-block rounded-xl bg-sage-deep text-white font-extrabold px-8 py-3 shadow-soft hover:brightness-110 transition"
        >
          💬 تواصل معنا
        </Link>

        <p className="mt-6 text-ink/50 text-sm leading-relaxed">
          تحب تجرّبها أولًا؟ جرّب <b>الدرس الأول من كل عالم مجانًا</b> من صفحة الصف — بلا اشتراك.
        </p>
      </div>
    </main>
  );
}
