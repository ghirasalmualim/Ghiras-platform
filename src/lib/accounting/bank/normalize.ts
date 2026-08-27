/**
 * غراس للمحاسبة — Stage 9: التطبيع الحتمي.
 *
 * الوصف القانوني للمطابقة فقط (NFKC، إزالة محارف العرض الصفرية،
 * ضغط المسافات، توحيد حالة لاتينية) — العرض يبقى خامًا بايتًا-ببايت.
 * لا AI، لا embeddings، لا fuzzy — حتمية صرفة.
 *
 * المال: وحدات صغرى bigint حصرًا بدقة العملة من acc_currencies —
 * لا float في أي مسار، ولا تحويل لعملة الأساس عند الابتلاع.
 */
import type { LayoutSpec } from './layout-spec.ts';

/** التطبيع القانوني الحتمي للوصف — للمطابقة/البصمة فقط */
export function canonicalDescription(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')  // محارف اتجاه/عرض صفرية
    .replace(/\s+/g, ' ')
    .replace(/\s*([:/\-#.,])\s*/g, '$1')                  // فروق ترقيم/تباعد محدودة
    .trim()
    .toUpperCase();
}

/** تحويل مبلغ نصي بحسب الفواصل المهيّأة إلى وحدات صغرى — رفض لا تقريب */
export function parseAmountToMinor(
  rawInput: string, minorUnit: number,
  decimalSep: string = '.', thousandsSep: string = ','
): bigint {
  let raw = rawInput.normalize('NFKC').trim();
  if (raw === '') throw new Error('empty amount');
  let negative = false;
  if (/^\(.*\)$/.test(raw)) { negative = true; raw = raw.slice(1, -1); }  // (1,234.56)
  if (raw.startsWith('-')) { negative = true; raw = raw.slice(1); }
  if (raw.startsWith('+')) raw = raw.slice(1);
  if (thousandsSep !== '') raw = raw.split(thousandsSep).join('');
  if (decimalSep !== '.') raw = raw.split(decimalSep).join('.');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`malformed amount: ${rawInput}`);
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > minorUnit) {
    throw new Error(`excess precision: ${rawInput} exceeds ${minorUnit} decimals`);
  }
  const minor = BigInt(whole) * 10n ** BigInt(minorUnit) + BigInt(frac.padEnd(minorUnit, '0') || '0');
  return negative ? -minor : minor;
}

/** تفكيك تاريخ بحسب صيغة رموز D/M/Y المحدودة — لا تخمين */
export function parseDateByFormat(raw: string, format: string): string {
  const v = raw.normalize('NFKC').trim();
  let d = '', m = '', y = '';
  let vi = 0;
  for (let fi = 0; fi < format.length; fi++) {
    const ch = format[fi];
    if (ch === 'D' || ch === 'M' || ch === 'Y') {
      let run = 1;
      while (format[fi + 1] === ch) { fi++; run++; }
      const part = v.slice(vi, vi + run);
      if (!new RegExp(`^\\d{${run}}$`).test(part)) throw new Error(`date ${raw} does not match ${format}`);
      vi += run;
      if (ch === 'D') d = part; else if (ch === 'M') m = part; else y = part;
    } else {
      if (v[vi] !== ch) throw new Error(`date ${raw} does not match ${format}`);
      vi++;
    }
  }
  if (vi !== v.length) throw new Error(`date ${raw} does not match ${format}`);
  if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
  const iso = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const chk = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(chk.getTime()) || chk.toISOString().slice(0, 10) !== iso)
    throw new Error(`invalid calendar date: ${raw}`);
  return iso;
}

/** فكّ ترميز البايتات بالترميز المهيّأ — مدعوم أصلًا في Node (تحقق مثبت) */
export function decodeBytes(bytes: Uint8Array, encoding: LayoutSpec['encoding'] = 'utf-8'): string {
  return new TextDecoder(encoding ?? 'utf-8', { fatal: false }).decode(bytes);
}

/**
 * المبلغ الموقَّع من دلالة التخطيط: دائن للحساب = موجب، مدين = سالب.
 * cells: قيم الصف بعد استخراج الأعمدة.
 */
export function signedAmountFromSemantics(
  spec: LayoutSpec, minorUnit: number,
  cells: { debit?: string; credit?: string; amount?: string; flag?: string }
): bigint {
  const dec = spec.decimal_separator ?? '.';
  const th = spec.thousands_separator ?? ',';
  const sem = spec.amount_semantics;
  if (sem === 'DEBIT_CREDIT_COLUMNS') {
    const debRaw = (cells.debit ?? '').trim();
    const credRaw = (cells.credit ?? '').trim();
    const deb = debRaw === '' ? 0n : parseAmountToMinor(debRaw, minorUnit, dec, th);
    const cred = credRaw === '' ? 0n : parseAmountToMinor(credRaw, minorUnit, dec, th);
    if (deb !== 0n && cred !== 0n) throw new Error('row carries both debit and credit');
    if (cred !== 0n) return cred;
    if (deb !== 0n) return -deb;
    return 0n;
  }
  if (sem === 'AMOUNT_PLUS_DRCR_FLAG') {
    const amt = parseAmountToMinor(cells.amount ?? '', minorUnit, dec, th);
    const flag = (cells.flag ?? '').trim();
    if (spec.drcr_flag!.credit_values.includes(flag)) return amt < 0n ? -amt : amt;
    if (spec.drcr_flag!.debit_values.includes(flag)) return amt < 0n ? amt : -amt;
    throw new Error(`unknown DR/CR flag: ${flag}`);
  }
  // SIGNED_AMOUNT
  return parseAmountToMinor(cells.amount ?? '', minorUnit, dec, th);
}
