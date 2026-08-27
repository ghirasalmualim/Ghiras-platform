#!/usr/bin/env node
/**
 * Stage 8 — المستندات على القاعدة — **PENDING STAGING**. rerunnable
 * بمعرفات فريدة. يثبت: idempotency الالتقاط، سلطة بصمة الخادم،
 * الإقفال الذرّي متعدد الصفحات، تجميد الروابط من SUBMITTED، حجب حذف
 * المرحَّل (DoD 3)، سدّ فكّ-ثم-احذف، العزل، وخصوصية التخزين.
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
const TAG = 'd' + Date.now().toString(36);

async function mintUser(t) {
  const email = `acc8-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
const OWN = await mintUser('own'), ACC = await mintUser('acc'), EMP = await mintUser('emp'),
      RO = await mintUser('ro'), OWN_B = await mintUser('ownb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة وثائق ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة وثائق باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [EMP, 'EMPLOYEE'], [RO, 'READ_ONLY']])
  await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });

// أدوات: إنشاء مستند كامل (حجز+صفحات+تأكيد+إقفال) — كما يفعل مسار الرفع
const sha = async (s) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s).digest('hex');
};
async function madeDoc({ actor = EMP.id, capture = `cap-${TAG}-${Math.random().toString(36).slice(2)}`,
                         pages = 1, content = 'bytes', company = coA } = {}) {
  const { data: d } = await svc.rpc('acc_create_document', {
    p_company: company, p_actor: actor, p_capture_id: capture, p_doc_type: 'RECEIPT',
    p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: pages });
  const id = d[0].document_id;
  for (let n = 1; n <= pages; n++) {
    await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: n, p_mime: 'image/jpeg' });
    await svc.rpc('acc_confirm_document_page', {
      p_document: id, p_page_no: n, p_byte_size: 10, p_server_sha256: await sha(content + n) });
  }
  await svc.rpc('acc_finalize_document', { p_document: id });
  return id;
}

console.log('\n═══ ١ · DOC-T-002: نفس capture_id = مستند واحد (CREATED/IDEMPOTENT/CONFLICT) ═══');
{
  const cap = `cap-${TAG}-idem`;
  const a = await svc.rpc('acc_create_document', { p_company: coA, p_actor: EMP.id, p_capture_id: cap,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: 2 });
  const b = await svc.rpc('acc_create_document', { p_company: coA, p_actor: EMP.id, p_capture_id: cap,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: 2 });
  check('CREATED ثم IDEMPOTENT_DUPLICATE بنفس الهوية',
    a.data[0].outcome === 'CREATED' && b.data[0].outcome === 'IDEMPOTENT_DUPLICATE'
    && a.data[0].document_id === b.data[0].document_id);
  const c = await svc.rpc('acc_create_document', { p_company: coA, p_actor: EMP.id, p_capture_id: cap,
    p_doc_type: 'VENDOR_BILL', p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: 5 });
  check('حقائق مختلفة بنفس الالتقاط = CONFLICT بلا استبدال', c.data[0].outcome === 'CONFLICT');
  const { count } = await svc.from('acc_documents').select('id', { count: 'exact', head: true }).eq('capture_id', cap);
  check('صف مستند واحد فقط', count === 1);
  // دور بلا حق التقاط (READ_ONLY) يُرفض
  const ro = await svc.rpc('acc_create_document', { p_company: coA, p_actor: RO.id, p_capture_id: `cap-${TAG}-ro`,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'x', p_mime: 'image/jpeg', p_expected_pages: 1 });
  check('READ_ONLY لا تلتقط', !!ro.error);
}

console.log('═══ ٢ · CORRECTION 2/3: بصمة الخادم والاسترداد ═══');
{
  const cap = `cap-${TAG}-hash`;
  const { data: d } = await svc.rpc('acc_create_document', { p_company: coA, p_actor: EMP.id, p_capture_id: cap,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'r.jpg', p_mime: 'image/jpeg', p_expected_pages: 2 });
  const id = d[0].document_id;
  const r1 = await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'image/jpeg' });
  const r1b = await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'image/jpeg' });
  check('حجز الصفحة idempotent بنفس مفتاح الكائن',
    r1.data[0].object_key === r1b.data[0].object_key && r1b.data[0].outcome === 'IDEMPOTENT_DUPLICATE');
  check('مفتاح الكائن حتمي {company}/{document}/{page}',
    r1.data[0].object_key === `${coA}/${id}/1`);
  const h1 = await sha('page-one');
  const c1 = await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 8, p_server_sha256: h1 });
  const c1b = await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 8, p_server_sha256: h1 });
  check('تأكيد مكرر ببصمة مطابقة = استئناف idempotent',
    c1.data[0].outcome === 'VERIFIED' && c1b.data[0].outcome === 'IDEMPOTENT_DUPLICATE');
  const cX = await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: 9, p_server_sha256: await sha('tampered') });
  check('بايتات مختلفة لصفحة مؤكدة = CONFLICT بلا استبدال', cX.data[0].outcome === 'CONFLICT');
  const { data: pg } = await svc.from('acc_document_pages').select('content_sha256').eq('document_id', id).eq('page_no', 1).single();
  check('بصمة الأصل محفوظة', pg.content_sha256 === h1);
  // الإقفال قبل اكتمال الصفحات يفشل (رفع نجح/إقفال ناقص = قابل للاسترداد)
  const finEarly = await svc.rpc('acc_finalize_document', { p_document: id });
  check('لا إقفال قبل اكتمال كل الصفحات', !!finEarly.error && /verified/.test(finEarly.error.message));
  await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 2, p_mime: 'image/jpeg' });
  await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 2, p_byte_size: 8, p_server_sha256: await sha('page-two') });
  const fin = await svc.rpc('acc_finalize_document', { p_document: id });
  const fin2 = await svc.rpc('acc_finalize_document', { p_document: id });
  check('إقفال ناجح ثم idempotent', fin.data[0].outcome === 'FINALIZED' && fin2.data[0].outcome === 'IDEMPOTENT_DUPLICATE');
  const { data: doc } = await svc.from('acc_documents').select('content_sha256, page_count, state').eq('id', id).single();
  const expected = await sha(`1:${h1}|2:${await sha('page-two')}`);
  check('DOC-T-003: manifest الخادم من بصمات الصفحات المرتبة', doc.content_sha256 === expected && doc.page_count === 2);
  // مناعة الدليل بعد الإقفال حتى بمفتاح الخدمة
  const tamper = await svc.from('acc_documents').update({ content_sha256: await sha('x') }).eq('id', id);
  check('DOC-T-012: دليل FINALIZED لا يُعاد كتابته', !!tamper.error && /immutable/.test(tamper.error.message));
}

console.log('═══ ٣ · التكرار بالمحتوى: علم مراجعة لا إسقاط ═══');
{
  const d1 = await madeDoc({ content: 'same-bytes' });
  const d2 = await madeDoc({ content: 'same-bytes' });
  const { data: row } = await svc.from('acc_documents').select('duplicate_of_document_id').eq('id', d2).single();
  check('نفس البصمة = duplicate_of معلَّم والاثنان محفوظان', row.duplicate_of_document_id === d1);
  const { data: aud } = await svc.from('acc_audit_events').select('id').eq('action', 'DOCUMENT_DUPLICATE_SUSPECTED').eq('subject_id', d2);
  check('الاشتباه مدقَّق', (aud ?? []).length === 1);
}

console.log('═══ ٤ · DOC-T-004/009: الروابط وسلامتها ═══');
{
  const doc = await madeDoc({});
  // ربط بمصروف مسودة (الموظفة صاحبة الاثنين)
  const { data: exp } = await EMP.client.rpc('acc_create_expense_draft', {
    p_company: coA, p_submission_key: `sub-${TAG}-l1`, p_vendor: null, p_expense_date: '2026-09-01',
    p_vendor_reference: null, p_description: 'اختبار ربط', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '5000', currency: 'KWD', base_amount_minor: '5000', tax_status: 'NO_TAX_REGIME', category_key: 'OFFICE' }] });
  const link = await EMP.client.rpc('acc_link_document', { p_document: doc, p_target_kind: 'EXPENSE', p_target: exp[0].expense_id, p_link_role: 'SOURCE' });
  check('الموظفة تربط دليلها بمسودتها', !link.error);
  // اتجاهان: من المستند ومن المصروف
  const { data: byDoc } = await svc.from('acc_document_links').select('target_id').eq('document_id', doc);
  const { data: byExp } = await svc.from('acc_document_links').select('document_id').eq('target_kind', 'EXPENSE').eq('target_id', exp[0].expense_id);
  check('DOC-T-004: تنقّل باتجاهين سليم', byDoc[0].target_id === exp[0].expense_id && byExp[0].document_id === doc);
  // هدف وهمي أو عابر للشركات
  const ghost = await svc.from('acc_document_links').insert({ company_id: coA, document_id: doc, target_kind: 'EXPENSE', target_id: OWN.id });
  check('هدف غير موجود مرفوض', !!ghost.error);
  const docB = await madeDoc({ actor: OWN_B.id, company: coB });
  const cross = await svc.from('acc_document_links').insert({ company_id: coB, document_id: docB, target_kind: 'EXPENSE', target_id: exp[0].expense_id });
  check('DOC-T-009: رابط عابر للشركات محجوب بنيويًا', !!cross.error && /cross-company/.test(cross.error.message));
  // غير المُقفَل لا يُربط
  const { data: raw } = await svc.rpc('acc_create_document', { p_company: coA, p_actor: EMP.id, p_capture_id: `cap-${TAG}-raw`,
    p_doc_type: 'RECEIPT', p_source: 'CAMERA', p_original_filename: 'x', p_mime: 'image/jpeg', p_expected_pages: 1 });
  const linkRaw = await ACC.client.rpc('acc_link_document', { p_document: raw[0].document_id, p_target_kind: 'EXPENSE', p_target: exp[0].expense_id });
  check('غير FINALIZED لا يُربط دليلًا', !!linkRaw.error && /FINALIZED/.test(linkRaw.error.message));
}

console.log('═══ ٥ · CORRECTION 1: تجميد الروابط من SUBMITTED + الاستبدال الموقّع ═══');
{
  const doc = await madeDoc({ actor: OWN.id });
  const { data: exp } = await OWN.client.rpc('acc_create_expense_draft', {
    p_company: coA, p_submission_key: `sub-${TAG}-frz`, p_vendor: null, p_expense_date: '2026-09-02',
    p_vendor_reference: null, p_description: 'تجميد', p_source_kind: 'RECEIPT', p_manual_justification: null,
    p_lines: [{ amount_minor: '7000', currency: 'KWD', base_amount_minor: '7000', tax_status: 'NO_TAX_REGIME', category_key: 'OFFICE' }] });
  const expId = exp[0].expense_id;
  const { data: vend } = await OWN.client.rpc('acc_create_vendor', { p_company: coA, p_name: `مورد تجميد ${TAG}`, p_contact: {}, p_currency: 'KWD', p_is_non_resident: false, p_withholding_status: null });
  await OWN.client.rpc('acc_update_expense_draft', { p_expense: expId, p_vendor: vend, p_expense_date: '2026-09-02',
    p_vendor_reference: `FRZ-${TAG}`, p_description: 'تجميد', p_manual_justification: null, p_lines: null });
  await OWN.client.rpc('acc_link_document', { p_document: doc, p_target_kind: 'EXPENSE', p_target: expId, p_link_role: 'SOURCE' });
  const sub = await OWN.client.rpc('acc_submit_expense', { p_expense: expId, p_mark_uncertain: false });
  check('الإرسال بنجاح بدليل FINALIZED', !sub.error && sub.data[0].outcome === 'SUBMITTED');
  const { data: theLink } = await svc.from('acc_document_links').select('id').eq('document_id', doc).eq('target_id', expId).single();
  const un = await OWN.client.rpc('acc_unlink_document', { p_link: theLink.id });
  check('فكّ رابط SUBMITTED محجوب', !!un.error && /freeze at SUBMITTED/.test(un.error.message));
  const del = await OWN.client.rpc('acc_delete_document', { p_document: doc });
  check('حذف مستند مرتبط = BLOCKED_LINKED (لا استثناء صامت)', !del.error && del.data[0].outcome === 'BLOCKED_LINKED');
  // الاستبدال الصريح: الجديد أولًا، القديم يبقى محفوظًا
  const doc2 = await madeDoc({ actor: OWN.id, content: 'replacement' });
  const rep = await OWN.client.rpc('acc_replace_expense_source', { p_expense: expId, p_old_document: doc, p_new_document: doc2, p_reason: 'صورة أوضح' });
  check('الاستبدال الموقّع قبل الترحيل يعمل', !rep.error);
  const { data: oldDoc } = await svc.from('acc_documents').select('id, state').eq('id', doc).single();
  const { data: newDoc } = await svc.from('acc_documents').select('supersedes_document_id').eq('id', doc2).single();
  check('الدليل القديم محفوظ والجديد يشير إليه (DOCUMENT_SUPERSEDED)',
    oldDoc.state === 'FINALIZED' && newDoc.supersedes_document_id === doc);
  const { data: supAud } = await svc.from('acc_audit_events').select('id').eq('action', 'DOCUMENT_SUPERSEDED').eq('subject_id', doc);
  check('الاستبدال مدقَّق', (supAud ?? []).length === 1);
}

console.log('═══ ٦ · العزل وخصوصية الأدوار والتخزين ═══');
{
  const doc = await madeDoc({ actor: EMP.id });
  const { data: empSees } = await EMP.client.from('acc_documents').select('id').eq('id', doc);
  check('الموظفة ترى ما رفعت', (empSees ?? []).length === 1);
  const other = await madeDoc({ actor: OWN.id });
  const { data: empOthers } = await EMP.client.from('acc_documents').select('id').eq('id', other);
  check('الموظفة لا ترى مستندات غيرها', (empOthers ?? []).length === 0);
  const { data: roSees } = await RO.client.from('acc_documents').select('id').eq('company_id', coA);
  check('READ_ONLY صفر مستندات افتراضًا', (roSees ?? []).length === 0);
  const { data: bSees } = await OWN_B.client.from('acc_documents').select('id').eq('company_id', coA);
  check('DOC-T-001/010: عبر الشركات صفر رؤية', (bSees ?? []).length === 0);
  // التخزين: عميل authenticated لا يرفع/يقرأ الدلو الخاص مباشرة
  const upA = await EMP.client.storage.from('acc-documents').upload(`${coA}/hack.jpg`, new Blob(['x']));
  check('لا كتابة عميل مباشرة للتخزين', !!upA.error);
  const dl = await EMP.client.storage.from('acc-documents').download(`${coA}/${doc}/1`);
  check('لا قراءة عميل مباشرة للتخزين', !!dl.error);
  // حذف مستند غير مرتبط بسياسة الأدوار + تدقيق
  const delEmp = await EMP.client.rpc('acc_delete_document', { p_document: doc });
  check('DOC-T-006: الموظفة تحذف غير المرتبط الذي رفعته', !delEmp.error && delEmp.data[0].outcome === 'DELETED');
  const { data: delAud } = await svc.from('acc_audit_events').select('after_state, before_state').eq('action', 'DOCUMENT_DELETED').eq('subject_id', doc);
  check('الحذف مدقَّق والبصمة محفوظة في التدقيق', (delAud ?? []).length === 1 && /^[0-9a-f]{64}$/.test(delAud[0].before_state?.sha256 ?? ''));
}

console.log('═══ ٧ · DOC-T-011: تعديل الوصف مدقَّق ═══');
{
  const doc = await madeDoc({ actor: OWN.id });
  const md = await OWN.client.rpc('acc_update_document_metadata', { p_document: doc, p_doc_type: 'VENDOR_BILL', p_tags: ['مكتب'], p_notes: 'ملاحظة' });
  check('تعديل الوصف يعمل', !md.error);
  const { data: aud } = await svc.from('acc_audit_events').select('before_state, after_state').eq('action', 'DOCUMENT_METADATA_UPDATED').eq('subject_id', doc);
  check('قبل/بعد محفوظان في التدقيق', (aud ?? []).length >= 1 && aud[0].before_state.doc_type === 'RECEIPT' && aud[0].after_state.doc_type === 'VENDOR_BILL');
  const ex = await OWN.client.rpc('acc_set_document_extraction', { p_document: doc, p_fields: { total: '5.000' }, p_confidence: 0.9, p_extraction_source: 'AI' });
  check('مصدر استخلاص AI مرفوض في Stage 8', !!ex.error && /Stage 13/.test(ex.error.message));
  const exOk = await OWN.client.rpc('acc_set_document_extraction', { p_document: doc, p_fields: { total: '5.000' }, p_confidence: 1, p_extraction_source: 'MANUAL' });
  check('MANUAL/FIXTURE مقبولان', !exOk.error);
}

console.log(`\n  المستندات DB: ${passed} نجح · ${failed} فشل`);
console.log('  (حجب POSTED الكامل — DOC-T-005/007/008 — يُثبت في test-expenses-db.mjs بعد ترحيل قيد فعلي)');
if (failed) process.exit(1);
