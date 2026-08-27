/**
 * غراس للمحاسبة — Stage 11: DTO وضع المالكة — الإسقاط الآمن بنيويًا.
 *
 * هذه الوحدة **صرفة**: مدخلات بيانات عادية → DTO؛ لا قاعدة ولا شبكة —
 * فتُختبر وحدها ويُمسح ناتجها المسلسل ضد المصطلحات المحرَّمة.
 *
 * القواعد الملزمة المرمّزة هنا:
 * - ZERO ≠ UNKNOWN ≠ STALE ≠ PROVISIONAL ≠ NOT_CONFIGURED — حالة أولى.
 * - نقص التغطية لا يصير صفرًا أبدًا، ولا «رصيد جزئي» يُنشر كرصيد كامل.
 * - بطاقة الربح بلا رقم قبل طبقة التقارير (Stage 12) — لا تقدير خشن.
 * - بطاقة ٣ ثلاثة مكوّنات منفصلة — لا جمع معتم ولا عدّ مزدوج.
 * - الصمود حتمي، بأيام، ويرفض الحساب من تغطية ناقصة.
 * - لا معرّفات حقائق مهنية في DTO المالكة (المرجع الرأي exception id فقط).
 */
import type { ExceptionPriority, ExceptionType } from '../exceptions/registry.ts';
import { EXCEPTION_REGISTRY } from '../exceptions/registry.ts';
import type { OwnerKey } from './vocabulary.ts';

export type OwnerStatus =
  | 'FINAL' | 'PROVISIONAL' | 'STALE' | 'UNKNOWN' | 'NOT_CONFIGURED';

export interface MoneyValue {
  /** minor units نصًّا — لا يمر مبلغ بـNumber أبدًا */
  amountMinor: string | null;
  currency: string | null;
}

export interface CardComponent {
  labelKey?: OwnerKey;
  /** تسمية حرة آمنة فقط: اسم حساب بنكي/عميل — لا مصطلح مهني */
  label?: string;
  value: MoneyValue;
  status: OwnerStatus;
  noteKey?: OwnerKey;
  noteParams?: Record<string, string>;
}

export type CardKey =
  | 'CASH_TODAY' | 'PROFIT_MONTH' | 'MONEY_IN_TRANSIT'
  | 'RUNWAY' | 'OBLIGATIONS' | 'ATTENTION';

export type PendingOn = 'STAGE_12' | 'STAGE_13' | 'INFRA' | null;

export interface DashboardCard {
  cardKey: CardKey;
  titleKey: OwnerKey;
  headline: MoneyValue & { scalar: string | null };
  status: OwnerStatus;
  messageKey?: OwnerKey;
  messageParams?: Record<string, string>;
  noteKey?: OwnerKey;
  noteParams?: Record<string, string>;
  components: CardComponent[];
  pendingOn: PendingOn;
  asOf: string;
}

const money = (amountMinor: bigint | null, currency: string | null): MoneyValue => ({
  amountMinor: amountMinor === null ? null : amountMinor.toString(),
  currency,
});

// ── بطاقة ١ · رصيدك اليوم — GL هو السلطة (C6)؛ الكشف البنكي دليل
//    نضارة فقط؛ النطاق غير المثبت اكتماله لا يُنشر «رصيدًا كاملًا» ──
export interface CashCardInput {
  bankComponents: {
    label: string; balanceMinor: bigint; currency: string;
    evidenceDate: string | null;
  }[];
  hasBankMapping: boolean;
  unmappedActiveBankAccounts: number;
  cashOnHand: { balanceMinor: bigint; currency: string } | null;
  baseCurrency: string;
  asOf: string;
}

export function buildCashCard(input: CashCardInput): DashboardCard {
  const components: CardComponent[] = input.bankComponents.map((b) => ({
    label: b.label,
    value: money(b.balanceMinor, b.currency),
    status: 'FINAL',
    ...(b.evidenceDate
      ? { noteKey: 'CASH_BANK_EVIDENCE' as OwnerKey, noteParams: { date: b.evidenceDate } }
      : {}),
  }));
  if (input.cashOnHand) {
    components.push({
      labelKey: 'CASH_ON_HAND_COMPONENT',
      value: money(input.cashOnHand.balanceMinor, input.cashOnHand.currency),
      status: 'FINAL',
    });
  } else {
    components.push({
      labelKey: 'CASH_ON_HAND_COMPONENT',
      value: money(null, null),
      status: 'NOT_CONFIGURED',
      noteKey: 'CASH_ON_HAND_NOT_CONFIGURED',
    });
  }

  if (!input.hasBankMapping && !input.cashOnHand) {
    return {
      cardKey: 'CASH_TODAY', titleKey: 'CARD_CASH_TODAY',
      headline: { amountMinor: null, currency: null, scalar: null },
      status: 'NOT_CONFIGURED', messageKey: 'CASH_NO_BANK_MAPPING',
      components, pendingOn: null, asOf: input.asOf,
    };
  }

  const scopeComplete =
    input.hasBankMapping && input.unmappedActiveBankAccounts === 0 && input.cashOnHand !== null;
  const currencies = new Set<string>([
    ...input.bankComponents.map((b) => b.currency),
    ...(input.cashOnHand ? [input.cashOnHand.currency] : []),
  ]);
  const singleCurrency = currencies.size === 1;

  if (scopeComplete && singleCurrency) {
    const total = input.bankComponents.reduce((a, b) => a + b.balanceMinor, 0n)
      + (input.cashOnHand ? input.cashOnHand.balanceMinor : 0n);
    return {
      cardKey: 'CASH_TODAY', titleKey: 'CARD_CASH_TODAY',
      headline: { ...money(total, [...currencies][0]), scalar: null },
      status: 'FINAL', components, pendingOn: null, asOf: input.asOf,
    };
  }
  // نطاق ناقص أو عملات مختلطة: المكوّنات تُعرض بقيمها — المجموع لا يُدّعى
  return {
    cardKey: 'CASH_TODAY', titleKey: 'CARD_CASH_TODAY',
    headline: { amountMinor: null, currency: null, scalar: null },
    status: 'UNKNOWN', messageKey: 'CASH_SCOPE_INCOMPLETE',
    components, pendingOn: null, asOf: input.asOf,
  };
}

// ── بطاقة ٢ · الربح — لا رقم قبل خريطة التقارير السلطوية (C7) ──
export function buildProfitCard(asOf: string): DashboardCard {
  return {
    cardKey: 'PROFIT_MONTH', titleKey: 'CARD_PROFIT_MONTH',
    headline: { amountMinor: null, currency: null, scalar: null },
    status: 'NOT_CONFIGURED',
    messageKey: 'PROFIT_NOT_READY', noteKey: 'PROFIT_WHY_NOT_READY',
    components: [], pendingOn: 'STAGE_12', asOf,
  };
}

// ── بطاقة ٣ · في الطريق — ثلاثة مكوّنات، الغائب UNKNOWN لا صفر (C8) ──
export interface TransitCardInput {
  gateway: { balanceMinor: bigint; currency: string } | null;
  toBank: { balanceMinor: bigint; currency: string } | null;
  awaited: { balanceMinor: bigint; currency: string };
  settlementDifferenceOpen: boolean;
  asOf: string;
}

export function buildTransitCard(input: TransitCardInput): DashboardCard {
  const comp = (
    labelKey: OwnerKey, v: { balanceMinor: bigint; currency: string } | null,
  ): CardComponent => v
    ? { labelKey, value: money(v.balanceMinor, v.currency), status: 'FINAL' }
    : { labelKey, value: money(null, null), status: 'NOT_CONFIGURED',
        noteKey: 'TRANSIT_COMPONENT_NOT_CONFIGURED' };
  const components = [
    comp('TRANSIT_GATEWAY', input.gateway),
    comp('TRANSIT_TO_BANK', input.toBank),
    comp('TRANSIT_AWAITED', input.awaited),
  ];
  const all = [input.gateway, input.toBank, input.awaited];
  const available = all.filter((v): v is { balanceMinor: bigint; currency: string } => v !== null);
  const complete = available.length === all.length
    && new Set(available.map((v) => v.currency)).size === 1;
  return {
    cardKey: 'MONEY_IN_TRANSIT', titleKey: 'CARD_IN_TRANSIT',
    headline: complete
      ? { ...money(available.reduce((a, v) => a + v.balanceMinor, 0n), available[0].currency), scalar: null }
      : { amountMinor: null, currency: null, scalar: null },
    status: complete ? 'FINAL' : 'UNKNOWN',
    ...(input.settlementDifferenceOpen ? { noteKey: 'TRANSIT_DIFFERENCE_OPEN' as OwnerKey } : {}),
    components, pendingOn: null, asOf: input.asOf,
  };
}

// ── بطاقة ٤ · الصمود — حتمي بأيام؛ يرفض التغطية الناقصة (C10) ──
export interface RunwayCardInput {
  cashScopeFinal: boolean;
  cashMinor: bigint | null;
  currency: string | null;
  windowDays: number | null;
  historyCoveredDays: number | null;
  inflowWindowMinor: bigint;
  outflowWindowMinor: bigint;
  asOf: string;
}

export function buildRunwayCard(input: RunwayCardInput): DashboardCard {
  const base = {
    cardKey: 'RUNWAY' as const, titleKey: 'CARD_RUNWAY' as const,
    components: [] as CardComponent[], pendingOn: null, asOf: input.asOf,
  };
  const empty = { amountMinor: null, currency: null, scalar: null };
  if (input.windowDays === null) {
    return { ...base, headline: empty, status: 'NOT_CONFIGURED', messageKey: 'RUNWAY_NOT_CONFIGURED' };
  }
  if (!input.cashScopeFinal || input.cashMinor === null) {
    return { ...base, headline: empty, status: 'UNKNOWN', messageKey: 'RUNWAY_CASH_INCOMPLETE' };
  }
  if (input.historyCoveredDays === null || input.historyCoveredDays < input.windowDays) {
    return { ...base, headline: empty, status: 'UNKNOWN', messageKey: 'RUNWAY_INSUFFICIENT_HISTORY' };
  }
  const net = input.outflowWindowMinor - input.inflowWindowMinor;
  if (net <= 0n) {
    return {
      ...base, headline: empty, status: 'FINAL', messageKey: 'RUNWAY_NO_BURN',
      noteKey: 'RUNWAY_ASSUMPTION', noteParams: { days: String(input.windowDays) },
    };
  }
  const days = (input.cashMinor * BigInt(input.windowDays)) / net;
  const clamped = days < 0n ? 0n : days;
  return {
    ...base,
    headline: { amountMinor: null, currency: input.currency, scalar: clamped.toString() },
    status: 'FINAL',
    messageKey: 'RUNWAY_DAYS', messageParams: { days: clamped.toString() },
    noteKey: 'RUNWAY_ASSUMPTION', noteParams: { days: String(input.windowDays) },
  };
}

// ── بطاقة ٥ · الالتزامات — صدق النقص؛ لا «ما عليك شيء» بلا برهان ──
export interface ObligationsCardInput {
  recordedPayable: { balanceMinor: bigint; currency: string } | null;
  noTaxRegime: boolean;
  asOf: string;
}

export function buildObligationsCard(input: ObligationsCardInput): DashboardCard {
  const components: CardComponent[] = [];
  if (input.recordedPayable) {
    components.push({
      labelKey: 'OBLIGATIONS_RECORDED',
      value: money(input.recordedPayable.balanceMinor, input.recordedPayable.currency),
      status: 'FINAL',
    });
  }
  return {
    cardKey: 'OBLIGATIONS', titleKey: 'CARD_OBLIGATIONS',
    headline: { amountMinor: null, currency: null, scalar: null },
    status: 'UNKNOWN', messageKey: 'OBLIGATIONS_INCOMPLETE',
    ...(input.noTaxRegime ? { noteKey: 'OBLIGATIONS_NO_TAX_REGIME' as OwnerKey } : {}),
    components, pendingOn: null, asOf: input.asOf,
  };
}

// ── الاستثناء للمالكة — مفاتيح فقط + معرّف الاستثناء الرأي؛
//    لا معرّف حقيقة مهنية يُسلسل هنا أبدًا ──
export type OwnerActionKind =
  | 'ACK'                    // «شفته» — لا يغيّر الحالة أبدًا
  | 'ANSWER_AMBIGUITY'       // جواب المالكة عبر مسار المراجعة المحكوم
  | 'ATTACH_DOCUMENT'        // فتح الالتقاط؛ الشفاء يتحقق منه الخادم
  | 'HANDLED_BY_ACCOUNTANT'; // عرض فقط: القضية عند المحاسبة

export interface InboxItemDTO {
  id: string;
  whatKey: OwnerKey;
  whyKey: OwnerKey;
  params: Record<string, string>;
  priority: ExceptionPriority;
  stateKey: OwnerKey;
  acknowledged: boolean;
  occurrence: number;
  firstDetectedAt: string;
  actions: OwnerActionKind[];
}

export interface ExceptionRowLike {
  id: string;
  exception_type: ExceptionType;
  state: 'OPEN' | 'IN_REVIEW' | 'ESCALATED' | 'RESOLVED';
  owner_params: Record<string, unknown> | null;
  acknowledged_at: string | null;
  occurrence: number;
  first_detected_at: string;
}

const STATE_KEYS: Record<ExceptionRowLike['state'], OwnerKey> = {
  OPEN: 'EXC_STATE_OPEN', IN_REVIEW: 'EXC_STATE_IN_REVIEW',
  ESCALATED: 'EXC_STATE_ESCALATED', RESOLVED: 'EXC_STATE_RESOLVED',
};

export function buildInboxItem(
  row: ExceptionRowLike, viewerRole: string,
): InboxItemDTO {
  const spec = EXCEPTION_REGISTRY[row.exception_type];
  const actions: OwnerActionKind[] = [];
  if (row.state !== 'RESOLVED') {
    if (!row.acknowledged_at) actions.push('ACK');
    // لمسة واحدة بلا تجاوز حوكمة: فقط حيث الدالة المحكومة القائمة
    // تسمح للدور نفسه (لا توسيع صلاحية لأجل UX-011)
    if (row.exception_type === 'PERSONAL_BUSINESS_AMBIGUITY'
        && ['BUSINESS_OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER'].includes(viewerRole)) {
      actions.push('ANSWER_AMBIGUITY');
    } else if (row.exception_type === 'MISSING_DOCUMENT'
        && ['BUSINESS_OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER'].includes(viewerRole)) {
      actions.push('ATTACH_DOCUMENT');
    } else {
      actions.push('HANDLED_BY_ACCOUNTANT');
    }
  }
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.owner_params ?? {})) {
    params[k] = v === null || v === undefined ? '' : String(v);
  }
  return {
    id: row.id,
    whatKey: spec.whatKey as OwnerKey,
    whyKey: spec.whyKey as OwnerKey,
    params,
    priority: spec.priority,
    stateKey: STATE_KEYS[row.state],
    acknowledged: row.acknowledged_at !== null,
    occurrence: row.occurrence,
    firstDetectedAt: row.first_detected_at,
    actions,
  };
}

// ── بطاقة ٦ · يحتاج انتباهك — محروسة بالتغطية (C4) ──
export interface AttentionCardInput {
  openCount: number;
  top: InboxItemDTO[];
  coverage: { allSucceeded: boolean; anyNoCoverage: boolean; anyFailed: boolean };
  asOf: string;
}

export function buildAttentionCard(input: AttentionCardInput): DashboardCard {
  const zero = input.openCount === 0;
  let messageKey: OwnerKey;
  let messageParams: Record<string, string> | undefined;
  if (zero) {
    // C4: لا «كل شيء تمام» — فحوص Stage 13 مؤجلة بنيويًا،
    // والصياغة المعتمدة: «ما عندك شيء عاجل الآن» + ملاحظة هادئة
    messageKey = 'ATTENTION_NONE_URGENT';
  } else if (input.openCount === 1) {
    messageKey = 'ATTENTION_ONE';
  } else {
    messageKey = 'ATTENTION_COUNT';
    messageParams = { count: String(input.openCount) };
  }
  let noteKey: OwnerKey = 'ATTENTION_CHECKS_DEFERRED';
  if (input.coverage.anyFailed) noteKey = 'ATTENTION_CHECKS_INCOMPLETE';
  else if (input.coverage.anyNoCoverage) noteKey = 'ATTENTION_COVERAGE_PARTIAL';
  return {
    cardKey: 'ATTENTION', titleKey: 'CARD_ATTENTION',
    headline: { amountMinor: null, currency: null, scalar: String(input.openCount) },
    status: input.coverage.anyFailed ? 'UNKNOWN' : 'FINAL',
    messageKey, ...(messageParams ? { messageParams } : {}),
    noteKey,
    components: [], pendingOn: null, asOf: input.asOf,
  };
}

// ── شجرة «اشرح أي رقم» (REP-006/007) — سلسلة كاملة بيانيًا،
//    والتسميات مالكة؛ الإسناد تعريف استعلام بنسخة لا نص SQL ──
export interface ExplainNode {
  labelKey?: OwnerKey;
  label?: string;
  value: MoneyValue & { scalar?: string | null };
  status: OwnerStatus;
  asOf: string;
  provenance?: {
    queryDefKey: string;
    params: Record<string, string>;
    sourceIds: string[];
  };
  policy?: { id: string; version: number; status: string } | null;
  noteKey?: OwnerKey;
  noteParams?: Record<string, string>;
  children?: ExplainNode[];
}
