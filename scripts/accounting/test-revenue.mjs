#!/usr/bin/env node
/**
 * اختبارات Stage 5 المحلية — عقود الهجرة والحدود + متجهات توزيع تامة.
 * السلوك الكامل في test-revenue-db.mjs على Staging.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync("supabase/2026-08-27-accounting-revenue.sql", "utf8");
const CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const DDL = CODE.split("\n").filter((l) =>
  /create (table|or replace function|policy|trigger|index)/i.test(l)).join("\n");

console.log("\n═══ ١ · REV-001: الأداء لا القبض ولا الإصدار ═══");
check("لا اعتراف عند الإصدار: ONE_TIME/AI_CREDITS بلا صفوف حتى دليل أداء",
  MIG.includes("لا صف حتى دليل تسليم حقيقي") &&
  CODE.includes("invoice issue alone is not delivery (REV-001)"));
check("لا افتراض دفع: لا payment/settlement/myfatoorah/bank في الهجرة",
  !/payment|settlement|myfatoorah|bank_|clearing/i.test(DDL));
check("التسليم يتطلب دليلًا حقيقيًا إلزاميًا", CODE.includes("delivery needs real performance evidence"));

console.log("═══ ٢ · REV-011: السجل هو الحقيقة وحل النسخ ═══");
check("الحل عبر acc_resolve_policy من Stage 2 بتاريخ المعاملة — لا معالجة مرمّزة",
  CODE.includes("public.acc_resolve_policy(") &&
  CODE.includes("coalesce(v_inv.issue_date, current_date)"));
check("تجميد النسخة والحالة والنطاق على العقد للأبد (REV-011)",
  CODE.includes("policy_version     integer not null") &&
  CODE.includes("policy_status_used") &&
  CODE.includes("frozen policy version never changes"));
check("القالب العام لا يحكم: provisional حين النطاق ليس COMPANY أو الحالة ليست APPROVED",
  CODE.includes("v_pol.scope is distinct from 'COMPANY'") &&
  CODE.includes("v_pol.status is distinct from 'APPROVED'"));
check("لا ترقية سياسة: لا UPDATE على acc_policy_register في الهجرة",
  !/update public\.acc_policy_register/.test(CODE));

console.log("═══ ٣ · REV-005/012/013: جداول مثبتة وتاريخ لا يُعاد حسابه ═══");
check("جداول وصفوف persisted بجداول حقيقية",
  CODE.includes("create table if not exists public.acc_recognition_schedules") &&
  CODE.includes("create table if not exists public.acc_recognition_rows"));
check("المستهلك مجمّد للأبد والحذف مستحيل",
  CODE.includes("a consumed recognition row is immutable forever") &&
  CODE.includes("never deleted — history is never recomputed"));
check("حقائق الصف مجمّدة — الحالة فقط تتحرك بتوقيع",
  CODE.includes("recognition row facts are immutable"));
check("توقيعات fail-closed منذ الولادة (درس Stage 4): coalesce في كل مقارنة",
  (CODE.match(/coalesce\(current_setting\('acc\.revenue_op', true\), ''\)/g) || []).length >= 3 &&
  !/current_setting\('acc\.revenue_op', true\)\s*=\s*old/.test(CODE.replace(/coalesce\([^)]+\)/g, "X")));

console.log("═══ ٤ · REV-014: البقية للصف الأخير وΣ = الأصل بالتمام ═══");
check("التوزيع: floor لكل صف والبقية للأخير — موثق كقرار افتراضي",
  CODE.includes("p_amount - v_base * (v_months - 1)") &&
  MIG.includes("البقية **كلها للصف الأخير**"));
{
  // مرآة BigInt لخوارزمية SQL
  const spread = (amount, months) => {
    const base = amount / BigInt(months);
    const rows = Array.from({ length: months }, (_, i) =>
      i === months - 1 ? amount - base * BigInt(months - 1) : base);
    return rows;
  };
  const sum = (r) => r.reduce((a, b) => a + b, 0n);
  check("ANNUAL: 120.000 KWD ÷ 12 = 12×10000 بالتمام", sum(spread(120000n, 12)) === 120000n &&
    spread(120000n, 12).every((x) => x === 10000n));
  check("6-MONTH: 100.000 ÷ 6 = 5×16666 + 16670 (البقية للأخير)",
    JSON.stringify(spread(100000n, 6).map(String)) === JSON.stringify(["16666","16666","16666","16666","16666","16670"]) &&
    sum(spread(100000n, 6)) === 100000n);
  check("MONTHLY: شهر واحد = المبلغ كاملًا", spread(3000n, 1)[0] === 3000n);
  check("لا فلس يضيع ولا يُصنع: 7 ÷ 3", sum(spread(7n, 3)) === 7n &&
    JSON.stringify(spread(7n, 3).map(String)) === JSON.stringify(["2","2","3"]));
  check("USD/JPY نفس الخوارزمية (وحدات صغرى محايدة)", sum(spread(999n, 12)) === 999n);
}
check("مبلغ أصغر من عدد الشهور يُرفض لا يُصفّر",
  CODE.includes("too small to spread"));

console.log("═══ ٥ · REV-007/008: أرصدة AI والكسر ═══");
check("الاستهلاك idempotent بمفتاح فريد لكل شركة",
  CODE.includes("unique (company_id, idempotency_key)") &&
  CODE.includes("append-only idempotent events"));
check("سقف الاستهلاك = الالتزام المتبقي", CODE.includes("exceeds the remaining credit liability"));
check("الكسر محجوب حتى POL-006 معتمدة للشركة (PRODUCTION resolver)",
  CODE.includes("'POL-006', p_occurred_on, 'PRODUCTION'") &&
  CODE.includes("blocked until POL-006 has an APPROVED company version"));
check("لا افتراض «انتهت = إيراد»", MIG.includes("لا\n-- افتراض «انتهت الصلاحية = إيراد» أبدًا") || MIG.includes("انتهت الصلاحية = إيراد"));

console.log("═══ ٦ · REV-016: الوسم المؤقت لا يضيع ═══");
check("provisional NOT NULL على العقد والجدول والصف",
  (CODE.match(/provisional\s+boolean not null/g) || []).length >= 2 &&
  (CODE.match(/provisional\s{7,}boolean not null/g) || []).length >= 1);
check("الوسم يسري في المؤجل والتدقيق",
  CODE.includes("s.provisional") && CODE.includes("'provisional', v_r.provisional"));

console.log("═══ ٧ · GL: fail-closed لا اختراعًا ═══");
check("⛔ BLOCKED GL POSTING معلن — لا دالة تشتق قيدًا آليًا",
  MIG.includes("BLOCKED GL POSTING — AUTHORITATIVE MAPPING REQUIRED") &&
  !/acc_post_journal\(|acc_create_manual_journal\(/.test(CODE));
check("لا حسابات ولا أكواد ولا mapping مخترعًا",
  !/insert into public\.acc_accounts|'4[0-9]{3}'|revenue_account|deferred_account_code/.test(CODE));
check("الاستهلاك يربط قيدًا رحّلته المحاسبة: نفس الشركة + POSTED، مرة واحدة",
  CODE.includes("must belong to the same company") &&
  CODE.includes("recognition needs a POSTED journal") &&
  CODE.includes("at most once"));
check("فشل الترحيل = الصف يبقى OPEN (موثق ومفروض)",
  CODE.includes("if posting failed the row stays OPEN"));
check("كاشف التكامل REV-006/017: المحاسبة تعيّن الحساب والانحراف يُدقَّق",
  CODE.includes("acc_deferred_integrity_check") &&
  CODE.includes("the designated account must belong to this company") &&
  CODE.includes("'DEFERRED_DRIFT_DETECTED'"));

console.log("═══ ٨ · REV-004: المؤجل جاري/غير جاري ═══");
check("التقسيم ≤/> ١٢ شهرًا من as_of وبنصوص حصرًا",
  CODE.includes("interval '12 months'") &&
  CODE.includes("open_minor text") && CODE.includes("non_current_minor text"));
check("الصفوف مصدر التحليل — لا مجمّع معتمًا مخزنًا (تعيين الحساب تكوين لا رصيدًا)",
  !/create table[^;]*deferred_(balance|amount|total)/i.test(CODE));

console.log("═══ ٩ · REV-009/015: التعديل الاستباقي ═══");
check("المستهلك بايتًا-ببايت والمفتوح-قبل-السريان يُنسخ للخليفة",
  MIG.includes("المستهلك لا يُمس") &&
  CODE.includes("state = 'OPEN' and recognition_date < p_effective"));
check("سبب إلزامي + تدقيق قبل/بعد + خليفة مرتبط",
  CODE.includes("a schedule modification requires a recorded reason") &&
  CODE.includes("'SCHEDULE_MODIFIED'") && CODE.includes("superseded_by"));
check("الجديد لا ينزل تحت المنقضي", CODE.includes("cannot be below the already elapsed/consumed"));

console.log("═══ ١٠ · الأدوار والعزل والتدقيق ═══");
check("RLS على الأربعة: المهنيون فقط — المالكة والموظف وREAD_ONLY خارج الداخل الخام",
  (CODE.match(/enable row level security/g) || []).length === 6 &&
  (CODE.match(/in \('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'\)/g) || []).length >= 4 &&
  !/BUSINESS_OWNER/.test(DDL));
check("صفر كتابة عميل + العمليات ACCOUNTANT حصرًا",
  (CODE.match(/revoke insert, update, delete on public\.acc_\w+/g) || []).length === 6 &&
  CODE.includes("revenue operations require the ACCOUNTANT role"));
check("لا is_admin", !CODE.includes("is_admin"));
for (const ev of ["REVENUE_CONTRACT_CREATED","DELIVERY_RECORDED","CREDIT_CONSUMPTION_RECORDED",
  "BREAKAGE_RECOGNIZED","REVENUE_ROW_CONSUMED","SCHEDULE_MODIFIED","DEFERRED_DRIFT_DETECTED"])
  check(`حدث ${ev}`, CODE.includes(`'${ev}'`));
check("نظام تدقيق واحد", CODE.includes("perform public.acc_audit(") &&
  !/create table[^;]*audit/i.test(CODE));

console.log("═══ ١٠ب · الإصلاحات الثلاثة (ACC-012 · SoT · الشهادة) ═══");
check("ACC-012: ملفات تنفيذ آلية 1:1 بصف نسخة السياسة، مجمّدة",
  CODE.includes("acc_policy_execution_profiles") &&
  CODE.includes("policy_row_id       uuid not null unique references public.acc_policy_register(id)") &&
  CODE.includes("immutable version-bound data"));
check("NO HARDCODED TREATMENT: التوليد من recognition_basis المجمّد لا p_kind، والغياب رفض",
  CODE.includes("= 'RATABLE_TIME' then") &&
  CODE.includes("no machine-readable execution profile — treatment is never hardcoded (ACC-012)"));
check("MISMATCH BLOCKED: النوع المطلوب يطابق أساس السياسة وإلا رفض",
  CODE.includes("contradicts the resolved policy treatment"));
check("الكسر والتعديل يفحصان ملف النسخة المحلولة (EXPIRY / PROSPECTIVE_MODIFICATION)",
  CODE.includes("does not carry an EXPIRY treatment profile") &&
  CODE.includes("does not carry a PROSPECTIVE_MODIFICATION profile"));
check("البذر اقتراحات على القوالب v1 — لا اعتماد ولا حكم إنتاج",
  CODE.includes("r.company_id is null and r.version = 1") &&
  !/update public\.acc_policy_register/.test(CODE));
check("SoT: المؤجل الجدولي موسوم SCHEDULE_BASIS صراحة — مرآة لا GL",
  CODE.includes("'SCHEDULE_BASIS'::text") && CODE.includes("basis text"));
check("NO MAPPING → INTEGRITY BLOCKED صراحة، لا تطابق زائفًا",
  CODE.includes("AUTHORITATIVE_MAPPING_REQUIRED: no designated DEFERRED_REVENUE account") &&
  CODE.includes("never a false match"));
check("التعيين تكوين بشري مدقَّق من المحاسبة (acc_gl_account_links)",
  CODE.includes("acc_gl_account_links") && CODE.includes("'GL_ACCOUNT_LINK_DESIGNATED'"));
check("الشهادة البشرية: basis/attested_by/attested_at/سبب إلزامية عند CONSUMED",
  CODE.includes("'ACCOUNTANT_ATTESTED_MANUAL'") &&
  CODE.includes("plus an explicit human attestation") &&
  CODE.includes("a same-company POSTED journal alone is not proof"));
check("كشف عكس القيد المرتبط: RECOGNITION_JOURNAL_REVERSED — كشف لا فتح تاريخ",
  CODE.includes("'RECOGNITION_JOURNAL_REVERSED'") &&
  CODE.includes("e.status = 'REVERSED'") &&
  !/reopen|set state = 'OPEN' where.*CONSUMED/i.test(CODE));

console.log("═══ ١١ · الحدود والمال ═══");
check("NO FLOAT — أنواع فقط، «real evidence» في رسالة نصية ليست نوعًا",
  !/\b(real|float)\s+(precision|not null|,|\))/.test(CODE) && !/double precision/.test(CODE) &&
  !/::(real|float|double)/.test(CODE));
check("لا Stage 6: لا refund/dispute/expense/reconcil/qayd/xbrl",
  !/refund|dispute|expense|reconcil|qayd|xbrl|taxonomy/i.test(DDL));
check("٦ جداول (سجلا الإيراد الأربعة + ملفات التنفيذ + تعيينات GL)", (CODE.match(/create table if not exists/g) || []).length === 6);
check("لا مساس بفواتير Stage 4 المصدرة: لا UPDATE على acc_invoices/acc_invoice_lines",
  !/update public\.acc_invoice/.test(CODE));
check("هجرات Stage 1..4 لم تُمس",
  execSync("git diff df250ac -- supabase/2026-08-27-accounting-foundation.sql supabase/2026-08-27-accounting-registers.sql supabase/2026-08-27-accounting-ledger.sql supabase/2026-08-27-accounting-commercial-documents.sql",
    { encoding: "utf8" }).trim() === "");
check("لا % عارية في RAISE",
  !CODE.split("\n").some((l) => /raise exception '[^']*%[^%']*';\s*$/.test(l) && !l.includes("%%")));

console.log(`\n  عقود الإيراد: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
