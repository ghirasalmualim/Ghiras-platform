/**
 * غراس للمحاسبة — أنواع السجلّين وحالة الضريبة (STAGE 2)
 *
 * ⚠️ الضريبة **حالة** لا نسبة (TAX-001): NO_TAX_REGIME كيان مستقل
 * تمامًا — ليس ZERO_RATED وليس TAXABLE بنسبة صفر. النسبة لا معنى
 * لها إلا مع TAXABLE أو ZERO_RATED.
 */

// ─── سجل السياسات المحاسبية (§17) ───

export type PolicyStatus =
  | 'PROPOSED'
  | 'NEEDS_ACCOUNTANT_APPROVAL'
  | 'NEEDS_AUDITOR_APPROVAL'
  | 'APPROVED';

export type ApprovalRequired = 'ACCOUNTANT' | 'ACCOUNTANT_AND_AUDITOR';

export interface PolicyVersion {
  /** null = قالب عام (اقتراح Blueprint)؛ uuid = نسخة شركة (Part D) */
  readonly companyId: string | null;
  readonly policyId: string; // POL-001..
  readonly version: number;
  readonly name: string;
  readonly ifrsRef: string | null;
  readonly treatment: string;
  readonly alternatives: string | null;
  readonly approvalRequired: ApprovalRequired;
  readonly status: PolicyStatus;
  readonly effectiveFrom: string | null; // ISO date — null للقوالب غير المفعّلة
  readonly effectiveTo: string | null;
  readonly impactIfChanged: string | null; // ACC-016: شرط تفعيل
  readonly notes: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null; // إنسان فقط — لا SYSTEM ولا AI (ACC-017)
}

// ─── سجل القواعد التنظيمية (§18) ───

export type RuleStatus = 'ACTIVE' | 'PENDING' | 'DRAFT' | 'BLOCKED';
/** الثقة كما في الـBlueprint حرفيًا — لا تُعاد صياغتها */
export type Confidence = '🟢' | '🟡' | '🟠' | '🔴';

/**
 * دقة التاريخ صريحة — لا نصنع دقةً لم يعطها المصدر:
 * DAY يوم مؤكد · YEAR سنة فقط (لا يوم مخترعًا — «1990» لا تثبت
 * «1990-01-01») · NONE «—» لا حدّ أصلًا · UNKNOWN «?»/proposed/draft.
 */
export type DatePrecision = 'DAY' | 'YEAR' | 'NONE' | 'UNKNOWN';

export interface RuleBound {
  readonly precision: DatePrecision;
  /** ISO date — موجود فقط مع DAY */
  readonly date: string | null;
  /** موجود فقط مع YEAR */
  readonly year: number | null;
}

export function ruleBound(b: RuleBound): RuleBound {
  if ((b.precision === 'DAY') !== (b.date !== null) || (b.precision === 'YEAR') !== (b.year !== null)) {
    throw new Error(`inconsistent rule bound: ${JSON.stringify(b)} — precision must match its value`);
  }
  return b;
}

export interface RegulatoryRuleVersion {
  readonly ruleId: string; // REG-KW-001.. / REG-INT-001..
  readonly version: number;
  readonly jurisdiction: string;
  readonly regulator: string | null;
  readonly requirement: string;
  /** النص الحرفي من المصدر — «?» و«proposed …» و«—» تبقى كما هي */
  readonly effectiveFromText: string;
  readonly effectiveToText: string;
  /** التمثيل المطبّع بدقة معلنة — الغموض يبقى غموضًا (REG-002) */
  readonly effectiveFrom: RuleBound;
  readonly effectiveTo: RuleBound;
  readonly source: string;
  readonly status: RuleStatus;
  readonly confidence: Confidence;
  readonly systemImpact: string;
}

// ─── حالة الضريبة (TAX-001..004) ───

export const TAX_STATUSES = [
  'NO_TAX_REGIME',
  'OUT_OF_SCOPE',
  'TAXABLE',
  'ZERO_RATED',
  'EXEMPT',
  'REVERSE_CHARGE',
] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

/** الحالات الوحيدة التي تعني النسبة معها شيئًا */
export const RATE_BEARING_STATUSES: readonly TaxStatus[] = ['TAXABLE', 'ZERO_RATED'];

export interface TaxResolution {
  readonly status: TaxStatus;
  /** نص عشري دقيق — موجود فقط مع TAXABLE/ZERO_RATED (TAX-001) */
  readonly rate: string | null;
  readonly ruleId: string | null;
  readonly ruleVersion: number | null;
  readonly ruleStatus: RuleStatus | null;
  readonly asOf: string;
  /** لا حساب أبدًا من DRAFT/BLOCKED (TAX-004, REG-003) */
  readonly mayCompute: boolean;
  readonly note: string | null;
}

/** يبني نتيجة ضريبية ويرفض بنيويًا نسبةً على حالة لا تحملها */
export function taxResolution(r: TaxResolution): TaxResolution {
  const rateBearing = RATE_BEARING_STATUSES.includes(r.status);
  if (r.rate !== null && !rateBearing) {
    throw new Error(`tax status ${r.status} carries no rate — status is not a percentage (TAX-001)`);
  }
  if (r.status === 'TAXABLE' && r.rate === null) {
    throw new Error('TAXABLE requires an explicit rate');
  }
  if (typeof r.rate === 'number') {
    throw new Error('rate must be a decimal string, never a JS number (ACC-002)');
  }
  return r;
}
