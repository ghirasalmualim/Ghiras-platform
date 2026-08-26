#!/usr/bin/env node
/**
 * اختبارات Stage 5 على القاعدة — **PENDING STAGING**: تتطلب تطبيق
 * هجرة 2026-08-27-accounting-revenue على Staging أولًا. لا إنتاج أبدًا.
 * rerunnable على قاعدة append-only بمعرفات فريدة لكل تشغيلة.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (URL?.includes('prod')) { console.error('⛔ ليست بيئة Staging'); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const check = (n, c, extra = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${extra}`); } };
const TAG = Date.now().toString(36);

async function mintUser(t) {
  const email = `acc5-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}
const rpc = (u, fn, args) => u.client.rpc(fn, args);

// ─── تجهيز: شركة كاملة الأدوار + فاتورة مصدرة لكل نوع عقد ───
const OWN = await mintUser('own'), ACC = await mintUser('acc'), AUD = await mintUser('aud'),
      FM = await mintUser('fm'), RO = await mintUser('ro'), OWN_B = await mintUser('ownb'), ACC_B = await mintUser('accb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة إيراد ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة إيراد باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR'], [FM, 'FINANCE_MANAGER'], [RO, 'READ_ONLY']]) {
  const { error } = await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });
  if (error) throw error;
}
{ const { error } = await OWN_B.client.from('acc_company_members').insert({ company_id: coB, user_id: ACC_B.id, role: 'ACCOUNTANT', created_by: OWN_B.id }); if (error) throw error; }

const { data: cust } = await rpc(OWN, 'acc_create_customer', { p_company: coA, p_name: `مدرسة ${TAG}` });
const { data: prodAnnual } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `سنوي ${TAG}`, p_price_minor: '120000', p_currency: 'KWD', p_revenue_policy_id: 'POL-002' });
const { data: prodSix } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `نصفي ${TAG}`, p_price_minor: '100000', p_currency: 'KWD', p_revenue_policy_id: 'POL-003' });
const { data: prodOnce } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `منتج رقمي ${TAG}`, p_price_minor: '5000', p_currency: 'KWD', p_revenue_policy_id: 'POL-004' });
const { data: prodCred } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `رصيد AI ${TAG}`, p_price_minor: '8000', p_currency: 'KWD', p_revenue_policy_id: 'POL-005' });

async function issuedLine(product, price) {
  const { data: inv } = await OWN.client.rpc('acc_create_invoice_draft', {
    p_company: coA, p_customer: cust, p_currency: 'KWD',
    p_lines: [{ product_id: product, quantity: '1', unit_price_minor: price, currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
  const iss = await rpc(OWN, 'acc_issue_invoice', { p_invoice: inv, p_issue_date: '2026-08-27' });
  if (iss.error) throw new Error(iss.error.message);
  const { data: line } = await svc.from('acc_invoice_lines').select('id').eq('invoice_id', inv).single();
  return { inv, line: line.id };
}

console.log('\n═══ ١ · العقد السنوي (POL-002) — جدول ١٢ صفًا تامًا ═══');
const A = await issuedLine(prodAnnual, '120000');
const { line: S0MISMATCH } = await issuedLine(prodAnnual, '120000');
const cAnnual = await rpc(ACC, 'acc_create_revenue_contract', {
  p_invoice_line: A.line, p_kind: 'SUBSCRIPTION',
  p_service_start: '2026-09-01', p_service_end: '2027-08-31' });
check('ANNUAL contract created', !cAnnual.error, cAnnual.error?.message);
const { data: schedA } = await svc.from('acc_recognition_schedules').select('*').eq('contract_id', cAnnual.data).single();
const { data: rowsA } = await svc.from('acc_recognition_rows').select('*').eq('schedule_id', schedA.id).order('position');
check('١٢ صفًا مثبتًا (REV-005/012)', rowsA.length === 12);
check('Σ الصفوف = 120.000 بالتمام (REV-014)',
  rowsA.reduce((a, r) => a + BigInt(r.amount_minor), 0n) === 120000n);
check('كل صف 10.000 (قسمة تامة)', rowsA.every((r) => String(r.amount_minor) === '10000'));
const { data: cRow } = await svc.from('acc_revenue_contracts').select('*').eq('id', cAnnual.data).single();
check('النسخة والحالة مجمّدتان على العقد (REV-011)',
  cRow.policy_version === 1 && cRow.policy_status_used !== null);
check('غير معتمدة (قالب عام) → PROVISIONAL (REV-016)',
  cRow.provisional === true && cRow.policy_scope_used === 'GLOBAL_TEMPLATE' && schedA.provisional === true && rowsA[0].provisional === true);
const dupC = await rpc(ACC, 'acc_create_revenue_contract', { p_invoice_line: A.line, p_kind: 'SUBSCRIPTION', p_service_start: '2026-09-01', p_service_end: '2027-08-31' });
check('سطر فاتورة واحد = عقد واحد', !!dupC.error);
check('TREATMENT من ملف النسخة الآلي ومجمّد على العقد (ACC-012)',
  cRow.recognition_basis === 'RATABLE_TIME' && cRow.performance_trigger === 'SERVICE_PERIOD');

// نوع مخالف لسياسة السطر (POL-002 رِبّية ≠ AI_CREDITS)
const mism = await rpc(ACC, 'acc_create_revenue_contract', { p_invoice_line: S0MISMATCH, p_kind: 'AI_CREDITS' });
check('MISMATCHED CONTRACT TYPE VS POLICY TREATMENT: BLOCKED',
  !!mism.error && /contradicts the resolved policy treatment/.test(mism.error.message));

console.log('═══ ٢ · النصفي (POL-003) — البقية للصف الأخير ═══');
const S = await issuedLine(prodSix, '100000');
const cSix = await rpc(ACC, 'acc_create_revenue_contract', {
  p_invoice_line: S.line, p_kind: 'SUBSCRIPTION', p_service_start: '2026-09-01', p_service_end: '2027-02-28' });
const { data: schedS } = await svc.from('acc_recognition_schedules').select('id').eq('contract_id', cSix.data).single();
const { data: rowsS } = await svc.from('acc_recognition_rows').select('amount_minor').eq('schedule_id', schedS.id).order('position');
check('٦ صفوف: 5×16666 + 16670 وΣ=100000 بالتمام',
  rowsS.length === 6 &&
  rowsS.slice(0, 5).every((r) => String(r.amount_minor) === '16666') &&
  String(rowsS[5].amount_minor) === '16670' &&
  rowsS.reduce((a, r) => a + BigInt(r.amount_minor), 0n) === 100000n);

console.log('═══ ٣ · التاريخ لا يُعاد حسابه ═══');
const tam = await svc.from('acc_recognition_rows').update({ amount_minor: '1' }).eq('id', rowsA[0].id);
check('حقائق الصف مجمّدة حتى ضد الخدمة', !!tam.error && /immutable/.test(tam.error.message));
const del = await svc.from('acc_recognition_rows').delete().eq('id', rowsA[0].id);
check('حذف صف مستحيل (REV-013)', !!del.error);
const st = await svc.from('acc_recognition_rows').update({ state: 'CONSUMED' }).eq('id', rowsA[0].id);
check('CONSUMED بلا قيد/توقيع مرفوض', !!st.error);
const sdel = await svc.from('acc_recognition_schedules').delete().eq('id', schedA.id);
check('حذف جدول مستحيل', !!sdel.error);

console.log('═══ ٤ · الاستهلاك: قيد المحاسبة المرحّل، مرة واحدة (REV-013) ═══');
// المحاسبة ترحّل قيد اعتراف بنفسها عبر Stage 3 (حساباتها هي — لا اختراع)
const { data: defAcc } = await rpc(ACC, 'acc_create_account', { p_company: coA, p_code: `2400-${TAG}`, p_name: 'إيراد مؤجل', p_type: 'LIABILITY' });
const { data: revAcc } = await rpc(ACC, 'acc_create_account', { p_company: coA, p_code: `4000-${TAG}`, p_name: 'إيراد اشتراكات', p_type: 'REVENUE' });
const { data: per } = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `FY-${TAG}`, p_start: '2026-01-01', p_end: '2026-12-31' });
await rpc(ACC, 'acc_transition_period', { p_period: per, p_new_state: 'OPEN' });
const mkPosted = async (amount) => {
  const { data: je } = await rpc(ACC, 'acc_create_manual_journal', {
    p_company: coA, p_period: per, p_entry_date: '2026-09-30', p_description: `اعتراف ${TAG}`,
    p_lines: [
      { account_id: defAcc, side: 'DEBIT', amount_minor: amount, currency: 'KWD', base_amount_minor: amount, base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' },
      { account_id: revAcc, side: 'CREDIT', amount_minor: amount, currency: 'KWD', base_amount_minor: amount, base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
  await rpc(ACC, 'acc_submit_journal', { p_entry: je });
  const p = await rpc(ACC, 'acc_post_journal', { p_entry: je });
  if (p.error) throw new Error(p.error.message);
  return je;
};
const je1 = await mkPosted('10000');
const draftJe = await rpc(ACC, 'acc_create_manual_journal', {
  p_company: coA, p_period: per, p_entry_date: '2026-09-30', p_description: 'مسودة',
  p_lines: [
    { account_id: defAcc, side: 'DEBIT', amount_minor: '10000', currency: 'KWD', base_amount_minor: '10000', base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' },
    { account_id: revAcc, side: 'CREDIT', amount_minor: '10000', currency: 'KWD', base_amount_minor: '10000', base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
const noAtt = await rpc(ACC, 'acc_consume_schedule_row', { p_row: rowsA[0].id, p_journal_entry: je1, p_attestation_reason: ' ' });
check('RANDOM POSTED JOURNAL WITHOUT ATTESTATION: BLOCKED', !!noAtt.error && /attestation reason is required/.test(noAtt.error.message));
const badJe = await rpc(ACC, 'acc_consume_schedule_row', { p_row: rowsA[0].id, p_journal_entry: draftJe.data, p_attestation_reason: 'قيد اعتراف سبتمبر' });
check('قيد غير مرحّل مرفوض — الصف يبقى OPEN', !!badJe.error && /POSTED/.test(badJe.error.message));
const c1 = await rpc(ACC, 'acc_consume_schedule_row', { p_row: rowsA[0].id, p_journal_entry: je1, p_attestation_reason: 'أشهد أن هذا قيد اعتراف صف سبتمبر' });
check('IDEMPOTENT RECOGNITION: الاستهلاك بقيد مرحّل يمر', !c1.error, c1.error?.message);
const c1b = await rpc(ACC, 'acc_consume_schedule_row', { p_row: rowsA[0].id, p_journal_entry: je1, p_attestation_reason: 'تكرار' });
check('المرة الثانية مرفوضة — أثر واحد على الأكثر', !!c1b.error && /at most once|already recognized/.test(c1b.error.message));
const tamC = await svc.from('acc_recognition_rows').update({ amount_minor: '2' }).eq('id', rowsA[0].id);
check('المستهلك مجمّد للأبد', !!tamC.error);
const { data: attRow } = await svc.from('acc_recognition_rows').select('consumption_basis, attested_by, attestation_reason').eq('id', rowsA[0].id).single();
check('CONSUMPTION BASIS PRESERVED + الشهادة كاملة',
  attRow.consumption_basis === 'ACCOUNTANT_ATTESTED_MANUAL' && attRow.attested_by === ACC.id && attRow.attestation_reason.length > 3);
const tamAtt = await svc.from('acc_recognition_rows').update({ attestation_reason: 'X' }).eq('id', rowsA[0].id);
check('ATTESTATION IMMUTABLE', !!tamAtt.error);

console.log('═══ ٥ · المؤجل: جاري/غير جاري وتكامل REV-006 ═══');
const { data: defs } = await ACC.client.rpc('acc_deferred_revenue', { p_company: coA, p_as_of: '2026-09-01' });
const dA = defs.find((d) => d.contract_id === cAnnual.data);
check('DEFERRED: المفتوح = 110.000 بعد استهلاك صف', dA && dA.open_minor === '110000');
check('CURRENT/NON-CURRENT split (كله ≤ ١٢ شهرًا هنا)',
  dA.current_minor === '110000' && dA.non_current_minor === '0');
check('provisional يسري في المؤجل (REV-016)', dA.provisional === true);
// التكامل: رصيد حساب المؤجل الآن مدين 20000 (قيدا الاعتراف) بلا رصيد افتتاحي → انحراف مكشوف
const noMap = await ACC.client.rpc('acc_deferred_integrity_check', { p_company: coA });
check('NO MAPPING → INTEGRITY EXPLICITLY BLOCKED (لا تطابق زائفًا)',
  !!noMap.error && /AUTHORITATIVE_MAPPING_REQUIRED/.test(noMap.error.message));
const link = await rpc(ACC, 'acc_link_gl_account', { p_company: coA, p_purpose: 'DEFERRED_REVENUE', p_account: defAcc });
check('المحاسبة تعيّن حساب المؤجل (تكوين بشري مدقَّق)', !link.error, link.error?.message);
const integ = await ACC.client.rpc('acc_deferred_integrity_check', { p_company: coA });
check('INTEGRITY CHECK بعد التعيين يعمل ويكشف الانحراف عدديًا', !integ.error && integ.data[0].drift_minor !== '0', integ.error?.message);
const { data: driftEv } = await svc.from('acc_audit_events').select('id').eq('action', 'DEFERRED_DRIFT_DETECTED').eq('company_id', coA);
check('الانحراف مُدقَّق', (driftEv ?? []).length >= 1);
const wrongAcct = await rpc(ACC, 'acc_link_gl_account', { p_company: coA, p_purpose: 'DEFERRED_REVENUE', p_account: cAnnual.data });
check('تعيين حساب غير موجود/غير مملوك مرفوض — لا mapping مخترعًا', !!wrongAcct.error);
check('SCHEDULE_BASIS معلنة في مخرجات المؤجل', dA.basis === 'SCHEDULE_BASIS');

console.log('═══ ٥ب · عكس قيد الاعتراف لاحقًا: كشف لا صمت ═══');
{
  const rev = await rpc(ACC, 'acc_reverse_journal', { p_entry: je1, p_target_period: per, p_reason: 'اختبار كشف العكس' });
  check('عكس قيد الاعتراف عبر محرك Stage 3 يمر', !rev.error, rev.error?.message);
  const integ2 = await ACC.client.rpc('acc_deferred_integrity_check', { p_company: coA });
  check('LINKED JOURNAL LATER REVERSED: DETECTED (reversed_recognitions ≥ 1)',
    !integ2.error && integ2.data[0].reversed_recognitions >= 1);
  const { data: revEv } = await svc.from('acc_audit_events').select('id').eq('action', 'RECOGNITION_JOURNAL_REVERSED').eq('company_id', coA);
  check('الكشف مُدقَّق', (revEv ?? []).length >= 1);
  const { data: stillC } = await svc.from('acc_recognition_rows').select('state').eq('id', rowsA[0].id).single();
  check('NO AUTOMATIC REOPEN: الصف يبقى CONSUMED مجمّدًا', stillC.state === 'CONSUMED');
}

console.log('═══ ٦ · التعديل الاستباقي (POL-007 · REV-009/015) ═══');
const mod = await rpc(ACC, 'acc_modify_subscription_schedule', {
  p_contract: cAnnual.data, p_new_total: '150000', p_effective: '2026-11-01', p_reason: 'ترقية باقة' });
check('MODIFICATION تمر', !mod.error, mod.error?.message);
const { data: oldRows } = await svc.from('acc_recognition_rows').select('state, amount_minor').eq('schedule_id', schedA.id).order('position');
check('المستهلك بايتًا-ببايت في القديم', oldRows[0].state === 'CONSUMED' && String(oldRows[0].amount_minor) === '10000');
check('المستقبلي القديم SUPERSEDED', oldRows.filter((r) => r.state === 'SUPERSEDED').length >= 1);
const { data: newRows } = await svc.from('acc_recognition_rows').select('amount_minor, state').eq('schedule_id', mod.data);
const newSum = newRows.reduce((a, r) => a + BigInt(r.amount_minor), 0n);
check('التكامل: المستهلك(10000) + صفوف الخليفة = 150.000 بالتمام',
  newSum + 10000n === 150000n, String(newSum));
const { data: schedOld } = await svc.from('acc_recognition_schedules').select('status, superseded_by').eq('id', schedA.id).single();
check('القديم SUPERSEDED ومرتبط بالخليفة', schedOld.status === 'SUPERSEDED' && schedOld.superseded_by === mod.data);

console.log('═══ ٧ · المنتج الرقمي (POL-004): الأداء لا الإصدار ═══');
const O = await issuedLine(prodOnce, '5000');
const cOnce = await rpc(ACC, 'acc_create_revenue_contract', { p_invoice_line: O.line, p_kind: 'ONE_TIME' });
const { data: schedO } = await svc.from('acc_recognition_schedules').select('id').eq('contract_id', cOnce.data).single();
const { count: preRows } = await svc.from('acc_recognition_rows').select('id', { count: 'exact', head: true }).eq('schedule_id', schedO.id);
check('ONE-TIME: الإصدار وحده لا يولّد صف اعتراف (REV-001)', preRows === 0);
const noEv = await rpc(ACC, 'acc_record_delivery', { p_contract: cOnce.data, p_occurred_on: '2026-09-05', p_evidence: ' ' });
check('تسليم بلا دليل مرفوض', !!noEv.error);
const dlv = await rpc(ACC, 'acc_record_delivery', { p_contract: cOnce.data, p_occurred_on: '2026-09-05', p_evidence: `access-grant:${TAG}` });
check('ONE-TIME DELIVERY بدليل حقيقي → صف واحد بكامل المبلغ', !dlv.error, dlv.error?.message);
const dlv2 = await rpc(ACC, 'acc_record_delivery', { p_contract: cOnce.data, p_occurred_on: '2026-09-06', p_evidence: 'x' });
check('تسليم ثانٍ مرفوض', !!dlv2.error);

console.log('═══ ٨ · أرصدة AI (POL-005) والكسر (POL-006 · REV-008) ═══');
const C = await issuedLine(prodCred, '8000');
const cCred = await rpc(ACC, 'acc_create_revenue_contract', { p_invoice_line: C.line, p_kind: 'AI_CREDITS' });
const k1 = await rpc(ACC, 'acc_record_credit_consumption', { p_contract: cCred.data, p_amount_minor: '3000', p_occurred_at: '2026-09-10T10:00:00Z', p_idempotency_key: `use-${TAG}-1` });
check('CREDIT CONSUMPTION event → صف اعتراف', !k1.error, k1.error?.message);
const k1b = await rpc(ACC, 'acc_record_credit_consumption', { p_contract: cCred.data, p_amount_minor: '3000', p_occurred_at: '2026-09-10T10:00:00Z', p_idempotency_key: `use-${TAG}-1` });
check('نفس المفتاح = نفس الصف، لا تكرار (idempotent)', !k1b.error && k1b.data === k1.data);
const kOver = await rpc(ACC, 'acc_record_credit_consumption', { p_contract: cCred.data, p_amount_minor: '9000', p_occurred_at: '2026-09-11T10:00:00Z', p_idempotency_key: `use-${TAG}-2` });
check('تجاوز الالتزام المتبقي مرفوض', !!kOver.error);
const brk = await rpc(ACC, 'acc_recognize_breakage', { p_contract: cCred.data, p_occurred_on: '2026-12-31' });
check('AI BREAKAGE WITHOUT AUDITOR APPROVAL: BLOCKED (REV-008)',
  !!brk.error && /blocked until POL-006/.test(brk.error.message));

console.log('═══ ٩ · الأدوار والعزل ═══');
for (const [u, n] of [[OWN, 'BUSINESS_OWNER'], [FM, 'FINANCE_MANAGER'], [AUD, 'AUDITOR'], [RO, 'READ_ONLY']]) {
  const r = await rpc(u, 'acc_create_revenue_contract', { p_invoice_line: C.line, p_kind: 'AI_CREDITS' });
  check(`${n} لا ينشئ عقود إيراد`, !!r.error);
}
const svcOp = await svc.rpc('acc_consume_schedule_row', { p_row: rowsA[1].id, p_journal_entry: je1, p_attestation_reason: 'svc probe' });
check('AI/SYSTEM بلا auth لا يستهلك (auth.uid NULL)', !!svcOp.error && /authentication required/.test(svcOp.error.message));
const { data: audSees } = await AUD.client.from('acc_recognition_rows').select('id').eq('company_id', coA);
check('AUDITOR READ (قراءة لا كتابة)', (audSees ?? []).length >= 15);
const audMut = await AUD.client.from('acc_recognition_rows').update({ state: 'OPEN' }).eq('company_id', coA);
check('AUDITOR MUTATION BLOCKED', !!audMut.error || audMut.count === 0);
const { data: ownSees } = await OWN.client.from('acc_recognition_rows').select('id').eq('company_id', coA);
check('المالكة خارج الداخل الإيرادي الخام', (ownSees ?? []).length === 0);
const { data: roSees } = await RO.client.from('acc_revenue_contracts').select('id').eq('company_id', coA);
check('READ_ONLY محجوب', (roSees ?? []).length === 0);
const { data: bSees } = await ACC_B.client.from('acc_recognition_rows').select('id').eq('company_id', coA);
check('TENANT ISOLATION: محاسبة باء لا ترى إيراد ألف', (bSees ?? []).length === 0);
// FIX أمني: مستخدم بلا عضوية في ألف — الدوال الأربع كلها ترفض
const NM = await mintUser('nomember');   // مصادَق لكن بلا عضوية في أي شركة
const bDef = await ACC_B.client.rpc('acc_deferred_revenue', { p_company: coA });
check('مؤجل ألف مرفوض لعضو باء', !!bDef.error);
const { data: someAcct } = await svc.from('acc_accounts').select('id').eq('company_id', coA).limit(1).single();
const guards = [
  ['acc_deferred_revenue', { p_company: coA }],
  ['acc_deferred_integrity_check', { p_company: coA }],
  ['acc_trial_balance', { p_company: coA }],
  ['acc_general_ledger', { p_account: someAcct.id }],
];
for (const [fn, args] of guards) {
  for (const [u, tag] of [[NM, 'no-membership'], [ACC_B, 'other-company member'], [OWN_B, 'other-company owner']]) {
    const r = await u.client.rpc(fn, args);
    check(`CROSS-TENANT ${fn} BLOCKED (${tag})`, !!r.error, JSON.stringify(r.error?.message));
  }
  const rs = await svc.rpc(fn, args);
  check(`${fn} BLOCKED (no-auth/service uid NULL)`, !!rs.error);
}
// المخوّلون في ألف ما زالوا يعملون
check('AUTHORIZED ACCOUNTANT: general_ledger', !(await ACC.client.rpc('acc_general_ledger', { p_account: someAcct.id })).error);
check('AUTHORIZED AUDITOR: trial_balance', !(await AUD.client.rpc('acc_trial_balance', { p_company: coA })).error);
check('AUTHORIZED FINANCE_MANAGER: deferred_revenue', !(await FM.client.rpc('acc_deferred_revenue', { p_company: coA })).error);

console.log('═══ ١٠ · التدقيق ═══');
const { data: evs } = await svc.from('acc_audit_events').select('action').eq('company_id', coA);
const acts = new Set(evs.map((e) => e.action));
for (const a of ['REVENUE_CONTRACT_CREATED', 'REVENUE_ROW_CONSUMED', 'SCHEDULE_MODIFIED',
  'DELIVERY_RECORDED', 'CREDIT_CONSUMPTION_RECORDED', 'DEFERRED_DRIFT_DETECTED'])
  check(`حدث ${a}`, acts.has(a));
check('لا أحداث دفع/تسوية', ![...acts].some((a) => /PAYMENT|SETTLEMENT|MYFATOORAH/.test(a)));

console.log(`\n  الإيراد: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار تبقى في Staging عمدًا — لا حذف بالبنية)');
if (failed) process.exit(1);
