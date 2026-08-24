#!/usr/bin/env node
/**
 * اختبارات البند F — حدود الاستدعاء وحماية مال Azure.
 *
 * أهم ما يُحرس: الطلب المرفوض لا يزيد عدًّا، والمال FAIL CLOSED،
 * والقراءة الطبيعية لا تُمنع، ومستخدمٌ لا يمسّ عدّاد غيره،
 * ولا IP ولا صوت ولا تفريغ في جدول الاستخدام.
 */

import { readFileSync } from "node:fs";
import {
  checkPolicy,
  checkPolicySafe,
  RATE_POLICIES,
  RATE_MESSAGES,
  AUDIO_REQUESTS_PER_MINUTE,
  DAILY_AUDIO_SECONDS,
  DAILY_AUDIO_REQUESTS,
} from "../../.quran-test/engine/rate-policies.js";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };
const T0 = 1_000_000_000_000;

console.log("\n═══ ١ · الأرقام المعتمدة — USER_VALIDATION_REQUIRED ═══");
check("AUDIO 10/دقيقة", AUDIO_REQUESTS_PER_MINUTE === 10);
check("1800 ثانية/يوم — الحد المالي بالثواني لا بالمقاطع", DAILY_AUDIO_SECONDS === 1800);
check("120 طلبًا/يوم حاجزًا إضافيًا", DAILY_AUDIO_REQUESTS === 120);
check("الكتلة موسومة في المصدر",
  readFileSync("src/features/quran/engine/rate-policies.ts", "utf8").includes("USER_VALIDATION_REQUIRED"));

console.log("═══ ٢ · حدود الدقيقة لكل سياسة ═══");
for (const [name, p] of Object.entries(RATE_POLICIES)) {
  const uid = `u-${name}`;
  let okCount = 0;
  for (let i = 0; i < p.perMinute; i++) if (checkPolicy(name, uid, T0 + i * 100).ok) okCount++;
  check(`${name}: يسمح بحدّه (${p.perMinute})`, okCount === p.perMinute);
  const over = checkPolicy(name, uid, T0 + p.perMinute * 100);
  check(`${name}: الطلب ${p.perMinute + 1} يُرفض بنافذة دقيقة`, !over.ok && over.scope === "minute" && over.retryAfterSec > 0);
  // النافذة تتجدد
  const later = checkPolicy(name, uid, T0 + 61_000 + p.perMinute * 100);
  check(`${name}: بعد دقيقة يُسمح من جديد`, later.ok);
}

console.log("═══ ٣ · عزل المستخدمين ═══");
{
  for (let i = 0; i < 10; i++) checkPolicy("WRITE", "user-A", T0 + i);
  const b = checkPolicy("WRITE", "user-B", T0 + 20);
  check("استنفاد A لا يمسّ B", b.ok);
}

console.log("═══ ٤ · READ سخية للاستخدام الطبيعي ═══");
{
  // تنقّل محموم: رحلة+خطة+ثبات+حديقة ×٨ مرات في دقيقة = ٣٢ طلبًا
  const uid = "u-refresh";
  let ok = true;
  for (let i = 0; i < 32; i++) if (!checkPolicy("READ", uid, T0 + i * 1500).ok) ok = false;
  check("٣٢ طلب قراءة في دقيقة كلها تمرّ", ok);
  check("وحدّها 120 — أربعة أضعاف الأعنف", RATE_POLICIES.READ.perMinute === 120);
}

console.log("═══ ٥ · fail policies معلنة ومنفّذة ═══");
{
  check("AUDIO مال = closed", RATE_POLICIES.AUDIO.fail === "closed");
  check("READ/WRITE/JUDGE = open", ["READ", "WRITE", "JUDGE"].every((n) => RATE_POLICIES[n].fail === "open"));
  // checkPolicySafe يبتلع عطل العدّاد للسياسات المفتوحة (الرفض الصريح يمرّ)
  const rejected = (() => { for (let i = 0; i < 11; i++) checkPolicy("JUDGE", "u-safe", T0 + i); return checkPolicySafe("JUDGE", "u-safe", T0 + 20); })();
  check("الرفض الصريح يمرّ عبر الغلاف المفتوح", !rejected.ok);
}

console.log("═══ ٦ · الرسائل عربية بلا مصطلح تقني ═══");
{
  const all = Object.values(RATE_MESSAGES).join(" ");
  check("مفصولتان: لحظات ≠ غدًا", RATE_MESSAGES.shortWait.includes("لحظات") && RATE_MESSAGES.dailyAudio.includes("غدًا"));
  check("لا rate/quota/Azure/cost", !/rate|quota|azure|cost|limit/i.test(all));
}

console.log("═══ ٧ · الهجرة — الحجز الذرّي وصلاحياته (نص SQL) ═══");
{
  const sql = readFileSync("supabase/quran/2026-08-24-phase10-rate.sql", "utf8");
  // ⚠️ تُفحص الأعمدة لا التعليقات — التعليق يقول «No IP» نفيًا
  const tableDef = sql.match(/create table[\s\S]*?\n\);/)[0];
  const cols = [...tableDef.matchAll(/^\s{2}(\w+)\s/gm)].map((m) => m[1]).filter((c) => c !== "primary");
  check("جدول بلا IP ولا صوت ولا تفريغ",
    cols.join()==="user_id,day_key,audio_seconds,request_count,updated_at");
  check("مفتاح (user, day)", sql.includes("primary key (user_id, day_key)"));
  // ⚠️ تُفحص السياسات لا القفل الصفّي — `for update` الذرّي شيء آخر
  const policies = [...sql.matchAll(/create policy[\s\S]*?for (\w+)/g)].map((m) => m[1]);
  check("RLS قراءة للمالك فقط — سياسة select واحدة", policies.join()==="select");
  check("قفل صفّي للتزامن", sql.includes("for update"));
  check("Reserve لا increment-ثم-حكم: الرفض قبل أي UPDATE", sql.indexOf("'allowed', false") < sql.indexOf("update public.quran_daily_usage"));
  check("سقف ٣١ ثانية داخل الدالة — دفاعًا حتى عن خادم أخطأ", sql.includes("p_seconds > 31"));
  check("anon لا تنفّذها — REVOKE صريح", /revoke execute .*from public, anon/.test(sql));
  check("authenticated وحدها — GRANT صريح", /grant\s+execute .*to authenticated/.test(sql));
  check("يوم الكويت في القاعدة", sql.includes("interval '3 hours'"));
  check("هوية من auth.uid لا من معامل", sql.includes("auth.uid()") && !sql.includes("p_user_id"));
}

console.log("═══ ٨ · مسار الصوت — الترتيب الإلزامي (نص المسار) ═══");
{
  const r = readFileSync("src/app/api/quran/recite/route.ts", "utf8");
  // ⚠️ `new AzureSpeechProvider` لا اسم الاستيراد — الاستيراد أول الملف دائمًا
  const order = ["SIGN_IN_REQUIRED", "checkPolicySafe('AUDIO'", "inspectWav(", "quran_reserve_audio", "new AzureSpeechProvider"];
  let pos = -1, ordered = true;
  for (const o of order) { const i = r.indexOf(o); if (i < pos) ordered = false; pos = i; }
  check("Auth ← دقيقة ← WAV ← Reserve ← Azure", ordered && pos > 0);
  check("لا حجز لملف فاسد — الفحص قبل الحجز", r.indexOf("inspectWav") < r.indexOf("quran_reserve_audio"));
  check("المدة من ترويسة WAV لا من الواجهة", r.includes("Math.ceil(wav.seconds)"));
  check("FAIL CLOSED: تعذّر العدّاد = 503 قبل Azure", r.includes("RESERVE_UNAVAILABLE") && r.indexOf("RESERVE_UNAVAILABLE") < r.indexOf("new AzureSpeechProvider"));
  check("رسالة الحد اليومي مميزة", r.includes("RATE_MESSAGES.dailyAudio"));

  const f = readFileSync("src/app/api/quran/recite/finish/route.ts", "utf8");
  check("JUDGE على الإنهاء — وclient_key باقٍ حارس الازدواج", f.includes("checkPolicySafe('JUDGE'") && f.includes("DUPLICATE_SESSION"));
}

console.log("═══ ٩ · المسارات التسعة موصولة ═══");
{
  const routes = {
    "src/app/api/quran/goal/route.ts": "WRITE",
    "src/app/api/quran/garden/plant/route.ts": "WRITE",
    "src/app/api/quran/garden/water/route.ts": "WRITE",
    "src/app/api/quran/plan/route.ts": "READ",
    "src/app/api/quran/journey/route.ts": "READ",
    "src/app/api/quran/stability-test/route.ts": "READ",
    "src/app/api/quran/garden/route.ts": "READ",
  };
  for (const [p, pol] of Object.entries(routes))
    check(`${pol}: ${p.split("quran/")[1]}`, readFileSync(p, "utf8").includes(`checkPolicySafe('${pol}'`));
}

console.log(`\n  الحدود: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
