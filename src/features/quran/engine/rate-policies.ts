/**
 * سياسات حدود الاستدعاء — مكانٌ مركزي واحد.
 *
 * ═══ لماذا ═══
 * كانت الحماية موضعًا واحدًا (رفع الصوت) والبقية مفتوحة للطرق
 * الآلي. هنا أربع سياسات مسمّاة تخدم كل المسارات الحساسة، وعدّادٌ
 * معمَّم واحد بدل عدّادٍ لكل مسار.
 *
 * ═══ الفلسفة ═══
 * - المفتاح `user.id` وحده — **لا IP إطلاقًا**: المسارات المحدودة
 *   كلها خلف الجلسة، وIP واحد في مدرسة يجمع عشرين طالبة.
 * - عدّاد الذاكرة يصدّ الإساءة لا المال؛ **حدُّ مال Azure اليومي
 *   في Postgres** (ثوانٍ صوت، Reserve ذرّية — `quran_reserve_audio`)
 *   لأنه وحده الذي لا يجوز أن يضيع بإعادة تشغيل.
 * - Fail policy معلنة لكل سياسة: المال CLOSED (تعذُّر العدّ = لا
 *   إرسال لـAzure)، والباقي OPEN (عطلٌ داخلي لا يمنع طفلة من
 *   القراءة).
 * - الحدّ لا يحلّ محلّ idempotency: `client_key` يبقى حارسَ
 *   الازدواج المستقل، وJUDGE دفاعٌ إضافي فقط.
 */

/* ═════════════════════════════════════════════════════════════
 * ⚠️ USER_VALIDATION_REQUIRED — كل حدود الاستدعاء هنا
 * ═════════════════════════════════════════════════════════════
 * أرقام Pilot تجريبية لا Pricing نهائية — تُراجع بعد تجربة
 * مستخدمين حقيقية (PLAN_TUNING_VALIDATION). المرجع المالي:
 * ~١ دولار/ساعة صوت في Azure S0، فسقف المستخدم اليومي
 * (١٨٠٠ ثانية = ٣٠ دقيقة ≈ ٥ جلسات كاملة) ≈ نصف دولار نظريًّا.
 */

export const AUDIO_REQUESTS_PER_MINUTE = 10;
/** الحد المالي الأساسي — بالثواني لا بعدد المقاطع. */
export const DAILY_AUDIO_SECONDS = 1800;
/** حاجز إضافي يمنع رشّ مقاطع قصيرة جدًا. */
export const DAILY_AUDIO_REQUESTS = 120;

export type PolicyName = 'AUDIO' | 'JUDGE' | 'WRITE' | 'READ';

export const RATE_POLICIES: Record<
  PolicyName,
  { perMinute: number; perDay: number; fail: 'open' | 'closed' }
> = {
  /** الدقيقة هنا؛ اليومي المالي في Postgres (الثوابت أعلاه). */
  AUDIO: { perMinute: AUDIO_REQUESTS_PER_MINUTE, perDay: DAILY_AUDIO_REQUESTS, fail: 'closed' },
  JUDGE: { perMinute: 10, perDay: 200, fail: 'open' },
  WRITE: { perMinute: 10, perDay: 150, fail: 'open' },
  /**
   * سخيّة عمدًا: أعنفُ تنقّلٍ طبيعي بين رحلة/خطة/مراجعة مع
   * تحديثٍ متكرر ≈ ٢٠–٣٠ طلبًا/دقيقة — رُبع الحد.
   */
  READ: { perMinute: 120, perDay: 3000, fail: 'open' },
};

/* ═══════════ نهاية كتلة USER_VALIDATION_REQUIRED ═══════════ */

/**
 * رسائل 429 — عربية تبني، ولا rate ولا quota ولا Azure ولا cost.
 * رسالتان مفصولتان: الانتظار القصير شيء، والحد اليومي للصوت شيء.
 */
export const RATE_MESSAGES = {
  shortWait: 'ما شاء الله على النشاط 🌿 نرجع بعد لحظات',
  dailyAudio: 'استخدمنا وقتًا كثيرًا في التسميع اليوم 🌿 نكمل غدًا',
  /** تعذُّر عدّاد المال (FAIL CLOSED) — تعذُّرٌ عام لا اتهام. */
  unavailable: 'التسميع الذكي غير متاح الآن — نجرّب بعد قليل 🌿',
} as const;

/* ═══════════════ العدّاد المعمَّم — في الذاكرة ═══════════════ */

/**
 * تعميمُ عدّاد `speech/limits.ts` الأول: نافذة دقيقة + نافذة يوم
 * لكل (سياسة × مستخدم). حدوده معروفة وموثقة منذ يومه الأول —
 * لكل نسخة خادمٍ عدُّها ويضيع بإعادة التشغيل — وهي مقبولة لكل
 * شيء **عدا المال**، والمال في Postgres.
 */
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const buckets = new Map<string, number[]>();

export type PolicyVerdict =
  | { ok: true }
  | { ok: false; scope: 'minute' | 'day'; retryAfterSec: number };

export function checkPolicy(policy: PolicyName, userId: string, now = Date.now()): PolicyVerdict {
  const p = RATE_POLICIES[policy];
  const key = `${policy}:${userId}`;
  let times = buckets.get(key) ?? [];
  times = times.filter((t) => now - t < DAY_MS);

  const inMinute = times.filter((t) => now - t < MINUTE_MS);
  if (inMinute.length >= p.perMinute) {
    buckets.set(key, times);
    const oldest = Math.min.apply(null, inMinute);
    return { ok: false, scope: 'minute', retryAfterSec: Math.ceil((MINUTE_MS - (now - oldest)) / 1000) };
  }
  if (times.length >= p.perDay) {
    buckets.set(key, times);
    return { ok: false, scope: 'day', retryAfterSec: 3600 };
  }

  times.push(now);
  buckets.set(key, times);
  return { ok: true };
}

/**
 * غلافُ fail policy: OPEN يبتلع عطل العدّاد نفسه (لا الرفض)،
 * وCLOSED يحوّله رفضًا. الرفضُ الصريح يمرّ في الحالين.
 */
export function checkPolicySafe(policy: PolicyName, userId: string, now = Date.now()): PolicyVerdict {
  try {
    return checkPolicy(policy, userId, now);
  } catch {
    return RATE_POLICIES[policy].fail === 'open'
      ? { ok: true }
      : { ok: false, scope: 'minute', retryAfterSec: 60 };
  }
}
