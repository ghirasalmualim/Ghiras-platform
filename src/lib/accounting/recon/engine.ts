/**
 * غراس للمحاسبة — Stage 10: محرك المطابقة الحتمي.
 *
 * الخط: مرجع حتمي أولًا (REC-001) → تقييم 1↔1 → تجميع محدود
 * MANY_TO_ONE → تصنيف النوع من الأدلة → اختيار الوضع من score_bp
 * الثابت وعتبات اللقطة (REC-002/003) → قرارات تأكيد/اقتراح/حدث.
 * صفر تعديل مبالغ، صفر قيود، صفر AI. القاعدة تعيد التحقق سلطويًا.
 */
import type {
  AllocationDraft, BankTxnLite, CandidateTarget, EngineDecision, ReconConfig, ScoreResult,
} from './types.ts';
import { deterministicOverride, directionCompatible, scoreCandidate } from './scoring.ts';
import type { HistoricalMapping } from './scoring.ts';
import { RECON_LIMITS } from './limits.ts';

const abs = (v: bigint) => (v < 0n ? -v : v);

function draft(txn: BankTxnLite, t: CandidateTarget, amount: bigint): AllocationDraft {
  return {
    bank_transaction_id: txn.id, target_kind: t.kind, target_id: t.id,
    allocated_minor: amount.toString(), currency: t.currency,
    expected_direction: t.direction, layer_key: t.layerKey,
  };
}

function groupFactors(config: ReconConfig, base: ScoreResult, groupSize: number, groupSum: bigint, bankAbs: bigint): ScoreResult {
  // معقولية المجموعة عامل حتمي، وتساوي جمع المجموعة تمامًا هو دليل
  // «المبلغ التام» للمجموعة نفسها — حتمية صرفة لا استدلال
  const factors = base.factors.map((f) => {
    if (f.factor_key === 'GROUP_PLAUSIBILITY')
      return { ...f, available: true, matched: true,
        contribution_bp: f.weight_bp, provenance: { group_size: groupSize } };
    if (f.factor_key === 'EXACT_AMOUNT' && groupSum === bankAbs)
      return { ...f, available: true, matched: true, contribution_bp: f.weight_bp,
        provenance: { group_sum: groupSum.toString(), bank_abs: bankAbs.toString() } };
    return f;
  });
  const scoreBp = factors.reduce((a, f) => a + f.contribution_bp, 0);
  const coverageBp = factors.reduce((a, f) => a + (f.available ? f.weight_bp : 0), 0);
  return { scoreBp, coverageBp, matchedCount: factors.filter((f) => f.matched).length, factors };
}

/**
 * قرار حركة واحدة مقابل مرشحيها القانونيين (نفس الشركة، من المحلّل).
 * حتمي بالكامل؛ يعيد قرارًا واحدًا أو حدث UNMATCHED/AMBIGUOUS.
 */
export function decideForTxn(
  txn: BankTxnLite,
  candidates: readonly CandidateTarget[],
  config: ReconConfig,
  historical: readonly HistoricalMapping[] = [],
): EngineDecision {
  // الاتجاه أولًا (CORRECTION 2) ثم العملة للمقارنة العددية
  const compatible = candidates.filter((c) =>
    directionCompatible(txn, c) && c.eligibleMinor > 0n);
  if (compatible.length > RECON_LIMITS.MAX_CANDIDATES_PER_TXN) {
    return { kind: 'EVENT', condition: 'AMBIGUOUS_MATCH', bankTransactionId: txn.id,
      blocking: false, detail: { reason: 'CANDIDATE_WINDOW_EXCEEDED', count: compatible.length } };
  }
  const sameCur = compatible.filter((c) => c.currency === txn.currency);
  const bankAbs = abs(txn.amountMinor);

  // ١ · REC-001: مرجع حتمي + مبلغ تام — لا تُخفّضه عوامل أضعف
  for (const c of sameCur) {
    const det = deterministicOverride(txn, c);
    if (det.override) {
      const score = scoreCandidate(txn, c, config, historical);
      return {
        kind: 'ASSERT', mode: 'AUTO', matchType: 'ONE_TO_ONE', score,
        deterministicOverride: true, deterministicReference: det.reference,
        differenceMinor: null, differenceReason: null,
        allocations: [draft(txn, c, bankAbs)],
      };
    }
  }

  // ٢ · تقييم 1↔1 بالمبلغ التام
  const exact = sameCur.filter((c) => c.eligibleMinor === bankAbs);
  if (exact.length === 1) {
    const c = exact[0];
    const score = scoreCandidate(txn, c, config, historical);
    const dateFactor = score.factors.find((f) => f.factor_key === 'DATE_PROXIMITY')!;
    const isDateDiff = dateFactor.available && dateFactor.matched
      && (dateFactor.provenance.delta_days as number) > 0;
    const alloc = [draft(txn, c, bankAbs)];
    // REC-002 بنيويًا: المبلغ وحده لا يتجاوز نطاق «يسأل» مهما بلغ الرقم
    if (score.matchedCount < 2) {
      return { kind: 'EVENT', condition: 'LOW_CONFIDENCE_MATCH', bankTransactionId: txn.id,
        blocking: false, detail: { reason: 'AMOUNT_ONLY', candidate: c.layerKey,
          score_bp: score.scoreBp, coverage_bp: score.coverageBp } };
    }
    if (score.scoreBp >= config.autoBp) {
      return { kind: 'ASSERT', mode: 'AUTO',
        matchType: isDateDiff ? 'DATE_DIFFERENCE' : 'ONE_TO_ONE', score,
        deterministicOverride: false, deterministicReference: null,
        differenceMinor: null, differenceReason: isDateDiff ? 'DATE_WINDOW' : null,
        allocations: alloc };
    }
    if (score.scoreBp >= config.askBp) {
      return { kind: 'ASSERT', mode: 'SUGGESTED',
        matchType: isDateDiff ? 'DATE_DIFFERENCE' : 'ONE_TO_ONE', score,
        deterministicOverride: false, deterministicReference: null,
        differenceMinor: null, differenceReason: isDateDiff ? 'DATE_WINDOW' : null,
        allocations: alloc };
    }
    return { kind: 'EVENT', condition: 'LOW_CONFIDENCE_MATCH', bankTransactionId: txn.id,
      blocking: false, detail: { score_bp: score.scoreBp, coverage_bp: score.coverageBp } };
  }
  if (exact.length > 1) {
    return { kind: 'EVENT', condition: 'AMBIGUOUS_MATCH', bankTransactionId: txn.id,
      blocking: false, detail: { exact_candidates: exact.map((c) => c.layerKey) } };
  }

  // ٣ · فرق رسوم محتمل: سياق التسوية/البوابة حصرًا (الرسوم دلالة
  //     المزوّد الصافي) — مرجع حتمي مطابق ومبلغ البنك أدنى؛ تصنيف فقط.
  //     غير التسوية بمرجع ومبلغ أدنى = دفعة جزئية طبيعية لا رسوم.
  const feeCand = sameCur.find((c) =>
    c.kind === 'SETTLEMENT'
    && c.eligibleMinor > bankAbs
    && scoreCandidate(txn, c, config, historical).factors
        .some((f) => f.factor_key === 'EXPLICIT_REFERENCE' && f.matched));
  if (feeCand) {
    const score = scoreCandidate(txn, feeCand, config, historical);
    return { kind: 'ASSERT', mode: 'SUGGESTED', matchType: 'FEE_DIFFERENCE', score,
      deterministicOverride: false, deterministicReference: feeCand.refPrimary,
      differenceMinor: feeCand.eligibleMinor - bankAbs, differenceReason: 'POSSIBLE_FEE',
      allocations: [draft(txn, feeCand, bankAbs)] };
  }

  // ٤ · جزئي: مرشح واحد سعته أكبر وبدليل معاضد
  const partials = sameCur.filter((c) => c.eligibleMinor > bankAbs);
  if (partials.length === 1) {
    const score = scoreCandidate(txn, partials[0], config, historical);
    if (score.matchedCount >= 1 && score.factors.some((f) =>
        f.matched && f.factor_key !== 'EXACT_AMOUNT')) {
      return { kind: 'ASSERT', mode: 'SUGGESTED', matchType: 'PARTIAL', score,
        deterministicOverride: false, deterministicReference: null,
        differenceMinor: null, differenceReason: null,
        allocations: [draft(txn, partials[0], bankAbs)] };
    }
  }

  // ٥ · تجميع محدود MANY_TO_ONE: مجموعة أهداف جمعها = مبلغ البنك تمامًا
  const group = boundedSubsetSum(sameCur, bankAbs);
  if (group === 'EXCEEDED') {
    return { kind: 'EVENT', condition: 'AMBIGUOUS_MATCH', bankTransactionId: txn.id,
      blocking: false, detail: { reason: 'COMBINATION_LIMIT_EXCEEDED' } };
  }
  if (group && group.length > 1) {
    const base = scoreCandidate(txn, group[0], config, historical);
    const groupSum = group.reduce((a, c) => a + c.eligibleMinor, 0n);
    const score = groupFactors(config, base, group.length, groupSum, bankAbs);
    if (score.matchedCount >= 2 && score.scoreBp >= config.askBp) {
      return { kind: 'ASSERT', mode: 'SUGGESTED', matchType: 'MANY_TO_ONE', score,
        deterministicOverride: false, deterministicReference: null,
        differenceMinor: null, differenceReason: null,
        allocations: group.map((c) => draft(txn, c, c.eligibleMinor)) };
    }
  }

  // ٦ · عبر العملات بحقائق صرف قائمة فقط → مراجعة FX (لا تخصيص رقمي)
  const cross = compatible.find((c) => c.currency !== txn.currency);
  if (cross) {
    return { kind: 'EVENT', condition: 'FX_DIFFERENCE_REVIEW', bankTransactionId: txn.id,
      blocking: false, detail: { candidate: cross.layerKey, bank_currency: txn.currency,
        target_currency: cross.currency, note: 'requires persisted FX facts — no invented rate' } };
  }

  return { kind: 'EVENT', condition: 'UNMATCHED_BANK_TRANSACTION', bankTransactionId: txn.id,
    blocking: false, detail: { candidates_considered: compatible.length } };
}

/** subset-sum محدود حتميًا — تجاوز الحدود = 'EXCEEDED' لا نتيجة مبتورة */
export function boundedSubsetSum(
  candidates: readonly CandidateTarget[], target: bigint,
): CandidateTarget[] | null | 'EXCEEDED' {
  const items = candidates.slice(0, RECON_LIMITS.MAX_CANDIDATES_PER_TXN);
  let combos = 0;
  let found: CandidateTarget[] | null = null;
  const walk = (idx: number, sum: bigint, picked: CandidateTarget[]): boolean => {
    combos++;
    if (combos > RECON_LIMITS.MAX_COMBINATIONS_PER_TXN) return true; // تجاوز
    if (sum === target && picked.length >= 2) { found = [...picked]; return false; }
    if (sum > target || idx >= items.length
        || picked.length >= RECON_LIMITS.MAX_GROUP_MEMBERS) return false;
    if (walk(idx + 1, sum + items[idx].eligibleMinor, [...picked, items[idx]])) return true;
    if (found) return false;
    return walk(idx + 1, sum, picked);
  };
  const exceeded = walk(0, 0n, []);
  if (exceeded) return 'EXCEEDED';
  return found;
}
