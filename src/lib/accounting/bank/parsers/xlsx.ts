/**
 * غراس للمحاسبة — Stage 9: XLSX عبر exceljs — قيم فقط:
 * لا تنفيذ صيغ (نأخذ result المخزّن)، لا ماكرو، حدود أوراق/خلايا.
 */
import ExcelJS from 'exceljs';
import { ParserError } from '../connector.ts';
import type { ParsedStatement } from '../connector.ts';
import type { LayoutSpec } from '../layout-spec.ts';
import { rowsFromMatrix } from './tabular.ts';
import { BANK_LIMITS } from '../limits.ts';

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue); // قيمة صيغة مخزنة — لا تنفيذ
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
}

export async function parseXlsx(bytes: Uint8Array, spec: LayoutSpec, minorUnit: number): Promise<ParsedStatement> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch (e) {
    throw new ParserError('PARSE_FAILED', 'XLSX load error', { message: e instanceof Error ? e.message : String(e) });
  }
  if (wb.worksheets.length > BANK_LIMITS.MAX_XLSX_SHEETS)
    throw new ParserError('PARSE_FAILED', 'sheet limit exceeded', { sheets: wb.worksheets.length });
  const ws = wb.worksheets[0];
  if (!ws) throw new ParserError('PARSE_FAILED', 'workbook has no sheets', {});
  const matrix: string[][] = [];
  let cells = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { arr[col - 1] = cellText(cell.value); });
    cells += arr.length;
    if (matrix.length >= BANK_LIMITS.MAX_ROWS)
      throw new ParserError('PARSE_FAILED', 'row limit exceeded', { rows: matrix.length });
    if (cells > BANK_LIMITS.MAX_CELLS)
      throw new ParserError('PARSE_FAILED', 'cell limit exceeded', { cells });
    matrix.push(arr.map((c) => c ?? ''));
  });
  return rowsFromMatrix(matrix, spec, minorUnit);
}
