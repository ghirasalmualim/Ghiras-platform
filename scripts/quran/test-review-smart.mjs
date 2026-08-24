#!/usr/bin/env node
/**
 * اختبارات المرحلة ٦ — المراجعة الذكية للحفظ.
 *
 * ⚠️ أهم ما يُحرس هنا ليس النجاح بل **الرفض**: أن الدليل الكاذب
 * وغير المؤكَّد لا يستطيع تلويث جدول المراجعة. `usable:false`
 * و`UNCERTAIN` وصدى المزوّد كلها تقف عند البوّابة — باختبارٍ
 * لا بنيّة حسنة.
 *
 * وتُفحص القواعد المحافظة: لا حكم دائم من مرّة واحدة، والتحسّن
 * بأيام مختلفة كالإتقان سواء، وليتنر لم يُمسّ.
 */

import { readFileSync } from "node:fs";
import {
  qualityFromVerdict,
  observationsFromAlignment,
  applyObservation,
  newSpot,
  isSettled,
  isActive,
  isTransitionPriority,
  withinLessonRange,
  SETTLE_MIN_DISTINCT_DAYS,
  TRANSITION_MIN_DISTINCT_DAYS,
} from "../../.quran-test/engine/memory.js";
import {
  applySession,
  isDue,
  REVIEW_INTERVALS_DAYS,
  MAX_BOX,
  MASTERY_MIN_DISTINCT_DAYS,
} from "../../.quran-test/engine/review.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

/* ── عُدّة بناء نتائج محاذاة مصطنعة ────────────────────────── */
const w = (ayah, idx, surah = 112) => ({ surah, ayah, indexInAyah: idx, uthmani: "كلمة", norm: "كلمة" });
const entry = (kind, expected, heard = []) => ({ kind, expected, heard });
/** نتيجة محاذاة: كل آية بكلمتين، مع مواضع تُحدَّد بالحالة. */
function makeResult({ usable = true, ayahs = [1, 2, 3], mods = {} } = {}) {
  const entries = [];
  const weakSpots = [];
  for (const a of ayahs) {
    const m = mods[a] ?? "clean";
    if (m === "clean") {
      entries.push(entry("MATCH", [w(a, 0), w(a, 1)]));
    } else if (m === "missing_start") {
      entries.push(entry("MISSING", [w(a, 0)]));
      entries.push(entry("MATCH", [w(a, 1)]));
      weakSpots.push({ surah: 112, ayah: a, atTransition: true });
    } else if (m === "substituted_mid") {
      entries.push(entry("MATCH", [w(a, 0)]));
      entries.push(entry("SUBSTITUTION", [w(a, 1)], [{ text: "غيرها" }]));
      weakSpots.push({ surah: 112, ayah: a, atTransition: false });
    } else if (m === "uncertain") {
      entries.push(entry("MATCH", [w(a, 0)]));
      entries.push(entry("UNCERTAIN", [w(a, 1)]));
    } else if (m === "unheard") {
      // آية لم تصل أصلًا — لا مدخلات لها
    }
  }
  return { usable, unusableReason: usable ? undefined : "TRANSCRIPT_TOO_SHORT", entries, weakSpots, summary: {} };
}

console.log("\n═══ ١ · البوّابة: من الحكم إلى الجودة ═══");
check("UNJUDGED → null (امتناع لا صفر)", qualityFromVerdict("UNJUDGED", false) === null);
check("UNJUDGED مع تلميح → null أيضًا", qualityFromVerdict("UNJUDGED", true) === null);
check("EXCELLENT بلا تلميح → ٣", qualityFromVerdict("EXCELLENT", false) === 3);
check("VERY_GOOD بلا تلميح → ٢", qualityFromVerdict("VERY_GOOD", false) === 2);
check("NEEDS_LIGHT → ١", qualityFromVerdict("NEEDS_LIGHT", false) === 1);
check("NEEDS_REVIEW → ٠", qualityFromVerdict("NEEDS_REVIEW", false) === 0);
check("التلميح يسقّف EXCELLENT عند ١", qualityFromVerdict("EXCELLENT", true) === 1);
check("التلميح لا يرفع NEEDS_REVIEW", qualityFromVerdict("NEEDS_REVIEW", true) === 0);

console.log("═══ ٢ · المشاهدات: جلسة صحيحة كاملة ═══");
{
  const obs = observationsFromAlignment(makeResult());
  check("ثلاث آيات نظيفات", obs.length === 3 && obs.every((o) => o.kind === "CLEAN"));
  check("لا انتقال في النظيف", obs.every((o) => o.atTransition === false));
}

console.log("═══ ٣ · حذف مؤكَّد واستبدال مؤكَّد ═══");
{
  const obs = observationsFromAlignment(makeResult({ mods: { 2: "missing_start" } }));
  const c = obs.filter((o) => o.kind === "CONFIRMED");
  check("الحذف المؤكَّد → CONFIRMED واحد", c.length === 1 && c[0].ayah === 2);
  check("حذفُ أول الآية → atTransition", c[0].atTransition === true);
  check("بقية الآيات نظيفة", obs.filter((o) => o.kind === "CLEAN").length === 2);

  const obs2 = observationsFromAlignment(makeResult({ mods: { 3: "substituted_mid" } }));
  const c2 = obs2.filter((o) => o.kind === "CONFIRMED");
  check("الاستبدال المؤكَّد → CONFIRMED", c2.length === 1 && c2[0].ayah === 3);
  check("استبدال وسط الآية → ليس انتقالًا", c2[0].atTransition === false);
}

console.log("═══ ٤ · UNCERTAIN لا يلوّث ═══");
{
  const obs = observationsFromAlignment(makeResult({ mods: { 2: "uncertain" } }));
  check("UNCERTAIN لا يصير CONFIRMED أبدًا", obs.every((o) => o.kind !== "CONFIRMED"));
  check("وآيته لا تُشهَد نظيفة", !obs.some((o) => o.ayah === 2));
  check("وجاراتها نظيفات كما هي", obs.filter((o) => o.kind === "CLEAN").length === 2);
}

console.log("═══ ٥ · usable:false لا يُنتج شيئًا ═══");
{
  check("لا مشاهدات من جلسة غير صالحة", observationsFromAlignment(makeResult({ usable: false })).length === 0);
  check(
    "حتى لو حملت weakSpots بالغلط",
    observationsFromAlignment({ ...makeResult({ mods: { 1: "missing_start" } }), usable: false }).length === 0
  );
}

console.log("═══ ٦ · آية لم تصل لا تُشهَد نظيفة ═══");
{
  const obs = observationsFromAlignment(makeResult({ mods: { 3: "unheard" } }));
  check("آيتان فقط — الغائبة لا تشهد", obs.length === 2 && !obs.some((o) => o.ayah === 3));
}

console.log("═══ ٧ · حالة الموضع: مرّة واحدة ليست حكمًا ═══");
{
  const s1 = applyObservation(null, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: true }, "2026-08-24");
  check("تعثّر يوم واحد → confirmDays=1", s1.confirmDays === 1);
  check("انتقالُ يومٍ واحد ≠ ضعف انتقال", !isTransitionPriority(s1));
  check("لكنه نشط يحتاج تثبيتًا", isActive(s1));

  // نفس اليوم مرة ثانية — لا يتضاعف
  const s1b = applyObservation(s1, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: true }, "2026-08-24");
  check("تكرار في نفس اليوم لا يضاعف العقوبة", s1b.confirmDays === 1 && s1b.transitionDays === 1);
}

console.log("═══ ٨ · ضعف الانتقال يحتاج يومين مختلفين ═══");
{
  let s = applyObservation(null, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: true }, "2026-08-24");
  s = applyObservation(s, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: true }, "2026-08-26");
  check(`يومان مختلفان (${TRANSITION_MIN_DISTINCT_DAYS}) → أولوية انتقال`, isTransitionPriority(s));
  check("والتعثّر تراكم يومين", s.confirmDays === 2);
}

console.log("═══ ٩ · التحسّن يُفهم — ولا يُصدَّق من مرّة ═══");
{
  let s = applyObservation(null, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: false }, "2026-08-24");
  s = applyObservation(s, { surah: 112, ayah: 2, kind: "CLEAN", atTransition: false }, "2026-08-25");
  check("قراءة نظيفة واحدة ≠ سكون", !isSettled(s) && isActive(s));
  s = applyObservation(s, { surah: 112, ayah: 2, kind: "CLEAN", atTransition: false }, "2026-08-26");
  check(`نظيفتان في يومين (${SETTLE_MIN_DISTINCT_DAYS}) → سكن`, isSettled(s) && !isActive(s));

  // نفس اليوم لا يعدّ يومين
  let t = applyObservation(null, { surah: 112, ayah: 3, kind: "CONFIRMED", atTransition: false }, "2026-08-24");
  t = applyObservation(t, { surah: 112, ayah: 3, kind: "CLEAN", atTransition: false }, "2026-08-25");
  t = applyObservation(t, { surah: 112, ayah: 3, kind: "CLEAN", atTransition: false }, "2026-08-25");
  check("نظيفتان في يوم واحد = يوم واحد", t.clearDays === 1 && !isSettled(t));
}

console.log("═══ ١٠ · عودة التعثّر تصفّر النظافة لا التاريخ ═══");
{
  let s = applyObservation(null, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: false }, "2026-08-20");
  s = applyObservation(s, { surah: 112, ayah: 2, kind: "CLEAN", atTransition: false }, "2026-08-21");
  s = applyObservation(s, { surah: 112, ayah: 2, kind: "CONFIRMED", atTransition: false }, "2026-08-23");
  check("النظافة صُفِّرت — تُحسب من آخر تعثّر", s.clearDays === 0);
  check("والتاريخ محفوظ — يومان من التعثّر", s.confirmDays === 2);
  check("ويومُ التعثّر لا يقبل شهادة نظافة", applyObservation(s, { surah: 112, ayah: 2, kind: "CLEAN", atTransition: false }, "2026-08-23").clearDays === 0);
}

console.log("═══ ١١ · النظافة لا تُنشئ موضعًا ═══");
{
  const s = applyObservation(null, { surah: 112, ayah: 4, kind: "CLEAN", atTransition: false }, "2026-08-24");
  check("قراءة نظيفة بلا سابقة → لا نشاط", !isActive(s) && s.confirmDays === 0);
}

console.log("═══ ١٢ · ليتنر لم يُمسّ — والقديم المستحق يعمل ═══");
{
  check("الفواصل كما هي", JSON.stringify([...REVIEW_INTERVALS_DAYS]) === "[1,3,7,14,30]");
  check("الصناديق ٠..٥", MAX_BOX === 5);
  check("الإتقان يومان مختلفان", MASTERY_MIN_DISTINCT_DAYS === 2);

  // جلسة تسميع ممتازة تحرّك ليتنر كما تحرّكه جلسة تدريب سواء
  const st = applySession(null, qualityFromVerdict("EXCELLENT", false), "2026-08-24");
  check("جودة التسميع تدخل ليتنر القائم", st.box === 1 && st.dueOn === "2026-08-25");

  // مراجعة استحقت من أسبوع ما زالت مستحقة
  const old = { box: 2, distinctDays: 2, lastReviewedOn: "2026-08-10", dueOn: "2026-08-17" };
  check("المستحق القديم يبقى مستحقًا", isDue(old, "2026-08-24"));
}

console.log("═══ ١٣ · المنهج والقرآن العام ═══");
{
  const lesson = { surah: 112, from_ayah: 1, to_ayah: 4 };
  check("مقطع داخل الدرس → يُحسب له", withinLessonRange({ surah: 112, from_ayah: 1, to_ayah: 4 }, lesson));
  check("جزء من الدرس → يُحسب", withinLessonRange({ surah: 112, from_ayah: 2, to_ayah: 3 }, lesson));
  check("يفيض عن الدرس بآية → لا يُحسب له", !withinLessonRange({ surah: 112, from_ayah: 1, to_ayah: 5 }, lesson));
  check("سورة أخرى → لا يُحسب", !withinLessonRange({ surah: 113, from_ayah: 1, to_ayah: 4 }, lesson));
  check("قبل بداية الدرس → لا يُحسب", !withinLessonRange({ surah: 112, from_ayah: 0, to_ayah: 3 }, lesson));
}

console.log("═══ ١٤ · Idempotency والأمن — من النصوص المنشورة ═══");
{
  const sql = readFileSync("supabase/quran/2026-08-24-phase6-review.sql", "utf8");
  check("فهرس فريد على (user_id, client_key)", /unique index.*client_key_uniq[\s\S]*?\(user_id, client_key\)/.test(sql));
  check("جدول المواضع بسياسة قراءةٍ للمالك", /memory spot read own[\s\S]*?for select/.test(sql));
  check(
    "ولا سياسة كتابةٍ له إطلاقًا — الخادم وحده",
    !/quran_memory_spot[\s\S]*?for (insert|update|delete)/.test(sql)
  );

  const route = readFileSync("src/app/api/quran/recite/finish/route.ts", "utf8");
  check("المسار يردّ الجلسة المكرَّرة", route.includes("DUPLICATE_SESSION"));
  check("المسار يصل التسميع بالمراجعة", route.includes("applyTasmeeToReview"));
  check("العميل يرسل مفتاح الجلسة", readFileSync("src/features/quran/components/ReciteScreen.tsx", "utf8").includes("clientKey: sessionKey.current"));

  const apply = readFileSync("src/features/quran/review/apply-tasmee.ts", "utf8");
  // ⚠️ يُفحص الاستيرادُ والاستدعاء لا مجرّد الذكر — الكلمة قد ترد في تعليقٍ يشبّه بها
  check(
    "الوصلة لا تلمس الحديقة",
    !apply.includes("garden/") && !apply.includes("grantDrops(") && !apply.includes("quran_garden")
  );
  check("الوصلة لا تكتب في quran_event", !apply.includes("quran_event"));
}

console.log(`\n  المراجعة الذكية: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
