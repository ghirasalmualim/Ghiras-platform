/**
 * غراس للمحاسبة — Stage 9: CAMT.053 (ISO 20022) عبر fast-xml-parser.
 * أمان XML: رفض DOCTYPE (لا DTD/كيانات خارجية)، processEntities=false،
 * حدّ حجم. OPBD افتتاحي، CLBD ختامي، Ntry حركة (CRDT/DBIT).
 */
import { XMLParser } from 'fast-xml-parser';
import { ParserError } from '../connector.ts';
import type { NormalizedBankTxn, ParsedStatement } from '../connector.ts';
import { canonicalDescription } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';

function amtToMinor(raw: string, minorUnit: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new ParserError('PARSE_FAILED', `malformed CAMT amount ${raw}`, {});
  const [w, f = ''] = raw.split('.');
  if (f.length > minorUnit) throw new ParserError('PARSE_FAILED', `excess precision ${raw}`, { minorUnit });
  return BigInt(w) * 10n ** BigInt(minorUnit) + BigInt(f.padEnd(minorUnit, '0') || '0');
}
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseCamt053(text: string, minorUnit: number): ParsedStatement {
  if (text.length > BANK_LIMITS.MAX_XML_BYTES)
    throw new ParserError('PARSE_FAILED', 'XML size limit exceeded', { bytes: text.length });
  if (/<!DOCTYPE/i.test(text))
    throw new ParserError('PARSE_FAILED', 'DTD/DOCTYPE is rejected (no external entities)', {});
  let doc: Record<string, unknown>;
  try {
    doc = new XMLParser({
      ignoreAttributes: false, attributeNamePrefix: '@',
      processEntities: false, ignoreDeclaration: true,
    }).parse(text);
  } catch (e) {
    throw new ParserError('PARSE_FAILED', 'XML parse error', { message: e instanceof Error ? e.message : String(e) });
  }
  const stmt = (doc as any)?.Document?.BkToCstmrStmt?.Stmt;
  const s = Array.isArray(stmt) ? stmt[0] : stmt;
  if (!s) throw new ParserError('PARSE_FAILED', 'no camt.053 Stmt element', {});
  const account = s?.Acct?.Id?.IBAN ?? s?.Acct?.Id?.Othr?.Id ?? null;
  let opening: bigint | null = null, closing: bigint | null = null, ccy: string | null = null;
  for (const b of arr<any>(s.Bal)) {
    const code = b?.Tp?.CdOrPrtry?.Cd;
    const amt = b?.Amt?.['#text'] ?? b?.Amt;
    const cur = b?.Amt?.['@Ccy'];
    if (typeof cur === 'string') ccy ??= cur;
    const sign = b?.CdtDbtInd === 'DBIT' ? -1n : 1n;
    if (code === 'OPBD') opening = sign * amtToMinor(String(amt), minorUnit);
    if (code === 'CLBD') closing = sign * amtToMinor(String(amt), minorUnit);
  }
  const rows: NormalizedBankTxn[] = [];
  for (const e of arr<any>(s.Ntry)) {
    if (rows.length >= BANK_LIMITS.MAX_ROWS)
      throw new ParserError('PARSE_FAILED', 'row limit exceeded', { rows: rows.length });
    const amtRaw = String(e?.Amt?.['#text'] ?? e?.Amt ?? '');
    const cur = e?.Amt?.['@Ccy']; if (typeof cur === 'string') ccy ??= cur;
    const credit = e?.CdtDbtInd === 'CRDT';
    const minor = amtToMinor(amtRaw, minorUnit);
    const desc = String(
      e?.NtryDtls?.TxDtls?.RmtInf?.Ustrd ?? e?.AddtlNtryInf ?? ''
    ).slice(0, BANK_LIMITS.MAX_DESCRIPTION_CHARS);
    rows.push({
      rowNo: rows.length + 1,
      txnDate: String(e?.BookgDt?.Dt ?? '').slice(0, 10),
      valueDate: e?.ValDt?.Dt ? String(e.ValDt.Dt).slice(0, 10) : null,
      descriptionRaw: desc,
      descriptionCanon: canonicalDescription(desc),
      amountMinor: credit ? minor : -minor,
      currency: ccy ?? '',
      runningBalanceMinor: null,
      reference: e?.AcctSvcrRef ? String(e.AcctSvcrRef) : null,
      raw: { ntry: JSON.parse(JSON.stringify(e)) },
    });
  }
  return {
    rows,
    explicitOpeningMinor: opening,
    explicitClosingMinor: closing,
    detectedCurrency: ccy,
    detectedAccountRaw: account ? String(account) : null,
    statementDate: s?.CreDtTm ? String(s.CreDtTm).slice(0, 10) : null,
  };
}
