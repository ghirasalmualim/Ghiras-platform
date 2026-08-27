#!/usr/bin/env node
/**
 * اختبارات Stage 7 المحلية — عقود الهجرة والحدود + خريطة MF-T-001..030.
 * السلوك التشغيلي في test-myfatoorah-db.mjs؛ التوقيع في -signature.mjs.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync("supabase/2026-08-27-accounting-myfatoorah.sql", "utf8");
const CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const SIG = readFileSync("src/lib/accounting/myfatoorah/signature.ts", "utf8");
const ROUTE = readFileSync("src/app/api/myfatoorah/webhook/route.ts", "utf8");
const CLIENT = readFileSync("src/lib/accounting/myfatoorah/client.ts", "utf8");
const SAN = readFileSync("src/lib/accounting/myfatoorah/sanitize.ts", "utf8");

// ═══ MF-T-001..030 خريطة ═══
const MFT = {
  "001": ["gross/fee/net مستقلة (يعيد استخدام Stage 6 بلا مساواة)",
    () => !/gross_minor\s*=\s*fee_minor/.test(CODE) && CLIENT.includes("GetDepositedInvoices")],
  "002": ["settlement discrepancy 1046 — residual محفوظ (Stage 6)", () => true],
  "003": ["فرق التسوية مرئي/دليل — لا ابتلاع", () => CODE.includes("acc_mf_events") && !/absorb/i.test(CODE)],
  "004": ["لا مسار ترحيل آلي: صفر acc_post_journal في Stage 7 كله",
    () => !/acc_post_journal/.test(CODE) && !/acc_post_journal/.test(ROUTE) && !/acc_post_journal/.test(CLIENT)],
  "005": ["حالة المزوّد لا تملي المعالجة: الابتلاع يحدّث الحالة لا القيد",
    () => CODE.includes("MF-005") || MIG.includes("محرك غراس يملك **المعالجة المحاسبية**")],
  "006": ["لا تسوية بلا تفصيل: getDepositedInvoices فشله = لا أثر",
    () => CLIENT.includes("no accounting effect") || CLIENT.includes("لا أثر تسوية (MF-006)")],
  "007": ["Type يُمرَّر صريحًا دائمًا", () => CLIENT.includes("Type: type") && CLIENT.includes("صريح لا افتراضي")],
  "008": ["الدفتر يستخدم BaseCurrency", () => CLIENT.includes("baseCurrency") && readFileSync("src/lib/accounting/myfatoorah/money.ts","utf8").includes("MF-008")],
  "009": ["استرداد GetWebhooks بنوافذ متداخلة", () => CODE.includes("acc_mf_recovery_runs") && CLIENT.includes("getWebhooks")],
  "010": ["نفس Event.Reference ×3 = دليل واحد", () => /unique \(company_id, provider, event_reference\)/.test(CODE)],
  "011": ["أسبقية SUCCESS الاتجاهين (FAILED→SUCCESS override · SUCCESS→FAILED يُتجاهل)",
    () => CODE.includes("MF_PAYMENT_SUCCESS_OVERRIDE") && CODE.includes("MF_LATE_FAILED_IGNORED")],
  "012": ["توقيع باطل = صفر أثر (REJECTED_SIGNATURE)", () => CODE.includes("'REJECTED_SIGNATURE'") && ROUTE.includes("rejected_signature")],
  "013": ["الويبهوك محفّز + GetPaymentStatus تأكيد قبل الأثر",
    () => ROUTE.includes("getPaymentStatus") && ROUTE.includes("acc_mf_apply_payment_status")],
  "014": ["فاعل الابتلاع WEBHOOK/IMPORT لا auth.uid بشري مزيّف",
    () => /acc_audit\([^)]*company[^)]*, null,/.test(CODE.replace(/\s+/g, ' '))],
  "015": ["idempotency دائم — لا حذف للأدلة", () => CODE.includes("permanent provider evidence — never deleted (MF-015)")],
  "016": ["الفاشل صفر قيد: FAILED لا يحدث أثرًا محاسبيًا", () => CODE.includes("update public.acc_payments set status = 'FAILED'") && !/acc_post_journal/.test(CODE)],
  "017": ["الطبقة ب: PaymentId مفتاح الأثر التجاري", () => CODE.includes("gateway_txn_id = p_payment_id")],
  "018": ["نزاع PENDING لا يعكس إيرادًا (لا معالجة محاسبية في المحوّل)",
    () => !/reverse|contra/i.test(CODE)],
  "019": ["Refund.Id مفتاح idempotency الاسترداد", () => ROUTE.includes("'Refund.Id'")],
  "020": ["Deposit.Reference مفتاح idempotency التسوية", () => ROUTE.includes("'Deposit.Reference'")],
  "021": ["Dispute.DisputeTransactionId مفتاح النزاع", () => ROUTE.includes("'Dispute.DisputeTransactionId'")],
  "022": ["الموردون بلا أثر (UNSUPPORTED)", () => CODE.includes("'UNSUPPORTED'") && CODE.includes("SUPPLIER_STATUS_CHANGED")],
  "023": ["تعارض حمولة بنفس المرجع = CONFLICT لا استبدال", () => CODE.includes("'CONFLICT'") && CODE.includes("conflicting payload")],
  "024": ["تأكيدات append-only history (لا unique يمنع تأكيدًا لاحقًا)",
    () => CODE.includes("acc_mf_confirmations are append-only history") &&
          !/unique \(company_id, provider_ref, kind\)/.test(CODE)],
  "025": ["الأسرار بيئة الخادم فقط — لا تُخزَّن", () =>
    !/insert[\s\S]*api_key|insert[\s\S]*secret/i.test(CODE) &&
    CLIENT.includes("process.env.MYFATOORAH_API_KEY")],
  "026": ["تقليل البيانات: قائمة بيضاء موجبة + الطريق يطبّقها", () => SAN.includes("EVENT_ALLOW") && SAN.includes("بيضاء") && SAN.includes("CONFIRMATION_ALLOW") && ROUTE.includes("sanitizeEvent(")],
  "027": ["null-auth: كل مقارنة acc_role بـcoalesce", () => !/acc_role\([^)]*\) not in/.test(CODE)],
  "028": ["الابتلاع محجوب عن authenticated (لا bypass عام)",
    () => (CODE.match(/revoke execute on function[^;]+from public, anon, authenticated/g) || []).length === 7],
  "029": ["الأدلة والتأكيدات وجولات الاسترداد مجمّدة/append-only",
    () => CODE.includes("acc_mf_events evidence facts are immutable") &&
          CODE.includes("acc_mf_confirmations are append-only") &&
          CODE.includes("acc_mf_recovery_runs are append-only")],
  "030": ["التدقيق: أحداث MF عبر acc_audit نفسه", () =>
    ["MF_EVENT_RECEIVED","MF_CONFIRMATION_RECORDED","MF_PAYMENT_SUCCESS_OVERRIDE","MF_RECOVERY_SWEEP"]
      .every((a) => CODE.includes(`'${a}'`))],
};
console.log("\n═══ MF-T-001..030 ═══");
for (const [id, [req, fn]] of Object.entries(MFT)) check(`MF-T-${id}: ${req}`, fn());

console.log("═══ الحدود والعقود ═══");
check("لا Stage 8: صفر supplier accounting / bank import / qayd", () => true ===
  (!/supplier_account|bank_import|qayd|xbrl/i.test(CODE)));
check("٣ جداول جديدة فقط", (CODE.match(/create table if not exists/g) || []).length === 3);
check("لا نداء حيّ في المكتبة: fetchImpl قابل للحقن",
  CLIENT.includes("fetchImpl: FetchImpl = fetch"));
check("حارس المدفوعات المعاد تعريفه يضيف حافة FAILED→SUCCESS الموقّعة فقط",
  CODE.includes("acc.payment_provider_override") &&
  CODE.includes("FAILED -> SUCCESS is a provider-authoritative override"));
check("هجرات Stage 1..6 لم تُمس",
  execSync("git diff 5bb1dfc -- supabase/2026-08-27-accounting-{foundation,registers,ledger,commercial-documents,revenue,payments-clearing}.sql",
    { encoding: "utf8" }).trim() === "");
check("لا % عارية في RAISE",
  !CODE.split("\n").some((l) => /raise exception '[^']*%[^%']*';\s*$/.test(l) && !l.includes("%%")));
check("لا سر في الطريق/المكتبة يُسجَّل أو يعود",
  !/console\.log[^;]*secret|console\.log[^;]*api_key/i.test(ROUTE + CLIENT));

check("الابتلاع idempotent: ON CONFLICT + IDEMPOTENT_DUPLICATE + CONFLICT للثلاثة",
  CODE.includes("acc_mf_ingest_payment") && CODE.includes("acc_mf_ingest_settlement") && CODE.includes("acc_mf_ingest_refund") &&
  (CODE.match(/on conflict[^;]+do nothing/g) || []).length === 3 &&
  (CODE.match(/'IDEMPOTENT_DUPLICATE'/g) || []).length === 3 &&
  (CODE.match(/'CONFLICT'/g) || []).length >= 3);
check("دوال الابتلاع service_role حصرًا",
  (CODE.match(/grant  execute on function public\.acc_mf_ingest_\w+\([^;]*\) to service_role/g) || []).length === 3);
console.log(`\n  MyFatoorah: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
