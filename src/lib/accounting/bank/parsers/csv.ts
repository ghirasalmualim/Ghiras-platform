/** غراس للمحاسبة — Stage 9: CSV عبر csv-parse (محدود، حتمي). */
import { parse } from 'csv-parse/sync';
import { ParserError } from '../connector.ts';
import type { ParsedStatement } from '../connector.ts';
import type { LayoutSpec } from '../layout-spec.ts';
import { decodeBytes } from '../normalize.ts';
import { rowsFromMatrix } from './tabular.ts';
import { BANK_LIMITS } from '../limits.ts';

export function parseCsv(bytes: Uint8Array, spec: LayoutSpec, minorUnit: number): ParsedStatement {
  const text = decodeBytes(bytes, spec.encoding);
  let matrix: string[][];
  try {
    matrix = parse(text, {
      delimiter: spec.delimiter ?? ',',
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
      trim: false,
    }) as string[][];
  } catch (e) {
    throw new ParserError('PARSE_FAILED', 'CSV parse error', { message: e instanceof Error ? e.message : String(e) });
  }
  const cells = matrix.reduce((a, r) => a + r.length, 0);
  if (cells > BANK_LIMITS.MAX_CELLS)
    throw new ParserError('PARSE_FAILED', 'cell limit exceeded', { cells });
  return rowsFromMatrix(matrix, spec, minorUnit);
}
