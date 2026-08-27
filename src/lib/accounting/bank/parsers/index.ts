/**
 * غراس للمحاسبة — Stage 9: بوابة الـparsers الحتمية الموحّدة.
 * الاختيار بعائلة صيغة التخطيط المهيّأ حصرًا — لا بنك مسمّى في الكود
 * (BANK-005/BLK-011). كل parser محدود الموارد ويرمي ParserError محكومًا.
 */
import { ParserError } from '../connector.ts';
import type { ParsedStatement } from '../connector.ts';
import type { FormatFamily, LayoutSpec } from '../layout-spec.ts';
import { decodeBytes } from '../normalize.ts';
import { BANK_LIMITS } from '../limits.ts';
import { parseCsv } from './csv.ts';
import { parseXlsx } from './xlsx.ts';
import { parseMt940 } from './mt940.ts';
import { parseCamt053 } from './camt053.ts';
import { parseOfx } from './ofx.ts';
import { parseQif } from './qif.ts';
import { parsePdfText } from './pdf-text.ts';

export async function parseStatement(
  family: FormatFamily, bytes: Uint8Array, spec: LayoutSpec, minorUnit: number
): Promise<ParsedStatement> {
  if (bytes.byteLength > BANK_LIMITS.MAX_UPLOAD_BYTES)
    throw new ParserError('PARSE_FAILED', 'upload size limit exceeded', { bytes: bytes.byteLength });
  switch (family) {
    case 'CSV':     return parseCsv(bytes, spec, minorUnit);
    case 'XLSX':    return parseXlsx(bytes, spec, minorUnit);
    case 'MT940':   return parseMt940(decodeBytes(bytes, spec.encoding), minorUnit);
    case 'CAMT053': return parseCamt053(decodeBytes(bytes, spec.encoding), minorUnit);
    case 'OFX':     return parseOfx(decodeBytes(bytes, spec.encoding), minorUnit);
    case 'QIF':     return parseQif(decodeBytes(bytes, spec.encoding), minorUnit, spec.date_format);
    case 'PDF_TEXT': return parsePdfText(bytes, spec, minorUnit);
    default:
      throw new ParserError('UNKNOWN_LAYOUT', `no parser for format family ${family}`, { family });
  }
}
