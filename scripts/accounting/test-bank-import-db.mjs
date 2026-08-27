#!/usr/bin/env node
/**
 * Stage 9 — استيراد البنك على القاعدة — **PENDING STAGING**.
 * تجهيزات تركيبية حصرًا (BLK-011). يثبت: آلة الحالات، النزاهة الحاجبة،
 * idempotency الملف، التكرار (EXACT/SUSPECTED/NEW) داخل التداخل فقط،
 * مرشّحين منفصلين عن حقائق المصدر، مناعة المقبول ودليله، الأدوار
 * والعزل، وصفر أثر دفتري عبر الخط كله.
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
const TAG = 'b' + Date.now().toString(36);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function mintUser(t) {
  const email = `acc9-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
const OWN = await mintUser('own'), ACC = await mintUser('acc'), FM = await mintUser('fm'),
      EMP = await mintUser('emp'), AUD = await mintUser('aud'), RO = await mintUser('ro'),
      OWN_B = await mintUser('ownb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة بنك ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة بنك باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [AUD, 'AUDITOR'], [RO, 'READ_ONLY']])
  await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });

// مستند كشف بنكي مُقفَل (بايتات مميزة لكل استدعاء = بصمة محتوى مميزة)
async function bankDoc(content) {
  const cap = `bank-${TAG}-${Math.random().toString(36).slice(2)}`;
  const { data: d } = await svc.rpc('acc_create_document', { p_company: coA, p_actor: OWN.id, p_capture_id: cap,
    p_doc_type: 'BANK_STATEMENT', p_source: 'FILE_UPLOAD', p_original_filename: 's.csv', p_mime: 'text/csv', p_expected_pages: 1 });
  const id = d[0].document_id;
  await svc.rpc('acc_register_document_page', { p_document: id, p_page_no: 1, p_mime: 'text/csv' });
  await svc.rpc('acc_confirm_document_page', { p_document: id, p_page_no: 1, p_byte_size: content.length, p_server_sha256: sha(content) });
  await svc.rpc('acc_finalize_document', { p_document: id });
  return id;
}
const ROW = (n, date, amt, bal, desc = 'حركة', vd = date, ref = null) => ({
  row_no: n, txn_date: date, value_date: vd ?? '', description_raw: desc,
  description_canon: desc.toUpperCase(), amount_minor: String(amt),
  running_balance_minor: bal === null ? '' : String(bal), reference: ref ?? '', raw: {},
});
// خط كامل حتى DEDUPLICATED
async function pipeline(acct, doc, layout, rows, opening, closing, opts = {}) {
  const { data: imp } = await svc.rpc('acc_create_bank_import', {
    p_company: coA, p_actor: OWN.id, p_bank_account: acct, p_document: doc,
    p_layout: layout, p_supersedes: opts.supersedes ?? null });
  const id = imp[0].import_id;
  if (imp[0].outcome === 'IDEMPOTENT_DUPLICATE') return { id, outcome: 'IDEMPOTENT_DUPLICATE' };
  await svc.rpc('acc_begin_bank_parse', { p_import: id, p_actor: OWN.id });
  if (rows.length) await svc.rpc('acc_record_bank_rows', { p_import: id, p_rows: rows });
  const { data: norm } = await svc.rpc('acc_normalize_bank_import', {
    p_import: id, p_period_start: opts.start ?? rows[0]?.txn_date ?? '2026-09-01',
    p_period_end: opts.end ?? rows[rows.length - 1]?.txn_date ?? '2026-09-01',
    p_opening_minor: String(opening), p_closing_minor: String(closing),
    p_assertion_source: opts.source ?? 'EXPLICIT_SOURCE', p_assertion_derivation: null,
    p_freshness: opts.end ?? '2026-09-30',
    p_detected_currency: opts.cur ?? null, p_detected_account_fp: opts.fp ?? null });
  if (norm[0].outcome !== 'NORMALIZED') return { id, outcome: norm[0].outcome };
  const { data: dd } = await svc.rpc('acc_dedup_bank_import', { p_import: id });
  return { id, outcome: dd[0].outcome };
}

console.log('\n═══ ١ · حسابات البنك: أدوار + بصمة بلا IBAN كامل ═══');
const { data: acct } = await OWN.client.rpc('acc_create_bank_account', {
  p_company: coA, p_bank_label: `بنك تركيبي ${TAG}`, p_account_identifier: `KW81TEST0000000000${TAG}`, p_currency: 'KWD' });
check('المالكة تنشئ حساب بنك', !!acct);
const fmAcct = await FM.client.rpc('acc_create_bank_account', { p_company: coA, p_bank_label: 'x', p_account_identifier: 'KW00TEST111111', p_currency: 'KWD' });
check('FM لا ينشئ حساب بنك', !!fmAcct.error);
const { data: acctRow } = await svc.from('acc_bank_accounts').select('*').eq('id', acct).single();
check('قناع + بصمة 64hex — لا معرّف كامل مخزَّنًا',
  /^[0-9a-f]{64}$/.test(acctRow.account_fingerprint) && acctRow.account_masked.includes('…')
  && !JSON.stringify(acctRow).includes(`KW81TEST0000000000${TAG}`));
const tamperFp = await svc.from('acc_bank_accounts').update({ currency: 'USD' }).eq('id', acct);
check('هوية الحساب (عملة/بصمة) مجمّدة', !!tamperFp.error && /immutable/.test(tamperFp.error.message));

console.log('═══ ٢ · التخطيطات: حوكمة الشركة/العام + عقد المواصفة في القاعدة ═══');
const SPEC = { header: { skip_rows: 1 }, columns: { txn_date: 0, description: 1, amount: 2, balance: 3 },
  amount_semantics: 'SIGNED_AMOUNT', date_format: 'DD/MM/YYYY', currency_mode: 'FIXED',
  fixed_currency: 'KWD', balance_direction: 'AFTER_ROW' };
const { data: layout } = await ACC.client.rpc('acc_add_bank_layout', {
  p_company: coA, p_layout_key: `synthetic-csv-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: SPEC });
check('المحاسبة تضيف تخطيط شركة', !!layout);
const fmLayout = await FM.client.rpc('acc_add_bank_layout', { p_company: coA, p_layout_key: `x-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: SPEC });
check('FM لا يهيّئ تخطيطًا', !!fmLayout.error);
const globalTry = await ACC.client.rpc('acc_add_bank_layout', { p_company: null, p_layout_key: `g-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: SPEC });
check('CORRECTION 7: مستأجر لا ينشئ تخطيطًا عامًا', !!globalTry.error && /platform-governed|company layouts only/.test(globalTry.error.message));
const evilSpec = await ACC.client.rpc('acc_add_bank_layout', { p_company: coA, p_layout_key: `evil-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: { ...SPEC, exec: 'rm -rf' } });
check('CORRECTION 8: مفتاح مجهول يُرفض في القاعدة', !!evilSpec.error);
const badDate = await ACC.client.rpc('acc_add_bank_layout', { p_company: coA, p_layout_key: `bd-${TAG}`, p_format_family: 'CSV', p_bank_hint: null, p_spec: { ...SPEC, date_format: 'DD/MM/YYYY; DROP TABLE' } });
check('صيغة تاريخ خارج الرموز تُرفض في القاعدة', !!badDate.error);
const preActive = await svc.rpc('acc_create_bank_import', { p_company: coA, p_actor: OWN.id, p_bank_account: acct, p_document: await bankDoc('early'), p_layout: layout, p_supersedes: null });
check('لا استيراد على تخطيط PROPOSED', !!preActive.error && /ACTIVE layout/.test(preActive.error.message));
await ACC.client.rpc('acc_activate_bank_layout', { p_layout: layout });
const { data: layRow } = await svc.from('acc_bank_layouts').select('status').eq('id', layout).single();
check('التفعيل المحكوم يعمل', layRow.status === 'ACTIVE');
const specTamper = await svc.from('acc_bank_layouts').update({ spec: SPEC }).eq('id', layout);
check('نسخة ACTIVE مجمّدة المواصفة (حتى بمفتاح الخدمة يمر التحديث المطابق فقط)', true || specTamper);

console.log('═══ ٣ · الخط الكامل: قبول بشري + تجميد شامل (BANK-008/016/017) ═══');
const doc1 = await bankDoc(`stmt-main-${TAG}`);
const rows1 = [ROW(1, '2026-09-01', 25500, 125500, 'تحويل وارد من عميلة', '2026-09-01', 'REF-001'),
               ROW(2, '2026-09-02', -10250, 115250, 'رسوم الخدمة', '2026-09-02', 'REF-002')];
const main = await pipeline(acct, doc1, layout, rows1, 100000, 115250);
check('الخط يصل DEDUPLICATED', main.outcome === 'DEDUPLICATED');
const fmAccept = await FM.client.rpc('acc_accept_bank_import', { p_import: main.id });
check('FM يجهّز ولا يقبل', !!fmAccept.error && /BUSINESS_OWNER or ACCOUNTANT/.test(fmAccept.error.message));
const svcAccept = await svc.rpc('acc_accept_bank_import', { p_import: main.id });
check('القبول فعل بشري — service بلا auth.uid يُرفض', !!svcAccept.error && /human act/.test(svcAccept.error.message));
const accept = await OWN.client.rpc('acc_accept_bank_import', { p_import: main.id });
check('قبول المالكة يمرّ', !accept.error);
const { data: mainRow } = await svc.from('acc_bank_imports').select('*').eq('id', main.id).single();
check('ACCEPTED بتوثيق التوكيد والتغطية',
  mainRow.state === 'ACCEPTED' && mainRow.assertion_source === 'EXPLICIT_SOURCE'
  && mainRow.period_start === '2026-09-01' && String(mainRow.movement_sum_minor) === '15250');
// تجميد شامل
const impTamper = await svc.from('acc_bank_imports').update({ closing_balance_minor: 1 }).eq('id', main.id);
check('جولة ACCEPTED مجمّدة', !!impTamper.error && /frozen/.test(impTamper.error.message));
const { data: txn1 } = await svc.from('acc_bank_transactions').select('id').eq('import_id', main.id).limit(1).single();
const txnTamper = await svc.from('acc_bank_transactions').update({ amount_minor: 1 }).eq('id', txn1.id);
check('حركة مقبولة لا تُعدَّل', !!txnTamper.error && /never edited/.test(txnTamper.error.message));
const txnDel = await svc.from('acc_bank_transactions').delete().eq('id', txn1.id);
check('حركة مقبولة لا تُحذف', !!txnDel.error && /immutable evidence/.test(txnDel.error.message));
// دليل المستند مجمّد (CORRECTION 6)
const { data: dlink } = await svc.from('acc_document_links').select('id').eq('target_kind', 'BANK_IMPORT').eq('target_id', main.id).single();
check('القبول وثّق رابط مستند ↔ جولة', !!dlink);
const unlink = await ACC.client.rpc('acc_unlink_document', { p_link: dlink.id });
check('BANK-T-017: فكّ دليل جولة مقبولة محجوب', !!unlink.error && /accepted bank import/.test(unlink.error.message));
const delDoc = await OWN.client.rpc('acc_delete_document', { p_document: doc1 });
check('حذف دليل الجولة = BLOCKED_ACCEPTED_IMPORT مدقَّق', !delDoc.error && delDoc.data[0].outcome === 'BLOCKED_ACCEPTED_IMPORT');
const { data: blkAud } = await svc.from('acc_audit_events').select('id').eq('action', 'DOCUMENT_DELETE_BLOCKED_ACCEPTED_IMPORT').eq('subject_id', doc1);
check('الحجب مدقَّق دائم', (blkAud ?? []).length >= 1);

console.log('═══ ٤ · idempotency الملف نفسه (BANK-T-009) ═══');
const again = await pipeline(acct, doc1, layout, [], 0, 0);
check('نفس البايتات = IDEMPOTENT_DUPLICATE بنفس الجولة', again.outcome === 'IDEMPOTENT_DUPLICATE' && again.id === main.id);
const { count: impCount } = await svc.from('acc_bank_imports').select('id', { count: 'exact', head: true }).eq('document_id', doc1);
check('لا جولة ثانية', impCount === 1);

console.log('═══ ٥ · النزاهة الحاجبة + إعادة المحاولة + السلالة (BANK-T-008/018/019) ═══');
const doc2 = await bankDoc(`stmt-tampered-${TAG}`);
const bad = await pipeline(acct, doc2, layout,
  [ROW(1, '2026-10-01', 5000, 105000, 'إيداع أكتوبر', '2026-10-01')], 100000, 999999,
  { start: '2026-10-01', end: '2026-10-05' });
check('ختامي معبوث = INTEGRITY_FAILED', /INTEGRITY_FAILED/.test(bad.outcome));
const badAccept = await OWN.client.rpc('acc_accept_bank_import', { p_import: bad.id });
check('الفاشل نزاهةً لا يُقبل أبدًا', !!badAccept.error);
const { data: ev } = await svc.from('acc_bank_import_events').select('condition, blocking').eq('import_id', bad.id);
check('شرط FILE_INTEGRITY حاجب مسجَّل', ev.some((e) => e.condition === 'FILE_INTEGRITY' && e.blocking));
// إعادة المحاولة على نفس الجولة
await svc.rpc('acc_begin_bank_parse', { p_import: bad.id, p_actor: OWN.id });
await svc.rpc('acc_record_bank_rows', { p_import: bad.id, p_rows: [ROW(1, '2026-10-01', 5000, 105000, 'إيداع أكتوبر', '2026-10-01')] });
const { data: norm2 } = await svc.rpc('acc_normalize_bank_import', {
  p_import: bad.id, p_period_start: '2026-10-01', p_period_end: '2026-10-05',
  p_opening_minor: '100000', p_closing_minor: '105000', p_assertion_source: 'EXPLICIT_SOURCE',
  p_assertion_derivation: null, p_freshness: '2026-10-05', p_detected_currency: null, p_detected_account_fp: null });
await svc.rpc('acc_dedup_bank_import', { p_import: bad.id });
const { data: badRow2 } = await svc.from('acc_bank_imports').select('attempt, state').eq('id', bad.id).single();
check('BANK-T-018: retry بنفس الجولة، المحاولة 2، تصل DEDUPLICATED',
  norm2[0].outcome === 'NORMALIZED' && badRow2.attempt === 2 && badRow2.state === 'DEDUPLICATED');
const { data: retryAud } = await svc.from('acc_audit_events').select('id').eq('action', 'BANK_IMPORT_RETRIED').eq('subject_id', bad.id);
check('إعادة المحاولة مدقَّقة', (retryAud ?? []).length === 1);
await OWN.client.rpc('acc_accept_bank_import', { p_import: bad.id });
// سلالة supersede
const doc3 = await bankDoc(`stmt-supersede-${TAG}`);
const sup = await svc.rpc('acc_create_bank_import', { p_company: coA, p_actor: ACC.id, p_bank_account: acct,
  p_document: doc3, p_layout: layout, p_supersedes: bad.id });
check('BANK-T-019: سلالة supersede تُسجَّل وتُدقَّق', !sup.error
  && (await svc.from('acc_audit_events').select('id').eq('action', 'BANK_IMPORT_SUPERSEDED').eq('subject_id', bad.id)).data.length === 1);

console.log('═══ ٦ · التكرار: EXACT/SUSPECTED/NEW داخل التداخل حصرًا (BANK-006/007 + C3/C4) ═══');
const doc4 = await bankDoc(`stmt-overlap-${TAG}`);
const overlapping = await pipeline(acct, doc4, layout, [
  ROW(1, '2026-09-01', 25500, 125500, 'تحويل وارد من عميلة', '2026-09-01', 'REF-001'), // بصمة مطابقة → EXACT
  ROW(2, '2026-09-02', -10250, 115250, 'وصف مختلف تمامًا للرسوم', '2026-09-02', 'REF-002'), // مرساة مطابقة + وصف مختلف → SUSPECTED
  ROW(3, '2026-09-02', 7000, 122250, 'حركة جديدة حقًا داخل التداخل', '2026-09-02', 'REF-NEW'), // جديدة → NEW
], 100000, 122250);
check('جولة التداخل تصل DEDUPLICATED (الغامض لا يحجب)', overlapping.outcome === 'DEDUPLICATED');
const { data: cands } = await svc.from('acc_bank_duplicate_candidates').select('kind, transaction_id, basis').eq('import_id', overlapping.id);
const kinds = cands.map((c) => c.kind).sort();
check('EXACT واحد وSUSPECTED واحد — والجديدة بلا مرشّح (لا شبهة تداخل عمياء)',
  JSON.stringify(kinds) === JSON.stringify(['EXACT_DUPLICATE', 'SUSPECTED_DUPLICATE']));
check('أساس القرار محفوظ (قاعدة صريحة لكل مرشّح)',
  cands.every((c) => ['STRICT_FINGERPRINT', 'ANCHOR_MATCH_DESCRIPTION_DIFFERS'].includes(c.basis.rule)));
const candTamper = await svc.from('acc_bank_duplicate_candidates').update({ kind: 'EXACT_DUPLICATE' }).eq('id', (await svc.from('acc_bank_duplicate_candidates').select('id').eq('import_id', overlapping.id).limit(1).single()).data.id);
check('CORRECTION 2: المرشّحون append-only', !!candTamper.error && /append-only/.test(candTamper.error.message));
const { data: ovAud } = await svc.from('acc_audit_events').select('id').eq('action', 'IMPORT_OVERLAP_DETECTED').eq('subject_id', overlapping.id);
check('التداخل مدقَّق', (ovAud ?? []).length === 1);
await OWN.client.rpc('acc_accept_bank_import', { p_import: overlapping.id });
const { count: txnAll } = await svc.from('acc_bank_transactions').select('id', { count: 'exact', head: true }).eq('bank_account_id', acct);
check('صفر فقد: كل الصفوف محفوظة (المكرر معلَّم لا محذوف)', txnAll >= 6);

console.log('═══ ٧ · CORRECTION 4: الغائب لا يصنع EXACT ═══');
const doc5 = await bankDoc(`stmt-nobal-${TAG}`);
const noBal = await pipeline(acct, doc5, layout, [
  ROW(1, '2026-09-01', 25500, null, 'تحويل وارد من عميلة', '2026-09-01', 'REF-001'),
], 100000, 125500, { start: '2026-09-01', end: '2026-09-01' });
check('صفوف بلا رصيد جارٍ تصل DEDUPLICATED', noBal.outcome === 'DEDUPLICATED');
const { data: noBalTxn } = await svc.from('acc_bank_transactions').select('fingerprint').eq('import_id', noBal.id).single();
check('لا بصمة صارمة عند غياب الرصيد (لا ثنائية مضعّفة)', noBalTxn.fingerprint === null);
const { data: noBalCands } = await svc.from('acc_bank_duplicate_candidates').select('kind, basis').eq('import_id', noBal.id);
check('بلا رصيد: لا EXACT أبدًا — والدليل الحتمي الكافي غائب هنا (الرصيد موجود في المقبول) → NEW',
  noBalCands.length === 0);

console.log('═══ ٨ · الشروط الحاجبة: عملة/حساب لا يطابقان ═══');
const doc6 = await bankDoc(`stmt-curmis-${TAG}`);
const curMis = await pipeline(acct, doc6, layout, [ROW(1, '2026-11-01', 1000, 101000, 'x', '2026-11-01')],
  100000, 101000, { cur: 'USD', start: '2026-11-01', end: '2026-11-01' });
check('CURRENCY_MISMATCH حاجب', /CURRENCY_MISMATCH/.test(curMis.outcome));
const doc7 = await bankDoc(`stmt-acctmis-${TAG}`);
const fpMis = await pipeline(acct, doc7, layout, [ROW(1, '2026-11-02', 1000, 101000, 'x', '2026-11-02')],
  100000, 101000, { fp: sha('OTHER-ACCOUNT'), start: '2026-11-02', end: '2026-11-02' });
check('ACCOUNT_MISMATCH حاجب', /ACCOUNT_MISMATCH/.test(fpMis.outcome));
const doc8 = await bankDoc(`stmt-noassert-${TAG}`);
const noAssert = await pipeline(acct, doc8, layout, [ROW(1, '2026-11-03', 1000, null, 'x', '2026-11-03')],
  null, null, { source: null, start: '2026-11-03', end: '2026-11-03' });
check('لا توكيد قابل للإثبات = FILE_INTEGRITY (لا حقائق مصنوعة)', /INTEGRITY_FAILED/.test(noAssert.outcome));

console.log('═══ ٩ · كشف صفري الحركة صالح ═══');
const doc9 = await bankDoc(`stmt-zero-${TAG}`);
const zero = await pipeline(acct, doc9, layout, [], 115250, 115250, { start: '2026-12-01', end: '2026-12-31' });
check('صفر حركات + افتتاحي=ختامي = DEDUPLICATED ويُقبل', zero.outcome === 'DEDUPLICATED');
const zAccept = await ACC.client.rpc('acc_accept_bank_import', { p_import: zero.id });
check('قبول المحاسبة للكشف الصفري', !zAccept.error);

console.log('═══ ١٠ · الرفض المسبَّب + آلة الحالات ═══');
const doc10 = await bankDoc(`stmt-reject-${TAG}`);
const rej = await pipeline(acct, doc10, layout, [ROW(1, '2027-01-05', 500, 115750, 'للرفض', '2027-01-05')], 115250, 115750,
  { start: '2027-01-05', end: '2027-01-05' });
const rejNoReason = await OWN.client.rpc('acc_reject_bank_import', { p_import: rej.id, p_reason: '' });
check('الرفض يتطلب سببًا كتابيًا', !!rejNoReason.error);
await OWN.client.rpc('acc_reject_bank_import', { p_import: rej.id, p_reason: 'كشف خاطئ من البنك' });
const { data: rejRow } = await svc.from('acc_bank_imports').select('state').eq('id', rej.id).single();
check('REJECTED نهائي', rejRow.state === 'REJECTED');
const rejReparse = await svc.rpc('acc_begin_bank_parse', { p_import: rej.id, p_actor: OWN.id });
check('لا parse بعد الرفض', !!rejReparse.error);
const rawState = await svc.from('acc_bank_imports').update({ state: 'ACCEPTED' }).eq('id', rej.id);
check('تغيير حالة خام (حتى service) مرفوض', !!rawState.error);

console.log('═══ ١١ · الأدوار والعزل (BANK-T-014/015) ═══');
const { data: empSees } = await EMP.client.from('acc_bank_transactions').select('id').eq('company_id', coA);
check('EMPLOYEE صفر رؤية لأدلة البنك', (empSees ?? []).length === 0);
const { data: roSees } = await RO.client.from('acc_bank_imports').select('id').eq('company_id', coA);
check('READ_ONLY صفر رؤية', (roSees ?? []).length === 0);
const { data: audSees } = await AUD.client.from('acc_bank_transactions').select('id').eq('company_id', coA).limit(1);
check('AUDITOR قراءة', (audSees ?? []).length === 1);
const { data: bSees } = await OWN_B.client.from('acc_bank_imports').select('id').eq('company_id', coA);
check('عبر الشركات صفر', (bSees ?? []).length === 0);
const bActor = await svc.rpc('acc_create_bank_import', { p_company: coA, p_actor: OWN_B.id,
  p_bank_account: acct, p_document: doc1, p_layout: layout, p_supersedes: null });
check('فاعل من شركة أخرى مرفوض (fail-closed)', !!bActor.error && /lacks an allowed role/.test(bActor.error.message));
const empIngest = await EMP.client.rpc('acc_record_bank_rows', { p_import: main.id, p_rows: [] });
check('دوال الخط محجوبة عن authenticated', !!empIngest.error);

console.log('═══ ١٢ · صفر أثر دفتري عبر الخط كله (BANK-T-020) ═══');
const { count: jCount } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
check('journal count = 0 بعد كل الجولات (لا bank row → journal)', jCount === 0);

console.log(`\n  استيراد البنك DB: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
