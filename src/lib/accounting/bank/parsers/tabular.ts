/**
 * غراس للمحاسبة — Stage 9: النواة الجدولية المشتركة (CSV/XLSX/PDF_TEXT).
 * مصفوفة خلايا نصية + مواصفة تخطيط تصريحية → كشف موحَّد. حتمية صرفة.
 */
import { ParserError } from '../connector.ts';
import type { NormalizedBankTxn, ParsedStatement } from '../connector.ts';
import type { LayoutSpec } from '../layout-spec.ts';
import { canonicalDescription, parseAmountToMinor, parseDateByFormat, signedAmountFromSemantics } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';

function cellOf(row: string[], header: string[], key: string | number | undefined): string {
  if (key === undefined) return '';
  if (typeof key === 'number') return row[key] ?? '';
  const idx = header.findIndex((h) => h.trim().toLowerCase() === key.trim().toLowerCase());
  return idx >= 0 ? (row[idx] ?? '') : '';
}

export function rowsFromMatrix(
  matrix: string[][], spec: LayoutSpec, minorUnit: number
): ParsedStatement {
  if (matrix.length > BANK_LIMITS.MAX_ROWS)
    throw new ParserError('PARSE_FAILED', 'row limit exceeded', { rows: matrix.length });
  const skip = spec.header?.skip_rows ?? 0;
  let body = matrix.slice(skip);
  // كشف صف الترويسة بعبارات حرفية معلنة (لا regex حر)
  let header: string[] = [];
  const marks = spec.header?.header_row_contains ?? [];
  const usesNames = Object.values(spec.columns ?? {}).some((v) => typeof v === 'string');
  if (usesNames || marks.length > 0) {
    const hIdx = body.findIndex((r) =>
      marks.length > 0
        ? marks.every((m) => r.some((c) => c.toLowerCase().includes(String(m).toLowerCase())))
        : r.some((c) => c.trim() !== ''));
    if (hIdx < 0) throw new ParserError('PARSE_FAILED', 'header row not found', { marks });
    header = body[hIdx].map((c) => c ?? '');
    body = body.slice(hIdx + 1);
  }
  const cols = spec.columns ?? {};
  const rows: NormalizedBankTxn[] = [];
  let detectedCurrency: string | null = null;
  let n = 0;
  for (const r of body) {
    if (r.every((c) => (c ?? '').trim() === '')) continue;  // صفوف فارغة
    n++;
    const dateRaw = cellOf(r, header, cols.txn_date);
    if (dateRaw.trim() === '') continue;  // ذيول/إجماليات بلا تاريخ
    const flagCol = spec.drcr_flag?.column;
    const amount = signedAmountFromSemantics(spec, minorUnit, {
      debit: cellOf(r, header, cols.debit),
      credit: cellOf(r, header, cols.credit),
      amount: cellOf(r, header, cols.amount),
      flag: flagCol === undefined ? '' : cellOf(r, header, flagCol),
    });
    const descRaw = cellOf(r, header, cols.description).slice(0, BANK_LIMITS.MAX_DESCRIPTION_CHARS);
    const balRaw = cellOf(r, header, cols.balance).trim();
    const vdRaw = cellOf(r, header, cols.value_date).trim();
    const curRaw = cellOf(r, header, cols.currency).trim().toUpperCase();
    if (spec.currency_mode === 'COLUMN' && curRaw !== '') detectedCurrency ??= curRaw;
    rows.push({
      rowNo: rows.length + 1,
      txnDate: parseDateByFormat(dateRaw, spec.date_format!),
      valueDate: vdRaw === '' ? null : parseDateByFormat(vdRaw, spec.date_format!),
      descriptionRaw: descRaw,
      descriptionCanon: canonicalDescription(descRaw),
      amountMinor: amount,
      currency: detectedCurrency ?? spec.fixed_currency ?? '',
      runningBalanceMinor:
        spec.balance_direction === 'NONE' || balRaw === ''
          ? null
          : parseAmountToMinor(balRaw, minorUnit, spec.decimal_separator ?? '.', spec.thousands_separator ?? ','),
      reference: cellOf(r, header, cols.reference).trim() || null,
      raw: Object.fromEntries(r.map((c, i) => [String(i), c])),
    });
  }
  if (spec.row_order === 'DESC') {
    rows.reverse();
    rows.forEach((row, i) => { row.rowNo = i + 1; });
  }
  if (spec.currency_mode === 'FIXED') detectedCurrency = spec.fixed_currency ?? null;
  return {
    rows,
    explicitOpeningMinor: null,
    explicitClosingMinor: null,
    detectedCurrency,
    detectedAccountRaw: null,
    statementDate: null,
  };
}
