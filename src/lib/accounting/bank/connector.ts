/**
 * غراس للمحاسبة — Stage 9: عقد BankConnector (BANK-003).
 *
 * استيراد الكشف هو القناة الأساسية (BANK-001)؛ الربط البنكي المفتوح
 * لاحقًا «موصل إضافي» بنفس هذا العقد لا معمارية بديلة (BANK-002،
 * وREG-KW-013: لا bank feed الآن). المرحلة 10 تستهلك النموذج الموحَّد
 * حصرًا ولا تعرف أي موصل/صيغة أنتجه (BANK-004).
 *
 * coverage_range وbalance_assertion إلزاميان — ملف لا يوفرهما بدليل
 * صريح أو اشتقاق حتمي كامل = فشل مغلق، لا حقائق مصنوعة.
 */

/** حركة موحَّدة — حقائق البنك بعملة حسابه؛ لا تحويل أساس عند الابتلاع */
export interface NormalizedBankTxn {
  rowNo: number;
  txnDate: string;              // ISO YYYY-MM-DD
  valueDate: string | null;     // قد يغيب — لا يُصنَّع (CORRECTION 4)
  descriptionRaw: string;
  descriptionCanon: string;     // التطبيع الحتمي للمطابقة فقط
  amountMinor: bigint;          // موقَّع: دائن للحساب موجب، مدين سالب
  currency: string;
  runningBalanceMinor: bigint | null;
  reference: string | null;
  raw: Record<string, unknown>; // حمولة المصدر محفوظة
}

export interface BalanceAssertion {
  openingMinor: bigint;
  closingMinor: bigint;
  movementSumMinor: bigint;
  /** مصدر التوكيد — لا يُدّعى أن المشتق جاء من ترويسة البنك (CORRECTION 5) */
  source: 'EXPLICIT_SOURCE' | 'DERIVED_FROM_RUNNING_BALANCE';
  derivation: Record<string, unknown> | null;
}

export interface CoverageRange { start: string; end: string }

export interface ConnectorCapabilities {
  hasRunningBalance: boolean;
  hasValueDate: boolean;
  formats: readonly string[];
}

/** عقد الموصل — المرحلة 10 لا ترى إلا مخرجاته الموحَّدة */
export interface BankConnector {
  identify_account(): { accountFingerprint: string | null; masked: string | null; currency: string | null };
  fetch_transactions(range?: CoverageRange): NormalizedBankTxn[];
  transaction_fingerprint(txn: NormalizedBankTxn): string | null;
  coverage_range(): CoverageRange;
  balance_assertion(): BalanceAssertion;
  freshness(): { asOf: string };
  capability_flags(): ConnectorCapabilities;
}

/** نتيجة parser صيغةٍ ما — المادة الخام لموصل الكشف */
export interface ParsedStatement {
  rows: NormalizedBankTxn[];
  explicitOpeningMinor: bigint | null;
  explicitClosingMinor: bigint | null;
  detectedCurrency: string | null;
  /** المعرّف الخام إن ظهر في الملف — يُبصَم فورًا ولا يُنسخ لحقول مرئية */
  detectedAccountRaw: string | null;
  statementDate: string | null;
}

/** خطأ محكوم بشرط آلي (CORRECTION 9) — لا استثناءات غامضة */
export class ParserError extends Error {
  readonly condition: 'PARSE_FAILED' | 'UNSUPPORTED_FORMAT' | 'UNKNOWN_LAYOUT';
  readonly detail: Record<string, unknown>;

  // بلا parameter properties — بنية قابلة للتجريد (Node type stripping)
  constructor(
    condition: 'PARSE_FAILED' | 'UNSUPPORTED_FORMAT' | 'UNKNOWN_LAYOUT',
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.condition = condition;
    this.detail = detail;
  }
}
