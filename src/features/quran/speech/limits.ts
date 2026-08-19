/**
 * حماية المزوّد من الاستنزاف.
 *
 * ⚠️ صار عندنا مسارٌ يصرف مالًا حقيقيًا مع كل نداء. ومسارٌ مفتوح على
 * الإنترنت يصرف مالًا هو دعوةٌ مفتوحة: لا يحتاج مهاجمًا، يكفي سكربت
 * فضولي أو خطأ في حلقة.
 *
 * ═══ سبع طبقات ═══
 * ١) تسجيل دخول — لا تسميع لمجهول.
 * ٢) حدّ معدّل لكل حساب.
 * ٣) حدّ لمدة التسجيل.
 * ٤) حدّ لحجم الجسم.
 * ٥) رفض ما ليس WAV بترويسته لا بادّعائه.
 * ٦) تحقّق أن السورة والمدى موجودان في مصحفنا.
 * ٧) **النص المتوقَّع يُبنى على الخادم** ولا يُقبل من المتصفح إطلاقًا.
 *
 * ⚠️ والسابعة أهمّها: لو قبلنا نصًّا من المتصفح لصار المسار خدمةَ
 * تعرّفٍ عامة مجانية على حسابنا — يرسل أيٌّ كان أي نصّ وأي صوت.
 * فالمتصفح يرسل «سورة/من/إلى» وحدها، والباقي من مصحفنا.
 */

/** أقصى مدة للمقطع الواحد — حدّ المزوّد نفسه. */
export const MAX_CLIP_SEC = 30;
/** WAV أحادي ١٦ ك.هرتز ١٦ بت = ٣٢ ك.ب لكل ثانية. */
export const BYTES_PER_SEC = 16000 * 2;
export const MAX_CLIP_BYTES = BYTES_PER_SEC * MAX_CLIP_SEC + 1024;

/** أقصى عدد مقاطع في الجلسة الواحدة — درسٌ طويل جدًا لا يتجاوزها. */
export const MAX_CHUNKS_PER_SESSION = 12;

/** نافذة الحدّ ومقدارُه لكل حساب. */
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_CLIPS = 15;
/** وحدّ يومي يمنع الاستنزاف البطيء. */
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DAILY_MAX_CLIPS = 400;

type Bucket = { times: number[] };

/**
 * عدّاد في ذاكرة الخادم.
 *
 * ⚠️ يكفي لأول حماية ولا يكفي وحده على المدى: نُسخ الخادم متعددة،
 * وكل نسخة تعدّ وحدها، والعدّاد يضيع مع إعادة التشغيل. وحين تكبر
 * الأعداد يُنقل إلى مخزن مشترك. مكتوبٌ هنا لئلا يُنسى.
 */
const buckets = new Map<string, Bucket>();

export type RateVerdict = { ok: true } | { ok: false; retryAfterSec: number };

export function checkRate(userId: string, now = Date.now()): RateVerdict {
  const b = buckets.get(userId) ?? { times: [] };
  // ننظّف ما خرج من النافذة اليومية
  b.times = b.times.filter((t) => now - t < DAILY_WINDOW_MS);

  const inMinute = b.times.filter((t) => now - t < RATE_WINDOW_MS);
  if (inMinute.length >= RATE_MAX_CLIPS) {
    const oldest = Math.min.apply(null, inMinute);
    buckets.set(userId, b);
    return { ok: false, retryAfterSec: Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000) };
  }
  if (b.times.length >= DAILY_MAX_CLIPS) {
    buckets.set(userId, b);
    return { ok: false, retryAfterSec: 3600 };
  }

  b.times.push(now);
  buckets.set(userId, b);
  return { ok: true };
}

/**
 * هل هذا ملف WAV صالح فعلًا؟
 *
 * ⚠️ لا نصدّق ترويسة `Content-Type`: يكتبها المرسِل ويكذب فيها. نقرأ
 * بايتات الملف نفسه — RIFF/WAVE، PCM، أحادي، ١٦ ك.هرتز، ١٦ بت.
 * وما خالف ذلك يُردّ قبل أن يُرسل إلى المزوّد ويكلّفنا شيئًا.
 */
export type WavCheck =
  | { ok: true; seconds: number }
  | { ok: false; reason: 'NOT_WAV' | 'BAD_FORMAT' | 'TOO_LONG' | 'TOO_SHORT' };

export function inspectWav(buf: ArrayBuffer): WavCheck {
  if (buf.byteLength < 44) return { ok: false, reason: 'NOT_WAV' };
  const v = new DataView(buf);
  const tag = (at: number) =>
    String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { ok: false, reason: 'NOT_WAV' };

  const audioFormat = v.getUint16(20, true);
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  if (audioFormat !== 1 || channels !== 1 || sampleRate !== 16000 || bits !== 16)
    return { ok: false, reason: 'BAD_FORMAT' };

  const seconds = (buf.byteLength - 44) / BYTES_PER_SEC;
  if (seconds > MAX_CLIP_SEC) return { ok: false, reason: 'TOO_LONG' };
  if (seconds < 0.3) return { ok: false, reason: 'TOO_SHORT' };

  return { ok: true, seconds };
}
