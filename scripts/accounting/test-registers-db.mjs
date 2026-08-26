#!/usr/bin/env node
/**
 * اختبارات Stage 2 على القاعدة — **PENDING STAGING**: لا تعمل قبل أن
 * تطبق صاحبة المنصة هجرة 2026-08-27-accounting-registers على Staging
 * (فوق هجرة الأساس المعتمدة). لا تُشغَّل على الإنتاج أبدًا.
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

async function mintUser(tag) {
  const email = `acc2-test-${tag}-${Date.now()}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + Date.now(), email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}

console.log('\n═══ ١ · البذرة على القاعدة ═══');
{
  // القاعدة append-only وقابلة لإعادة التشغيل: نفحص بذرة v1 حصرًا —
  // النسخ الأعلى التي أنشأتها اختبارات سابقة مشروعة ولا تُعد فشلًا
  const { data: seedPols } = await svc.from('acc_policy_register')
    .select('policy_id, status').is('company_id', null).eq('version', 1);
  const polIds = Array.from({ length: 24 }, (_, i) => `POL-${String(i + 1).padStart(3, '0')}`);
  const polMap = Object.fromEntries((seedPols ?? []).map((r) => [r.policy_id, r.status]));
  const audSet = ['POL-006','POL-009','POL-012','POL-017','POL-020'];
  const propSet = ['POL-022','POL-023','POL-024'];
  check('بذرة v1: POL-001..024 كاملة وبحالات الـBlueprint',
    polIds.every((id) => polMap[id] ===
      (audSet.includes(id) ? 'NEEDS_AUDITOR_APPROVAL' : propSet.includes(id) ? 'PROPOSED' : 'NEEDS_ACCOUNTANT_APPROVAL')));
  // الشرط الحقيقي: صفر قوالب عامة APPROVED — نسخ شركات الاختبار المعتمدة
  // عبر المسار الشرعي مسموحة
  const { count: gAppr } = await svc.from('acc_policy_register')
    .select('id', { count: 'exact', head: true }).is('company_id', null).eq('status', 'APPROVED');
  check('ZERO GLOBAL TEMPLATES APPROVED', gAppr === 0, String(gAppr));
  const { data: seedRules } = await svc.from('acc_regulatory_rules')
    .select('rule_id').eq('version', 1);
  const ruleIds = [...Array.from({ length: 19 }, (_, i) => `REG-KW-${String(i + 1).padStart(3, '0')}`), 'REG-INT-001', 'REG-INT-002'];
  const haveRules = new Set((seedRules ?? []).map((r) => r.rule_id));
  check('بذرة v1: REG-KW-001..019 + REG-INT-001..002 كاملة',
    ruleIds.every((id) => haveRules.has(id)) && haveRules.size === 21);
  const { data: kw6 } = await svc.from('acc_regulatory_rules').select('*').eq('rule_id', 'REG-KW-006').single();
  check('الغموض محفوظ: KW-006 «?» بدقة UNKNOWN وBLOCKED و🔴',
    kw6.effective_from_text === '?' && kw6.effective_from === null &&
    kw6.effective_from_precision === 'UNKNOWN' && kw6.status === 'BLOCKED' && kw6.confidence === '🔴');
  const { data: kw19 } = await svc.from('acc_regulatory_rules').select('*').eq('rule_id', 'REG-KW-019').single();
  check('«2016» بدقة YEAR بلا يوم مخترع (FIX 2)',
    kw19.effective_from_precision === 'YEAR' && kw19.effective_from_year === 2016 && kw19.effective_from === null);
  const { count: tax } = await svc.from('acc_tax_statuses').select('code', { count: 'exact', head: true });
  check('٦ حالات ضريبية', tax === 6);
}

console.log('═══ ٢ · تجميد التاريخ حتى ضد مفتاح الخدمة ═══');
{
  const { data: pol } = await svc.from('acc_policy_register').select('id').eq('policy_id', 'POL-001').is('company_id', null).single();
  const u = await svc.from('acc_policy_register').update({ treatment: 'TAMPERED' }).eq('id', pol.id);
  check('تعديل معالجة تاريخية مرفوض (تريغر)', !!u.error && /immutable/.test(u.error.message));
  const d = await svc.from('acc_policy_register').delete().eq('id', pol.id);
  check('حذف نسخة سياسة مرفوض', !!d.error && /never deleted/.test(d.error.message));
  const appr = await svc.from('acc_policy_register').update({ status: 'APPROVED' }).eq('id', pol.id);
  check('ترقية مباشرة إلى APPROVED مرفوضة (حارس التفعيل أول من يرد)', !!appr.error && /only via acc_activate_policy/.test(appr.error.message));
  const { data: rule } = await svc.from('acc_regulatory_rules').select('id').eq('rule_id', 'REG-KW-008').single();
  const ru = await svc.from('acc_regulatory_rules').update({ status: 'DRAFT' }).eq('id', rule.id);
  check('تعديل نسخة قاعدة تنظيمية مرفوض', !!ru.error && /frozen/.test(ru.error.message));
  const rd = await svc.from('acc_regulatory_rules').delete().eq('id', rule.id);
  check('حذف نسخة قاعدة مرفوض', !!rd.error && /frozen/.test(rd.error.message));
}

console.log('═══ ٣ · دوال النسخ الموقعة بالتدقيق ═══');
{
  const born = await svc.rpc('acc_add_policy_version', {
    p_company: null, p_policy_id: 'POL-023', p_name: 'Functional currency', p_ifrs_ref: 'IAS 21',
    p_treatment: 'KWD', p_alternatives: null, p_approval_required: 'ACCOUNTANT', p_status: 'APPROVED' });
  check('نسخة تولد APPROVED مرفوضة', !!born.error && /never born APPROVED/.test(born.error.message));
  const v2 = await svc.rpc('acc_add_policy_version', {
    p_company: null, p_policy_id: 'POL-023', p_name: 'Functional currency', p_ifrs_ref: 'IAS 21',
    p_treatment: 'KWD', p_alternatives: null, p_approval_required: 'ACCOUNTANT', p_status: 'PROPOSED',
    p_notes: 'staging db-test supersession exercise' });
  check('إضافة نسخة ٢ تنجح من الخادم', !v2.error, v2.error?.message);
  const { data: ev } = await svc.from('acc_audit_events').select('id, action, company_id')
    .eq('action', 'POLICY_VERSION_ADDED').eq('subject_id', 'POL-023 v2');
  check('حدث تدقيق POLICY_VERSION_ADDED (عالمي بلا شركة)', ev?.length === 1 && ev[0].company_id === null);
  const rv = await svc.rpc('acc_add_regulatory_rule_version', {
    p_rule_id: 'REG-KW-016', p_jurisdiction: 'Kuwait', p_regulator: 'CITRA',
    p_requirement: 'DPPR applies exclusively to CITRA licensees following Decision No. 26 of 2024',
    p_effective_from_text: '2024', p_effective_to_text: 'open',
    p_effective_from_precision: 'YEAR', p_effective_from: null, p_effective_from_year: 2024,
    p_effective_to_precision: 'NONE', p_effective_to: null, p_effective_to_year: null,
    p_source: 'Chambers Kuwait 2026 (staging db-test supersession exercise)',
    p_status: 'ACTIVE', p_confidence: '🟡', p_system_impact: 'Likely not applicable to Ghiras — verify' });
  check('إضافة نسخة قاعدة تنجح', !rv.error, rv.error?.message);
  const { data: rev } = await svc.from('acc_audit_events').select('id').eq('action', 'REGULATORY_RULE_VERSION_ADDED');
  check('حدث تدقيق للقاعدة', (rev?.length ?? 0) >= 1);
  const tamper = await svc.from('acc_audit_events').update({ action: 'X' }).eq('id', rev[0].id);
  check('التدقيق باقٍ append-only', !!tamper.error && /append-only/.test(tamper.error.message));
}

console.log('═══ ٤ · العزل والعملاء ═══');
{
  const A = await mintUser('a'), B = await mintUser('b');
  const { data: coA } = await A.client.rpc('acc_create_company', { p_legal_name: 'شركة سجلات ألف' });
  const { data: coB } = await B.client.rpc('acc_create_company', { p_legal_name: 'شركة سجلات باء' });
  const vA = await svc.rpc('acc_add_policy_version', {
    p_company: coA, p_policy_id: 'POL-001', p_name: 'Monthly subscription revenue', p_ifrs_ref: 'IFRS 15',
    p_treatment: 'Recognise over the service month', p_alternatives: null,
    p_approval_required: 'ACCOUNTANT', p_status: 'NEEDS_ACCOUNTANT_APPROVAL', p_actor: A.id });
  check('نسخة شركة A تُنشأ من الخادم', !vA.error, vA.error?.message);
  const { data: seenByB } = await B.client.from('acc_policy_register').select('id').eq('company_id', coA);
  check('COMPANY A POLICY ISOLATED FROM B', (seenByB ?? []).length === 0);
  const { data: seenByA } = await A.client.from('acc_policy_register').select('id, company_id').eq('policy_id', 'POL-001');
  check('A ترى قالبها العام ونسختها', seenByA?.some((r) => r.company_id === coA) && seenByA?.some((r) => r.company_id === null));
  const w1 = await A.client.from('acc_policy_register').insert({ policy_id: 'POL-001', version: 9, name: 'x', treatment: 'x', approval_required: 'ACCOUNTANT', status: 'PROPOSED', company_id: coA });
  check('READ_ONLY/العملاء عمومًا لا يكتبون سياسات مباشرة', !!w1.error);
  const w2 = await A.client.from('acc_regulatory_rules').insert({ rule_id: 'REG-KW-099', version: 1, jurisdiction: 'Kuwait', requirement: 'x', effective_from_text: '—', effective_to_text: '—', source: 'x', status: 'ACTIVE', confidence: '🟢', system_impact: 'x' });
  check('GLOBAL RULE CLIENT MUTATION BLOCKED', !!w2.error);
  const w3 = await A.client.rpc('acc_add_policy_version', { p_company: coA, p_policy_id: 'POL-001', p_name: 'x', p_ifrs_ref: null, p_treatment: 'x', p_alternatives: null, p_approval_required: 'ACCOUNTANT', p_status: 'PROPOSED' });
  check('دوال النسخ محجوبة عن العملاء في هذه المرحلة', !!w3.error);
  const { data: taxRow } = await A.client.from('acc_tax_statuses').select('code, rate_bearing').eq('code', 'NO_TAX_REGIME').single();
  check('مفردات الضريبة مقروءة والعميل يرى NO_TAX_REGIME بلا نسبة', taxRow?.rate_bearing === false);

  console.log('═══ ٥ · محلّلا القاعدة as-of ═══');
  const { data: vat } = await A.client.rpc('acc_resolve_rule', { p_rule_id: 'REG-KW-008', p_as_of: '2026-08-27' });
  check('KUWAIT VAT عبر SQL: KW-008 سارية', vat?.[0]?.in_force === true && vat?.[0]?.may_compute === true);
  const { data: draft } = await A.client.rpc('acc_resolve_rule', { p_rule_id: 'REG-KW-010', p_as_of: '2026-08-27' });
  check('DRAFT لا يحسب عبر SQL', draft?.[0]?.may_compute === false && draft?.[0]?.readiness_only === true);
  const { data: pend } = await A.client.rpc('acc_resolve_rule', { p_rule_id: 'REG-KW-003', p_as_of: '2027-02-01' });
  check('PENDING ليست سارية عبر SQL', pend?.[0]?.in_force === false);
  const { data: impr } = await A.client.rpc('acc_resolve_rule', { p_rule_id: 'REG-KW-019', p_as_of: '2016-06-01' });
  check('داخل السنة الغامضة: لبس صريح لا سريان (FIX 2)',
    impr?.[0]?.date_imprecise === true && impr?.[0]?.in_force === false);
  const { data: post } = await A.client.rpc('acc_resolve_rule', { p_rule_id: 'REG-KW-019', p_as_of: '2017-06-01' });
  check('بعد السنة: سارية بلا لبس', post?.[0]?.in_force === true && post?.[0]?.date_imprecise === false);
  const { data: rp } = await A.client.rpc('acc_resolve_policy', { p_company: coA, p_policy_id: 'POL-001', p_as_of: '2026-08-27', p_mode: 'PRODUCTION' });
  check('الإنتاج يرفض غير المعتمد عبر SQL', rp?.[0]?.refusal === 'NO_APPROVED_POLICY_FOR_PRODUCTION');
  const { data: sb } = await A.client.rpc('acc_resolve_policy', { p_company: coA, p_policy_id: 'POL-001', p_as_of: '2026-08-27', p_mode: 'SANDBOX' });
  check('SANDBOX يعيدها PROVISIONAL بنطاق COMPANY', sb?.[0]?.is_provisional === true && sb?.[0]?.scope === 'COMPANY');
}

console.log('═══ ٦ · الاعتماد المزدوج وسجل الشهادات (FIX 1) ═══');
{
  const OWN = await mintUser('own'), ACC = await mintUser('acc'), AUD = await mintUser('aud2'), OUT = await mintUser('outsider');
  const { data: co } = await OWN.client.rpc('acc_create_company', { p_legal_name: 'شركة الاعتماد المزدوج' });
  for (const [u, role] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR']]) {
    const { error } = await OWN.client.from('acc_company_members')
      .insert({ company_id: co, user_id: u.id, role, created_by: OWN.id });
    if (error) throw error;
  }
  const mk = (pid, appr, status) => svc.rpc('acc_add_policy_version', {
    p_company: co, p_policy_id: pid, p_name: 'test', p_ifrs_ref: 'IFRS 15',
    p_treatment: 'test treatment', p_alternatives: null,
    p_approval_required: appr, p_status: status,
    p_impact_if_changed: 'staging db-test impact note' });
  const { data: single } = await mk('POL-001', 'ACCOUNTANT', 'NEEDS_ACCOUNTANT_APPROVAL');
  const { data: dual } = await mk('POL-006', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL');

  // AI/SYSTEM: مفتاح الخدمة بلا auth.uid → مرفوض
  const sys = await svc.rpc('acc_record_policy_approval', { p_policy_row: single, p_approval_role: 'ACCOUNTANT' });
  check('AI/SYSTEM APPROVAL BLOCKED (لا auth.uid)', !!sys.error && /human acts/.test(sys.error.message));
  // بديل أدمِن المنصة: مستخدم بلا دور في الشركة
  const adm = await OUT.client.rpc('acc_record_policy_approval', { p_policy_row: single, p_approval_role: 'ACCOUNTANT' });
  check('PLATFORM ADMIN SUBSTITUTION BLOCKED (لا دور محاسبي في الشركة)', !!adm.error);
  // المدقق لا يبدّل دور المحاسب
  const sub = await AUD.client.rpc('acc_record_policy_approval', { p_policy_row: single, p_approval_role: 'ACCOUNTANT' });
  check('ACCOUNTANT-ONLY: auditor cannot substitute', !!sub.error && /ACCOUNTANT role/.test(sub.error.message));

  // أحادية: شهادة محاسب ثم تفعيل
  const a1 = await ACC.client.rpc('acc_record_policy_approval', { p_policy_row: single, p_approval_role: 'ACCOUNTANT' });
  check('شهادة المحاسب تُسجل', !a1.error, a1.error?.message);

  // ─── الفحص الختامي ١: فاعل التفعيل — الشهادة موجودة ومع ذلك يُرفض غير المحاسبة ───
  const RO = await mintUser('ro');
  { const { error } = await OWN.client.from('acc_company_members')
      .insert({ company_id: co, user_id: RO.id, role: 'READ_ONLY', created_by: OWN.id });
    if (error) throw error; }
  const actSvc = await svc.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('UNAUTHENTICATED ACTIVATION BLOCKED', !!actSvc.error && /human act/.test(actSvc.error.message));
  const actRo = await RO.client.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('READ_ONLY ACTIVATION BLOCKED', !!actRo.error && /ACCOUNTANT role/.test(actRo.error.message));
  const actOwn = await OWN.client.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('BUSINESS_OWNER WITHOUT ACCOUNTANT ROLE ACTIVATION BLOCKED', !!actOwn.error && /ACCOUNTANT role/.test(actOwn.error.message));
  const actOut = await OUT.client.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('PLATFORM ADMIN WITHOUT ACCOUNTANT ROLE ACTIVATION BLOCKED', !!actOut.error);
  const actAudX = await AUD.client.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('AUDITOR ACTIVATION BLOCKED', !!actAudX.error && /ACCOUNTANT role/.test(actAudX.error.message));

  // ─── الفحص الختامي ٢: القالب العام لا يُفعَّل ولا يُعتمد ───
  const { data: gtpl } = await svc.from('acc_policy_register').select('id')
    .eq('policy_id', 'POL-001').is('company_id', null).order('version').limit(1).single();
  const actG = await ACC.client.rpc('acc_activate_policy', { p_policy_row: gtpl.id, p_effective_from: '2026-09-01' });
  check('GLOBAL TEMPLATE ACTIVATION BLOCKED', !!actG.error && /company-scoped|cannot be activated/.test(actG.error.message));
  const aprG = await ACC.client.rpc('acc_record_policy_approval', { p_policy_row: gtpl.id, p_approval_role: 'ACCOUNTANT' });
  check('GLOBAL TEMPLATE APPROVAL (شهادة) BLOCKED', !!aprG.error && /not approvable/.test(aprG.error.message));
  const { data: gp } = await ACC.client.rpc('acc_resolve_policy', { p_company: co, p_policy_id: 'POL-002', p_as_of: '2026-08-27', p_mode: 'PRODUCTION' });
  check('GLOBAL TEMPLATE NEVER GOVERNS PRODUCTION (SQL)', gp?.[0]?.refusal === 'NO_APPROVED_POLICY_FOR_PRODUCTION');

  const act1 = await ACC.client.rpc('acc_activate_policy', { p_policy_row: single, p_effective_from: '2026-09-01' });
  check('ACCOUNTANT-ONLY: accountant approval -> can activate', !act1.error, act1.error?.message);
  const { data: srow } = await svc.from('acc_policy_register').select('status, approved_by').eq('id', single).single();
  check('ACCOUNTANT WITH REQUIRED APPROVALS ACTIVATION PASS + الحالة APPROVED',
    srow.status === 'APPROVED' && srow.approved_by === ACC.id);
  const { data: actEv } = await svc.from('acc_audit_events').select('actor_user_id, actor_type')
    .eq('action', 'POLICY_ACTIVATED').eq('company_id', co);
  check('ACTIVATING HUMAN AUDITED — حدث التفعيل يحمل هوية المحاسبة',
    actEv?.some((e) => e.actor_user_id === ACC.id && e.actor_type === 'USER'));
  // بعد الاعتماد: نسخة الشركة المعتمدة تحكم الإنتاج عبر SQL
  const { data: govp } = await ACC.client.rpc('acc_resolve_policy', { p_company: co, p_policy_id: 'POL-001', p_as_of: '2026-10-01', p_mode: 'PRODUCTION' });
  check('COMPANY-SPECIFIC APPROVED POLICY CAN GOVERN PRODUCTION (SQL)',
    govp?.[0]?.governs_production === true && govp?.[0]?.scope === 'COMPANY');

  // المزدوجة: محاسب فقط → لا تفعيل
  const a2 = await ACC.client.rpc('acc_record_policy_approval', { p_policy_row: dual, p_approval_role: 'ACCOUNTANT' });
  check('شهادة المحاسب على المزدوجة تُسجل', !a2.error, a2.error?.message);
  const actHalf = await ACC.client.rpc('acc_activate_policy', { p_policy_row: dual, p_effective_from: '2026-09-01' });
  check('DUAL: accountant only -> NOT APPROVED', !!actHalf.error && /distinct human AUDITOR/.test(actHalf.error.message));
  // مدقق فقط (نسخة ثالثة): لا تفعيل
  const { data: dual2 } = await mk('POL-009', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL');
  const oa = await AUD.client.rpc('acc_record_policy_approval', { p_policy_row: dual2, p_approval_role: 'AUDITOR' });
  check('AUDITOR ATTESTATION: شهادة المدقق فعل مسموح', !oa.error, oa.error?.message);
  const actAud = await ACC.client.rpc('acc_activate_policy', { p_policy_row: dual2, p_effective_from: '2026-09-01' });
  check('DUAL: auditor only -> NOT APPROVED', !!actAud.error && /ACCOUNTANT approval/.test(actAud.error.message));
  // الاثنان معًا (إنسانان مختلفان) → تفعيل
  const a3 = await AUD.client.rpc('acc_record_policy_approval', { p_policy_row: dual, p_approval_role: 'AUDITOR' });
  check('شهادة المدقق على المزدوجة تُسجل', !a3.error, a3.error?.message);
  const actFull = await ACC.client.rpc('acc_activate_policy', { p_policy_row: dual, p_effective_from: '2026-09-01' });
  check('DUAL: accountant + auditor -> APPROVED', !actFull.error, actFull.error?.message);

  // UPDATE مباشر إلى APPROVED مرفوض حتى بمفتاح الخدمة (يلتف على RPC)
  const { data: dual3 } = await mk('POL-012', 'ACCOUNTANT_AND_AUDITOR', 'NEEDS_AUDITOR_APPROVAL');
  const direct = await svc.from('acc_policy_register').update({
    status: 'APPROVED', approved_at: new Date().toISOString(), approved_by: ACC.id, effective_from: '2026-09-01'
  }).eq('id', dual3);
  check('UPDATE مباشر إلى APPROVED مرفوض (حتى service key)', !!direct.error && /only via acc_activate_policy/.test(direct.error.message));

  // سجل الشهادات append-only
  const { data: apr } = await svc.from('acc_policy_approvals').select('id').limit(1).single();
  const au = await svc.from('acc_policy_approvals').update({ decision: 'REJECTED' }).eq('id', apr.id);
  check('APPROVAL RECORD UPDATE BLOCKED', !!au.error && /append-only/.test(au.error.message));
  const ad = await svc.from('acc_policy_approvals').delete().eq('id', apr.id);
  check('APPROVAL RECORD DELETE BLOCKED', !!ad.error && /append-only/.test(ad.error.message));
}

console.log(`\n  سجلات القاعدة: ${passed} نجح · ${failed} فشل`);
console.log('  (نسخ v2 التمرينية وصفوف الاختبار تبقى في Staging عمدًا — التاريخ لا يُحذف بالبنية)');
if (failed) process.exit(1);
