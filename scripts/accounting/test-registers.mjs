#!/usr/bin/env node
/**
 * اختبارات Stage 2 — تشغيل حقيقي (تُترجم TS ثم تُنفَّذ): السجلّان
 * والمحلّلات وحالة الضريبة، مع حراس ساكنين على الهجرة والحدود.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync(
  "npx tsc src/lib/accounting/*.ts --outDir .acc-test --module nodenext --moduleResolution nodenext --target es2022 --strict",
  { stdio: "inherit" }
);
const T = await import("../../.acc-test/registerTypes.js");
const { POLICY_SEED } = await import("../../.acc-test/policySeed.js");
const { REGULATORY_SEED } = await import("../../.acc-test/regulatorySeed.js");
const R = await import("../../.acc-test/resolvers.js");

let passed = 0, failed = 0;
const check = (n, c, extra = "") => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${extra}`); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const MIG = readFileSync("supabase/2026-08-27-accounting-registers.sql", "utf8");
const MIG_CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
// سطور DDL فقط — نصوص البذر بيانات مرجعية يذكر بعضها QAYD/e-invoicing كمعرفة مشروعة
const DDL = MIG_CODE.split("\n").filter((l) =>
  /create (table|or replace function|policy|trigger|unique index|index)/i.test(l)).join("\n");

console.log("\n═══ ١ · سجل السياسات — البذرة حرفية (§17) ═══");
{
  const ids = POLICY_SEED.map((p) => p.policyId);
  check("POL-001..024 SEEDED (٢٤ سياسة بلا فجوة)",
    ids.length === 24 && ids.every((id, i) => id === `POL-${String(i + 1).padStart(3, "0")}`));
  const st = Object.fromEntries(POLICY_SEED.map((p) => [p.policyId, p.status]));
  const auditorSet = ["POL-006", "POL-009", "POL-012", "POL-017", "POL-020"];
  const proposedSet = ["POL-022", "POL-023", "POL-024"];
  check("BLUEPRINT STATUSES PRESERVED — NEEDS_AUDITOR للخمس المزدوجة",
    auditorSet.every((id) => st[id] === "NEEDS_AUDITOR_APPROVAL"));
  check("BLUEPRINT STATUSES PRESERVED — PROPOSED للثلاث",
    proposedSet.every((id) => st[id] === "PROPOSED"));
  check("البقية NEEDS_ACCOUNTANT_APPROVAL",
    ids.filter((id) => !auditorSet.includes(id) && !proposedSet.includes(id))
       .every((id) => st[id] === "NEEDS_ACCOUNTANT_APPROVAL"));
  check("صفر APPROVED في البذرة — لا ترقية من التنفيذ (ACC-011/017)",
    POLICY_SEED.every((p) => p.status !== "APPROVED" && p.approvedBy === null && p.approvedAt === null));
  check("الموافقة المزدوجة محفوظة — لم تُختزل لواحد",
    auditorSet.every((id) => POLICY_SEED.find((p) => p.policyId === id).approvalRequired === "ACCOUNTANT_AND_AUDITOR"));
  check("POL-024 PROPOSED ومعلقة على BLK-004",
    st["POL-024"] === "PROPOSED" && POLICY_SEED.at(-1).notes.includes("BLK-004"));
  for (const p of POLICY_SEED)
    check(`${p.policyId} في الهجرة بنفس الحالة`,
      new RegExp(`'${p.policyId}',1,.*'${p.status}'`).test(MIG_CODE));
}

console.log("═══ ٢ · محلّل السياسات — إنتاج ≠ معاينة (ACC-010/018) ═══");
{
  const co = "aaaaaaaa-0000-0000-0000-000000000001";
  const prod = R.resolvePolicy(POLICY_SEED, { companyId: co, policyId: "POL-001", asOf: "2026-08-27", mode: "PRODUCTION" });
  check("UNAPPROVED POLICY CANNOT GOVERN PRODUCTION — رفض صريح",
    prod.found === false && prod.reason === "NO_APPROVED_POLICY_FOR_PRODUCTION");
  const sandbox = R.resolvePolicy(POLICY_SEED, { companyId: co, policyId: "POL-001", asOf: "2026-08-27", mode: "SANDBOX" });
  check("UNAPPROVED RESOLVES AS PROVISIONAL IN SANDBOX",
    sandbox.found && sandbox.isProvisional === true && sandbox.governsProduction === false &&
    sandbox.treatment === "Recognise over the service month" && sandbox.scope === "GLOBAL_TEMPLATE");
  check("النتيجة تحمل الميتاداتا اللازمة لاحقًا (ACC-018)",
    sandbox.policyId === "POL-001" && sandbox.version === 1 && sandbox.status === "NEEDS_ACCOUNTANT_APPROVAL");
  const unknown = R.resolvePolicy(POLICY_SEED, { companyId: co, policyId: "POL-099", asOf: "2026-08-27", mode: "SANDBOX" });
  check("سياسة مجهولة = نتيجة صريحة", unknown.found === false && unknown.reason === "UNKNOWN_POLICY");
}

console.log("═══ ٣ · النسخ وحل as-of — التاريخ لا يُعاد سرده (ACC-013/014/015) ═══");
{
  const co = "aaaaaaaa-0000-0000-0000-000000000001";
  const other = "bbbbbbbb-0000-0000-0000-000000000002";
  const v1 = { ...POLICY_SEED[1], companyId: co, version: 1, status: "APPROVED",
    treatment: "Recognise rateably over 12 months; balance to contract liability",
    effectiveFrom: "2026-01-01", effectiveTo: null, approvedAt: "2026-01-01T00:00:00Z", approvedBy: "human-1",
    impactIfChanged: "changes deferred revenue profile" };
  // تغيير المعالجة = إدراج نسخة ٢ — النسخة ١ باقية كما هي في المصفوفة
  const v2 = { ...v1, version: 2, treatment: "Recognise on receipt", effectiveFrom: "2026-07-01" };
  const fixture = [...POLICY_SEED, v1, v2];
  check("POLICY CHANGE CREATES NEW VERSION (v2 موجودة)", fixture.filter((p) => p.companyId === co).length === 2);
  check("OLD POLICY VERSION REMAINS (v1 لم تُمس)",
    fixture.find((p) => p.companyId === co && p.version === 1).treatment.startsWith("Recognise rateably"));
  const march = R.resolvePolicy(fixture, { companyId: co, policyId: "POL-002", asOf: "2026-03-15", mode: "PRODUCTION" });
  check("AS-OF-DATE RESOLUTION: مارس يحكمه v1 لا الأحدث",
    march.found && march.version === 1 && march.governsProduction === true && march.isProvisional === false);
  const august = R.resolvePolicy(fixture, { companyId: co, policyId: "POL-002", asOf: "2026-08-15", mode: "PRODUCTION" });
  check("أغسطس يحكمه v2", august.found && august.version === 2 && august.treatment === "Recognise on receipt");
  const before = R.resolvePolicy(fixture.filter((p) => p.companyId === co),
    { companyId: co, policyId: "POL-002", asOf: "2025-06-01", mode: "SANDBOX" });
  check("HISTORY NOT RESTATED: قبل السريان لا سقوط للأحدث",
    before.found === false && before.reason === "NO_POLICY_IN_EFFECT_AT_DATE");
  const otherCo = R.resolvePolicy(fixture, { companyId: other, policyId: "POL-002", asOf: "2026-08-15", mode: "PRODUCTION" });
  check("SAME USER DIFFERENT COMPANY: شركة أخرى لا ترث اعتماد الأولى",
    otherCo.found === false && otherCo.reason === "NO_APPROVED_POLICY_FOR_PRODUCTION");
  check("company scope يظهر في النتيجة", august.scope === "COMPANY");
  check("لا تاريخ = رفض (لا افتراض اليوم)",
    throws(() => R.resolvePolicy(fixture, { companyId: co, policyId: "POL-002", asOf: undefined, mode: "SANDBOX" })));
}

console.log("═══ ٣ب · القالب العام لا يحكم الإنتاج أبدًا (الفحص الختامي ٢) ═══");
{
  const co = "aaaaaaaa-0000-0000-0000-000000000001";
  // حتى لو وُجد (فرضًا وبالمخالفة) قالب عام APPROVED — الإنتاج يرفضه
  const rogueGlobal = { ...POLICY_SEED[0], status: "APPROVED", effectiveFrom: "2026-01-01",
    approvedAt: "2026-01-01T00:00:00Z", approvedBy: "human-x", impactIfChanged: "x" };
  const fixture = [...POLICY_SEED.slice(1), rogueGlobal];
  const prod = R.resolvePolicy(fixture, { companyId: co, policyId: "POL-001", asOf: "2026-08-27", mode: "PRODUCTION" });
  check("GLOBAL TEMPLATE NEVER GOVERNS PRODUCTION",
    prod.found === false && prod.reason === "NO_APPROVED_POLICY_FOR_PRODUCTION");
  const sb = R.resolvePolicy(fixture, { companyId: co, policyId: "POL-001", asOf: "2026-08-27", mode: "SANDBOX" });
  check("وفي المعاينة لا يحمل governsProduction", sb.found && sb.governsProduction === false);
  const coApproved = { ...rogueGlobal, companyId: co };
  const prod2 = R.resolvePolicy([...fixture, coApproved], { companyId: co, policyId: "POL-001", asOf: "2026-08-27", mode: "PRODUCTION" });
  check("COMPANY-SPECIFIC APPROVED POLICY CAN GOVERN PRODUCTION",
    prod2.found && prod2.scope === "COMPANY" && prod2.governsProduction === true);
}

console.log("═══ ٤ · ضمانات الاعتماد في القاعدة (ACC-011/016/017) ═══");
{
  check("AI CANNOT APPROVE / SYSTEM CANNOT APPROVE — الاعتماد يتطلب إنسانًا (FK + تريغر)",
    /approved_by\s+uuid references auth\.users\(id\)/.test(MIG_CODE) &&
    MIG_CODE.includes("approval requires a human approver"));
  check("الهجرة لا ترقّي شيئًا — ولا نسخة تولد APPROVED",
    MIG_CODE.includes("a new version is never born APPROVED"));
  check("IMPACT_IF_CHANGED REQUIRED BEFORE ACTIVATION (ACC-016)",
    MIG_CODE.includes("impact_if_changed must be recorded before activation"));
  check("صف APPROVED مجمّد + الحقول الجوهرية immutable + الحذف مرفوض",
    MIG_CODE.includes("an APPROVED version is frozen") &&
    MIG_CODE.includes("treatment/identity fields are immutable") &&
    MIG_CODE.includes("history is never deleted"));
  check("الاعتماد يمر بمسار NEEDS_% صريح", MIG_CODE.includes("explicit NEEDS_%% path"));
}

console.log("═══ ٥ · السجل التنظيمي — البذرة حرفية (§18) ═══");
{
  const kwIds = Array.from({ length: 19 }, (_, i) => `REG-KW-${String(i + 1).padStart(3, "0")}`);
  const ids = REGULATORY_SEED.map((r) => r.ruleId);
  check("REG-KW-001..019 كاملة", kwIds.every((id) => ids.includes(id)));
  check("REG-INT-001..002 موجودتان", ids.includes("REG-INT-001") && ids.includes("REG-INT-002"));
  check("BLUEPRINT RULES SEEDED — ٢١ قاعدة بالضبط", REGULATORY_SEED.length === 21);
  const by = Object.fromEntries(REGULATORY_SEED.map((r) => [r.ruleId, r]));
  check("STATUS PRESERVED",
    by["REG-KW-003"].status === "PENDING" && by["REG-KW-005"].status === "PENDING" &&
    by["REG-KW-006"].status === "BLOCKED" && by["REG-KW-014"].status === "BLOCKED" &&
    by["REG-KW-010"].status === "DRAFT" && by["REG-KW-011"].status === "DRAFT" &&
    by["REG-KW-013"].status === "DRAFT" && by["REG-INT-001"].status === "PENDING" &&
    by["REG-KW-008"].status === "ACTIVE");
  check("CONFIDENCE PRESERVED حرفيًا",
    by["REG-KW-006"].confidence === "🔴" && by["REG-KW-014"].confidence === "🔴" &&
    by["REG-KW-010"].confidence === "🟠" && by["REG-KW-011"].confidence === "🟠" &&
    by["REG-KW-013"].confidence === "🟢" && by["REG-KW-007"].confidence === "🟡");
  check("EFFECTIVE RANGE PRESERVED — الغموض محفوظ لا مملوء (LITERAL TEXT PRESERVED)",
    by["REG-KW-006"].effectiveFromText === "?" && by["REG-KW-006"].effectiveFrom.precision === "UNKNOWN" &&
    by["REG-KW-014"].effectiveFromText === "?" &&
    by["REG-KW-010"].effectiveFromText === "proposed 1 Jan 2027" && by["REG-KW-010"].effectiveFrom.precision === "UNKNOWN" &&
    by["REG-KW-013"].effectiveFromText === "draft 4 Jun 2025" && by["REG-KW-013"].effectiveFrom.precision === "UNKNOWN" &&
    by["REG-KW-004"].effectiveFrom.date === "2026-01-01" && by["REG-KW-004"].effectiveTo.date === "2026-12-31");
  check("DAY PRECISION حيث المصدر يعطي يومًا",
    by["REG-KW-003"].effectiveFrom.precision === "DAY" && by["REG-KW-009"].effectiveFrom.precision === "DAY" &&
    by["REG-INT-001"].effectiveFrom.precision === "DAY");
  check("YEAR PRECISION — YEAR-ONLY SOURCE DOES NOT BECOME JAN-01 (NO INVENTED LEGAL DATE)",
    ["REG-KW-001","REG-KW-016","REG-KW-017","REG-KW-018","REG-KW-019"].every((id) =>
      by[id].effectiveFrom.precision === "YEAR" && by[id].effectiveFrom.date === null) &&
    by["REG-KW-001"].effectiveFrom.year === 1990 && by["REG-KW-019"].effectiveFrom.year === 2016);
  check("UNKNOWN PRECISION محفوظة والحدود NONE لـ«—»",
    by["REG-KW-006"].effectiveTo.precision === "UNKNOWN" &&
    by["REG-KW-008"].effectiveFrom.precision === "NONE" && by["REG-KW-002"].effectiveTo.precision === "NONE");
  check("حارس اتساق الحدود يرفض دقةً بلا قيمتها",
    throws(() => T.ruleBound({ precision: "YEAR", date: null, year: null })) &&
    throws(() => T.ruleBound({ precision: "DAY", date: null, year: null })));
  check("لا 1990-01-01 مخترعًا في الهجرة",
    !MIG_CODE.includes("'1990-01-01'") && !MIG_CODE.includes("'2016-01-01'") &&
    /'YEAR',null,1990/.test(MIG_CODE) && /'YEAR',null,2016/.test(MIG_CODE));
  for (const r of REGULATORY_SEED)
    check(`${r.ruleId} في الهجرة بنفس الحالة والثقة`,
      new RegExp(`\\('${r.ruleId}',1,.*'${r.status}','${r.confidence}'`).test(MIG_CODE));
}

console.log("═══ ٦ · محلّل القواعد as-of (REG-002/003) ═══");
{
  const now = (id, d) => R.resolveRule(REGULATORY_SEED, id, d);
  check("AS-OF-DATE RULE RESOLUTION: KW-004 سارية داخل 2026",
    now("REG-KW-004", "2026-08-27").inForce === true && now("REG-KW-004", "2026-08-27").mayCompute === true);
  check("KW-004 خارج نطاقها في 2027 — لا سريان",
    now("REG-KW-004", "2027-03-01").found === false || now("REG-KW-004", "2027-03-01").inForce === false);
  check("قاعدة 2027 لا تُرجَع لسؤال 2026-08-01 لمجرد أنها الأحدث",
    now("REG-INT-001", "2026-08-01").inForce === false &&
    (now("REG-INT-001", "2026-08-01").note ?? "").startsWith("NOT_YET_EFFECTIVE"));
  check("PENDING NOT TREATED AS CURRENT ACTIVE: KW-003 في 2027 تبقى PENDING بلا سريان",
    now("REG-KW-003", "2027-02-01").status === "PENDING" &&
    now("REG-KW-003", "2027-02-01").inForce === false &&
    now("REG-KW-003", "2027-02-01").mayCompute === false);
  check("DRAFT DOES NOT COMPUTE: KW-010 جاهزية فقط",
    now("REG-KW-010", "2026-08-27").mayCompute === false &&
    now("REG-KW-010", "2026-08-27").readinessOnly === true);
  check("BLOCKED DOES NOT COMPUTE: KW-006",
    now("REG-KW-006", "2026-08-27").mayCompute === false &&
    now("REG-KW-006", "2026-08-27").readinessOnly === true);
  check("قاعدة مجهولة = نتيجة صريحة", now("REG-XX-999", "2026-08-27").note === "UNKNOWN_RULE");
  check("النتيجة تسمي النسخة الدقيقة", now("REG-KW-008", "2026-08-27").version === 1);
  // FIX 2 — الدقة السنوية: KW-019 سريانها «2016» (سنة فقط)
  check("PRE-YEAR QUERY: 2015 قبل «2016» = غير سارية",
    now("REG-KW-019", "2015-06-01").inForce === false &&
    (now("REG-KW-019", "2015-06-01").note ?? "").startsWith("NOT_YET_EFFECTIVE"));
  check("POST-YEAR QUERY: 2017 بعد «2016» = سارية",
    now("REG-KW-019", "2017-06-01").inForce === true && now("REG-KW-019", "2017-06-01").dateImprecise === false);
  check("QUERY INSIDE AMBIGUOUS YEAR RETURNS EXPLICIT UNCERTAINTY",
    now("REG-KW-019", "2016-06-01").dateImprecise === true &&
    now("REG-KW-019", "2016-06-01").inForce === false &&
    now("REG-KW-019", "2016-06-01").note === "EFFECTIVE_DATE_IMPRECISE (YEAR precision — no invented day)");
  check("داخل السنة الغامضة لا حساب", now("REG-KW-019", "2016-06-01").mayCompute === false);
  check("KW-001 «1990» اليوم سارية (post-year) دون ادعاء يوم",
    now("REG-KW-001", "2026-08-27").inForce === true);
}

console.log("═══ ٧ · حالة الضريبة (TAX-001..004) ═══");
{
  check("الحالات الست مميزة ومكتملة",
    T.TAX_STATUSES.length === 6 && new Set(T.TAX_STATUSES).size === 6 &&
    ["NO_TAX_REGIME","OUT_OF_SCOPE","TAXABLE","ZERO_RATED","EXEMPT","REVERSE_CHARGE"]
      .every((s) => T.TAX_STATUSES.includes(s)));
  for (const s of T.TAX_STATUSES)
    check(`${s} DISTINCT — في الهجرة كقيمة مستقلة`, MIG_CODE.includes(`'${s}'`));
  const vat = R.resolveVatStatus(REGULATORY_SEED, "KW", "2026-08-27");
  check("KUWAIT CURRENT VAT => NO_TAX_REGIME", vat.status === "NO_TAX_REGIME");
  check("KUWAIT VAT != ZERO_RATED والنسبة null لا صفرًا",
    vat.status !== "ZERO_RATED" && vat.rate === null);
  check("مصدر النتيجة REG-KW-008 v1 ولا حساب",
    vat.ruleId === "REG-KW-008" && vat.ruleVersion === 1 && vat.mayCompute === false);
  check("نسبة على NO_TAX_REGIME تُرفض بنيويًا",
    throws(() => T.taxResolution({ ...vat, rate: "0" })));
  check("TAXABLE بلا نسبة تُرفض",
    throws(() => T.taxResolution({ ...vat, status: "TAXABLE", rate: null })));
  check("النسبة number تُرفض (ACC-002)",
    throws(() => T.taxResolution({ ...vat, status: "TAXABLE", rate: 0.05 })));
  const bpt = R.resolveDraftTaxReadiness(REGULATORY_SEED, "REG-KW-010", "2026-08-27");
  check("DRAFT BPT => NO CALCULATION", bpt.mayCompute === false && bpt.readinessOnly === true);
  const wht = R.resolveDraftTaxReadiness(REGULATORY_SEED, "REG-KW-011", "2026-08-27");
  check("DRAFT WITHHOLDING => NO CALCULATION", wht.mayCompute === false && wht.readinessOnly === true);
  check("NO HARDCODED LAW/RATE/DEADLINE في المحلّلات",
    !/\d+(\.\d+)?\s*%|deadline|0\.05/.test(readFileSync("src/lib/accounting/resolvers.ts", "utf8")));
}

console.log("═══ ٨ · التدقيق والعزل — عقود الهجرة ═══");
{
  check("POLICY VERSION EVENT AUDITED — عبر acc_audit_events نفسه",
    MIG_CODE.includes("'POLICY_VERSION_ADDED'") && !MIG_CODE.includes("create table if not exists public.acc_audit"));
  check("REGULATORY VERSION EVENT AUDITED", MIG_CODE.includes("'REGULATORY_RULE_VERSION_ADDED'"));
  check("لا نظام تدقيق ثانيًا", (MIG_CODE.match(/insert into public\.acc_audit_events/g) || []).length === 4);
  check("COMPANY POLICY ISOLATION في السياسة: قوالب عامة أو عضوية",
    /company_id is null\s*\n?\s*or public\.acc_role\(company_id\) is not null/.test(MIG_CODE));
  check("GLOBAL RULE CLIENT MUTATION BLOCKED",
    /revoke insert, update, delete on public\.acc_regulatory_rules from anon, authenticated/.test(MIG_CODE) &&
    /revoke insert, update, delete on public\.acc_policy_register\s+from anon, authenticated/.test(MIG_CODE) &&
    /revoke insert, update, delete on public\.acc_tax_statuses\s+from anon, authenticated/.test(MIG_CODE));
  check("PLATFORM ADMIN GETS NO ACCOUNTING BYPASS — لا is_admin", !MIG_CODE.includes("is_admin"));
  check("دوال إضافة النسخ server-only (revoke من كل العملاء)",
    /revoke execute on function public\.acc_add_policy_version[\s\S]*?from public, anon, authenticated/.test(MIG_CODE) &&
    /revoke execute on function public\.acc_add_regulatory_rule_version[\s\S]*?from public, anon, authenticated/.test(MIG_CODE));
  check("تجميد نسخ القواعد بالتريغر", MIG_CODE.includes("acc_rules_frozen_trg"));
  check("RLS مفعّلة على الجداول الأربعة الجديدة",
    (MIG_CODE.match(/enable row level security/g) || []).length === 4);
}

console.log("═══ ٨ب · الاعتماد المزدوج وسجل الشهادات (FIX 1) ═══");
{
  check("جدول شهادات append-only بدور صريح وقرار وإنسان معتمِد",
    MIG_CODE.includes("acc_policy_approvals") &&
    /approval_role\s+text not null check \(approval_role in \('ACCOUNTANT','AUDITOR'\)\)/.test(MIG_CODE) &&
    /approver_user_id uuid not null references auth\.users\(id\)/.test(MIG_CODE) &&
    MIG_CODE.includes("acc_approvals_no_update"));
  check("التفعيل حصريًا عبر acc_activate_policy — UPDATE مباشر مرفوض حتى للخدمة",
    MIG_CODE.includes("current_setting('acc.policy_activation', true) is distinct from old.id::text") &&
    MIG_CODE.includes("only via acc_activate_policy"));
  check("المزدوج يتطلب ACCOUNTANT + AUDITOR من إنسانين مختلفين",
    MIG_CODE.includes("'ACCOUNTANT_AND_AUDITOR'") &&
    MIG_CODE.includes("approver_user_id <> v_accountant") &&
    MIG_CODE.includes("distinct human AUDITOR attestation"));
  check("المحاسب وحده لا يكفي للمزدوج والمدقق وحده لا يفعّل",
    MIG_CODE.includes("dual approval requires") &&
    MIG_CODE.includes("an auditor cannot substitute"));
  // ─── الفحص الختامي ١: فاعل التفعيل ───
  check("التفعيل لمحاسبة الشركة نفسها حصرًا — لا مالك/مدقق/read-only/أدمِن منصة",
    MIG_CODE.includes("if v_role is distinct from 'ACCOUNTANT' then") &&
    MIG_CODE.includes("activation requires the ACCOUNTANT role in this company"));
  check("UNAUTHENTICATED ACTIVATION BLOCKED — auth.uid إلزامي",
    MIG_CODE.includes("activation is a human act"));
  check("ACTIVATING HUMAN AUDITED — POLICY_ACTIVATED بهوية v_user",
    /'POLICY_ACTIVATED'[\s\S]{0,200}/.test(MIG_CODE) &&
    /\(v_row\.company_id, 'USER', v_user, 'POLICY_ACTIVATED'/.test(MIG_CODE));
  // ─── الفحص الختامي ٢: القالب العام لا يصبح APPROVED أبدًا ───
  check("GLOBAL TEMPLATE APPROVAL BLOCKED — حزام في التريغر تحت التوقيع نفسه",
    MIG_CODE.includes("a GLOBAL template can never become APPROVED"));
  check("GLOBAL TEMPLATE ACTIVATION BLOCKED في الـRPC",
    MIG_CODE.includes("global templates cannot be activated"));
  check("محلّل SQL: الإنتاج لا يحكمه إلا نسخة شركة معتمدة",
    MIG_CODE.includes("r.status <> 'APPROVED' or not r.is_company") &&
    MIG_CODE.includes("and r.is_company,"));
  check("الدور يُفحص في **تلك الشركة وقت الاعتماد** — أدمِن المنصة لا يمر",
    MIG_CODE.includes("accountant approval requires the ACCOUNTANT role in this company") &&
    MIG_CODE.includes("auditor attestation requires the AUDITOR role in this company") &&
    !MIG_CODE.includes("is_admin"));
  check("AI/SYSTEM لا يعتمدان: auth.uid() إلزامي في الشهادة والتفعيل",
    (MIG_CODE.match(/authentication required — (approvals are human acts|activation is a human act)/g) || []).length === 2);
  check("شهادة المدقق فعل توثيق مسموح (استثناء الـBlueprint) دون كتابة مالية",
    MIG.includes("auditor-approved") && // التخويل موثق في تعليق الهجرة
    /revoke insert, update, delete on public\.acc_policy_approvals from anon, authenticated/.test(MIG_CODE));
  check("مقارنات الأدوار بـis distinct from — NULL (بلا عضوية) لا يمر",
    !/v_role <> '/.test(MIG_CODE));
  check("ACC-016 محفوظ في مسار التفعيل",
    MIG_CODE.includes("impact_if_changed must be recorded before activation (ACC-016)"));
  check("القوالب العامة لا تُعتمد — الاعتماد company-scoped",
    MIG_CODE.includes("global templates are not approvable") &&
    MIG_CODE.includes("global templates cannot be activated"));
  check("حدثا تدقيق للشهادة والتفعيل",
    MIG_CODE.includes("'POLICY_APPROVAL_RECORDED'") && MIG_CODE.includes("'POLICY_ACTIVATED'"));
}

console.log("═══ ٩ · الحدود — لا Stage 3 ولا QAYD/XBRL (على DDL لا نصوص البذر) ═══");
{
  for (const w of ["journal", "ledger", "invoice", "chart_of_account", "account\\b", "trial_balance",
    "vendor", "customer", "product", "revenue_schedule", "payment", "myfatoorah",
    "clearing", "expense", "reconcil", "statement", "qayd", "xbrl", "taxonomy",
    "xsd", "linkbase", "namespace"])
    check(`NO ${w.replace("\\b","")} في أي DDL`, !new RegExp(w, "i").test(DDL));
  check("NO TAX CALCULATION — لا دالة حساب ضريبي",
    !/calculate|compute_tax|tax_due|liability/i.test(DDL));
  check("٤ جداول جديدة فقط (سجلّان + مفردات الضريبة + الشهادات)", (MIG_CODE.match(/create table if not exists/g) || []).length === 4);
  check("هجرة الأساس المعتمدة لم تُمسّ",
    execSync("git diff fff7079 -- supabase/2026-08-27-accounting-foundation.sql", { encoding: "utf8" }).trim() === "");
}

console.log(`\n  السجلّات: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
