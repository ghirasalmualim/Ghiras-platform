/**
 * غراس للمحاسبة — Stage 10: أنواع محرك المطابقة الحتمي.
 * المطابقة تأكيد تقابل — لا تعديل مبلغ، لا قيد، لا AI (المرحلة 13).
 */

export interface ReconConfig {
  settingsId: string;
  settingsVersion: number;
  autoBp: number;
  reviewBp: number;
  askBp: number;
  dateWindowDays: number;
  /** أوزان الأساس الثابت 10000 — من التهيئة النشطة المنسوخة */
  weights: Record<FactorKey, number>;
}

export type FactorKey =
  | 'EXACT_AMOUNT'
  | 'EXPLICIT_REFERENCE'
  | 'DATE_PROXIMITY'
  | 'COUNTERPARTY_CANONICAL'
  | 'HISTORICAL_CONFIRMED_MAPPING'
  | 'GROUP_PLAUSIBILITY';

export interface BankTxnLite {
  id: string;
  bankAccountId: string;
  amountMinor: bigint;          // موقَّع: + وارد، − صادر (Stage 9)
  currency: string;
  txnDate: string;
  valueDate: string | null;
  descriptionCanon: string;
  reference: string | null;
}

/** عقد المحلّل القانوني الواحد (مرآة acc_recon_resolve_target) */
export interface CandidateTarget {
  kind: 'SETTLEMENT' | 'PAYMENT' | 'INVOICE' | 'REFUND' | 'JOURNAL_ENTRY';
  id: string;
  currency: string;
  direction: 'INFLOW' | 'OUTFLOW';
  eligibleMinor: bigint;
  eventDate: string | null;
  refPrimary: string | null;
  layerKey: string;
  /** اسم قانوني للطرف المقابل إن وُجد (مورّدة/عميلة) للمطابقة الحرفية */
  counterpartyCanon: string | null;
}

export interface FactorEvidence {
  factor_key: FactorKey;
  available: boolean;
  matched: boolean;
  weight_bp: number;
  contribution_bp: number;
  provenance: Record<string, unknown>;
}

export interface ScoreResult {
  scoreBp: number;      // Σ مساهمات المطابق على أساس 10000 الكامل — لا إعادة معايرة
  coverageBp: number;   // Σ أوزان المتاح — يوثّق «غياب الدليل» دون تضخيم
  matchedCount: number;
  factors: FactorEvidence[];
}

export interface AllocationDraft {
  bank_transaction_id: string;
  target_kind: CandidateTarget['kind'];
  target_id: string;
  allocated_minor: string;
  currency: string;
  expected_direction: 'INFLOW' | 'OUTFLOW';
  layer_key: string;
}

export type EngineDecision =
  | {
      kind: 'ASSERT';
      mode: 'AUTO' | 'SUGGESTED';
      matchType: 'ONE_TO_ONE' | 'MANY_TO_ONE' | 'PARTIAL' | 'FEE_DIFFERENCE' | 'DATE_DIFFERENCE';
      score: ScoreResult;
      deterministicOverride: boolean;
      deterministicReference: string | null;
      differenceMinor: bigint | null;
      differenceReason: 'POSSIBLE_FEE' | 'DATE_WINDOW' | null;
      allocations: AllocationDraft[];
    }
  | {
      kind: 'EVENT';
      condition:
        | 'UNMATCHED_BANK_TRANSACTION' | 'AMBIGUOUS_MATCH' | 'LOW_CONFIDENCE_MATCH'
        | 'FX_DIFFERENCE_REVIEW' | 'SUSPECTED_DUPLICATE_HOLD';
      bankTransactionId: string;
      blocking: boolean;
      detail: Record<string, unknown>;
    };
