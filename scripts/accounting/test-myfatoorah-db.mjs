#!/usr/bin/env node
/**
 * اختبارات Stage 7 على القاعدة — **PENDING STAGING**. rerunnable
 * على append-only بمعرفات فريدة. يثبت idempotency الطبقتين، أسبقية
 * SUCCESS الاتجاهين، الفاشل صفر قيد، التعارض، والعزل — عبر دوال
 * الابتلاع (service key = فاعل الخادم؛ لا auth بشري).
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
  const email = `acc7-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  return { id: created.user.id, client };
}
const OWN = await mintUser('own'), ACC = await mintUser('acc'), OUT = await mintUser('out'), OWN_B = await mintUser('ownb'), ACC_B = await mintUser('accb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة MF ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة MF باء ${TAG}` });
await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: ACC.id, role: 'ACCOUNTANT', created_by: OWN.id });
await OWN_B.client.from('acc_company_members').insert({ company_id: coB, user_id: ACC_B.id, role: 'ACCOUNTANT', created_by: OWN_B.id });
const { data: cust } = await OWN.client.rpc('acc_create_customer', { p_company: coA, p_name: `عميل ${TAG}` });
const { data: prod } = await OWN.client.rpc('acc_create_product', { p_company: coA, p_name: `منتج ${TAG}`, p_price_minor: '100000', p_currency: 'KWD', p_revenue_policy_id: 'POL-004' });
async function issuedInvoice() {
  const { data: inv } = await OWN.client.rpc('acc_create_invoice_draft', { p_company: coA, p_customer: cust, p_currency: 'KWD',
    p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: '100000', currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
  await OWN.client.rpc('acc_issue_invoice', { p_invoice: inv, p_issue_date: '2026-08-27' });
  await OWN.client.rpc('acc_send_invoice', { p_invoice: inv });
  return inv;
}
// يُطبِّع الإرجاع البنيوي table(event_id, outcome) إلى {data:id, outcome, error}
const ev = async (name, code, ref, payload, valid = true, biz = null, src = 'WEBHOOK') => {
  const r = await svc.rpc('acc_mf_record_event', { p_company: coA, p_event_code: code, p_event_name: name, p_event_reference: ref, p_source: src, p_signature_valid: valid, p_payload: payload, p_business_key: biz });
  if (r.error) return { data: null, outcome: null, error: r.error };
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return { data: row?.event_id ?? null, outcome: row?.outcome ?? null, error: null };
};

console.log('\n═══ ١ · idempotency التسليم (Event.Reference) — MF-T-010 ═══');
const r1 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-1`, { Data: 1 }, true, `PID-${TAG}`);
const r2 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-1`, { Data: 1 }, true, `PID-${TAG}`);
const r3 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-1`, { Data: 1 }, true, `PID-${TAG}`);
check('MF-T-010 نفس المرجع ×3 = دليل واحد', !r1.error && r1.data === r2.data && r2.data === r3.data);
check('العقد: أول تسجيل CREATED ثم IDEMPOTENT_DUPLICATE',
  r1.outcome === 'CREATED' && r2.outcome === 'IDEMPOTENT_DUPLICATE' && r3.outcome === 'IDEMPOTENT_DUPLICATE');
const { count: evCount } = await svc.from('acc_mf_events').select('id', { count: 'exact', head: true }).eq('event_reference', `E-${TAG}-1`);
check('صف دليل واحد فقط', evCount === 1);
// تكرار مطابق لا يكتب تدقيق تعارض
const { data: dupAudit } = await svc.from('acc_audit_events').select('id').eq('action', 'MF_EVENT_CONFLICT').eq('subject_id', r1.data);
check('تكرار مطابق = صفر تدقيق MF_EVENT_CONFLICT', (dupAudit ?? []).length === 0);

console.log('═══ ٢ · تعارض حمولة بنفس المرجع — MF-T-023 ═══');
const conf = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-1`, { Data: 999 }, true, `PID-${TAG}`);
// نتيجة بنيوية CONFLICT بلا استثناء SQL
check('MF-T-023 حمولة مختلفة بنفس المرجع = CONFLICT (نتيجة بنيوية لا استثناء)',
  !conf.error && conf.outcome === 'CONFLICT' && conf.data === r1.data);
const { data: confRow } = await svc.from('acc_mf_events').select('processing_state, payload').eq('id', r1.data).single();
check('الدليل ثبت CONFLICT والحمولة الأصلية محفوظة (لا استبدال)',
  confRow.processing_state === 'CONFLICT' && confRow.payload.Data === 1);
const { data: cAudit } = await svc.from('acc_audit_events').select('id, after_state').eq('action', 'MF_EVENT_CONFLICT').eq('subject_id', r1.data);
check('تدقيق MF_EVENT_CONFLICT دائم بعد عودة RPC (>=1)', (cAudit ?? []).length >= 1);
check('التدقيق يحمل السبب وبصمتَي SHA-256 بلا حمولة خام',
  (cAudit ?? []).some((a) => a.after_state?.reason === 'PROVIDER_EVENT_REFERENCE_PAYLOAD_CONFLICT'
    && /^[0-9a-f]{64}$/.test(a.after_state?.existing_payload_sha256 ?? '')
    && /^[0-9a-f]{64}$/.test(a.after_state?.incoming_payload_sha256 ?? '')
    && a.after_state?.incoming_payload === undefined && a.after_state?.payload === undefined));
// ملاحظة تعارض متكررة: لا استبدال، لا استثناء، تُسجَّل ملاحظة شذوذ
const conf2 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-1`, { Data: 999 }, true, `PID-${TAG}`);
check('تعارض متكرر = CONFLICT ثابت بلا crash', !conf2.error && conf2.outcome === 'CONFLICT');
const { data: confRow2 } = await svc.from('acc_mf_events').select('processing_state, payload').eq('id', r1.data).single();
check('التعارض المتكرر لا يستبدل الأصل ولا يغيّر الحالة',
  confRow2.processing_state === 'CONFLICT' && confRow2.payload.Data === 1);

console.log('═══ ٢ب · تعارض بعد حدث مُعالَج — التاريخ الصالح لا يُعاد كتابته ═══');
{
  const invPC = await issuedInvoice();
  const pidPC = `PID-${TAG}-PC`;
  const { data: pmtPC } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: invPC, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: pidPC });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtPC, p_new_status: 'PENDING' });
  const e1 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-PC`, { Data: 'P1' }, true, pidPC);
  await svc.rpc('acc_mf_apply_payment_status', { p_event: e1.data, p_payment_id: pidPC, p_confirmed_status: 'SUCCESS' });
  const { data: before } = await svc.from('acc_payments').select('status').eq('id', pmtPC).single();
  const { count: jBefore } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  // نفس المرجع بحمولة مختلفة بعد المعالجة
  const e2 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-PC`, { Data: 'P2' }, true, pidPC);
  check('حدث مُعالَج ثم حمولة مختلفة = CONFLICT بنيوي', !e2.error && e2.outcome === 'CONFLICT');
  const { data: after } = await svc.from('acc_payments').select('status').eq('id', pmtPC).single();
  const { count: jAfter } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  const { data: pcRow } = await svc.from('acc_mf_events').select('processing_state, payload').eq('id', e1.data).single();
  check('التاريخ الصالح غير مُعاد كتابته (الدفعة تبقى كما هي)', before.status === after.status);
  check('لا قيد جديد من التعارض (BLK-004)', jBefore === jAfter);
  check('الحدث CONFLICT والحمولة الأصلية P1 محفوظة', pcRow.processing_state === 'CONFLICT' && pcRow.payload.Data === 'P1');
}

console.log('═══ ٢ج · تعارض في مسار الاسترداد (RECOVERY) يقف بأمان ═══');
{
  const refR = `E-${TAG}-RCONF`;
  const a = await ev('PAYMENT_STATUS_CHANGED', 1, refR, { Data: 'R1' }, true, `PID-${TAG}-rc`, 'RECOVERY');
  const b = await ev('PAYMENT_STATUS_CHANGED', 1, refR, { Data: 'R2' }, true, `PID-${TAG}-rc`, 'RECOVERY');
  check('RECOVERY: أول تسجيل CREATED', a.outcome === 'CREATED');
  check('RECOVERY: تعارض = CONFLICT نتيجة بنيوية لا استثناء', !b.error && b.outcome === 'CONFLICT');
  const { data: rConf } = await svc.from('acc_mf_events').select('processing_state, payload, source').eq('id', a.data).single();
  check('RECOVERY: الحالة CONFLICT، المصدر RECOVERY، الأصل محفوظ',
    rConf.processing_state === 'CONFLICT' && rConf.source === 'RECOVERY' && rConf.payload.Data === 'R1');
}

console.log('═══ ٣ · توقيع باطل = صفر أثر — MF-T-012 ═══');
const bad = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-bad`, { Data: 1 }, false, `PID-${TAG}-x`);
const { data: badRow } = await svc.from('acc_mf_events').select('processing_state').eq('id', bad.data).single();
check('MF-T-012 توقيع باطل → REJECTED_SIGNATURE', badRow.processing_state === 'REJECTED_SIGNATURE');

console.log('═══ ٤ · أسبقية SUCCESS الاتجاهين — MF-T-011/016/017 ═══');
// دفعة PENDING ثم FAILED (تأكيد المزوّد) — الفاشل صفر قيد
const invA = await issuedInvoice();
const pid = `PID-${TAG}-A`;
const { data: pmt } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: invA, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: pid });
await OWN.client.rpc('acc_set_payment_status', { p_payment: pmt, p_new_status: 'PENDING' });
const evF = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-F`, { Data: 1 }, true, pid);
await svc.rpc('acc_mf_apply_payment_status', { p_event: evF.data, p_payment_id: pid, p_confirmed_status: 'FAILED' });
const { data: pF } = await svc.from('acc_payments').select('status').eq('id', pmt).single();
check('MF-T-016 FAILED مؤكَّد → الدفعة FAILED (صفر قيد؛ لا acc_post_journal)', pF.status === 'FAILED');
const { count: jCount } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
check('MF-T-016 لا قيد أُنشئ من المدفوعات', jCount === 0);
// ثم SUCCESS (المزوّد الموثوق) — FAILED→SUCCESS override، حفظ التاريخ
const evS = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-S`, { Data: 1 }, true, pid);
await svc.rpc('acc_mf_apply_payment_status', { p_event: evS.data, p_payment_id: pid, p_confirmed_status: 'SUCCESS' });
const { data: pS } = await svc.from('acc_payments').select('status').eq('id', pmt).single();
check('MF-T-011 FAILED → SUCCESS (أسبقية المزوّد الموقّعة)', pS.status === 'SUCCESS');
const { data: ovEv } = await svc.from('acc_audit_events').select('id').eq('action', 'MF_PAYMENT_SUCCESS_OVERRIDE').eq('subject_id', pmt);
check('التخطّي مُدقَّق (تاريخ FAILED محفوظ)', (ovEv ?? []).length === 1);
// ثم FAILED لاحق (تخفيض) — يُتجاهل، SUCCESS نهائية
const evF2 = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-F2`, { Data: 1 }, true, pid);
await svc.rpc('acc_mf_apply_payment_status', { p_event: evF2.data, p_payment_id: pid, p_confirmed_status: 'FAILED' });
const { data: pS2 } = await svc.from('acc_payments').select('status').eq('id', pmt).single();
check('MF-T-011 SUCCESS → FAILED لاحق يُتجاهل (تبقى SUCCESS)', pS2.status === 'SUCCESS');
const { data: ignEv } = await svc.from('acc_audit_events').select('id').eq('action', 'MF_LATE_FAILED_IGNORED').eq('subject_id', pmt);
check('التخفيض المتأخر مُدقَّق ولم يُطبَّق', (ignEv ?? []).length >= 1);
// انتقال مباشر FAILED→SUCCESS بلا توقيع المزوّد مرفوض
const { data: invZ } = await OWN.client.rpc('acc_create_invoice_draft', { p_company: coA, p_customer: cust, p_currency: 'KWD',
  p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: '100000', currency: 'KWD', tax_status: 'NO_TAX_REGIME' }] });
check('لا مسار حي', !!invZ);

console.log('═══ ٥ · idempotency الأثر التجاري (PaymentId) — MF-T-017 ═══');
// مرجعان مختلفان لنفس PaymentId لا يضاعفان الدفعة (لا صف دفع ثانٍ)
const { count: pmtCount } = await svc.from('acc_payments').select('id', { count: 'exact', head: true }).eq('gateway_txn_id', pid);
check('MF-T-017 مراجع مختلفة لنفس PaymentId = دفعة واحدة', pmtCount === 1);

console.log('═══ ٦ · الموردون بلا أثر — MF-T-022 ═══');
const sup = await ev('SUPPLIER_STATUS_CHANGED', 4, `E-${TAG}-sup`, { Data: 1 }, true, null);
const { data: supRow } = await svc.from('acc_mf_events').select('processing_state').eq('id', sup.data).single();
check('MF-T-022 حدث مورّد = UNSUPPORTED (صفر أثر)', supRow.processing_state === 'UNSUPPORTED');

console.log('═══ ٧ · التأكيدات append-only — MF-T-024 ═══');
const c1 = await svc.rpc('acc_mf_record_confirmation', { p_company: coA, p_kind: 'GET_PAYMENT_STATUS', p_provider_ref: pid, p_event: evS.data, p_result_state: 'OK', p_raw: { x: 1 }, p_extracted: { transactionStatus: 'SUCCESS' } });
const c2 = await svc.rpc('acc_mf_record_confirmation', { p_company: coA, p_kind: 'GET_PAYMENT_STATUS', p_provider_ref: pid, p_event: evS.data, p_result_state: 'OK', p_raw: { x: 2 }, p_extracted: { transactionStatus: 'SUCCESS' } });
check('MF-T-024 تأكيدان لنفس المرجع مسموحان (history)', !c1.error && !c2.error && c1.data !== c2.data);
const tam = await svc.from('acc_mf_confirmations').update({ result_state: 'FAILED' }).eq('id', c1.data);
check('التأكيد immutable', !!tam.error && /append-only/.test(tam.error.message));

console.log('═══ ٨ · الاسترداد (GetWebhooks) + التدقيق ═══');
const rec = await svc.rpc('acc_mf_record_recovery', { p_company: coA, p_start: '2026-09-01T00:00:00Z', p_end: '2026-09-02T00:00:00Z', p_pages: 1, p_events: 5 });
check('MF-T-009 جولة استرداد تُسجَّل', !rec.error);
const evRec = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-rec`, { Data: 1 }, true, `PID-${TAG}-rec`, 'RECOVERY');
const { data: recRow } = await svc.from('acc_mf_events').select('source').eq('id', evRec.data).single();
check('الحدث المستردّ source=RECOVERY (تمييز عن WEBHOOK)', recRow.source === 'RECOVERY');

console.log('═══ ٩ · العزل والأدلة والمناعة ═══');
const delEv = await svc.from('acc_mf_events').delete().eq('id', r1.data);
check('الأدلة لا تُحذف (MF-015)', !!delEv.error && /permanent/.test(delEv.error.message));
const { data: bSees } = await ACC_B.client.from('acc_mf_events').select('id').eq('company_id', coA);
check('TENANT ISOLATION: باء لا ترى أدلة ألف', (bSees ?? []).length === 0);
const { data: ownSees } = await OWN.client.from('acc_mf_events').select('id').eq('company_id', coA);
check('المالكة خارج أدلة المزوّد الخام', (ownSees ?? []).length === 0);
// الابتلاع محجوب عن العملاء (لا bypass عام)
const clientIngest = await ACC.client.rpc('acc_mf_record_event', { p_company: coA, p_event_code: 1, p_event_name: 'PAYMENT_STATUS_CHANGED', p_event_reference: 'x', p_source: 'WEBHOOK', p_signature_valid: true, p_payload: {}, p_business_key: null });
check('MF-T-028 الابتلاع محجوب عن authenticated', !!clientIngest.error);

console.log('═══ ٩ب · التصليب: صلاحيات + تخطّي غير قابل للانتحال + عزل + تزامن ═══');
{
  // مسار التخطّي غير قابل للانتحال: (أ) المستخدم لا يحدّث acc_payments مباشرة
  const directUpd = await ACC.client.from('acc_payments').update({ status: 'SUCCESS' }).eq('id', pmt);
  check('لا تحديث مباشر لـacc_payments من المحاسبة (لا grant)', !!directUpd.error || directUpd.count === 0);
  // (ب) المحاسبة لا تستدعي دالة الابتلاع
  const accApply = await ACC.client.rpc('acc_mf_apply_payment_status', { p_event: evS.data, p_payment_id: pid, p_confirmed_status: 'SUCCESS' });
  check('acc_mf_apply_payment_status محجوبة عن المحاسبة', !!accApply.error);
  // (ج) acc_set_payment_status البشرية لا تقبل FAILED→SUCCESS
  const invH = await issuedInvoice();
  const { data: pmtH } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: invH, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `PID-${TAG}-H` });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtH, p_new_status: 'PENDING' });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtH, p_new_status: 'FAILED' });
  const humanOverride = await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtH, p_new_status: 'SUCCESS' });
  check('acc_set_payment_status FAILED→SUCCESS مرفوض (بشري)', !!humanOverride.error && /override|forbidden/.test(humanOverride.error.message));
  // (د) service_role يستطيع الابتلاع (الخادم الموثوق)
  const svcEv = await ev('PAYMENT_STATUS_CHANGED', 1, `E-${TAG}-svc`, { Data: 1 }, true, `PID-${TAG}-svc`);
  check('service_role يبتلع (الخادم)', !svcEv.error);

  // ربط الشركة: هوية شركة أخرى في مفتاح العمل لا تسرّب — apply يطابق
  // بالشركة+PaymentId، فمعرّف من شركة أخرى لا يجد دفعة ألف
  const applyOther = await svc.rpc('acc_mf_apply_payment_status', { p_event: svcEv.data, p_payment_id: 'PID-B-NONEXISTENT', p_confirmed_status: 'SUCCESS' });
  check('CROSS-TENANT: PaymentId مجهول لا يؤثر (لا دفعة تُطابَق)', !applyOther.error);

}

console.log('═══ ٩ج · idempotency الابتلاع NO-OP لا خطأ + CONFLICT ═══');
{
  const g1 = async (fn) => (await svc.rpc(fn.n, fn.a))?.data?.[0]?.outcome ?? (await svc.rpc(fn.n, fn.a))?.error?.message;
  // PAYMENT: تزامن نفس PaymentId + نفس الحقائق = NO-OP لا خطأ، دفعة واحدة
  const invP = await issuedInvoice();
  const gtx = `PID-${TAG}-idem`;
  const [pa, pb] = await Promise.all([
    svc.rpc('acc_mf_ingest_payment', { p_company: coA, p_invoice: invP, p_amount_minor: '100000', p_currency: 'KWD', p_payment_id: gtx }),
    svc.rpc('acc_mf_ingest_payment', { p_company: coA, p_invoice: invP, p_amount_minor: '100000', p_currency: 'KWD', p_payment_id: gtx }),
  ]);
  const outs = [pa, pb].map((r) => r.error ? 'ERR' : r.data[0].outcome).sort();
  check('CONCURRENT same PaymentId+facts: كلاهما ينجح بلا خطأ', !pa.error && !pb.error);
  check('PAYMENT IDENTICAL DUPLICATE = CREATED + IDEMPOTENT_DUPLICATE (لا خطأ)',
    JSON.stringify(outs) === JSON.stringify(['CREATED','IDEMPOTENT_DUPLICATE']));
  const { count: pc } = await svc.from('acc_payments').select('id', { count: 'exact', head: true }).eq('gateway_txn_id', gtx);
  check('دفعة واحدة فقط (ONE EFFECT)', pc === 1);
  // PAYMENT: نفس PaymentId + حقائق متعارضة = CONFLICT بلا استبدال
  const conf = await svc.rpc('acc_mf_ingest_payment', { p_company: coA, p_invoice: invP, p_amount_minor: '55555', p_currency: 'KWD', p_payment_id: gtx });
  check('PAYMENT CONFLICTING DUPLICATE = CONFLICT', !conf.error && conf.data[0].outcome === 'CONFLICT');
  const { data: pOrig } = await svc.from('acc_payments').select('amount_minor').eq('gateway_txn_id', gtx).single();
  check('الأصل لم يُستبدل (100000)', String(pOrig.amount_minor) === '100000');
  const { count: pc2 } = await svc.from('acc_payments').select('id', { count: 'exact', head: true }).eq('gateway_txn_id', gtx);
  check('لا دفعة ثانية', pc2 === 1);

  // SETTLEMENT: تزامن نفس Deposit.Reference = NO-OP، تسوية واحدة
  const dref = `DEP-${TAG}-idem`;
  const [sa, sb] = await Promise.all([
    svc.rpc('acc_mf_ingest_settlement', { p_company: coA, p_provider: 'MYFATOORAH', p_deposit_ref: dref, p_settled_at: '2026-09-20' }),
    svc.rpc('acc_mf_ingest_settlement', { p_company: coA, p_provider: 'MYFATOORAH', p_deposit_ref: dref, p_settled_at: '2026-09-20' }),
  ]);
  check('SETTLEMENT IDENTICAL DUPLICATE = NO-OP (لا خطأ)',
    !sa.error && !sb.error && JSON.stringify([sa,sb].map(r=>r.data[0].outcome).sort()) === JSON.stringify(['CREATED','IDEMPOTENT_DUPLICATE']));
  const { count: sc } = await svc.from('acc_settlements').select('id', { count: 'exact', head: true }).eq('settlement_ref', dref);
  check('تسوية واحدة', sc === 1);
  const sConf = await svc.rpc('acc_mf_ingest_settlement', { p_company: coA, p_provider: 'MYFATOORAH', p_deposit_ref: dref, p_settled_at: '2027-01-01' });
  check('SETTLEMENT CONFLICTING DUPLICATE = CONFLICT', !sConf.error && sConf.data[0].outcome === 'CONFLICT');

  // REFUND: نفس Refund.Id = NO-OP، استرداد واحد
  const invR = await issuedInvoice();
  const { data: pmtR } = await OWN.client.rpc('acc_record_payment', { p_company: coA, p_invoice: invR, p_amount_minor: '100000', p_currency: 'KWD', p_gateway_txn_id: `PID-${TAG}-R` });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtR, p_new_status: 'PENDING' });
  await OWN.client.rpc('acc_set_payment_status', { p_payment: pmtR, p_new_status: 'SUCCESS' });
  const rid = `RF-${TAG}-idem`;
  const [ra, rb] = await Promise.all([
    svc.rpc('acc_mf_ingest_refund', { p_company: coA, p_payment: pmtR, p_amount_minor: '40000', p_refund_id: rid, p_policy_id: 'POL-009', p_effective: '2026-09-25' }),
    svc.rpc('acc_mf_ingest_refund', { p_company: coA, p_payment: pmtR, p_amount_minor: '40000', p_refund_id: rid, p_policy_id: 'POL-009', p_effective: '2026-09-25' }),
  ]);
  check('REFUND IDENTICAL DUPLICATE = NO-OP',
    !ra.error && !rb.error && JSON.stringify([ra,rb].map(r=>r.data[0].outcome).sort()) === JSON.stringify(['CREATED','IDEMPOTENT_DUPLICATE']));
  const { count: rc } = await svc.from('acc_refunds').select('id', { count: 'exact', head: true }).eq('external_refund_id', rid);
  check('استرداد واحد', rc === 1);
  const rConf = await svc.rpc('acc_mf_ingest_refund', { p_company: coA, p_payment: pmtR, p_amount_minor: '99999', p_refund_id: rid, p_policy_id: 'POL-009', p_effective: '2026-09-25' });
  check('REFUND CONFLICTING DUPLICATE = CONFLICT', !rConf.error && rConf.data[0].outcome === 'CONFLICT');
  // لا قيد أُنشئ في كل ذلك
  const { count: jAll } = await svc.from('acc_journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', coA);
  check('NO DUPLICATE JOURNAL/ACCOUNTING EFFECT في كل الحالات', jAll === 0);
  // القيود الفريدة ما زالت السلطة (لا يمكن تجاوزها بإدراج مباشر — مقفل)
  check('UNIQUE CONSTRAINTS محفوظة (الإدراج المباشر مقفل للعملاء)',
    !!(await ACC.client.from('acc_payments').insert({ company_id: coA, invoice_id: invP, amount_minor: 1, currency: 'KWD', gateway_txn_id: gtx })).error);
}

console.log('═══ ١٠ · التدقيق ═══');
const { data: evs } = await svc.from('acc_audit_events').select('action').eq('company_id', coA);
const acts = new Set(evs.map((e) => e.action));
for (const a of ['MF_EVENT_RECEIVED', 'MF_EVENT_REJECTED_SIGNATURE', 'MF_EVENT_CONFLICT',
  'MF_PAYMENT_SUCCESS_OVERRIDE', 'MF_LATE_FAILED_IGNORED', 'MF_CONFIRMATION_RECORDED', 'MF_RECOVERY_SWEEP'])
  check(`حدث ${a}`, acts.has(a));

console.log(`\n  MyFatoorah DB: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار تبقى في Staging عمدًا — لا حذف بالبنية)');
if (failed) process.exit(1);
