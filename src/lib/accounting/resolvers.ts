/**
 * غراس للمحاسبة — المحلّلات الحتمية (STAGE 2 · Part H)
 *
 * حتمية صرفة: لا AI، لا شبكة، لا افتراض «تاريخ اليوم» حين يُعطى
 * تاريخ تاريخي، ولا سقوط صامت إلى «الأحدث». كل نتيجة تحمل النسخة
 * الدقيقة المستخدمة، وغياب ما يسري نتيجة صريحة لا استثناء صامت.
 */
import type {
  PolicyStatus,
  PolicyVersion,
  RegulatoryRuleVersion,
  RuleStatus,
  TaxResolution,
} from './registerTypes';
import { taxResolution } from './registerTypes';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertIsoDate(d: string, what: string): void {
  if (typeof d !== 'string' || !ISO_DATE.test(d)) {
    throw new Error(`${what} must be an ISO date string (YYYY-MM-DD), got: ${String(d)}`);
  }
}

/** سريان نطاق [from..to] على تاريخ — null from = بلا بداية، null to = مفتوح */
function inRange(asOf: string, from: string | null, to: string | null): boolean {
  return (from === null || from <= asOf) && (to === null || asOf <= to);
}

// ─── حدود القواعد بدقة معلنة (FIX 2) — لا يوم مخترعًا لدقة YEAR ───
import type { RuleBound } from './registerTypes';

type BoundPos = 'STARTED' | 'NOT_YET' | 'IMPRECISE';
function fromPos(asOf: string, b: RuleBound): BoundPos {
  const y = Number(asOf.slice(0, 4));
  switch (b.precision) {
    case 'DAY':  return b.date! <= asOf ? 'STARTED' : 'NOT_YET';
    case 'YEAR': return y > b.year! ? 'STARTED' : y === b.year! ? 'IMPRECISE' : 'NOT_YET';
    default:     return 'STARTED'; // NONE/UNKNOWN: لا حدّ قابل للمقارنة — الحالة تحكم
  }
}
type EndPos = 'OPEN' | 'ENDED' | 'IMPRECISE';
function toPos(asOf: string, b: RuleBound): EndPos {
  const y = Number(asOf.slice(0, 4));
  switch (b.precision) {
    case 'DAY':  return asOf <= b.date! ? 'OPEN' : 'ENDED';
    case 'YEAR': return y < b.year! ? 'OPEN' : y === b.year! ? 'IMPRECISE' : 'ENDED';
    default:     return 'OPEN';
  }
}

// ─── ١ · محلّل السياسات (ACC-009/010/017/018) ───

export type ResolutionMode = 'PRODUCTION' | 'SANDBOX';

export type PolicyResolution =
  | {
      readonly found: true;
      readonly policyId: string;
      readonly version: number;
      readonly status: PolicyStatus;
      readonly treatment: string;
      readonly scope: 'COMPANY' | 'GLOBAL_TEMPLATE';
      /** ACC-018: كل ما ليس APPROVED مؤقت وموسوم */
      readonly isProvisional: boolean;
      /** ACC-010: الإنتاج لا يحكمه إلا APPROVED */
      readonly governsProduction: boolean;
      readonly mode: ResolutionMode;
    }
  | {
      readonly found: false;
      readonly policyId: string;
      readonly reason:
        | 'NO_POLICY_IN_EFFECT_AT_DATE'   // نسخ موجودة لكن لا شيء يسري بذلك التاريخ — لا سقوط للأحدث
        | 'UNKNOWN_POLICY'
        | 'NO_APPROVED_POLICY_FOR_PRODUCTION'; // إنتاج + كل الساري غير معتمد
      readonly mode: ResolutionMode;
    };

export function resolvePolicy(
  policies: readonly PolicyVersion[],
  args: { companyId: string; policyId: string; asOf: string; mode: ResolutionMode }
): PolicyResolution {
  assertIsoDate(args.asOf, 'asOf');
  const all = policies.filter((p) => p.policyId === args.policyId);
  if (all.length === 0) {
    return { found: false, policyId: args.policyId, reason: 'UNKNOWN_POLICY', mode: args.mode };
  }

  // نسخة الشركة تسبق القالب العام — تاريخ شركة A لا تغيره شركة B أبدًا (Part D)
  const companyRows = all.filter((p) => p.companyId === args.companyId);
  const pool = companyRows.length > 0 ? companyRows : all.filter((p) => p.companyId === null);
  const scope: 'COMPANY' | 'GLOBAL_TEMPLATE' = companyRows.length > 0 ? 'COMPANY' : 'GLOBAL_TEMPLATE';

  // الساري بالتاريخ المطلوب حصرًا؛ قالب بلا effective_from = اقتراح قائم يصلح
  // للمعاينة بأي تاريخ لكنه غير معتمد بطبيعته
  const effective = pool.filter((p) => inRange(args.asOf, p.effectiveFrom, p.effectiveTo));
  if (effective.length === 0) {
    return { found: false, policyId: args.policyId, reason: 'NO_POLICY_IN_EFFECT_AT_DATE', mode: args.mode };
  }
  // أعلى نسخة **من بين الساري فقط** — الأحدث غير الساري لا يُلتفت إليه
  const chosen = effective.reduce((a, b) => (b.version > a.version ? b : a));

  const approved = chosen.status === 'APPROVED';
  if (args.mode === 'PRODUCTION' && !(approved && scope === 'COMPANY')) {
    // الإنتاج لا يحكمه إلا نسخة **شركةٍ** معتمدة — القالب العام اقتراح
    // إلى الأبد ولا يحكم الإنتاج مهما كانت حالته (ACC-010 + Part D)
    return {
      found: false,
      policyId: args.policyId,
      reason: 'NO_APPROVED_POLICY_FOR_PRODUCTION',
      mode: args.mode,
    };
  }
  return {
    found: true,
    policyId: chosen.policyId,
    version: chosen.version,
    status: chosen.status,
    treatment: chosen.treatment,
    scope,
    isProvisional: !approved,
    governsProduction: approved && args.mode === 'PRODUCTION' && scope === 'COMPANY',
    mode: args.mode,
  };
}

// ─── ٢ · محلّل القواعد التنظيمية (REG-002/003) ───

export interface RuleResolution {
  readonly found: boolean;
  readonly ruleId: string;
  readonly version: number | null;
  readonly status: RuleStatus | null;
  readonly requirement: string | null;
  /** ساريةٌ فعلًا بالتاريخ المطلوب — ACTIVE وداخل نطاقها فقط */
  readonly inForce: boolean;
  /** REG-003: DRAFT/BLOCKED جاهزية بيانات فقط — لا حساب أبدًا */
  readonly mayCompute: boolean;
  readonly readinessOnly: boolean;
  /** FIX 2: الحدّ بدقة YEAR والتاريخ داخل تلك السنة — لبس صريح لا يوم مخترع */
  readonly dateImprecise: boolean;
  readonly asOf: string;
  readonly note: string | null;
}

export function resolveRule(
  rules: readonly RegulatoryRuleVersion[],
  ruleId: string,
  asOf: string
): RuleResolution {
  assertIsoDate(asOf, 'asOf');
  const versions = rules.filter((r) => r.ruleId === ruleId);
  if (versions.length === 0) {
    return { found: false, ruleId, version: null, status: null, requirement: null, inForce: false, mayCompute: false, readinessOnly: false, dateImprecise: false, asOf, note: 'UNKNOWN_RULE' };
  }
  // النسخة المستخدمة تاريخيًا: أعلى نسخة نطاقها يشمل التاريخ — واللبس
  // السنوي يُعرض لبسًا صريحًا لا سريانًا. لا سقوط للأحدث المستقبلي.
  const positioned = versions.map((r) => ({ r, from: fromPos(asOf, r.effectiveFrom), to: toPos(asOf, r.effectiveTo) }));
  const applicable = positioned.filter((p) => p.from !== 'NOT_YET' && p.to !== 'ENDED');
  if (applicable.length === 0) {
    // لا نسخة سارية بالتاريخ — نُظهر أقرب مستقبلية كمعلومة لا كسريان
    const futures = positioned.filter((p) => p.from === 'NOT_YET');
    const future = futures.length > 0 ? futures.reduce((a, b) => (b.r.version > a.r.version ? b : a)).r : null;
    return {
      found: future !== null,
      ruleId,
      version: future?.version ?? null,
      status: future?.status ?? null,
      requirement: future?.requirement ?? null,
      inForce: false,
      mayCompute: false,
      readinessOnly: future ? future.status === 'DRAFT' || future.status === 'BLOCKED' : false,
      dateImprecise: false,
      asOf,
      note: future ? `NOT_YET_EFFECTIVE (from ${future.effectiveFromText})` : 'NO_VERSION_EFFECTIVE_AT_DATE',
    };
  }
  const chosen = applicable.reduce((a, b) => (b.r.version > a.r.version ? b : a));
  const readiness = chosen.r.status === 'DRAFT' || chosen.r.status === 'BLOCKED';
  const imprecise = chosen.from === 'IMPRECISE' || chosen.to === 'IMPRECISE';
  // السريان يتطلب يقينًا: ACTIVE **وبلا لبس** — داخل سنة غامضة لا نزعم سريانًا
  const inForce = chosen.r.status === 'ACTIVE' && !imprecise;
  return {
    found: true,
    ruleId,
    version: chosen.r.version,
    status: chosen.r.status,
    requirement: chosen.r.requirement,
    inForce,
    mayCompute: inForce, // ACTIVE ويقين النطاق فقط؛ DRAFT/BLOCKED/PENDING/لبس أبدًا
    readinessOnly: readiness,
    dateImprecise: imprecise,
    asOf,
    note: imprecise
      ? 'EFFECTIVE_DATE_IMPRECISE (YEAR precision — no invented day)'
      : readiness ? 'DATA_READINESS_ONLY (REG-003)'
      : chosen.r.status === 'PENDING' ? 'PENDING_NOT_ACTIVE' : null,
  };
}

// ─── ٣ · محلّل نظام الضريبة (TAX-001..004) ───

/**
 * الكويت اليوم: NO_TAX_REGIME عبر REG-KW-008 — **ليست** ZERO_RATED
 * وليست TAXABLE بنسبة صفر. غياب النظام حالة أولى مستقلة (TAX-002:
 * النتيجة الفارغة نتيجة صحيحة).
 */
export function resolveVatStatus(
  rules: readonly RegulatoryRuleVersion[],
  jurisdiction: 'KW',
  asOf: string
): TaxResolution {
  assertIsoDate(asOf, 'asOf');
  void jurisdiction; // نطاق واحد اليوم؛ التوسع لاحق عبر السجل لا بترميز صلب
  const r = resolveRule(rules, 'REG-KW-008', asOf);
  if (r.found && r.inForce) {
    return taxResolution({
      status: 'NO_TAX_REGIME',
      rate: null, // لا نسبة أصلًا — الحالة ليست نسبة (TAX-001)
      ruleId: 'REG-KW-008',
      ruleVersion: r.version,
      ruleStatus: r.status,
      asOf,
      mayCompute: false, // لا حساب VAT — لا نظام قائمًا
      note: 'No VAT regime exists in Kuwait — status is NO_TAX_REGIME, not ZERO_RATED and not a zero rate',
    });
  }
  // القاعدة غير سارية بالتاريخ المطلوب — نتيجة صريحة لا افتراض
  return taxResolution({
    status: 'OUT_OF_SCOPE',
    rate: null,
    ruleId: null,
    ruleVersion: null,
    ruleStatus: null,
    asOf,
    mayCompute: false,
    note: 'NO_RULE_RESOLVES_VAT_AT_DATE — explicit absence, no fallback',
  });
}

/**
 * ضريبة أرباح الأعمال (REG-KW-010) والاستقطاع (REG-KW-011) —
 * كلاهما DRAFT: جاهزية بيانات فقط، **صفر حساب** (TAX-004).
 * لا كيان Vendor هنا — التقاط residency/withholding على المورد يصبح
 * قابلًا للإنفاذ حين يُبنى Vendor في مرحلته (تسلسل التنفيذ محفوظ)؛
 * مفردات الحالة جاهزة في registerTypes (TAX-003 foundation).
 */
export function resolveDraftTaxReadiness(
  rules: readonly RegulatoryRuleVersion[],
  ruleId: 'REG-KW-010' | 'REG-KW-011',
  asOf: string
): RuleResolution {
  const r = resolveRule(rules, ruleId, asOf);
  if (r.mayCompute) {
    // حارس بنيوي: لو تغيرت البذرة يومًا فلن يمر حساب من هنا بصمت
    throw new Error(`${ruleId} resolved as computable — draft tax rules must never compute (TAX-004)`);
  }
  return r;
}
