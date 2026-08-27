#!/usr/bin/env node
/**
 * اختبارات توقيع MyFatoorah — تشغيل حقيقي (تُترجم TS ثم تُنفَّذ).
 * سر تركيبي حتمي في الاختبار فقط — لا سر حقيقي أبدًا. تثبت الترتيب
 * الرسمي لكل حدث، null→'', حقن حقل لا أثر، تبديل الترتيب يفشل.
 */
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";

execSync("npx tsc src/lib/accounting/myfatoorah/signature.ts src/lib/accounting/myfatoorah/money.ts " +
  "--outDir .acc-test/mf --module nodenext --moduleResolution nodenext --target es2022 --strict",
  { stdio: "inherit" });
const S = await import("../../.acc-test/mf/signature.js");
const M = await import("../../.acc-test/mf/money.js");

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };
const SECRET = "test-secret-DO-NOT-USE-IN-PROD";
// مرجع مستقل لحساب المتوقَّع (لا نعيد استخدام الكود المختبَر)
const hmac = (str) => createHmac("sha256", Buffer.from(SECRET, "utf8")).update(Buffer.from(str, "utf8")).digest("base64");

console.log("\n═══ الترتيب الرسمي لكل حدث ═══");
const payVec = { Invoice: { Id: "111", Status: "PAID", ExternalIdentifier: "EXT-9" }, Transaction: { Status: "SUCCESS", PaymentId: "PID-7" } };
check("PAYMENT canonical بالترتيب الرسمي",
  S.canonicalString("PAYMENT_STATUS_CHANGED", payVec) ===
  "Invoice.Id=111,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=PID-7,Invoice.ExternalIdentifier=EXT-9");
const refVec = { Refund: { Id: "R1", Status: "REFUNDED" }, Amount: { ValueInBaseCurrency: "40.000" }, ReferencedInvoice: { Id: "111" } };
check("REFUND canonical",
  S.canonicalString("REFUND_STATUS_CHANGED", refVec) ===
  "Refund.Id=R1,Refund.Status=REFUNDED,Amount.ValueInBaseCurrency=40.000,ReferencedInvoice.Id=111");
const balVec = { Deposit: { Reference: "DEP-5", ValueInBaseCurrency: "224.479", NumberOfTransactions: 3 } };
check("BALANCE canonical",
  S.canonicalString("BALANCE_TRANSFERRED", balVec) ===
  "Deposit.Reference=DEP-5,Deposit.ValueInBaseCurrency=224.479,Deposit.NumberOfTransactions=3");
const dispVec = { Dispute: { DisputeTransactionId: "D1", Status: "PENDING" }, Invoice: { Id: "111", Status: "PAID", ExternalIdentifier: "EXT-9" }, Transaction: { Status: "SUCCESS", PaymentId: "PID-7" } };
check("DISPUTE canonical (٧ حقول بترتيبها)",
  S.canonicalString("DISPUTE_STATUS_CHANGED", dispVec) ===
  "Dispute.DisputeTransactionId=D1,Dispute.Status=PENDING,Invoice.Id=111,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=PID-7,Invoice.ExternalIdentifier=EXT-9");
const recVec = { Recurring: { Id: "REC-1", Status: "ACTIVE", InitialInvoiceId: "9" } };
check("RECURRING canonical",
  S.canonicalString("RECURRING_UPDATES", recVec) ===
  "Recurring.Id=REC-1,Recurring.Status=ACTIVE,Recurring.InitialInvoiceId=9");

console.log("═══ null→'' وحقن حقل ═══");
const nullVec = { Invoice: { Id: "111", Status: "PAID" }, Transaction: { Status: "SUCCESS", PaymentId: "PID-7" } }; // ExternalIdentifier غائب
check("قيمة غائبة/null → سلسلة فارغة",
  S.canonicalString("PAYMENT_STATUS_CHANGED", nullVec) ===
  "Invoice.Id=111,Invoice.Status=PAID,Transaction.Status=SUCCESS,Transaction.PaymentId=PID-7,Invoice.ExternalIdentifier=");
const inject = { ...payVec, Evil: "INJECT", Invoice: { ...payVec.Invoice, Extra: "X" } };
check("حقن حقل إضافي لا يدخل السلسلة القانونية",
  S.canonicalString("PAYMENT_STATUS_CHANGED", inject) === S.canonicalString("PAYMENT_STATUS_CHANGED", payVec));

console.log("═══ التحقق: صحيح/باطل/ترتيب مبدَّل/طول مختلف ═══");
const goodSig = hmac(S.canonicalString("PAYMENT_STATUS_CHANGED", payVec));
check("توقيع صحيح يُقبل", S.verifySignature("PAYMENT_STATUS_CHANGED", payVec, SECRET, goodSig) === true);
check("توقيع باطل يُرفض", S.verifySignature("PAYMENT_STATUS_CHANGED", payVec, SECRET, "AAAA") === false);
check("توقيع مفقود يُرفض", S.verifySignature("PAYMENT_STATUS_CHANGED", payVec, SECRET, null) === false);
// تبديل الترتيب: نوقّع سلسلة بترتيب أبجدي مغلوط → يجب أن يفشل ضد المتوقَّع الرسمي
const wrongOrder = "Invoice.ExternalIdentifier=EXT-9,Invoice.Id=111,Invoice.Status=PAID,Transaction.PaymentId=PID-7,Transaction.Status=SUCCESS";
check("تبديل ترتيب الحقول يفشل التحقق", S.verifySignature("PAYMENT_STATUS_CHANGED", payVec, SECRET, hmac(wrongOrder)) === false);
check("حدث مورّد بلا نموذج توقيع يرمي (يُرفض المعالجة)",
  (() => { try { S.canonicalString("SUPPLIER_STATUS_CHANGED", {}); return false; } catch { return true; } })());
check("رأس التوقيع غير حسّاس لحالة الأحرف",
  S.extractSignatureHeader({ "MyFatoorah-Signature": "sig1" }) === "sig1" &&
  S.extractSignatureHeader({ "myfatoorah-signature": "sig2" }) === "sig2" &&
  S.extractSignatureHeader({ "MYFATOORAH-SIGNATURE": "sig3" }) === "sig3");

console.log("═══ المال: وحدات صغرى تامة بدقة العملة ═══");
check("232.500 KWD = 232500", M.toMinor("232.500", "KWD") === 232500n);
check("6.975 KWD = 6975", M.toMinor("6.975", "KWD") === 6975n);
check("224.479 KWD = 224479", M.toMinor("224.479", "KWD") === 224479n);
check("residual 232500-6975-224479 = 1046", 232500n - 6975n - 224479n === 1046n);
check("USD دقتان: 100.00 = 10000", M.toMinor("100.00", "USD") === 10000n);
check("JPY صفر: 1050 = 1050", M.toMinor("1050", "JPY") === 1050n);
check("دقة زائدة تُرفض لا تُقرَّب (KWD 4 منازل)",
  (() => { try { M.toMinor("1.2345", "KWD"); return false; } catch { return true; } })());
check("number يُرفض (لا float)",
  (() => { try { M.toMinor(1.5, "KWD"); return false; } catch { return true; } })());
check("لا افتراض KWD: عملة مجهولة تُرفض",
  (() => { try { M.toMinor("1.0", "XYZ"); return false; } catch { return true; } })());

console.log(`\n  توقيع MyFatoorah: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
