#!/usr/bin/env node
/**
 * Stage 10 — سلوك المحرك الحتمي محليًا (بلا قاعدة، بلا AI).
 * يثبت: رياضيات score/coverage بلا إعادة معايرة (CORRECTION 1)،
 * تخطّي REC-001، رفض المبلغ-وحده (REC-002)، رفض الاتجاه المعاكس
 * (CORRECTION 2)، حدود التجميع، التصنيفات، والعربية القانونية.
 */
import { decideForTxn, boundedSubsetSum } from '../../src/lib/accounting/recon/engine.ts';
import { scoreCandidate, deterministicOverride, directionCompatible, canonToken, referenceMatches }
  from '../../src/lib/accounting/recon/scoring.ts';
import { RECON_LIMITS } from '../../src/lib/accounting/recon/limits.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const CONFIG = {
  settingsId: 's1', settingsVersion: 1,
  autoBp: 9500, reviewBp: 8000, askBp: 5500, dateWindowDays: 3,
  weights: { EXACT_AMOUNT: 3500, EXPLICIT_REFERENCE: 2500, DATE_PROXIMITY: 1500,
             COUNTERPARTY_CANONICAL: 1000, HISTORICAL_CONFIRMED_MAPPING: 1000, GROUP_PLAUSIBILITY: 500 },
};
const TXN = (over = {}) => ({
  id: 'txn-1', bankAccountId: 'acct-1', amountMinor: 115250n, currency: 'KWD',
  txnDate: '2026-09-05', valueDate: '2026-09-05',
  descriptionCanon: 'MYFATOORAH DEP-2026-09 تسوية البوابة', reference: 'DEP-2026-09', ...over,
});
const TARGET = (over = {}) => ({
  kind: 'SETTLEMENT', id: 'set-1', currency: 'KWD', direction: 'INFLOW',
  eligibleMinor: 115250n, eventDate: '2026-09-05', refPrimary: 'DEP-2026-09',
  layerKey: 'SETTLEMENT:set-1', counterpartyCanon: null, ...over,
});

console.log('\n═══ ١ · CORRECTION 1: score ثابت الأساس + coverage — لا إعادة معايرة ═══');
{
  // عاملان فقط متاحان ومطابقان (مبلغ + تاريخ): score = 3500+1500 = 5000
  const t = TARGET({ refPrimary: null, eventDate: '2026-09-05' });
  const s = scoreCandidate(TXN(), t, CONFIG, []);
  check('score_bp = مجموع المطابق على 10000 الكامل (5000 لا 100%)', s.scoreBp === 5000);
  check('coverage_bp يوثّق المتاح فقط (3500+1500=5000)', s.coverageBp === 5000);
  check('الغائب يساهم صفرًا ولا يُعاد معايرته',
    s.factors.find((f) => f.factor_key === 'EXPLICIT_REFERENCE').available === false
    && s.factors.find((f) => f.factor_key === 'EXPLICIT_REFERENCE').contribution_bp === 0);
  // دليل متاح خالف: المرجع موجود لكنه لا يطابق → التغطية ترتفع والنقاط لا
  const s2 = scoreCandidate(TXN({ reference: 'OTHER', descriptionCanon: 'X' }), TARGET(), CONFIG, []);
  check('«الدليل خالف» ≠ «الدليل غاب»: مرجع متاح غير مطابق يرفع coverage لا score',
    s2.coverageBp >= 7500 && s2.factors.find((f) => f.factor_key === 'EXPLICIT_REFERENCE').matched === false);
  check('كل الأعداد صحيحة (لا float)', Number.isInteger(s.scoreBp) && Number.isInteger(s.coverageBp));
}

console.log('═══ ٢ · REC-001: التخطّي الحتمي لا تُخفّضه العوامل الأضعف ═══');
{
  // مرجع + مبلغ تام، بلا طرف مقابل وبلا تاريخ (score منخفض) → AUTO بالتخطّي
  const t = TARGET({ eventDate: null });
  const d = decideForTxn(TXN(), [t], CONFIG, []);
  check('مرجع صريح + مبلغ تام = AUTO بتخطٍّ حتمي', d.kind === 'ASSERT' && d.mode === 'AUTO'
    && d.deterministicOverride === true && d.deterministicReference === 'DEP-2026-09');
  check('النوع ONE_TO_ONE (تسوية كاملة واحدة — CORRECTION 3)', d.matchType === 'ONE_TO_ONE');
  const det = deterministicOverride(TXN({ currency: 'USD' }), TARGET());
  check('عملة مختلفة تُبطل التخطّي (لا معادلة عددية عبر العملات)', det.override === false);
}

console.log('═══ ٣ · REC-002: المبلغ وحده لا يؤكد ولا يُقترح مرتبطًا ═══');
{
  // مبلغ تام فقط: لا مرجع، لا تاريخ، لا طرف — عامل واحد مطابق
  const t = TARGET({ refPrimary: null, eventDate: null });
  const d = decideForTxn(TXN({ descriptionCanon: 'بلا دلائل', reference: null }), [t], CONFIG, []);
  check('المبلغ وحده → LOW_CONFIDENCE_MATCH (يسأل، لا ربط)',
    d.kind === 'EVENT' && d.condition === 'LOW_CONFIDENCE_MATCH' && d.detail.reason === 'AMOUNT_ONLY');
}

console.log('═══ ٤ · CORRECTION 2: الاتجاه المعاكس مرفوض مهما تساوى المبلغ ═══');
{
  check('هدف OUTFLOW لا يوافق حركة دائنة', directionCompatible(TXN(), TARGET({ direction: 'OUTFLOW' })) === false);
  const d = decideForTxn(TXN(), [TARGET({ direction: 'OUTFLOW' })], CONFIG, []);
  check('بنك +115250 ↔ حدث صادر −115250 = UNMATCHED لا مطابقة',
    d.kind === 'EVENT' && d.condition === 'UNMATCHED_BANK_TRANSACTION');
  const dOut = decideForTxn(TXN({ amountMinor: -40000n, descriptionCanon: 'RF-99 استرداد', reference: 'RF-99' }),
    [TARGET({ kind: 'REFUND', direction: 'OUTFLOW', eligibleMinor: 40000n, refPrimary: 'RF-99', layerKey: 'REFUND:r1' })], CONFIG, []);
  check('مدين البنك يطابق استردادًا صادرًا بمرجعه (تخطٍّ حتمي)',
    dOut.kind === 'ASSERT' && dOut.mode === 'AUTO' && dOut.deterministicOverride === true);
}

console.log('═══ ٥ · العتبات من اللقطة + DATE_DIFFERENCE ═══');
{
  // مرجع غير متاح؛ مبلغ+تاريخ(دلتا 2 داخل النافذة)+طرف مقابل = 3500+1500+1000=6000 → SUGGESTED
  const t = TARGET({ refPrimary: null, eventDate: '2026-09-03', counterpartyCanon: 'شركة غراس' });
  const d = decideForTxn(TXN({ descriptionCanon: 'حوالة من شركة غراس' }), [t], CONFIG, []);
  check('score 6000 ∈ [ask,auto) → SUGGESTED', d.kind === 'ASSERT' && d.mode === 'SUGGESTED'
    && d.score.scoreBp === 6000);
  check('تاريخ مختلف داخل النافذة = DATE_DIFFERENCE بدليله',
    d.matchType === 'DATE_DIFFERENCE' && d.differenceReason === 'DATE_WINDOW');
  // خارج النافذة: التاريخ متاح غير مطابق → 4500 < ask → حدث منخفض الثقة
  const far = decideForTxn(TXN({ descriptionCanon: 'حوالة من شركة غراس' }),
    [TARGET({ refPrimary: null, eventDate: '2026-08-20', counterpartyCanon: 'شركة غراس' })], CONFIG, []);
  check('خارج النافذة يسقط دون العتبة', far.kind === 'EVENT' && far.condition === 'LOW_CONFIDENCE_MATCH');
}

console.log('═══ ٦ · FEE_DIFFERENCE: تصنيف واقتراح فقط ═══');
{
  const t = TARGET({ eligibleMinor: 118250n });   // البنك أدنى بـ3000 (رسوم محتملة)
  const d = decideForTxn(TXN(), [t], CONFIG, []);
  check('مرجع مطابق ومبلغ أدنى = FEE_DIFFERENCE مقترح بفرق موثّق',
    d.kind === 'ASSERT' && d.mode === 'SUGGESTED' && d.matchType === 'FEE_DIFFERENCE'
    && d.differenceMinor === 3000n && d.differenceReason === 'POSSIBLE_FEE');
  check('التخصيص بمبلغ البنك — لا امتصاص للفرق',
    d.allocations[0].allocated_minor === '115250');
}

console.log('═══ ٧ · MANY_TO_ONE محدود + PARTIAL ═══');
{
  const parts = [
    TARGET({ kind: 'PAYMENT', id: 'p1', eligibleMinor: 60000n, refPrimary: null, layerKey: 'PAYMENT:p1', eventDate: '2026-09-05' }),
    TARGET({ kind: 'PAYMENT', id: 'p2', eligibleMinor: 55250n, refPrimary: null, layerKey: 'PAYMENT:p2', eventDate: '2026-09-05' }),
  ];
  const d = decideForTxn(TXN({ reference: null, descriptionCanon: 'إيداع مجمّع' }), parts, CONFIG, []);
  check('مجموعة جمعها تام = MANY_TO_ONE مقترح', d.kind === 'ASSERT' && d.matchType === 'MANY_TO_ONE'
    && d.allocations.length === 2);
  check('عامل معقولية المجموعة حاضر بدليله',
    d.score.factors.find((f) => f.factor_key === 'GROUP_PLAUSIBILITY').matched === true);
  const partial = decideForTxn(TXN({ amountMinor: 50000n, descriptionCanon: 'دفعة جزئية لفاتورة INV-77', reference: 'INV-77' }),
    [TARGET({ kind: 'INVOICE', id: 'i1', eligibleMinor: 80000n, refPrimary: 'INV-77', layerKey: 'INVOICE:i1' })], CONFIG, []);
  check('سعة أكبر بدليل معاضد = PARTIAL مقترح بتخصيص مبلغ البنك',
    partial.kind === 'ASSERT' && partial.matchType === 'PARTIAL'
    && partial.allocations[0].allocated_minor === '50000');
}

console.log('═══ ٨ · حدود السلامة الهندسية: تجاوز = غموض لا يقين مبتور ═══');
{
  const many = Array.from({ length: 24 }, (_, i) =>
    TARGET({ kind: 'PAYMENT', id: 'p' + i, eligibleMinor: BigInt(1000 + i), refPrimary: null, layerKey: 'PAYMENT:p' + i }));
  const r = boundedSubsetSum(many, 999999999n);
  check('subset-sum المحدود يعلن EXCEEDED/null لا نتيجة مبتورة', r === 'EXCEEDED' || r === null);
  const crowded = Array.from({ length: RECON_LIMITS.MAX_CANDIDATES_PER_TXN + 1 }, (_, i) =>
    TARGET({ id: 's' + i, layerKey: 'SETTLEMENT:s' + i }));
  const d = decideForTxn(TXN(), crowded, CONFIG, []);
  check('نافذة مرشحين متجاوزة → AMBIGUOUS_MATCH',
    d.kind === 'EVENT' && d.condition === 'AMBIGUOUS_MATCH');
}

console.log('═══ ٩ · العربية القانونية + FX للمراجعة فقط ═══');
{
  check('canonToken يوحّد العربية بمحارف الاتجاه',
    canonToken('شركة‏ غراس‎ ') === canonToken('شركة غراس'));
  check('مطابقة المرجع رمزًا كاملًا لا جزءًا',
    referenceMatches(TXN({ descriptionCanon: 'DEP-2026-091 أخرى' , reference: null }), 'DEP-2026-09') === false);
  const fx = decideForTxn(TXN({ currency: 'KWD' }),
    [TARGET({ currency: 'USD', eligibleMinor: 375000n, refPrimary: null })], CONFIG, []);
  check('عبر العملات = FX_DIFFERENCE_REVIEW حدثًا — لا تخصيص ولا سعر مخترع',
    fx.kind === 'EVENT' && fx.condition === 'FX_DIFFERENCE_REVIEW');
}

console.log(`\n  محرك المطابقة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
