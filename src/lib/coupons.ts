/**
 * أكواد الخصم في غراس — مصدرٌ واحد على الخادم.
 *
 * الكودُ يُتحقَّقُ منه في الخادم دائمًا (مسار /api/payments/coupon للعرض،
 * ومسار الدفع نفسه يعيد الحساب قبل إنشاءِ الفاتورة) فلا يُوثَقُ بسعرٍ من المتصفح.
 * الكتابةُ متسامحة: التشكيلُ والمسافاتُ وهمزاتُ الألفِ والتاءُ المربوطةُ لا تُهِمّ،
 * فـ«ورشه غراس» و«ورشة غراس» و«ورشةغراس» كلُّها تُقبَل.
 */
export interface Coupon {
  /** الكودُ كما تكتبه المعلمة (للعرضِ في الإيصال) */
  code: string;
  /** نسبةُ الخصم ٪ */
  percent: number;
  /** تاريخُ أولِ يومٍ يُقبَلُ فيه (ISO) — بلا قيمةٍ يعني ساريًا من الآن */
  from?: string;
  /** تاريخُ آخرِ يومٍ يُقبَلُ فيه (ISO) — بلا قيمةٍ يعني مفتوحًا */
  until?: string;
}

export const COUPONS: Coupon[] = [
  { code: 'ورشة غراس', percent: 20, until: '2026-10-01' },
  { code: 'ilovemath', percent: 20, until: '2026-10-01' },
  { code: 'fanatk21', percent: 20, until: '2026-10-01' },
  { code: 'جوزاء', percent: 20, until: '2026-10-01' },
  // الأحد ٤ أكتوبر حتى الخميس ٨ أكتوبر ٢٠٢٦ (بتوقيت الكويت)
  { code: 'Walmejbel', percent: 20, from: '2026-10-04', until: '2026-10-08' },
];

const TASHKEEL = /[ً-ْٰـ]/g;

/** توحيدُ الكتابةِ للمقارنة: بلا تشكيلٍ ولا مسافاتٍ ولا فروقِ همزةٍ/تاءٍ مربوطة. */
export function normalizeCode(input: string): string {
  return (input || '')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئي]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

/** المدةُ تُقاسُ بتوقيتِ الكويت: من فجرِ `from` إلى آخرِ لحظةٍ في `until`. */
function startsAt(c: Coupon): number {
  return c.from ? new Date(`${c.from}T00:00:00+03:00`).getTime() : -Infinity;
}
function endsAt(c: Coupon): number {
  return c.until ? new Date(`${c.until}T23:59:59+03:00`).getTime() : Infinity;
}
function isLive(c: Coupon, now = new Date()): boolean {
  const t = now.getTime();
  return t >= startsAt(c) && t <= endsAt(c);
}

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: 'unknown' }
  | { ok: false; reason: 'early' | 'expired'; coupon: Coupon };

/**
 * تشخيصُ الكود لا مجرّدُ قبولِه — فكودٌ لم يبدأْ بعدُ ليس كودًا خاطئًا،
 * والمعلمةُ تستحقُّ أن تعرفَ متى يبدأ بدل «الكود غير صحيح».
 */
export function checkCoupon(input?: string | null, now = new Date()): CouponCheck {
  const key = normalizeCode(input || '');
  const hit = key ? COUPONS.find((c) => normalizeCode(c.code) === key) : undefined;
  if (!hit) return { ok: false, reason: 'unknown' };
  const t = now.getTime();
  if (t < startsAt(hit)) return { ok: false, reason: 'early', coupon: hit };
  if (t > endsAt(hit)) return { ok: false, reason: 'expired', coupon: hit };
  return { ok: true, coupon: hit };
}

/** يومُ البدءِ بالعربية: «الأحد ٤ أكتوبر» — لرسالةِ الكودِ الذي لم يبدأ بعد. */
export function startLabel(c: Coupon): string {
  if (!c.from) return '';
  try {
    return new Intl.DateTimeFormat('ar-KW', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Asia/Kuwait',
    }).format(new Date(`${c.from}T12:00:00+03:00`));
  } catch {
    return c.from;
  }
}

/** يُرجعُ الكودَ المطابقَ الساري، أو `null` إن لم يوجد. */
export function findCoupon(input?: string | null, now = new Date()): Coupon | null {
  const res = checkCoupon(input, now);
  return res.ok ? res.coupon : null;
}

/** السعرُ بعدَ الخصم، مجبورًا على الفلس (٣ منازل) ولا ينزلُ تحتَ ١٠٠ فلس. */
export function discountedPrice(priceKwd: number, percent: number): number {
  const raw = priceKwd * (1 - percent / 100);
  const fils = Math.round(raw * 1000);
  return Math.max(100, fils) / 1000;
}
