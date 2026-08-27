/**
 * غراس للمحاسبة — Stage 9: MT940 — parser حتمي محدود لوسوم SWIFT
 * النصية: :25: الحساب، :60F: الافتتاحي، :62F: الختامي، :61: الحركة،
 * :86: الوصف. المبالغ بفاصلة عشرية؛ C دائن (+) وD مدين (−) مع RC/RD.
 */
import { ParserError } from '../connector.ts';
import type { NormalizedBankTxn, ParsedStatement } from '../connector.ts';
import { canonicalDescription } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';

function mtAmountToMinor(raw: string, minorUnit: number): bigint {
  const norm = raw.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(norm)) throw new ParserError('PARSE_FAILED', `malformed MT940 amount ${raw}`, {});
  const [w, f = ''] = norm.split('.');
  if (f.length > minorUnit) throw new ParserError('PARSE_FAILED', `excess precision in ${raw}`, { minorUnit });
  return BigInt(w) * 10n ** BigInt(minorUnit) + BigInt(f.padEnd(minorUnit, '0') || '0');
}
const y2 = (yy: string) => (Number(yy) >= 70 ? '19' : '20') + yy;
const mtDate = (d6: string) => `${y2(d6.slice(0, 2))}-${d6.slice(2, 4)}-${d6.slice(4, 6)}`;

function parseBalanceTag(v: string, minorUnit: number): { sign: 1n | -1n; date: string; ccy: string; minor: bigint } {
  const m = /^([CD])(\d{6})([A-Z]{3})([\d,]+)$/.exec(v.trim());
  if (!m) throw new ParserError('PARSE_FAILED', `malformed balance tag ${v}`, {});
  return { sign: m[1] === 'C' ? 1n : -1n, date: mtDate(m[2]), ccy: m[3], minor: mtAmountToMinor(m[4], minorUnit) };
}

export function parseMt940(text: string, minorUnit: number): ParsedStatement {
  const lines = text.split(/\r?\n/);
  if (lines.length > BANK_LIMITS.MAX_LINE_RECORDS)
    throw new ParserError('PARSE_FAILED', 'line limit exceeded', { lines: lines.length });
  // تجميع الوسوم متعددة الأسطر
  const tags: { tag: string; value: string }[] = [];
  for (const line of lines) {
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (m) tags.push({ tag: m[1], value: m[2] });
    else if (tags.length > 0 && line.trim() !== '' && !line.startsWith('-')) tags[tags.length - 1].value += '\n' + line;
  }
  if (tags.length === 0) throw new ParserError('PARSE_FAILED', 'no MT940 tags found', {});
  let opening: bigint | null = null, closing: bigint | null = null;
  let ccy: string | null = null, account: string | null = null, stmtDate: string | null = null;
  const rows: NormalizedBankTxn[] = [];
  let pending: Omit<NormalizedBankTxn, 'descriptionRaw' | 'descriptionCanon'> | null = null;
  const flush = (desc: string) => {
    if (!pending) return;
    const d = desc.slice(0, BANK_LIMITS.MAX_DESCRIPTION_CHARS);
    rows.push({ ...pending, descriptionRaw: d, descriptionCanon: canonicalDescription(d) });
    pending = null;
  };
  for (const { tag, value } of tags) {
    if (tag === '25') account = value.trim();
    else if (tag === '60F' || tag === '60M') {
      const b = parseBalanceTag(value, minorUnit);
      if (tag === '60F') { opening = b.sign * b.minor; ccy = b.ccy; }
    } else if (tag === '62F' || tag === '62M') {
      const b = parseBalanceTag(value, minorUnit);
      if (tag === '62F') { closing = b.sign * b.minor; stmtDate = b.date; }
    } else if (tag === '61') {
      flush('');
      // :61:YYMMDD[MMDD](C|D|RC|RD)amount N??? ref
      const m = /^(\d{6})(\d{4})?(RC|RD|C|D)([\d,]+)([A-Z][A-Z0-9]{3})?(.*)$/s.exec(value.trim());
      if (!m) throw new ParserError('PARSE_FAILED', `malformed :61: ${value}`, {});
      const valueDate = mtDate(m[1]);
      const entryDate = m[2] ? `${valueDate.slice(0, 4)}-${m[2].slice(0, 2)}-${m[2].slice(2, 4)}` : valueDate;
      const credit = m[3] === 'C' || m[3] === 'RD';   // عكس RD = إلغاء مدين → دائن
      const minor = mtAmountToMinor(m[4], minorUnit);
      pending = {
        rowNo: rows.length + 1,
        txnDate: entryDate, valueDate,
        amountMinor: credit ? minor : -minor,
        currency: ccy ?? '',
        runningBalanceMinor: null,   // MT940 لا رصيد لكل صف — الاشتقاق من 60F/62F
        reference: (m[6] ?? '').trim().replace(/^\/\//, '') || null,
        raw: { tag61: value },
      };
    } else if (tag === '86') {
      if (pending) flush(value.replace(/\n/g, ' '));
    }
  }
  flush('');
  return {
    rows,
    explicitOpeningMinor: opening,
    explicitClosingMinor: closing,
    detectedCurrency: ccy,
    detectedAccountRaw: account,
    statementDate: stmtDate,
  };
}
