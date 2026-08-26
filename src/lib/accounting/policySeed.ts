/**
 * بذرة سجل السياسات — §17 من الـMASTER BLUEPRINT v1.0 **حرفيًا**.
 * هذه اقتراحات بانتظار موافقة بشرية — لا شيء هنا APPROVED، ولا
 * يجوز لأي كود أو هجرة أو AI ترقيتها (ACC-011, ACC-017).
 * POL-024 تبقى PROPOSED ومعلقة على BLK-004.
 */
import type { ApprovalRequired, PolicyStatus, PolicyVersion } from './registerTypes';

function pol(
  policyId: string,
  name: string,
  ifrsRef: string | null,
  treatment: string,
  alternatives: string | null,
  approvalRequired: ApprovalRequired,
  status: PolicyStatus,
  notes: string | null = null
): PolicyVersion {
  return {
    companyId: null, // قوالب عامة — نسخ الشركات تُنشأ لاحقًا بموافقة بشرية
    policyId,
    version: 1,
    name,
    ifrsRef,
    treatment,
    alternatives,
    approvalRequired,
    status,
    effectiveFrom: null, // التفعيل فعل بشري لاحق — لا تاريخ سريان لاقتراح
    effectiveTo: null,
    impactIfChanged: null, // ACC-016: يُسجَّل قبل التفعيل — لا نخترعه
    notes,
    approvedAt: null,
    approvedBy: null,
  };
}

export const POLICY_SEED: readonly PolicyVersion[] = [
  pol('POL-001', 'Monthly subscription revenue', 'IFRS 15', 'Recognise over the service month', 'Point-in-time on invoice', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-002', 'Annual subscription revenue', 'IFRS 15', 'Recognise rateably over 12 months; balance to contract liability', 'Recognise on receipt', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-003', '6-month subscription revenue', 'IFRS 15', 'Rateably over 6 months', null, 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-004', 'One-time digital product', 'IFRS 15', 'Recognise on delivery/access grant', 'On payment', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-005', 'AI credits — initial', 'IFRS 15', 'Contract liability on sale; recognise on consumption', 'Recognise on sale', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-006', 'AI credits — breakage', 'IFRS 15', 'Recognise expired unused credits as revenue at expiry', 'Recognise proportionally over the expected pattern', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL'),
  pol('POL-007', 'Upgrade / downgrade mid-term', 'IFRS 15', 'Prospective modification; adjust the remaining schedule', 'Cumulative catch-up', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-008', 'Refund within the same period', 'IFRS 15', 'Contra-revenue; reduce deferred before recognised', 'Reverse the original entry', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-009', 'Refund across periods', 'IFRS 15 / IAS 8', 'Contra-revenue in the current period; never restate a closed period', 'Prior-period adjustment', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL'),
  pol('POL-010', 'Chargeback pending', 'IAS 37', 'Contingent liability; no revenue reversal until resolved', 'Reverse immediately', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-011', 'Chargeback lost', 'IFRS 15', 'Contra-revenue plus any dispute fee as expense', null, 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-012', 'Expected credit losses', 'IFRS 9', 'Simplified matrix approach on trade receivables', 'Full general model', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL'),
  pol('POL-013', 'Cost of revenue classification', 'IAS 1 / IFRS 18', 'AI API, hosting, storage, delivery messaging and gateway fees are cost of revenue', 'Treat gateway fees as finance/opex', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-014', 'Gateway fee presentation', 'IAS 1', 'Expense, gross presentation', 'Net against revenue', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-015', 'Accrual policy', 'IAS 1', 'Accrue known recurring costs at period end; auto-reverse next period', 'Accrue only above a threshold', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-016', 'Prepayment amortisation', 'IAS 1', 'Straight-line for time-based; consumption-based for credit-based', 'Straight-line for all', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-017', 'Revenue presentation gross vs net', 'IFRS 15', 'Gross (Ghiras is principal)', 'Net (agent)', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL'),
  pol('POL-018', 'FX revaluation', 'IAS 21', 'Revalue monetary items at period end', 'No revaluation', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-019', 'Depreciation', 'IAS 16 / Companies Law Art. 223', 'Straight-line over useful life', 'Reducing balance', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-020', 'Software development capitalisation', 'IAS 38', 'Expense as incurred until IAS 38 criteria are demonstrably met', 'Capitalise from technical feasibility', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL'),
  pol('POL-021', 'Legal reserve', 'Companies Law Art. 222', 'Compute and present for approval; do not auto-post', 'Auto-post', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL'),
  pol('POL-022', 'Materiality threshold', 'IAS 1', 'Configurable, documented, applied consistently', null, 'ACCOUNTANT', 'PROPOSED'),
  pol('POL-023', 'Functional currency', 'IAS 21', 'KWD', null, 'ACCOUNTANT', 'PROPOSED'),
  pol('POL-024', 'Unidentified settlement difference', null, 'Route to a named suspense account; never absorb into fees or revenue', 'Absorb into fees', 'ACCOUNTANT', 'PROPOSED', 'depends on BLK-004'),
];
