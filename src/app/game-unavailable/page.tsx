import Link from 'next/link';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

/**
 * «تعذّر فتح اللعبة» — الوجهة الوحيدة لكل رفضٍ من مُصدِّر التصاريح.
 *
 * ⚠️ كانت ستّ حالاتٍ مختلفة تنتهي بتبويبٍ جديد فيه الصفحة الرئيسية بلا
 * كلمة: عطبُ قاعدةٍ، ورفضُ صلاحيةٍ حقيقي، واشتراكٌ منقضٍ، وحسابٌ موقوف،
 * ولعبةٌ محذوفة، ومعرّفٌ فاسد. فتضغط المشتركة «شغّل» فتُفاجَأ بصفحةٍ لا
 * علاقة لها بما طلبت، ولا تدري أالخلل عندها أم عندنا.
 *
 * ⚠️ والسبب يُقرأ من قائمةٍ ثابتة، ولا تُعرض قيمة `r` الخام أبداً: هي
 * مدخلٌ من الرابط يملك أيُّ أحدٍ تغييره، وعرضُها يجعل الصفحة تنطق بما
 * يكتبه الزائر.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Reason = {
  emoji: string;
  title: string;
  body: string;
  /** الإعادة تنفع في العطب التقني وحده — وما عداه لن يتغيّر بالمحاولة */
  retry?: boolean;
};

const REASONS: Record<string, Reason> = {
  denied: {
    emoji: '🔒',
    title: 'هذه اللعبة خارج اشتراكك',
    body: 'اشتراكك الحالي لا يشمل مادة هذه اللعبة. للاشتراك أو الترقية، تواصلي مع إدارة غراس المعلم.',
  },
  expired: {
    emoji: '🗓️',
    title: 'انتهى اشتراكك',
    body: 'جدّدي اشتراكك للمتابعة — ومحتواك محفوظ كما هو.',
  },
  suspended: {
    emoji: '⛔',
    title: 'هذا الحساب موقوف',
    body: 'يرجى التواصل مع إدارة غراس المعلم.',
  },
  account: {
    emoji: '📄',
    title: 'حسابك يحتاج تهيئة',
    body: 'تواصلي معنا وسنُتمّها لك — ولا حاجة لإنشاء حسابٍ جديد.',
  },
  /**
   * ⚠️ **الوجهة الحقيقية لأكثر الرفض.**
   *
   * سياسة `games gated read` تُخفي صفَّ اللعبة عمّن لا يملك صلاحيتها،
   * فيصل إلينا «غير موجودة» لا «ممنوعة» — ولا سبيل للمسار أن يفرّق.
   * فالنصّ يجب أن يكون صادقاً في الحالتين معاً، ولا يُفشي فهرس المحتوى
   * لمن ليس مشتركاً.
   */
  missing: {
    emoji: '🔍',
    title: 'هذه اللعبة غير متاحة لك الآن',
    body: 'قد لا تكون مشمولة بصلاحيات حسابك، أو لم تعد متاحة. إذا كنتِ تتوقعين الوصول إليها، فتواصلي معنا.',
  },
  technical: {
    emoji: '🌧️',
    title: 'تعذّر فتح اللعبة الآن',
    body: 'خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.',
    retry: true,
  },
};

const FALLBACK = REASONS.technical;

export default function GameUnavailablePage({
  searchParams,
}: {
  searchParams: { r?: string; g?: string };
}) {
  /**
   * ⚠️ **قائمةٌ ثابتة فعلاً — لا بحثٌ على كائن.**
   *
   * `REASONS[r]` على كائنٍ عادي يصل إلى سلسلة النموذج الأولي: فـ
   * `?r=constructor` يُرجع دالّةً — وهي ليست `null` فلا يُنقذها `??` —
   * فتخرج الصفحة بلا عنوانٍ ولا نصّ. والمفتاح يملكه الزائر.
   */
  const key = searchParams.r ?? '';
  const reason = Object.prototype.hasOwnProperty.call(REASONS, key)
    ? REASONS[key]
    : FALLBACK;

  // ⚠️ الزرّ لا يظهر إلا إذا كانت الإعادة ممكنة فعلاً — بمعرّفٍ صالح
  const gameId = searchParams.g;
  const canRetry = Boolean(reason.retry && gameId && UUID_RE.test(gameId));

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      <div
        className="card-3d w-full max-w-md p-8 mt-6 text-center animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <div className="gold-thread w-24 mx-auto mb-6" aria-hidden="true" />

        <p className="text-5xl" aria-hidden>
          {reason.emoji}
        </p>

        <h1 className="mt-4 text-xl font-black text-sage-deep">{reason.title}</h1>

        <p className="mt-3 text-ink/70 leading-relaxed">{reason.body}</p>

        {canRetry && (
          <a
            href={`/api/game-access?g=${encodeURIComponent(gameId!)}`}
            className="mt-6 block w-full rounded-xl bg-sage px-5 py-3 font-extrabold text-white shadow-soft transition-colors hover:bg-sage-dark"
          >
            إعادة المحاولة
          </a>
        )}

        <Link
          href="/"
          className="mt-4 block text-sm font-bold text-sage-dark hover:underline"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
