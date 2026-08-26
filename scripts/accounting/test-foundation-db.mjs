#!/usr/bin/env node
/**
 * اختبارات الأساس على القاعدة — تشغيل حقيقي ضد Staging فقط.
 * ⚠️ تتطلب أن تكون هجرة 2026-08-27-accounting-foundation مطبقة على
 * Staging (بيد صاحبة المنصة) — لا تعمل قبلها ولا تُشغَّل على الإنتاج.
 *
 * ملاحظة نظافة: صفوف الاختبار (شركتان وحدثا تدقيق) تبقى في Staging
 * عمدًا — سجل التدقيق append-only بالبنية، والحذف مرفوض. هذا سلوك
 * صحيح لا نقصًا في التنظيف.
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
const check = (n, c, extra='') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${extra}`); } };

/** يسك مستخدم اختبار ويعيد عميلًا بجلسته الحقيقية (نمط mint-session المجرّب) */
async function mintUser(tag) {
  const email = `acc-test-${tag}-${Date.now()}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + Date.now(), email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const token = link.properties.hashed_token;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}

console.log('\n═══ ١ · شركتان ومستخدمان ═══');
const A = await mintUser('a'), B = await mintUser('b');
const { data: coA, error: eA } = await A.client.rpc('acc_create_company', { p_legal_name: 'شركة ألف للاختبار' });
const { data: coB, error: eB } = await B.client.rpc('acc_create_company', { p_legal_name: 'شركة باء للاختبار', p_base_currency: 'USD' });
check('CREATE COMPANY (A بKWD الافتراضية)', !eA && !!coA, eA?.message);
check('CREATE COMPANY (B بUSD)', !eB && !!coB, eB?.message);

console.log('═══ ٢ · العزل: A لا ترى B ولا تكتب فيها ═══');
{
  const { data } = await A.client.from('acc_companies').select('id').eq('id', coB);
  check('A لا تقرأ شركة B', (data ?? []).length === 0);
  const { data: mB } = await A.client.from('acc_company_members').select('id').eq('company_id', coB);
  check('A لا تقرأ عضويات B', (mB ?? []).length === 0);
  const { error: wB } = await A.client.from('acc_company_members')
    .insert({ company_id: coB, user_id: A.id, role: 'BUSINESS_OWNER' });
  check('A لا تكتب عضوية في B (حتى بمعرفة الid)', !!wB);
  const { data: audB } = await A.client.from('acc_audit_events').select('id').eq('company_id', coB);
  check('A لا تقرأ تدقيق B', (audB ?? []).length === 0);
}

console.log('═══ ٣ · مستخدم واحد بأدوار مختلفة في شركات مختلفة ═══');
{
  // مالكة A تضيف B محاسبًا عندها؛ ومالكة B تضيف A للقراءة فقط عندها
  const { error: e1 } = await A.client.from('acc_company_members')
    .insert({ company_id: coA, user_id: B.id, role: 'ACCOUNTANT', created_by: A.id });
  check('المالكة تضيف عضوًا (B محاسبًا في A)', !e1, e1?.message);
  const { error: e2 } = await B.client.from('acc_company_members')
    .insert({ company_id: coB, user_id: A.id, role: 'READ_ONLY', created_by: B.id });
  check('B تضيف A للقراءة فقط في شركتها', !e2, e2?.message);
  const { data: roles } = await svc.from('acc_company_members').select('company_id, role').eq('user_id', B.id);
  check('B: مالكة في شركتها ومحاسبة في A',
    roles?.some((r) => r.company_id === coB && r.role === 'BUSINESS_OWNER') &&
    roles?.some((r) => r.company_id === coA && r.role === 'ACCOUNTANT'));
  // الآن A (قراءة فقط في B) تحاول الكتابة في B
  const { error: e3 } = await A.client.from('acc_company_members')
    .insert({ company_id: coB, user_id: A.id, role: 'ACCOUNTANT' });
  check('READ_ONLY لا يكتب — القائمة البيضاء للمالك وحده', !!e3);
}

console.log('═══ ٤ · المدقق بنيويًا قراءة فقط ═══');
{
  const AUD = await mintUser('aud');
  const { error } = await A.client.from('acc_company_members')
    .insert({ company_id: coA, user_id: AUD.id, role: 'AUDITOR', created_by: A.id });
  check('إضافة مدقق لشركة A', !error, error?.message);
  const { data: seen } = await AUD.client.from('acc_audit_events').select('id').eq('company_id', coA);
  check('المدقق يقرأ سجل التدقيق', (seen ?? []).length >= 1);
  const w1 = await AUD.client.from('acc_company_members')
    .insert({ company_id: coA, user_id: AUD.id, role: 'ACCOUNTANT' });
  check('المدقق لا يكتب عضويات', !!w1.error);
  const w2 = await AUD.client.from('acc_company_members').delete().eq('company_id', coA);
  check('المدقق لا يحذف عضويات', !!w2.error || (w2.count ?? 0) === 0);
  const w3 = await AUD.client.from('acc_audit_events')
    .insert({ company_id: coA, actor_type: 'USER', action: 'x', subject_type: 'y', occurred_at: new Date().toISOString() });
  check('المدقق لا يكتب أحداث تدقيق', !!w3.error);
}

console.log('═══ ٥ · سجل التدقيق append-only حتى ضد مفتاح الخدمة ═══');
{
  const { data: ev } = await svc.from('acc_audit_events').select('id').eq('company_id', coA).limit(1).single();
  const u = await svc.from('acc_audit_events').update({ action: 'TAMPERED' }).eq('id', ev.id);
  check('UPDATE مرفوض بالتريغر (حتى service role)', !!u.error && /append-only/.test(u.error.message));
  const d = await svc.from('acc_audit_events').delete().eq('id', ev.id);
  check('DELETE مرفوض بالتريغر (حتى service role)', !!d.error && /append-only/.test(d.error.message));
}

console.log('═══ ٦ · أسعار الصرف: مشاهدة ثابتة ═══');
{
  const { data: r, error } = await svc.from('acc_exchange_rates')
    .insert({ base_code: 'USD', quote_code: 'KWD', rate: '0.3071000000', rate_date: '2026-08-27', source: 'TEST-' + Date.now() })
    .select('id, rate').single();
  // ملاحظة: القاعدة تخزن numeric دقيقًا؛ PostgREST يسلسله رقم JSON —
  // مسار المال الفعلي لا يقرأ الأسعار عبر number أبدًا (نصوص فقط)
  check('إدخال سعر بمقدار دقيق', !error && String(r?.rate) === '0.3071', error?.message);
  const u = await svc.from('acc_exchange_rates').update({ rate: '9' }).eq('id', r.id);
  check('تعديل سعر تاريخي مرفوض', !!u.error && /immutable/.test(u.error.message));
  const d = await svc.from('acc_exchange_rates').delete().eq('id', r.id);
  check('حذف سعر تاريخي مرفوض', !!d.error && /immutable/.test(d.error.message));
  const { error: cW } = await A.client.from('acc_exchange_rates')
    .insert({ base_code: 'EUR', quote_code: 'KWD', rate: '1', rate_date: '2026-08-27', source: 'X' });
  check('العملاء لا يدخلون أسعارًا', !!cW);
}

console.log('═══ ٧ · العملات مرجع مقروء محمي ═══');
{
  const { data } = await A.client.from('acc_currencies').select('code, minor_unit');
  const map = Object.fromEntries((data ?? []).map((c) => [c.code, c.minor_unit]));
  check('KWD=3 · USD=2 · JPY=0 من القاعدة', map.KWD === 3 && map.USD === 2 && map.JPY === 0);
  const w = await A.client.from('acc_currencies').update({ minor_unit: 9 }).eq('code', 'KWD');
  check('العميل لا يعدل العملات', !!w.error || (w.count ?? 0) === 0);
}

console.log(`\n  أساس القاعدة: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار تبقى في Staging عمدًا — التدقيق لا يُحذف بالبنية)');
if (failed) process.exit(1);
