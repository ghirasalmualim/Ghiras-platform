#!/usr/bin/env node
/* بنك غراس — حراس الدمج الرقيق */
import { readFileSync } from "node:fs";
let passed=0, failed=0;
const check=(n,c)=>{ if(c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const r = readFileSync("src/app/gharas-bank/route.ts","utf8");
check("جلسة غراس لا Auth مستقل", r.includes("createServerSupabase") && r.includes("login?next=/gharas-bank"));
check("suspended ممنوعة — active أو أدمِن فقط", r.includes("p.status === 'active'") && r.includes("isAdmin"));
check("لا استحقاق ولا تسعير في هذه المرحلة", !r.includes("_until") && !r.includes("game_credits"));

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
