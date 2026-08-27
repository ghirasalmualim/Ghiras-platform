/**
 * غراس للمحاسبة — Stage 10: التقييم الحتمي الدقيق (CORRECTION 1).
 *
 * score_bp = مجموع مساهمات العوامل **المطابقة** على أساس 10000 الكامل —
 * العامل غير المتاح يساهم صفرًا (غياب الدليل لا يرفع الثقة أبدًا)،
 * ولا إعادة معايرة على المتاح. coverage_bp = مجموع أوزان المتاح —
 * يميّز «الدليل خالف» عن «الدليل غاب». أعداد صحيحة صرفة، لا float.
 *
 * REC-001 يُحل بالتخطّي الحتمي (مرجع صريح + مبلغ تام + نفس العملة) —
 * لا بتضخيم الرياضيات.
 */
import type {
  BankTxnLite, CandidateTarget, FactorEvidence, FactorKey, ReconConfig, ScoreResult,
} from './types.ts';

/** التطبيع القانوني الحتمي — مرآة Stage 9 (لا fuzzy، لا AI) */
export function canonToken(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** مطابقة مرجع صارمة: تساوي رمزًا كاملًا داخل الحقول المرجعية — لا fuzzy */
export function referenceMatches(txn: BankTxnLite, ref: string | null): boolean {
  if (!ref) return false;
  const needle = canonToken(ref);
  if (needle === '') return false;
  const hay = [txn.reference ?? '', txn.descriptionCanon]
    .map(canonToken)
    .join(' ');
  return hay.split(/[^A-Z0-9؀-ۿ-]+/).includes(needle);
}

const dayDiff = (a: string, b: string): number =>
  Math.abs(Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000));

export interface HistoricalMapping {
  /** خرائط مؤكدة سابقة (CONFIRMED/LOCKED حصرًا) بنفس الشركة/الاتجاه/العملة */
  counterpartyToken: string;
  targetKind: CandidateTarget['kind'];
  priorReconciliationIds: string[];
}

/** تقييم مرشح 1↔1 — كل عامل: متاح؟ طابق؟ بوزنه الثابت */
export function scoreCandidate(
  txn: BankTxnLite, target: CandidateTarget, config: ReconConfig,
  historical: readonly HistoricalMapping[],
): ScoreResult {
  const w = config.weights;
  const factors: FactorEvidence[] = [];
  const add = (key: FactorKey, available: boolean, matched: boolean, provenance: Record<string, unknown>) => {
    const weight = w[key] ?? 0;
    factors.push({
      factor_key: key, available, matched: available && matched,
      weight_bp: weight,
      contribution_bp: available && matched ? weight : 0,
      provenance,
    });
  };

  // ١ · المبلغ التام بكامل الدقة وبنفس العملة (المقارنة العددية لا تعبر العملات)
  const sameCurrency = txn.currency === target.currency;
  const absAmount = txn.amountMinor < 0n ? -txn.amountMinor : txn.amountMinor;
  add('EXACT_AMOUNT', sameCurrency,
    sameCurrency && absAmount === target.eligibleMinor,
    { bank_abs: absAmount.toString(), target: target.eligibleMinor.toString(), currency: txn.currency });

  // ٢ · المرجع الحتمي الصريح
  const refAvailable = target.refPrimary !== null && target.refPrimary !== '';
  const refMatched = refAvailable && referenceMatches(txn, target.refPrimary);
  add('EXPLICIT_REFERENCE', refAvailable, refMatched,
    { reference: target.refPrimary, layer: target.layerKey });

  // ٣ · قرب التاريخ داخل النافذة المهيّأة (لا استبدال تواريخ غائبة)
  const bankDate = txn.valueDate ?? txn.txnDate;
  const dateAvailable = target.eventDate !== null;
  const delta = dateAvailable ? dayDiff(bankDate, target.eventDate!) : null;
  add('DATE_PROXIMITY', dateAvailable,
    dateAvailable && delta! <= config.dateWindowDays,
    { bank_date: bankDate, target_date: target.eventDate, delta_days: delta, window: config.dateWindowDays });

  // ٤ · الطرف المقابل: تساوٍ قانوني حرفي فقط — الضبابي للمرحلة 13
  const cpAvailable = !!target.counterpartyCanon && target.counterpartyCanon !== '';
  add('COUNTERPARTY_CANONICAL', cpAvailable,
    cpAvailable && canonToken(txn.descriptionCanon).includes(canonToken(target.counterpartyCanon!)),
    { counterparty: target.counterpartyCanon });

  // ٥ · الخريطة التاريخية المؤكدة (حتمية: CONFIRMED/LOCKED سابقة فقط)
  const hist = historical.find((h) =>
    h.targetKind === target.kind
    && canonToken(txn.descriptionCanon).includes(h.counterpartyToken));
  add('HISTORICAL_CONFIRMED_MAPPING', historical.length > 0, !!hist,
    hist ? { prior_reconciliations: hist.priorReconciliationIds } : {});

  // ٦ · معقولية المجموعة — يضبطها مسار التجميع؛ في 1↔1 غير متاحة
  add('GROUP_PLAUSIBILITY', false, false, {});

  const scoreBp = factors.reduce((a, f) => a + f.contribution_bp, 0);
  const coverageBp = factors.reduce((a, f) => a + (f.available ? f.weight_bp : 0), 0);
  return { scoreBp, coverageBp, matchedCount: factors.filter((f) => f.matched).length, factors };
}

/** REC-001: مرجع حتمي + مبلغ تام + نفس العملة = تخطٍّ حتمي */
export function deterministicOverride(
  txn: BankTxnLite, target: CandidateTarget,
): { override: boolean; reference: string | null } {
  const absAmount = txn.amountMinor < 0n ? -txn.amountMinor : txn.amountMinor;
  const ok = txn.currency === target.currency
    && absAmount === target.eligibleMinor
    && referenceMatches(txn, target.refPrimary);
  return { override: ok, reference: ok ? target.refPrimary : null };
}

/** توافق الاتجاه (CORRECTION 2): دائن البنك وارد، مدينه صادر */
export function directionCompatible(txn: BankTxnLite, target: CandidateTarget): boolean {
  if (target.direction === 'INFLOW') return txn.amountMinor > 0n;
  if (target.direction === 'OUTFLOW') return txn.amountMinor < 0n;
  return false;
}
