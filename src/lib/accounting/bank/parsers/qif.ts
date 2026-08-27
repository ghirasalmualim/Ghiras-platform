/**
 * غراس للمحاسبة — Stage 9: QIF — parser حتمي محدود (D/T/P/M/N/^).
 * QIF لا يحمل أرصدة إطلاقًا: توكيد الرصيد غير قابل للإثبات منه، فيفشل
 * القبول مغلقًا (FILE_INTEGRITY) بتصميم مقصود — لا حقائق مصنوعة.
 */
import { ParserError } from '../connector.ts';
import type { NormalizedBankTxn, ParsedStatement } from '../connector.ts';
import { canonicalDescription, parseDateByFormat } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';

function qifAmountToMinor(raw: string, minorUnit: number): bigint {
  let s = raw.replace(/,/g, '').trim(); let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) throw new ParserError('PARSE_FAILED', `malformed QIF amount ${raw}`, {});
  const [w, f = ''] = s.split('.');
  if (f.length > minorUnit) throw new ParserError('PARSE_FAILED', `excess precision ${raw}`, { minorUnit });
  const v = BigInt(w) * 10n ** BigInt(minorUnit) + BigInt(f.padEnd(minorUnit, '0') || '0');
  return neg ? -v : v;
}

export function parseQif(text: string, minorUnit: number, dateFormat: string = 'DD/MM/YYYY'): ParsedStatement {
  const lines = text.split(/\r?\n/);
  if (lines.length > BANK_LIMITS.MAX_LINE_RECORDS)
    throw new ParserError('PARSE_FAILED', 'line limit exceeded', { lines: lines.length });
  const rows: NormalizedBankTxn[] = [];
  let cur: { d?: string; t?: string; p?: string; n?: string } = {};
  for (const line of lines) {
    if (line.startsWith('!')) continue;
    const code = line[0]; const val = line.slice(1);
    if (code === 'D') cur.d = val;
    else if (code === 'T' || code === 'U') cur.t = val;
    else if (code === 'P' || code === 'M') cur.p = cur.p ?? val;
    else if (code === 'N') cur.n = val;
    else if (code === '^') {
      if (cur.d !== undefined && cur.t !== undefined) {
        if (rows.length >= BANK_LIMITS.MAX_ROWS)
          throw new ParserError('PARSE_FAILED', 'row limit exceeded', { rows: rows.length });
        const desc = (cur.p ?? '').slice(0, BANK_LIMITS.MAX_DESCRIPTION_CHARS);
        rows.push({
          rowNo: rows.length + 1,
          txnDate: parseDateByFormat(cur.d, dateFormat),
          valueDate: null,
          descriptionRaw: desc, descriptionCanon: canonicalDescription(desc),
          amountMinor: qifAmountToMinor(cur.t, minorUnit),
          currency: '', runningBalanceMinor: null,
          reference: cur.n ?? null,
          raw: { qif: cur },
        });
      }
      cur = {};
    }
  }
  return {
    rows,
    explicitOpeningMinor: null, explicitClosingMinor: null,
    detectedCurrency: null, detectedAccountRaw: null, statementDate: null,
  };
}
