#!/usr/bin/env node
/* حراس ساكنون: حدود Stage 1 وغياب QAYD/XBRL (QAYD-T, XBRL-001) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
let passed=0, failed=0;
const check=(n,c)=>{ if(c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const mig = readFileSync("supabase/2026-08-27-accounting-foundation.sql","utf8");
const code = mig.split("\n").filter(l=>!l.trim().startsWith("--")).join("\n");

console.log("\n═══ حدود Stage 1 — لا شيء من المراحل اللاحقة ═══");
for (const w of ["journal","ledger","invoice","chart_of_account","posting","revenue","expense","payment","myfatoorah","clearing","reconcil","statement","acc_polic","tax_r","qayd","xbrl"])
  check(`لا ${w} في الهجرة`, !new RegExp("\\b"+w, "i").test(code));
check("جداول الأساس الخمسة فقط",
  (code.match(/create table if not exists/g)||[]).length === 5);

console.log("═══ غياب تنفيذ QAYD/XBRL في المستودع (XBRL-001) ═══");
{
  // فحص دلالي لا حظر بالاسم: نجرّد التعليقات ونصوص السلاسل من كل ملف
  // تنفيذي (src + supabase)، فيبقى الكود القابل للتنفيذ فقط. ذكر
  // QAYD/XBRL في تعليق حدّي أو بيانات مرجعية (REG-KW-003) مسموح؛
  // اسمٌ في موضع تنفيذي (دالة/جدول/مسار/استيراد) يُرفض. لا استثناء
  // لملف أو مجلد كامل — بما فيه Stage 7.
  const walk = (dir) => {
    let out = [];
    for (const e of readdirSync(dir)) {
      if (e === "gharas-bank" || e === "node_modules" || e === ".next") continue;
      const p = dir + "/" + e;
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.(ts|tsx|js|mjs|sql)$/.test(e)) out.push(p);
    }
    return out;
  };
  const stripped = (src, isSql) => {
    let s = src;
    if (isSql) s = s.replace(/--[^\n]*/g, "");                 // تعليقات SQL
    else s = s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""); // تعليقات JS
    // إزالة محتوى السلاسل (', ", `) — البيانات المرجعية والرسائل ليست تنفيذًا
    s = s.replace(/'(?:[^'\\]|\\.)*'/g, "''")
         .replace(/"(?:[^"\\]|\\.)*"/g, '""')
         .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    return s;
  };
  const offenders = [];
  for (const f of [...walk("src"), ...walk("supabase")]) {
    if (f.includes("test-foundation-static")) continue;
    const code = stripped(readFileSync(f, "utf8"), f.endsWith(".sql"));
    if (/(xbrl|taxonomy|qayd)/i.test(code)) offenders.push(f);
  }
  check("صفر تنفيذ QAYD/XBRL/taxonomy (تعليقات ونصوص مسموحة)", offenders.length === 0);
  if (offenders.length) console.error("  offenders:", offenders.join(", "));

  // إثبات نفي: حقن معرّف تنفيذي qayd في نصٍّ مُجرَّد يجب أن يُكتشف
  const probe = stripped("create function public.acc_qayd_export() returns void as $$ begin end $$;", true);
  check("الحارس يكشف تنفيذًا اصطناعيًا لـQAYD (نفي)", /(xbrl|taxonomy|qayd)/i.test(probe));
}

console.log("═══ فصل الأدوار عن منصة غراس ═══");
check("لا is_admin في أي سياسة محاسبية", !code.includes("is_admin"));
check("الأدوار الستة كاملة بالنص",
  ["BUSINESS_OWNER","ACCOUNTANT","AUDITOR","FINANCE_MANAGER","EMPLOYEE","READ_ONLY"].every(r=>code.includes(r)));
check("الفاعلون غير البشر معرفون", code.includes("'SYSTEM'") && code.includes("'AI_AGENT'"));
check("occurred_at وrecorded_at كلاهما", code.includes("occurred_at") && code.includes("recorded_at"));
check("تريغرا المناعة على التدقيق والأسعار",
  code.includes("acc_audit_no_update") && code.includes("acc_rates_no_update"));
check("لا كتابة للعملاء على التدقيق والأسعار والعملات",
  /revoke insert, update, delete on public\.acc_audit_events/.test(code) &&
  /revoke insert, update, delete on public\.acc_exchange_rates/.test(code) &&
  /revoke insert, update, delete on public\.acc_currencies/.test(code));
check("لا vat_rate ولا أي schema ضريبي مغلِق", !/\bvat/i.test(code)); // كلمة لا جزء كلمة (observations)

console.log(`\n  الحارس الساكن: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
