#!/usr/bin/env node
/**
 * Stage 8 — عقود المصروفات الساكنة + خريطة ACC-T-041..055 (الشق المحلي).
 *
 * ACC-T-041..055: نطاق الاختبارات الملزم من الـBlueprint لموديول
 * ACC-EXP؛ **الوصف الفردي لكل معرف هنا هو التوسعة التنفيذية المعتمدة
 * للمتطلبات الملزمة — لا نص Blueprint حرفي لكل معرف**. الشق السلوكي
 * في test-expenses-db.mjs (Staging).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { toMinor } from '../../src/lib/accounting/myfatoorah/money.ts';

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync('supabase/2026-08-29-accounting-expenses-documents.sql', 'utf8');
const CODE = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

console.log('\n═══ آلة الحالات ═══');
check('الحالات الثماني كما اعتُمدت',
  ['DRAFT','SUBMITTED','NEEDS_REVIEW','REJECTED','APPROVED','READY_TO_POST','POSTED','VOIDED']
    .every((s) => CODE.includes(`'${s}'`)));
check('انتقالات مسموحة حصرًا + توقيع acc.expense_op لكل تغيير حالة',
  CODE.includes('forbidden expense transition') && CODE.includes("current_setting('acc.expense_op', true)"));
check('لا حذف بعد DRAFT — VOIDED تاريخ محفوظ',
  CODE.includes('an expense past DRAFT is history'));
check('حقائق مجمّدة من SUBMITTED وPOSTED نهائي',
  CODE.includes('expense facts freeze at SUBMITTED') && CODE.includes('a posted expense is immutable'));
check('REJECTED→DRAFT عملية صريحة مدقَّقة (acc_rework_expense)',
  CODE.includes('acc_rework_expense'));
check('void يتعامل مع قيد DRAFT مجهَّز (DISCARDED) ولا يمس POSTED',
  /acc_void_expense[\s\S]*?DISCARDED/.test(CODE) && CODE.includes('a posted expense is never voided'));

console.log('═══ المصدر الإلزامي ═══');
check('source_kind NOT NULL دائمًا', /source_kind\s+text not null check/.test(CODE));
check('الإرسال: مستند FINALIZED مصدرًا أو يدوي بتبرير كتابي',
  CODE.includes('FINALIZED linked source document') && CODE.includes('manual is not source-less'));

console.log('═══ الاعتماد (BLOCKER 2 المعتمد) ═══');
check('حدّ بعملة الأساس (approval_limit_base_minor) — لا مبلغ مرمّز',
  CODE.includes('approval_limit_base_minor') && !/\b500000\b|\b100000\b(?![\s\S]{0,40}check)/.test(
    CODE.match(/create table if not exists public\.acc_expense_settings[\s\S]*?\);/)[0]));
check('المقارنة على الأساس التاريخي المحفوظ (sum(base_amount_minor))',
  /sum\(base_amount_minor\) into v_total/.test(CODE));
check('لقطة القرار: الحدّ وعملة الأساس والمبلغ المُختبَر',
  CODE.includes('limit_base_minor') && CODE.includes('tested_base_amount_minor')
  && /base_currency\s+char\(3\) not null/.test(CODE));
check('غياب الحدّ = المدير لا يعتمد نهائيًا؛ تصعيد للمالكة',
  CODE.includes("'OWNER_APPROVAL_REQUIRED'"));
check('لا أحد يعتمد إرساله — والمالكة تصديق ذاتي موثَّق صراحة',
  CODE.includes('no one approves their own submission') && CODE.includes('self_attested'));
check('سجل الموافقات append-only مجمّد',
  CODE.includes('acc_expense_approvals are append-only'));
check('الموافقة ≠ ترحيل: approve لا يلمس قيودًا',
  !/acc_approve_expense[\s\S]*?acc_journal_entries/.test(
    CODE.slice(CODE.indexOf('acc_approve_expense'), CODE.indexOf('acc_reject_expense'))));

console.log('═══ التصنيف والربط المعتمد (CORRECTION 4) ═══');
check("الأغراض الجديدة EXPENSE_ACCOUNT/EXPENSE_PAYABLE بقيد Stage 8 فقط",
  CODE.includes("'EXPENSE_ACCOUNT','EXPENSE_PAYABLE'")
  && CODE.includes('drop constraint if exists acc_gl_links_purpose_chk'));
check('scope_key = مفتاح الفئة الثابت — لا غرض ديناميكي',
  CODE.includes("purpose = 'EXPENSE_ACCOUNT'") && CODE.includes('category_key')
  && !/purpose\s*=\s*'EXPENSE_CATEGORY:/.test(CODE));
check('الغياب فشل مغلق AUTHORITATIVE_MAPPING_REQUIRED — لا حساب مخترع',
  CODE.includes("'AUTHORITATIVE_MAPPING_REQUIRED:"));
check('السياسة من السجل عبر acc_resolve_policy — غير APPROVED = provisional',
  CODE.includes('acc_resolve_policy') && CODE.includes("'POLICY_NOT_APPROVED'"));
check('محركات accrual/prepaid/capitalise مؤجلة: المعالجة غير الفورية provisional لا POSTABLE',
  CODE.includes("'TREATMENT_ENGINE_DEFERRED'") && CODE.includes("'IMMEDIATE_EXPENSE'"));
check('التصنيف فعل المحاسبة حصرًا', CODE.includes("accounting classification is the ACCOUNTANT''s act"));

console.log('═══ الترحيل عبر Stage 3 حصرًا ═══');
check('التحضير ينشئ DRAFT عبر acc_sources kind EXPENSE + acc_journal_entries',
  CODE.includes("'EXPENSE', p_expense::text") && /acc_prepare_expense_journal[\s\S]*?insert into public\.acc_journal_entries/.test(CODE));
check('صفر acc_post_journal في Stage 8 (لا بوابة ترحيل ثانية)',
  !/acc_post_journal/.test(CODE));
check('POSTED فقط بعد قيد POSTED فعليًا (شهادة تتحقق مصدرًا وشركة ومجاميع)',
  CODE.includes('only after its journal is POSTED')
  && CODE.includes('journal company mismatch')
  && CODE.includes("does not originate from this expense''s source")
  && CODE.includes('do not correspond to expense base total'));
check('عكس لاحق لا يعيد المصروف DRAFT — تصحيح موصول (corrected_by_entry_id)',
  CODE.includes('corrected_by_entry_id') && CODE.includes("'EXPENSE_CORRECTION_REQUIRED'"));

console.log('═══ التكرار (CORRECTION 5) ═══');
check('idempotency الإرسال: unique (company_id, submission_key) لا مرجع المورد',
  CODE.includes('unique (company_id, submission_key)')
  && !/unique\s*\(company_id,\s*vendor_id,\s*vendor_reference\)/.test(CODE));
check('مرجع المورد دليل قوي → مراجعة/تعارض، لا قيد فريد صلب',
  CODE.includes("'VENDOR_REFERENCE_DUPLICATE'"));
check('التشابه الغامض (مورد+تاريخ+مبلغ) → مراجعة بشرية',
  CODE.includes("'SUSPECTED_DUPLICATE'"));
check('نفس دليل المصدر في مصروف نشط آخر → مراجعة (لا أثر ثانٍ صامت)',
  CODE.includes("'SOURCE_ALREADY_USED'"));
check('لا إسقاط صامت لأي سجل', CODE.includes("'EXPENSE_DUPLICATE_SUSPECTED'"));

console.log('═══ الغموض شخصي/تجاري ═══');
check('NEEDS_REVIEW حالة صريحة والإنسان يحسم بقرار مسبَّب',
  CODE.includes("'PERSONAL_BUSINESS_AMBIGUITY'") && CODE.includes('acc_resolve_expense_review')
  && CODE.includes('a written review decision reason is required'));

console.log('═══ المال/الصرف والضريبة ═══');
check('عقد FX التاريخي مطابق لأسطر القيود (زوجا CHECK)',
  (CODE.match(/currency <> base_currency\s*or \(base_amount_minor = amount_minor and fx_rate is null/g) || []).length >= 1
  && (CODE.match(/currency = base_currency\s*or \(fx_rate is not null and fx_rate > 0/g) || []).length >= 1);
check('tax_status إلزامي FK وtax_rate للحالتين الحاملتين فقط',
  /tax_status\s+text not null references public\.acc_tax_statuses/.test(CODE)
  && CODE.includes("tax_rate is null or tax_status in ('TAXABLE','ZERO_RATED')"));
check('bigint وحدات صغرى — لا numeric مبالغ ولا float',
  /amount_minor\s+bigint not null check \(amount_minor > 0\)/.test(CODE)
  && !/amount\s+numeric/.test(CODE));

console.log('═══ خريطة ACC-T-041..055 (توسعة تنفيذية معتمدة — الشق المحلي) ═══');
const MFT = {
  '041': ['KWD بثلاث منازل بدقة تامة', () => toMinor('12.345', 'KWD') === 12345n],
  '042': ['USD بمنزلتين + أساس تاريخي محفوظ (عقد CHECK)', () =>
    toMinor('100.00', 'USD') === 10000n && CODE.includes('fx_rate_source')],
  '043': ['JPY صفر منازل', () => toMinor('5000', 'JPY') === 5000n],
  '044': ['الدقة الزائدة مرفوضة لا مقرّبة', () => {
    try { toMinor('1.2345', 'KWD'); return false; } catch { return true; } }],
  '045': ['tax_status إلزامي على كل سطر', () =>
    /tax_status\s+text not null references/.test(CODE)],
  '046': ['الكويت NO_TAX_REGIME عبر السجل — ليست صفر٪', () =>
    readFileSync('supabase/2026-08-27-accounting-registers.sql', 'utf8').includes('REG-KW-008')
    && !CODE.includes('ZERO_RATED\'::') && !/vat_rate/.test(CODE)],
  '047': ['بلا مصدر لا إرسال ولا أثر', () =>
    CODE.includes('FINALIZED linked source document') && CODE.includes('manual is not source-less')],
  '048': ['الموظفة لا تعتمد/ترحّل إرسالها', () =>
    CODE.includes('no one approves their own submission')
    && /expense approval requires FINANCE_MANAGER or BUSINESS_OWNER/.test(CODE)],
  '049': ['اعتماد المدير ضمن حدّ مضبوط، بلا سلطة قيود', () =>
    CODE.includes('approval_limit_base_minor') && CODE.includes('approval is not posting')],
  '050': ['فوق الحدّ اعتماد أعلى (المالكة)', () => CODE.includes("'OWNER_APPROVAL_REQUIRED'")],
  '051': ['المدقّق قراءة فقط (لا سياسة كتابة ولا دور في الدوال)', () =>
    !/AUDITOR[^\n]*approve/.test(CODE) && !/'AUDITOR'[^\n]*(insert|update|delete)/i.test(CODE)],
  '052': ['الغموض = NEEDS_REVIEW بلا أثر آلي', () => CODE.includes("'PERSONAL_BUSINESS_AMBIGUITY'")],
  '053': ['غياب السياسة/الربط = فشل مغلق provisional', () =>
    CODE.includes("'AUTHORITATIVE_MAPPING_REQUIRED:") && CODE.includes("'POLICY_NOT_APPROVED'")],
  '054': ['حقائق POSTED مجمّدة والتصحيح عكسًا', () =>
    CODE.includes('a posted expense is immutable') && CODE.includes('corrected_by_entry_id')],
  '055': ['تكرار فاتورة المورد: حتمي محسوم وغامض للمراجعة', () =>
    CODE.includes("'VENDOR_REFERENCE_DUPLICATE'") && CODE.includes("'SUSPECTED_DUPLICATE'")],
};
for (const [id, [name, fn]] of Object.entries(MFT)) check(`ACC-T-${id}: ${name}`, fn());

console.log('═══ SECURITY DEFINER والعقود العالمية ═══');
check('كل دالة definer بمسار مثبَّت',
  (CODE.match(/security definer set search_path to 'public'/g) || []).length
  === (CODE.match(/security definer/g) || []).length);
check('null-safe: كل بوابة دور coalesce (لا acc_role عارية في if)',
  !/if\s+public\.acc_role\(/.test(CODE) && !/:=\s*public\.acc_role\(/.test(CODE.replace(/coalesce\(public\.acc_role/g, 'SAFE')));
check('REVOKE/GRANT صريحان لكل دالة',
  (CODE.match(/revoke execute on function/g) || []).length >= 20
  && (CODE.match(/grant  execute on function/g) || []).length >= 20);
check('لا PUBLIC execute مسرّب (كل revoke يشمل public)',
  (CODE.match(/revoke execute on function[^;]+from public/g) || []).length
  === (CODE.match(/revoke execute on function/g) || []).length);
check('أسماء فريدة — لا overload (كل دالة تعريف واحد)', (() => {
  const names = [...CODE.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]);
  return new Set(names).size === names.length;
})());
check('acc_role_of الوحيدة STABLE ولا تكتب', (() => {
  const stables = [...CODE.matchAll(/function public\.(\w+)[\s\S]{0,400}?stable/g)].map((m) => m[1]);
  return stables.length === 1 && stables[0] === 'acc_role_of';
})());
check('هجرات Stage 1..7 لم تُمسّ', (() => {
  return execSync('git diff 60e8164 -- supabase/2026-08-27-accounting-foundation.sql supabase/2026-08-27-accounting-registers.sql supabase/2026-08-27-accounting-ledger.sql supabase/2026-08-27-accounting-commercial-documents.sql supabase/2026-08-27-accounting-revenue.sql supabase/2026-08-27-accounting-payments-clearing.sql supabase/2026-08-27-accounting-myfatoorah.sql supabase/2026-08-28-accounting-myfatoorah-conflict-persistence.sql',
    { encoding: 'utf8' }).trim() === '';
})());

console.log(`\n  عقود المصروفات: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
