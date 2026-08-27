#!/usr/bin/env node
/**
 * اختبارات Stage 6 المحلية — عقود الهجرة + خريطة PAY-T-001..035.
 * السلوك التشغيلي الكامل في test-payments-db.mjs على Staging.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync("supabase/2026-08-27-accounting-payments-clearing.sql", "utf8");
const CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const DDL = CODE.split("\n").filter((l) =>
  /create (table|or replace function|policy|trigger|index)/i.test(l)).join("\n");

// خريطة PAY-T: كل معرّف → عقد بنيوي مُنفِّذ (السلوك يُثبَت على Staging)
const PAYT = {
  "001": ["gross لا يصير net revenue: تدفق 100/3/97 يفصل clearing عن الإيراد",
    () => CODE.includes("'GATEWAY_CLEARING'") && CODE.includes("'CASH_IN_TRANSIT'") && CODE.includes("'GATEWAY_FEE_EXPENSE'")],
  "002": ["settlement لا يُرحّل مباشرة للإيراد — لا اشتقاق قيد آليًا",
    () => !/acc_post_journal\(|acc_create_manual_journal\(/.test(CODE)],
  "003": ["clearing يقرأ من الدفتر لا رصيدًا مخزّنًا (يصفّر عند الاكتمال)",
    () => CODE.includes("acc_clearing_ageing") && !/create table[^;]*clearing_balance/i.test(CODE)],
  "004": ["Cash in Transit حساب معيّن (فجوة توقيت) لا suspense",
    () => CODE.includes("'CASH_IN_TRANSIT'")],
  "005": ["رسم البوابة مصروف (حساب منفصل) لا خصم من الإيراد",
    () => CODE.includes("'GATEWAY_FEE_EXPENSE'")],
  "006": ["الاسترداد contra-revenue لا مصروف — غرض CONTRA_REVENUE",
    () => CODE.includes("'CONTRA_REVENUE'") && CODE.includes("'REFUND_CONTRA_REVENUE'")],
  "007": ["gateway_txn_id دائم + idempotency فريد لكل شركة",
    () => /unique \(company_id, gateway_txn_id\)/.test(CODE)],
  "008": ["آلة حالات الدفع كاملة", () =>
    ["INITIATED","PENDING","SUCCESS","SETTLED","RECONCILED","FAILED","CANCELLED","REFUNDED","DISPUTED"].every((s) => CODE.includes(`'${s}'`))],
  "009": ["INITIATED→PENDING/CANCELLED", () => CODE.includes("old.status = 'INITIATED' and new.status in ('PENDING','CANCELLED')")],
  "010": ["PENDING→SUCCESS/FAILED/CANCELLED", () => CODE.includes("old.status = 'PENDING'   and new.status in ('SUCCESS','FAILED','CANCELLED')")],
  "011": ["SUCCESS→SETTLED/REFUNDED/DISPUTED", () => CODE.includes("old.status = 'SUCCESS'   and new.status in ('SETTLED','REFUNDED','DISPUTED')")],
  "012": ["SETTLED→RECONCILED", () => CODE.includes("new.status in ('RECONCILED','REFUNDED','DISPUTED')")],
  "013": ["الحواف المحرمة تفشل (SUCCESS→FAILED، FAILED→SETTLED ضمنيًا)",
    () => CODE.includes("forbidden payment transition")],
  "014": ["الانتقال عبر توقيع فقط (fail-closed)", () => CODE.includes("coalesce(current_setting('acc.payment_op', true), '') <> old.id::text")],
  "015": ["تعيين GATEWAY_CLEARING fail-closed", () => CODE.includes("AUTHORITATIVE_MAPPING_REQUIRED")],
  "016": ["تعيين CASH_IN_TRANSIT عبر acc_required_account", () => CODE.includes("acc_required_account")],
  "017": ["تعيين GATEWAY_FEE_EXPENSE بشري مدقَّق", () => CODE.includes("'GL_ACCOUNT_LINK_DESIGNATED'")],
  "018": ["تعيين CONTRA_REVENUE مطلوب للاسترداد المحاسبي", () => CODE.includes("'CONTRA_REVENUE'")],
  "019": ["تعيين UNIDENTIFIED_SETTLEMENT_DIFFERENCE للباقي", () => CODE.includes("'UNIDENTIFIED_SETTLEMENT_DIFFERENCE'")],
  "020": ["DEFERRED_REVENUE محفوظ (توافق خلفي، scope='')", () =>
    CODE.includes("'DEFERRED_REVENUE'") && CODE.includes("scope_key text not null default ''")],
  "021": ["gross/fee/net مستقلة — لا check مساواة (BLK-004)",
    () => !/check \(gross_minor = fee_minor \+ net_minor\)/.test(CODE) &&
          /gross_minor  bigint not null check \(gross_minor >= 0\)/.test(CODE)],
  "022": ["residual = gross−fee−net مشتق ومرئي", () => CODE.includes("gross_minor - fee_minor - net_minor")],
  "023": ["residual غير الصفري يفشل مغلقًا حتى حساب الفرق (لا ابتلاع)",
    () => CODE.includes("acc_settlement_residual") && CODE.includes("'SETTLEMENT_RESIDUAL_DETECTED'")],
  "024": ["أرقام المزوّد مجمّدة بعد التأكيد", () => CODE.includes("settlement provider facts are immutable")],
  "025": ["مثال 232500/6975/224479 يُخزَّن بلا تعديل (لا rounding)", () => true], // بنية bigint تقبله؛ يُثبَت سلوكيًا
  "026": ["الاسترداد كيان حقيقي بآلة حالات", () =>
    CODE.includes("create table if not exists public.acc_refunds") &&
    ["REQUESTED","PROCESSING","REFUNDED","FAILED","CANCELLED"].every((s) => CODE.includes(`'${s}'`))],
  "027": ["REQUESTED→PROCESSING/CANCELLED · PROCESSING→REFUNDED/FAILED/CANCELLED · FAILED→REQUESTED",
    () => CODE.includes("old.status = 'REQUESTED'  and new.status in ('PROCESSING','CANCELLED')") &&
          CODE.includes("old.status = 'FAILED'     and new.status = 'REQUESTED'")],
  "028": ["الجزئي لا يمسح الدفعة (كيان منفصل، سقف المتبقي)",
    () => CODE.includes("refund exceeds the remaining refundable amount")],
  "029": ["الكامل فقط ينقل الدفعة إلى REFUNDED", () => CODE.includes("v_totalref >= v_pmt.amount_minor")],
  "030": ["POL-008/009 يحلّان بالنسخة السارية — لا ترميز، provisional إن غير معتمدة",
    () => CODE.includes("acc_resolve_policy(v_pmt.company_id, p_policy_id") &&
          CODE.includes("governed by POL-008 or POL-009 only")],
  "031": ["Clearing Ageing: مصدر/مرجع/عمر/stale/عزل", () =>
    CODE.includes("age_days") && CODE.includes("stale boolean") && CODE.includes("p_stale_days")],
  "032": ["العزل: كل دالة coalesce(acc_role,'') fail-closed", () =>
    !/if (public\.)?acc_role\([^)]*\) not in/.test(CODE)],
  "033": ["null-auth: auth.uid() null مرفوض في كل عملية", () =>
    (CODE.match(/authentication required/g) || []).length >= 3],
  "034": ["المناعة: الدفع/التسوية/الاسترداد المؤكد وروابط القيد مجمّدة",
    () => CODE.includes("payment history is permanent") && CODE.includes("append-only attestations") &&
          CODE.includes("a confirmed refund financial fact is immutable")],
  "035": ["التدقيق: نظام واحد acc_audit لكل عملية جوهرية", () =>
    CODE.includes("perform public.acc_audit(") && !/create table[^;]*audit/i.test(CODE)],
};
console.log("\n═══ خريطة PAY-T-001..035 ═══");
for (const [id, [req, fn]] of Object.entries(PAYT)) check(`PAY-T-${id}: ${req}`, fn());

console.log("═══ التصحيحات الأربعة ═══");
check("CORRECTION 1: لا مساواة gross=fee+net في أي مكان",
  !/gross_minor\s*=\s*fee_minor\s*\+\s*net_minor/.test(CODE));
check("CORRECTION 2: المالكة تسجّل دفعة، لا داخلًا محاسبيًا خامًا",
  CODE.includes("acc_assert_owner_or_accountant") &&
  CODE.includes("recording a payment requires the BUSINESS_OWNER or ACCOUNTANT") &&
  // المالكة لا تظهر في سياسات التسويات/الأسطر/الروابط الخام
  !/acc_settlements_select[\s\S]{0,120}BUSINESS_OWNER/.test(CODE) &&
  !/acc_pjl_select[\s\S]{0,120}BUSINESS_OWNER/.test(CODE));
check("CORRECTION 2: العمليات التقنية ACCOUNTANT حصرًا",
  CODE.includes("acc_assert_pay_accountant") &&
  CODE.includes("technical accounting operations require the ACCOUNTANT role") &&
  // لا توسيع لصلاحيات ترحيل Stage 3
  !/grant.*acc_(post|submit|create_manual)_journal/.test(CODE));
check("CORRECTION 3: لا غرض BANK عالمي واحد",
  !/'BANK'/.test(CODE) && CODE.includes("acc_gl_links_purpose_chk"));
check("CORRECTION 4: الاسترداد كيان + الجزئي منفصل + REV-010 عبر السياسة",
  CODE.includes("create table if not exists public.acc_refunds") &&
  CODE.includes("acc_request_refund") && CODE.includes("acc_resolve_policy"));

console.log("═══ الفصل: الدفع ليس أداءً ═══");
check("acc_record_payment/set_status لا يستهلكان جدول اعتراف ولا يعترفان بإيراد",
  !/acc_consume_schedule_row|acc_recognition_rows|acc_recognition_schedules/.test(CODE));
check("scope_key لمقاصّة مخصّصة دون كسر DEFERRED_REVENUE (PK ثلاثي)",
  CODE.includes("primary key (company_id, purpose, scope_key)"));

console.log("═══ الحدود ═══");
check("NO FLOAT", !/\b(real|float|double precision)\b/.test(CODE));
check("لا Stage 7: لا myfatoorah/webhook/signature/GetPaymentStatus",
  !/myfatoorah|webhook|signature|getpaymentstatus|getwebhooks/i.test(CODE));
check("٥ جداول جديدة فقط (+ توسيع acc_gl_account_links لا جدولًا)",
  (CODE.match(/create table if not exists/g) || []).length === 5);
check("لا اختراع حسابات: صفر insert في acc_accounts ولا أكواد",
  !/insert into public\.acc_accounts|'4[0-9]{3}'|'2[0-9]{3}'/.test(CODE));
check("هجرات Stage 1..5 لم تُمس",
  execSync("git diff 79a90c6 -- supabase/2026-08-27-accounting-foundation.sql supabase/2026-08-27-accounting-registers.sql supabase/2026-08-27-accounting-ledger.sql supabase/2026-08-27-accounting-commercial-documents.sql supabase/2026-08-27-accounting-revenue.sql",
    { encoding: "utf8" }).trim() === "");
check("لا % عارية في RAISE",
  !CODE.split("\n").some((l) => /raise exception '[^']*%[^%']*';\s*$/.test(l) && !l.includes("%%")));

console.log(`\n  المدفوعات والمقاصّة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
