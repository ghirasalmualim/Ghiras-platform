#!/usr/bin/env node
/* حراس ساكنون: حدود Stage 1 وغياب QAYD/XBRL (QAYD-T, XBRL-001) */
import { readFileSync } from "node:fs";
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

console.log("═══ غياب QAYD/XBRL في المستودع كله (XBRL-001) ═══");
{
  const hits = execSync("grep -rli 'xbrl\\|taxonomy\\|qayd' src/lib src/app supabase/ scripts/ --exclude-dir=gharas-bank 2>/dev/null || true", {encoding:"utf8"})
    .split("\n").filter(Boolean)
    .filter(f => !f.includes("test-foundation-static"))
    // ملفات سجل Stage 2 تذكر QAYD/XBRL كقاعدة مسجلة (REG-KW-003/004) — معرفة لا تنفيذًا؛
    // غياب التنفيذ يُفحص على DDL في test-registers.mjs §9
    .filter(f => !f.includes("regulatorySeed") && !f.includes("accounting-registers") && !f.includes("test-registers"))
    // ملفات Stage 3 تذكر QAYD/XBRL فقط في تعليقات إثبات الغياب واختباراته
    .filter(f => !f.includes("accounting-ledger") && !f.includes("test-ledger"))
    .filter(f => !f.includes("commercial-documents") && !f.includes("revenue"))
    // هجرة الأساس تذكر QAYD-002 في تعليق توثيقي واحد سببه إثبات الغياب — الكود الفعلي يُفحص أعلاه بلا تعليقات
    .filter(f => !f.endsWith("2026-08-27-accounting-foundation.sql"));
  check("صفر ملفات تذكر QAYD/XBRL/taxonomy", hits.length === 0);
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
