#!/usr/bin/env node
/**
 * اختبارات Stage 4 على القاعدة — **PENDING STAGING**: تتطلب تطبيق
 * هجرة 2026-08-27-accounting-commercial-documents على Staging أولًا.
 * لا إنتاج أبدًا. قابلة لإعادة التشغيل على قاعدة append-only —
 * كل تشغيلة تنشئ شركاتها وسجلاتها بمعرفات فريدة.
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
  const email = `acc4-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}

const OWN = await mintUser('own'), ACC = await mintUser('acc'), AUD = await mintUser('aud'),
      FM = await mintUser('fm'), EMP = await mintUser('emp'), RO = await mintUser('ro'),
      OUT = await mintUser('out'), OWN_B = await mintUser('ownb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة فواتير ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة فواتير باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [RO, 'READ_ONLY']]) {
  const { error } = await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });
  if (error) throw error;
}
const rpc = (u, fn, args) => u.client.rpc(fn, args);

console.log('\n═══ ١ · العملاء والموردون ═══');
const { data: custA } = await rpc(OWN, 'acc_create_customer', {
  p_company: coA, p_name: `مدرسة النور ${TAG}`,
  p_contact: { email: 'x@school.kw' }, p_tax_identifiers: { cr: '12345' },
  p_currency: 'KWD', p_payment_terms: 'NET-30' });
check('CUSTOMER COMPANY SCOPED — المالكة تنشئ', !!custA);
const upd = await rpc(OWN, 'acc_update_customer', { p_customer: custA, p_name: `مدرسة النور الجديدة ${TAG}`,
  p_contact: { email: 'y@school.kw' }, p_tax_identifiers: { cr: '99999' }, p_currency: 'KWD', p_payment_terms: 'NET-15' });
check('CUSTOMER MUTABLE + TAX IDENTIFIER CHANGE AUDITED', !upd.error, upd.error?.message);
const { data: custEv } = await svc.from('acc_audit_events').select('before_state, after_state')
  .eq('action', 'CUSTOMER_CHANGED').eq('subject_id', custA).limit(1).single();
check('قبل/بعد في التدقيق (المعرفات الضريبية)',
  custEv.before_state.tax_identifiers.cr === '12345' && custEv.after_state.tax_identifiers.cr === '99999');
const deact = await rpc(OWN, 'acc_set_customer_active', { p_customer: custA, p_active: false });
check('CUSTOMER DEACTIVATE', !deact.error);
await rpc(OWN, 'acc_set_customer_active', { p_customer: custA, p_active: true });
const delC = await svc.from('acc_customers').delete().eq('id', custA);
check('حذف عميل مرفوض — تعطيل بدل الحذف', !!delC.error && /deactivate/.test(delC.error.message));
const { data: bSeesCust } = await OWN_B.client.from('acc_customers').select('id').eq('company_id', coA);
check('CROSS-COMPANY CUSTOMER ACCESS BLOCKED', (bSeesCust ?? []).length === 0);
const { data: vend } = await rpc(OWN, 'acc_create_vendor', {
  p_company: coA, p_name: `مزود سحابة ${TAG}`, p_currency: 'USD',
  p_is_non_resident: true, p_withholding_status: 'CAPTURE_ONLY' });
check('VENDOR COMPANY SCOPED + IS_NON_RESIDENT + WITHHOLDING_STATUS PERSISTED', !!vend);
const uv = await rpc(OWN, 'acc_update_vendor', { p_vendor: vend, p_name: `مزود سحابة ${TAG}`,
  p_contact: {}, p_currency: 'USD', p_is_non_resident: false, p_withholding_status: 'REVIEW' });
const { data: vendEv } = await svc.from('acc_audit_events').select('before_state, after_state')
  .eq('action', 'VENDOR_CHANGED').eq('subject_id', vend).limit(1).single();
check('RESIDENCY CHANGE AUDITED قبل/بعد', !uv.error &&
  vendEv.before_state.is_non_resident === true && vendEv.after_state.is_non_resident === false);
const { data: bSeesVend } = await OWN_B.client.from('acc_vendors').select('id').eq('company_id', coA);
check('CROSS-COMPANY VENDOR ACCESS BLOCKED', (bSeesVend ?? []).length === 0);

console.log('═══ ٢ · المنتجات ═══');
const { data: prod } = await rpc(OWN, 'acc_create_product', {
  p_company: coA, p_name: `اشتراك الاستوديو ${TAG}`, p_price_minor: '3000',
  p_currency: 'KWD', p_revenue_policy_id: 'POL-003' });
check('PRODUCT COMPANY SCOPED + EXACT MONEY PRICE + POLICY PERSISTED', !!prod);
const { data: prodRow } = await OWN.client.from('acc_products').select('price_minor, revenue_policy_id').eq('id', prod).single();
check('REVENUE_POLICY_ID PERSISTED', String(prodRow.price_minor) === '3000' && prodRow.revenue_policy_id === 'POL-003');

console.log('═══ ٣ · المسودة والترقيم ═══');
const mkDraft = (u, lines, cust = custA) => rpc(u, 'acc_create_invoice_draft', {
  p_company: coA, p_customer: cust, p_currency: 'KWD', p_due_date: '2026-09-30', p_lines: lines });
const L = (qty, price, extra = {}) => ({ product_id: prod, quantity: qty, unit_price_minor: price,
  currency: 'KWD', tax_status: 'NO_TAX_REGIME', ...extra });
const { data: inv1, error: inv1e } = await mkDraft(OWN, [L('2', '3000'), L('1', '1500')]);
check('DRAFT CREATED WITHOUT FINAL NUMBER', !!inv1, inv1e?.message);
const { data: inv1row } = await OWN.client.from('acc_invoices').select('invoice_number, status, total_minor').eq('id', inv1).single();
check('المسودة بلا رقم والمجموع محسوب من الخادم (7500)',
  inv1row.invoice_number === null && String(inv1row.total_minor) === '7500');
const edit1 = await rpc(OWN, 'acc_edit_invoice_draft', { p_invoice: inv1, p_customer: custA,
  p_currency: 'KWD', p_due_date: '2026-10-15', p_lines: [L('2', '3000')] });
check('DRAFT EDITABLE + LINES EDITABLE + CUSTOMER CHANGE', !edit1.error, edit1.error?.message);
// محاولة تزوير المجموع مباشرة
const fake = await OWN.client.from('acc_invoices').update({ total_minor: '1' }).eq('id', inv1);
check('CALLER CANNOT FAKE TOTAL (الكتابة المباشرة مقفلة)', !!fake.error || fake.count === 0);
const { data: invDel } = await mkDraft(OWN, [L('1', '500')]);
const delD = await rpc(OWN, 'acc_delete_invoice_draft', { p_invoice: invDel });
const { data: delRow } = await svc.from('acc_invoices').select('status, invoice_number').eq('id', invDel).single();
check('DRAFT → DELETED محفوظة وبلا رقم (DELETED DRAFT CONSUMES NO NUMBER)',
  !delD.error && delRow.status === 'DELETED' && delRow.invoice_number === null);

const issue1 = await rpc(OWN, 'acc_issue_invoice', { p_invoice: inv1, p_issue_date: '2026-08-27' });
check('NUMBER ASSIGNED ONLY ON ISSUE — أول إصدار', !issue1.error, issue1.error?.message);
const n1 = issue1.data;
const { data: inv2 } = await mkDraft(OWN, [L('1', '3000')]);
const issue2 = await rpc(OWN, 'acc_issue_invoice', { p_invoice: inv2, p_issue_date: '2026-08-27' });
check('SECOND SUCCESSFUL ISSUE GETS N+1', !issue2.error && Number(issue2.data) === Number(n1) + 1);
// إصدار فاشل (عميل معطل) لا يستهلك رقمًا
const { data: invFail } = await mkDraft(OWN, [L('1', '3000')]);
await rpc(OWN, 'acc_set_customer_active', { p_customer: custA, p_active: false });
const failIssue = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invFail, p_issue_date: '2026-08-27' });
await rpc(OWN, 'acc_set_customer_active', { p_customer: custA, p_active: true });
check('فشل الإصدار: عميل معطل مرفوض', !!failIssue.error && /inactive customer/.test(failIssue.error.message));
const issue3 = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invFail, p_issue_date: '2026-08-27' });
check('FAILED ISSUE CONSUMES NO NUMBER — التالي يأخذ N+2 بلا فجوة',
  !issue3.error && Number(issue3.data) === Number(n1) + 2);
// تزامن: فاتورتان تصدران معًا
const { data: invC1 } = await mkDraft(OWN, [L('1', '100')]);
const { data: invC2 } = await mkDraft(OWN, [L('1', '200')]);
const [r1, r2] = await Promise.all([
  rpc(OWN, 'acc_issue_invoice', { p_invoice: invC1, p_issue_date: '2026-08-27' }),
  rpc(OWN, 'acc_issue_invoice', { p_invoice: invC2, p_issue_date: '2026-08-27' }),
]);
const nums = [Number(r1.data), Number(r2.data)].sort((a, b) => a - b);
check('CONCURRENT ISSUES NO DUPLICATES + GAPLESS', !r1.error && !r2.error &&
  nums[0] === Number(n1) + 3 && nums[1] === Number(n1) + 4, JSON.stringify(nums));
// شركة أخرى تبدأ ترقيمها المستقل
const { data: custB } = await rpc(OWN_B, 'acc_create_customer', { p_company: coB, p_name: `عميل باء ${TAG}` });
const { data: prodB } = await rpc(OWN_B, 'acc_create_product', { p_company: coB, p_name: `منتج باء ${TAG}`, p_price_minor: '1000', p_currency: 'KWD' });
const { data: invB } = await OWN_B.client.rpc('acc_create_invoice_draft', { p_company: coB, p_customer: custB, p_currency: 'KWD',
  p_lines: [{ product_id: prodB, quantity: '1', unit_price_minor: '1000', currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
const issueB = await rpc(OWN_B, 'acc_issue_invoice', { p_invoice: invB, p_issue_date: '2026-08-27' });
check('NUMBERING INDEPENDENT BETWEEN COMPANIES (باء تبدأ من 1)', !issueB.error && Number(issueB.data) === 1);
const chgNum = await svc.from('acc_invoices').update({ invoice_number: '999' }).eq('id', inv1);
check('NUMBER IMMUTABLE', !!chgNum.error);

console.log('═══ ٣ب · حماية العدّاد والإصدار البنيوية (FIXES) ═══');
{
  // صفر-صفوف لا يثبت الحارس: نتأكد أولًا أن صف العدّاد موجود فعلًا
  // (خلقه إصدار ناجح شرعي أعلاه) ثم نهاجمه مباشرة
  const { data: counterRow } = await svc.from('acc_invoice_counters').select('last_number').eq('company_id', coA).maybeSingle();
  check('صف العدّاد موجود بعد إصدار شرعي (شرط مسبق لاختبار الحارس)', !!counterRow, 'counter row missing');
  const cIns = await svc.from('acc_invoice_counters').insert({ company_id: coB, last_number: '500' });
  check('DIRECT COUNTER INSERT BLOCKED (نقطة بداية اعتباطية)', !!cIns.error);
  const cUpd = await svc.from('acc_invoice_counters').update({ last_number: '100' }).eq('company_id', coA);
  check('DIRECT/SERVICE COUNTER UPDATE BLOCKED (على صف موجود فعلًا)',
    !!counterRow && !!cUpd.error && /signed issue transaction|exactly one/.test(cUpd.error.message));
  const cDel = await svc.from('acc_invoice_counters').delete().eq('company_id', coA);
  check('DIRECT COUNTER DELETE BLOCKED (على صف موجود فعلًا)',
    !!counterRow && !!cDel.error && /never resets|signed issue/.test(cDel.error.message));
  const oIns = await OWN.client.from('acc_invoice_counters').insert({ company_id: coA, last_number: '0' });
  check('OWNER CANNOT MANUALLY ADVANCE COUNTER', !!oIns.error);
  // INSERT خام لفاتورة مصدرة/مرقمة — حتى بمفتاح الخدمة
  const rawIssued = await svc.from('acc_invoices').insert({ company_id: coA, customer_id: custA, currency: 'KWD', status: 'ISSUED' });
  check('RAW INSERT ISSUED INVOICE BLOCKED (حتى service)', !!rawIssued.error && /born DRAFT/.test(rawIssued.error.message));
  const rawNum = await svc.from('acc_invoices').insert({ company_id: coA, customer_id: custA, currency: 'KWD', invoice_number: '777' });
  check('RAW INSERT WITH FINAL NUMBER BLOCKED', !!rawNum.error);
  // مسودة: كتابة الرقم/أدلة الإصدار مباشرة مرفوضة
  const { data: invG } = await mkDraft(OWN, [L('1', '100')]);
  const dNum = await svc.from('acc_invoices').update({ invoice_number: '888' }).eq('id', invG);
  check('DIRECT DRAFT NUMBER ASSIGNMENT BLOCKED', !!dNum.error && /only inside acc_issue_invoice/.test(dNum.error.message));
  const dIssuedAt = await svc.from('acc_invoices').update({ issued_at: new Date().toISOString(), issued_by: OWN.id }).eq('id', invG);
  check('DIRECT issued_at/issued_by ASSIGNMENT BLOCKED', !!dIssuedAt.error);
  const dState = await svc.from('acc_invoices').update({ status: 'ISSUED' }).eq('id', invG);
  check('DIRECT DRAFT → ISSUED BLOCKED', !!dState.error);
  const { data: gRow } = await svc.from('acc_invoices').select('status, invoice_number, issued_at, issued_by').eq('id', invG).single();
  check('FAILED/BLOCKED PATHS LEAVE DRAFT UNNUMBERED',
    gRow.status === 'DRAFT' && gRow.invoice_number === null && gRow.issued_at === null && gRow.issued_by === null);
  const okIssue = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invG, p_issue_date: '2026-08-27' });
  const { data: gRow2 } = await svc.from('acc_invoices').select('status, invoice_number, issued_at, issued_by, customer_snapshot').eq('id', invG).single();
  check('CONTROLLED ISSUE SUCCEEDS + NUMBER/SNAPSHOT/STATE ATOMIC',
    !okIssue.error && gRow2.status === 'ISSUED' && gRow2.invoice_number !== null &&
    gRow2.issued_at !== null && gRow2.issued_by !== null && gRow2.customer_snapshot !== null);
}

console.log('═══ ٣ب٢ · انحدار العلة: الإصدار الأول لا يخنقه invariant الرقم ═══');
{
  // العلة الأصلية: الرقم يُكتب أثناء DRAFT ثم DRAFT→ISSUED بنفس الرقم — يجب أن يمر
  const { data: invR } = await mkDraft(OWN, [L('1', '250')]);
  const issueR = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invR, p_issue_date: '2026-08-27' });
  check('FIRST LEGITIMATE NUMBER ASSIGNMENT + SECOND UPDATE SAME NUMBER + DRAFT→ISSUED',
    !issueR.error && issueR.data !== null, issueR.error?.message);
  const { data: rRow } = await svc.from('acc_invoices').select('status, invoice_number').eq('id', invR).single();
  check('الفاتورة ISSUED برقمها', rRow.status === 'ISSUED' && rRow.invoice_number !== null);
  const bump = await svc.from('acc_invoices').update({ invoice_number: String(Number(rRow.invoice_number) + 1) }).eq('id', invR);
  check('NUMBER N → N+1 AFTER ASSIGNMENT BLOCKED', !!bump.error && /never change once assigned|frozen/.test(bump.error.message));
  const toNull = await svc.from('acc_invoices').update({ invoice_number: null }).eq('id', invR);
  check('NUMBER N → NULL BLOCKED', !!toNull.error);
  const voidR = await rpc(OWN, 'acc_void_invoice', { p_invoice: invR, p_reason: 'انحدار العلة' });
  const bumpV = await svc.from('acc_invoices').update({ invoice_number: '424242' }).eq('id', invR);
  check('VOIDED NUMBER CHANGE BLOCKED (الملغاة تحتفظ برقمها)', !voidR.error && !!bumpV.error);
}

console.log('═══ ٣ج · هوية سياسة الإيراد (FIX 3) ═══');
{
  const unknown = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `مجهول ${TAG}`, p_price_minor: '100', p_currency: 'KWD', p_revenue_policy_id: 'POL-999' });
  check('UNKNOWN POL-999 BLOCKED', !!unknown.error && /unknown revenue policy/.test(unknown.error.message));
  const known = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `معروف ${TAG}`, p_price_minor: '100', p_currency: 'KWD', p_revenue_policy_id: 'POL-001' });
  check('KNOWN GLOBAL LOGICAL POLICY ID ACCEPTED', !known.error, known.error?.message);
  // سياسة موجودة فقط لشركة أخرى: أنشئ نسخة شركة باء لسياسة وهمية؟ لا نستطيع اختراع policy_id
  // جديد (السجل يقبل POL-xxx عبر دالة الخادم) — ننشئ نسخة شركةٍ لباء بسياسة معروفة ثم نتأكد
  // أن مجرد وجود نسخة شركةٍ أخرى لا يفتح البوابة لمعرف غير معروف عالميًا: مغطى بـPOL-999.
  const chg = await rpc(OWN, 'acc_update_product', { p_product: known.data, p_name: `معروف ${TAG}`, p_price_minor: '100', p_currency: 'KWD', p_revenue_policy_id: 'POL-998', p_product_type: null, p_delivery_model: null });
  check('تغيير المنتج إلى سياسة مجهولة مرفوض أيضًا', !!chg.error);
  const lineBad = await mkDraft(OWN, [L('1', '100', { revenue_policy_id: 'POL-997' })]);
  check('سطر بسياسة مجهولة مرفوض', !!lineBad.error);
}

console.log('═══ ٤ · التجميد واللقطات ═══');
const { data: frozen } = await svc.from('acc_invoices').select('*').eq('id', inv1).single();
// صلابة: لو فشل الإصدار الأساس نعلن فشل التوابع بوضوح ونكمل التقرير — لا crash
const issuedOk = frozen.status !== 'DRAFT' && frozen.customer_snapshot !== null;
check('الإصدار الأساس تم (شرط مسبق لفحوص اللقطات)', issuedOk, `status=${frozen.status}`);
check('لقطة العميل مثبتة عند الإصدار', issuedOk && frozen.customer_snapshot?.name === `مدرسة النور الجديدة ${TAG}`);
// تغيير العميل والمنتج بعد الإصدار — الوثيقة لا تنجرف
await rpc(OWN, 'acc_update_customer', { p_customer: custA, p_name: `اسم متغير ${TAG}`, p_contact: {}, p_tax_identifiers: {}, p_currency: 'KWD', p_payment_terms: null });
await rpc(OWN, 'acc_update_product', { p_product: prod, p_name: `اسم منتج جديد ${TAG}`, p_price_minor: '9999', p_currency: 'KWD', p_revenue_policy_id: 'POL-004', p_product_type: null, p_delivery_model: null });
const { data: after } = await svc.from('acc_invoices').select('customer_snapshot, total_minor').eq('id', inv1).single();
check('CUSTOMER CHANGE DOES NOT ALTER ISSUED INVOICE', after.customer_snapshot?.name === `مدرسة النور الجديدة ${TAG}`);
const { data: lineAfter } = await svc.from('acc_invoice_lines').select('description, unit_price_minor, revenue_policy_id').eq('invoice_id', inv1).limit(1).single();
check('PRODUCT NAME/PRICE/POLICY CHANGE DOES NOT ALTER ISSUED LINE',
  lineAfter.description === `اشتراك الاستوديو ${TAG}` && String(lineAfter.unit_price_minor) === '3000' && lineAfter.revenue_policy_id === 'POL-003');
check('ISSUED INVOICE FULLY REPRODUCIBLE', String(after.total_minor) === '6000');
for (const [n, q] of [
  ['ISSUED HEADER FINANCIAL EDIT BLOCKED', svc.from('acc_invoices').update({ total_minor: '1' }).eq('id', inv1)],
  ['ISSUED CUSTOMER CHANGE BLOCKED', svc.from('acc_invoices').update({ customer_id: custB }).eq('id', inv1)],
  ['POST-ISSUE FX EVIDENCE CHANGE BLOCKED', svc.from('acc_invoices').update({ fx_rate: '9' }).eq('id', inv1)],
  ['ISSUED LINE UPDATE BLOCKED', svc.from('acc_invoice_lines').update({ unit_price_minor: '1' }).eq('invoice_id', inv1)],
  ['ISSUED LINE DELETE BLOCKED', svc.from('acc_invoice_lines').delete().eq('invoice_id', inv1)],
]) { const r = await q; check(n, !!r.error); }
const insLine = await svc.from('acc_invoice_lines').insert({ invoice_id: inv1, company_id: coA, product_id: prod,
  description: 'x', quantity: '1', unit_price_minor: '1', line_amount_minor: '1', currency: 'KWD', tax_status: 'NO_TAX_REGIME' });
check('ISSUED LINE INSERT BLOCKED', !!insLine.error);
const hardDel = await svc.from('acc_invoices').delete().eq('id', inv1);
check('حذف فعلي مرفوض دائمًا', !!hardDel.error);

console.log('═══ ٥ · آلة الحالات ═══');
const send1 = await rpc(OWN, 'acc_send_invoice', { p_invoice: inv1 });
check('ISSUED → SENT', !send1.error, send1.error?.message);
const void2 = await rpc(OWN, 'acc_void_invoice', { p_invoice: inv2, p_reason: 'خطأ تجاري' });
check('ISSUED → VOIDED بسبب', !void2.error, void2.error?.message);
const { data: voided } = await svc.from('acc_invoices').select('invoice_number, total_minor, status').eq('id', inv2).single();
check('VOIDED NUMBER RETAINED + CONTENT IMMUTABLE',
  Number(voided.invoice_number) === Number(n1) + 1 && String(voided.total_minor) === '3000');
const voidNoReason = await rpc(OWN, 'acc_void_invoice', { p_invoice: invFail, p_reason: ' ' });
check('الإلغاء بلا سبب مرفوض', !!voidNoReason.error);
// انتقالات محرمة مباشرة حتى بمفتاح الخدمة
for (const [n, from, to] of [
  ['UNLISTED TRANSITION BLOCKED (SENT→PAID مباشرة)', inv1, 'PAID'],
  ['ISSUED → DELETED BLOCKED', invFail, 'DELETED'],
  ['VOIDED → أي شيء BLOCKED (terminal)', inv2, 'ISSUED'],
]) {
  const r = await svc.from('acc_invoices').update({ status: to }).eq('id', from);
  check(n, !!r.error);
}
// حافة وحدات المستقبل: SENT→PARTIALLY_PAID بلا توقيع الوحدة = مرفوضة
// الانحدار الأمني بعينه: اتصال عذراء بلا GUC معرف إطلاقًا — عبر عميل
// service جديد كليًا (اتصال/جلسة PostgREST مستقلة عن أي RPC سابق)
const svcFresh = createClient(URL, SVC, { auth: { persistSession: false }, global: { headers: { 'x-fresh': TAG } } });
const modEdge = await svcFresh.from('acc_invoices').update({ status: 'PARTIALLY_PAID' }).eq('id', inv1);
check('RAW SENT→PARTIALLY_PAID بلا توقيع الوحدة — اتصال عذراء = BLOCKED',
  !!modEdge.error && /future signed modules/.test(modEdge.error.message), JSON.stringify(modEdge.error));
const { data: inv1After } = await svc.from('acc_invoices').select('status').eq('id', inv1).single();
check('الحالة لم تتحرك (SENT باقية)', inv1After.status === 'SENT');
const humanEdge = await svcFresh.from('acc_invoices').update({ status: 'VOIDED' }).eq('id', invFail);
check('حافة بشرية (ISSUED→VOIDED) بلا توقيعها — اتصال عذراء = BLOCKED',
  !!humanEdge.error && /signed Stage 4 operation/.test(humanEdge.error.message));
const { data: delRow2 } = await svc.from('acc_invoices').select('status').eq('id', invDel).single();
const delOut = await svc.from('acc_invoices').update({ status: 'DRAFT' }).eq('id', invDel);
check('DELETED terminal', delRow2.status === 'DELETED' && !!delOut.error);

console.log('═══ ٦ · المال والضريبة وFX ═══');
const { data: l1 } = await svc.from('acc_invoice_lines').select('tax_status, tax_rate').eq('invoice_id', inv1);
check('EVERY LINE TAX STATUS + NO_TAX_REGIME RATE NULL (لا ZERO_RATED)',
  l1.every((x) => x.tax_status === 'NO_TAX_REGIME' && x.tax_rate === null));
const badRate = await mkDraft(OWN, [L('1', '100', { tax_rate: '0' })]);
check('نسبة على NO_TAX_REGIME مرفوضة (حتى صفرًا)', !!badRate.error);
const taxableNoRate = await mkDraft(OWN, [L('1', '100', { tax_status: 'TAXABLE' })]);
check('TAXABLE بلا نسبة مرفوضة', !!taxableNoRate.error);
// كسر كمية دقيق: 2.5 × 1001 = 2503 (HALF_UP)
const { data: invQ } = await mkDraft(OWN, [L('2.5', '1001')]);
const { data: qRow } = await OWN.client.from('acc_invoices').select('total_minor').eq('id', invQ).single();
check('QUANTITY EXACT DECIMAL + LINE CALCULATION DETERMINISTIC (2.5×1001=2503)', String(qRow.total_minor) === '2503');
// فاتورة USD: تتطلب أدلة سعر، والأساس يحسب HALF_UP
const { data: prodU } = await rpc(OWN, 'acc_create_product', { p_company: coA, p_name: `منتج دولاري ${TAG}`, p_price_minor: '10000', p_currency: 'USD' });
const { data: invU } = await OWN.client.rpc('acc_create_invoice_draft', { p_company: coA, p_customer: custA, p_currency: 'USD',
  p_lines: [{ product_id: prodU, quantity: '1', unit_price_minor: '10000', currency: 'USD', tax_status: 'NO_TAX_REGIME' }] });
const noFx = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invU, p_issue_date: '2026-08-27' });
check('عملة أجنبية بلا سعر = رفض واضح لا تخمين', !!noFx.error && /never guessed/.test(noFx.error.message));
const withFx = await rpc(OWN, 'acc_issue_invoice', { p_invoice: invU, p_issue_date: '2026-08-27',
  p_fx_rate: '0.3071', p_fx_rate_date: '2026-08-27', p_fx_rate_source: 'CBK' });
check('FOREIGN-CURRENCY FX EVIDENCE STORED + إصدار يمر', !withFx.error, withFx.error?.message);
const { data: uRow } = await svc.from('acc_invoices').select('base_total_minor, fx_rate').eq('id', invU).single();
check('FX HALF_UP CONSISTENT ($100 × 0.3071 = 30.710 KWD = 30710)', String(uRow.base_total_minor) === '30710');

console.log('═══ ٧ · الأدوار والحدود ═══');
for (const [u, n] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [RO, 'READ_ONLY'], [OUT, 'PLATFORM ADMIN']]) {
  const r = await rpc(u, 'acc_create_invoice_draft', { p_company: coA, p_customer: custA, p_currency: 'KWD', p_lines: [L('1', '100')] });
  check(`${n} لا ينشئ فواتير (التحوير للمالكة)`, !!r.error);
}
const svcMut = await svc.rpc('acc_issue_invoice', { p_invoice: invQ, p_issue_date: '2026-08-27' });
check('AI/SYSTEM GENERIC MUTATION BLOCKED', !!svcMut.error && /authentication required/.test(svcMut.error.message));
const { data: audReads } = await AUD.client.from('acc_invoices').select('id').eq('company_id', coA);
check('AUDITOR READ', (audReads ?? []).length >= 4);
const { data: accReads } = await ACC.client.from('acc_invoice_lines').select('id').eq('company_id', coA);
check('ACCOUNTANT READ ALL COMMERCIAL', (accReads ?? []).length >= 4);
for (const [u, n] of [[EMP, 'EMPLOYEE'], [RO, 'READ_ONLY'], [OUT, 'PLATFORM ADMIN']]) {
  const { data } = await u.client.from('acc_invoices').select('id').eq('company_id', coA);
  check(`${n} بلا وصول خام`, (data ?? []).length === 0);
}
// عزل: مالكة باء لا تصدر بفاتورة/عميل/منتج ألف
const crossCust = await OWN_B.client.rpc('acc_create_invoice_draft', { p_company: coB, p_customer: custA, p_currency: 'KWD', p_lines: [] });
check('إصدار بعميل شركة أخرى مرفوض', !!crossCust.error);
const crossIssue = await rpc(OWN_B, 'acc_issue_invoice', { p_invoice: invQ, p_issue_date: '2026-08-27' });
check('مالكة شركة أخرى لا تصدر فاتورة ألف', !!crossIssue.error);

console.log('═══ ٨ · لا أثر محاسبيًا (Part Q) ═══');
{
  const { count: journals } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  check('ISSUE CREATES NO JOURNAL', journals === 0);
  const { count: sources } = await svc.from('acc_sources').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  check('NO SETTLEMENT/PAYMENT SOURCES CREATED', sources === 0);
  const { data: audEv } = await svc.from('acc_audit_events').select('action').eq('company_id', coA);
  const acts = new Set(audEv.map((e) => e.action));
  check('NO REVENUE/DEFERRED/AR EVENTS',
    ![...acts].some((a) => /REVENUE|DEFERRED|RECEIVABLE|PAYMENT/.test(a)));
  for (const a of ['INVOICE_NUMBER_ALLOCATED', 'INVOICE_ISSUED', 'INVOICE_SENT', 'INVOICE_VOIDED',
    'INVOICE_DRAFT_CREATED', 'INVOICE_DRAFT_EDITED', 'INVOICE_DRAFT_DELETED', 'PRODUCT_PRICE_CHANGED', 'PRODUCT_POLICY_CHANGED'])
    check(`حدث ${a} مسجل`, acts.has(a));
}

console.log(`\n  الوثائق التجارية: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار تبقى في Staging عمدًا — لا حذف بالبنية)');
if (failed) process.exit(1);
