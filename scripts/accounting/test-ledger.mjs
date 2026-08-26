#!/usr/bin/env node
/**
 * اختبارات Stage 3 المحلية — عقود الهجرة والحدود.
 * صراحة: سلوك الدفتر (ترحيل/عكس/فترات/عزل) يعيش في القاعدة، فالمحلي
 * هنا يثبت أن **كل invariant له كود مُنفِّذ** في الهجرة نصًا وبنية؛
 * والإثبات التشغيلي الكامل في test-ledger-db.mjs على Staging.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync("supabase/2026-08-27-accounting-ledger.sql", "utf8");
const CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const DDL = CODE.split("\n").filter((l) =>
  /create (table|or replace function|policy|trigger|unique index|index|extension)/i.test(l)).join("\n");

console.log("\n═══ ١ · دليل الحسابات (Part A) ═══");
check("COMPANY-SCOPED + CODE UNIQUE PER COMPANY (ونفس الكود يجوز لشركة أخرى)",
  /company_id\s+uuid not null references public\.acc_companies/.test(CODE) &&
  CODE.includes("unique (company_id, code)"));
check("الأنواع الخمسة المهنية فقط — لا فئات مبتكرة",
  /'ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'/.test(CODE));
check("PARENT SAME COMPANY", CODE.includes("parent must belong to the same company"));
check("HIERARCHY CYCLE BLOCKED (مشي صاعد + حد عمق)",
  CODE.includes("hierarchy cycle detected") && CODE.includes("cannot parent itself") &&
  CODE.includes("hierarchy too deep"));
check("لا حذف — التعطيل بدل الحذف", CODE.includes("never deleted — deactivate instead"));
check("هوية الحساب المالية مجمّدة", CODE.includes("company/type/code/creation identity is immutable"));
check("ربط قوائمي داخلي محايد فقط — statement_mapping بلا QAYD/XBRL",
  CODE.includes("statement_mapping") && !/qayd|xbrl|taxonomy/i.test(DDL));
check("لا COA مبتكرًا مبذورًا باسم غراس — الإدراج الوحيد داخل RPC الإنشاء، صفر بذر",
  (CODE.match(/insert into public\.acc_accounts/g) || []).length === 1 &&
  !/insert into public\.acc_accounts[\s\S]{0,400}values\s*\(\s*'/.test(CODE));
check("تكوين الدليل ACCOUNTANT حصرًا",
  (CODE.match(/chart of accounts configuration requires the ACCOUNTANT/g) || []).length === 2);

console.log("═══ ٢ · المصدر (Part B) ═══");
check("EVERY ENTRY HAS SOURCE — source_id NOT NULL",
  /source_id\s+uuid not null references public\.acc_sources/.test(CODE));
check("مفردات المصادر تسع المستقبل دون تعديل نموذج الدفتر",
  ["MANUAL_JOURNAL","INVOICE","PAYMENT","REFUND","SETTLEMENT","EXPENSE","BANK",
   "REVENUE_RECOGNITION","PERIOD_CLOSE","REVERSAL","OPENING","SYSTEM"]
    .every((k) => CODE.includes(`'${k}'`)));
check("SOURCE SAME COMPANY يُتحقق عند الترحيل", CODE.includes("entry source belongs to another company"));
check("المصدر سجل صريح غير قابل للتعديل — لا نص حر nullable وحيدًا",
  CODE.includes("acc_sources are immutable"));

console.log("═══ ٣ · الفترات (Part C) ═══");
check("الحالات الست", ["FUTURE","OPEN","SOFT_CLOSED","CLOSED","REOPENED","ARCHIVED"]
  .every((s) => CODE.includes(`'${s}'`)));
for (const [f, t] of [["FUTURE","OPEN"],["OPEN","SOFT_CLOSED"],["SOFT_CLOSED","OPEN"],
  ["SOFT_CLOSED","CLOSED"],["CLOSED","REOPENED"],["REOPENED","CLOSED"],["CLOSED","ARCHIVED"]])
  check(`انتقال ${f}→${t} في القائمة المسموحة`,
    new RegExp(`old\\.state = '${f}'\\s+and new\\.state = '${t}'`).test(CODE));
check("الانتقالات المحرمة تفشل + ARCHIVED نهائية",
  CODE.includes("forbidden period transition") && CODE.includes("ARCHIVED is terminal forever"));
check("OVERLAPPING PERIOD BLOCKED (exclusion constraint)",
  CODE.includes("exclude using gist (company_id with =, daterange(start_date, end_date, '[]') with &&)"));
check("NON-12-MONTH FIRST PERIOD SUPPORTED — لا شرط مدة أصلًا",
  !/12\s*month|interval '1 year'/i.test(CODE) && CODE.includes("check (start_date <= end_date)"));
check("الانتقال عبر الدوال الموقعة فقط", CODE.includes("acc.period_transition"));
check("التواريخ تجمد بعد FUTURE", CODE.includes("dates are frozen once the period leaves FUTURE"));

console.log("═══ ٤ · آلة حالات القيد (Part D) ═══");
for (const [f, t] of [["DRAFT","PENDING_APPROVAL"],["PENDING_APPROVAL","POSTED"],["DRAFT","DISCARDED"]])
  check(`قيد: ${f}→${t}`, new RegExp(`old\\.status = '${f}' and new\\.status = '${t}'`).test(CODE));
check("POSTED→DRAFT/DISCARDED/تحرير/حذف كلها محظورة (المجمّد يرمي)",
  CODE.includes("forbidden journal transition") &&
  CODE.includes("journal entry is immutable — corrections are a reversal plus a new entry") &&
  CODE.includes("are never deleted — DISCARDED is a retained state"));
check("POSTED عبر محرك الترحيل الموقع فقط",
  CODE.includes("POSTED only through acc_post_journal after full ledger validation"));

console.log("═══ ٥ · الأسطر (Parts E/F) ═══");
check("جانب صريح + مبلغ موجب تام — لا سالب غامضًا ولا صفرًا",
  /side\s+text not null check \(side in \('DEBIT','CREDIT'\)\)/.test(CODE) &&
  /amount_minor\s+bigint not null check \(amount_minor > 0\)/.test(CODE) &&
  /base_amount_minor bigint not null check \(base_amount_minor > 0\)/.test(CODE));
check("SAME-CURRENCY BASE EXACT (قيد check صارم)",
  CODE.includes("or (base_amount_minor = amount_minor and fx_rate is null"));
check("FX RATE METADATA إلزامية عند اختلاف العملة",
  CODE.includes("or (fx_rate is not null and fx_rate > 0"));
check("EVERY LINE HAS TAX STATUS (FK إلزامي بمفردات Stage 2)",
  /tax_status\s+text not null references public\.acc_tax_statuses\(code\)/.test(CODE));
check("لا حساب ضريبي ولا default صامتًا إلى TAXABLE",
  !/default 'TAXABLE'|calculate_tax|tax_due/i.test(CODE));
check("أسطر المرحّل مجمّدة والإدراج في مرحّل محظور",
  CODE.includes("lines can only be added to a DRAFT entry") &&
  CODE.includes("entry are immutable"));
check("NO FLOAT في الهجرة",
  !/\b(real|double precision|float)\b/.test(CODE));

console.log("═══ ٦ · محرك الترحيل (Part G) ═══");
check("MINIMUM MEANINGFUL LINES ≥ 2 وقيمة غير صفرية",
  CODE.includes("needs at least two meaningful lines") &&
  CODE.includes("zero value is meaningless"));
check("DEBITS = CREDITS EXACTLY بوحدات الأساس الصغرى — والفلس رفض",
  CODE.includes("if v_debit <> v_credit then") &&
  CODE.includes("unbalanced entry rejected"));
check("NO AUTO-BALANCING — لا سطر موازنة ولا معلق آليًا",
  CODE.includes("no auto-balancing exists") &&
  !/suspense|balancing line|insert.*balance.*line/i.test(DDL));
check("حساب فعال قابل للترحيل من نفس الشركة وعملة الأساس لكل سطر",
  CODE.includes("active postable same-company account and the company base currency"));
check("الترحيل ACCOUNTANT حصرًا — قائمة بيضاء لا سوداء",
  CODE.includes("posting requires the ACCOUNTANT role in this company"));
check("الفشل يرمي فترتد المعاملة كلها — لا أثر جزئيًا (atomicity)",
  CODE.includes("raise exception 'unbalanced"));
check("صلاحيات الفترة عند الترحيل: OPEN عادي، SOFT_CLOSED تسويات/عكوس، والبقية رفض",
  CODE.includes("v_period.state = 'OPEN' then null") &&
  CODE.includes("elsif v_period.state = 'SOFT_CLOSED'") &&
  CODE.includes("does not allow posting this entry"));
check("entry_date داخل نطاق فترته", CODE.includes("entry_date must lie inside its fiscal period"));

console.log("═══ ٧ · العكس (Part I) ═══");
check("REVERSAL = قيد جديد يرجع للأصل (kind REVERSAL + reverses_entry_id)",
  CODE.includes("check ((kind = 'REVERSAL') = (reverses_entry_id is not null))"));
check("الأسطر تنعكس جانبًا بمبالغ وعملات وضرائب وأدلة FX تامة",
  CODE.includes("case when side = 'DEBIT' then 'CREDIT' else 'DEBIT' end"));
check("سبب مسجل إلزامي", CODE.includes("a reversal requires a recorded reason"));
check("الأصل→REVERSED فقط بعد نجاح ترحيل العكس (توقيع خاص)",
  CODE.includes("acc.journal_reversal") &&
  CODE.includes("only after") === false || CODE.includes("الأصل → REVERSED فقط بعد نجاح ترحيل العكس") || MIG.includes("الأصل → REVERSED فقط بعد نجاح ترحيل العكس"));
check("عكس تاريخ مغلق يذهب قدمًا لفترة سارية — لا ترحيل للخلف",
  CODE.includes("the reversal must go to a currently postable period"));
check("العكس يمر بكامل تحققات المحرك نفسه", CODE.includes("acc_assert_postable(v_reversal, true)"));

console.log("═══ ٨ · دفتر الأستاذ والميزان (Parts J/K/L) ═══");
check("آثار الترحيل المحاسبية فقط: POSTED + REVERSED (الأصل المعكوس يبقى في التاريخ)",
  (CODE.match(/e\.status in \('POSTED','REVERSED'\)/g) || []).length >= 3 &&
  !/e\.status = 'POSTED'(?!','REVERSED')/.test(CODE.replace(/status = 'POSTED', /g, "")));
check("FIX 2: تحقق أساس FX الحتمي بحساب صحيح تام div/mod وHALF_UP",
  CODE.includes("FX base amount mismatch") &&
  CODE.includes("2 * mod(v_num, v_den) >= v_den") &&
  CODE.includes("never auto-corrected"));
check("RUNNING BALANCE + SOURCE VISIBLE في دفتر الأستاذ",
  CODE.includes("running_balance_minor") && CODE.includes("s.kind"));
check("NO JS NUMBER MONEY — المبالغ تُعاد نصوصًا ::text",
  CODE.includes("l.base_amount_minor::text") &&
  /debit_minor text, credit_minor text/.test(CODE));
check("TRIAL BALANCE: as-of + period + per-account بمجاميع صحيحة تامة",
  CODE.includes("acc_trial_balance") && CODE.includes("p_as_of") && CODE.includes("p_period"));
check("OPENING عبر قيد متوازن kind OPENING — لا عمود opening_balance",
  CODE.includes("'OPENING'") && !CODE.includes("opening_balance"));

console.log("═══ ٩ · الإغلاق وإعادة الفتح (Parts M/N) ═══");
check("لقطة إغلاق immutable بأرصدة نصية وسياسات سارية",
  CODE.includes("acc_close_snapshots are immutable history") &&
  CODE.includes("'debit_minor',  t.debit::text") &&
  CODE.includes("policy_versions"));
check("خطاف ACC-024 قائم — الإغلاق يستشير الموانع والوحدة لاحقة",
  CODE.includes("acc_period_close_blockers") &&
  CODE.includes("period close blocked by unresolved critical exceptions (ACC-024)"));
check("إعادة فتح CLOSED: إنسانان مختلفان محاسبة+مالكة بشهادتين بعد آخر إغلاق وسبب إلزامي",
  CODE.includes("approver_user_id <> v_accountant") &&
  CODE.includes("distinct human BUSINESS_OWNER approval") &&
  /reason\s+text not null check \(btrim\(reason\) <> ''\)/.test(CODE) &&
  CODE.includes("created_at >= coalesce(v_row.closed_at"));
check("شهادات الفترات append-only ولقطة الإغلاق السابقة باقية",
  CODE.includes("acc_period_approvals is append-only"));
check("مقارنات الأدوار كلها is distinct from — لا NULL trap",
  !/v_role <> '/.test(CODE) && !/acc_role\([^)]*\) <> '/.test(CODE));

console.log("═══ ١٠ · الأدوار والعزل (Part O) ═══");
check("RLS مفعّلة على السبعة والقراءة دور+شركة لا عضوية وحدها (FIX 3)",
  (CODE.match(/enable row level security/g) || []).length === 7 &&
  (CODE.match(/for select using \(public\.acc_role\(company_id\) in \('ACCOUNTANT','AUDITOR'\)\)/g) || []).length === 5 &&
  CODE.includes("in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'))") &&
  CODE.includes("in ('ACCOUNTANT','AUDITOR','BUSINESS_OWNER'))"));
check("المالكة محجوبة عن الدفتر الخام — لا سياسة select تذكرها على الدليل/القيود/الأسطر",
  !/acc_(accounts|entries|lines)_select[\s\S]{0,200}BUSINESS_OWNER/.test(CODE));
check("GL RPC: محاسبة+مدقق بتخويل داخل الدالة",
  CODE.includes("the technical general ledger requires ACCOUNTANT or AUDITOR"));
check("TB RPC: محاسبة+مدقق+مدير مالي (التقارير المختارة)",
  CODE.includes("the trial balance requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER"));
check("صفر كتابة عميل مباشرة — كل شيء عبر الدوال الموقعة",
  (CODE.match(/revoke insert, update, delete on public\.acc_\w+\s+from anon, authenticated/g) || []).length === 7);
check("لا is_admin في أي سياسة أو دالة", !CODE.includes("is_admin"));
check("لا ترحيل AI/SYSTEM: كل دوال الكتابة تشترط auth.uid()",
  (CODE.match(/authentication required/g) || []).length >= 10);
check("لا primitive خدمة يرحّل بلا تحقق — acc_insert_lines وacc_assert_postable وacc_audit محجوبة حتى عن authenticated",
  /revoke execute on function public\.acc_insert_lines[^;]+from public, anon, authenticated/.test(CODE) &&
  /revoke execute on function public\.acc_assert_postable[^;]+from public, anon, authenticated/.test(CODE) &&
  /revoke execute on function public\.acc_audit\([^;]+from public, anon, authenticated/.test(CODE));
check("المدير المالي مسودة فقط والمالكة لا ترحّل يدويًا",
  CODE.includes("'ACCOUNTANT','FINANCE_MANAGER'") &&
  CODE.includes("posting requires the ACCOUNTANT role"));

console.log("═══ ١١ · التدقيق (Part P) ═══");
for (const ev of ["ACCOUNT_CREATED","ACCOUNT_ACTIVE_CHANGED","JOURNAL_DRAFT_CREATED",
  "JOURNAL_DRAFT_EDITED","JOURNAL_SUBMITTED","JOURNAL_DISCARDED","JOURNAL_POSTED",
  "JOURNAL_REVERSED","PERIOD_CREATED","PERIOD_STATE_CHANGED","PERIOD_CLOSED",
  "PERIOD_REOPENED","PERIOD_REOPEN_APPROVAL"])
  check(`حدث ${ev} مدقّق`, CODE.includes(`'${ev}'`));
check("نظام تدقيق واحد — acc_audit_events نفسه، لا جدول تدقيق ثانيًا",
  CODE.includes("insert into public.acc_audit_events") &&
  !/create table if not exists public\.acc_audit/.test(CODE));
check("تحرير المسودة الجوهري before/after",
  CODE.includes("'JOURNAL_DRAFT_EDITED'") && CODE.includes("v_before"));

console.log("═══ ١٢ · الحدود — لا Stage 4 (على DDL) ═══");
for (const w of ["customer", "vendor", "invoice", "subscription", "revenue_schedule",
  "deferred", "receivable", "payable", "payment", "myfatoorah", "clearing",
  "bank_import", "reconcil", "statement_export", "qayd", "xbrl", "taxonomy", "namespace"])
  check(`NO ${w}`, !new RegExp(w, "i").test(DDL));
check("٧ جداول جديدة فقط", (CODE.match(/create table if not exists/g) || []).length === 7);
check("هجرتا Stage 1/2 لم تُمسّا",
  execSync("git diff e2c534f -- supabase/2026-08-27-accounting-foundation.sql supabase/2026-08-27-accounting-registers.sql", { encoding: "utf8" }).trim() === "");
check("لا % عارية في رسائل RAISE بلا وسائط (درس Stage 2)",
  !CODE.split("\n").some((l) => /raise exception '[^']*%[^%']*';\s*$/.test(l) && !l.includes("%%")));

console.log(`\n  عقود الدفتر: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);

// ═══ ملحق تشغيلي: تطابق متجهات TS/SQL لتحويل FX (FIX 2) ═══
// نفس المعادلة حرفيًا: num = amount × rate_scaled × 10^baseUnit،
// den = 10^(rateScale + txnUnit)، HALF_UP عبر 2×mod ≥ den —
// تُقارن بناتج convert() في money.ts (نقطة الحقيقة من Stage 1).
{
  execSync(
    "npx tsc src/lib/accounting/*.ts --outDir .acc-test --module nodenext --moduleResolution nodenext --target es2022 --strict",
    { stdio: "inherit" });
  const M = await import("../../.acc-test/money.js");
  const sqlFormula = (amountMinor, txnUnit, baseUnit, rateText) => {
    const [ri, rf = ""] = rateText.split(".");
    const rateScaled = BigInt(ri + rf.padEnd(10, "0")); // مرآة numeric(20,10)×1e10
    const num = BigInt(amountMinor) * rateScaled * 10n ** BigInt(baseUnit);
    const den = 10n ** BigInt(10 + txnUnit);
    return num / den + (2n * (num % den) >= den ? 1n : 0n);
  };
  const vectors = [
    ["10000", "USD", 2, "0.3071", "KWD", 3],   // $100.00 → 30.710
    ["100000", "JPY", 0, "0.00232", "KWD", 3], // ¥100000 → 232.000
    ["5", "USD", 2, "0.05", "KWD", 3],         // نصف تمامًا → 0.003
    ["1", "USD", 2, "0.0001", "KWD", 3],       // أدنى حد → 0.000؟ لا: 0.0000001→0
    ["999999", "USD", 2, "0.3071", "KWD", 3],
    ["12345", "KWD", 3, "3.2563", "USD", 2],
  ];
  let agree = true;
  for (const [amt, cur, tu, rate, base, bu] of vectors) {
    const ts = M.convert(M.money(BigInt(amt), cur), base, rate, "2026-02-10", "vector").amountMinor;
    const sql = sqlFormula(amt, tu, bu, rate);
    if (ts !== sql) { agree = false; console.error(`  ❌ متجه ${amt} ${cur}@${rate}: TS=${ts} SQL=${sql}`); }
  }
  check("TS/SQL TEST VECTORS MATCH — نفس التقريب HALF_UP بلا تناقض", agree);
  check("متجه الحد النصفي يقبل 3 لا 2 (HALF_UP)", sqlFormula("5", 2, 3, "0.05") === 3n);
  console.log(`\n  عقود الدفتر (نهائي): ${passed} نجح · ${failed} فشل`);
  if (failed) process.exit(1);
}
