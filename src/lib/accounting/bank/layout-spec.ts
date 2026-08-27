/**
 * غراس للمحاسبة — Stage 9: مواصفة تخطيط الكشف (BANK-005).
 *
 * تهيئة تصريحية محدودة — مرآة TypeScript لعقد القاعدة
 * acc_validate_bank_layout_spec: قائمة مفاتيح مغلقة، أنواع صارمة،
 * لا تعبيرات ولا كود ولا regex حر. إضافة تخطيط بنك جديد = إدراج
 * بيانات فقط، بلا إصدار برمجي.
 */

export type FormatFamily = 'CSV' | 'XLSX' | 'MT940' | 'CAMT053' | 'OFX' | 'QIF' | 'PDF_TEXT';
export type AmountSemantics = 'DEBIT_CREDIT_COLUMNS' | 'SIGNED_AMOUNT' | 'AMOUNT_PLUS_DRCR_FLAG';

export interface LayoutSpec {
  header?: { skip_rows?: number; header_row_contains?: string[] };
  columns?: Partial<Record<
    'txn_date' | 'value_date' | 'description' | 'debit' | 'credit' |
    'amount' | 'balance' | 'reference' | 'currency', string | number>>;
  amount_semantics?: AmountSemantics;
  drcr_flag?: { column: string | number; debit_values: string[]; credit_values: string[] };
  date_format?: string;         // رموز D/M/Y وفواصل محدودة فقط
  decimal_separator?: '.' | ',';
  thousands_separator?: ',' | '.' | ' ' | '';
  encoding?: 'utf-8' | 'windows-1256' | 'utf-16le';
  delimiter?: string;           // محرف واحد
  currency_mode?: 'COLUMN' | 'FIXED';
  fixed_currency?: string;
  balance_direction?: 'AFTER_ROW' | 'NONE';
  row_order?: 'ASC' | 'DESC';
}

const TOP_KEYS = new Set(['header', 'columns', 'amount_semantics', 'drcr_flag', 'date_format',
  'decimal_separator', 'thousands_separator', 'encoding', 'delimiter',
  'currency_mode', 'fixed_currency', 'balance_direction', 'row_order']);
const COL_KEYS = new Set(['txn_date', 'value_date', 'description', 'debit', 'credit',
  'amount', 'balance', 'reference', 'currency']);
const TABULAR: ReadonlySet<string> = new Set(['CSV', 'XLSX', 'PDF_TEXT']);

/** يرفض المجهول والخطر — يطابق عقد القاعدة حرفيًا */
export function validateLayoutSpec(spec: unknown, family: FormatFamily):
  { ok: true } | { ok: false; reason: string } {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec))
    return { ok: false, reason: 'spec must be an object' };
  const s = spec as Record<string, unknown>;
  for (const k of Object.keys(s))
    if (!TOP_KEYS.has(k)) return { ok: false, reason: `unknown key: ${k}` };
  const tabular = TABULAR.has(family);
  if (tabular) {
    if (typeof s.columns !== 'object' || s.columns === null)
      return { ok: false, reason: 'columns required for tabular families' };
    if (!['DEBIT_CREDIT_COLUMNS', 'SIGNED_AMOUNT', 'AMOUNT_PLUS_DRCR_FLAG'].includes(String(s.amount_semantics)))
      return { ok: false, reason: 'invalid amount_semantics' };
    const df = String(s.date_format ?? '');
    if (!/^[DMY0-9./\- ]{4,20}$/.test(df) || !df.includes('D') || !df.includes('M') || !df.includes('Y'))
      return { ok: false, reason: 'invalid date_format' };
  }
  if (s.encoding !== undefined && !['utf-8', 'windows-1256', 'utf-16le'].includes(String(s.encoding)))
    return { ok: false, reason: 'unsupported encoding' };
  if (s.decimal_separator !== undefined && !['.', ','].includes(String(s.decimal_separator)))
    return { ok: false, reason: 'invalid decimal_separator' };
  if (s.thousands_separator !== undefined && ![',', '.', ' ', ''].includes(String(s.thousands_separator)))
    return { ok: false, reason: 'invalid thousands_separator' };
  if (s.delimiter !== undefined && (typeof s.delimiter !== 'string' || s.delimiter.length !== 1))
    return { ok: false, reason: 'delimiter must be one character' };
  if (s.currency_mode !== undefined && !['COLUMN', 'FIXED'].includes(String(s.currency_mode)))
    return { ok: false, reason: 'invalid currency_mode' };
  if (s.fixed_currency !== undefined && !/^[A-Z]{3}$/.test(String(s.fixed_currency)))
    return { ok: false, reason: 'invalid fixed_currency' };
  if (s.balance_direction !== undefined && !['AFTER_ROW', 'NONE'].includes(String(s.balance_direction)))
    return { ok: false, reason: 'invalid balance_direction' };
  if (s.row_order !== undefined && !['ASC', 'DESC'].includes(String(s.row_order)))
    return { ok: false, reason: 'invalid row_order' };
  if (s.header !== undefined) {
    const h = s.header as Record<string, unknown>;
    if (typeof h !== 'object' || h === null) return { ok: false, reason: 'header must be object' };
    if (h.skip_rows !== undefined && (typeof h.skip_rows !== 'number' || h.skip_rows < 0 || h.skip_rows > 100))
      return { ok: false, reason: 'skip_rows out of bounds' };
    if (h.header_row_contains !== undefined && !Array.isArray(h.header_row_contains))
      return { ok: false, reason: 'header_row_contains must be array' };
  }
  if (s.columns !== undefined) {
    for (const [k, v] of Object.entries(s.columns as Record<string, unknown>)) {
      if (!COL_KEYS.has(k)) return { ok: false, reason: `unknown column key: ${k}` };
      if (typeof v !== 'string' && typeof v !== 'number')
        return { ok: false, reason: `column ${k} must be name or index` };
    }
    const c = s.columns as Record<string, unknown>;
    if (tabular && (c.txn_date === undefined || c.description === undefined))
      return { ok: false, reason: 'txn_date and description columns are mandatory' };
  }
  if (s.drcr_flag !== undefined) {
    const f = s.drcr_flag as Record<string, unknown>;
    if (typeof f !== 'object' || f === null || f.column === undefined
        || !Array.isArray(f.debit_values) || !Array.isArray(f.credit_values))
      return { ok: false, reason: 'invalid drcr_flag' };
  }
  return { ok: true };
}
