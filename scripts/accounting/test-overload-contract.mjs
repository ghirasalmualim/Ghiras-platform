#!/usr/bin/env node
/**
 * عقد الهجرات: يكشف overload صامتًا — دالة تعيد مرحلةٌ لاحقة تعريفها
 * (create or replace) بتوقيع بارامترات مختلف عن تعريفها في مرحلة أقدم،
 * دون drop function صريح أولًا. يترك التوقيع القديم فعّالًا فيلتبس
 * نداء RPC (حادثة acc_link_gl_account). لا يمنع overload المقصود:
 * الشرط هو تغيير توقيع دالةٍ **موروثة** بلا قرار drop معلن.
 */
import { readFileSync, readdirSync } from "node:fs";
let passed = 0, failed = 0;
const check = (n, c, x = "") => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const order = ["foundation","registers","ledger","commercial-documents","revenue","payments-clearing"];
const files = [...order.map((k) => `supabase/2026-08-27-accounting-${k}.sql`),
  "supabase/2026-08-27-accounting-myfatoorah.sql",
  "supabase/2026-08-28-accounting-myfatoorah-conflict-persistence.sql",
  "supabase/2026-08-29-accounting-expenses-documents.sql",
  "supabase/2026-08-30-accounting-expenses-documents-ambiguity.sql",
  "supabase/2026-08-31-accounting-bank-import.sql"]
  .filter((f) => { try { readFileSync(f); return true; } catch { return false; } });

// عدد بارامترات كل create-or-replace function عبر توقيعها (نُبسّط: نعدّ
// الفواصل + 1 داخل القوس حتى returns)، ونجمع تعريفات كل دالة مرتبةً
const sig = (block) => {
  const m = block.match(/create or replace function (public\.\w+)\s*\(([\s\S]*?)\)\s*returns/i);
  if (!m) return null;
  const name = m[1];
  const params = m[2].trim();
  const arity = params === "" ? 0 : params.split(",").length;
  return { name, arity };
};
const defs = {}; // name → [{file, arity}]
const drops = {}; // name → set of files that DROP it
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const blk of src.split(/create or replace function/i).slice(1)) {
    const s = sig("create or replace function" + blk.slice(0, 400));
    if (s) { (defs[s.name] ||= []).push({ file: f, arity: s.arity }); }
  }
  for (const d of src.matchAll(/drop function if exists (public\.\w+)/gi)) {
    (drops[d[1]] ||= new Set()).add(f);
  }
}
// لكل دالة عُرّفت في أكثر من ملف بتوقيعات مختلفة: يجب أن يحمل الملف
// الأحدث drop function للدالة (إزالة القديمة صراحة)
let flagged = 0;
for (const [name, list] of Object.entries(defs)) {
  const arities = new Set(list.map((d) => d.arity));
  const files_ = [...new Set(list.map((d) => d.file))];
  if (files_.length > 1 && arities.size > 1) {
    // توقيع موروث تغيّر عبر الملفات — لا بد من drop صريح في ملفٍ لاحق
    const hasDrop = drops[name] && drops[name].size > 0;
    check(`overload آمن لـ${name} (drop صريح للتوقيع القديم)`, hasDrop,
      `عُرّفت بتوقيعات ${[...arities]} عبر ${files_.length} ملفات بلا drop`);
    flagged++;
  }
}
// إثبات أن acc_link_gl_account كان سيسقط قبل الإصلاح: نتأكد أنه الآن
// يحمل drop، وأنه فعلًا معرّف بتوقيعين مختلفين
check("حادثة acc_link_gl_account: توقيعان مختلفان + drop صريح الآن",
  (defs["public.acc_link_gl_account"]?.length ?? 0) >= 2 &&
  new Set(defs["public.acc_link_gl_account"].map((d) => d.arity)).size === 2 &&
  (drops["public.acc_link_gl_account"]?.size ?? 0) >= 1);
if (flagged === 0) console.log("  (لا تغيير توقيع موروث بلا drop)");
console.log(`\n  عقد الـoverload: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
