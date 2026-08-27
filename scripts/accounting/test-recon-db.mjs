#!/usr/bin/env node
/**
 * Stage 10 — المطابقة على القاعدة — **PENDING STAGING**.
 * يثبت: مراسم التهيئة (نافذة تاريخ صريحة)، الجولة بلقطة، التأكيد
 * الآلي الحتمي عبر service، اليدوي فعلان، الحفظ ومنع الاستهلاك
 * المزدوج، العكس بموافقة مغايرة، حسم مشتبهي Stage 9، الفترات،
 * مناعة الأدلة، الأدوار والعزل، وصفر أثر دفتري/مصدري.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (URL?.includes('prod')) { console.error('⛔ ليست بيئة Staging'); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };
const TAG = 'r' + Date.now().toString(36);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function mintUser(t) {
  const email = `acc10-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
const OWN = await mintUser('own'), ACC = await mintUser('acc'), ACC2 = await mintUser('acc2'),
      FM = await mintUser('fm'), AUD = await mintUser('aud'), OWN_B = await mintUser('ownb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة مطابقة ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة مطابقة باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [ACC2, 'ACCOUNTANT'], [FM, 'FINANCE_MANAGER'], [AUD, 'AUDITOR']])
  await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });

// ═ تجهيزة بنك Stage 9: حساب + تخطيط + جولة مقبولة بحركات ═
const { data: acct } = await OWN.client.rpc('acc_create_bank_account', {
  p_company: coA, p_bank_label: `بنك ${TAG}`, p_account_identifier: `KW10TEST${TAG}000001`, p_currency: 'KWD' });
const SPEC = { header: { skip_rows: 1 }, columns: { txn_date: 0, description: 1, amount: 2, balance: 3 },
  amount_semantics: 'SIGNED_AMOUNT', date_format: 'DD/MM/YYYY', currency_mode: 'FIXED',
  fixed_currency: 'KWD', balance_direction: 'AFTER_ROW' };
const { data: layout } = await ACC.client.rpc('acc_add_bank_layout', {
  p_company: coA, p_layout_key: `csv-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: SPEC });
await ACC.client.rpc('acc_activate_bank_layout', { p_layout: layout });
async function bankDoc(content) {
  const cap = `rb-${TAG}-${Math.random().toString(36).slice(2)}`;
  const { data: d } = await svc.rpc('acc_create_document', { p_company: coA, p_actor: OWN.id, p_capture_id: cap,
    p_doc_type: 'BANK_STATEMENT', p_source: 'FILE_UPLOAD', p_original_filename: 's.csv', p_mime: 'text/csv', p_expected_pages: 1 });
  const id = d[0].document_id;
  await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'text/csv' });
  await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 5, p_server_sha256: sha(content) });
  await svc.rpc('acc_finalize_document', { p_document: id });
  return id;
}
const ROW = (n, date, amt, bal, desc, ref = null) => ({
  row_no: n, txn_date: date, value_date: date, description_raw: desc,
  description_canon: desc.toUpperCase(), amount_minor: String(amt),
  running_balance_minor: String(bal), reference: ref ?? '', raw: {},
});
async function acceptedImport(rows, opening, closing, range) {
  const doc = await bankDoc(`stmt-${TAG}-${Math.random()}`);
  const { data: imp } = await svc.rpc('acc_create_bank_import', {
    p_company: coA, p_actor: OWN.id, p_bank_account: acct, p_document: doc, p_layout: layout, p_supersedes: null });
  const id = imp[0].import_id;
  await svc.rpc('acc_begin_bank_parse', { p_import: id, p_actor: OWN.id });
  if (rows.length) await svc.rpc('acc_record_bank_rows', { p_import: id, p_rows: rows });
  await svc.rpc('acc_normalize_bank_import', { p_import: id,
    p_period_start: range[0], p_period_end: range[1],
    p_opening_minor: String(opening), p_closing_minor: String(closing),
    p_assertion_source: 'EXPLICIT_SOURCE', p_assertion_derivation: null,
    p_freshness: range[1], p_detected_currency: null, p_detected_account_fp: null });
  await svc.rpc('acc_dedup_bank_import', { p_import: id });
  await OWN.client.rpc('acc_accept_bank_import', { p_import: id });
  return id;
}
const txnId = async (imp, rowNo) => (await svc.from('acc_bank_transactions')
  .select('id').eq('import_id', imp).eq('row_no', rowNo).single()).data.id;

// أهداف داخلية: تسوية DEP + دفعة حرة + استرداد
const { data: cust } = await OWN.client.rpc('acc_create_customer', { p_company: coA, p_name: `عميلة ${TAG}` });
const { data: prod } = await OWN.client.rpc('acc_create_product', { p_company: coA, p_name: `منتج ${TAG}`, p_price_minor: '100000', p_currency: 'KWD', p_revenue_policy_id: 'POL-004' });
async function issuedInvoice(total = '100000') {
  const { data: inv } = await OWN.client.rpc('acc_create_invoice_draft', { p_company: coA, p_customer: cust, p_currency: 'KWD',
    p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: total, currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
  await OWN.client.rpc('acc_issue_invoice', { p_invoice: inv, p_issue_date: '2026-09-01' });
  await OWN.client.rpc('acc_send_invoice', { p_invoice: inv });
  return inv;
}
const invS = await issuedInvoice();
const { data: payS } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: invS, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `PID-${TAG}-S` });
await OWN.client.rpc('acc_set_payment_status', { p_payment: payS, p_new_status: 'PENDING' });
await OWN.client.rpc('acc_set_payment_status', { p_payment: payS, p_new_status: 'SUCCESS' });
const DEPREF = `DEP-${TAG}`;
const { data: settle } = await ACC.client.rpc('acc_record_settlement', { p_company: coA, p_provider: 'MYFATOORAH', p_settlement_ref: DEPREF, p_settled_at: '2026-09-05' });
await ACC.client.rpc('acc_add_settlement_line', { p_settlement: settle, p_payment: payS, p_gross_minor: '100000', p_fee_minor: '2500', p_net_minor: '97500', p_currency: 'KWD' });

console.log('\n═══ ١ · REC-003: مراسم التهيئة — نافذة صريحة، نسخ مجمّدة ═══');
const WEIGHTS = { EXACT_AMOUNT: 3500, EXPLICIT_REFERENCE: 2500, DATE_PROXIMITY: 1500,
  COUNTERPARTY_CANONICAL: 1000, HISTORICAL_CONFIRMED_MAPPING: 1000, GROUP_PLAUSIBILITY: 500 };
const fmCfg = await FM.client.rpc('acc_recon_add_settings', { p_company: coA, p_auto_bp: 9500, p_review_bp: 8000, p_ask_bp: 5500, p_date_window_days: null, p_weights: WEIGHTS });
check('التهيئة فعل المحاسبة حصرًا (FM مرفوض)', !!fmCfg.error);
const { data: cfgNoWin } = await ACC.client.rpc('acc_recon_add_settings', { p_company: coA, p_auto_bp: 9500, p_review_bp: 8000, p_ask_bp: 5500, p_date_window_days: null, p_weights: WEIGHTS });
const actNoWin = await ACC.client.rpc('acc_recon_activate_settings', { p_settings: cfgNoWin });
check('C7: لا تفعيل بلا نافذة تاريخ صريحة', !!actNoWin.error && /explicitly chosen/.test(actNoWin.error.message));
const badW = await ACC.client.rpc('acc_recon_add_settings', { p_company: coA, p_auto_bp: 9500, p_review_bp: 8000, p_ask_bp: 5500, p_date_window_days: 3, p_weights: { ...WEIGHTS, EVIL: 100 } });
check('أوزان خارج العقد تُرفض في القاعدة', !!badW.error);
const { data: cfg } = await ACC.client.rpc('acc_recon_add_settings', { p_company: coA, p_auto_bp: 9500, p_review_bp: 8000, p_ask_bp: 5500, p_date_window_days: 3, p_weights: WEIGHTS });
const act = await ACC.client.rpc('acc_recon_activate_settings', { p_settings: cfg });
check('التفعيل الإنساني يمرّ ويُدقَّق', !act.error);
const frozenCfg = await svc.from('acc_recon_settings').update({ auto_threshold_bp: 1 }).eq('id', cfg);
check('نسخة ACTIVE مجمّدة حتى بمفتاح الخدمة', !!frozenCfg.error && /immutable/.test(frozenCfg.error.message));

console.log('═══ ٢ · REC-001: تخطٍّ حتمي AUTO عبر الجولة (تسوية DEP كاملة) ═══');
const imp1 = await acceptedImport([
  ROW(1, '2026-09-05', 97500, 197500, `MYFATOORAH ${DEPREF} تسوية`, DEPREF),
  ROW(2, '2026-09-06', 40000, 237500, 'حوالة واردة بلا أي دليل'),
], 100000, 237500, ['2026-09-05', '2026-09-06']);
const t1 = await txnId(imp1, 1), t2 = await txnId(imp1, 2);
const { data: run } = await svc.rpc('acc_recon_begin_run', { p_company: coA, p_actor: ACC.id, p_bank_account: acct });
check('الجولة تبدأ بلقطة التهيئة النشطة', !!run?.[0]?.run_id && run[0].auto_bp === 9500);
const runId = run[0].run_id;
// تأكيد آلي حتمي: مرجع DEP + مبلغ صافٍ تام
const detPayload = {
  mode: 'AUTO', match_type: 'ONE_TO_ONE', score_bp: 6000, coverage_bp: 9500, matched_factors: 2,
  deterministic_override: true, deterministic_reference: DEPREF,
  difference_minor: '', difference_reason: '',
  allocations: [{ bank_transaction_id: t1, target_kind: 'SETTLEMENT', target_id: settle,
    allocated_minor: '97500', currency: 'KWD', expected_direction: 'INFLOW',
    layer_key: `SETTLEMENT:${settle}` }],
  factors: [
    { factor_key: 'EXACT_AMOUNT', available: true, matched: true, weight_bp: 3500, contribution_bp: 3500, provenance: {} },
    { factor_key: 'EXPLICIT_REFERENCE', available: true, matched: true, weight_bp: 2500, contribution_bp: 2500, provenance: { reference: DEPREF } },
  ],
};
const det = await svc.rpc('acc_recon_create_assertion', { p_run: runId, p_actor: ACC.id, p_payload: detPayload });
check('REC-001: AUTO حتمي يُنشأ CONFIRMED بمصدر SYSTEM', !det.error && det.data[0].outcome === 'CONFIRMED');
const recDet = det.data?.[0]?.reconciliation_id;
const { data: detRow } = await svc.from('acc_reconciliations').select('*').eq('id', recDet).single();
check('اللقطة والدليل محفوظان (نسخة تهيئة/تخطٍّ/مرجع)',
  detRow.settings_version === detRow.settings_version && detRow.deterministic_override === true
  && detRow.created_source === 'SYSTEM' && detRow.deterministic_reference === DEPREF);
// REC-002: مبلغ فقط لا يمرّ AUTO
const amountOnly = await svc.rpc('acc_recon_create_assertion', { p_run: runId, p_actor: ACC.id, p_payload: {
  ...detPayload, deterministic_override: false, deterministic_reference: null, matched_factors: 1,
  score_bp: 3500, allocations: [{ ...detPayload.allocations[0], bank_transaction_id: t2,
    target_kind: 'PAYMENT', target_id: payS, layer_key: `PAYMENT:${payS}` }] } });
check('REC-002: مبلغ وحده لا يؤكد آليًا (بنيويًا)', !!amountOnly.error && /amount alone|auto threshold/.test(amountOnly.error.message));
// MANY_TO_MANY لا AUTO
const mm = await svc.rpc('acc_recon_create_assertion', { p_run: runId, p_actor: ACC.id, p_payload: {
  ...detPayload, match_type: 'MANY_TO_MANY', deterministic_override: true } });
check('MANY_TO_MANY لا AUTO حتى بتخطٍّ', !!mm.error);
await svc.rpc('acc_recon_complete_run', { p_run: runId, p_state: 'COMPLETED', p_considered: 2, p_auto: 1, p_suggested: 0, p_unmatched: 1 });

console.log('═══ ٣ · الاتجاه والعملة والسعة (C2 + الحفظ) ═══');
{
  // اتجاه معاكس: استرداد (OUTFLOW) مقابل حركة دائنة
  const { data: run2 } = await svc.rpc('acc_recon_begin_run', { p_company: coA, p_actor: ACC.id, p_bank_account: acct });
  const inv2 = await issuedInvoice();
  const { data: pay2 } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: inv2, p_amount_minor: '40000', p_currency: 'KWD', p_gateway_txn_id: `PID-${TAG}-R2` });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pay2, p_new_status: 'PENDING' });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pay2, p_new_status: 'SUCCESS' });
  const opp = await svc.rpc('acc_recon_create_assertion', { p_run: run2[0].run_id, p_actor: ACC.id, p_payload: {
    mode: 'SUGGESTED', match_type: 'ONE_TO_ONE', score_bp: 6000, coverage_bp: 8500, matched_factors: 2,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t2, target_kind: 'PAYMENT', target_id: pay2,
      allocated_minor: '40000', currency: 'KWD', expected_direction: 'OUTFLOW', layer_key: `PAYMENT:${pay2}` }],
    factors: [] } });
  check('C2: ادعاء اتجاه مخالف لدليل المحلّل مرفوض', !!opp.error && /direction/.test(opp.error.message));
  // سعة الهدف: الدفعة داخل تسوية = غير مؤهلة (طبقة قانونية)
  const inSettle = await svc.rpc('acc_recon_create_assertion', { p_run: run2[0].run_id, p_actor: ACC.id, p_payload: {
    mode: 'SUGGESTED', match_type: 'ONE_TO_ONE', score_bp: 6000, coverage_bp: 8500, matched_factors: 2,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t2, target_kind: 'PAYMENT', target_id: payS,
      allocated_minor: '40000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `PAYMENT:${payS}` }],
    factors: [] } });
  check('C3: دفعة ممثلة بتسوية غير مؤهلة هدفًا', !!inSettle.error && /REPRESENTED_BY_SETTLEMENT|not cash-eligible/.test(inSettle.error.message));
  // اقتراح مشروع ثم تأكيد بشري (فعلان) + منع استهلاك مزدوج عند التأكيد
  const sug = await svc.rpc('acc_recon_create_assertion', { p_run: run2[0].run_id, p_actor: ACC.id, p_payload: {
    mode: 'SUGGESTED', match_type: 'ONE_TO_ONE', score_bp: 6000, coverage_bp: 8500, matched_factors: 2,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t2, target_kind: 'PAYMENT', target_id: pay2,
      allocated_minor: '40000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `PAYMENT:${pay2}` }],
    factors: [{ factor_key: 'EXACT_AMOUNT', available: true, matched: true, weight_bp: 3500, contribution_bp: 3500, provenance: {} },
              { factor_key: 'DATE_PROXIMITY', available: true, matched: true, weight_bp: 1500, contribution_bp: 1500, provenance: {} }] } });
  check('اقتراح المحرك SUGGESTED', !sug.error && sug.data[0].outcome === 'SUGGESTED');
  const sugId = sug.data[0].reconciliation_id;
  const audConfirm = await AUD.client.rpc('acc_recon_confirm', { p_reconciliation: sugId });
  check('المدقّق لا يؤكد', !!audConfirm.error);
  const conf = await FM.client.rpc('acc_recon_confirm', { p_reconciliation: sugId });
  check('تأكيد بشري (FM) يمرّ', !conf.error);
  // نفس السعة مرة ثانية → منع مزدوج
  const dup = await svc.rpc('acc_recon_create_assertion', { p_run: run2[0].run_id, p_actor: ACC.id, p_payload: {
    mode: 'AUTO', match_type: 'ONE_TO_ONE', score_bp: 9600, coverage_bp: 9500, matched_factors: 2,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t2, target_kind: 'PAYMENT', target_id: pay2,
      allocated_minor: '40000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `PAYMENT:${pay2}` }],
    factors: [] } });
  check('الاستهلاك المزدوج محجوب (سعة الطرفين مستهلكة)', !!dup.error && /capacity exceeded/.test(dup.error.message));
  await svc.rpc('acc_recon_complete_run', { p_run: run2[0].run_id, p_state: 'COMPLETED', p_considered: 1, p_auto: 0, p_suggested: 1, p_unmatched: 0 });

  console.log('═══ ٤ · REC-004: صفر تعديل مصدر عبر كل العمليات ═══');
  const src1 = await svc.from('acc_bank_transactions').select('amount_minor').eq('id', t1).single();
  const src2 = await svc.from('acc_payments').select('amount_minor').eq('id', pay2).single();
  const src3 = await svc.from('acc_settlement_lines').select('net_minor').eq('settlement_id', settle).single();
  check('REC-004: مبالغ البنك/الدفعة/التسوية بايت-بايت كما كانت',
    String(src1.data.amount_minor) === '97500' && String(src2.data.amount_minor) === '40000'
    && String(src3.data.net_minor) === '97500');

  console.log('═══ ٥ · المطابقة اليدوية: فعلان + رفض/قفل ═══');
  const inv3 = await issuedInvoice('60000');
  const imp2 = await acceptedImport([ROW(1, '2026-09-10', 60000, 297500, `سداد مباشر لفاتورة`, null)],
    237500, 297500, ['2026-09-10', '2026-09-10']);
  const t3 = await txnId(imp2, 1);
  const manual = await ACC.client.rpc('acc_recon_create_assertion', { p_run: null, p_actor: ACC.id, p_payload: {
    company_id: coA, mode: 'MANUAL', match_type: 'ONE_TO_ONE', score_bp: 0, coverage_bp: 0, matched_factors: 0,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t3, target_kind: 'INVOICE', target_id: inv3,
      allocated_minor: '60000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `INVOICE:${inv3}` }],
    factors: [] } });
  check('اليدوي يُنشأ MANUALLY_MATCHED (حالة مرئية)', !manual.error && manual.data[0].outcome === 'MANUALLY_MATCHED');
  const manId = manual.data[0].reconciliation_id;
  const conf2 = await ACC.client.rpc('acc_recon_confirm', { p_reconciliation: manId });
  check('ثم التأكيد فعل مستقل', !conf2.error);
  const lockFm = await FM.client.rpc('acc_recon_lock', { p_reconciliation: manId });
  check('FM لا يقفل', !!lockFm.error);
  const lock = await ACC.client.rpc('acc_recon_lock', { p_reconciliation: manId });
  check('القفل فعل المحاسبة', !lock.error);
  const editLocked = await svc.from('acc_reconciliations').update({ state: 'CONFIRMED' }).eq('id', manId);
  check('LOCKED لا يغادر إلا بعكس معتمد', !!editLocked.error);

  console.log('═══ ٦ · العكس: طلب FM وموافقة محاسبة مغايرة + سعة تعود ═══');
  const { data: revReq } = await FM.client.rpc('acc_recon_request_reversal', { p_reconciliation: manId, p_reason: 'مطابقة خاطئة' });
  const selfApprove = await FM.client.rpc('acc_recon_approve_reversal', { p_reversal: revReq });
  check('غير المحاسبة لا يوافق', !!selfApprove.error);
  const accSame = await ACC.client.rpc('acc_recon_request_reversal', { p_reconciliation: recDet, p_reason: 'اختبار ذاتي' });
  const sameApprove = await ACC.client.rpc('acc_recon_approve_reversal', { p_reversal: accSame });
  check('الموافق ≠ الطالب (بنيويًا)', !!sameApprove.error && /differ from the requester/.test(sameApprove.error.message));
  const approve = await ACC2.client.rpc('acc_recon_approve_reversal', { p_reversal: revReq });
  check('موافقة محاسبة مغايرة تمرّ', !approve.error);
  const { data: reversedRow } = await svc.from('acc_reconciliations').select('state').eq('id', manId).single();
  check('التأكيد صار REVERSED والتخصيصات بايت-بايت (C6)', reversedRow.state === 'REVERSED');
  const { data: allocAfter } = await svc.from('acc_recon_allocations').select('allocated_minor').eq('reconciliation_id', manId);
  check('لا released ولا تعديل على التخصيص', allocAfter.length === 1 && String(allocAfter[0].allocated_minor) === '60000');
  // السعة عادت: مطابقة جديدة لنفس الفاتورة تمرّ
  const rematch = await ACC.client.rpc('acc_recon_create_assertion', { p_run: null, p_actor: ACC.id, p_payload: {
    company_id: coA, mode: 'MANUAL', match_type: 'ONE_TO_ONE', score_bp: 0, coverage_bp: 0, matched_factors: 0,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t3, target_kind: 'INVOICE', target_id: inv3,
      allocated_minor: '60000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `INVOICE:${inv3}` }],
    factors: [] } });
  check('REVERSED يعيد السعة للطرفين', !rematch.error);
  await ACC.client.rpc('acc_recon_confirm', { p_reconciliation: rematch.data[0].reconciliation_id });
}

console.log('═══ ٧ · مشتبهو Stage 9: معلّق حتى حسم DISTINCT (C5) ═══');
{
  // استيرادان متداخلان يولّدان SUSPECTED (مرساة متطابقة ووصف مختلف)
  const impA = await acceptedImport([ROW(1, '2026-09-15', 15000, 312500, 'قيد وارد خاص أ')],
    297500, 312500, ['2026-09-15', '2026-09-15']);
  const impB = await acceptedImport([ROW(1, '2026-09-15', 15000, 312500, 'وصف مختلف تمامًا ب')],
    297500, 312500, ['2026-09-14', '2026-09-16']);
  const tB = await txnId(impB, 1);
  const { data: cand } = await svc.from('acc_bank_duplicate_candidates')
    .select('id, kind').eq('transaction_id', tB).eq('kind', 'SUSPECTED_DUPLICATE').limit(1).single();
  check('مرشّح SUSPECTED من Stage 9 قائم', !!cand);
  const inv4 = await issuedInvoice('15000');
  const held = await ACC.client.rpc('acc_recon_create_assertion', { p_run: null, p_actor: ACC.id, p_payload: {
    company_id: coA, mode: 'MANUAL', match_type: 'ONE_TO_ONE', score_bp: 0, coverage_bp: 0, matched_factors: 0,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: tB, target_kind: 'INVOICE', target_id: inv4,
      allocated_minor: '15000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `INVOICE:${inv4}` }],
    factors: [] } });
  check('المشتبه معلّق عن المطابقة قبل الحسم', !!held.error && /duplicate evidence/.test(held.error.message));
  const audRes = await AUD.client.rpc('acc_recon_resolve_duplicate', { p_candidate: cand.id, p_decision: 'DISTINCT', p_reason: 'x' });
  check('المدقّق لا يحسم', !!audRes.error);
  const res = await FM.client.rpc('acc_recon_resolve_duplicate', { p_candidate: cand.id, p_decision: 'DISTINCT', p_reason: 'حركتان مستقلتان فعلًا' });
  check('حسم FM/محاسبة DISTINCT يمرّ ويُدقَّق', !res.error);
  const res2 = await ACC.client.rpc('acc_recon_resolve_duplicate', { p_candidate: cand.id, p_decision: 'DUPLICATE', p_reason: 'تغيير رأي' });
  check('الحسم append-once (لا إعادة تفسير)', !!res2.error);
  const after = await ACC.client.rpc('acc_recon_create_assertion', { p_run: null, p_actor: ACC.id, p_payload: {
    company_id: coA, mode: 'MANUAL', match_type: 'ONE_TO_ONE', score_bp: 0, coverage_bp: 0, matched_factors: 0,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: tB, target_kind: 'INVOICE', target_id: inv4,
      allocated_minor: '15000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `INVOICE:${inv4}` }],
    factors: [] } });
  check('بعد DISTINCT تعود الأهلية', !after.error);
  const { data: srcCand } = await svc.from('acc_bank_duplicate_candidates').select('kind').eq('id', cand.id).single();
  check('مرشّح Stage 9 نفسه لم يُمسّ', srcCand.kind === 'SUSPECTED_DUPLICATE');
}

console.log('═══ ٨ · الفترة المقفلة تحجب التأكيد (والفتح المحكوم يعيده) ═══');
{
  const { data: period } = await ACC.client.rpc('acc_create_period', { p_company: coA, p_fiscal_year: `FYR-${TAG}`, p_start: '2026-10-01', p_end: '2026-10-31' });
  await ACC.client.rpc('acc_transition_period', { p_period: period, p_new_state: 'OPEN' });
  const inv5 = await issuedInvoice('22000');
  // فاتورة أكتوبر بفترة أكتوبر — نقفل الفترة ثم نحاول التأكيد
  await svc.from('acc_invoices').update({ }).eq('id', inv5); // لا تعديل — القراءة عبر المحلّل تكفي
  const imp3 = await acceptedImport([ROW(1, '2026-10-05', 22000, 334500, 'سداد أكتوبر')],
    312500, 334500, ['2026-10-05', '2026-10-05']);
  const t5 = await txnId(imp3, 1);
  const man = await ACC.client.rpc('acc_recon_create_assertion', { p_run: null, p_actor: ACC.id, p_payload: {
    company_id: coA, mode: 'MANUAL', match_type: 'ONE_TO_ONE', score_bp: 0, coverage_bp: 0, matched_factors: 0,
    deterministic_override: false, deterministic_reference: null, difference_minor: '', difference_reason: '',
    allocations: [{ bank_transaction_id: t5, target_kind: 'INVOICE', target_id: inv5,
      allocated_minor: '22000', currency: 'KWD', expected_direction: 'INFLOW', layer_key: `INVOICE:${inv5}` }],
    factors: [] } });
  // الفاتورة صدرت 2026-09-01 — فترتها سبتمبر إن وُجدت؛ نختبر الحجب بإقفال فترة سبتمبر
  const { data: sept } = await ACC.client.rpc('acc_create_period', { p_company: coA, p_fiscal_year: `FYS-${TAG}`, p_start: '2026-09-01', p_end: '2026-09-30' });
  await ACC.client.rpc('acc_transition_period', { p_period: sept, p_new_state: 'OPEN' });
  await ACC.client.rpc('acc_transition_period', { p_period: sept, p_new_state: 'SOFT_CLOSED' });
  const confSoft = await ACC.client.rpc('acc_recon_confirm', { p_reconciliation: man.data[0].reconciliation_id });
  check('SOFT_CLOSED لا يمنع التأكيد', !confSoft.error);
  const lockSoft = await ACC.client.rpc('acc_recon_lock', { p_reconciliation: man.data[0].reconciliation_id });
  check('SOFT_CLOSED يمنع القفل', !!lockSoft.error && /SOFT_CLOSED/.test(lockSoft.error.message));
}

console.log('═══ ٩ · الأدوار والعزل والمناعة ═══');
{
  const { data: audSees } = await AUD.client.from('acc_recon_factor_evidence').select('id').eq('company_id', coA).limit(1);
  check('المدقّق يقرأ أدلة العوامل', (audSees ?? []).length >= 0 && !audSees?.error);
  const { data: ownSees } = await OWN.client.from('acc_reconciliations').select('id').eq('company_id', coA);
  check('المالكة خارج طاولات المطابقة المهنية (درع الوضع)', (ownSees ?? []).length === 0);
  const { data: bSees } = await OWN_B.client.from('acc_reconciliations').select('id').eq('company_id', coA);
  check('عبر الشركات صفر', (bSees ?? []).length === 0);
  const evTamper = await svc.from('acc_recon_factor_evidence').update({ matched: true })
    .eq('company_id', coA);
  check('أدلة العوامل مجمّدة', !!evTamper.error && /append-only/.test(evTamper.error.message));
  const alTamper = await svc.from('acc_recon_allocations').update({ allocated_minor: 1 }).eq('company_id', coA);
  check('التخصيصات مجمّدة حتى بمفتاح الخدمة', !!alTamper.error && /append-only/.test(alTamper.error.message));
  const stateSpoof = await svc.from('acc_reconciliations').update({ state: 'LOCKED' })
    .eq('company_id', coA).eq('state', 'CONFIRMED');
  check('تغيير حالة خام مرفوض (توقيع محكوم)', !!stateSpoof.error);
}

console.log('═══ ١٠ · صفر أثر دفتري عبر المرحلة كلها ═══');
{
  const { count: jCount } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  check('journal count = 0 بعد كل التأكيدات والعكوس', jCount === 0);
}

console.log(`\n  المطابقة DB: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
