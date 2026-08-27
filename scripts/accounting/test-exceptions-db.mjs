#!/usr/bin/env node
/**
 * Stage 11 — الاستثناءات + وضع المالكة على القاعدة — **PENDING STAGING**
 * (لا يُشغَّل قبل تطبيق هجرة 2026-09-03 يدويًا على ghiras-staging).
 *
 * يثبت سلوكيًا: المحوّلات الثمانية بجولات تغطية موقّعة (C4)،
 * idempotency الهوية الاقتصادية (C3)، روابط الحقائق المتعددة (C2)،
 * رفض نوعي Stage 13 وأصل FIXTURE بنيويًا (C1)، ACK ≠ RESOLVE،
 * الحل بإثبات شفاء حتمي لكل نوع (سلبيات وإيجابيات)، التكرار
 * الموصول، مرآة الأدوار، وصل موانع الإغلاق ACC-024، لوحة المالكة
 * الصادقة مع إسناد اللقطات، RLS/الحَجب، مناعة الأدلة، وصفر أثر
 * دفتري/مصدري.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runIngestion } from '../../src/lib/accounting/exceptions/adapters.ts';
import { computeDashboard } from '../../src/lib/accounting/owner/queries.ts';
import { buildDraftLines, resolveInvoiceTaxPosture } from '../../src/lib/accounting/owner/tax.ts';
import { execSync } from 'node:child_process';
// محلّل Stage 2 الحقيقي عبر نمط استهلاكه المعتمد (ترجمة .acc-test)
execSync('npx tsc src/lib/accounting/*.ts --outDir .acc-test --module nodenext --moduleResolution nodenext --target es2022 --strict', { stdio: 'inherit' });
const { resolveVatStatus } = await import('../../.acc-test/resolvers.js');

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (URL?.includes('prod')) { console.error('⛔ ليست بيئة Staging'); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };
const TAG = 'x' + Date.now().toString(36);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// ═ حارس الجاهزية: الهجرة مطبقة؟ ═
{
  const probe = await svc.from('acc_exceptions').select('id').limit(1);
  if (probe.error) {
    console.error('⛔ PENDING STAGING: هجرة 2026-09-03 غير مطبقة بعد —', probe.error.message);
    process.exit(1);
  }
}

async function mintUser(t) {
  const email = `acc11-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
// تصلب التجهيزة: رفض RPC المحكوم يُبلَّغ بنصه الحقيقي — لا TypeError
// صامت بعد قراءة data[0] عمياء (درس إعادة تشغيل Stage 11 الأولى)
const must = (r, what) => {
  if (r.error) throw new Error(`fixture ${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined
      || (Array.isArray(r.data) && r.data.length === 0)) {
    throw new Error(`fixture ${what}: empty result — setup cannot continue`);
  }
  return r.data;
};
const mustOk = (r, what) => {
  if (r.error) throw new Error(`fixture ${what}: ${r.error.message}`);
  return r.data;
};

const OWN = await mintUser('own'), ACC = await mintUser('acc'), FM = await mintUser('fm'),
      AUD = await mintUser('aud'), OWN_B = await mintUser('ownb');
const coA = must(await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة استثناءات ${TAG}` }), 'company A');
const coB = must(await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة استثناءات باء ${TAG}` }), 'company B');
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [FM, 'FINANCE_MANAGER'], [AUD, 'AUDITOR']])
  await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });

// ════════════ التجهيزات: حقيقة مصدرية لكل نوع حي ════════════
// أ · فرق تسوية: gross−fee−net = +50
const stlA = must(await ACC.client.rpc('acc_record_settlement', {
  p_company: coA, p_provider: 'MYFATOORAH', p_settlement_ref: `st-${TAG}`, p_settled_at: '2026-09-01' }), 'settlement');
mustOk(await ACC.client.rpc('acc_add_settlement_line', {
  p_settlement: stlA, p_payment: null, p_gross: '100000', p_fee: '5000', p_net: '94950', p_currency: 'KWD' }), 'settlement line');

// ب · استرداد فاشل: فاتورة → دفعة ناجحة → استرداد → FAILED
const cust = must(await OWN.client.rpc('acc_create_customer', { p_company: coA, p_name: `عميلة ${TAG}` }), 'customer');
const prod = must(await OWN.client.rpc('acc_create_product', {
  p_company: coA, p_name: `اشتراك ${TAG}`, p_price_minor: '100000', p_currency: 'KWD' }), 'product');
// السطر يطابق عقد Stage 4 المثبت (مرآة test-payments-db حرفيًا):
// التجهيزة الاصطناعية تسجل وضع الكويت المكوَّن حاليًا صراحةً
const inv = must(await OWN.client.rpc('acc_create_invoice_draft', {
  p_company: coA, p_customer: cust, p_currency: 'KWD',
  p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: '100000', currency: 'KWD',
    tax_status: 'NO_TAX_REGIME' }] }), 'invoice draft');
mustOk(await OWN.client.rpc('acc_issue_invoice', { p_invoice: inv, p_issue_date: '2026-09-01' }), 'issue invoice');
const pay = must(await OWN.client.rpc('acc_record_payment', {
  p_company: coA, p_invoice: inv, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `gw-${TAG}` }), 'payment');
mustOk(await OWN.client.rpc('acc_set_payment_status', { p_payment: pay, p_new_status: 'PENDING' }), 'payment PENDING');
mustOk(await OWN.client.rpc('acc_set_payment_status', { p_payment: pay, p_new_status: 'SUCCESS' }), 'payment SUCCESS');
const refund = must(await ACC.client.rpc('acc_request_refund', {
  p_payment: pay, p_amount_minor: '40000', p_effective: '2026-09-02', p_policy_id: 'POL-009',
  p_external_refund_id: `rf-${TAG}` }), 'refund');
mustOk(await ACC.client.rpc('acc_set_refund_status', { p_refund: refund, p_new_status: 'PROCESSING' }), 'refund PROCESSING');
mustOk(await ACC.client.rpc('acc_set_refund_status', { p_refund: refund, p_new_status: 'FAILED' }), 'refund FAILED');

// ج · مصروفات يدوية: غموض + توأم مرجع مورد + سليم بلا مستند —
// السطر يطابق عقد Stage 8 المثبت حرفيًا: الوضع الضريبي يُسجَّل
// صراحةً (NO_TAX_REGIME حالة حقيقية لا إغفال) + category_key إلزامي
const vend = must(await OWN.client.rpc('acc_create_vendor', { p_company: coA, p_name: `مورد ${TAG}` }), 'vendor');
const vend2 = must(await OWN.client.rpc('acc_create_vendor', { p_company: coA, p_name: `مورد ثانٍ ${TAG}` }), 'vendor 2');
const LINE = (amt) => [{ description: 'بند اختبار', amount_minor: String(amt), currency: 'KWD',
  base_amount_minor: String(amt), tax_status: 'NO_TAX_REGIME', category_key: 'GENERAL' }];
async function manualExpense(key, vendor, date, ref, amt) {
  const rows = must(await OWN.client.rpc('acc_create_expense_draft', {
    p_company: coA, p_submission_key: `${key}-${TAG}`, p_vendor: vendor, p_expense_date: date,
    p_vendor_reference: ref, p_description: key, p_source_kind: 'MANUAL',
    p_manual_justification: 'مصدر يدوي لاختبار مرحلي — التبرير الكتابي حاضر', p_lines: LINE(amt) }),
    `expense draft ${key}`);
  return rows[0].expense_id;
}
const expAmb = await manualExpense('amb', vend, '2026-09-01', null, 5000);
mustOk(await OWN.client.rpc('acc_submit_expense', { p_expense: expAmb, p_mark_uncertain: true }), 'submit amb');
const expDup1 = await manualExpense('dup1', vend2, '2026-09-02', `INV-77-${TAG}`, 7000);
mustOk(await OWN.client.rpc('acc_submit_expense', { p_expense: expDup1 }), 'submit dup1');
const expDup2 = await manualExpense('dup2', vend2, '2026-09-03', `INV-77-${TAG}`, 9000);
mustOk(await OWN.client.rpc('acc_submit_expense', { p_expense: expDup2 }), 'submit dup2');
const expNoDoc = await manualExpense('nodoc', vend, '2026-09-04', null, 3000);
mustOk(await OWN.client.rpc('acc_submit_expense', { p_expense: expNoDoc }), 'submit nodoc');

// د · حدث مزوّد مستردّ بلا معالجة (دليل غياب webhook) + جولة استرداد
must(await svc.rpc('acc_mf_record_recovery', {
  p_company: coA, p_start: '2026-09-01T00:00:00Z', p_end: '2026-09-03T00:00:00Z', p_pages: 1, p_events: 1 }), 'recovery run');
const mfRows = must(await svc.rpc('acc_mf_record_event', {
  p_company: coA, p_event_code: 1, p_event_name: 'TransactionsStatusChanged',
  p_event_reference: `ref-${TAG}`, p_source: 'RECOVERY', p_signature_valid: true,
  p_payload: { test: TAG }, p_business_key: `bk-${TAG}` }), 'mf event');
const mfEvent = Array.isArray(mfRows) ? mfRows[0].event_id : mfRows;

// هـ · حركة بنك بلا أصل: جولة Stage 9 مقبولة + جولة مطابقة بحدث UNMATCHED
const acct = must(await OWN.client.rpc('acc_create_bank_account', {
  p_company: coA, p_bank_label: `بنك ${TAG}`, p_account_identifier: `KW11TEST${TAG}0001`, p_currency: 'KWD' }), 'bank account');
const SPEC = { header: { skip_rows: 1 }, columns: { txn_date: 0, description: 1, amount: 2, balance: 3 },
  amount_semantics: 'SIGNED_AMOUNT', date_format: 'DD/MM/YYYY', currency_mode: 'FIXED',
  fixed_currency: 'KWD', balance_direction: 'AFTER_ROW' };
const layout = must(await ACC.client.rpc('acc_add_bank_layout', {
  p_company: coA, p_layout_key: `csv-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: SPEC }), 'layout');
mustOk(await ACC.client.rpc('acc_activate_bank_layout', { p_layout: layout }), 'activate layout');
async function bankDoc(content) {
  const cap = `xb-${TAG}-${Math.random().toString(36).slice(2)}`;
  const d = must(await svc.rpc('acc_create_document', { p_company: coA, p_actor: OWN.id, p_capture_id: cap,
    p_doc_type: 'BANK_STATEMENT', p_source: 'FILE_UPLOAD', p_original_filename: 's.csv', p_mime: 'text/csv', p_expected_pages: 1 }), 'create document');
  const id = d[0].document_id;
  mustOk(await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'text/csv' }), 'register page');
  mustOk(await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 5, p_server_sha256: sha(content) }), 'confirm page');
  mustOk(await svc.rpc('acc_finalize_document', { p_document: id }), 'finalize document');
  return id;
}
const stDoc = await bankDoc(`stmt-${TAG}`);
const impRows = must(await svc.rpc('acc_create_bank_import', {
  p_company: coA, p_actor: OWN.id, p_bank_account: acct, p_document: stDoc, p_layout: layout, p_supersedes: null }), 'bank import');
const imp = impRows[0].import_id;
mustOk(await svc.rpc('acc_begin_bank_parse', { p_import: imp, p_actor: OWN.id }), 'begin parse');
mustOk(await svc.rpc('acc_record_bank_rows', { p_import: imp, p_rows: [{
  row_no: 1, txn_date: '2026-09-02', value_date: '2026-09-02', description_raw: `HAWALA ${TAG}`,
  description_canon: `HAWALA ${TAG}`.toUpperCase(), amount_minor: '25000',
  running_balance_minor: '25000', reference: '', raw: {} }] }), 'record rows');
mustOk(await svc.rpc('acc_normalize_bank_import', { p_import: imp,
  p_period_start: '2026-09-01', p_period_end: '2026-09-03',
  p_opening_minor: '0', p_closing_minor: '25000',
  p_assertion_source: 'EXPLICIT_SOURCE', p_assertion_derivation: null,
  p_freshness: '2026-09-03', p_detected_currency: null, p_detected_account_fp: null }), 'normalize');
mustOk(await svc.rpc('acc_dedup_bank_import', { p_import: imp }), 'dedup');
mustOk(await OWN.client.rpc('acc_accept_bank_import', { p_import: imp }), 'accept import');
const bankTxn = must(await svc.from('acc_bank_transactions')
  .select('id').eq('import_id', imp).eq('row_no', 1).single(), 'bank txn').id;
const rsettings = must(await ACC.client.rpc('acc_recon_add_settings', {
  p_company: coA, p_auto_bp: 9000, p_review_bp: 7000, p_ask_bp: 5000, p_date_window_days: 3,
  p_weights: { EXACT_AMOUNT: 4000, EXPLICIT_REFERENCE: 2500, DATE_PROXIMITY: 1500,
    COUNTERPARTY_CANONICAL: 1000, HISTORICAL_CONFIRMED_MAPPING: 500, GROUP_PLAUSIBILITY: 500 } }), 'recon settings');
mustOk(await ACC.client.rpc('acc_recon_activate_settings', { p_settings: rsettings }), 'activate settings');
const runRows = must(await svc.rpc('acc_recon_begin_run', {
  p_company: coA, p_actor: ACC.id, p_bank_account: acct }), 'recon run');
const rrun = (Array.isArray(runRows) ? runRows[0] : runRows).run_id;
mustOk(await svc.rpc('acc_recon_record_event', { p_run: rrun, p_bank_txn: bankTxn,
  p_condition: 'UNMATCHED_BANK_TRANSACTION', p_blocking: false, p_detail: {} }), 'recon event');
mustOk(await svc.rpc('acc_recon_complete_run', { p_run: rrun, p_state: 'COMPLETED',
  p_considered: 1, p_auto: 0, p_suggested: 0, p_unmatched: 1 }), 'complete run');

const journalBaseline = (await svc.from('acc_journal_entries')
  .select('id', { count: 'exact', head: true }).eq('company_id', coA)).count ?? 0;

console.log('\n═══ ١ · الجولة الأولى: المحوّلات الثمانية بتغطية موقّعة ═══');
const run1 = await runIngestion(svc, coA, ACC.id);
{
  check('ثماني جولات مسجلة', run1.length === 8);
  check('كل الجولات نجحت (التغطية كاملة بعد التجهيز)',
    run1.every((r) => r.status === 'SUCCEEDED'), JSON.stringify(run1));
  const by = Object.fromEntries(run1.map((r) => [r.adapterKey, r]));
  check('فرق التسوية: قضية واحدة', by.SETTLEMENT_DIFFERENCE.produced === 1);
  check('استرداد فاشل: قضية واحدة', by.FAILED_REFUND.produced === 1);
  check('مراجعات المصروف: غموض ١ + توأم ١', by.EXPENSE_REVIEW.produced === 2);
  check('بلا مستند: ٤ مصروفات يدوية نشطة', by.MISSING_DOCUMENT.produced === 4);
  check('webhook غائب: حدث استرداد واحد بلا معالجة', by.MISSING_WEBHOOK.produced === 1);
  check('حركة بنك بلا أصل: واحدة', by.UNMATCHED_BANK.produced === 1);
  check('لا إقفال واقف بعد (لا فترة SOFT_CLOSED)', by.PERIOD_CLOSE.produced === 0);
  const { data: runsTable } = await svc.from('acc_exception_ingestion_runs')
    .select('adapter_key, status, produced_count, coverage_as_of').eq('company_id', coA);
  check('سجل التغطية C4 محفوظ لكل محوّل', (runsTable ?? []).length === 8
    && runsTable.every((r) => r.status === 'SUCCEEDED'));
  check('تغطية webhook = نافذة الاسترداد الفعلية',
    runsTable.find((r) => r.adapter_key === 'MISSING_WEBHOOK')?.coverage_as_of?.startsWith('2026-09-03'));
}

console.log('═══ ٢ · C3 idempotency: الجولة الثانية تحديث لا تكرار ═══');
{
  const before = (await svc.from('acc_exceptions').select('id', { count: 'exact', head: true })
    .eq('company_id', coA)).count;
  const run2 = await runIngestion(svc, coA, ACC.id);
  const after = (await svc.from('acc_exceptions').select('id', { count: 'exact', head: true })
    .eq('company_id', coA)).count;
  check('صفر صفوف جديدة', after === before, `${before}→${after}`);
  check('العشر كلها REFRESHED', run2.reduce((a, r) => a + r.refreshed, 0) === 10
    && run2.reduce((a, r) => a + r.produced, 0) === 0);
  const { data: stl } = await svc.from('acc_exceptions').select('*')
    .eq('company_id', coA).eq('exception_type', 'SETTLEMENT_DIFFERENCE').neq('state', 'RESOLVED').single();
  check('occurrence ثابت على التحديث', stl.occurrence === 1);
  check('last_detected_at يتقدم والهوية ثابتة',
    stl.last_detected_at >= stl.first_detected_at && stl.origin === 'SOURCE_ADAPTER');
  check('الأولوية ملقوطة من السجل الثابت', stl.priority === 'CRITICAL');
  const { data: links } = await svc.from('acc_exception_source_links')
    .select('source_kind, source_role').eq('exception_id', stl.id);
  check('C2: روابط متعددة — تسوية أولية + أسطر أدلة',
    links.filter((l) => l.source_role === 'PRIMARY').length === 1
    && links.some((l) => l.source_kind === 'SETTLEMENT_LINE'));
}

const openExc = async (type) => (await svc.from('acc_exceptions').select('*')
  .eq('company_id', coA).eq('exception_type', type).neq('state', 'RESOLVED')).data;
const stlExc = (await openExc('SETTLEMENT_DIFFERENCE'))[0];
const refundExc = (await openExc('FAILED_REFUND'))[0];
const ambExc = (await openExc('PERSONAL_BUSINESS_AMBIGUITY'))[0];
const dupExc = (await openExc('SUSPECTED_DUPLICATE'))[0];
const webhookExc = (await openExc('MISSING_WEBHOOK'))[0];
const bankExc = (await openExc('UNMATCHED_BANK_TRANSACTION'))[0];
const docExcs = await openExc('MISSING_DOCUMENT');
const docExcNoDoc = docExcs.find((e) => e.issue_key === `MISSING_DOC:${expNoDoc}`);
const docExcDup2 = docExcs.find((e) => e.issue_key === `MISSING_DOC:${expDup2}`);

console.log('═══ ٣ · C1 بنيويًا: لا FIXTURE ولا نوعا Stage 13 في الإنتاج ═══');
{
  const runId = await svc.rpc('acc_exception_begin_ingestion', {
    p_company: coA, p_actor: ACC.id, p_adapter_key: 'EXPENSE_REVIEW' });
  const large = await svc.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'LARGE_UNUSUAL_EXPENSE', p_issue_key: `L:${TAG}`,
    p_what_key: 'EXC_LARGE_EXPENSE_WHAT', p_why_key: 'EXC_LARGE_EXPENSE_WHY',
    p_params: {}, p_sources: [{ kind: 'EXPENSE', id: expNoDoc, role: 'PRIMARY' }] });
  check('LARGE_UNUSUAL_EXPENSE يُرفض: PENDING_STAGE_13',
    large.error?.message.includes('PENDING_STAGE_13'));
  const unknown = await svc.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'UNKNOWN_EXPENSE', p_issue_key: `U:${TAG}`,
    p_what_key: 'EXC_UNKNOWN_EXPENSE_WHAT', p_why_key: 'EXC_UNKNOWN_EXPENSE_WHY',
    p_params: {}, p_sources: [{ kind: 'EXPENSE', id: expNoDoc, role: 'PRIMARY' }] });
  check('UNKNOWN_EXPENSE يُرفض: PENDING_STAGE_13',
    unknown.error?.message.includes('PENDING_STAGE_13'));
  const fixture = await svc.from('acc_exceptions').insert({
    company_id: coA, exception_type: 'MISSING_DOCUMENT', priority: 'ROUTINE',
    issue_key: `F:${TAG}`, origin: 'FIXTURE',
    owner_what_key: 'EXC_MISSING_DOC_WHAT', owner_why_key: 'EXC_MISSING_DOC_WHY' });
  check('أصل FIXTURE مستحيل بنيويًا (CHECK)', !!fixture.error);
  const badSrc = await svc.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'MISSING_DOCUMENT', p_issue_key: `BS:${TAG}`,
    p_what_key: 'EXC_MISSING_DOC_WHAT', p_why_key: 'EXC_MISSING_DOC_WHY',
    p_params: {}, p_sources: [{ kind: 'EXPENSE', id: crypto.randomUUID(), role: 'PRIMARY' }] });
  check('حقيقة مصدرية غير قائمة تُرفض: SOURCE_FACT_INVALID',
    badSrc.error?.message.includes('SOURCE_FACT_INVALID'));
  const noPrimary = await svc.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'MISSING_DOCUMENT', p_issue_key: `NP:${TAG}`,
    p_what_key: 'EXC_MISSING_DOC_WHAT', p_why_key: 'EXC_MISSING_DOC_WHY',
    p_params: {}, p_sources: [{ kind: 'EXPENSE', id: expNoDoc, role: 'EVIDENCE' }] });
  check('بلا PRIMARY يُرفض: حقيقة أولية واحدة بالضبط',
    noPrimary.error?.message.includes('PRIMARY'));
  const claim = await svc.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'FAILED_REFUND', p_issue_key: `MISSING_DOC:${expNoDoc}`,
    p_what_key: 'EXC_FAILED_REFUND_WHAT', p_why_key: 'EXC_FAILED_REFUND_WHY',
    p_params: {}, p_sources: [{ kind: 'REFUND', id: refund, role: 'PRIMARY' }] });
  check('مفتاح قضية محجوز لنوع آخر يُرفض', claim.error?.message.includes('already claimed'));
  await svc.rpc('acc_exception_complete_ingestion', {
    p_run: runId.data, p_status: 'SUCCEEDED', p_produced: 0, p_refreshed: 0 });
  const authIngest = await ACC.client.rpc('acc_exception_ingest', {
    p_run: runId.data, p_type: 'MISSING_DOCUMENT', p_issue_key: `A:${TAG}`,
    p_what_key: 'EXC_MISSING_DOC_WHAT', p_why_key: 'EXC_MISSING_DOC_WHY',
    p_params: {}, p_sources: [] });
  check('الاستيعاب خدمة حصرًا — authenticated ممنوع', !!authIngest.error);
  const badActor = await svc.rpc('acc_exception_begin_ingestion', {
    p_company: coA, p_actor: AUD.id, p_adapter_key: 'EXPENSE_REVIEW' });
  check('المدقق لا يطلق جولات استيعاب', !!badActor.error);
}

console.log('═══ ٤ · ACK ≠ RESOLVE: التصديق علمٌ والقضية باقية ═══');
{
  const ack = await OWN.client.rpc('acc_exception_acknowledge', { p_exception: stlExc.id });
  check('المالكة تصدّق', !ack.error, ack.error?.message);
  const { data: after } = await svc.from('acc_exceptions').select('state, acknowledged_at, acknowledged_by')
    .eq('id', stlExc.id).single();
  check('الحالة لم تتغير — OPEN', after.state === 'OPEN');
  check('التصديق موثّق بهوية المالكة', after.acknowledged_by === OWN.id && after.acknowledged_at !== null);
  const again = await OWN.client.rpc('acc_exception_acknowledge', { p_exception: stlExc.id });
  check('تصديق ثانٍ idempotent', !again.error);
  const aud = await AUD.client.rpc('acc_exception_acknowledge', { p_exception: refundExc.id });
  check('المدقق لا يصدّق', !!aud.error);
  const seen = await AUD.client.rpc('acc_exception_mark_seen', { p_exception: stlExc.id });
  check('المدقق يعلّم SEEN (قراءة مشروعة)', !seen.error);
  const { data: events } = await svc.from('acc_exception_events')
    .select('event').eq('exception_id', stlExc.id);
  check('أحداث SEEN/ACKNOWLEDGED محفوظة',
    events.some((e) => e.event === 'ACKNOWLEDGED') && events.some((e) => e.event === 'SEEN'));
}

console.log('═══ ٥ · الحل: بوابات الدور والنوع، والشفاء مُثبت لا مُدّعى ═══');
{
  const ownTry = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'PROVIDER_CORRECTION_RECORDED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: stlA });
  check('المالكة لا تحل فرق تسوية (دور)', !!ownTry.error);
  const decision = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'PROVIDER_CORRECTION_RECORDED',
    p_kind: 'DECISION', p_reason: 'قرار' });
  check('استثناء مال لا يُغلق بقرار — DOMAIN_ACTION حصرًا', !!decision.error);
  const badKey = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'RESOLVE_ANY', p_kind: 'DOMAIN_ACTION', p_domain_ref: stlA });
  check('مفتاح فعل خارج المجموعة المغلقة يُرفض', badKey.error?.message.includes('closed action set'));
  const notCured = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'PROVIDER_CORRECTION_RECORDED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: stlA });
  check('الباقي ٥٠ ≠ ٠ → DOMAIN_CURE_NOT_PROVEN',
    notCured.error?.message.includes('DOMAIN_CURE_NOT_PROVEN'));
  // الشفاء الحقيقي: سطر تصحيح مزوّد يجعل المجموع صفرًا
  await ACC.client.rpc('acc_add_settlement_line', {
    p_settlement: stlA, p_payment: null, p_gross: '0', p_fee: '50', p_net: '0', p_currency: 'KWD' });
  const cured = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'PROVIDER_CORRECTION_RECORDED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: stlA,
    p_decision: { note: 'corrective line' } });
  check('بعد إثبات الشفاء: RESOLVED', !cured.error && cured.data?.[0]?.outcome === 'RESOLVED',
    cured.error?.message);
  const { data: res } = await svc.from('acc_exception_resolutions').select('*')
    .eq('exception_id', stlExc.id).single();
  check('قرار الحل كامل الأثر: فعل + نوع + مرجع + فاعل + دور',
    res.action_key === 'PROVIDER_CORRECTION_RECORDED' && res.resolution_kind === 'DOMAIN_ACTION'
    && res.domain_ref === stlA && res.resolved_by === ACC.id && res.resolver_role === 'ACCOUNTANT');
  const twice = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: stlExc.id, p_action_key: 'PROVIDER_CORRECTION_RECORDED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: stlA });
  check('حل ثانٍ = ALREADY_RESOLVED منظمًا', twice.data?.[0]?.outcome === 'ALREADY_RESOLVED');
}

console.log('═══ ٦ · جواب المالكة على الغموض — عبر الدالة المحكومة القائمة ═══');
{
  const early = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: ambExc.id, p_action_key: 'REVIEW_RESOLVED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: expAmb });
  check('قبل حسم المراجعة: NOT_PROVEN', early.error?.message.includes('DOMAIN_CURE_NOT_PROVEN'));
  const review = await OWN.client.rpc('acc_resolve_expense_review', {
    p_expense: expAmb, p_resolution: 'PROCEED', p_reason: 'مصروف مشروعي أكيد' });
  check('المالكة تجاوب عبر acc_resolve_expense_review (مسموح أصلًا)', !review.error, review.error?.message);
  const resolve = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: ambExc.id, p_action_key: 'REVIEW_RESOLVED', p_kind: 'DOMAIN_ACTION',
    p_reason: 'مصروف مشروعي أكيد',
    p_decision: { question: 'PERSONAL_OR_BUSINESS', answer: 'BUSINESS' }, p_domain_ref: expAmb });
  check('لمسة المالكة تغلق بإثبات الشفاء', resolve.data?.[0]?.outcome === 'RESOLVED', resolve.error?.message);
  const { data: dec } = await svc.from('acc_exception_resolutions')
    .select('decision, resolver_role').eq('exception_id', ambExc.id).single();
  check('الجواب المنظّم محفوظ (غذاء Stage 13 المستقبلي)',
    dec.decision.answer === 'BUSINESS' && dec.resolver_role === 'BUSINESS_OWNER');
}

console.log('═══ ٧ · التوأم والمستندات: قرارات مسببة وقيود أدوار ═══');
{
  // توأم المرجع: المحاسبة تلغيه ثم تغلق بإثبات خروجه من المراجعة
  await ACC.client.rpc('acc_resolve_expense_review', {
    p_expense: expDup2, p_resolution: 'VOID', p_reason: 'توأم مرجع مورد مؤكد' });
  const dupRes = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: dupExc.id, p_action_key: 'REVIEW_RESOLVED', p_kind: 'DOMAIN_ACTION',
    p_reason: 'توأم', p_domain_ref: expDup2 });
  check('توأم المصروف انغلق بعد VOID', dupRes.data?.[0]?.outcome === 'RESOLVED', dupRes.error?.message);
  // بلا مستند (الملغى): قرار مسبب من المحاسبة يكفي — DECISION
  const noReason = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: docExcDup2.id, p_action_key: 'NO_DOCUMENT_REASONED', p_kind: 'DECISION' });
  check('قرار بلا سبب كتابي يُرفض', !!noReason.error);
  const reasoned = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: docExcDup2.id, p_action_key: 'NO_DOCUMENT_REASONED', p_kind: 'DECISION',
    p_reason: 'المصروف أُلغي — لا دليل يلزم' });
  check('قرار مسبب يغلق النوع ١٠', reasoned.data?.[0]?.outcome === 'RESOLVED', reasoned.error?.message);
  const ownDecision = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: docExcNoDoc.id, p_action_key: 'NO_DOCUMENT_REASONED', p_kind: 'DECISION',
    p_reason: 'ودي' });
  check('قرار «بلا مستند» محاسبي لا مالكي', !!ownDecision.error);
  // مسار المالكة الحقيقي: إرفاق ورقة مقفلة ثم إثبات الرابط
  const notLinked = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: docExcNoDoc.id, p_action_key: 'DOCUMENT_ATTACHED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: crypto.randomUUID() });
  check('بلا رابط مستند: NOT_PROVEN', notLinked.error?.message.includes('DOMAIN_CURE_NOT_PROVEN'));
  const receipt = await bankDoc(`receipt-${TAG}`);
  await OWN.client.rpc('acc_link_document', {
    p_document: receipt, p_target_kind: 'EXPENSE', p_target: expNoDoc, p_link_role: 'ATTACHMENT' });
  const attached = await OWN.client.rpc('acc_exception_resolve', {
    p_exception: docExcNoDoc.id, p_action_key: 'DOCUMENT_ATTACHED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: receipt });
  check('إرفاق المالكة يغلق بإثبات رابط FINALIZED',
    attached.data?.[0]?.outcome === 'RESOLVED', attached.error?.message);
}

console.log('═══ ٨ · الاسترداد الفاشل وwebhook والبنك: سلبيات صادقة + شفاء ═══');
{
  const still = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: refundExc.id, p_action_key: 'REFUND_RETRIED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: refund });
  check('استرداد ما زال FAILED → NOT_PROVEN', still.error?.message.includes('still FAILED'));
  await ACC.client.rpc('acc_set_refund_status', { p_refund: refund, p_new_status: 'REQUESTED' });
  const retried = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: refundExc.id, p_action_key: 'REFUND_RETRIED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: refund });
  check('إعادة المحاولة المحكومة تشفي', retried.data?.[0]?.outcome === 'RESOLVED', retried.error?.message);
  const webhookTry = await FM.client.rpc('acc_exception_resolve', {
    p_exception: webhookExc.id, p_action_key: 'RECOVERED_EVENT_PROCESSED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: mfEvent });
  check('حدث مستردّ بلا معالجة → NOT_PROVEN (يبقى حرجًا مفتوحًا)',
    webhookTry.error?.message.includes('not yet processed'));
  const bankTry = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: bankExc.id, p_action_key: 'RECONCILIATION_CONFIRMED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: crypto.randomUUID() });
  check('بلا مطابقة مؤكدة/حسم تكرار → NOT_PROVEN',
    bankTry.error?.message.includes('DOMAIN_CURE_NOT_PROVEN'));
  const escalate = await FM.client.rpc('acc_exception_escalate', {
    p_exception: bankExc.id, p_reason: 'يحتاج مراجعة بنكية أعمق' });
  check('المدير المالي يصعّد بسبب كتابي', !escalate.error);
  const ownEsc = await OWN.client.rpc('acc_exception_escalate', {
    p_exception: webhookExc.id, p_reason: 'x' });
  check('التصعيد مهني لا مالكي', !!ownEsc.error);
  const inRev = await ACC.client.rpc('acc_exception_set_in_review', { p_exception: webhookExc.id });
  check('المحاسبة تدخل الحرج قيد المراجعة', !inRev.error);
}

console.log('═══ ٩ · التكرار الموصول: نفس القضية بعد الحل صف جديد ═══');
{
  await ACC.client.rpc('acc_add_settlement_line', {
    p_settlement: stlA, p_payment: null, p_gross: '30', p_fee: '0', p_net: '0', p_currency: 'KWD' });
  const run3 = await runIngestion(svc, coA, ACC.id);
  check('جولة ثالثة نجحت', run3.every((r) => r.status === 'SUCCEEDED'));
  const { data: chain } = await svc.from('acc_exceptions').select('*')
    .eq('company_id', coA).eq('issue_key', `SETTLEMENT_DIFFERENCE:${stlA}`)
    .order('created_at', { ascending: true });
  check('صفان: المحلول + المتكرر', chain.length === 2);
  const [old, recur] = chain;
  check('التكرار موصول بسابقه occurrence=2',
    recur.previous_exception_id === old.id && recur.occurrence === 2
    && old.state === 'RESOLVED' && recur.state === 'OPEN');
  const { data: recEv } = await svc.from('acc_exception_events')
    .select('event').eq('exception_id', recur.id);
  check('حدث RECURRENCE_LINKED محفوظ', recEv.some((e) => e.event === 'RECURRENCE_LINKED'));
}

console.log('═══ ١٠ · وصل ACC-024: الحرج المفتوح يمنع إقفال الفترة ═══');
{
  const period = (await ACC.client.rpc('acc_create_period', {
    p_company: coA, p_fiscal_year: `FY-${TAG}`, p_start: '2026-01-01', p_end: '2026-12-31' })).data;
  await ACC.client.rpc('acc_transition_period', { p_period: period, p_new_state: 'OPEN' });
  await ACC.client.rpc('acc_transition_period', { p_period: period, p_new_state: 'SOFT_CLOSED' });
  const run4 = await runIngestion(svc, coA, ACC.id);
  const pc = run4.find((r) => r.adapterKey === 'PERIOD_CLOSE');
  check('إقفال واقف: قضية PERIOD_CLOSE_ISSUE قامت', pc.produced === 1, JSON.stringify(pc));
  const { data: blockers } = await ACC.client.rpc('acc_period_close_blockers', { p_period: period });
  check('موانع الإغلاق = الاستثناءات الحرجة المفتوحة',
    (blockers ?? []).length >= 2
    && blockers.every((b) => b.blocker_kind === 'OPEN_CRITICAL_EXCEPTION'));
  const close = await ACC.client.rpc('acc_close_period', { p_period: period });
  check('acc_close_period يرفض والحرج مفتوح', !!close.error);
  const pcExc = (await openExc('PERIOD_CLOSE_ISSUE'))[0];
  const notYet = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: pcExc.id, p_action_key: 'PERIOD_STATE_ADVANCED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: period });
  check('SOFT_CLOSED + حرجات → NOT_PROVEN', notYet.error?.message.includes('still SOFT_CLOSED'));
  await ACC.client.rpc('acc_transition_period', { p_period: period, p_new_state: 'OPEN' });
  const advanced = await ACC.client.rpc('acc_exception_resolve', {
    p_exception: pcExc.id, p_action_key: 'PERIOD_STATE_ADVANCED',
    p_kind: 'DOMAIN_ACTION', p_domain_ref: period });
  check('رجوع الفترة OPEN (فعل محاسبي موثق) يشفي القضية',
    advanced.data?.[0]?.outcome === 'RESOLVED', advanced.error?.message);
  const run5 = await runIngestion(svc, coA, ACC.id);
  check('لا إحياء ذاتي بعد الحل والفترة OPEN',
    run5.find((r) => r.adapterKey === 'PERIOD_CLOSE').produced === 0);
}

console.log('═══ ١١ · لوحة المالكة الصادقة + إسناد اللقطات (REP-007) ═══');
{
  const ownSet = await OWN.client.rpc('acc_owner_set_runway_window', { p_company: coA, p_days: 30 });
  check('نافذة الصمود تكوين محاسبي لا مالكي', !!ownSet.error);
  const badDays = await ACC.client.rpc('acc_owner_set_runway_window', { p_company: coA, p_days: -5 });
  check('أيام سالبة تُرفض', !!badDays.error);
  const accSet = await ACC.client.rpc('acc_owner_set_runway_window', { p_company: coA, p_days: 30 });
  check('المحاسبة تكوّن النافذة صراحة', !accSet.error, accSet.error?.message);

  const dash = await computeDashboard(svc, coA, OWN.id, 'BUSINESS_OWNER', 'KWD');
  const cardsByKey = Object.fromEntries(dash.cards.map((c) => [c.cardKey, c]));
  check('ست بطاقات بالترتيب', dash.cards.length === 6
    && dash.cards[0].cardKey === 'CASH_TODAY' && dash.cards[5].cardKey === 'ATTENTION');
  check('بطاقة ١: بلا تعيين GL → NOT_CONFIGURED (لا صفر مخترع)',
    cardsByKey.CASH_TODAY.status === 'NOT_CONFIGURED'
    && cardsByKey.CASH_TODAY.headline.amountMinor === null);
  check('بطاقة ٢: الربح بلا رقم — PENDING_STAGE_12',
    cardsByKey.PROFIT_MONTH.status === 'NOT_CONFIGURED'
    && cardsByKey.PROFIT_MONTH.pendingOn === 'STAGE_12'
    && cardsByKey.PROFIT_MONTH.headline.amountMinor === null);
  check('بطاقة ٣: ثلاثة مكوّنات والغائب معلَن',
    cardsByKey.MONEY_IN_TRANSIT.components.length === 3
    && cardsByKey.MONEY_IN_TRANSIT.components[0].status === 'NOT_CONFIGURED');
  check('بطاقة ٣: فرق التسوية المفتوح (المتكرر) معلَن لا مخفي',
    cardsByKey.MONEY_IN_TRANSIT.noteKey === 'TRANSIT_DIFFERENCE_OPEN');
  check('بطاقة ٤: النافذة مكوّنة لكن النقد غير مكتمل → UNKNOWN',
    cardsByKey.RUNWAY.status === 'UNKNOWN'
    && cardsByKey.RUNWAY.messageKey === 'RUNWAY_CASH_INCOMPLETE');
  check('بطاقة ٥: لا «ما عليك شيء» — غير مكتملة بصدق',
    cardsByKey.OBLIGATIONS.status === 'UNKNOWN'
    && cardsByKey.OBLIGATIONS.messageKey === 'OBLIGATIONS_INCOMPLETE');
  const openCount = (await svc.from('acc_exceptions').select('id', { count: 'exact', head: true })
    .eq('company_id', coA).neq('state', 'RESOLVED')).count;
  check('بطاقة ٦: العدّ مطابق للصندوق القانوني',
    cardsByKey.ATTENTION.headline.scalar === String(openCount));
  check('رأس الصندوق مرتب بالأولوية: الحرج أولًا',
    dash.inboxTop[0].priority === 'CRITICAL');
  check('إسناد اللقطات سُجّل', dash.provenanceRecorded === true);
  const { data: snaps } = await svc.from('acc_owner_snapshot_provenance')
    .select('card_key, status, query_def_key').eq('company_id', coA);
  check('لقطة لكل بطاقة بتعريف استعلام بنسخة',
    new Set(snaps.map((s) => s.card_key)).size === 6
    && snaps.every((s) => /_V1$/.test(s.query_def_key)));
  const authSnap = await ACC.client.rpc('acc_owner_record_snapshot', {
    p_company: coA, p_actor: ACC.id, p_card_key: 'CASH_TODAY', p_as_of: new Date().toISOString(),
    p_value_minor: null, p_value_scalar: null, p_currency: null, p_status: 'UNKNOWN',
    p_query_def: 'OWNER_CASH_TODAY_V1', p_params: {}, p_sources: [] });
  check('تسجيل اللقطات خدمة حصرًا', !!authSnap.error);
}

console.log('═══ ١١م · فاتورة المالكة حيّة: سلطة سجل Stage 2 لا العميل ═══');
{
  // ١ · السجل الحي: REG-KW-008 ACTIVE — «لا نظام VAT قائمًا»
  const ruleRows = must(await OWN.client.from('acc_regulatory_rules')
    .select('*').eq('rule_id', 'REG-KW-008'), 'REG-KW-008 rows');
  check('سجل القواعد مقروء للمالكة المصادَق عليها وREG-KW-008 قائمة',
    ruleRows.length >= 1 && ruleRows.some((r) => r.status === 'ACTIVE'));
  // ٢ · مسار المنتج نفسه: resolveInvoiceTaxPosture ثم buildDraftLines
  const posture = resolveInvoiceTaxPosture(ruleRows, new Date().toISOString().slice(0, 10), resolveVatStatus);
  check('الحل السلطوي: NO_TAX_REGIME عبر REG-KW-008 (لا ZERO_RATED)',
    posture.status === 'NO_TAX_REGIME' && posture.ruleId === 'REG-KW-008');
  check('لا نسبة تُصنَّع — rate = null لا 0', posture.rate === null);
  // ٣ · اقتراح عميل خبيث يُسقط بنيويًا — الخادم يبني الأسطر
  const lines = buildDraftLines([{
    product_id: prod, quantity: '1', unit_price_minor: '25000', currency: 'KWD',
    tax_status: 'ZERO_RATED', tax_rate: '0',
  }], posture);
  check('tax_status العميل (ZERO_RATED) أُسقط والسلطوي خُتم',
    lines[0].tax_status === 'NO_TAX_REGIME');
  check('tax_rate العميل (0) أُسقط ولا مفتاح نسبة أصلًا',
    !('tax_rate' in lines[0]));
  // ٤ · الإنشاء الحقيقي عبر Stage 4 المحكومة بأسطر الخادم
  const inv2 = must(await OWN.client.rpc('acc_create_invoice_draft', {
    p_company: coA, p_customer: cust, p_currency: 'KWD', p_lines: lines }), 'owner invoice draft');
  const { data: persisted } = await svc.from('acc_invoice_lines')
    .select('tax_status, tax_rate').eq('invoice_id', inv2);
  check('السطر المحفوظ: tax_status = NO_TAX_REGIME',
    persisted?.length === 1 && persisted[0].tax_status === 'NO_TAX_REGIME');
  check('السطر المحفوظ: tax_rate NULL — لا 0% VAT مصنّعة',
    persisted?.[0]?.tax_rate === null);
  // ٥ · الإصدار عبر المسار المحكوم القائم — تدفق جوال المالكة سليم
  const issued = must(await OWN.client.rpc('acc_issue_invoice', {
    p_invoice: inv2, p_issue_date: new Date().toISOString().slice(0, 10) }), 'owner invoice issue');
  check('الفاتورة صدرت برقم عبر Stage 4', String(issued).length > 0);
  // ٦ · الغياب = فشل مغلق قبل أي مسودة (لا رأس بلا أسطر صالحة)
  let unresolvedThrew = false;
  try { resolveInvoiceTaxPosture([], new Date().toISOString().slice(0, 10), resolveVatStatus); }
  catch (e) { unresolvedThrew = /TAX_POSTURE_UNRESOLVED/.test(e.message); }
  check('بلا صف سجل ساري: TAX_POSTURE_UNRESOLVED — لا افتراض', unresolvedThrew);
}

console.log('═══ ١٢ · التغطية الصادقة: شركة بلا استرداد/مطابقة ═══');
{
  const runB = await runIngestion(svc, coB, OWN_B.id);
  const by = Object.fromEntries(runB.map((r) => [r.adapterKey, r.status]));
  check('MISSING_WEBHOOK بلا جولة استرداد → SUCCEEDED_NO_COVERAGE',
    by.MISSING_WEBHOOK === 'SUCCEEDED_NO_COVERAGE');
  check('UNMATCHED_BANK بلا جولة مطابقة → SUCCEEDED_NO_COVERAGE',
    by.UNMATCHED_BANK === 'SUCCEEDED_NO_COVERAGE');
  check('بقية المحوّلات نجحت بلا نتائج',
    runB.filter((r) => r.status === 'SUCCEEDED').every((r) => r.produced === 0));
}

console.log('═══ ١٣ · RLS والحَجب: المالكة ترى القضية لا التقنيات ═══');
{
  const { data: ownRows } = await OWN.client.from('acc_exceptions')
    .select('id, owner_what_key').eq('company_id', coA);
  check('المالكة ترى صفوف الاستثناء بمفاتيح آمنة', (ownRows ?? []).length >= 3);
  const { data: ownLinks } = await OWN.client.from('acc_exception_source_links')
    .select('id').eq('company_id', coA);
  check('روابط الحقائق محجوبة عن المالكة', (ownLinks ?? []).length === 0);
  const { data: ownRes } = await OWN.client.from('acc_exception_resolutions')
    .select('id').eq('company_id', coA);
  check('قرارات الحل التفصيلية محجوبة عن المالكة', (ownRes ?? []).length === 0);
  const { data: audEv } = await AUD.client.from('acc_exception_events')
    .select('id').eq('company_id', coA);
  check('المدقق يقرأ الأحداث', (audEv ?? []).length > 0);
  const { data: crossB } = await OWN_B.client.from('acc_exceptions')
    .select('id').eq('company_id', coA);
  check('عزل الشركات: مالكة باء لا ترى ألف', (crossB ?? []).length === 0);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonRows = await anon.from('acc_exceptions').select('id').limit(1);
  check('anon محجوب', (anonRows.data ?? []).length === 0);
  const direct = await ACC.client.from('acc_exceptions')
    .insert({ company_id: coA, exception_type: 'MISSING_DOCUMENT', priority: 'ROUTINE',
      issue_key: `D:${TAG}`, origin: 'SOURCE_ADAPTER',
      owner_what_key: 'EXC_MISSING_DOC_WHAT', owner_why_key: 'EXC_MISSING_DOC_WHY' });
  check('إدراج مباشر من عميل مصادَق ممنوع', !!direct.error);
}

console.log('═══ ١٤ · مناعة الأدلة: الهوية والتاريخ لا يُمسّان ═══');
{
  const exc = (await openExc('MISSING_WEBHOOK'))[0];
  for (const [name, patch] of [
    ['الأولوية مجمّدة', { priority: 'ROUTINE' }],
    ['الحالة عبر الدوال الموقّعة فقط', { state: 'RESOLVED' }],
    ['المفتاح الاقتصادي مجمّد', { issue_key: 'tamper' }],
  ]) {
    const r = await svc.from('acc_exceptions').update(patch).eq('id', exc.id);
    check(name, !!r.error, r.error?.message);
  }
  const del = await svc.from('acc_exceptions').delete().eq('id', exc.id);
  check('لا حذف لاستثناء أبدًا', !!del.error);
  const { data: link } = await svc.from('acc_exception_source_links')
    .select('id').eq('exception_id', exc.id).limit(1).single();
  const linkUpd = await svc.from('acc_exception_source_links')
    .update({ source_role: 'CONTEXT' }).eq('id', link.id);
  const linkDel = await svc.from('acc_exception_source_links').delete().eq('id', link.id);
  check('روابط الحقائق append-only', !!linkUpd.error && !!linkDel.error);
  const { data: resRow } = await svc.from('acc_exception_resolutions').select('id').limit(1).single();
  const resUpd = await svc.from('acc_exception_resolutions').update({ reason: 'x' }).eq('id', resRow.id);
  check('قرارات الحل مجمّدة', !!resUpd.error);
  const { data: doneRun } = await svc.from('acc_exception_ingestion_runs')
    .select('id').eq('company_id', coA).eq('status', 'SUCCEEDED').limit(1).single();
  const runUpd = await svc.from('acc_exception_ingestion_runs')
    .update({ produced_count: 99 }).eq('id', doneRun.id);
  check('جولة مكتملة مجمّدة', !!runUpd.error);
  const { data: snap } = await svc.from('acc_owner_snapshot_provenance').select('id').limit(1).single();
  const snapUpd = await svc.from('acc_owner_snapshot_provenance')
    .update({ status: 'FINAL' }).eq('id', snap.id);
  check('إسناد اللقطات append-only', !!snapUpd.error);
  const setUpd = await svc.from('acc_owner_settings')
    .update({ runway_window_days: 999 }).eq('company_id', coA);
  check('إعدادات المالكة عبر الدالة الموقّعة فقط', !!setUpd.error);
}

console.log('═══ ١٥ · صفر أثر دفتري وصفر مساس بالمصادر ═══');
{
  const journalNow = (await svc.from('acc_journal_entries')
    .select('id', { count: 'exact', head: true }).eq('company_id', coA)).count ?? 0;
  check('صفر قيود جديدة من كل عمليات Stage 11', journalNow === journalBaseline,
    `${journalBaseline}→${journalNow}`);
  const { data: stlLines } = await svc.from('acc_settlement_lines')
    .select('gross_minor, fee_minor, net_minor').eq('settlement_id', stlA);
  check('أسطر التسوية كما سُجلت (٣ أسطر append-only)', stlLines.length === 3);
  const { data: txnRow } = await svc.from('acc_bank_transactions')
    .select('amount_minor').eq('id', bankTxn).single();
  check('حركة البنك بلا مساس', String(txnRow.amount_minor) === '25000');
  const { data: expRow } = await svc.from('acc_expenses').select('state').eq('id', expNoDoc).single();
  check('حل الاستثناء لم يغيّر حالة المصروف (الربط دليل لا تعديل)', expRow.state === 'SUBMITTED');
  const { data: mfRow } = await svc.from('acc_mf_events').select('processing_state').eq('id', mfEvent).single();
  check('حدث المزوّد المستردّ كما هو (RECEIVED)', mfRow.processing_state === 'RECEIVED');
}

console.log(`\n  Stage 11 على القاعدة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
