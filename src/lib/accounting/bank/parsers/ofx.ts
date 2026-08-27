/**
 * غراس للمحاسبة — Stage 9: OFX (SGML/XML-lite) — parser حتمي محدود:
 * STMTTRN (DTPOSTED/TRNAMT/MEMO|NAME/FITID) وLEDGERBAL وCURDEF وACCTID.
 */
import { ParserError } from '../connector.ts';
import type { NormalizedBankTxn, ParsedStatement } from '../connector.ts';
import { canonicalDescription } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';

function tagVal(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`).exec(block);
  return m ? m[1].trim() : null;
}
function ofxAmountToMinor(raw: string, minorUnit: number): bigint {
  let s = raw.trim(); let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new ParserError('PARSE_FAILED', `malformed OFX amount ${raw}`, {});
  const [w, f = ''] = s.split('.');
  if (f.length > minorUnit) throw new ParserError('PARSE_FAILED', `excess precision ${raw}`, { minorUnit });
  const v = BigInt(w) * 10n ** BigInt(minorUnit) + BigInt(f.padEnd(minorUnit, '0') || '0');
  return neg ? -v : v;
}
const ofxDate = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;

export function parseOfx(text: string, minorUnit: number): ParsedStatement {
  if (text.split('\n').length > BANK_LIMITS.MAX_LINE_RECORDS)
    throw new ParserError('PARSE_FAILED', 'line limit exceeded', {});
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0 && !/<LEDGERBAL>/i.test(text))
    throw new ParserError('PARSE_FAILED', 'no OFX statement content', {});
  const rows: NormalizedBankTxn[] = [];
  for (const b of blocks) {
    if (rows.length >= BANK_LIMITS.MAX_ROWS)
      throw new ParserError('PARSE_FAILED', 'row limit exceeded', { rows: rows.length });
    const dt = tagVal(b, 'DTPOSTED'); const amt = tagVal(b, 'TRNAMT');
    if (!dt || !amt) throw new ParserError('PARSE_FAILED', 'STMTTRN missing DTPOSTED/TRNAMT', {});
    const desc = (tagVal(b, 'MEMO') ?? tagVal(b, 'NAME') ?? '').slice(0, BANK_LIMITS.MAX_DESCRIPTION_CHARS);
    rows.push({
      rowNo: rows.length + 1,
      txnDate: ofxDate(dt), valueDate: null,   // OFX لا يفصل value date — لا تصنيع
      descriptionRaw: desc, descriptionCanon: canonicalDescription(desc),
      amountMinor: ofxAmountToMinor(amt, minorUnit),  // TRNAMT موقَّع أصلًا (دائن موجب)
      currency: '', runningBalanceMinor: null,
      reference: tagVal(b, 'FITID'),
      raw: { stmttrn: b.slice(0, 500) },
    });
  }
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|$)/i.exec(text)?.[1] ?? '';
  const closing = tagVal(ledger, 'BALAMT');
  return {
    rows,
    explicitOpeningMinor: null,   // OFX يعطي رصيدًا ختاميًا فقط — لا افتتاحي مُدّعى
    explicitClosingMinor: closing ? ofxAmountToMinor(closing, minorUnit) : null,
    detectedCurrency: tagVal(text, 'CURDEF'),
    detectedAccountRaw: tagVal(text, 'ACCTID'),
    statementDate: (() => { const d = tagVal(ledger, 'DTASOF'); return d ? ofxDate(d) : null; })(),
  };
}
