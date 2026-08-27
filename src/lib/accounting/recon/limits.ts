/**
 * غراس للمحاسبة — Stage 10: حدود أمان هندسية للمحرك.
 * ⚠️ هذه ENGINEERING SAFETY LIMITS — سلامة موارد حتمية قابلة للاختبار،
 * ليست سياسة محاسبية ولا قيمًا تنظيمية. تجاوزها = MANUAL/AMBIGUOUS —
 * لا تُختار نتيجة بحث مبتور كيقين أبدًا.
 */
export const RECON_LIMITS = {
  MAX_CANDIDATES_PER_TXN: 25,
  MAX_GROUP_MEMBERS: 6,
  MAX_COMBINATIONS_PER_TXN: 5_000,
  MAX_TXNS_PER_RUN: 5_000,
} as const;
