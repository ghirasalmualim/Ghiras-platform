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
  /** تاريخُ آخرِ يومٍ يُقبَلُ فيه (ISO) — بلا قيمةٍ يعني مفتوحًا */
  until?: string;
}

export const COUPONS: Coupon[] = [
  { code: 'ورشة غراس', percent: 20 },
  { code: 'ilovemath', percent: 20 },
  { code: 'fanatk21', percent: 20 },
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

/** كودٌ سارٍ أم لا (التاريخُ يُقاسُ بنهايةِ يومِ `until`). */
function isLive(c: Coupon, now = new Date()): boolean {
  if (!c.until) return true;
  return now.getTime() <= new Date(`${c.until}T23:59:59+03:00`).getTime();
}

/** يُرجعُ الكودَ المطابقَ الساري، أو `null` إن لم يوجد. */
export function findCoupon(input?: string | null, now = new Date()): Coupon | null {
  const key = normalizeCode(input || '');
  if (!key) return null;
  const hit = COUPONS.find((c) => normalizeCode(c.code) === key);
  return hit && isLive(hit, now) ? hit : null;
}

/** السعرُ بعدَ الخصم، مجبورًا على الفلس (٣ منازل) ولا ينزلُ تحتَ ١٠٠ فلس. */
export function discountedPrice(priceKwd: number, percent: number): number {
  const raw = priceKwd * (1 - percent / 100);
  const fils = Math.round(raw * 1000);
  return Math.max(100, fils) / 1000;
}
