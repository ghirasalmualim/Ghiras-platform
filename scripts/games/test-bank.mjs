#!/usr/bin/env node
/* بنك غراس — حراس الدمج الرقيق */
import { readFileSync } from "node:fs";
let passed=0, failed=0;
const check=(n,c)=>{ if(c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const r = readFileSync("src/app/gharas-bank/route.ts","utf8");
check("جلسة غراس لا Auth مستقل", r.includes("createServerSupabase") && r.includes("login?next=/gharas-bank"));
check("منتج مدفوع: عمود gharas_bank_until والأدمِن معفى وsuspended ممنوعة",
  r.includes("gharas_bank_until") && r.includes("isAdmin") && r.includes("suspended"));
check("غير المشتركة → صفحة الاشتراك", r.includes("/gharas-bank-locked"));
check("Model B: لا sub_end في حارس البنك", !r.replace(/\/\*[\s\S]*?\*\//g,"").includes("sub_end"));
check("لا رصيد ألعاب في حارس البنك", !r.includes("game_credits"));
const lk = readFileSync("src/app/gharas-bank-locked/page.tsx","utf8");
check("صفحة الاشتراك: ٨ دنانير · ٦ أشهر", lk.includes("٨") && lk.includes("دنانير") && lk.includes("٦ أشهر"));
const mg = readFileSync("supabase/2026-08-26-gharas-bank-tool.sql","utf8");
check("الهجرة: عمود + حالة gharas_bank في الدالة الحرفية",
  mg.includes("add column if not exists gharas_bank_until") &&
  mg.includes("when 'gharas_bank'    then 'gharas_bank_until'") &&
  mg.includes("when 'clock'          then 'clock_until'"));
const e2 = readFileSync("src/lib/entitlements.ts","utf8");
check("الاستحقاق باسمه في حسابي", e2.includes("gharas_bank_until: 'بنك غراس'"));
const a2 = readFileSync("src/components/AdminPanel.tsx","utf8");
check("صلاحية الأدمِن: زر 🌱 بنك غراس", a2.includes("key: 'gharas_bank'") && a2.includes("'gharas_bank_until'"));

const h = readFileSync("src/app/gharas-bank/game-html.ts","utf8");
check("لا مسارات محلية متبقية للشخصيات", !h.includes("assets/gharas"));
check("أصول الشخصيات من public", h.includes("/gharas-bank/characters/"));
check("قوالب القاعدة الجديدة كلها حاضرة (٧٤٨٠)", (h.match(/\n  T\(/g)||[]).length >= 7480);
check("نسخ المعلم المحفوظة (TC) باقية — وثبات المفضلة دفعة لاحقة", h.includes("gheras:tcopy:v"));
check("شخصيات غراس الخمس", ["الفانوس الذكي","الحكيم اللغوي","البوصلة الذكية","الكابتن اللغوي","الريبورت الذكي"].every(n=>h.includes(n)));
check("زر العودة للمنصة", h.includes("← منصة غراس"));
check("طباعة A4 وتخطيط ١×/٢×/٤×", h.includes("size:A4 portrait") && h.includes("nupSeg"));

const home = readFileSync("src/components/HomeSections.tsx","utf8");
const iStudio=home.indexOf("ستوديو الحصة الذكية"), iBank=home.indexOf("بنك غراس");
check("بطاقة البنك تحت الاستوديو مباشرة", iStudio>0 && iBank>iStudio && (iBank-iStudio)<900);
check("وصف البطاقة المعتمد", home.includes("أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص"));

console.log(`\n  البنك: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
