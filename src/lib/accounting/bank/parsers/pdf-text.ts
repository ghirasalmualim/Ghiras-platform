/**
 * غراس للمحاسبة — Stage 9: PDF_TEXT — استخراج **طبقة النص الحتمية**
 * فقط عبر pdfjs-dist (بلا AI). قرار الإغلاق المعتمد: PDF الصوري/الممسوح
 * ضوئيًا **مؤجَّل عمدًا للمرحلة 13** — هنا يعود UNSUPPORTED_FORMAT
 * بتفصيل صريح، لا محاولة استخراج بنموذج.
 *
 * الأسطر تُبنى من مواضع y، والأعمدة بفصل مسافتين فأكثر — التخطيط
 * يعيّن الأعمدة بفهارس رقمية عبر نفس النواة الجدولية.
 */
import { ParserError } from '../connector.ts';
import type { ParsedStatement } from '../connector.ts';
import type { LayoutSpec } from '../layout-spec.ts';
import { rowsFromMatrix } from './tabular.ts';
import { BANK_LIMITS } from '../limits.ts';

export async function parsePdfText(bytes: Uint8Array, spec: LayoutSpec, minorUnit: number): Promise<ParsedStatement> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes.slice(), useWorkerFetch: false, disableFontFace: true,
    }).promise;
  } catch (e) {
    throw new ParserError('PARSE_FAILED', 'PDF load error', { message: e instanceof Error ? e.message : String(e) });
  }
  if (doc.numPages > BANK_LIMITS.MAX_PDF_PAGES)
    throw new ParserError('PARSE_FAILED', 'PDF page limit exceeded', { pages: doc.numPages });
  // الخلايا من مواضع x الحتمية للعناصر: المتجاور بفجوة صغيرة (<4pt)
  // يُدمج خلية واحدة، والفجوة الأكبر = عمود جديد — لا اعتماد على
  // المسافات الحرفية (pdf.js يطبّعها بمقاييس الخط).
  const CELL_GAP_PT = 4;
  const matrix: string[][] = [];
  let textBytes = 0;
  let anyText = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    if (tc.items.length > 0) anyText = true;
    const byY = new Map<number, { x: number; endX: number; str: string }[]>();
    for (const it of tc.items as { str: string; transform: number[]; width?: number }[]) {
      if (!it.str || it.str.trim() === '') continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x, endX: x + (it.width ?? 0), str: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let prevEnd = -Infinity;
      for (const it of items) {
        textBytes += it.str.length;
        if (textBytes > BANK_LIMITS.MAX_PDF_TEXT_BYTES)
          throw new ParserError('PARSE_FAILED', 'PDF text size limit exceeded', {});
        if (cells.length > 0 && it.x - prevEnd < CELL_GAP_PT) {
          cells[cells.length - 1] += it.str;
        } else {
          cells.push(it.str);
        }
        prevEnd = it.endX;
      }
      matrix.push(cells);
    }
  }
  if (!anyText) {
    // صوري/ممسوح: لا طبقة نص — مؤجَّل صراحةً للمرحلة 13 (لا AI هنا)
    throw new ParserError('UNSUPPORTED_FORMAT',
      'image/scanned PDF has no text layer — AI extraction is deferred to Stage 13', {
        deferred_to: 'STAGE_13', reason: 'NO_TEXT_LAYER',
      });
  }
  return rowsFromMatrix(matrix, spec, minorUnit);
}
