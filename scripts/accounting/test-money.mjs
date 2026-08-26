#!/usr/bin/env node
/**
 * اختبارات نموذج المال — تشغيل حقيقي (تُترجم TS ثم تُنفَّذ فعليًا).
 * تغطي: دقات ٣/٢/٠، الجمع والطرح التامّين، السالب، حدود التقريب،
 * رفض الـnumber، التحويل بسعر مثبت، وثبات التوثيق.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx tsc src/lib/accounting/money.ts src/lib/accounting/currencies.ts " +
  "--outDir .acc-test --module nodenext --moduleResolution nodenext --target es2022 --strict",
  { stdio: "inherit" });

const M = await import("../../.acc-test/money.js");

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log("\n═══ ١ · الدقة ملك العملة ═══");
check("KWD 3: 12.345", M.toDecimal(M.fromDecimal("12.345", "KWD")) === "12.345");
check("KWD minor: 12.345 = 12345", M.fromDecimal("12.345", "KWD").amountMinor === 12345n);
check("USD 2: 12.34", M.toDecimal(M.fromDecimal("12.34", "USD")) === "12.34");
check("JPY 0: 1234", M.toDecimal(M.fromDecimal("1234", "JPY")) === "1234");
check("JPY يرفض الكسر بالتقريب الصريح: 1234.6→1235",
  M.fromDecimal("1234.6", "JPY").amountMinor === 1235n);

console.log("═══ ٢ · لا float في مسار المال ═══");
check("money(number) يُرفض", throws(() => M.money(12.3, "KWD")));
check("fromDecimal(number) يُرفض", throws(() => M.fromDecimal(12.3, "KWD")));
check("rate كـnumber يُرفض", throws(() =>
  M.convert(M.fromDecimal("1", "USD"), "KWD", 0.307, "2026-08-27", "test")));
const src = readFileSync("src/lib/accounting/money.ts", "utf8");
check("لا parseFloat/Number()/toFixed في المصدر",
  !/parseFloat|[^o]Number\(|toFixed|Math\.round/.test(src)); // assertNoNumber( هي الحارس لا الخطر
check("لا أعمدة float في الهجرة",
  !/\b(real|double precision|float)\b/.test(
    readFileSync("supabase/2026-08-27-accounting-foundation.sql", "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")));

console.log("═══ ٣ · جمع وطرح تامّان ═══");
{
  // 0.1+0.2 الشهيرة: بالوحدات الصغرى لا يوجد 0.30000000000000004
  const a = M.fromDecimal("0.100", "KWD"), b = M.fromDecimal("0.200", "KWD");
  check("0.1+0.2=0.3 تمامًا", M.toDecimal(M.add(a, b)) === "0.300");
  let sum = M.money(0n, "KWD");
  for (let i = 0; i < 1000; i++) sum = M.add(sum, M.fromDecimal("0.001", "KWD"));
  check("١٠٠٠ × 0.001 = 1.000 تمامًا", M.toDecimal(sum) === "1.000");
  check("الطرح التام: 5.000-2.999=2.001",
    M.toDecimal(M.subtract(M.fromDecimal("5.000","KWD"), M.fromDecimal("2.999","KWD"))) === "2.001");
  check("خلط عملتين في الجمع يُرفض",
    throws(() => M.add(M.fromDecimal("1","KWD"), M.fromDecimal("1","USD"))));
}

console.log("═══ ٤ · السالب ═══");
{
  const n = M.fromDecimal("-3.145", "KWD");
  check("سالب يُقرأ ويُطبع", M.toDecimal(n) === "-3.145" && n.amountMinor === -3145n);
  check("negate", M.toDecimal(M.negate(n)) === "3.145");
  check("سالب+موجب", M.toDecimal(M.add(n, M.fromDecimal("5.000","KWD"))) === "1.855");
  check("تقريب سالب نصف بعيدًا عن الصفر: -1.2345→-1.235 (KWD HALF_UP)",
    M.toDecimal(M.fromDecimal("-1.2345", "KWD")) === "-1.235");
}

console.log("═══ ٥ · حدود التقريب — صريح وموثق ═══");
check("HALF_UP: 1.0005→1.001 (KWD)", M.toDecimal(M.fromDecimal("1.0005","KWD")) === "1.001");
check("HALF_UP: 1.0004→1.000", M.toDecimal(M.fromDecimal("1.0004","KWD")) === "1.000");
check("HALF_EVEN: 1.0005→1.000 (زوجي)", M.toDecimal(M.fromDecimal("1.0005","KWD","HALF_EVEN")) === "1.000");
check("HALF_EVEN: 1.0015→1.002 (زوجي)", M.toDecimal(M.fromDecimal("1.0015","KWD","HALF_EVEN")) === "1.002");
check("HALF_EVEN: 1.00151→1.002 (فوق النصف)", M.toDecimal(M.fromDecimal("1.00151","KWD","HALF_EVEN")) === "1.002");
check("DOWN: 1.0009→1.000", M.toDecimal(M.fromDecimal("1.0009","KWD","DOWN")) === "1.000");
check("UP: 1.0001→1.001", M.toDecimal(M.fromDecimal("1.0001","KWD","UP")) === "1.001");
check("أصفار زائدة بلا تقريب: 1.2340000→1.234", M.toDecimal(M.fromDecimal("1.2340000","KWD")) === "1.234");
check("USD: 2.005→2.01", M.toDecimal(M.fromDecimal("2.005","USD")) === "2.01");

console.log("═══ ٦ · التحويل بسعر مثبت (ACC-004/005) ═══");
{
  // 100.00 USD بسعر 0.3071 → 30.710 KWD
  const c = M.convert(M.fromDecimal("100.00","USD"), "KWD", "0.3071", "2026-08-27", "CBK");
  check("USD→KWD قيمة تامة", M.toDecimal(c) === "30.710");
  check("التوثيق كامل: من/سعر/تاريخ/مصدر/نمط",
    c.conversion.from.currency === "USD" && c.conversion.rate === "0.3071" &&
    c.conversion.rateDate === "2026-08-27" && c.conversion.rateSource === "CBK" &&
    c.conversion.rounding === "HALF_UP");
  // KWD→JPY: 1.234 × 486.20 = 599.9708 → 600 (صفر منازل)
  const j = M.convert(M.fromDecimal("1.234","KWD"), "JPY", "486.20", "2026-08-27", "test");
  check("KWD→JPY يقرب لدقة الهدف صفر", M.toDecimal(j) === "600");
  // سالب عبر التحويل
  const nc = M.convert(M.fromDecimal("-10.000","KWD"), "USD", "3.2563", "2026-08-27", "test");
  check("تحويل سالب: -10.000 KWD → -32.56 USD", M.toDecimal(nc) === "-32.56");
}

console.log("═══ ٧ · تطابق سجل TS مع جدول القاعدة ═══");
{
  const mig = readFileSync("supabase/2026-08-27-accounting-foundation.sql", "utf8");
  for (const [code, unit] of [["KWD",3],["USD",2],["EUR",2],["JPY",0]])
    check(`${code}=${unit} في الهجرة`, mig.includes(`('${code}',`) && new RegExp(`'${code}',[^,]+,\\s*${unit},`).test(mig));
}

console.log(`\n  المال: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
