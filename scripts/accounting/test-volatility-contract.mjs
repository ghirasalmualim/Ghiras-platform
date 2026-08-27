#!/usr/bin/env node
/**
 * عقد التقلّب/الكتابة (Stages 1..6): دالة معلنة STABLE أو IMMUTABLE
 * يجب ألا تكتب — لا INSERT/UPDATE/DELETE مباشرة ولا عبر مساعد كاتب
 * معروف (acc_audit). القراءة في معاملة قراءة-فقط فترتد أي كتابة
 * (حادثة acc_settlement_residual). لا يمنع VOLATILE المشروعة.
 */
import { readFileSync } from "node:fs";
let passed = 0, failed = 0;
const check = (n, c, x = "") => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const WRITING_HELPERS = ["acc_audit(", "acc_insert_lines(", "acc_insert_invoice_lines(",
  "acc_generate_rateable_rows(", "acc_refresh_invoice_totals("];
const files = ["foundation","registers","ledger","commercial-documents","revenue","payments-clearing"]
  .map((k) => `supabase/2026-08-27-accounting-${k}.sql`)
  .filter((f) => { try { readFileSync(f); return true; } catch { return false; } });

let violations = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const blk of src.split(/create or replace function/i).slice(1)) {
    const name = (blk.match(/^\s*(public\.\w+)/) || [])[1] || "?";
    const head = blk.slice(0, blk.search(/\bas\s*\$\$/i) + 1 || 400);
    const isStable = /\b(stable|immutable)\b/i.test(head);
    if (!isStable) continue;
    const body = (blk.match(/\$\$([\s\S]*?)\$\$/) || [])[1] || "";
    const writesDirect = /\b(insert|update|delete)\s+(into\s+)?public\./i.test(body) ||
                         /\bperform set_config/i.test(body) === false && /\b(insert into|update public|delete from)\b/i.test(body);
    const writesHelper = WRITING_HELPERS.some((h) => body.includes("perform " + h) || body.includes(":= " + h));
    if (writesDirect || writesHelper) { violations++;
      check(`${name} (${f}) STABLE/IMMUTABLE لا يكتب`, false, "→ يكتب"); }
  }
}
if (violations === 0) console.log("  (لا دالة STABLE/IMMUTABLE تكتب — Stages 1..6)");

// إثبات أن التعريف قبل الإصلاح كان سيفشل، وأن acc_settlement_residual الآن صرفة
const s6 = readFileSync("supabase/2026-08-27-accounting-payments-clearing.sql", "utf8");
const residBlk = (s6.split(/create or replace function /).find((b) => b.startsWith("public.acc_settlement_residual")) || "").split(/\$\$/)[1] || "";
const residCode = residBlk.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
check("acc_settlement_residual قراءة صرفة (لا acc_audit ولا كتابة ولا مساعد كاتب)",
  !residCode.includes("acc_audit(") &&
  !/\b(insert into|update public|delete from)\b/i.test(residCode) &&
  !residCode.includes("acc_required_account"));
check("التدقيق مرة واحدة في مسار الكتابة acc_add_settlement_line",
  /acc_add_settlement_line[\s\S]*?if v_residual <> 0 then[\s\S]*?'SETTLEMENT_RESIDUAL_DETECTED'/.test(s6));
check("fail-closed لخطوة المحاسبة عند الشهادة (residual≠0 يتطلب حساب الفرق)",
  /p_purpose = 'SETTLEMENT'[\s\S]*?acc_settlement_residual\(p_settlement\) <> 0[\s\S]*?acc_required_account/.test(s6));

console.log(`\n  عقد التقلّب/الكتابة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
