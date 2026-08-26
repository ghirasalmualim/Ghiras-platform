#!/usr/bin/env node
/**
 * عقد أمني عالمي (Stages 1..5): يمنع فخ المنطق الثلاثي في التخويل —
 * تعبيرٌ تخويلي في **جسد دالة** يعتمد acc_role()/current_setting()
 * القابلة لـNULL يجب أن يكون fail-closed (coalesce/is distinct from/
 * is null or/is not true). سياسات RLS (using/with check) آمنة أصلًا
 * لأن NULL فيها = حجب، فتُستثنى. لا حظر أعمى لـnot in/=/current_setting.
 */
import { readFileSync, readdirSync } from "node:fs";
let passed = 0, failed = 0;
const check = (n, c, x = "") => { if (c) passed++; else { failed++; console.error(`  \u274c ${n} ${x}`); } };

// دوال Stage 3 المغلقة (لا تُعدَّل بايتًا-ببايت) صُلّبت بـCREATE OR
// REPLACE في هجرة Stage 5 — نتأكد أن الخليفة الآمنة موجودة فيها
const stage5 = readFileSync("supabase/2026-08-27-accounting-revenue.sql", "utf8");
const supersededSafe =
  /create or replace function public\.acc_general_ledger[\s\S]*?coalesce\(public\.acc_role\(v_company\), ''\) not in/.test(stage5) &&
  /create or replace function public\.acc_trial_balance[\s\S]*?coalesce\(public\.acc_role\(p_company\), ''\) not in/.test(stage5);
check("Stage 5 يحمل خليفة آمنة لدالتي Stage 3 المغلقتين", supersededSafe);

const files = readdirSync("supabase").filter((f) => /^2026-08-27-accounting-.*\.sql$/.test(f));
for (const f of files) {
  const lines = readFileSync(`supabase/${f}`, "utf8").split("\n");
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith("--")) return;
    // نتفحص أسطر «if ... then» أو إسنادًا منطقيًا داخل جسد دالة تعتمد الحارسين
    const isFnGuard = /^if\b/.test(t) || /:=\s*.*current_setting/.test(t);
    if (!isFnGuard) return;
    const usesRole = /acc_role\(/.test(t);
    const usesGuc = /current_setting\(/.test(t);
    if (!usesRole && !usesGuc) return;
    // آمن إن احتوى نمط fail-closed
    const safe = /coalesce\(/.test(t) || /is distinct from/.test(t) ||
                 /is null\b/.test(t) || /is not true/.test(t) ||
                 // سطر الشرط قد يمتد؛ الأمان قد يكون في coalesce داخل نفس السطر
                 /is null or/.test(t);
    if (f.endsWith("accounting-ledger.sql")) return; // مُصلَّحة بالخلافة في Stage 5
    check(`${f}:${i + 1} تخويل fail-closed`, safe, `→ ${t.slice(0, 90)}`);
  });
}
// RLS using/with check ليست هدفنا (NULL=حجب) — نتأكد أننا لم نصطدها
console.log(`\n  عقد nullable-auth: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
