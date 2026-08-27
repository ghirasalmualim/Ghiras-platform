/**
 * غراس للمحاسبة — Stage 9: حدود موارد الـparsers.
 *
 * حدود سلامة هندسية حتمية قابلة للاختبار — ليست قواعد تنظيمية.
 * كل parser محدود: لا صيغ تنفيذية، لا ماكرو، لا DTD/كيانات خارجية،
 * لا شبكة. تجاوز حدٍّ = ParserError محكوم لا انهيار.
 */
export const BANK_LIMITS = {
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
  MAX_ROWS: 50_000,
  MAX_CELLS: 500_000,
  MAX_XLSX_SHEETS: 10,
  MAX_PDF_PAGES: 100,
  MAX_PDF_TEXT_BYTES: 5 * 1024 * 1024,
  MAX_XML_BYTES: 20 * 1024 * 1024,
  MAX_XML_DEPTH: 40,
  MAX_LINE_RECORDS: 200_000,
  MAX_DESCRIPTION_CHARS: 2_000,
} as const;
