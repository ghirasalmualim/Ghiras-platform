/**
 * غراس للمحاسبة — Stage 11: سجل الاستثناءات القانوني المغلق.
 *
 * عشرة أنواع بترتيب الـBlueprint الثابت وأولوية منتجٍ مقفولة —
 * لا يحرّرها مستأجر ولا واجهة. حالة الكشف الإنتاجي صريحة لكل نوع:
 * LIVE_DETERMINISTIC / LIVE_HUMAN_FLAGGED / CONDITIONAL_COVERAGE /
 * PENDING_STAGE_13 — ولا «كاشف» مُخترع لنوعٍ بلا أساس حتمي.
 * المرآة الـSQL: acc_exception_priority() — عقد ثابت يفحصه الاختبار.
 */

export const EXCEPTION_TYPES = [
  'SETTLEMENT_DIFFERENCE',
  'PERIOD_CLOSE_ISSUE',
  'MISSING_WEBHOOK',
  'UNMATCHED_BANK_TRANSACTION',
  'FAILED_REFUND',
  'LARGE_UNUSUAL_EXPENSE',
  'PERSONAL_BUSINESS_AMBIGUITY',
  'SUSPECTED_DUPLICATE',
  'UNKNOWN_EXPENSE',
  'MISSING_DOCUMENT',
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export type ExceptionPriority =
  | 'CRITICAL' | 'ACTION_REQUIRED' | 'INFORMATIONAL' | 'ROUTINE';

export type DetectionStatus =
  | 'LIVE_DETERMINISTIC'    // كاشف حتمي إنتاجي يعمل الآن
  | 'LIVE_HUMAN_FLAGGED'    // الحقيقة يرفعها بشر عبر مسار محكوم قائم
  | 'CONDITIONAL_COVERAGE'  // حتمي لكن مشروط بتغطية (جولة استرداد/مطابقة)
  | 'PENDING_STAGE_13';     // لا كاشف إنتاجي قبل Stage 13 — يُرفض بنيويًا

export interface ExceptionSpec {
  /** ترتيب الـBlueprint 1..10 — للعرض المستقر داخل نفس الأولوية */
  order: number;
  priority: ExceptionPriority;
  detection: DetectionStatus;
  /** مفاتيح رسالة المالكة (تُترجم في طبقة المفردات الواحدة حصرًا) */
  whatKey: string;
  whyKey: string;
  /** مفاتيح الأفعال المغلقة — مرآة مصفوفة acc_exception_resolve */
  actionKeys: readonly string[];
}

export const EXCEPTION_REGISTRY: Record<ExceptionType, ExceptionSpec> = {
  SETTLEMENT_DIFFERENCE: {
    order: 1, priority: 'CRITICAL', detection: 'LIVE_DETERMINISTIC',
    whatKey: 'EXC_SETTLEMENT_DIFF_WHAT', whyKey: 'EXC_SETTLEMENT_DIFF_WHY',
    actionKeys: ['PROVIDER_CORRECTION_RECORDED'],
  },
  PERIOD_CLOSE_ISSUE: {
    order: 2, priority: 'CRITICAL', detection: 'LIVE_DETERMINISTIC',
    whatKey: 'EXC_PERIOD_CLOSE_WHAT', whyKey: 'EXC_PERIOD_CLOSE_WHY',
    actionKeys: ['PERIOD_STATE_ADVANCED'],
  },
  MISSING_WEBHOOK: {
    order: 3, priority: 'CRITICAL', detection: 'CONDITIONAL_COVERAGE',
    whatKey: 'EXC_MISSING_WEBHOOK_WHAT', whyKey: 'EXC_MISSING_WEBHOOK_WHY',
    actionKeys: ['RECOVERED_EVENT_PROCESSED'],
  },
  UNMATCHED_BANK_TRANSACTION: {
    order: 4, priority: 'ACTION_REQUIRED', detection: 'CONDITIONAL_COVERAGE',
    whatKey: 'EXC_UNMATCHED_BANK_WHAT', whyKey: 'EXC_UNMATCHED_BANK_WHY',
    actionKeys: ['RECONCILIATION_CONFIRMED', 'MARKED_DUPLICATE'],
  },
  FAILED_REFUND: {
    order: 5, priority: 'ACTION_REQUIRED', detection: 'LIVE_DETERMINISTIC',
    whatKey: 'EXC_FAILED_REFUND_WHAT', whyKey: 'EXC_FAILED_REFUND_WHY',
    actionKeys: ['REFUND_RETRIED', 'REFUND_CANCELLED'],
  },
  LARGE_UNUSUAL_EXPENSE: {
    order: 6, priority: 'ACTION_REQUIRED', detection: 'PENDING_STAGE_13',
    whatKey: 'EXC_LARGE_EXPENSE_WHAT', whyKey: 'EXC_LARGE_EXPENSE_WHY',
    actionKeys: ['OWNER_CONFIRMED_EXPECTED'],
  },
  PERSONAL_BUSINESS_AMBIGUITY: {
    order: 7, priority: 'ACTION_REQUIRED', detection: 'LIVE_HUMAN_FLAGGED',
    whatKey: 'EXC_AMBIGUITY_WHAT', whyKey: 'EXC_AMBIGUITY_WHY',
    actionKeys: ['REVIEW_RESOLVED'],
  },
  SUSPECTED_DUPLICATE: {
    order: 8, priority: 'INFORMATIONAL', detection: 'LIVE_DETERMINISTIC',
    whatKey: 'EXC_SUSPECTED_DUP_WHAT', whyKey: 'EXC_SUSPECTED_DUP_WHY',
    actionKeys: ['REVIEW_RESOLVED', 'MARKED_DISTINCT', 'MARKED_DUPLICATE'],
  },
  UNKNOWN_EXPENSE: {
    order: 9, priority: 'ROUTINE', detection: 'PENDING_STAGE_13',
    whatKey: 'EXC_UNKNOWN_EXPENSE_WHAT', whyKey: 'EXC_UNKNOWN_EXPENSE_WHY',
    actionKeys: ['CLASSIFICATION_ANSWERED'],
  },
  MISSING_DOCUMENT: {
    order: 10, priority: 'ROUTINE', detection: 'LIVE_DETERMINISTIC',
    whatKey: 'EXC_MISSING_DOC_WHAT', whyKey: 'EXC_MISSING_DOC_WHY',
    actionKeys: ['DOCUMENT_ATTACHED', 'NO_DOCUMENT_REASONED'],
  },
};

/** ترتيب الأولوية للفرز — الأعلى إلحاحًا أولًا */
export const PRIORITY_RANK: Record<ExceptionPriority, number> = {
  CRITICAL: 0, ACTION_REQUIRED: 1, INFORMATIONAL: 2, ROUTINE: 3,
};

/** الأنواع التي يرفض استيعابها الإنتاجي بنيويًا حتى Stage 13 */
export const PENDING_STAGE_13_TYPES: readonly ExceptionType[] =
  EXCEPTION_TYPES.filter((t) => EXCEPTION_REGISTRY[t].detection === 'PENDING_STAGE_13');

export function sortOpenExceptions<T extends {
  exception_type: ExceptionType; first_detected_at: string;
}>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = EXCEPTION_REGISTRY[a.exception_type];
    const rb = EXCEPTION_REGISTRY[b.exception_type];
    const pr = PRIORITY_RANK[ra.priority] - PRIORITY_RANK[rb.priority];
    if (pr !== 0) return pr;
    if (ra.order !== rb.order) return ra.order - rb.order;
    return a.first_detected_at < b.first_detected_at ? -1 : 1;
  });
}
