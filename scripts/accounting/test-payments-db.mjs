#!/usr/bin/env node
/**
 * اختبارات Stage 6 على القاعدة — **PENDING STAGING**. rerunnable على
 * append-only بمعرفات فريدة. يثبت تدفق 100/3/97 التام بقيود المحاسبة
 * المرحّلة عبر Stage 3 (لا اختراع حساب)، والباقي غير الصفري، والاسترداد.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (URL?.includes('prod')) { console.error('⛔ ليست بيئة Staging'); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };
const TAG = Date.now().toString(36);
async function mintUser(t) {
  const email = `acc6-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}
const rpc = (u, fn, args) => u.client.rpc(fn, args);

const OWN = await mintUser('own'), ACC = await mintUser('acc'), AUD = await mintUser('aud'),
      FM = await mintUser('fm'), EMP = await mintUser('emp'), RO = await mintUser('ro'),
      OUT = await mintUser('out'), OWN_B = await mintUser('ownb'), ACC_B = await mintUser('accb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة دفع ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة دفع باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [RO, 'READ_ONLY']])
  { const { error } = await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id }); if (error) throw error; }
{ const { error } = await OWN_B.client.from('acc_company_members').insert({ company_id: coB, user_id: ACC_B.id, role: 'ACCOUNTANT', created_by: OWN_B.id }); if (error) throw error; }

const { data: cust } = await rpc(OWN, 'acc_create_customer', { p_company: coA, p_name: `عميل ${TAG}` });
const { data: prod } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `منتج ${TAG}`, p_price_minor: '100000', p_currency: 'KWD', p_revenue_policy_id: 'POL-004' });
async function issuedInvoice(total) {
  const { data: inv } = await OWN.client.rpc('acc_create_invoice_draft', { p_company: coA, p_customer: cust, p_currency: 'KWD',
    p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: total, currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
  await rpc(OWN, 'acc_issue_invoice', { p_invoice: inv, p_issue_date: '2026-08-27' });
  await rpc(OWN, 'acc_send_invoice', { p_invoice: inv });
  return inv;
}
// حسابات معيّنة بشريًا (المحاسبة) + فترة + دالة ترحيل قيد Stage 3
const mkAcct = async (code, type) => (await rpc(ACC, 'acc_create_account', { p_company: coA, p_code: `${code}-${TAG}`, p_name: code, p_type: type })).data;
const clearing = await mkAcct('CLEARING', 'ASSET');
const cit = await mkAcct('CIT', 'ASSET');
const fee = await mkAcct('FEE', 'EXPENSE');
const bank = await mkAcct('BANK', 'ASSET');
const revenue = await mkAcct('REV', 'REVENUE');
const contra = await mkAcct('CONTRA', 'REVENUE');
const susp = await mkAcct('SUSP', 'ASSET');
for (const [pur, acct] of [['GATEWAY_CLEARING', clearing], ['CASH_IN_TRANSIT', cit], ['GATEWAY_FEE_EXPENSE', fee], ['CONTRA_REVENUE', contra], ['UNIDENTIFIED_SETTLEMENT_DIFFERENCE', susp]])
  { const r = await rpc(ACC, 'acc_link_gl_account', { p_company: coA, p_purpose: pur, p_account: acct }); if (r.error) throw new Error(pur + ': ' + r.error.message); }
const { data: per } = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `FY-${TAG}`, p_start: '2026-01-01', p_end: '2026-12-31' });
await rpc(ACC, 'acc_transition_period', { p_period: per, p_new_state: 'OPEN' });
const post = async (lines, desc) => {
  const { data: je } = await rpc(ACC, 'acc_create_manual_journal', { p_company: coA, p_period: per, p_entry_date: '2026-09-15', p_description: desc,
    p_lines: lines.map(([a, side, amt]) => ({ account_id: a, side, amount_minor: amt, currency: 'KWD', base_amount_minor: amt, base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' })) });
  await rpc(ACC, 'acc_submit_journal', { p_entry: je });
  const p = await rpc(ACC, 'acc_post_journal', { p_entry: je });
  if (p.error) throw new Error(p.error.message);
  return je;
};
const bal = async (acct) => { const { data: tb } = await ACC.client.rpc('acc_trial_balance', { p_company: coA }); const r = (tb ?? []).find((x) => x.account_id === acct); return r ? BigInt(r.balance_minor) : 0n; };

console.log('\n═══ ١ · تسجيل الدفع (CORRECTION 2: المالكة تسجّل) ═══');
const inv = await issuedInvoice('100000');
const pmt = await rpc(OWN, 'acc_record_payment', { p_company: coA, p_invoice: inv, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `gw-${TAG}` });
check('OWNER RECORD PAYMENT', !pmt.error, pmt.error?.message);
const { data: ownRaw } = await OWN.client.from('acc_settlements').select('id').eq('company_id', coA);
check('OWNER RAW ACCOUNTING ACCESS BLOCKED (التسويات)', (ownRaw ?? []).length === 0);
const ownJournal = await OWN.client.rpc('acc_create_manual_journal', { p_company: coA, p_period: per, p_entry_date: '2026-09-15', p_description: 'x', p_lines: [] });
check('OWNER لا يرحّل قيودًا (Stage 3 غير موسّع)', !!ownJournal.error);
const dup = await rpc(OWN, 'acc_record_payment', { p_company: coA, p_invoice: inv, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `gw-${TAG}` });
check('PAY-T-007 idempotency: gateway_txn_id مكرر مرفوض', !!dup.error);

console.log('═══ ٢ · لا أثر محاسبيًا لغير الناجح ═══');
const { data: tbBefore } = await ACC.client.rpc('acc_trial_balance', { p_company: coA });
check('PENDING/INITIATED صفر أثر محاسبي', (tbBefore ?? []).every((r) => BigInt(r.balance_minor) === 0n));
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt.data, p_new_status: 'PENDING' });
const badTrans = await svc.from('acc_payments').update({ status: 'SETTLED' }).eq('id', pmt.data);
check('انتقال مباشر بلا توقيع مرفوض (fail-closed)', !!badTrans.error && /signed payment operations/.test(badTrans.error.message));

console.log('═══ ٣ · تدفق 100/3/97 التام (PAY-T-001..005) ═══');
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt.data, p_new_status: 'SUCCESS' });
// نجاح الدفع: Clearing DR 100 / Revenue CR 100 (المعالجة عبر قيد المحاسبة)
const jClear = await post([[clearing, 'DEBIT', '100000'], [revenue, 'CREDIT', '100000']], 'clearing on success');
await rpc(ACC, 'acc_attest_payment_journal', { p_purpose: 'PAYMENT_CLEARING', p_journal_entry: jClear, p_attestation_reason: 'قيد مقاصّة الدفع', p_payment: pmt.data });
// التسوية: gross 100 / fee 3 / net 97
const stl = await rpc(ACC, 'acc_record_settlement', { p_company: coA, p_provider: 'GW', p_settlement_ref: `stl-${TAG}`, p_settled_at: '2026-09-20' });
await rpc(ACC, 'acc_add_settlement_line', { p_settlement: stl.data, p_payment: pmt.data, p_gross: '100000', p_fee: '3000', p_net: '97000', p_currency: 'KWD' });
const jStl = await post([[fee, 'DEBIT', '3000'], [cit, 'DEBIT', '97000'], [clearing, 'CREDIT', '100000']], 'settlement');
await rpc(ACC, 'acc_attest_payment_journal', { p_purpose: 'SETTLEMENT', p_journal_entry: jStl, p_attestation_reason: 'قيد التسوية', p_settlement: stl.data });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt.data, p_new_status: 'SETTLED' });
// وصول البنك: Bank DR 97 / CIT CR 97 (حساب بنك ممرّر صراحة — CORRECTION 3)
const jBank = await post([[bank, 'DEBIT', '97000'], [cit, 'CREDIT', '97000']], 'bank arrival');
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt.data, p_new_status: 'RECONCILED' });
check('PAY-T-001 gross(100) ليس net revenue: الإيراد = 100.000 بالضبط', (await bal(revenue)) === -100000n); // CREDIT رصيد سالب في balance=debit-credit
check('PAY-T-005 fee expense = 3.000 بالضبط', (await bal(fee)) === 3000n);
check('bank increase = 97.000 بالضبط', (await bal(bank)) === 97000n);
check('PAY-T-003 clearing = 0 بعد التدفق', (await bal(clearing)) === 0n);
check('cash in transit = 0 بعد وصول البنك', (await bal(cit)) === 0n);
check('لا 97 صار إيرادًا (الإيراد 100 لا 97)', (await bal(revenue)) === -100000n);

console.log('═══ ٤ · gross/fee/net مستقلة + residual غير صفري (CORRECTION 1) ═══');
const stlR = await rpc(ACC, 'acc_record_settlement', { p_company: coA, p_provider: 'GW', p_settlement_ref: `stlr-${TAG}`, p_settled_at: '2026-09-21' });
const lineR = await rpc(ACC, 'acc_add_settlement_line', { p_settlement: stlR.data, p_payment: null, p_gross: '232500', p_fee: '6975', p_net: '224479', p_currency: 'KWD' });
check('NONZERO RESIDUAL PRESERVED: 232500/6975/224479 يُخزَّن بلا تعديل', !lineR.error, lineR.error?.message);
const { data: lr } = await svc.from('acc_settlement_lines').select('gross_minor, fee_minor, net_minor').eq('id', lineR.data).single();
check('SOURCE VALUES 232500/6975/224479 محفوظة بالتمام',
  String(lr.gross_minor) === '232500' && String(lr.fee_minor) === '6975' && String(lr.net_minor) === '224479');
check('FEE UNCHANGED = 6975 (لا ابتلاع الباقي فيه)', String(lr.fee_minor) === '6975');
// قراءة صرفة: تُعيد 1046 (مرتين) بلا أي تدقيق إضافي
const resid = await ACC.client.rpc('acc_settlement_residual', { p_settlement: stlR.data });
check('RESIDUAL 1046 مرئي (قراءة صرفة)', !resid.error && String(resid.data) === '1046');
const { data: evBefore } = await svc.from('acc_audit_events').select('id').eq('action', 'SETTLEMENT_RESIDUAL_DETECTED').eq('subject_id', lineR.data);
const resid2 = await ACC.client.rpc('acc_settlement_residual', { p_settlement: stlR.data });
check('READ TWICE يُعيد 1046 كلتيهما', String(resid.data) === '1046' && String(resid2.data) === '1046');
const { data: evAfter } = await svc.from('acc_audit_events').select('id').eq('action', 'SETTLEMENT_RESIDUAL_DETECTED').eq('subject_id', lineR.data);
check('ONE-TIME AUDIT: قراءتان لا تكرّران التدقيق (عدد ثابت)', (evBefore ?? []).length === (evAfter ?? []).length);
check('ONE RESIDUAL-DETECTED AUDIT عند تسجيل السطر (لا ابتلاع)', (evAfter ?? []).length === 1);
// خطوة المحاسبة fail-closed: شهادة قيد تسوية بباقٍ غير صفري بلا حساب فرق مرفوضة
const { data: stlNoMap } = await rpc(ACC_B, 'acc_record_settlement', { p_company: coB, p_provider: 'GW', p_settlement_ref: `nm-${TAG}`, p_settled_at: '2026-09-21' });
await rpc(ACC_B, 'acc_add_settlement_line', { p_settlement: stlNoMap, p_payment: null, p_gross: '100', p_fee: '3', p_net: '95', p_currency: 'KWD' });
// قراءة الباقي تعمل (تُعيد 2) — الحقائق محفوظة رغم غياب التعيين
const residB = await ACC_B.client.rpc('acc_settlement_residual', { p_settlement: stlNoMap });
check('الحقائق محفوظة والقراءة تعمل رغم غياب التعيين (evidence ≠ accounting)', !residB.error && String(residB.data) === '2');
// جهّز قيدًا مرحّلًا في باء لمحاولة الشهادة → يجب أن يفشل مغلقًا
const { data: perB } = await rpc(ACC_B, 'acc_create_period', { p_company: coB, p_fiscal_year: `FY-${TAG}`, p_start: '2026-01-01', p_end: '2026-12-31' });
await rpc(ACC_B, 'acc_transition_period', { p_period: perB, p_new_state: 'OPEN' });
const aB = async (code) => (await rpc(ACC_B, 'acc_create_account', { p_company: coB, p_code: `${code}-${TAG}`, p_name: code, p_type: 'ASSET' })).data;
const x1 = await aB('X1'), x2 = await aB('X2');
const { data: jB } = await rpc(ACC_B, 'acc_create_manual_journal', { p_company: coB, p_period: perB, p_entry_date: '2026-09-21', p_description: 'x',
  p_lines: [{ account_id: x1, side: 'DEBIT', amount_minor: '2', currency: 'KWD', base_amount_minor: '2', base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' },
            { account_id: x2, side: 'CREDIT', amount_minor: '2', currency: 'KWD', base_amount_minor: '2', base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
await rpc(ACC_B, 'acc_submit_journal', { p_entry: jB }); await rpc(ACC_B, 'acc_post_journal', { p_entry: jB });
const attB = await rpc(ACC_B, 'acc_attest_payment_journal', { p_purpose: 'SETTLEMENT', p_journal_entry: jB, p_attestation_reason: 'x', p_settlement: stlNoMap });
check('MISSING DIFFERENCE MAPPING AT ACCOUNTING STEP: FAIL-CLOSED', !!attB.error && /AUTHORITATIVE_MAPPING_REQUIRED/.test(attB.error.message));

console.log('═══ ٥ · التجميد والمناعة ═══');
const tamP = await svc.from('acc_payments').update({ amount_minor: '1' }).eq('id', pmt.data);
check('IMMUTABILITY: الدفعة الناجحة مجمّدة', !!tamP.error && /immutable/.test(tamP.error.message));
const tamS = await svc.from('acc_settlement_lines').update({ fee_minor: '0' }).eq('id', lineR.data);
check('سطر التسوية مجمّد', !!tamS.error);
const { data: pjl } = await svc.from('acc_payment_journal_links').select('id').eq('company_id', coA).limit(1).single();
const tamL = await svc.from('acc_payment_journal_links').update({ attestation_reason: 'x' }).eq('id', pjl.id);
check('روابط القيد append-only', !!tamL.error);

console.log('═══ ٦ · الاسترداد (CORRECTION 4 · REV-010 · PAY-T-026..030) ═══');
const inv2 = await issuedInvoice('100000');
const pmt2 = await rpc(OWN, 'acc_record_payment', { p_company: coA, p_invoice: inv2, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `gw2-${TAG}` });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt2.data, p_new_status: 'PENDING' });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt2.data, p_new_status: 'SUCCESS' });
const badPol = await rpc(ACC, 'acc_request_refund', { p_payment: pmt2.data, p_amount_minor: '40000', p_effective: '2026-09-25', p_policy_id: 'POL-001' });
check('REV-010: الاسترداد بسياسة غير POL-008/009 مرفوض', !!badPol.error);
const ref = await rpc(ACC, 'acc_request_refund', { p_payment: pmt2.data, p_amount_minor: '40000', p_effective: '2026-09-25', p_policy_id: 'POL-009', p_external_refund_id: `rf-${TAG}` });
check('REFUND ENTITY: استرداد جزئي 40 من 100', !ref.error, ref.error?.message);
const { data: refRow } = await svc.from('acc_refunds').select('refund_policy_id, policy_version, provisional').eq('id', ref.data).single();
check('POL-009 محلولة ومجمّدة + provisional (قالب عام)', refRow.refund_policy_id === 'POL-009' && refRow.policy_version === 1 && refRow.provisional === true);
const over = await rpc(ACC, 'acc_request_refund', { p_payment: pmt2.data, p_amount_minor: '70000', p_effective: '2026-09-25', p_policy_id: 'POL-009' });
check('PAY-T-028 الجزئي لا يتجاوز المتبقي', !!over.error);
await rpc(ACC, 'acc_set_refund_status', { p_refund: ref.data, p_new_status: 'PROCESSING' });
await rpc(ACC, 'acc_set_refund_status', { p_refund: ref.data, p_new_status: 'REFUNDED' });
const { data: p2 } = await svc.from('acc_payments').select('status, amount_minor').eq('id', pmt2.data).single();
check('PAY-T-028 الدفعة الأصلية لم تُمسح (الجزئي لا ينقلها لـREFUNDED)', p2.status === 'SUCCESS' && String(p2.amount_minor) === '100000');
// استرداد كامل متبقٍ (60) ينقل الدفعة
const ref2 = await rpc(ACC, 'acc_request_refund', { p_payment: pmt2.data, p_amount_minor: '60000', p_effective: '2026-09-26', p_policy_id: 'POL-009' });
await rpc(ACC, 'acc_set_refund_status', { p_refund: ref2.data, p_new_status: 'PROCESSING' });
await rpc(ACC, 'acc_set_refund_status', { p_refund: ref2.data, p_new_status: 'REFUNDED' });
const { data: p2b } = await svc.from('acc_payments').select('status').eq('id', pmt2.data).single();
check('PAY-T-029 الكامل ينقل الدفعة إلى REFUNDED', p2b.status === 'REFUNDED');
// المالكة لا تطلب استردادًا (عملية تقنية)
const ownRef = await rpc(OWN, 'acc_request_refund', { p_payment: pmt.data, p_amount_minor: '10', p_effective: '2026-09-25', p_policy_id: 'POL-008' });
check('الاسترداد عملية تقنية — المالكة مرفوضة', !!ownRef.error);

console.log('═══ ٧ · حالة سداد الفاتورة ═══');
const inv3 = await issuedInvoice('100000');
const pmt3 = await rpc(OWN, 'acc_record_payment', { p_company: coA, p_invoice: inv3, p_amount_minor: '40000', p_currency: 'KWD', p_gateway_txn_id: `gw3-${TAG}` });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt3.data, p_new_status: 'PENDING' });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt3.data, p_new_status: 'SUCCESS' });
await rpc(ACC, 'acc_sync_invoice_payment_status', { p_invoice: inv3 });
const { data: i3 } = await svc.from('acc_invoices').select('status').eq('id', inv3).single();
check('PAY-T دفعة جزئية → الفاتورة PARTIALLY_PAID', i3.status === 'PARTIALLY_PAID');
const pmt3b = await rpc(OWN, 'acc_record_payment', { p_company: coA, p_invoice: inv3, p_amount_minor: '60000', p_currency: 'KWD', p_gateway_txn_id: `gw3b-${TAG}` });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt3b.data, p_new_status: 'PENDING' });
await rpc(OWN, 'acc_set_payment_status', { p_payment: pmt3b.data, p_new_status: 'SUCCESS' });
await rpc(ACC, 'acc_sync_invoice_payment_status', { p_invoice: inv3 });
const { data: i3b } = await svc.from('acc_invoices').select('status, total_minor').eq('id', inv3).single();
check('PAY-T اكتمال السداد → PAID (لا ازدواج)', i3b.status === 'PAID');

console.log('═══ ٨ · Clearing Ageing (PAY-T-031) ═══');
const age = await ACC.client.rpc('acc_clearing_ageing', { p_company: coA, p_as_of: '2026-09-30', p_stale_days: 7 });
check('CLEARING AGEING يعمل بمصدر/مرجع/عمر', !age.error && Array.isArray(age.data));
const ageNoMap = await ACC_B.client.rpc('acc_clearing_ageing', { p_company: coB });
check('Ageing بلا تعيين clearing = fail-closed', !!ageNoMap.error && /AUTHORITATIVE_MAPPING_REQUIRED/.test(ageNoMap.error.message));

console.log('═══ ٩ · null-auth والعزل (PAY-T-032/033) ═══');
const NM = await mintUser('nm');
const guards = [
  ['acc_clearing_ageing', { p_company: coA }],
  ['acc_settlement_residual', { p_settlement: stl.data }],
];
for (const [fn, args] of guards) {
  for (const [u, tag] of [[NM, 'no-membership'], [ACC_B, 'other-company'], [OWN, 'owner (لا داخل خام)'], [EMP, 'employee'], [RO, 'read-only'], [OUT, 'platform-admin']]) {
    const r = await u.client.rpc(fn, args);
    check(`CROSS/ROLE ${fn} BLOCKED (${tag})`, !!r.error);
  }
  check(`${fn} BLOCKED (no-auth svc)`, !!(await svc.rpc(fn, args)).error);
}
const payOtherCo = await rpc(ACC_B, 'acc_record_payment', { p_company: coA, p_invoice: inv, p_amount_minor: '1', p_currency: 'KWD' });
check('TENANT: محاسبة باء لا تسجّل دفعة في ألف', !!payOtherCo.error);
const { data: bReads } = await ACC_B.client.from('acc_settlement_lines').select('id').eq('company_id', coA);
check('TENANT ISOLATION: باء لا ترى أسطر تسوية ألف', (bReads ?? []).length === 0);
// المخوّلون
check('AUDITOR READ (settlements)', (await AUD.client.from('acc_settlements').select('id').eq('company_id', coA)).data?.length >= 1);
check('FINANCE_MANAGER ageing report allowed', !(await FM.client.rpc('acc_clearing_ageing', { p_company: coA })).error);

console.log('═══ ١٠ · التدقيق (PAY-T-035) ═══');
const { data: evs } = await svc.from('acc_audit_events').select('action').eq('company_id', coA);
const acts = new Set(evs.map((e) => e.action));
for (const a of ['PAYMENT_RECORDED', 'PAYMENT_STATUS_CHANGED', 'SETTLEMENT_RECORDED', 'SETTLEMENT_LINE_ADDED',
  'PAYMENT_JOURNAL_ATTESTED', 'REFUND_REQUESTED', 'REFUND_STATUS_CHANGED', 'GL_ACCOUNT_LINK_DESIGNATED', 'INVOICE_PAYMENT_STATUS_SYNCED'])
  check(`حدث ${a}`, acts.has(a));

console.log(`\n  المدفوعات والمقاصّة: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار تبقى في Staging عمدًا — لا حذف بالبنية)');
if (failed) process.exit(1);
