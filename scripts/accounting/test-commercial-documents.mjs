#!/usr/bin/env node
/**
 * اختبارات Stage 4 المحلية — عقود الهجرة والحدود + متجهات حساب تامة.
 * السلوك الكامل في test-commercial-documents-db.mjs على Staging.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync("supabase/2026-08-27-accounting-commercial-documents.sql", "utf8");
const CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const DDL = CODE.split("\n").filter((l) =>
  /create (table|or replace function|policy|trigger|unique index|index)/i.test(l)).join("\n");

console.log("\n═══ ١ · العملاء والموردون والمنتجات ═══");
check("COMPANY SCOPED للثلاثة",
  (CODE.match(/company_id\s+uuid not null references public\.acc_companies/g) || []).length >= 5);
check("معرفات ضريبية مرنة jsonb — لا تحقق قانوني مخترعًا",
  /tax_identifiers jsonb not null default/.test(CODE) && !/regexp.*tax_id|check \(tax_identifiers/.test(CODE));
check("تغييرات العميل الجوهرية مدققة قبل/بعد (اسم/معرفات/عملة/شروط)",
  CODE.includes("'CUSTOMER_CHANGED'") && CODE.includes("'tax_identifiers', v_row.tax_identifiers"));
check("لا حذف — تعطيل (الحارس المشترك)",
  CODE.includes("records are never deleted — deactivate instead"));
check("IS_NON_RESIDENT + WITHHOLDING_STATUS بيانات فقط — لا حساب ولا نسبة",
  /is_non_resident\s+boolean not null default false/.test(CODE) &&
  CODE.includes("withholding_status text") &&
  !/withholding.*(rate|calc|0\.05|5\s*%)/i.test(CODE));
check("تغيّر الإقامة/الاستقطاع مدقق", CODE.includes("'is_non_resident', v_row.is_non_resident"));
check("سعر المنتج مال تام bigint+عملة — NO FLOAT",
  /price_minor\s+bigint not null check \(price_minor >= 0\)/.test(CODE) &&
  !/\b(real|double precision|float)\b/.test(CODE));
check("REVENUE_POLICY_ID معرف منطقي ثابت POL-xxx لا FK لصف نسخة",
  /revenue_policy_id text check \(revenue_policy_id ~ '\^POL-\[0-9\]\{3\}\$'\)/.test(CODE) &&
  !/revenue_policy_id\s+uuid/.test(CODE));
check("تغيّر السعر والسياسة حدثان مدققان مميزان (قدمًا فقط)",
  CODE.includes("'PRODUCT_PRICE_CHANGED'") && CODE.includes("'PRODUCT_POLICY_CHANGED'"));

console.log("═══ ٢ · الترقيم (Part G) ═══");
check("عدّاد شركة معاملاتي — لا nextval/sequence إطلاقًا",
  CODE.includes("acc_invoice_counters") && !/nextval|create sequence/i.test(CODE));
check("قفل FOR UPDATE داخل معاملة الإصدار نفسها",
  CODE.includes("for update;") && CODE.includes("last_number + 1"));
check("المسودة بلا رقم نهائي — يولد عند الإصدار الناجح فقط",
  /invoice_number\s+bigint,/.test(CODE) &&
  CODE.includes("set invoice_number = v_number"));
check("فريد لكل شركة ولا يُعاد استخدامه",
  CODE.includes("acc_invoices_number_uq") &&
  CODE.includes("on public.acc_invoices (company_id, invoice_number) where invoice_number is not null"));
check("الرقم مجمّد فور كتابته — الـinvariant الدقيق لا شرط الخنق القديم",
  CODE.includes("an invoice number can never change once assigned") &&
  /old\.invoice_number is not null\s+and new\.invoice_number is distinct from old\.invoice_number/.test(CODE) &&
  !CODE.includes("can never be reassigned"));
check("تخصيص الرقم مدقق", CODE.includes("'INVOICE_NUMBER_ALLOCATED'"));
check("العدّاد محجوب كليًا عن العملاء (حتى select)",
  CODE.includes("revoke select, insert, update, delete on public.acc_invoice_counters"));
check("FIX 1: حارس العدّاد — توقيع الإصدار إلزامي والتقدم +1 والولادة صفر والحذف مستحيل",
  CODE.includes("acc_counter_guard") &&
  CODE.includes("moves only inside the signed issue transaction") &&
  CODE.includes("new.last_number <> old.last_number + 1") &&
  CODE.includes("a counter is born at zero") &&
  CODE.includes("can never be deleted — numbering never resets"));
check("FIX 2: INSERT محروس — الميلاد DRAFT بلا رقم ولا أدلة إصدار",
  CODE.includes("an invoice is born DRAFT") &&
  CODE.includes("before insert or update or delete on public.acc_invoices"));
check("FIX 2: الرقم وأدلة الإصدار تُكتب فقط بتوقيع acc.invoice_issue لهذا الصف",
  CODE.includes("written only inside acc_issue_invoice") &&
  (CODE.match(/current_setting\('acc\.invoice_issue', true\)/g) || []).length >= 3 &&
  CODE.includes("set_config('acc.invoice_issue', p_invoice::text, true)"));
check("FIX 3: هوية السياسة تُثبت من السجل (قالب عام أو سياسة الشركة نفسها) في المنتج والسطر",
  CODE.includes("acc_assert_known_policy") &&
  CODE.includes("(r.company_id is null or r.company_id = p_company)") &&
  (CODE.match(/perform public\.acc_assert_known_policy/g) || []).length === 3);

console.log("═══ ٣ · آلة الحالات (Part H) — حرفيًا ═══");
for (const s of ["DRAFT","ISSUED","SENT","PARTIALLY_PAID","PAID","PARTIALLY_REFUNDED",
  "REFUNDED","DISPUTED","OVERDUE","WRITTEN_OFF","VOIDED","DELETED"])
  check(`حالة ${s} معرفة`, CODE.includes(`'${s}'`));
check("الحواف البشرية الأربع موقّعة acc.invoice_op",
  CODE.includes("(old.status = 'DRAFT'  and new.status = 'ISSUED')") &&
  CODE.includes("(old.status = 'DRAFT'  and new.status = 'DELETED')") &&
  CODE.includes("(old.status = 'ISSUED' and new.status = 'SENT')") &&
  CODE.includes("(old.status = 'ISSUED' and new.status = 'VOIDED')") &&
  CODE.includes("only through its signed Stage 4 operation"));
check("حواف الوحدات المستقبلية العشر معرفة بنيويًا وبلا مسار اليوم",
  CODE.includes("(old.status = 'SENT' and new.status = 'PARTIALLY_PAID')") &&
  CODE.includes("(old.status = 'PARTIALLY_PAID' and new.status in ('PAID','OVERDUE'))") &&
  CODE.includes("(old.status = 'PAID' and new.status in ('PARTIALLY_REFUNDED','DISPUTED'))") &&
  CODE.includes("(old.status = 'PARTIALLY_REFUNDED' and new.status = 'REFUNDED')") &&
  CODE.includes("(old.status = 'DISPUTED' and new.status in ('PAID','REFUNDED'))") &&
  CODE.includes("(old.status = 'OVERDUE' and new.status in ('PAID','WRITTEN_OFF'))") &&
  CODE.includes("no generic set_status exists") &&
  // التوقيع يُقرأ في الحارس ولا تضعه أي دالة في هذه المرحلة
  CODE.includes("current_setting('acc.invoice_module_transition', true)") &&
  !/set_config\('acc\.invoice_module_transition'/.test(CODE));
check("FAIL-CLOSED (ثغرة NULL GUC): توقيعا التخويل بcoalesce والشرطان is not true",
  (CODE.match(/coalesce\(current_setting\('acc\.invoice_(op|module_transition)', true\), ''\) = old\.id::text/g) || []).length === 2 &&
  CODE.includes("if v_human is not true then") &&
  CODE.includes("if v_module is not true then") &&
  // لا مقارنة توقيع تخويلية عارية بلا coalesce/is distinct — تستهدف
  // دلالة التخويل لا كل current_setting (فحص is-null-or-empty في العدّاد آمن)
  !/:=\s*current_setting\('acc\.[^)]+\)\s*=\s*old\.id/.test(CODE));
check("كل ما عدا القائمة محرم (PAID→DRAFT، ISSUED→DELETED، REFUNDED→PAID…)",
  CODE.includes("forbidden invoice transition"));
check("لا حذف فعليًا — DELETED حالة محفوظة",
  CODE.includes("never physically deleted — DELETED is a retained state"));

console.log("═══ ٤ · التجميد بعد الإصدار (Part J) ═══");
check("قائمة التجميد تشمل العميل والرقم والتواريخ والعملة والمجاميع واللقطة وأدلة FX",
  ["customer_id","invoice_number","issue_date","due_date","currency","subtotal_minor",
   "total_minor","base_total_minor","fx_rate","customer_snapshot","issued_at"]
    .every((f) => new RegExp(`new\\.${f}\\s+is distinct from old\\.${f}`).test(CODE)) &&
  CODE.includes("financially frozen forever"));
check("الأسطر: إدراج/تعديل/حذف في DRAFT فقط",
  CODE.includes("lines can only be added to a DRAFT invoice") &&
  CODE.includes("invoice are immutable"));
check("internal_note وحده خارج التجميد (غير مالي معلن)",
  CODE.includes("internal_note") && !/new\.internal_note\s+is distinct/.test(CODE));

console.log("═══ ٥ · اللقطات (Parts A/C/N) ═══");
check("لقطة العميل عند الإصدار: اسم/اتصال/معرفات/عملة/شروط",
  CODE.includes("'name', v_cust.name, 'contact', v_cust.contact") &&
  CODE.includes("'tax_identifiers', v_cust.tax_identifiers"));
check("لقطة السطر: وصف + سعر + كمية + سياسة لحظة البيع",
  CODE.includes("coalesce(nullif(btrim(l->>'description'), ''), v_prod.name)") &&
  CODE.includes("coalesce(nullif(l->>'revenue_policy_id',''), v_prod.revenue_policy_id)"));

console.log("═══ ٦ · المال والكمية والمجاميع (Parts E/F) ═══");
check("الكمية numeric(18,6) تامة > 0",
  /quantity\s+numeric\(18,6\) not null check \(quantity > 0\)/.test(CODE));
check("نقطة تقريب واحدة: HALF_UP(quantity × unit_price) بأسلوب div/mod الصحيح",
  CODE.includes("acc_line_amount") &&
  CODE.includes("2 * mod(v_num, v_den) >= v_den") &&
  CODE.includes("quantity supports at most 6 exact decimal places"));
check("الخادم يحسب مبلغ السطر — لا line_amount مقدّمًا يُقبل",
  CODE.includes("v_amount := public.acc_line_amount"));
check("CALLER CANNOT FAKE TOTAL: المجاميع تُشتق وتُعاد فحصًا عند الإصدار",
  CODE.includes("acc_refresh_invoice_totals") &&
  CODE.includes("supplied totals are never trusted") &&
  CODE.includes("line_amount_minor <> public.acc_line_amount(quantity, unit_price_minor)"));
check("FX: نفس معادلة HALF_UP الصحيحة من Stage 1/3 — ولا سعر مخمنًا",
  CODE.includes("10000000000") &&
  CODE.includes("never guessed") &&
  CODE.includes("same-currency invoices carry no FX rate"));

console.log("═══ ٧ · الضريبة (TAX-001) ═══");
check("كل سطر tax_status FK بمفردات Stage 2 — لا مفردات ثانية",
  /tax_status\s+text not null references public\.acc_tax_statuses\(code\)/.test(CODE));
check("النسبة NULL إلا مع TAXABLE/ZERO_RATED، وTAXABLE تتطلبها",
  CODE.includes("check (tax_rate is null or tax_status in ('TAXABLE','ZERO_RATED'))") &&
  CODE.includes("check (tax_status <> 'TAXABLE' or tax_rate is not null)"));
check("لا حساب VAT ولا «كويت صفر بالمئة» مرمّزًا",
  !/vat|kuwait.*0|tax.*calc/i.test(DDL));

console.log("═══ ٨ · الأدوار والعزل (Parts I/P) ═══");
check("RLS على الجداول الستة والقراءة دور+شركة",
  (CODE.match(/enable row level security/g) || []).length === 6 &&
  (CODE.match(/in \('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'\)/g) || []).length === 5);
check("صفر كتابة عميل مباشرة",
  (CODE.match(/revoke (select, )?insert, update, delete on public\.acc_\w+\s+from anon, authenticated/g) || []).length === 6);
check("التحوير التجاري BUSINESS_OWNER حصرًا (least privilege معلن)",
  CODE.includes("commercial document operations require the BUSINESS_OWNER role"));
check("لا is_admin ولا AI/SYSTEM: auth.uid إلزامي في كل عملية",
  !CODE.includes("is_admin") && CODE.includes("authentication required"));
check("الدوال الداخلية محجوبة حتى عن authenticated",
  /revoke execute on function public\.acc_insert_invoice_lines[^;]+from public, anon, authenticated/.test(CODE) &&
  /revoke execute on function public\.acc_refresh_invoice_totals[^;]+from public, anon, authenticated/.test(CODE) &&
  /revoke execute on function public\.acc_assert_owner[^;]+from public, anon, authenticated/.test(CODE));

console.log("═══ ٩ · التدقيق (Part O) ═══");
for (const ev of ["CUSTOMER_CREATED","CUSTOMER_CHANGED","CUSTOMER_DEACTIVATED",
  "VENDOR_CREATED","VENDOR_CHANGED","VENDOR_DEACTIVATED",
  "PRODUCT_CREATED","PRODUCT_CHANGED","PRODUCT_PRICE_CHANGED","PRODUCT_POLICY_CHANGED","PRODUCT_DEACTIVATED",
  "INVOICE_DRAFT_CREATED","INVOICE_DRAFT_EDITED","INVOICE_DRAFT_DELETED",
  "INVOICE_NUMBER_ALLOCATED","INVOICE_ISSUED","INVOICE_SENT","INVOICE_VOIDED"])
  check(`حدث ${ev}`, CODE.includes(`'${ev}'`));
check("نظام تدقيق واحد — acc_audit من Stage 3، لا جدول جديدًا",
  CODE.includes("perform public.acc_audit(") &&
  !/create table if not exists public\.acc_audit/.test(CODE));

console.log("═══ ١٠ · الحدود — لا أثر محاسبيًا ولا Stage 5 ═══");
check("ISSUE CREATES NO JOURNAL/REVENUE/PAYMENT — لا لمس لجداول الدفتر",
  !/acc_journal|acc_sources|acc_fiscal_periods|acc_close/.test(CODE));
for (const w of ["subscription","recognition","deferred","receivable","payable",
  "\\bpayment\\b","refund_engine","settlement","myfatoorah","expense","bank",
  "reconcil","qayd","xbrl","taxonomy"])
  check(`NO ${w.replace(/\\b/g, "")}`, !new RegExp(w, "i").test(DDL));
check("٦ جداول جديدة فقط", (CODE.match(/create table if not exists/g) || []).length === 6);
check("هجرات Stage 1/2/3 لم تُمسّ",
  execSync("git diff 52187a3 -- supabase/2026-08-27-accounting-foundation.sql supabase/2026-08-27-accounting-registers.sql supabase/2026-08-27-accounting-ledger.sql",
    { encoding: "utf8" }).trim() === "");
check("لا % عارية في RAISE بلا وسائط",
  !CODE.split("\n").some((l) => /raise exception '[^']*%[^%']*';\s*$/.test(l) && !l.includes("%%")));

// ═══ متجهات حساب السطر — مرآة BigInt لخوارزمية SQL ═══
{
  const lineAmount = (qtyText, unitPrice) => {
    const [qi, qf = ""] = qtyText.split(".");
    if (qf.length > 6) throw new Error("max 6 dp");
    const qScaled = BigInt(qi + qf.padEnd(6, "0"));
    const num = qScaled * BigInt(unitPrice);
    const den = 1000000n;
    return num / den + (2n * (num % den) >= den ? 1n : 0n);
  };
  check("KWD: 3 × 2500 = 7500", lineAmount("3", "2500") === 7500n);
  check("كمية عشرية تامة: 2.5 × 1001 = 2503 (2502.5 → HALF_UP)", lineAmount("2.5", "1001") === 2503n);
  check("حد النصف: 0.5 × 1 = 1 (0.5 → 1)", lineAmount("0.5", "1") === 1n);
  check("تحت النصف: 0.4 × 1 = 0", lineAmount("0.4", "1") === 0n);
  check("دقة ٦ منازل: 0.000001 × 1000000 = 1", lineAmount("0.000001", "1000000") === 1n);
  check("JPY (صفر منازل بالوحدة الصغرى نفسها): 7 × 150 = 1050", lineAmount("7", "150") === 1050n);
  check("USD: 1.5 × 999 = 1499 (1498.5 → HALF_UP)", lineAmount("1.5", "999") === 1499n);
}

console.log(`\n  عقود الوثائق التجارية: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
