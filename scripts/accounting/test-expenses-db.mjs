#!/usr/bin/env node
/**
 * Stage 8 — المصروفات على القاعدة — **PENDING STAGING**. يثبت آلة
 * الحالات، قاعدة المصدر، الاعتماد بحدّ الأساس، التصنيف الفاشل مغلقًا،
 * الترحيل عبر Stage 3 حصرًا، POSTED بعد قيد POSTED فقط، مناعة
 * المرحَّل، حجب حذف/فكّ دليل المرحَّل (DoD 3)، والتكرار للمراجعة.
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
const TAG = 'e' + Date.now().toString(36);

async function mintUser(t) {
  const email = `acc8x-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
const OWN = await mintUser('own'), ACC = await mintUser('acc'), FM = await mintUser('fm'),
      EMP = await mintUser('emp'), AUD = await mintUser('aud'), OWN_B = await mintUser('ownb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة مصروفات ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة مصروفات باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [AUD, 'AUDITOR']])
  await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });
// عقد عزل التجهيزات: Staging append-only، فكل سيناريو مستقل يأخذ مورده
// الفريد؛ مشاركة الحقائق حصرية لاختبارات التكرار المتعمدة (§٦).
async function newVendor(label) {
  const { data } = await OWN.client.rpc('acc_create_vendor', { p_company: coA, p_name: `مورد ${label} ${TAG}`, p_contact: {}, p_currency: 'KWD', p_is_non_resident: false, p_withholding_status: null });
  return data;
}
// كشف إعادة استخدام عرَضية لثلاثية (مورد، تاريخ، إجمالي) خارج اختبارات
// التكرار — يفشل مبكرًا بدل أن يفاجئنا كاشف التكرار الشرعي في القاعدة
const usedFacts = new Set();
function assertFreshFacts(vendorId, date, totalMinor, allowShared = false) {
  const k = `${vendorId}|${date}|${totalMinor}`;
  if (!allowShared && usedFacts.has(k))
    throw new Error(`fixture-isolation contract: الحقائق (${k}) مستعملة في سيناريو سابق — أعطِ السيناريو مورده/تاريخه الفريد`);
  usedFacts.add(k);
}
const vend = await newVendor('تكرار');   // حصري لاختبارات التكرار §٦
const vMoney = await newVendor('مال'), vSrc = await newVendor('مصدر'),
      vApp = await newVendor('اعتماد'), vAmb = await newVendor('غموض'),
      vPost = await newVendor('ترحيل'), vSm = await newVendor('حالات'),
      vIso = await newVendor('عزل');

const sha = async (s) => { const { createHash } = await import('node:crypto'); return createHash('sha256').update(s).digest('hex'); };
async function madeDoc(actor = OWN.id, content = Math.random().toString()) {
  const cap = `cap-${TAG}-${Math.random().toString(36).slice(2)}`;
  const { data: d } = await svc.rpc('acc_create_document', { p_company: coA, p_actor: actor, p_capture_id: cap,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: 1 });
  const id = d[0].document_id;
  await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'image/jpeg' });
  await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 5, p_server_sha256: await sha(content) });
  await svc.rpc('acc_finalize_document', { p_document: id });
  return id;
}
const KWD_LINE = (minor = '12345', cat = 'OFFICE') =>
  [{ amount_minor: minor, currency: 'KWD', base_amount_minor: minor, tax_status: 'NO_TAX_REGIME', category_key: cat }];
async function draft(u, key, { lines = KWD_LINE(), source = 'RECEIPT', just = null, vendor = vend, vref = null, date = '2026-09-01', allowShared = false } = {}) {
  const total = lines.reduce((a, l) => a + BigInt(l.base_amount_minor), 0n);
  assertFreshFacts(vendor, date, total, allowShared);
  const r = await u.client.rpc('acc_create_expense_draft', {
    p_company: coA, p_submission_key: key, p_vendor: vendor, p_expense_date: date,
    p_vendor_reference: vref, p_description: 'م', p_source_kind: source, p_manual_justification: just, p_lines: lines });
  if (r.error) throw new Error(r.error.message);
  return r.data[0];
}

console.log('\n═══ ١ · ACC-T-041..044: المال والدقة وFX التاريخي ═══');
{
  const kwd = await draft(OWN, `k-${TAG}`, { vendor: vMoney, lines: KWD_LINE('12345') });   // 12.345 KWD
  const { data: l } = await svc.from('acc_expense_lines').select('amount_minor, base_amount_minor').eq('expense_id', kwd.expense_id);
  check('ACC-T-041: KWD ثلاث منازل بوحدات صغرى تامة', String(l[0].amount_minor) === '12345');
  const usd = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `u-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '10000', currency: 'USD', base_amount_minor: '3070', base_currency: 'KWD',
      tax_status: 'NO_TAX_REGIME', category_key: 'TRAVEL', fx_rate: '0.3070', fx_rate_date: '2026-09-01', fx_rate_source: 'CBK' }] });
  check('ACC-T-042: USD بأساس تاريخي + أدلة السعر الثلاثة', !usd.error);
  const usdBad = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `ub-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '10000', currency: 'USD', base_amount_minor: '3070', base_currency: 'KWD', tax_status: 'NO_TAX_REGIME', category_key: 'TRAVEL' }] });
  check('عملة أجنبية بلا أدلة سعر مرفوضة (CHECK)', !!usdBad.error);
  const jpy = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `j-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '5000', currency: 'JPY', base_amount_minor: '1015', base_currency: 'KWD',
      tax_status: 'NO_TAX_REGIME', category_key: 'TRAVEL', fx_rate: '0.2030', fx_rate_date: '2026-09-01', fx_rate_source: 'CBK' }] });
  check('ACC-T-043: JPY صفر منازل بوحدات صغرى', !jpy.error);
  // ACC-T-044 (الدقة الزائدة) عقد تحويل العميل — مثبت محليًا في test-expenses.mjs
  const noTax = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `t-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '1000', currency: 'KWD', base_amount_minor: '1000', category_key: 'OFFICE' }] });
  check('ACC-T-045: سطر بلا tax_status مرفوض', !!noTax.error);
  const zeroRate = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `z-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '1000', currency: 'KWD', base_amount_minor: '1000', tax_status: 'NO_TAX_REGIME', tax_rate: '0', category_key: 'OFFICE' }] });
  check('ACC-T-046: نسبة على NO_TAX_REGIME مرفوضة — ليست صفر٪', !!zeroRate.error);
}

console.log('═══ ٢ · idempotency الإرسال (CORRECTION 5-A) ═══');
{
  const a = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `idem-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-03', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null, p_lines: KWD_LINE() });
  const b = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `idem-${TAG}`,
    p_vendor: vMoney, p_expense_date: '2026-09-03', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null, p_lines: KWD_LINE() });
  check('نفس مفتاح الإرسال = IDEMPOTENT_DUPLICATE بنفس المصروف',
    a.data[0].outcome === 'CREATED' && b.data[0].outcome === 'IDEMPOTENT_DUPLICATE' && a.data[0].expense_id === b.data[0].expense_id);
  const c = await OWN.client.rpc('acc_create_expense_draft', { p_company: coA, p_submission_key: `idem-${TAG}`,
    p_vendor: vend, p_expense_date: '2027-01-01', p_vendor_reference: null, p_description: 'م', p_source_kind: 'RECEIPT', p_manual_justification: null, p_lines: KWD_LINE() });
  check('نفس المفتاح بحقائق مختلفة = CONFLICT', c.data[0].outcome === 'CONFLICT');
}

console.log('═══ ٣ · ACC-T-047: قاعدة المصدر ═══');
{
  const e = await draft(EMP, `src-${TAG}`, { vendor: vSrc });
  const noSrc = await EMP.client.rpc('acc_submit_expense', { p_expense: e.expense_id, p_mark_uncertain: false });
  check('بلا دليل FINALIZED: الإرسال مرفوض', !!noSrc.error && /FINALIZED linked source/.test(noSrc.error.message));
  const m = await draft(EMP, `man-${TAG}`, { vendor: vSrc, source: 'MANUAL', just: null, date: '2026-09-02' });
  const noJust = await EMP.client.rpc('acc_submit_expense', { p_expense: m.expense_id, p_mark_uncertain: false });
  check('يدوي بلا تبرير مرفوض (اليدوي ليس بلا مصدر)', !!noJust.error && /justification/.test(noJust.error.message));
  const m2 = await draft(EMP, `man2-${TAG}`, { vendor: vSrc, source: 'MANUAL', just: 'اشتراك شهري معروف بلا إيصال', date: '2026-09-03' });
  const okMan = await EMP.client.rpc('acc_submit_expense', { p_expense: m2.expense_id, p_mark_uncertain: false });
  check('يدوي بتبرير كتابي يُرسل', !okMan.error && okMan.data[0].outcome === 'SUBMITTED');
}

console.log('═══ ٤ · ACC-T-048..051: الاعتماد والأدوار ═══');
{
  const doc = await madeDoc(EMP.id);
  const e = await draft(EMP, `app-${TAG}`, { vendor: vApp, lines: KWD_LINE('11111'), date: '2026-09-04' });
  await EMP.client.rpc('acc_link_document', { p_document: doc, p_target_kind: 'EXPENSE', p_target: e.expense_id, p_link_role: 'SOURCE' });
  const sub4 = await EMP.client.rpc('acc_submit_expense', { p_expense: e.expense_id, p_mark_uncertain: false });
  check('عزل تجهيزة §٤: الإرسال SUBMITTED بلا أي إشارة تكرار', !sub4.error && sub4.data[0].outcome === 'SUBMITTED');
  const empApprove = await EMP.client.rpc('acc_approve_expense', { p_expense: e.expense_id, p_reason: 'x' });
  check('ACC-T-048: الموظفة لا تعتمد', !!empApprove.error);
  const audApprove = await AUD.client.rpc('acc_approve_expense', { p_expense: e.expense_id, p_reason: 'x' });
  check('ACC-T-051: المدقّق لا يعتمد', !!audApprove.error);
  // بلا حدّ مضبوط: المدير يسجَّل ولا يُنهي — تصعيد للمالكة
  const fm1 = await FM.client.rpc('acc_approve_expense', { p_expense: e.expense_id, p_reason: 'ضمن العمل' });
  check('بلا حدّ: FM = OWNER_APPROVAL_REQUIRED', !fm1.error && fm1.data[0].outcome === 'OWNER_APPROVAL_REQUIRED');
  const own1 = await OWN.client.rpc('acc_approve_expense', { p_expense: e.expense_id, p_reason: 'موافقة المالكة' });
  check('اعتماد المالكة يكمل → APPROVED', !own1.error && own1.data[0].outcome === 'APPROVED');
  // ضبط حدّ ثم اعتماد مدير ضمن الحدّ
  const setL = await OWN.client.rpc('acc_set_expense_settings', { p_company: coA, p_approval_limit_base_minor: '50000',
    p_max_file_bytes: null, p_retention_years: 10, p_reason: 'حد اعتماد المدير المالي' });
  check('ضبط الحدّ فعل المالكة المدقَّق', !setL.error);
  const doc2 = await madeDoc(EMP.id);
  const e2 = await draft(EMP, `app2-${TAG}`, { vendor: vApp, lines: KWD_LINE('40000', 'OFFICE'), date: '2026-09-05' });
  await EMP.client.rpc('acc_link_document', { p_document: doc2, p_target_kind: 'EXPENSE', p_target: e2.expense_id, p_link_role: 'SOURCE' });
  await EMP.client.rpc('acc_submit_expense', { p_expense: e2.expense_id, p_mark_uncertain: false });
  const fm2 = await FM.client.rpc('acc_approve_expense', { p_expense: e2.expense_id, p_reason: 'ضمن حدّي' });
  check('ACC-T-049: ضمن الحدّ = APPROVED بلا سلطة قيود', !fm2.error && fm2.data[0].outcome === 'APPROVED');
  const { data: snap } = await svc.from('acc_expense_approvals').select('*').eq('expense_id', e2.expense_id).single();
  check('لقطة القرار كاملة (حدّ/عملة أساس/مبلغ مُختبَر)',
    String(snap.limit_base_minor) === '50000' && snap.base_currency === 'KWD' && String(snap.tested_base_amount_minor) === '40000');
  // فوق الحدّ
  const doc3 = await madeDoc(EMP.id);
  const e3 = await draft(EMP, `app3-${TAG}`, { vendor: vApp, lines: KWD_LINE('90000', 'OFFICE'), date: '2026-09-06' });
  await EMP.client.rpc('acc_link_document', { p_document: doc3, p_target_kind: 'EXPENSE', p_target: e3.expense_id, p_link_role: 'SOURCE' });
  await EMP.client.rpc('acc_submit_expense', { p_expense: e3.expense_id, p_mark_uncertain: false });
  const fm3 = await FM.client.rpc('acc_approve_expense', { p_expense: e3.expense_id, p_reason: 'فوق حدّي' });
  check('ACC-T-050: فوق الحدّ = تصعيد للمالكة', fm3.data[0].outcome === 'OWNER_APPROVAL_REQUIRED');
  // FM لا يعتمد إرساله
  const fmDoc = await madeDoc(OWN.id);
  const eFm = await draft(FM, `fmself-${TAG}`, { vendor: vApp, lines: KWD_LINE('22222'), date: '2026-09-07' });
  await FM.client.rpc('acc_link_document', { p_document: fmDoc, p_target_kind: 'EXPENSE', p_target: eFm.expense_id, p_link_role: 'SOURCE' });
  await FM.client.rpc('acc_submit_expense', { p_expense: eFm.expense_id, p_mark_uncertain: false });
  const fmSelf = await FM.client.rpc('acc_approve_expense', { p_expense: eFm.expense_id, p_reason: 'x' });
  check('FM لا يعتمد إرساله', !!fmSelf.error && /own submission/.test(fmSelf.error.message));
  // المالكة على مصروفها: تصديق ذاتي موثَّق
  const ownDoc = await madeDoc(OWN.id);
  const eOwn = await draft(OWN, `ownself-${TAG}`, { vendor: vApp, lines: KWD_LINE('33333'), date: '2026-09-08' });
  await OWN.client.rpc('acc_link_document', { p_document: ownDoc, p_target_kind: 'EXPENSE', p_target: eOwn.expense_id, p_link_role: 'SOURCE' });
  await OWN.client.rpc('acc_submit_expense', { p_expense: eOwn.expense_id, p_mark_uncertain: false });
  const ownSelf = await OWN.client.rpc('acc_approve_expense', { p_expense: eOwn.expense_id, p_reason: 'مصروفي — تصديق عمل' });
  const { data: selfRow } = await svc.from('acc_expense_approvals').select('self_attested').eq('expense_id', eOwn.expense_id).single();
  check('تصديق المالكة الذاتي يمرّ ويُعلَّم self_attested', ownSelf.data[0].outcome === 'APPROVED' && selfRow.self_attested === true);
  // سجل الموافقات مجمّد
  const tamper = await svc.from('acc_expense_approvals').update({ decision: 'REJECTED' }).eq('expense_id', e2.expense_id);
  check('سجل الموافقات append-only حتى بمفتاح الخدمة', !!tamper.error && /append-only/.test(tamper.error.message));
}

console.log('═══ ٥ · ACC-T-052: الغموض شخصي/تجاري ═══');
{
  const d = await madeDoc(EMP.id);
  const e = await draft(EMP, `amb-${TAG}`, { vendor: vAmb, date: '2026-09-09' });
  await EMP.client.rpc('acc_link_document', { p_document: d, p_target_kind: 'EXPENSE', p_target: e.expense_id, p_link_role: 'SOURCE' });
  const sub = await EMP.client.rpc('acc_submit_expense', { p_expense: e.expense_id, p_mark_uncertain: true });
  check('غير متأكدة → NEEDS_REVIEW بلا أثر', sub.data[0].outcome === 'NEEDS_REVIEW');
  const empRes = await EMP.client.rpc('acc_resolve_expense_review', { p_expense: e.expense_id, p_resolution: 'PROCEED', p_reason: 'x' });
  check('الموظفة لا تحسم المراجعة', !!empRes.error);
  const res = await FM.client.rpc('acc_resolve_expense_review', { p_expense: e.expense_id, p_resolution: 'PROCEED', p_reason: 'عمل مؤكد — فاتورة مقر' });
  check('حسم بشري مسبَّب → SUBMITTED', !res.error);
  const { data: aud } = await svc.from('acc_audit_events').select('id').eq('action', 'EXPENSE_REVIEW_RESOLVED').eq('subject_id', e.expense_id);
  check('الحسم مدقَّق', (aud ?? []).length === 1);
}

console.log('═══ ٦ · ACC-T-055: تكرار فاتورة المورد ═══');
{
  const d1 = await madeDoc(OWN.id);
  const e1 = await draft(OWN, `dupA-${TAG}`, { vref: `INV-${TAG}-77`, date: '2026-09-10', allowShared: true });
  await OWN.client.rpc('acc_link_document', { p_document: d1, p_target_kind: 'EXPENSE', p_target: e1.expense_id, p_link_role: 'SOURCE' });
  await OWN.client.rpc('acc_submit_expense', { p_expense: e1.expense_id, p_mark_uncertain: false });
  // نفس المورد + نفس المرجع = مرشح تكرار عالي الثقة → مراجعة
  const d2 = await madeDoc(OWN.id);
  const e2 = await draft(OWN, `dupB-${TAG}`, { vref: ` inv-${TAG}-77 `, date: '2026-09-11', allowShared: true });
  await OWN.client.rpc('acc_link_document', { p_document: d2, p_target_kind: 'EXPENSE', p_target: e2.expense_id, p_link_role: 'SOURCE' });
  const s2 = await OWN.client.rpc('acc_submit_expense', { p_expense: e2.expense_id, p_mark_uncertain: false });
  const { data: r2 } = await svc.from('acc_expenses').select('review_reason').eq('id', e2.expense_id).single();
  check('مرجع مطابق (مطبَّع) → NEEDS_REVIEW لا قيد صلب ولا إسقاط',
    s2.data[0].outcome === 'NEEDS_REVIEW' && r2.review_reason === 'VENDOR_REFERENCE_DUPLICATE');
  // تشابه غامض: مورد+تاريخ+مبلغ بلا مرجع
  const d3 = await madeDoc(OWN.id);
  const e3 = await draft(OWN, `dupC-${TAG}`, { date: '2026-09-10', allowShared: true });  // نفس مورد/تاريخ/إجمالي e1 عمدًا
  await OWN.client.rpc('acc_link_document', { p_document: d3, p_target_kind: 'EXPENSE', p_target: e3.expense_id, p_link_role: 'SOURCE' });
  const s3 = await OWN.client.rpc('acc_submit_expense', { p_expense: e3.expense_id, p_mark_uncertain: false });
  const { data: r3 } = await svc.from('acc_expenses').select('review_reason').eq('id', e3.expense_id).single();
  check('تشابه غامض → SUSPECTED_DUPLICATE للمراجعة', s3.data[0].outcome === 'NEEDS_REVIEW' && r3.review_reason === 'SUSPECTED_DUPLICATE');
  // نفس دليل المصدر في مصروف نشط آخر
  const e4 = await draft(OWN, `dupD-${TAG}`, { lines: KWD_LINE('777', 'OFFICE'), date: '2026-09-12', allowShared: true });
  await OWN.client.rpc('acc_link_document', { p_document: d1, p_target_kind: 'EXPENSE', p_target: e4.expense_id, p_link_role: 'SOURCE' });
  const s4 = await OWN.client.rpc('acc_submit_expense', { p_expense: e4.expense_id, p_mark_uncertain: false });
  const { data: r4 } = await svc.from('acc_expenses').select('review_reason').eq('id', e4.expense_id).single();
  check('نفس الدليل لمصروف ثانٍ → SOURCE_ALREADY_USED', s4.data[0].outcome === 'NEEDS_REVIEW' && r4.review_reason === 'SOURCE_ALREADY_USED');
  const { data: dupSus } = await svc.from('acc_audit_events').select('id').eq('action', 'EXPENSE_DUPLICATE_SUSPECTED').eq('company_id', coA);
  check('الاشتباه مدقَّق', (dupSus ?? []).length >= 3);
}

console.log('═══ ٧ · ACC-T-053: التصنيف الفاشل مغلقًا ثم اكتماله ═══');
console.log('═══ ٨ · الترحيل عبر Stage 3 + POSTED بعد قيد POSTED + DoD 3 ═══');
{
  // مصروف معتمد جاهز للتصنيف
  const doc = await madeDoc(EMP.id);
  const e = await draft(EMP, `post-${TAG}`, { vendor: vPost, lines: KWD_LINE('30000', 'OFFICE'), date: '2026-09-13' });
  const expId = e.expense_id;
  await EMP.client.rpc('acc_link_document', { p_document: doc, p_target_kind: 'EXPENSE', p_target: expId, p_link_role: 'SOURCE' });
  await EMP.client.rpc('acc_submit_expense', { p_expense: expId, p_mark_uncertain: false });
  await FM.client.rpc('acc_approve_expense', { p_expense: expId, p_reason: 'ضمن الحدّ' });
  // سياسة اختبار من النطاق العالي POL-9xx: تُختار وقت التشغيل بعد إثبات
  // خلوّها فعليًا في Staging (قالب عالمي أو شركة) — لا POL-020/021 المحجوزتين
  let TESTPOL = null;
  for (let n = 999; n >= 900; n--) {
    const cand = `POL-${n}`;
    const { count } = await svc.from('acc_policy_register').select('id', { count: 'exact', head: true }).eq('policy_id', cand);
    if (count === 0) { TESTPOL = cand; break; }
  }
  check('سياسة الاختبار مثبتة الخلو قبل الإدراج (نطاق POL-9xx)', TESTPOL !== null);
  console.log(`  TESTPOL = ${TESTPOL}`);
  // غير المحاسبة لا تصنّف
  const fmCls = await FM.client.rpc('acc_classify_expense', { p_expense: expId, p_policy_id: TESTPOL, p_as_of: '2026-09-13' });
  check('التصنيف للمحاسبة حصرًا', !!fmCls.error);
  // قبل إنشاء السياسة: لا سياسة سارية → provisional (لا اعتماد على قالب عالمي)
  const cls0 = await ACC.client.rpc('acc_classify_expense', { p_expense: expId, p_policy_id: TESTPOL, p_as_of: '2026-09-13' });
  check('بلا سياسة سارية = POLICY_NOT_APPROVED (provisional)', !cls0.error && /POLICY_NOT_APPROVED|NO_POLICY/.test(cls0.data[0].outcome));
  // أنشئ سياسة شركة IMMEDIATE_EXPENSE واعتمدها وفعّلها (Stage 2 ceremony)
  const { data: polRow, error: polErr } = await svc.rpc('acc_add_policy_version', {
    p_company: coA, p_policy_id: TESTPOL, p_name: 'مصروف فوري (تجهيزة اختبار)', p_ifrs_ref: 'IAS 1',
    p_treatment: 'IMMEDIATE_EXPENSE', p_alternatives: 'لا', p_approval_required: 'ACCOUNTANT_AND_AUDITOR',
    p_status: 'NEEDS_AUDITOR_APPROVAL',  // مسار NEEDS_ الصريح (ACC-017) لمسار الاعتماد المزدوج
    p_impact_if_changed: 'سياسة اختبار فقط — لا أثر إنتاجي؛ تغييرها يؤثر فقط على بيانات الاختبار',
    p_notes: null, p_actor: ACC.id });
  check('نسخة سياسة الشركة أُنشئت', !polErr && !!polRow, polErr?.message ?? '');
  const pAp1 = await ACC.client.rpc('acc_record_policy_approval', { p_policy_row: polRow, p_approval_role: 'ACCOUNTANT', p_decision: 'APPROVED', p_reason: 'ملائمة' });
  const pAp2 = await AUD.client.rpc('acc_record_policy_approval', { p_policy_row: polRow, p_approval_role: 'AUDITOR', p_decision: 'APPROVED', p_reason: 'ملائمة' });
  const pAct = await ACC.client.rpc('acc_activate_policy', { p_policy_row: polRow, p_effective_from: '2026-01-01' });
  check('اعتمادا المحاسبة والمدقّق ثم التفعيل', !pAp1.error && !pAp2.error && !pAct.error,
    pAp1.error?.message ?? pAp2.error?.message ?? pAct.error?.message ?? '');
  // سياسة معتمدة لكن بلا خرائط حسابات → فشل مغلق
  const cls1 = await ACC.client.rpc('acc_classify_expense', { p_expense: expId, p_policy_id: TESTPOL, p_as_of: '2026-09-13' });
  check('ACC-T-053: بلا ربط معتمد = AUTHORITATIVE_MAPPING_REQUIRED',
    !cls1.error && /^AUTHORITATIVE_MAPPING_REQUIRED:/.test(cls1.data[0].outcome));
  // المحاسبة تعيّن الحسابات (بشرية — لا اختراع)
  const { data: acctExp } = await ACC.client.rpc('acc_create_account', { p_company: coA, p_code: `6100-${TAG}`, p_name: 'مصاريف مكتبية', p_type: 'EXPENSE', p_parent: null, p_postable: true, p_is_contra: false, p_statement_mapping: null });
  const { data: acctPay } = await ACC.client.rpc('acc_create_account', { p_company: coA, p_code: `2100-${TAG}`, p_name: 'ذمم دائنة', p_type: 'LIABILITY', p_parent: null, p_postable: true, p_is_contra: false, p_statement_mapping: null });
  await ACC.client.rpc('acc_link_gl_account', { p_company: coA, p_purpose: 'EXPENSE_ACCOUNT', p_account: acctExp, p_scope: 'OFFICE' });
  await ACC.client.rpc('acc_link_gl_account', { p_company: coA, p_purpose: 'EXPENSE_PAYABLE', p_account: acctPay, p_scope: '' });
  const cls2 = await ACC.client.rpc('acc_classify_expense', { p_expense: expId, p_policy_id: TESTPOL, p_as_of: '2026-09-13' });
  check('بعد التعيين البشري → READY_TO_POST', !cls2.error && cls2.data[0].outcome === 'READY_TO_POST');

  // فترة مفتوحة ثم تجهيز القيد
  const { data: period } = await ACC.client.rpc('acc_create_period', { p_company: coA, p_fiscal_year: `FY26-${TAG}`, p_start: '2026-09-01', p_end: '2026-09-30' });
  await ACC.client.rpc('acc_transition_period', { p_period: period, p_new_state: 'OPEN' });
  const prep = await ACC.client.rpc('acc_prepare_expense_journal', { p_expense: expId, p_period: period });
  check('التحضير ينشئ قيد DRAFT ويعيد هويته', !prep.error && !!prep.data);
  const entry = prep.data;
  const prep2 = await ACC.client.rpc('acc_prepare_expense_journal', { p_expense: expId, p_period: period });
  check('تحضير مكرر idempotent (نفس القيد)', prep2.data === entry);
  const { data: jl } = await svc.from('acc_journal_lines').select('side, amount_minor').eq('entry_id', entry);
  check('مدين الفئة ودائن الالتزام متوازنان', jl.length === 2
    && String(jl.find((x) => x.side === 'DEBIT').amount_minor) === '30000'
    && String(jl.find((x) => x.side === 'CREDIT').amount_minor) === '30000');
  // الدليل صار مربوطًا بالقيد أيضًا (DoD 1)
  const { data: jLink } = await svc.from('acc_document_links').select('id').eq('document_id', doc).eq('target_kind', 'JOURNAL_ENTRY').eq('target_id', entry);
  check('دليل المصدر ربط بالقيد (مستند ↔ قيد)', (jLink ?? []).length === 1);
  // الشهادة قبل الترحيل ترفض — المصروف ليس POSTED بقيد DRAFT
  const early = await ACC.client.rpc('acc_attest_expense_posted', { p_expense: expId });
  check('POSTED فقط بعد قيد POSTED (قيد DRAFT يرفض)', !!early.error && /journal is DRAFT/.test(early.error.message));
  // الترحيل عبر مسار Stage 3 القائم حصرًا
  await ACC.client.rpc('acc_submit_journal', { p_entry: entry });
  const post = await ACC.client.rpc('acc_post_journal', { p_entry: entry });
  check('الترحيل بالمحاسبة عبر acc_post_journal القائم', !post.error);
  const attest = await ACC.client.rpc('acc_attest_expense_posted', { p_expense: expId });
  check('الشهادة بعد الترحيل → المصروف POSTED', !attest.error);
  const attest2 = await ACC.client.rpc('acc_attest_expense_posted', { p_expense: expId });
  check('الانتقال يحدث مرة واحدة', !!attest2.error);
  const { data: posted } = await svc.from('acc_expenses').select('state, journal_entry_id, posted_at').eq('id', expId).single();
  check('ACC-T-054: POSTED بهوية القيد وطابع الترحيل', posted.state === 'POSTED' && posted.journal_entry_id === entry && !!posted.posted_at);
  // مناعة POSTED حتى بمفتاح الخدمة
  const mut = await svc.from('acc_expenses').update({ description: 'عبث' }).eq('id', expId);
  check('حقائق POSTED مجمّدة', !!mut.error && /immutable/.test(mut.error.message));
  const void1 = await OWN.client.rpc('acc_void_expense', { p_expense: expId, p_reason: 'محاولة' });
  check('لا إلغاء بعد الترحيل', !!void1.error && /never voided/.test(void1.error.message));

  // DoD 3: دليل مرتبط بقيد POSTED — لا فكّ ولا حذف ولا التفاف
  const { data: srcLink } = await svc.from('acc_document_links').select('id').eq('document_id', doc).eq('target_kind', 'EXPENSE').eq('target_id', expId).single();
  const un1 = await ACC.client.rpc('acc_unlink_document', { p_link: srcLink.id });
  check('DOC-T-008: فكّ رابط مصروف POSTED محجوب', !!un1.error && /posted expense/.test(un1.error.message));
  const un2 = await ACC.client.rpc('acc_unlink_document', { p_link: jLink[0].id });
  check('DOC-T-005: فكّ رابط قيد POSTED محجوب', !!un2.error && /posted journal/.test(un2.error.message));
  const del = await OWN.client.rpc('acc_delete_document', { p_document: doc });
  check('DOC-T-007: حذف دليل المرحَّل = BLOCKED_POSTED مدقَّق', !del.error && del.data[0].outcome === 'BLOCKED_POSTED');
  const { data: blkAud } = await svc.from('acc_audit_events').select('id').eq('action', 'DOCUMENT_DELETE_BLOCKED_POSTED').eq('subject_id', doc);
  check('حجب الحذف مدقَّق دائم', (blkAud ?? []).length >= 1);
  const rep = await ACC.client.rpc('acc_replace_expense_source', { p_expense: expId, p_old_document: doc, p_new_document: await madeDoc(ACC.id), p_reason: 'x' });
  check('لا استبدال دليل بعد POSTED', !!rep.error && /new evidence beside the old/.test(rep.error.message));

  // التصحيح: عكس عبر محرك Stage 3 + وصلة تصحيح — المصروف يبقى POSTED
  const rev = await ACC.client.rpc('acc_reverse_journal', { p_entry: entry, p_target_period: period, p_reason: 'تصحيح مبلغ' });
  check('العكس عبر محرك Stage 3 يعمل', !rev.error);
  const { data: still } = await svc.from('acc_expenses').select('state').eq('id', expId).single();
  check('العكس لا يعيد المصروف DRAFT — التاريخ محفوظ', still.state === 'POSTED');
  const corr = await ACC.client.rpc('acc_record_expense_correction', { p_expense: expId, p_correction_entry: rev.data, p_reason: 'قيد مصحح' });
  check('وصلة التصحيح مدقَّقة', !corr.error);
}

console.log('═══ ٩ · آلة الحالات: انتقالات محظورة + رفض/إعادة عمل/إلغاء ═══');
{
  const d = await madeDoc(EMP.id);
  const e = await draft(EMP, `sm-${TAG}`, { vendor: vSm, date: '2026-09-14' });
  await EMP.client.rpc('acc_link_document', { p_document: d, p_target_kind: 'EXPENSE', p_target: e.expense_id, p_link_role: 'SOURCE' });
  // تغيير حالة مباشر بلا توقيع (حتى service) يُرفض
  const raw = await svc.from('acc_expenses').update({ state: 'APPROVED' }).eq('id', e.expense_id);
  check('تغيير حالة بلا توقيع مرفوض (حتى بمفتاح الخدمة)', !!raw.error && /signed expense operations/.test(raw.error.message));
  await EMP.client.rpc('acc_submit_expense', { p_expense: e.expense_id, p_mark_uncertain: false });
  const edit = await EMP.client.rpc('acc_update_expense_draft', { p_expense: e.expense_id, p_vendor: vSm, p_expense_date: '2026-09-14', p_vendor_reference: null, p_description: 'تعديل', p_manual_justification: null, p_lines: null });
  check('لا تعديل حقائق بعد الإرسال', !!edit.error);
  const rej = await FM.client.rpc('acc_reject_expense', { p_expense: e.expense_id, p_reason: 'إيصال غير واضح' });
  check('الرفض المسبَّب يعمل', !rej.error);
  const rw = await EMP.client.rpc('acc_rework_expense', { p_expense: e.expense_id });
  check('REJECTED→DRAFT بإعادة عمل صريحة', !rw.error);
  const vd = await EMP.client.rpc('acc_void_expense', { p_expense: e.expense_id, p_reason: 'لم يعد لازمًا' });
  check('الموظفة تلغي مسودتها بسبب', !vd.error);
  const delGone = await svc.from('acc_expenses').delete().eq('id', e.expense_id);
  check('VOIDED تاريخ — لا حذف', !!delGone.error && /history/.test(delGone.error.message));
}

console.log('═══ ١٠ · العزل: باء لا ترى ولا تعتمد ═══');
{
  const e = await draft(OWN, `iso-${TAG}`, { vendor: vIso, date: '2026-09-15' });
  const { data: bSees } = await OWN_B.client.from('acc_expenses').select('id').eq('company_id', coA);
  check('باء صفر رؤية لمصروفات ألف', (bSees ?? []).length === 0);
  const bApr = await OWN_B.client.rpc('acc_approve_expense', { p_expense: e.expense_id, p_reason: 'x' });
  check('باء لا تعتمد في ألف (fail-closed)', !!bApr.error);
  const { data: empOthers } = await EMP.client.from('acc_expenses').select('id').eq('id', e.expense_id);
  check('الموظفة لا ترى مصروفات غيرها', (empOthers ?? []).length === 0);
}

console.log(`\n  المصروفات DB: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
