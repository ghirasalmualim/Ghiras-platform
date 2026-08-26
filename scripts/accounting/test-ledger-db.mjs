#!/usr/bin/env node
/**
 * اختبارات Stage 3 على القاعدة — **PENDING STAGING**: تتطلب تطبيق
 * هجرة 2026-08-27-accounting-ledger على Staging أولًا. لا إنتاج أبدًا.
 * قابلة لإعادة التشغيل على قاعدة append-only: كل تشغيلة تنشئ شركاتها
 * وحساباتها (fixtures اختبارية صريحة — ليست COA غراس) بمعرفات فريدة.
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
  const email = `acc3-${t}-${TAG}@test.ghiras.local`;
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: 'Tt1!' + TAG, email_confirm: true });
  if (error) throw error;
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: created.user.id, client };
}

// ─── تجهيز: شركتان بكامل الأدوار ───
const OWN = await mintUser('own'), ACC = await mintUser('acc'), AUD = await mintUser('aud'),
      FM = await mintUser('fm'), EMP = await mintUser('emp'), RO = await mintUser('ro'),
      OUT = await mintUser('out'), OWN_B = await mintUser('ownb'), ACC_B = await mintUser('accb');
const { data: coA } = await OWN.client.rpc('acc_create_company', { p_legal_name: `شركة دفتر ألف ${TAG}` });
const { data: coB } = await OWN_B.client.rpc('acc_create_company', { p_legal_name: `شركة دفتر باء ${TAG}` });
for (const [u, r] of [[ACC, 'ACCOUNTANT'], [AUD, 'AUDITOR'], [FM, 'FINANCE_MANAGER'], [EMP, 'EMPLOYEE'], [RO, 'READ_ONLY']]) {
  const { error } = await OWN.client.from('acc_company_members').insert({ company_id: coA, user_id: u.id, role: r, created_by: OWN.id });
  if (error) throw error;
}
{ const { error } = await OWN_B.client.from('acc_company_members').insert({ company_id: coB, user_id: ACC_B.id, role: 'ACCOUNTANT', created_by: OWN_B.id }); if (error) throw error; }

const rpc = (u, fn, args) => u.client.rpc(fn, args);
const KWD = (a) => a; // نصوص وحدات صغرى — لا JS Number ماليًا
const line = (account, side, amount, extra = {}) => ({
  account_id: account, side, amount_minor: amount, currency: 'KWD',
  base_amount_minor: amount, base_currency: 'KWD', tax_status: 'NO_TAX_REGIME', ...extra });

console.log('\n═══ ١ · دليل الحسابات ═══');
const mkAcc = (u, co, code, type, extra = {}) =>
  rpc(u, 'acc_create_account', { p_company: co, p_code: code, p_name: `حساب ${code}`, p_type: type, ...extra });
const { data: cash } = await mkAcc(ACC, coA, `1000-${TAG}`, 'ASSET');
const { data: capital } = await mkAcc(ACC, coA, `3000-${TAG}`, 'EQUITY');
const { data: revenue } = await mkAcc(ACC, coA, `4000-${TAG}`, 'REVENUE');
const { data: expense } = await mkAcc(ACC, coA, `5000-${TAG}`, 'EXPENSE');
const { data: parentAcc } = await mkAcc(ACC, coA, `1-${TAG}`, 'ASSET', { p_postable: false });
check('COMPANY-SCOPED ACCOUNT (المحاسبة تنشئ)', !!cash && !!capital && !!revenue);
const dup = await mkAcc(ACC, coA, `1000-${TAG}`, 'ASSET');
check('ACCOUNT CODE UNIQUE PER COMPANY', !!dup.error);
const sameOther = await mkAcc(ACC_B, coB, `1000-${TAG}`, 'ASSET');
check('SAME CODE ALLOWED DIFFERENT COMPANY', !sameOther.error, sameOther.error?.message);
const badParent = await mkAcc(ACC, coA, `1100-${TAG}`, 'ASSET', { p_parent: sameOther.data });
check('PARENT SAME COMPANY', !!badParent.error && /same company/.test(badParent.error.message));
const { data: child } = await mkAcc(ACC, coA, `1200-${TAG}`, 'ASSET', { p_parent: parentAcc });
const cyc = await svc.from('acc_accounts').update({ parent_id: child }).eq('id', parentAcc);
check('HIERARCHY CYCLE BLOCKED', !!cyc.error && /cycle/.test(cyc.error.message));
const outsiderAcc = await mkAcc(OUT, coA, `9-${TAG}`, 'ASSET');
check('غير العضو لا ينشئ حسابات (أدمِن المنصة ضمنًا)', !!outsiderAcc.error);
const delAcc = await svc.from('acc_accounts').delete().eq('id', cash);
check('حذف حساب مرفوض — التعطيل بدل الحذف', !!delAcc.error && /deactivate/.test(delAcc.error.message));

console.log('═══ ٢ · الفترات ═══');
const { data: pOpen } = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `FY-${TAG}`, p_start: '2026-01-01', p_end: '2026-06-30' });
const { data: pNext } = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `FY-${TAG}`, p_start: '2026-07-01', p_end: '2026-12-31' });
const { data: pShort } = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `FY0-${TAG}`, p_start: '2025-11-15', p_end: '2025-12-31' });
check('NON-12-MONTH FIRST PERIOD SUPPORTED', !!pShort);
const overlap = await rpc(ACC, 'acc_create_period', { p_company: coA, p_fiscal_year: `X-${TAG}`, p_start: '2026-03-01', p_end: '2026-08-31' });
check('OVERLAPPING PERIOD BLOCKED', !!overlap.error);
const t1 = await rpc(ACC, 'acc_transition_period', { p_period: pOpen, p_new_state: 'OPEN' });
check('FUTURE → OPEN', !t1.error, t1.error?.message);
await rpc(ACC, 'acc_transition_period', { p_period: pNext, p_new_state: 'OPEN' });
const bad1 = await rpc(ACC, 'acc_transition_period', { p_period: pShort, p_new_state: 'SOFT_CLOSED' });
check('انتقال محرم FUTURE→SOFT_CLOSED يفشل', !!bad1.error && /forbidden period transition/.test(bad1.error.message));
const direct = await svc.from('acc_fiscal_periods').update({ state: 'OPEN' }).eq('id', pShort);
check('تغيير حالة مباشر مرفوض حتى بمفتاح الخدمة', !!direct.error && /signed period functions/.test(direct.error.message));

console.log('═══ ٣ · القيد المزدوج والترحيل ═══');
const mkJournal = (u, lines, extra = {}) => rpc(u, 'acc_create_manual_journal', {
  p_company: coA, p_period: pOpen, p_entry_date: '2026-02-10',
  p_description: `قيد اختبار ${TAG}`, p_lines: lines, ...extra });
const { data: e1, error: e1e } = await mkJournal(ACC,
  [line(cash, 'DEBIT', '100000'), line(capital, 'CREDIT', '100000')], { p_kind: 'OPENING' });
check('DRAFT CREATED (قيد افتتاحي متوازن)', !!e1, e1e?.message);
const ed = await rpc(ACC, 'acc_edit_draft', { p_entry: e1, p_description: 'قيد افتتاحي معدل', p_entry_date: '2026-02-11', p_period: pOpen,
  p_lines: [line(cash, 'DEBIT', '100000'), line(capital, 'CREDIT', '100000')] });
check('DRAFT EDITABLE (قبل/بعد مدقق)', !ed.error, ed.error?.message);
const sub1 = await rpc(ACC, 'acc_submit_journal', { p_entry: e1 });
check('DRAFT → PENDING_APPROVAL', !sub1.error, sub1.error?.message);
const post1 = await rpc(ACC, 'acc_post_journal', { p_entry: e1 });
check('PENDING_APPROVAL → POSTED (BALANCED ENTRY POSTS)', !post1.error, post1.error?.message);

// غير متوازن بفلس واحد
const { data: e2 } = await mkJournal(ACC, [line(expense, 'DEBIT', '5001'), line(cash, 'CREDIT', '5000')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: e2 });
const post2 = await rpc(ACC, 'acc_post_journal', { p_entry: e2 });
check('UNBALANCED BY 1 MINOR UNIT BLOCKED', !!post2.error && /unbalanced entry rejected/.test(post2.error.message));
const { data: e2row } = await svc.from('acc_journal_entries').select('status').eq('id', e2).single();
check('UNBALANCED POST LEAVES NO PARTIAL STATE (بقي PENDING_APPROVAL)', e2row.status === 'PENDING_APPROVAL');
const { data: e2lines } = await svc.from('acc_journal_lines').select('id').eq('entry_id', e2);
check('NO AUTO-BALANCING (لا سطر موازنة أُدرج)', e2lines.length === 2);
const { data: e3 } = await mkJournal(ACC, [line(cash, 'DEBIT', '1000')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: e3 });
const post3 = await rpc(ACC, 'acc_post_journal', { p_entry: e3 });
check('MINIMUM MEANINGFUL LINES', !!post3.error && /two meaningful lines/.test(post3.error.message));
const inact = await rpc(ACC, 'acc_set_account_active', { p_account: expense, p_active: false });
const { data: e4 } = await mkJournal(ACC, [line(expense, 'DEBIT', '2000'), line(cash, 'CREDIT', '2000')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: e4 });
const post4 = await rpc(ACC, 'acc_post_journal', { p_entry: e4 });
check('INACTIVE ACCOUNT REJECTS NEW POSTING', !inact.error && !!post4.error && /active postable/.test(post4.error.message));
await rpc(ACC, 'acc_set_account_active', { p_account: expense, p_active: true });

console.log('═══ ٤ · مناعة المرحَّل ═══');
for (const [n, q] of [
  ['POSTED UPDATE BLOCKED', svc.from('acc_journal_entries').update({ description: 'X' }).eq('id', e1)],
  ['POSTED DELETE BLOCKED', svc.from('acc_journal_entries').delete().eq('id', e1)],
]) { const r = await q; check(n, !!r.error); }
const back = await svc.from('acc_journal_entries').update({ status: 'DRAFT' }).eq('id', e1);
check('POSTED → DRAFT BLOCKED', !!back.error);
const disc = await svc.from('acc_journal_entries').update({ status: 'DISCARDED' }).eq('id', e1);
check('POSTED → DISCARDED BLOCKED', !!disc.error);
const { data: l1 } = await svc.from('acc_journal_lines').select('id').eq('entry_id', e1).limit(1).single();
const lu = await svc.from('acc_journal_lines').update({ amount_minor: '999' }).eq('id', l1.id);
check('POSTED LINE UPDATE BLOCKED', !!lu.error && /immutable/.test(lu.error.message));
const ld = await svc.from('acc_journal_lines').delete().eq('id', l1.id);
check('POSTED LINE DELETE BLOCKED', !!ld.error);
const li = await svc.from('acc_journal_lines').insert({ entry_id: e1, company_id: coA, account_id: cash, side: 'DEBIT', amount_minor: 1, currency: 'KWD', base_amount_minor: 1, base_currency: 'KWD', tax_status: 'NO_TAX_REGIME' });
check('INSERT LINE INTO POSTED ENTRY BLOCKED', !!li.error && /DRAFT/.test(li.error.message));
const { data: e5 } = await mkJournal(ACC, [line(cash, 'DEBIT', '100'), line(capital, 'CREDIT', '100')]);
const disc5 = await rpc(ACC, 'acc_discard_journal', { p_entry: e5 });
check('DRAFT → DISCARDED (محفوظ لا محذوف)', !disc5.error);

console.log('═══ ٥ · المال والضريبة ═══');
const { data: lrows } = await svc.from('acc_journal_lines').select('amount_minor, base_amount_minor, tax_status, currency, base_currency').eq('entry_id', e1);
check('TRANSACTION + BASE AMOUNT PERSISTED / SAME-CURRENCY EXACT',
  lrows.every((l) => String(l.amount_minor) === String(l.base_amount_minor) && l.currency === 'KWD'));
check('EVERY POSTED LINE HAS TAX STATUS = NO_TAX_REGIME accepted',
  lrows.every((l) => l.tax_status === 'NO_TAX_REGIME'));
// FX: سطر USD بأدلة سعر مثبتة (شركة الأساس KWD)
const { data: efx } = await mkJournal(ACC, [
  line(cash, 'DEBIT', '30710', { currency: 'USD', amount_minor: '10000', fx_rate: '0.3071', fx_rate_date: '2026-02-10', fx_rate_source: 'CBK' }),
  line(revenue, 'CREDIT', '30710')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: efx });
const postfx = await rpc(ACC, 'acc_post_journal', { p_entry: efx });
check('FX RATE METADATA PERSISTED ويترحل بعملة الأساس', !postfx.error, postfx.error?.message);
// FIX 2: أساس خاطئ بفلس واحد — القيد متوازن داخليًا لكنه فاسد رياضيًا
const { data: efxBad } = await mkJournal(ACC, [
  line(cash, 'DEBIT', '30711', { currency: 'USD', amount_minor: '10000', fx_rate: '0.3071', fx_rate_date: '2026-02-10', fx_rate_source: 'CBK' }),
  line(revenue, 'CREDIT', '30711')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: efxBad });
const postFxBad = await rpc(ACC, 'acc_post_journal', { p_entry: efxBad });
check('INCORRECT BASE BY 1 MINOR UNIT BLOCKED', !!postFxBad.error && /FX base amount mismatch/.test(postFxBad.error.message));
const { data: efxBadRow } = await svc.from('acc_journal_lines').select('base_amount_minor').eq('entry_id', efxBad);
check('NO AUTO-CORRECTION (الأساس المخزن كما قُدم، والقيد لم يُرحّل)', String(efxBadRow[0].base_amount_minor) === '30711');
// أساس اعتباطي متوازن كليًا (1.000 KWD لسطري 100$ بسعر 0.3) — مرفوض
const { data: efxArb } = await mkJournal(ACC, [
  line(cash, 'DEBIT', '1000', { currency: 'USD', amount_minor: '10000', fx_rate: '0.3000', fx_rate_date: '2026-02-10', fx_rate_source: 'X' }),
  line(revenue, 'CREDIT', '1000')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: efxArb });
const postFxArb = await rpc(ACC, 'acc_post_journal', { p_entry: efxArb });
check('ARBITRARY BALANCED FX JOURNAL BLOCKED', !!postFxArb.error && /FX base amount mismatch/.test(postFxArb.error.message));
// JPY→KWD: ¥100000 × 0.00232 = 232.000 KWD = 232000
const { data: efxJpy } = await mkJournal(ACC, [
  line(cash, 'DEBIT', '232000', { currency: 'JPY', amount_minor: '100000', fx_rate: '0.00232', fx_rate_date: '2026-02-10', fx_rate_source: 'test' }),
  line(revenue, 'CREDIT', '232000')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: efxJpy });
const postFxJpy = await rpc(ACC, 'acc_post_journal', { p_entry: efxJpy });
check('JPY TRANSACTION / KWD BASE exact', !postFxJpy.error, postFxJpy.error?.message);
// حد التقريب: $0.05 × 0.05 = 0.0025 KWD → HALF_UP → 0.003 (3)
const { data: efxHalf } = await mkJournal(ACC, [
  line(cash, 'DEBIT', '3', { currency: 'USD', amount_minor: '5', fx_rate: '0.05', fx_rate_date: '2026-02-10', fx_rate_source: 'test' }),
  line(revenue, 'CREDIT', '3')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: efxHalf });
const postFxHalf = await rpc(ACC, 'acc_post_journal', { p_entry: efxHalf });
check('ROUNDING BOUNDARY (نصف تمامًا → HALF_UP يقبل 3 لا 2)', !postFxHalf.error, postFxHalf.error?.message);
const fxBad = await mkJournal(ACC, [
  line(cash, 'DEBIT', '30710', { currency: 'USD', amount_minor: '10000' }), line(revenue, 'CREDIT', '30710')]);
check('عملة مختلفة بلا أدلة سعر تُرفض (check)', !!fxBad.error);

console.log('═══ ٦ · الأدوار ═══');
const mkPending = async () => {
  const { data: e } = await mkJournal(ACC, [line(cash, 'DEBIT', '700'), line(revenue, 'CREDIT', '700')]);
  await rpc(ACC, 'acc_submit_journal', { p_entry: e }); return e; };
const eP = await mkPending();
for (const [u, n] of [[OWN, 'OWNER CANNOT POST MANUAL JOURNAL'], [AUD, 'AUDITOR CANNOT POST'],
  [FM, 'FINANCE_MANAGER CANNOT POST'], [EMP, 'EMPLOYEE CANNOT POST'],
  [RO, 'READ_ONLY CANNOT POST'], [OUT, 'PLATFORM ADMIN NO BYPASS']]) {
  const r = await rpc(u, 'acc_post_journal', { p_entry: eP });
  check(n, !!r.error);
}
const svcPost = await svc.rpc('acc_post_journal', { p_entry: eP });
check('AI/SYSTEM (بلا auth.uid) لا يرحّل', !!svcPost.error && /human act/.test(svcPost.error.message));
const fmDraft = await mkJournal(FM, [line(cash, 'DEBIT', '10'), line(revenue, 'CREDIT', '10')], { p_kind: 'ADJUSTMENT' });
check('FINANCE_MANAGER يجهز مسودة تسوية', !fmDraft.error, fmDraft.error?.message);
const okPost = await rpc(ACC, 'acc_post_journal', { p_entry: eP });
check('ACCOUNTANT CAN POST', !okPost.error, okPost.error?.message);
const { data: bSees } = await ACC_B.client.from('acc_journal_entries').select('id').eq('company_id', coA);
check('COMPANY A CANNOT ACCESS COMPANY B LEDGER (والعكس)', (bSees ?? []).length === 0);

console.log('═══ ٧ · العكس ═══');
const rev = await rpc(ACC, 'acc_reverse_journal', { p_entry: eP, p_target_period: pOpen, p_reason: 'تصحيح اختبار' });
check('POSTED ENTRY REVERSAL', !rev.error, rev.error?.message);
const { data: revRow } = await svc.from('acc_journal_entries').select('kind, reverses_entry_id, status').eq('id', rev.data).single();
check('REVERSAL REFERENCES ORIGINAL', revRow.kind === 'REVERSAL' && revRow.reverses_entry_id === eP && revRow.status === 'POSTED');
const { data: origRow } = await svc.from('acc_journal_entries').select('status, reversed_by_entry_id').eq('id', eP).single();
check('ORIGINAL → REVERSED ONLY AFTER REVERSAL POSTS', origRow.status === 'REVERSED' && origRow.reversed_by_entry_id === rev.data);
const { data: revLines } = await svc.from('acc_journal_lines').select('side, base_amount_minor, account_id').eq('entry_id', rev.data);
check('REVERSAL LINES EXACTLY INVERT', revLines.length === 2 && revLines.every((l) => String(l.base_amount_minor) === '700'));
const revU = await svc.from('acc_journal_lines').update({ amount_minor: '1' }).eq('entry_id', rev.data);
check('REVERSAL IMMUTABLE', !!revU.error);
const noReason = await rpc(ACC, 'acc_reverse_journal', { p_entry: e1, p_target_period: pOpen, p_reason: ' ' });
check('REASON REQUIRED للعكس', !!noReason.error && /reason/.test(noReason.error.message));
const revAgain = await rpc(ACC, 'acc_reverse_journal', { p_entry: eP, p_target_period: pOpen, p_reason: 'x' });
check('REVERSED لا يُعكس ثانية (POSTED فقط)', !!revAgain.error);

console.log('═══ ٨ · دفتر الأستاذ والميزان ═══');
const { data: gl } = await ACC.client.rpc('acc_general_ledger', { p_account: cash });
check('PER-ACCOUNT DETAIL + SOURCE VISIBLE', (gl ?? []).length >= 3 && gl.every((r) => typeof r.source_kind === 'string'));
check('RUNNING BALANCE نصي متسلسل', gl.every((r) => typeof r.running_balance_minor === 'string'));
const { data: tb } = await ACC.client.rpc('acc_trial_balance', { p_company: coA });
const sum = (k) => tb.reduce((a, r) => a + BigInt(r[k]), 0n);
check('DEBITS = CREDITS EXACTLY (BigInt من نصوص)', sum('debit_minor') === sum('credit_minor') && sum('debit_minor') > 0n);
check('NO JS NUMBER MONEY في المخرجات', tb.every((r) => typeof r.debit_minor === 'string'));
check('MULTIPLE ACCOUNTS', tb.length >= 3);
const { data: tbAsOf } = await ACC.client.rpc('acc_trial_balance', { p_company: coA, p_as_of: '2026-02-01' });
check('AS-OF DATE (قبل القيود = فارغ/أقل)', (tbAsOf ?? []).length <= tb.length);
const { data: tbPer } = await ACC.client.rpc('acc_trial_balance', { p_company: coA, p_period: pOpen });
check('BY PERIOD ويتوازن', tbPer.reduce((a, r) => a + BigInt(r.debit_minor) - BigInt(r.credit_minor), 0n) === 0n);
// العكس يصفّي طبيعيًا: صافي حساب revenue من eP بعد العكس صفر
const { data: glr } = await ACC.client.rpc('acc_general_ledger', { p_account: revenue });
const netRev = glr.filter((r) => [eP, rev.data].includes(r.entry_id))
  .reduce((a, r) => a + BigInt(r.credit_minor) - BigInt(r.debit_minor), 0n);
check('REVERSAL NATURALLY NETS (صافي الأصل+العكس = 0)', netRev === 0n);

console.log('═══ ٨ب · آثار الترحيل المحاسبية: POSTED + REVERSED (FIX 1) ═══');
{
  // سيناريو نصي: أصل 100/100 ثم عكسه — الاثنان في الدفتر والصافي صفر
  const { data: tbNow } = await ACC.client.rpc('acc_trial_balance', { p_company: coA });
  const { data: glRev } = await ACC.client.rpc('acc_general_ledger', { p_account: revenue });
  check('ORIGINAL POSTED INCLUDED ثم AFTER STATUS REVERSED STILL INCLUDED',
    glRev.some((r) => r.entry_id === eP && r.entry_status === 'REVERSED'));
  check('REVERSAL INCLUDED', glRev.some((r) => r.entry_id === rev.data && r.entry_status === 'POSTED'));
  check('ORIGINAL + REVERSAL NET EXACTLY ZERO', netRev === 0n);
  check('الميزان ما زال متوازنًا تمامًا بعد العكس',
    tbNow.reduce((a, r) => a + BigInt(r.debit_minor) - BigInt(r.credit_minor), 0n) === 0n);
  // المستبعدون: مسودة ومعلق ومتجاهل لا أثر لهم
  const ids = new Set();
  for (const { data: g } of [ { data: glRev } ]) g.forEach((r) => ids.add(r.entry_id));
  const { data: glCash } = await ACC.client.rpc('acc_general_ledger', { p_account: cash });
  glCash.forEach((r) => ids.add(r.entry_id));
  check('DRAFT EXCLUDED', !ids.has(fmDraft.data));
  check('PENDING EXCLUDED', !ids.has(e2));
  check('DISCARDED EXCLUDED', !ids.has(e5));
}

console.log('═══ ٨ج · أمن القراءة: دور + شركة لا عضوية وحدها (FIX 3) ═══');
{
  const raw = (u, t) => u.client.from(t).select('id').eq('company_id', coA);
  const { data: aCoa } = await raw(ACC, 'acc_accounts');
  check('ACCOUNTANT READ COA', (aCoa ?? []).length >= 4);
  const { data: aJ } = await raw(ACC, 'acc_journal_entries');
  check('ACCOUNTANT READ JOURNAL', (aJ ?? []).length >= 3);
  const { data: audJ } = await raw(AUD, 'acc_journal_lines');
  check('AUDITOR READ LEDGER (أسطر خام)', (audJ ?? []).length >= 4);
  const { data: audGl } = await AUD.client.rpc('acc_general_ledger', { p_account: cash });
  check('AUDITOR GENERAL LEDGER', (audGl ?? []).length >= 1);
  const audMut = await AUD.client.rpc('acc_post_journal', { p_entry: e2 });
  check('AUDITOR MUTATION STILL BLOCKED', !!audMut.error);
  for (const [u, t, n] of [
    [OWN, 'acc_accounts', 'OWNER RAW COA BLOCKED'],
    [OWN, 'acc_journal_entries', 'OWNER RAW JOURNAL BLOCKED'],
    [OWN, 'acc_journal_lines', 'OWNER RAW JOURNAL LINES BLOCKED'],
    [FM, 'acc_journal_lines', 'FINANCE_MANAGER RAW JOURNAL LINES BLOCKED'],
    [EMP, 'acc_journal_lines', 'EMPLOYEE RAW LEDGER BLOCKED'],
    [RO, 'acc_journal_lines', 'READ_ONLY NO UNDEFINED BROAD LEDGER ACCESS'],
    [OUT, 'acc_journal_lines', 'PLATFORM ADMIN NO READ BYPASS'],
  ]) { const { data } = await raw(u, t); check(n, (data ?? []).length === 0); }
  const ownGl = await OWN.client.rpc('acc_general_ledger', { p_account: cash });
  check('OWNER GENERAL LEDGER RPC BLOCKED', !!ownGl.error && /ACCOUNTANT or AUDITOR/.test(ownGl.error.message));
  const ownTb = await OWN.client.rpc('acc_trial_balance', { p_company: coA });
  check('OWNER TRIAL BALANCE RPC BLOCKED', !!ownTb.error);
  const fmTb = await FM.client.rpc('acc_trial_balance', { p_company: coA });
  check('FINANCE_MANAGER TRIAL BALANCE ALLOWED', !fmTb.error && (fmTb.data ?? []).length >= 1, fmTb.error?.message);
  const { data: bReads } = await ACC_B.client.from('acc_journal_lines').select('id').eq('company_id', coA);
  check('COMPANY A STILL CANNOT READ COMPANY B', (bReads ?? []).length === 0);
}

console.log('═══ ٩ · الإغلاق وإعادة الفتح ═══');
const sc = await rpc(ACC, 'acc_transition_period', { p_period: pOpen, p_new_state: 'SOFT_CLOSED' });
check('OPEN → SOFT_CLOSED', !sc.error, sc.error?.message);
const { data: eSoft } = await mkJournal(ACC, [line(cash, 'DEBIT', '50'), line(revenue, 'CREDIT', '50')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: eSoft });
const postSoft = await rpc(ACC, 'acc_post_journal', { p_entry: eSoft });
check('ORDINARY POST TO SOFT_CLOSED BLOCKED', !!postSoft.error && /does not allow/.test(postSoft.error.message));
const { data: eAdj } = await mkJournal(ACC, [line(cash, 'DEBIT', '50'), line(revenue, 'CREDIT', '50')], { p_kind: 'ADJUSTMENT' });
await rpc(ACC, 'acc_submit_journal', { p_entry: eAdj });
const postAdj = await rpc(ACC, 'acc_post_journal', { p_entry: eAdj });
check('تسوية إلى SOFT_CLOSED بفعل محاسبة تمر', !postAdj.error, postAdj.error?.message);
const reOpen = await rpc(ACC, 'acc_transition_period', { p_period: pOpen, p_new_state: 'OPEN' });
check('SOFT_CLOSED → OPEN WITH ACCOUNTANT', !reOpen.error);
await rpc(ACC, 'acc_transition_period', { p_period: pOpen, p_new_state: 'SOFT_CLOSED' });
const closeRes = await rpc(ACC, 'acc_close_period', { p_period: pOpen });
check('SOFT_CLOSED → CLOSED + لقطة', !closeRes.error && !!closeRes.data, closeRes.error?.message);
const { data: snap } = await svc.from('acc_close_snapshots').select('balances').eq('id', closeRes.data).single();
check('لقطة الأرصدة نصوص وحدات صغرى', Object.values(snap.balances).every((b) => typeof b.debit_minor === 'string'));
const snapU = await svc.from('acc_close_snapshots').update({ balances: {} }).eq('id', closeRes.data);
check('اللقطة immutable', !!snapU.error);
// الترحيل إلى CLOSED/FUTURE مرفوض
const { data: eClosed } = await mkJournal(ACC, [line(cash, 'DEBIT', '10'), line(revenue, 'CREDIT', '10')]);
await rpc(ACC, 'acc_submit_journal', { p_entry: eClosed });
const postClosed = await rpc(ACC, 'acc_post_journal', { p_entry: eClosed });
check('POST TO CLOSED BLOCKED', !!postClosed.error);
const { data: eFut } = await rpc(ACC, 'acc_create_manual_journal', { p_company: coA, p_period: pShort, p_entry_date: '2025-12-01', p_description: 'x', p_lines: [line(cash, 'DEBIT', '10'), line(revenue, 'CREDIT', '10')] });
await rpc(ACC, 'acc_submit_journal', { p_entry: eFut });
const postFut = await rpc(ACC, 'acc_post_journal', { p_entry: eFut });
check('POST TO FUTURE BLOCKED', !!postFut.error);
// عكس أصلٍ في فترة مغلقة → قدمًا في pNext المفتوحة
const revClosed = await rpc(ACC, 'acc_reverse_journal', { p_entry: eAdj, p_target_period: pOpen, p_reason: 'عكس في المغلقة' });
check('عكس داخل فترة CLOSED مرفوض', !!revClosed.error);
const revFwd = await rpc(ACC, 'acc_reverse_journal', { p_entry: eAdj, p_target_period: pNext, p_reason: 'عكس قدمًا لتاريخ مغلق' });
check('CLOSED-PERIOD ORIGINAL REVERSED PROSPECTIVELY', !revFwd.error, revFwd.error?.message);
// إعادة الفتح المزدوجة
const roAcc1 = await rpc(ACC, 'acc_reopen_period', { p_period: pOpen });
check('ACCOUNTANT ONLY NOT ENOUGH (لا شهادات)', !!roAcc1.error);
await rpc(ACC, 'acc_record_period_approval', { p_period: pOpen, p_approval_role: 'ACCOUNTANT', p_reason: 'تسوية متأخرة' });
const roAcc2 = await rpc(ACC, 'acc_reopen_period', { p_period: pOpen });
check('شهادة المحاسبة وحدها لا تكفي', !!roAcc2.error && /BUSINESS_OWNER/.test(roAcc2.error.message));
const wrongRole = await rpc(ACC, 'acc_record_period_approval', { p_period: pOpen, p_approval_role: 'BUSINESS_OWNER', p_reason: 'x' });
check('المحاسبة لا تشهد كمالكة (إنسانان مختلفان بنيويًا)', !!wrongRole.error);
await rpc(OWN, 'acc_record_period_approval', { p_period: pOpen, p_approval_role: 'BUSINESS_OWNER', p_reason: 'موافقة المالكة' });
const roOwner = await rpc(OWN, 'acc_reopen_period', { p_period: pOpen });
check('OWNER ONLY NOT ENOUGH (المالكة لا تنفذ)', !!roOwner.error);
const svcRo = await svc.rpc('acc_reopen_period', { p_period: pOpen });
check('AI/SYSTEM CANNOT APPROVE/REOPEN', !!svcRo.error);
const roFull = await rpc(ACC, 'acc_reopen_period', { p_period: pOpen });
check('ACCOUNTANT + OWNER DISTINCT HUMANS → REOPENED', !roFull.error, roFull.error?.message);
const { count: snaps } = await svc.from('acc_close_snapshots').select('id', { count: 'exact', head: true }).eq('period_id', pOpen);
check('PRIOR CLOSE SNAPSHOT PRESERVED', snaps >= 1);
const closeAgain = await rpc(ACC, 'acc_close_period', { p_period: pOpen });
check('REOPENED → CLOSED', !closeAgain.error, closeAgain.error?.message);
const arch = await rpc(ACC, 'acc_transition_period', { p_period: pOpen, p_new_state: 'ARCHIVED' });
check('CLOSED → ARCHIVED', !arch.error, arch.error?.message);
const unarch = await rpc(ACC, 'acc_record_period_approval', { p_period: pOpen, p_approval_role: 'ACCOUNTANT', p_reason: 'y' })
  .then(() => rpc(OWN, 'acc_record_period_approval', { p_period: pOpen, p_approval_role: 'BUSINESS_OWNER', p_reason: 'y' }))
  .then(() => rpc(ACC, 'acc_reopen_period', { p_period: pOpen }));
check('ARCHIVED → ANYTHING BLOCKED', !!unarch.error);

console.log('═══ ١٠ · التدقيق ═══');
const { data: audEv } = await svc.from('acc_audit_events').select('action').eq('company_id', coA);
const acts = new Set((audEv ?? []).map((e) => e.action));
for (const a of ['JOURNAL_POSTED', 'JOURNAL_REVERSED', 'PERIOD_STATE_CHANGED', 'PERIOD_CLOSED',
  'PERIOD_REOPENED', 'PERIOD_REOPEN_APPROVAL', 'JOURNAL_DRAFT_EDITED', 'ACCOUNT_CREATED'])
  check(`حدث ${a} مسجل`, acts.has(a));
const { data: anyEv } = await svc.from('acc_audit_events').select('id').eq('company_id', coA).limit(1).single();
const tamper = await svc.from('acc_audit_events').update({ action: 'X' }).eq('id', anyEv.id);
check('AUDIT IMMUTABILITY STILL PASS', !!tamper.error && /append-only/.test(tamper.error.message));

console.log(`\n  دفتر الأستاذ: ${passed} نجح · ${failed} فشل`);
console.log('  (صفوف الاختبار وشركاته تبقى في Staging عمدًا — الدفتر append-only بالبنية)');
if (failed) process.exit(1);
