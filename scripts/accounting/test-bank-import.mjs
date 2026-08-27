#!/usr/bin/env node
/**
 * Stage 9 — عقود استيراد البنك الساكنة + خريطة BANK-T-001..025.
 *
 * BANK-T-001..008: متطلبات الـBlueprint الملزمة مباشرة.
 * BANK-T-009..025: **توسعات قبول تنفيذية مقترحة** لإثبات DoD المرحلة —
 * ليست نص Blueprint حرفيًا.
 *
 * قرار الإغلاق المعتمد (dependency-consistent):
 * «استخراج PDF الصوري/الممسوح بالذكاء الاصطناعي مؤجَّل عمدًا للمرحلة 13
 *  خلف واجهة مستخرج مجمّدة؛ BLK-011 يبقى مفتوحًا حتى عينات ميدانية.»
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync('supabase/2026-08-31-accounting-bank-import.sql', 'utf8');
const CODE = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const walk = (dir) => {
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = dir + '/' + e;
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
};
const TS_FILES = [...walk('src/lib/accounting/bank'), 'src/app/api/accounting/bank/import/route.ts'];
const TS = TS_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
// نسخة مجرّدة من التعليقات والنصوص لفحوص الغياب الدلالية
const TS_EXEC = TS
  .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
const CONN = readFileSync('src/lib/accounting/bank/connector.ts', 'utf8');
const ROUTE = readFileSync('src/app/api/accounting/bank/import/route.ts', 'utf8');

console.log('\n═══ BANK-T-001..008 — متطلبات الـBlueprint الملزمة ═══');
const T18 = {
  '001': ['العقد الكامل BANK-003 (تغطية وتوكيد إلزاميان)', () =>
    ['identify_account', 'fetch_transactions', 'transaction_fingerprint', 'coverage_range',
     'balance_assertion', 'freshness', 'capability_flags'].every((m) => CONN.includes(m))
    && CODE.includes('period_start') && CODE.includes('opening_balance_minor')],
  '002': ['استيراد الكشف قناة أساسية (BANK-001) لا بديلًا مؤقتًا', () =>
    MIG.includes('BANK-001') && !/open_banking|openbanking/i.test(CODE)],
  '003': ['النموذج الموحَّد معزول عن الصيغة (BANK-004)', () =>
    !/format_family|csv|xlsx|mt940|camt|ofx|qif|pdf/i.test(
      CODE.match(/create table if not exists public\.acc_bank_transactions[\s\S]*?\);/)[0])],
  '004': ['التخطيطات تهيئة بيانات — إضافة بنك بلا إصدار (BANK-005)', () =>
    CODE.includes('acc_add_bank_layout') && CODE.includes('acc_validate_bank_layout_spec')
    && !/NBK|KFH|Boubyan|Burgan|Gulf Bank|Warba/i.test(TS + CODE)],
  '005': ['بصمة مركّبة صارمة لا hash صف خام (BANK-006)', () =>
    CODE.includes("v_row.bank_account_id::text || '|' || v_vd::text || '|' || (r->>'amount_minor') || '|' ||")
    && CODE.includes("(r->>'description_canon')")],
  '006': ['التداخل يُكشف والمقارنة محصورة في نطاقه', () =>
    CODE.includes('IMPORT_OVERLAP_DETECTED')
    && (CODE.match(/pa\.period_start <= v_row\.period_end and pa\.period_end >= v_row\.period_start/g) || []).length >= 3],
  '007': ['الغامض SUSPECTED_DUPLICATE ولا يُسقط أبدًا (BANK-007)', () =>
    CODE.includes("'SUSPECTED_DUPLICATE'") && !/delete from public\.acc_bank_duplicate/.test(CODE)],
  '008': ['النزاهة تحجب: opening + Σ = closing وإلا FILE_INTEGRITY (BANK-008)', () =>
    CODE.includes('p_opening_minor + v_sum <> p_closing_minor')
    && CODE.includes("'FILE_INTEGRITY'")
    && /blocking import conditions must be resolved/.test(CODE)],
};
for (const [id, [name, fn]] of Object.entries(T18)) check(`BANK-T-${id}: ${name}`, fn());

console.log('═══ BANK-T-009..025 — توسعات قبول تنفيذية (ليست نص Blueprint) ═══');
const T925 = {
  '009': ['نفس الملف idempotent (unique على بصمة المحتوى الخادمية)', () =>
    CODE.includes('unique (company_id, bank_account_id, file_sha256)')
    && CODE.includes("'IDEMPOTENT_DUPLICATE'")],
  '010': ['اسم الملف لا يشارك في الهوية إطلاقًا', () =>
    !/filename|original_name/.test(CODE.match(/create table if not exists public\.acc_bank_imports[\s\S]*?\);/)[0])],
  '011': ['بصمة المحتوى لقطة content_sha256 الخادمية — لا بصمة منافسة ولا عميل', () =>
    CODE.includes('v_doc.content_sha256') && !/p_file_sha|client_sha/.test(CODE)],
  '012': ['المال bigint وحدات صغرى بدقة العملة — لا float', () =>
    /amount_minor\s+bigint not null/.test(CODE) && !/numeric\(\d+,\s*\d+\)\s+not null/.test(
      CODE.match(/create table if not exists public\.acc_bank_transactions[\s\S]*?\);/)[0])
    && TS.includes('bigint') && !/parseFloat|Number\(.*amount/i.test(TS)],
  '013': ['لا تحويل لعملة الأساس عند الابتلاع (كشف البنك بعملته مصدرًا)', () =>
    !/base_amount|base_currency|fx_rate/.test(CODE.match(/create table if not exists public\.acc_bank_transactions[\s\S]*?\);/)[0])
    && !/exchange|convert/i.test(ROUTE)],
  '014': ['عزل المستأجر: company_id إلزامي + RLS على الستة', () =>
    (CODE.match(/company_id\s+uuid not null references public\.acc_companies\(id\)/g) || []).length >= 5
    && (CODE.match(/enable row level security/g) || []).length === 6],
  '015': ['مصفوفة الأدوار: القبول OWNER/ACCOUNTANT؛ FM يجهّز؛ لا EMPLOYEE/READ_ONLY في سياسات البنك', () => {
    const pol = (CODE.match(/create policy acc_bank_[\s\S]*?;/g) || []).join('\n');
    return /acceptance requires BUSINESS_OWNER or ACCOUNTANT/.test(CODE)
      && pol.length > 0 && !/EMPLOYEE|READ_ONLY/.test(pol); }],
  '016': ['مناعة المقبول: حالة/حركات/جولة مجمّدة بعد ACCEPTED', () =>
    CODE.includes('frozen source evidence') && CODE.includes('never edited')
    && CODE.includes('immutable evidence')],
  '017': ['دليل الكشف المقبول: لا فكّ ولا حذف (امتداد حرّاس Stage 8)', () =>
    CODE.includes('accepted bank import can never be unlinked')
    && CODE.includes("'BLOCKED_ACCEPTED_IMPORT'")
    && CODE.includes("'DOCUMENT_DELETE_BLOCKED_ACCEPTED_IMPORT'")],
  '018': ['إعادة المحاولة على نفس الجولة موقّعة ومعدودة ومدقَّقة', () =>
    CODE.includes('acc_begin_bank_parse') && CODE.includes("'BANK_IMPORT_RETRIED'")
    && CODE.includes('attempt counter only increases')],
  '019': ['سلالة supersede لجولة بديلة بعد فشل النزاهة', () =>
    CODE.includes('supersedes_import_id') && CODE.includes("'BANK_IMPORT_SUPERSEDED'")],
  '020': ['صفر قيود دفترية: لا ترحيل ولا كتابة قيود/مصادر (قراءات حماية الدليل فقط)', () =>
    !/acc_post_journal/.test(CODE + TS)
    && !/insert into public\.acc_journal|update public\.acc_journal|insert into public\.acc_sources/.test(CODE)
    && !/journal/i.test(TS_EXEC)],
  '021': ['لا محرك مطابقة مرحلة 10 (معرفات المطابقة/التسوية/الثقة غائبة)', () =>
    !/auto_match|match_type|match_state|reconcil|confidence_score/i.test(CODE)
    && !/auto_match|matchType|reconcil|confidenceScore/i.test(TS_EXEC)],
  '022': ['لا AI مرحلة 13 في الكود التنفيذي (والصوري مؤجَّل بشرط صريح)', () =>
    !/openai|anthropic|gemini|gpt-|claude-|embedding|llm/i.test(TS_EXEC)
    && !/openai|anthropic|gemini|gpt-|claude-|embedding|llm/i.test(CODE)
    && TS.includes("deferred_to: 'STAGE_13'")],
  '023': ['value_date/الرصيد الغائبان لا يصنعان EXACT مضعّفًا', () =>
    CODE.includes('if v_vd is not null and v_bal is not null then')
    && /else\s+v_fp := null;/.test(CODE)],
  '024': ['التخطيط العام محكوم: لا إنشاء/تفعيل من مستأجر', () =>
    CODE.includes('tenants create company layouts only')
    && CODE.includes('never tenant-activated')],
  '025': ['مواصفة التخطيط محدودة في القاعدة أيضًا (رفض المجهول/التنفيذي)', () =>
    CODE.includes('acc_validate_bank_layout_spec(spec, format_family)')
    && CODE.includes("if k not in ('header','columns','amount_semantics','drcr_flag','date_format',")],
};
for (const [id, [name, fn]] of Object.entries(T925)) check(`BANK-T-${id}: ${name}`, fn());

console.log('═══ التصحيحات الإلزامية المعتمدة ═══');
check('CORRECTION 1: مصدر ربط دفتري واحد — لا FK دفتري على حساب البنك',
  !/gl_account/.test(CODE.match(/create table if not exists public\.acc_bank_accounts[\s\S]*?\);/)[0])
  && CODE.includes("'BANK_ACCOUNT'"));
check('CORRECTION 2: استنتاجات التكرار جدول مشتق append-only منفصل',
  CODE.includes('acc_bank_duplicate_candidates')
  && CODE.includes('append-only derived evidence')
  && !/dedup_state|duplicate_of/.test(CODE.match(/create table if not exists public\.acc_bank_transactions[\s\S]*?\);/)[0]));
check('CORRECTION 3: التداخل وحده لا يجعل الجديد مشبوهًا (مرساة + قواعد)',
  CODE.includes("'ANCHOR_MATCH_DESCRIPTION_DIFFERS'")
  && CODE.includes("'NO_BALANCE_DETERMINISTIC_EVIDENCE'")
  && CODE.includes('a.description_canon <> n.description_canon'));
check('CORRECTION 4: لا استبدال txn_date عن value_date',
  !/value_date.*coalesce.*txn_date|txn_date.*as.*value_date/.test(CODE)
  && TS.includes('valueDate: null'));
check('CORRECTION 5: مصدر التوكيد صريح/مشتق بحقائق اشتقاق محفوظة',
  CODE.includes("'EXPLICIT_SOURCE','DERIVED_FROM_RUNNING_BALANCE'")
  && CODE.includes('assertion_derivation')
  && TS.includes('DERIVED_FROM_RUNNING_BALANCE'));
check('CORRECTION 6: توسعة كاملة لروابط Stage 8 (check/حارس/حذف) في هجرة 9 فقط',
  CODE.includes("'EXPENSE','JOURNAL_ENTRY','INVOICE','PAYMENT','BANK_IMPORT'")
  && CODE.includes("new.target_kind = 'BANK_IMPORT'")
  && execSync('git diff 3b146ef -- supabase/2026-08-29-accounting-expenses-documents.sql supabase/2026-08-30-accounting-expenses-documents-ambiguity.sql', { encoding: 'utf8' }).trim() === '');
check('CORRECTION 7: تفرّد النسخ بفهرس جزئي يحسم NULL',
  CODE.includes("coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), layout_key, version"));
check('CORRECTION 8: لا variable_conflict ولا eval/Function ولا تحميل ديناميكي',
  !/variable_conflict/.test(CODE) && !/\beval\(|new Function|require\(\s*[^'"\s]/.test(TS));
check('CORRECTION 9: حالة الجولة منفصلة عن الشروط + حاجب/غير حاجب صريح',
  CODE.includes('acc_bank_import_events') && CODE.includes('blocking    boolean not null')
  && /COVERAGE_GAP', false/.test(CODE) && /'FILE_INTEGRITY', true|v_fail, true/.test(CODE));

console.log('═══ الأمن والحوكمة ═══');
check('لا IBAN كامل يُخزَّن: قناع + بصمة فقط، والمعرّف يمر عابرًا',
  CODE.includes('account_fingerprint') && CODE.includes('account_masked')
  && !/account_identifier\s+text/.test(CODE.match(/create table if not exists public\.acc_bank_accounts[\s\S]*?\);/)[0]));
check('service حصر الآلية + p_actor إنسان يتحقق دوره بالاسم',
  CODE.includes('acc_bank_assert_actor')
  && (CODE.match(/grant  execute on function public\.acc_\w+\([^;]*\) to service_role/g) || []).length >= 6);
check('القبول فعل بشري auth.uid() — لا service ولا AI',
  /acc_accept_bank_import[\s\S]*?acceptance is a human act/.test(CODE));
check('null-safe في كل بوابة (coalesce)', !/if\s+public\.acc_role\(/.test(CODE));
check('search_path مثبَّت لكل definer',
  (CODE.match(/security definer set search_path to 'public'/g) || []).length
  === (CODE.match(/security definer/g) || []).length);
check('REVOKE يشمل public دائمًا',
  (CODE.match(/revoke execute on function[^;]+from public/g) || []).length
  === (CODE.match(/revoke execute on function/g) || []).length);
check('أسماء دوال فريدة — لا overload', (() => {
  const names = [...CODE.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]);
  return new Set(names).size === names.length;
})());
check('هجرات 1..8 لم تُمسّ',
  execSync('git diff 3b146ef -- supabase/2026-08-2*-accounting-*.sql supabase/2026-08-30-accounting-expenses-documents-ambiguity.sql', { encoding: 'utf8' }).trim() === '');
check('BLK-011 مفتوح + REG-KW-013 محترم (لا bank feed)',
  MIG.includes('BLK-011') && !/bank_feed|webhook.*bank/i.test(TS));
check('قرار الإغلاق مسجَّل نصًا (الصوري مؤجَّل للمرحلة 13)',
  readFileSync('scripts/accounting/test-bank-import.mjs', 'utf8').includes('مؤجَّل عمدًا للمرحلة 13'));

console.log(`\n  عقود استيراد البنك: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
