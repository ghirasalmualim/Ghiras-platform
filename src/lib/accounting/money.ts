/**
 * غراس للمحاسبة — نموذج المال (STAGE 1 · ACC-001..005)
 *
 * ═══ MONEY IS NOT A NUMBER ═══
 * التمثيل المختار: **وحدات صغرى بأعداد BigInt صحيحة** لكل عملة بدقتها
 * من ISO 4217 — لماذا هذا لا arbitrary-decimal؟
 *   · دقة تامة بلا أي float في أي طبقة (ACC-002) وبصفر تبعيات؛
 *   · الجمع والطرح والمقارنة عمليات أعداد صحيحة لا تقريب فيها أصلًا؛
 *   · يطابق تخزين القاعدة (amount_minor bigint) واحدًا لواحد؛
 *   · نقطة التقريب الوحيدة تصبح صريحة ومحصورة: عند التحويل من نصٍّ
 *     عشري أو عند تطبيق سعر صرف — لا في كل عملية (ACC-003).
 *
 * ⚠️ لا يقبل أي مدخل من نوع number لمقدارٍ ماليّ. النصوص والBigInt فقط.
 * ⚠️ الدقة ملك العملة (KWD=3, USD=2, JPY=0) — لا افتراض ٣ منازل عالميًا.
 */

import { CURRENCIES, type CurrencyCode } from './currencies';

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';

/** نقطة التقريب الوحيدة في النظام — موثقة هنا ولا تُطبَّق ضمنيًا في غيرها. */
export const DEFAULT_ROUNDING: RoundingMode = 'HALF_UP';

export interface Money {
  /** المقدار بالوحدة الصغرى للعملة — عدد صحيح تام */
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export interface ConvertedMoney extends Money {
  /** توثيق التحويل — يُخزَّن مع الحركة ولا يُعاد حسابه (ACC-004/005) */
  readonly conversion: {
    readonly from: Money;
    readonly rate: string;        // السعر كنصٍّ دقيق كما ورد من مصدره
    readonly rateDate: string;    // ISO date
    readonly rateSource: string;
    readonly rounding: RoundingMode;
  };
}

function minorUnit(currency: CurrencyCode): number {
  const c = CURRENCIES[currency];
  if (!c) throw new Error(`unknown currency: ${currency}`);
  return c.minorUnit;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `currency mismatch: ${a.currency} vs ${b.currency} — التحويل يمر بـconvert() الصريحة`
    );
  }
}

function assertNoNumber(value: unknown, what: string): void {
  if (typeof value === 'number') {
    throw new Error(`${what} must not be a JS number — pass a string or bigint (ACC-002)`);
  }
}

export function money(amountMinor: bigint | string, currency: CurrencyCode): Money {
  assertNoNumber(amountMinor, 'amountMinor');
  minorUnit(currency); // يتحقق من العملة
  const v = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor);
  return { amountMinor: v, currency };
}

/**
 * من نصٍّ عشري («12.345») إلى Money — **نقطة تقريب** إذا زادت المنازل
 * عن دقة العملة، بنمط تقريب صريح يمرَّر أو يؤخذ الافتراضي الموثق.
 */
export function fromDecimal(
  text: string,
  currency: CurrencyCode,
  rounding: RoundingMode = DEFAULT_ROUNDING
): Money {
  assertNoNumber(text, 'decimal text');
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`invalid decimal text: "${text}"`);
  const [, signS, intPart, fracRaw = ''] = m;
  const unit = minorUnit(currency);
  const neg = signS === '-';

  const kept = fracRaw.slice(0, unit).padEnd(unit, '0');
  const dropped = fracRaw.slice(unit);
  let minor = BigInt(intPart + (unit ? kept : ''));

  if (/[1-9]/.test(dropped)) {
    minor = applyRounding(minor, dropped, rounding, neg); // أصفار زائدة فقط = لا تقريب
  }
  return { amountMinor: neg ? -minor : minor, currency };
}

/** التقريب الموحد — يُستدعى من نقطتي التقريب فقط، لا من العمليات. */
function applyRounding(
  truncated: bigint,
  droppedDigits: string,
  mode: RoundingMode,
  isNegative: boolean
): bigint {
  // يعمل على المقدار المطلق دائمًا — الإشارة تُعاد خارجه، فيكون
  // HALF_UP «نصفًا بعيدًا عن الصفر» وDOWN «نحو الصفر» بتماثل تام.
  void isNegative;
  const first = droppedDigits.charCodeAt(0) - 48; // 0..9
  const restNonZero = /[1-9]/.test(droppedDigits.slice(1));
  switch (mode) {
    case 'DOWN':
      return truncated;
    case 'UP':
      return truncated + 1n;
    case 'HALF_UP':
      return first >= 5 ? truncated + 1n : truncated;
    case 'HALF_EVEN': {
      if (first < 5) return truncated;
      if (first > 5 || restNonZero) return truncated + 1n;
      return truncated % 2n === 0n ? truncated : truncated + 1n; // نصف تمامًا → زوجي
    }
  }
}

export function toDecimal(m: Money): string {
  const unit = minorUnit(m.currency);
  const neg = m.amountMinor < 0n;
  const abs = (neg ? -m.amountMinor : m.amountMinor).toString();
  if (unit === 0) return (neg ? '-' : '') + abs;
  const padded = abs.padStart(unit + 1, '0');
  const intPart = padded.slice(0, -unit);
  const frac = padded.slice(-unit);
  return `${neg ? '-' : ''}${intPart}.${frac}`;
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amountMinor: -a.amountMinor, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/**
 * تطبيق سعر صرف — **نقطة التقريب الثانية والأخيرة**.
 * السعر نصٌّ عشري دقيق (كما ورد من مصدره)؛ الحساب كله بأعداد صحيحة
 * مُقيَّسة، والتقريب مرة واحدة عند دقة عملة الهدف. الناتج يحمل توثيق
 * التحويل كاملًا ولا يُعاد حسابه من سعرٍ لاحق أبدًا (ACC-004/005).
 */
export function convert(
  from: Money,
  to: CurrencyCode,
  rate: string,
  rateDate: string,
  rateSource: string,
  rounding: RoundingMode = DEFAULT_ROUNDING
): ConvertedMoney {
  assertNoNumber(rate, 'rate');
  const rm = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!rm) throw new Error(`invalid rate text: "${rate}"`);
  const [, rInt, rFrac = ''] = rm;
  const rateScale = rFrac.length;
  const rateScaled = BigInt(rInt + rFrac); // rate × 10^rateScale

  const fromUnit = minorUnit(from.currency);
  const toUnit = minorUnit(to);

  const neg = from.amountMinor < 0n;
  const absFrom = neg ? -from.amountMinor : from.amountMinor;

  // amount(minor_from) × rate → نريده بوحدة minor_to:
  // value = absFrom × rateScaled × 10^toUnit / (10^rateScale × 10^fromUnit)
  const numerator = absFrom * rateScaled * 10n ** BigInt(toUnit);
  const denominator = 10n ** BigInt(rateScale + fromUnit);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  let minor = quotient;
  if (remainder !== 0n) {
    // حوّل الباقي لأرقام مُسقطة عشرية للتقريب الموحد
    const droppedNum = (remainder * 10n) / denominator; // أول رقم مُسقط
    const droppedRest = (remainder * 10n) % denominator !== 0n ? '1' : '';
    minor = applyRounding(minor, droppedNum.toString() + droppedRest, rounding, neg);
  }

  return {
    amountMinor: neg ? -minor : minor,
    currency: to,
    conversion: {
      from,
      rate: rate.trim(),
      rateDate,
      rateSource,
      rounding,
    },
  };
}
