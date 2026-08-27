/**
 * غراس للمحاسبة — Stage 11: محوّلات المصادر الحتمية.
 *
 * محوّل لكل منتِج حقيقي قائم (لا محوّل مخترعًا لنوع Stage 13):
 * يقرأ حقائق Stages 1..10 قراءةً صرفة، يشتق القضايا الاقتصادية
 * بمفاتيح ثابتة (C3)، ويستوعبها عبر acc_exception_ingest المحكومة
 * (idempotent). كل جولة تُسجَّل في acc_exception_ingestion_runs (C4):
 * «لا استثناءات» ≠ «ما فحصنا». صفر تعديل مصدر، صفر AI، صفر SQL
 * من JSON — استعلامات مغلقة هنا حصرًا.
 *
 * ترتيب التشغيل مقصود: PERIOD_CLOSE آخرًا ليرى حرجات هذه الجولة.
 */
import { EXCEPTION_REGISTRY } from './registry.ts';
import type { ExceptionType } from './registry.ts';

export interface ServiceDb {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
}

export interface SourceRef { kind: string; id: string; role: 'PRIMARY' | 'EVIDENCE' | 'CONTEXT' }

export interface Finding {
  type: ExceptionType;
  issueKey: string;
  params: Record<string, string>;
  sources: SourceRef[];
}

export interface AdapterResult {
  findings: Finding[];
  /** NONE = لا تغطية أصلًا (لا جولات استرداد/مطابقة) → SUCCEEDED_NO_COVERAGE */
  coverage: 'FULL' | 'NONE';
  coverageAsOf: string | null;
}

export type AdapterKey =
  | 'SETTLEMENT_DIFFERENCE' | 'PERIOD_CLOSE' | 'MISSING_WEBHOOK'
  | 'UNMATCHED_BANK' | 'FAILED_REFUND' | 'EXPENSE_REVIEW'
  | 'BANK_DUPLICATE' | 'MISSING_DOCUMENT';

const need = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
};

// حدود هندسية (سلامة تشغيل، ليست قواعد منتج): سقف صفوف القراءة
const SCAN_LIMIT = 2000;

// ── ١ · فرق التسوية: Σ(gross−fee−net) ≠ 0 لكل تسوية — قضية واحدة
//     للتسوية مهما تعددت أسطرها (C2/C3) ──
async function detectSettlementDifference(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const lines = need<any[]>(await db.from('acc_settlement_lines')
    .select('id, settlement_id, gross_minor, fee_minor, net_minor, currency')
    .eq('company_id', companyId).limit(SCAN_LIMIT), 'settlement lines');
  const bySettlement = new Map<string, { residual: bigint; currencies: Set<string>; lineIds: string[] }>();
  for (const l of lines) {
    const cur = bySettlement.get(l.settlement_id)
      ?? { residual: 0n, currencies: new Set<string>(), lineIds: [] };
    cur.residual += BigInt(String(l.gross_minor)) - BigInt(String(l.fee_minor)) - BigInt(String(l.net_minor));
    cur.currencies.add(l.currency);
    cur.lineIds.push(l.id);
    bySettlement.set(l.settlement_id, cur);
  }
  const findings: Finding[] = [];
  for (const [settlementId, agg] of bySettlement) {
    if (agg.residual === 0n) continue;
    findings.push({
      type: 'SETTLEMENT_DIFFERENCE',
      issueKey: `SETTLEMENT_DIFFERENCE:${settlementId}`,
      params: {
        residual_minor: agg.residual.toString(),
        currency: agg.currencies.size === 1 ? [...agg.currencies][0] : '',
      },
      sources: [
        { kind: 'SETTLEMENT', id: settlementId, role: 'PRIMARY' },
        ...agg.lineIds.slice(0, 50).map((id): SourceRef =>
          ({ kind: 'SETTLEMENT_LINE', id, role: 'EVIDENCE' })),
      ],
    });
  }
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

// ── ٣ · MISSING_WEBHOOK: حدث مزوّد وصل عبر الاسترداد (دليل أنه غاب
//     محليًا) وما زال بلا معالجة — بلا جولة استرداد: لا نخمّن (UNKNOWN) ──
async function detectMissingWebhook(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const runs = need<any[]>(await db.from('acc_mf_recovery_runs')
    .select('id, window_end').eq('company_id', companyId)
    .order('window_end', { ascending: false }).limit(1), 'recovery runs');
  if (runs.length === 0) {
    return { findings: [], coverage: 'NONE', coverageAsOf: null };
  }
  const events = need<any[]>(await db.from('acc_mf_events')
    .select('id, event_reference, event_name, processing_state')
    .eq('company_id', companyId).eq('source', 'RECOVERY')
    .in('processing_state', ['RECEIVED', 'CONFLICT', 'UNSUPPORTED'])
    .limit(SCAN_LIMIT), 'recovered events');
  const findings: Finding[] = events.map((e) => ({
    type: 'MISSING_WEBHOOK' as const,
    issueKey: `MISSING_WEBHOOK:${e.event_reference}`,
    params: { event_name: String(e.event_name ?? '') },
    sources: [
      { kind: 'MF_EVENT', id: e.id, role: 'PRIMARY' },
      { kind: 'MF_RECOVERY_RUN', id: runs[0].id, role: 'CONTEXT' },
    ],
  }));
  return { findings, coverage: 'FULL', coverageAsOf: runs[0].window_end };
}

// ── ٤ · حركة بنك بلا أصل: حدث UNMATCHED من آخر جولة مطابقة مكتملة
//     لحسابها، وما زالت بلا مطابقة مؤكدة/مقفلة ولا حسم تكرار ──
async function detectUnmatchedBank(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  // حقول Stage 10 الحقيقية: state ∈ RUNNING/COMPLETED/FAILED وfinished_at.
  // التغطية تُشتق من جولة **مكتملة** حصرًا — جولة فاشلة أو جارية ليست
  // فحصًا تمّ، فتبقى الحالة «لم نفحص» لا «لا شيء غير مطابق».
  const runs = need<any[]>(await db.from('acc_recon_runs')
    .select('id, bank_account_id, finished_at').eq('company_id', companyId)
    .eq('state', 'COMPLETED').not('finished_at', 'is', null)
    .order('finished_at', { ascending: false }).limit(200), 'recon runs');
  if (runs.length === 0) return { findings: [], coverage: 'NONE', coverageAsOf: null };
  const latestPerAccount = new Map<string, any>();
  for (const r of runs) {
    if (!latestPerAccount.has(r.bank_account_id)) latestPerAccount.set(r.bank_account_id, r);
  }
  const latestRunIds = [...latestPerAccount.values()].map((r) => r.id);
  const events = need<any[]>(await db.from('acc_recon_events')
    .select('id, run_id, bank_transaction_id')
    .eq('company_id', companyId).eq('condition', 'UNMATCHED_BANK_TRANSACTION')
    .in('run_id', latestRunIds).limit(SCAN_LIMIT), 'recon events');
  const txnIds = [...new Set(events.map((e) => e.bank_transaction_id).filter(Boolean))];
  if (txnIds.length === 0) {
    return { findings: [], coverage: 'FULL', coverageAsOf: runs[0].finished_at };
  }
  // استبعاد المستهلَك: تخصيصات لمطابقات CONFIRMED/LOCKED
  const allocs = need<any[]>(await db.from('acc_recon_allocations')
    .select('bank_transaction_id, reconciliation_id')
    .in('bank_transaction_id', txnIds), 'allocations');
  const recIds = [...new Set(allocs.map((a) => a.reconciliation_id))];
  const recs = recIds.length
    ? need<any[]>(await db.from('acc_reconciliations')
        .select('id, state').in('id', recIds), 'reconciliations')
    : [];
  const consumedRec = new Set(recs.filter((r) => ['CONFIRMED', 'LOCKED'].includes(r.state)).map((r) => r.id));
  const consumedTxn = new Set(
    allocs.filter((a) => consumedRec.has(a.reconciliation_id)).map((a) => a.bank_transaction_id));
  // استبعاد المحسوم تكرارًا (DUPLICATE) عبر Stage 10
  const cands = need<any[]>(await db.from('acc_bank_duplicate_candidates')
    .select('id, transaction_id').in('transaction_id', txnIds), 'duplicate candidates');
  const candIds = cands.map((c) => c.id);
  const dupRes = candIds.length
    ? need<any[]>(await db.from('acc_recon_duplicate_resolutions')
        .select('candidate_id, decision').in('candidate_id', candIds), 'duplicate resolutions')
    : [];
  const dupResolved = new Set(
    dupRes.filter((d) => d.decision === 'DUPLICATE').map((d) => d.candidate_id));
  const txnDup = new Set(cands.filter((c) => dupResolved.has(c.id)).map((c) => c.transaction_id));

  const txns = need<any[]>(await db.from('acc_bank_transactions')
    .select('id, amount_minor, currency, txn_date').in('id', txnIds), 'bank transactions');
  const txnById = new Map(txns.map((t) => [t.id, t]));
  const eventByTxn = new Map<string, any>();
  for (const e of events) if (!eventByTxn.has(e.bank_transaction_id)) eventByTxn.set(e.bank_transaction_id, e);

  const findings: Finding[] = [];
  for (const txnId of txnIds) {
    if (consumedTxn.has(txnId) || txnDup.has(txnId)) continue;
    const t = txnById.get(txnId);
    const ev = eventByTxn.get(txnId);
    findings.push({
      type: 'UNMATCHED_BANK_TRANSACTION',
      issueKey: `UNMATCHED_BANK:${txnId}`,
      params: {
        amount_minor: t ? String(t.amount_minor) : '',
        currency: t ? String(t.currency) : '',
        txn_date: t ? String(t.txn_date) : '',
      },
      sources: [
        { kind: 'BANK_TRANSACTION', id: txnId, role: 'PRIMARY' },
        ...(ev ? [{ kind: 'RECON_EVENT', id: ev.id, role: 'EVIDENCE' } as SourceRef] : []),
      ],
    });
  }
  return { findings, coverage: 'FULL', coverageAsOf: runs[0].finished_at };
}

// ── ٥ · استرداد فاشل ──
async function detectFailedRefund(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const refunds = need<any[]>(await db.from('acc_refunds')
    .select('id, payment_id, invoice_id, amount_minor, currency')
    .eq('company_id', companyId).eq('status', 'FAILED').limit(SCAN_LIMIT), 'refunds');
  const findings: Finding[] = refunds.map((r) => ({
    type: 'FAILED_REFUND' as const,
    issueKey: `FAILED_REFUND:${r.id}`,
    params: { amount_minor: String(r.amount_minor), currency: String(r.currency) },
    sources: [
      { kind: 'REFUND', id: r.id, role: 'PRIMARY' },
      { kind: 'PAYMENT', id: r.payment_id, role: 'CONTEXT' },
      { kind: 'INVOICE', id: r.invoice_id, role: 'CONTEXT' },
    ],
  }));
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

// ── ٧+٨(مصروف) · مراجعات المصروفات المعلّمة بشريًا/حتميًا في Stage 8 ──
async function detectExpenseReview(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const exps = need<any[]>(await db.from('acc_expenses')
    .select('id, review_reason, expense_date')
    .eq('company_id', companyId).eq('state', 'NEEDS_REVIEW').limit(SCAN_LIMIT), 'expenses in review');
  const findings: Finding[] = [];
  for (const e of exps) {
    if (e.review_reason === 'PERSONAL_BUSINESS_AMBIGUITY') {
      findings.push({
        type: 'PERSONAL_BUSINESS_AMBIGUITY',
        issueKey: `EXPENSE_AMBIGUITY:${e.id}`,
        params: { expense_date: String(e.expense_date ?? '') },
        sources: [{ kind: 'EXPENSE', id: e.id, role: 'PRIMARY' }],
      });
    } else if (['SUSPECTED_DUPLICATE', 'VENDOR_REFERENCE_DUPLICATE', 'SOURCE_ALREADY_USED']
        .includes(e.review_reason)) {
      findings.push({
        type: 'SUSPECTED_DUPLICATE',
        issueKey: `EXPENSE_DUP:${e.id}`,
        params: { expense_date: String(e.expense_date ?? '') },
        sources: [{ kind: 'EXPENSE', id: e.id, role: 'PRIMARY' }],
      });
    }
  }
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

// ── ٨(بنك) · مرشّح تكرار مشتبه بلا حسم Stage 10 ──
async function detectBankDuplicate(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const cands = need<any[]>(await db.from('acc_bank_duplicate_candidates')
    .select('id, transaction_id, candidate_transaction_id')
    .eq('company_id', companyId).eq('kind', 'SUSPECTED_DUPLICATE').limit(SCAN_LIMIT), 'candidates');
  if (cands.length === 0) return { findings: [], coverage: 'FULL', coverageAsOf: new Date().toISOString() };
  const res = need<any[]>(await db.from('acc_recon_duplicate_resolutions')
    .select('candidate_id').in('candidate_id', cands.map((c) => c.id)), 'resolutions');
  const resolved = new Set(res.map((r) => r.candidate_id));
  const findings: Finding[] = cands.filter((c) => !resolved.has(c.id)).map((c) => ({
    type: 'SUSPECTED_DUPLICATE' as const,
    issueKey: `BANK_DUP:${c.id}`,
    params: {},
    sources: [
      { kind: 'BANK_DUPLICATE_CANDIDATE', id: c.id, role: 'PRIMARY' },
      { kind: 'BANK_TRANSACTION', id: c.transaction_id, role: 'EVIDENCE' },
      { kind: 'BANK_TRANSACTION', id: c.candidate_transaction_id, role: 'EVIDENCE' },
    ] as SourceRef[],
  }));
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

// ── ١٠ · مصروف يدوي نشط بلا أي مستند مربوط ──
async function detectMissingDocument(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const exps = need<any[]>(await db.from('acc_expenses')
    .select('id, expense_date')
    .eq('company_id', companyId).eq('source_kind', 'MANUAL')
    .in('state', ['SUBMITTED', 'NEEDS_REVIEW', 'APPROVED', 'READY_TO_POST', 'POSTED'])
    .limit(SCAN_LIMIT), 'manual expenses');
  if (exps.length === 0) return { findings: [], coverage: 'FULL', coverageAsOf: new Date().toISOString() };
  const links = need<any[]>(await db.from('acc_document_links')
    .select('target_id').eq('company_id', companyId).eq('target_kind', 'EXPENSE')
    .in('target_id', exps.map((e) => e.id)), 'document links');
  const documented = new Set(links.map((l) => l.target_id));
  const findings: Finding[] = exps.filter((e) => !documented.has(e.id)).map((e) => ({
    type: 'MISSING_DOCUMENT' as const,
    issueKey: `MISSING_DOC:${e.id}`,
    params: { expense_date: String(e.expense_date ?? '') },
    sources: [{ kind: 'EXPENSE', id: e.id, role: 'PRIMARY' }] as SourceRef[],
  }));
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

// ── ٢ · إقفال فترة واقف: SOFT_CLOSED + حرجات مفتوحة (يعمل آخرًا) ──
async function detectPeriodClose(db: ServiceDb, companyId: string): Promise<AdapterResult> {
  const periods = need<any[]>(await db.from('acc_fiscal_periods')
    .select('id, fiscal_year').eq('company_id', companyId).eq('state', 'SOFT_CLOSED'), 'periods');
  if (periods.length === 0) return { findings: [], coverage: 'FULL', coverageAsOf: new Date().toISOString() };
  const criticals = need<any[]>(await db.from('acc_exceptions')
    .select('id, exception_type').eq('company_id', companyId)
    .neq('state', 'RESOLVED').eq('priority', 'CRITICAL'), 'open criticals');
  const blocking = criticals.filter((c) => c.exception_type !== 'PERIOD_CLOSE_ISSUE');
  if (blocking.length === 0) return { findings: [], coverage: 'FULL', coverageAsOf: new Date().toISOString() };
  const findings: Finding[] = periods.map((p) => ({
    type: 'PERIOD_CLOSE_ISSUE' as const,
    issueKey: `PERIOD_CLOSE:${p.id}:OPEN_CRITICAL_EXCEPTIONS`,
    params: { open_critical: String(blocking.length), fiscal_year: String(p.fiscal_year ?? '') },
    sources: [{ kind: 'FISCAL_PERIOD', id: p.id, role: 'PRIMARY' }] as SourceRef[],
  }));
  return { findings, coverage: 'FULL', coverageAsOf: new Date().toISOString() };
}

export const ADAPTERS: readonly { key: AdapterKey; detect: (db: ServiceDb, companyId: string) => Promise<AdapterResult> }[] = [
  { key: 'SETTLEMENT_DIFFERENCE', detect: detectSettlementDifference },
  { key: 'MISSING_WEBHOOK', detect: detectMissingWebhook },
  { key: 'UNMATCHED_BANK', detect: detectUnmatchedBank },
  { key: 'FAILED_REFUND', detect: detectFailedRefund },
  { key: 'EXPENSE_REVIEW', detect: detectExpenseReview },
  { key: 'BANK_DUPLICATE', detect: detectBankDuplicate },
  { key: 'MISSING_DOCUMENT', detect: detectMissingDocument },
  // آخرًا عمدًا: يرى حرجات هذه الجولة نفسها
  { key: 'PERIOD_CLOSE', detect: detectPeriodClose },
];

export interface IngestionRunSummary {
  adapterKey: AdapterKey;
  status: 'SUCCEEDED' | 'SUCCEEDED_NO_COVERAGE' | 'FAILED';
  produced: number;
  refreshed: number;
  failureCode: string | null;
}

/**
 * تشغيل كل المحوّلات لشركة — كل محوّل بجولة موقّعة ذات تغطية (C4).
 * فشل محوّل لا يخفي فشله: يُسجَّل FAILED برمز مغلق ويُكمل الباقي.
 */
export async function runIngestion(
  db: ServiceDb, companyId: string, actorId: string,
): Promise<IngestionRunSummary[]> {
  const out: IngestionRunSummary[] = [];
  for (const adapter of ADAPTERS) {
    const begun = await db.rpc('acc_exception_begin_ingestion', {
      p_company: companyId, p_actor: actorId, p_adapter_key: adapter.key,
    });
    if (begun.error) throw new Error(`begin ingestion ${adapter.key}: ${begun.error.message}`);
    const runId = begun.data as string;
    let produced = 0, refreshed = 0;
    try {
      const result = await adapter.detect(db, companyId);
      for (const f of result.findings) {
        const spec = EXCEPTION_REGISTRY[f.type];
        const ing = await db.rpc('acc_exception_ingest', {
          p_run: runId, p_type: f.type, p_issue_key: f.issueKey,
          p_what_key: spec.whatKey, p_why_key: spec.whyKey,
          p_params: f.params, p_sources: f.sources,
        });
        if (ing.error) throw new Error(`ingest ${f.issueKey}: ${ing.error.message}`);
        const row = Array.isArray(ing.data) ? ing.data[0] : ing.data;
        if (row?.outcome === 'REFRESHED') refreshed += 1;
        else produced += 1;
      }
      const status = result.coverage === 'NONE' ? 'SUCCEEDED_NO_COVERAGE' : 'SUCCEEDED';
      const done = await db.rpc('acc_exception_complete_ingestion', {
        p_run: runId, p_status: status, p_produced: produced, p_refreshed: refreshed,
        p_coverage: result.coverageAsOf,
      });
      if (done.error) throw new Error(`complete ingestion: ${done.error.message}`);
      out.push({ adapterKey: adapter.key, status, produced, refreshed, failureCode: null });
    } catch {
      // رمز مغلق — لا نص خطأ خام يصل جدول التغطية ولا DTO المالكة
      await db.rpc('acc_exception_complete_ingestion', {
        p_run: runId, p_status: 'FAILED', p_produced: produced, p_refreshed: refreshed,
        p_coverage: null, p_failure_code: 'ADAPTER_ERROR',
      });
      out.push({ adapterKey: adapter.key, status: 'FAILED', produced, refreshed, failureCode: 'ADAPTER_ERROR' });
    }
  }
  return out;
}
