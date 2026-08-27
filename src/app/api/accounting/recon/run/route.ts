/**
 * غراس للمحاسبة — Stage 10: تنسيق جولة مطابقة.
 *
 * الإنسان (ACCOUNTANT/FINANCE_MANAGER) يُطلق؛ الآلية SYSTEM عبر
 * service_role؛ التهيئة تُلقط لقطةً في بداية الجولة ولا يغيّرها تعديل
 * لاحق. المحرك حتمي؛ القاعدة تعيد التحقق سلطويًا (سعة/اتجاه/طبقة/
 * فترة/تكرارات Stage 9). صفر قيود، صفر تعديل مصدر، صفر AI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { decideForTxn } from '@/lib/accounting/recon/engine';
import { RECON_LIMITS } from '@/lib/accounting/recon/limits';
import type { BankTxnLite, CandidateTarget, ReconConfig } from '@/lib/accounting/recon/types';
import type { HistoricalMapping } from '@/lib/accounting/recon/scoring';
import { canonToken } from '@/lib/accounting/recon/scoring';

export const dynamic = 'force-dynamic';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  const body = await req.json().catch(() => null) as
    { company_id?: string; bank_account_id?: string } | null;
  if (!body?.company_id || !body.bank_account_id)
    return NextResponse.json({ error: 'company_id and bank_account_id are required' }, { status: 400 });

  const db = svc();
  const { data: runRows, error: runErr } = await db.rpc('acc_recon_begin_run', {
    p_company: body.company_id, p_actor: auth.user.id, p_bank_account: body.bank_account_id });
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 403 });
  const run = (Array.isArray(runRows) ? runRows[0] : runRows)!;
  const config: ReconConfig = {
    settingsId: run.settings_id, settingsVersion: run.settings_version,
    autoBp: run.auto_bp, reviewBp: run.review_bp, askBp: run.ask_bp,
    dateWindowDays: run.date_window_days, weights: run.weights,
  };

  // حركات مؤهلة: جولات ACCEPTED، خارج تكرارات Stage 9 (المستبعد والمعلّق)
  const { data: txns } = await db.from('acc_bank_transactions')
    .select('id, bank_account_id, amount_minor, currency, txn_date, value_date, description_canon, reference, import_id')
    .eq('company_id', body.company_id).eq('bank_account_id', body.bank_account_id)
    .limit(RECON_LIMITS.MAX_TXNS_PER_RUN);
  const { data: accepted } = await db.from('acc_bank_imports')
    .select('id').eq('company_id', body.company_id).eq('state', 'ACCEPTED');
  const acceptedSet = new Set((accepted ?? []).map((r) => r.id));
  const { data: dupCands } = await db.from('acc_bank_duplicate_candidates')
    .select('id, transaction_id, kind').eq('company_id', body.company_id);
  const { data: dupRes } = await db.from('acc_recon_duplicate_resolutions')
    .select('candidate_id, decision').eq('company_id', body.company_id);
  const resolved = new Map((dupRes ?? []).map((r) => [r.candidate_id, r.decision]));
  const excluded = new Set<string>(); const held = new Set<string>();
  for (const c of dupCands ?? []) {
    if (c.kind === 'EXACT_DUPLICATE') excluded.add(c.transaction_id);
    else if (resolved.get(c.id) === 'DUPLICATE') excluded.add(c.transaction_id);
    else if (resolved.get(c.id) !== 'DISTINCT') held.add(c.transaction_id);
  }
  // مطابَق سلفًا (مؤكد/مقفل يغطي كامل المبلغ) — خارج الجولة
  const { data: activeAlloc } = await db.from('acc_recon_allocations')
    .select('bank_transaction_id, allocated_minor, acc_reconciliations!inner(state)')
    .eq('company_id', body.company_id);
  const consumed = new Map<string, bigint>();
  for (const a of (activeAlloc ?? []) as unknown as { bank_transaction_id: string; allocated_minor: string; acc_reconciliations: { state: string } }[]) {
    if (['CONFIRMED', 'LOCKED'].includes(a.acc_reconciliations.state)) {
      consumed.set(a.bank_transaction_id,
        (consumed.get(a.bank_transaction_id) ?? 0n) + BigInt(a.allocated_minor));
    }
  }

  // مرشحون قانونيون (حقائق استرشادية — القاعدة تعيد الحسم عند الإدراج)
  const candidates: CandidateTarget[] = [];
  const { data: setts } = await db.from('acc_settlements')
    .select('id, settlement_ref, settled_at, acc_settlement_lines(net_minor, currency)')
    .eq('company_id', body.company_id);
  for (const s of (setts ?? []) as unknown as { id: string; settlement_ref: string; settled_at: string; acc_settlement_lines: { net_minor: string; currency: string }[] }[]) {
    const lines = s.acc_settlement_lines ?? [];
    if (!lines.length) continue;
    const curs = new Set(lines.map((l) => l.currency));
    if (curs.size !== 1) continue;
    const net = lines.reduce((a, l) => a + BigInt(l.net_minor), 0n);
    if (net <= 0n) continue;
    candidates.push({ kind: 'SETTLEMENT', id: s.id, currency: lines[0].currency,
      direction: 'INFLOW', eligibleMinor: net, eventDate: s.settled_at,
      refPrimary: s.settlement_ref, layerKey: `SETTLEMENT:${s.id}`, counterpartyCanon: null });
  }
  const { data: pays } = await db.from('acc_payments')
    .select('id, amount_minor, currency, received_at, gateway_txn_id, status')
    .eq('company_id', body.company_id).in('status', ['SUCCESS', 'SETTLED']);
  const { data: settLines } = await db.from('acc_settlement_lines')
    .select('payment_id').eq('company_id', body.company_id);
  const inSettlement = new Set((settLines ?? []).map((l) => l.payment_id));
  for (const p of pays ?? []) {
    if (inSettlement.has(p.id)) continue;   // الطبقة القانونية للتسوية
    candidates.push({ kind: 'PAYMENT', id: p.id, currency: p.currency,
      direction: 'INFLOW', eligibleMinor: BigInt(p.amount_minor),
      eventDate: p.received_at ? String(p.received_at).slice(0, 10) : null,
      refPrimary: p.gateway_txn_id, layerKey: `PAYMENT:${p.id}`, counterpartyCanon: null });
  }
  const { data: refunds } = await db.from('acc_refunds')
    .select('id, amount_minor, currency, effective_date, external_refund_id')
    .eq('company_id', body.company_id).eq('status', 'REFUNDED');
  for (const r of refunds ?? []) {
    candidates.push({ kind: 'REFUND', id: r.id, currency: r.currency,
      direction: 'OUTFLOW', eligibleMinor: BigInt(r.amount_minor),
      eventDate: r.effective_date, refPrimary: r.external_refund_id,
      layerKey: `REFUND:${r.id}`, counterpartyCanon: null });
  }
  // خرائط تاريخية مؤكدة (CONFIRMED/LOCKED حصرًا) — حتمية بمصدر موثّق
  const { data: prior } = await db.from('acc_reconciliations')
    .select('id, state, acc_recon_allocations(target_kind, target_id, bank_transaction_id)')
    .eq('company_id', body.company_id).in('state', ['CONFIRMED', 'LOCKED']).limit(200);
  const historical: HistoricalMapping[] = [];
  for (const pr of (prior ?? []) as unknown as { id: string; acc_recon_allocations: { target_kind: string; bank_transaction_id: string }[] }[]) {
    for (const al of pr.acc_recon_allocations ?? []) {
      const src = (txns ?? []).find((t) => t.id === al.bank_transaction_id);
      if (!src) continue;
      const token = canonToken(src.description_canon).split(' ')[0];
      if (token) historical.push({ counterpartyToken: token,
        targetKind: al.target_kind as HistoricalMapping['targetKind'],
        priorReconciliationIds: [pr.id] });
    }
  }

  let auto = 0, suggested = 0, unmatched = 0, considered = 0;
  for (const t of txns ?? []) {
    if (!acceptedSet.has(t.import_id)) continue;
    if (excluded.has(t.id)) continue;
    if (held.has(t.id)) {
      await db.rpc('acc_recon_record_event', { p_run: run.run_id, p_bank_txn: t.id,
        p_condition: 'SUSPECTED_DUPLICATE_HOLD', p_blocking: true,
        p_detail: { note: 'awaiting human duplicate resolution' } });
      continue;
    }
    const amount = BigInt(t.amount_minor);
    if ((consumed.get(t.id) ?? 0n) >= (amount < 0n ? -amount : amount)) continue;
    considered++;
    const lite: BankTxnLite = { id: t.id, bankAccountId: t.bank_account_id,
      amountMinor: amount, currency: t.currency, txnDate: t.txn_date,
      valueDate: t.value_date, descriptionCanon: t.description_canon, reference: t.reference };
    const decision = decideForTxn(lite, candidates, config, historical);
    if (decision.kind === 'EVENT') {
      if (decision.condition === 'UNMATCHED_BANK_TRANSACTION') unmatched++;
      await db.rpc('acc_recon_record_event', { p_run: run.run_id,
        p_bank_txn: decision.bankTransactionId, p_condition: decision.condition,
        p_blocking: decision.blocking, p_detail: decision.detail });
      continue;
    }
    const { error: aErr } = await db.rpc('acc_recon_create_assertion', {
      p_run: run.run_id, p_actor: auth.user.id,
      p_payload: {
        mode: decision.mode, match_type: decision.matchType,
        score_bp: decision.score.scoreBp, coverage_bp: decision.score.coverageBp,
        matched_factors: decision.score.matchedCount,
        deterministic_override: decision.deterministicOverride,
        deterministic_reference: decision.deterministicReference,
        difference_minor: decision.differenceMinor?.toString() ?? '',
        difference_reason: decision.differenceReason ?? '',
        allocations: decision.allocations,
        factors: decision.score.factors,
      } });
    if (aErr) {
      // رفض بنيوي (فترة مقفلة/سعة/تكرار): يسجَّل حدثًا دائمًا — درس Stage 7
      await db.rpc('acc_recon_record_event', { p_run: run.run_id, p_bank_txn: t.id,
        p_condition: /CLOSED_PERIOD/.test(aErr.message) ? 'CLOSED_PERIOD_CONFLICT' : 'AMBIGUOUS_MATCH',
        p_blocking: true, p_detail: { error: aErr.message } });
      continue;
    }
    if (decision.mode === 'AUTO') auto++; else suggested++;
  }

  await db.rpc('acc_recon_complete_run', { p_run: run.run_id, p_state: 'COMPLETED',
    p_considered: considered, p_auto: auto, p_suggested: suggested, p_unmatched: unmatched });
  return NextResponse.json({ run: run.run_id, settings_version: run.settings_version,
    considered, auto, suggested, unmatched });
}
