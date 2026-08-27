#!/usr/bin/env node
/**
 * تصليب Stage 7 قبل Staging: القائمة البيضاء، ربط الشركة الخادمي،
 * صلاحيات الابتلاع، مسار التخطّي غير قابل للانتحال — تشغيل حقيقي.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

execSync("npx tsc src/lib/accounting/myfatoorah/*.ts --outDir .acc-test/mf --module nodenext --moduleResolution nodenext --target es2022 --strict", { stdio: "inherit" });
const San = await import("../../.acc-test/mf/sanitize.js");

console.log("\n═══ ١ · القائمة البيضاء الموجبة — لا حقول حسّاسة تُخزَّن ═══");
const dirtyPayment = {
  Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED", Reference: "E1", CreationDate: "x" },
  Data: {
    Invoice: { Id: "111", Status: "PAID", ExternalIdentifier: "EXT" },
    Transaction: {
      Status: "SUCCESS", PaymentId: "PID7",
      Card: { Token: "tok_SECRET", PanHash: "HASH", Number: "4111111111111111",
              ExpiryMonth: "12", ExpiryYear: "29", NameOnCard: "SECRET NAME" },
      IP: { Address: "1.2.3.4" },
    },
    Customer: { Name: "SECRET", Mobile: "96599999999", Email: "secret@x.com" },
    BaseCurrency: "KWD",
  },
};
const clean = San.sanitizeEvent("PAYMENT_STATUS_CHANGED", dirtyPayment);
const flat = JSON.stringify(clean);
for (const [label, needle] of [
  ["CARD TOKEN", "tok_SECRET"], ["PAN HASH", "HASH"], ["CARD NUMBER", "4111111111111111"],
  ["CARD EXPIRY", '"12"'], ["CARDHOLDER NAME", "SECRET NAME"],
  ["CUSTOMER EMAIL", "secret@x.com"], ["CUSTOMER MOBILE", "96599999999"],
  ["CUSTOMER NAME", '"SECRET"'], ["IP ADDRESS", "1.2.3.4"],
])
  check(`${label} NOT stored`, !flat.includes(needle));
check("الحقول المسموحة محفوظة (PaymentId/Status/BaseCurrency)",
  clean.Data.Transaction.PaymentId === "PID7" && clean.Data.Invoice.Status === "PAID" && clean.Data.BaseCurrency === "KWD");

console.log("═══ ٢ · BALANCE: IBAN/رقم الحساب لا يُخزَّنان ═══");
const bal = San.sanitizeEvent("BALANCE_TRANSFERRED", {
  Event: { Code: 3, Name: "BALANCE_TRANSFERRED", Reference: "E2" },
  Data: { Deposit: { Reference: "DEP5", ValueInBaseCurrency: "224.479", NumberOfTransactions: 3 },
          Bank: { IBAN: "KW00SECRETIBAN", AccountNumber: "999888777" }, BaseCurrency: "KWD" },
});
const balFlat = JSON.stringify(bal);
check("IBAN NOT stored", !balFlat.includes("KW00SECRETIBAN"));
check("ACCOUNT NUMBER NOT stored", !balFlat.includes("999888777"));
check("Deposit.Reference محفوظ", bal.Data.Deposit.Reference === "DEP5");

console.log("═══ ٣ · GetPaymentStatus/GetDepositedInvoices sanitized ═══");
const confDirty = { Invoice: { Id: "111", Status: "PAID" }, Transaction: { Status: "SUCCESS", PaymentId: "PID7", Card: { Token: "tok_X" } }, BaseCurrency: "KWD", Customer: { Email: "x@y.com" } };
const confClean = San.sanitizeConfirmation("GET_PAYMENT_STATUS", confDirty);
check("GETPAYMENTSTATUS sanitized (لا Card ولا Customer)",
  !JSON.stringify(confClean).includes("tok_X") && !JSON.stringify(confClean).includes("x@y.com") &&
  confClean.Transaction.Status === "SUCCESS");
const depClean = San.sanitizeDepositLine({ DepositReference: "DEP5", InvoiceValue: "232.500", TotalServiceCharge: "6.975", DueDeposit: "224.479", Card: { Number: "4111" } });
check("GETDEPOSITEDINVOICES sanitized (gross/fee/net محفوظة، لا بطاقة)",
  depClean.InvoiceValue === "232.500" && depClean.DueDeposit === "224.479" && !JSON.stringify(depClean).includes("4111"));

console.log("═══ ٤ · ربط الشركة من الخادم لا الطلب ═══");
const ROUTE = readFileSync("src/app/api/myfatoorah/webhook/route.ts", "utf8");
check("company من process.env.MYFATOORAH_COMPANY_ID لا من الطلب",
  ROUTE.includes("process.env.MYFATOORAH_COMPANY_ID"));
check("لا قراءة company من جسد/استعلام/رأس الطلب",
  !/searchParams\.get\(['"]company/.test(ROUTE) &&
  !/body\.company_id|body\['company/.test(ROUTE) &&
  !/req\.headers[^;]*company/i.test(ROUTE));
check("الحمولة تُخزَّن بعد sanitizeEvent لا خامًا",
  ROUTE.includes("p_payload: sanitizeEvent(") && !/p_payload:\s*redact\(body\)/.test(ROUTE) && !/p_payload:\s*body/.test(ROUTE));

console.log("═══ ٥ · صلاحيات الابتلاع: service_role فقط ═══");
const MIG = readFileSync("supabase/2026-08-27-accounting-myfatoorah.sql", "utf8");
for (const fn of ["acc_mf_record_event", "acc_mf_record_confirmation", "acc_mf_apply_payment_status", "acc_mf_record_recovery"]) {
  check(`${fn}: revoke public/anon/authenticated + grant service_role حصرًا`,
    new RegExp(`revoke execute on function public\\.${fn}\\([^;]*\\) from public, anon, authenticated`).test(MIG) &&
    new RegExp(`grant  execute on function public\\.${fn}\\([^;]*\\) to service_role`).test(MIG) &&
    !new RegExp(`grant[^;]*${fn}[^;]*to authenticated`).test(MIG));
}

console.log("═══ ٦ · مسار التخطّي غير قابل للانتحال بنيويًا ═══");
check("FAILED→SUCCESS يتطلب توقيع acc.payment_provider_override (يضعه apply فقط)",
  MIG.includes("acc.payment_provider_override") &&
  MIG.includes("only through the signed MyFatoorah path") &&
  // acc_set_payment_status البشرية لا تضع هذا التوقيع
  !/acc_set_payment_status[\s\S]*?payment_provider_override/.test(MIG));
check("apply محجوبة عن authenticated (لا مستخدم يضع التوقيع)",
  /revoke execute on function public\.acc_mf_apply_payment_status[^;]*from public, anon, authenticated/.test(MIG));

console.log(`\n  تصليب MyFatoorah: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
