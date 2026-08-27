#!/usr/bin/env node
/**
 * Stage 10 — عقود المطابقة الساكنة + خريطة REC-T-001..025.
 *
 * REC-T-001..004: متطلبات الـBlueprint الملزمة مباشرة (REC-001..004).
 * REC-T-005..025: **توسعات قبول تنفيذية مقترحة** لإثبات DoD — ليست نص
 * Blueprint حرفيًا. الشق السلوكي في test-recon-engine.mjs (محلي)
 * وtest-recon-db.mjs (Staging).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync('supabase/2026-09-01-accounting-reconciliation.sql', 'utf8');
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
const TS_FILES = [...walk('src/lib/accounting/recon'), 'src/app/api/accounting/recon/run/route.ts'];
const TS = TS_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
const TS_EXEC = TS
  .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');

console.log('\n═══ REC-T-001..004 — متطلبات الـBlueprint الملزمة ═══');
const T14 = {
  '001': ['المرجع الحتمي لا تُخفّضه العوامل الأضعف (تخطٍّ صريح)', () =>
    CODE.includes('deterministic_override') && TS.includes('deterministicOverride')
    && CODE.includes('or deterministic_override or matched_factors >= 2')
    && TS.includes('REC-001')],
  '002': ['المبلغ وحده لا يؤكد آليًا أبدًا (بنيويًا)', () =>
    CODE.includes('amount alone never auto-confirms')
    && TS.includes("reason: 'AMOUNT_ONLY'")
    && /matchedCount < 2/.test(TS)],
  '003': ['العتبات تهيئة منسوخة مدقَّقة — لا 95/80/55 مرمّزة قانونًا', () =>
    CODE.includes('acc_recon_settings') && CODE.includes('settings_version')
    && !/9500|8000|5500/.test(CODE)   /* لا قيم مرمّزة في الهجرة */
    && CODE.includes("'RECON_CONFIG_ACTIVATED'")],
  '004': ['المطابقة لا تغيّر مبلغًا أبدًا — تأكيد فقط', () =>
    !/update public\.acc_bank_transactions|update public\.acc_payments|update public\.acc_settlements|update public\.acc_invoices|update public\.acc_expenses|update public\.acc_journal/.test(CODE)
    && CODE.includes('allocation never') === false /* التعليق ليس الدليل */
    || true],
};
// REC-T-004 يحتاج فحصًا حقيقيًا: لا UPDATE على أي جدول مصدر في الهجرة كلها
T14['004'] = ['المطابقة لا تغيّر مبلغًا أبدًا (صفر UPDATE على المصادر)', () =>
  !/update\s+public\.acc_(bank_transactions|bank_imports|payments|settlements|settlement_lines|invoices|refunds|expenses|expense_lines|journal_entries|journal_lines)\b/.test(CODE)
  && !/insert\s+into\s+public\.acc_(journal_entries|journal_lines|sources)\b/.test(CODE)];
for (const [id, [name, fn]] of Object.entries(T14)) check(`REC-T-${id}: ${name}`, fn());

console.log('═══ REC-T-005..025 — توسعات قبول تنفيذية (ليست نص Blueprint) ═══');
const T525 = {
  '005': ['score_bp أساس ثابت 10000 + coverage_bp — لا إعادة معايرة (C1)', () =>
    CODE.includes('score_bp') && CODE.includes('coverage_bp')
    && !/\/\s*Σ|available_weights|coverage_bp\s*\)/.test(TS_EXEC.match(/scoreBp = [^;]+;/)?.[0] ?? '')
    && TS.includes('reduce((a, f) => a + f.contribution_bp, 0)')],
  '006': ['الغائب لا يضخّم: مساهمة العامل غير المتاح صفر', () =>
    TS.includes('available && matched ? weight : 0')
    && CODE.includes('check (contribution_bp = 0 or matched is true)')],
  '007': ['اتجاه النقد أول (C2): معاكس المبلغ المتساوي مرفوض', () =>
    CODE.includes('opposite cash direction') && TS.includes('directionCompatible')
    && CODE.includes("expected_direction in ('INFLOW','OUTFLOW')")],
  '008': ['المحلّل القانوني الواحد لكل الأنواع (C3)', () =>
    CODE.includes('acc_recon_resolve_target')
    && (CODE.match(/from public\.acc_recon_resolve_target/g) || []).length >= 3],
  '009': ['تسوية كاملة واحدة = ONE_TO_ONE (لا MANY لمجرد الأبناء)', () =>
    TS.includes("matchType: 'ONE_TO_ONE'") && MIG.includes('ONE_TO_ONE  = بنك واحد ↔ هدف واحد')],
  '010': ['المتبقي الموثوق للفاتورة من حقائق Stage 6 — لا إجمالي أعمى', () =>
    CODE.includes('NO_OUTSTANDING_AMOUNT') && CODE.includes('NO_TRUSTWORTHY_TOTAL')
    && /v\.total_minor, 0\) - v_sum/.test(CODE)],
  '011': ['المصروف مستبعد من أهداف النقد (لا AP مخترعًا)', () =>
    !/EXPENSE/.test(CODE.match(/target_kind\s+text not null check \(target_kind in[\s\S]*?\)\)/)[0])
    && CODE.includes('KIND_NOT_CASH_ELIGIBLE')],
  '012': ['هدف القيد بسطر حساب البنك المعيَّن لا مجموع المدين', () =>
    CODE.includes("gl.purpose = 'BANK_ACCOUNT'")
    && CODE.includes('NO_BANK_ACCOUNT_MAPPING')
    && CODE.includes('jl.account_id = v_acct')],
  '013': ['العلاقة تُشتق من عدّ الأطراف وتُرفض دعوى مخالفة (C4)', () =>
    CODE.includes('cardinality mismatch') && CODE.includes('count(distinct')
    && CODE.includes('MANY_TO_MANY requires both sides > 1')],
  '014': ['MANY_TO_MANY لا AUTO أبدًا (قيد + دالة)', () =>
    CODE.includes("check (match_type <> 'MANY_TO_MANY' or mode <> 'AUTO')")
    && CODE.includes('MANY_TO_MANY is never AUTO')],
  '015': ['FEE/FX تصنيف واقتراح فقط — FX بلا تخصيص رقمي عبر العملات', () =>
    CODE.includes('FX_DIFFERENCE is a review-only assertion')
    && TS.includes("differenceReason: 'POSSIBLE_FEE'")
    && TS.includes('FX_DIFFERENCE_REVIEW')],
  '016': ['DATE_DIFFERENCE بنافذة اللقطة وبدليل تاريخ صريح', () =>
    TS.includes("'DATE_WINDOW'") && TS.includes('dateWindowDays')
    && CODE.includes('date_window_days')],
  '017': ['UNMATCHED مسار حدث دائم لا صف تأكيد', () =>
    CODE.includes("'UNMATCHED_BANK_TRANSACTION'")
    && !/UNMATCHED/.test(CODE.match(/state\s+text not null check \(state in[\s\S]*?\)\)/)[0])],
  '018': ['حسم مشتبهي Stage 9 سجل دائم append-once (C5)', () =>
    CODE.includes('acc_recon_duplicate_resolutions')
    && CODE.includes('unique (candidate_id)')
    && CODE.includes('EXACT_DUPLICATE is a final deterministic Stage 9 conclusion')],
  '019': ['التخصيصات مجمّدة للأبد والعكس حالة لا تعديل (C6)', () =>
    CODE.includes('acc_recon_alloc_frozen_trg') && !/released/.test(CODE)
    && CODE.includes("r2.state in ('CONFIRMED','LOCKED')")],
  '020': ['منع الاستهلاك المزدوج: أقفال مرتبة + فحص سعة عند التأكيد', () =>
    CODE.includes('pg_advisory_xact_lock') && CODE.includes('double consumption blocked')],
  '021': ['العكس بموافقة والموافق غير الطالب (قيد + دالة)', () =>
    CODE.includes('decided_by <> requested_by')
    && CODE.includes('the approver must differ from the requester')
    && CODE.includes('LOCKED leaves only through an approved reversal')],
  '022': ['نافذة التاريخ اختيار بشري صريح قبل التفعيل (C7)', () =>
    CODE.includes('date_window_days must be explicitly chosen before activation')],
  '023': ['MANUALLY_MATCHED حالة مرئية ثم تأكيد فعل مستقل', () =>
    CODE.includes("'MANUALLY_MATCHED'")
    && CODE.includes("(old.state = 'MANUALLY_MATCHED' and new.state in ('CONFIRMED','REJECTED'))")],
  '024': ['الفترات: CLOSED/ARCHIVED تحجب التأكيد؛ SOFT_CLOSED تحجب القفل', () =>
    CODE.includes('CLOSED_PERIOD_CONFLICT')
    && CODE.includes("v_pstate in ('SOFT_CLOSED','CLOSED','ARCHIVED')")],
};
T525['025'] = ['صفر AI/مرحلة 11 + الأدوار المعتمدة + العزل', () =>
  !/openai|anthropic|gemini|gpt-|claude-|embedding|llm/i.test(TS_EXEC)
  && !/inbox|notification|one_tap/i.test(TS_EXEC)
  && CODE.includes("locking is the ACCOUNTANT''s act")
  && CODE.includes("reversal approval is the ACCOUNTANT''s act")
  && !/BUSINESS_OWNER/.test((CODE.match(/create policy acc_recon[\s\S]*?;/g) || []).join(''))
  && (CODE.match(/coalesce\(public\.acc_role\(company_id\), ''\)/g) || []).length >= 8];
for (const [id, [name, fn]] of Object.entries(T525)) check(`REC-T-${id}: ${name}`, fn());

console.log('═══ عقود بنيوية إضافية ═══');
check('البذور ليست في الهجرة: الإدراج الوحيد داخل دالة المحاسبة المحكومة',
  (CODE.match(/insert into public\.acc_recon_settings/g) || []).length === 1
  && CODE.indexOf('insert into public.acc_recon_settings')
     > CODE.indexOf('create function public.acc_recon_add_settings'));
check('SYSTEM provenance للآلي والإنسان المُطلِق محفوظ على الجولة',
  CODE.includes("created_source in ('SYSTEM','HUMAN')") && CODE.includes('initiated_by'));
check('مسار المحرك service-only واليدوي إنسان مطابق',
  CODE.includes('the engine path is service-only') && CODE.includes('manual matching is a human act'));
check('لا حدث-ثم-raise في نفس النداء (درس Stage 7)',
  !/insert into public\.acc_recon_events[\s\S]{0,400}raise exception/.test(CODE));
check('search_path مثبَّت لكل definer',
  (CODE.match(/security definer set search_path to 'public'/g) || []).length
  === (CODE.match(/security definer/g) || []).length);
check('REVOKE يشمل public دائمًا وأسماء الدوال فريدة',
  (CODE.match(/revoke execute on function[^;]+from public/g) || []).length
  === (CODE.match(/revoke execute on function/g) || []).length
  && (() => { const n = [...CODE.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]);
        return new Set(n).size === n.length; })());
check('الإسقاط المشتق security_invoker — لا التفاف RLS عبر الview',
  CODE.includes('security_invoker = true'));
check('هجرات 1..9 لم تُمسّ',
  execSync('git diff 4d11eba -- supabase/2026-08-2*-accounting-*.sql supabase/2026-08-3*-accounting-*.sql',
    { encoding: 'utf8' }).trim() === '');
check('حدود المحرك معلَّمة ENGINEERING SAFETY LIMITS لا سياسة',
  readFileSync('src/lib/accounting/recon/limits.ts', 'utf8').includes('ENGINEERING SAFETY LIMITS'));

console.log(`\n  عقود المطابقة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
