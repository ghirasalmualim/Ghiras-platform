/**
 * غراس للمحاسبة — Stage 7: تحويل سلاسل المزوّد العشرية إلى وحدات صغرى
 * تامة بدقة العملة. لا float ثنائيًّا؛ الدقة الزائدة تُرفض لا تُقرَّب.
 * الدفتر يستخدم BaseCurrency (per Blueprint MF-008).
 */
const MINOR_UNITS: Record<string, number> = { KWD: 3, USD: 2, EUR: 2, JPY: 0 };

/**
 * «232.500» + عملة → BigInt وحدات صغرى تامة. دقة أزيد من العملة =
 * خطأ صريح (لا تقريب صامت). العلامة والفواصل غير المسموحة تُرفض.
 */
export function toMinor(decimal: string, currency: string): bigint {
  const unit = MINOR_UNITS[currency];
  if (unit === undefined) throw new Error(`unknown currency precision: ${currency}`);
  if (typeof decimal !== 'string') throw new Error('provider amount must be a string — never a JS number');
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!m) throw new Error(`invalid provider decimal: "${decimal}"`);
  const [, sign, intPart, fracRaw = ''] = m;
  if (fracRaw.length > unit) {
    throw new Error(`amount "${decimal}" exceeds ${currency} precision (${unit}) — rejected, never rounded`);
  }
  const frac = fracRaw.padEnd(unit, '0');
  const minor = BigInt((unit ? intPart + frac : intPart));
  return sign === '-' ? -minor : minor;
}

export function currencyMinorUnit(currency: string): number {
  const u = MINOR_UNITS[currency];
  if (u === undefined) throw new Error(`unknown currency: ${currency}`);
  return u;
}
