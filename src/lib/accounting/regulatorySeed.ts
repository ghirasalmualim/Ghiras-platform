/**
 * بذرة سجل القواعد التنظيمية — §18 من الـMASTER BLUEPRINT v1.0 **حرفيًا**.
 *
 * الغموض يُحفظ ولا يُملأ: «?» تبقى «?»، وBLOCKED تبقى BLOCKED،
 * وproposed لا يصبح تاريخ سريان. التطبيع بدقة معلنة (FIX 2): يوم
 * مؤكد = DAY، وسنة وحدها = YEAR **بلا يوم مخترع** — «1990» لا تثبت
 * «1990-01-01» — و«—» = NONE بلا حدّ، و«?»/proposed/draft = UNKNOWN.
 *
 * REG-KW-003 موجودة **كمعرفة** فقط — QAYD/XBRL لا يُنفَّذان
 * (BLK-001/002/003 مفتوحة).
 */
import type { RegulatoryRuleVersion, RuleBound } from './registerTypes';
import { ruleBound } from './registerTypes';

type Row = Omit<RegulatoryRuleVersion, 'version' | 'effectiveFrom' | 'effectiveTo'> & {
  effectiveFrom: RuleBound;
  effectiveTo: RuleBound;
};
const rule = (r: Row): RegulatoryRuleVersion =>
  ({ ...r, effectiveFrom: ruleBound(r.effectiveFrom), effectiveTo: ruleBound(r.effectiveTo), version: 1 });
// حدود بدقة معلنة — «سنة فقط» لا تصبح أول يناير أبدًا (FIX 2)
const day = (d: string): RuleBound => ({ precision: 'DAY', date: d, year: null });
const yr = (y: number): RuleBound => ({ precision: 'YEAR', date: null, year: y });
const none: RuleBound = { precision: 'NONE', date: null, year: null };
const unknown: RuleBound = { precision: 'UNKNOWN', date: null, year: null };

export const REGULATORY_SEED: readonly RegulatoryRuleVersion[] = [
  rule({ ruleId: 'REG-KW-001', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Full IFRS as issued by IASB required for all companies under the Commercial Companies Law',
    effectiveFromText: '1990 (amended 2008)', effectiveToText: 'open',
    effectiveFrom: yr(1990), effectiveTo: none,
    source: 'Ministerial Decree 18/1990, amended 101/2008 (IFRS Foundation jurisdictional profile)',
    status: 'ACTIVE', confidence: '🟢', systemImpact: 'Statement model, chart of accounts' }),
  rule({ ruleId: 'REG-KW-002', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'IFRS for SMEs not applicable',
    effectiveFromText: '—', effectiveToText: '—', effectiveFrom: none, effectiveTo: none,
    source: 'Same', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'No SME framework branch may be built' }),
  rule({ ruleId: 'REG-KW-003', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Electronic filing of financial statements via QAYD in XBRL becomes mandatory for all legal entities',
    effectiveFromText: '1 Jan 2027', effectiveToText: 'open',
    effectiveFrom: day('2027-01-01'), effectiveTo: none,
    source: 'MOCI announcements; KUNA 15 Apr 2026',
    status: 'PENDING', confidence: '🟢', systemImpact: 'QAYD Adapter (BLOCKED)' }),
  rule({ ruleId: 'REG-KW-004', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'XBRL filing optional during 2026; existing submission mechanism remains mandatory in parallel',
    effectiveFromText: '1 Jan 2026', effectiveToText: '31 Dec 2026',
    effectiveFrom: day('2026-01-01'), effectiveTo: day('2026-12-31'),
    source: 'Same', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'No mandatory export in 2026' }),
  rule({ ruleId: 'REG-KW-005', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Non-compliance after 1 Jan 2027 attracts action under Companies Law No. 1 of 2016',
    effectiveFromText: '1 Jan 2027', effectiveToText: 'open',
    effectiveFrom: day('2027-01-01'), effectiveTo: none,
    source: 'MOCI statement', status: 'PENDING', confidence: '🟢',
    systemImpact: 'Compliance alerting' }),
  rule({ ruleId: 'REG-KW-006', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Filing deadline after fiscal year end',
    effectiveFromText: '?', effectiveToText: '?', effectiveFrom: unknown, effectiveTo: unknown,
    source: 'Conflicting secondary sources: 3 months vs 6 months',
    status: 'BLOCKED', confidence: '🔴',
    systemImpact: 'No deadline logic may be built' }),
  rule({ ruleId: 'REG-KW-007', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Independent auditor licensed and registered with MOCI required',
    effectiveFromText: '—', effectiveToText: 'open', effectiveFrom: none, effectiveTo: none,
    source: 'Law No. 5 of 1981', status: 'ACTIVE', confidence: '🟡',
    systemImpact: 'Auditor role, audit export' }),
  rule({ ruleId: 'REG-KW-008', jurisdiction: 'Kuwait', regulator: null,
    requirement: 'No VAT regime exists',
    effectiveFromText: '—', effectiveToText: '—', effectiveFrom: none, effectiveTo: none,
    source: 'Multiple; no enacted legislation found', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'VAT status = NO_TAX_REGIME' }),
  rule({ ruleId: 'REG-KW-009', jurisdiction: 'Kuwait', regulator: 'MoF / KTA',
    requirement: 'DMTT 15% for MNE groups ≥ €750m consolidated revenue',
    effectiveFromText: '1 Jan 2025', effectiveToText: 'open',
    effectiveFrom: day('2025-01-01'), effectiveTo: none,
    source: 'Decree-Law No. 157 of 2024', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'Out of scope for Ghiras' }),
  rule({ ruleId: 'REG-KW-010', jurisdiction: 'Kuwait', regulator: 'MoF',
    requirement: 'Business Profits Tax — phase 2 proposed for all legal and natural persons; exemption below KD 1.5m turnover',
    effectiveFromText: 'proposed 1 Jan 2027', effectiveToText: '—',
    effectiveFrom: unknown, effectiveTo: none, // proposed ≠ ساري — يبقى غامضًا
    source: 'Draft law', status: 'DRAFT', confidence: '🟠',
    systemImpact: 'Data readiness only. No calculation.' }),
  rule({ ruleId: 'REG-KW-011', jurisdiction: 'Kuwait', regulator: 'MoF',
    requirement: '5% withholding on non-resident payments including technical services',
    effectiveFromText: 'proposed', effectiveToText: '—',
    effectiveFrom: unknown, effectiveTo: none,
    source: 'Draft BPT law', status: 'DRAFT', confidence: '🟠',
    systemImpact: 'Vendor residency flags only' }),
  rule({ ruleId: 'REG-KW-012', jurisdiction: 'Kuwait', regulator: null,
    requirement: 'No mandatory e-invoicing regime',
    effectiveFromText: '—', effectiveToText: '—', effectiveFrom: none, effectiveTo: none,
    source: 'Regional surveys; Kuwait in preparatory work', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'Structural readiness only' }),
  rule({ ruleId: 'REG-KW-013', jurisdiction: 'Kuwait', regulator: 'CBK',
    requirement: 'Open Banking framework issued in draft only',
    effectiveFromText: 'draft 4 Jun 2025', effectiveToText: '—',
    effectiveFrom: unknown, effectiveTo: none, // تاريخ المسودة ليس تاريخ سريان
    source: 'CBK press statement', status: 'DRAFT', confidence: '🟢',
    systemImpact: 'No bank feed may be built' }),
  rule({ ruleId: 'REG-KW-014', jurisdiction: 'Kuwait', regulator: null,
    requirement: 'Accounting record retention period',
    effectiveFromText: '?', effectiveToText: '?', effectiveFrom: unknown, effectiveTo: unknown,
    source: 'Conflicting: 5-year civil limitation vs 10-year claims',
    status: 'BLOCKED', confidence: '🔴',
    systemImpact: 'Default 10 years, configurable' }),
  rule({ ruleId: 'REG-KW-015', jurisdiction: 'Kuwait', regulator: 'DIT',
    requirement: 'Computerised accounting records permitted, subject to containing the required records and prior notification to the tax department',
    effectiveFromText: '—', effectiveToText: 'open', effectiveFrom: none, effectiveTo: none,
    source: 'PwC Kuwait tax administration summary', status: 'ACTIVE', confidence: '🟡',
    systemImpact: 'Complete journal and ledger retention' }),
  rule({ ruleId: 'REG-KW-016', jurisdiction: 'Kuwait', regulator: 'CITRA',
    requirement: 'DPPR applies exclusively to CITRA licensees following Decision No. 26 of 2024',
    effectiveFromText: '2024', effectiveToText: 'open',
    effectiveFrom: yr(2024), effectiveTo: none,
    source: 'Chambers Kuwait 2026', status: 'ACTIVE', confidence: '🟡',
    systemImpact: 'Likely not applicable to Ghiras — verify' }),
  rule({ ruleId: 'REG-KW-017', jurisdiction: 'Kuwait', regulator: null,
    requirement: 'E-Transactions Law duties: consent, purpose, accuracy, security',
    effectiveFromText: '2014', effectiveToText: 'open',
    effectiveFrom: yr(2014), effectiveTo: none,
    source: 'Law No. 20 of 2014', status: 'ACTIVE', confidence: '🟡',
    systemImpact: 'Privacy controls' }),
  rule({ ruleId: 'REG-KW-018', jurisdiction: 'Kuwait', regulator: null,
    requirement: 'Cybercrime Law criminalises unauthorised access, alteration, disclosure, destruction',
    effectiveFromText: '2015', effectiveToText: 'open',
    effectiveFrom: yr(2015), effectiveTo: none,
    source: 'Law No. 63 of 2015', status: 'ACTIVE', confidence: '🟡',
    systemImpact: 'Access control, audit logging' }),
  rule({ ruleId: 'REG-KW-019', jurisdiction: 'Kuwait', regulator: 'MOCI',
    requirement: 'Companies Law Arts. 221–225: fiscal year, legal reserve, depreciation, labour/social security deductions, voluntary reserves',
    effectiveFromText: '2016', effectiveToText: 'open',
    effectiveFrom: yr(2016), effectiveTo: none,
    source: 'Law No. 1 of 2016', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'Period model, reserve computation' }),
  rule({ ruleId: 'REG-INT-001', jurisdiction: 'International', regulator: 'IASB',
    requirement: 'IFRS 18 replaces IAS 1 for annual periods beginning on or after 1 Jan 2027, retrospective',
    effectiveFromText: '1 Jan 2027', effectiveToText: 'open',
    effectiveFrom: day('2027-01-01'), effectiveTo: none,
    source: 'IASB', status: 'PENDING', confidence: '🟡',
    systemImpact: 'Versioned presentation layer required' }),
  rule({ ruleId: 'REG-INT-002', jurisdiction: 'International', regulator: 'ISO',
    requirement: 'KWD minor unit = 3',
    effectiveFromText: '—', effectiveToText: 'open', effectiveFrom: none, effectiveTo: none,
    source: 'ISO 4217', status: 'ACTIVE', confidence: '🟢',
    systemImpact: 'Money model' }),
];
