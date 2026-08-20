#!/usr/bin/env node
/**
 * اختبارات محرّك «حديقتي».
 *
 * ⚠️ المحرّك خالص بلا قاعدة بيانات ولا واجهة، فيُختبر كاملًا هنا قبل
 * أن يُرسم شيء. والقواعد التي تُفحص هنا ليست تفاصيل: أن لا يُكافأ
 * الكمّ، وأن لا يُثاب على تسميعٍ لم نتأكد منه، وأن لا يُنقص شيء أبدًا
 * — كلها شروطٌ صريحة من صاحبة المنصة، فتُحرَس باختبار لا بنيّة حسنة.
 */

import {
  stageForDrops,
  isComplete,
  progressWithinStage,
  dropsRemaining,
  awardsForRecitation,
  awardsForReview,
  dropsForReasons,
  applyCaps,
  careDays,
  unlockedRewards,
  newlyUnlocked,
  DROPS_TO_COMPLETE,
} from "../../.quran-test/garden/growth.js";
import { GARDEN_TUNING } from "../../.quran-test/garden/tuning.js";
import { PLANT_TYPES, DROP_REASONS } from "../../.quran-test/garden/types.js";

let passed = 0;
let failed = 0;
const ok = (cond, label, extra = "") => {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

console.log("\n  🌱 اختبارات الحديقة\n");

// ── المراحل ────────────────────────────────────────────────
ok(stageForDrops(0) === 0, "صفر قطرات ⇒ بذرة");
ok(stageForDrops(1) === 0, "قطرة واحدة لا تكفي المرحلة الأولى");
ok(stageForDrops(2) === 1, "قطرتان ⇒ بداية الإنبات");
ok(stageForDrops(4) === 2, "أربع ⇒ برعم");
ok(stageForDrops(DROPS_TO_COMPLETE) === 6, "المجموع كاملًا ⇒ المرحلة الأخيرة");
ok(stageForDrops(DROPS_TO_COMPLETE + 50) === 6, "الزيادة لا تتجاوز الأخيرة");
ok(DROPS_TO_COMPLETE === 18, "ثماني عشرة قطرة للنبتة", String(DROPS_TO_COMPLETE));

ok(!isComplete(DROPS_TO_COMPLETE - 1), "قبل الأخيرة بقطرة ليست مكتملة");
ok(isComplete(DROPS_TO_COMPLETE), "بالمجموع تكتمل");

ok(dropsRemaining(0) === DROPS_TO_COMPLETE, "الباقي من الصفر هو المجموع");
ok(dropsRemaining(DROPS_TO_COMPLETE + 5) === 0, "الباقي لا يصير سالبًا");

// ⚠️ لا نقصان أبدًا — يُفحص على كل قيمة لا على عيّنة
let monotonic = true;
let prevStage = -1;
let prevProgress = -1;
for (let d = 0; d <= DROPS_TO_COMPLETE + 10; d++) {
  const s = stageForDrops(d);
  if (s < prevStage) monotonic = false;
  prevStage = s;
  const p = progressWithinStage(d);
  if (p < 0 || p > 1) monotonic = false;
  prevProgress = p;
}
ok(monotonic, "النمو لا يتراجع أبدًا، والتقدّم داخل المرحلة بين ٠ و١");

// ── الاستحقاق ──────────────────────────────────────────────
const base = { usable: true, level: "VERY_GOOD", helpUsed: false, improvedWeakSpots: 0 };

ok(
  awardsForRecitation({ ...base, usable: false }).length === 0,
  "⚠️ جلسة غير صالحة لا تُعطي شيئًا"
);
ok(
  awardsForRecitation({ ...base, level: "UNJUDGED" }).length === 0,
  "⚠️ «ما قدرت أتأكد» لا يُكافأ — الامتناع عن الحكم ليس نجاحًا"
);

ok(
  awardsForRecitation(base).join() === "recitation_completed,recitation_without_help",
  "تسميع صالح بلا عون ⇒ قطرتان"
);
ok(
  awardsForRecitation({ ...base, helpUsed: true }).join() === "recitation_completed",
  "مع طلب العون ⇒ قطرة الالتزام وحدها"
);
ok(
  awardsForRecitation({ ...base, level: "EXCELLENT" }).includes("passage_mastered"),
  "الإتقان الكامل يضيف قطرة"
);
ok(
  !awardsForRecitation({ ...base, level: "NEEDS_REVIEW" }).includes("passage_mastered"),
  "دون الإتقان لا قطرة إتقان"
);
ok(
  awardsForRecitation({ ...base, level: "NEEDS_REVIEW" }).length === 2,
  "⚠️ ومن يحتاج مراجعة لا يُحرم: الالتزام والاستقلال يُكافآن"
);

// ⚠️ التحسّن مرّة واحدة مهما كثرت المواضع — وإلا عاد الكمّ من باب خلفيّ
const one = awardsForRecitation({ ...base, improvedWeakSpots: 1 });
const many = awardsForRecitation({ ...base, improvedWeakSpots: 12 });
ok(one.join() === many.join(), "⚠️ اثنا عشر موضعًا تحسّنت = موضع واحد");
ok(one.includes("weak_spot_improved"), "والتحسّن يُكافأ فعلًا");

ok(awardsForReview({ completed: true }).join() === "review_completed", "المراجعة المنجزة تُكافأ");
ok(awardsForReview({ completed: false }).length === 0, "المراجعة غير المنجزة لا");

// ⚠️ كل الأسباب متساوية — لا سبب يساوي ضعف غيره
const values = DROP_REASONS.map((r) => GARDEN_TUNING.dropValue[r]);
ok(new Set(values).size === 1 && values[0] === 1, "كل الأسباب قطرة واحدة");
ok(dropsForReasons(["recitation_completed", "passage_mastered"]) === 2, "الجمع صحيح");
ok(dropsForReasons([]) === 0, "لا أسباب ⇒ لا قطرات");

// ⚠️ لا بذرة أفضل من بذرة
ok(PLANT_TYPES.length === 5, "خمس بذور");
ok(
  new Set(PLANT_TYPES.map((p) => p.key)).size === PLANT_TYPES.length,
  "لا تكرار في مفاتيح البذور"
);

// ── السقوف ─────────────────────────────────────────────────
ok(
  applyCaps({ grantedToday: 0, held: 0, earned: 3 }).granted === 3,
  "دون السقف يُمنح كل المستحقّ"
);
const day = applyCaps({ grantedToday: 3, held: 0, earned: 3 });
ok(day.granted === 1 && day.cappedByDay === 2, "سقف اليوم يقصّ الزائد", JSON.stringify(day));
ok(
  applyCaps({ grantedToday: GARDEN_TUNING.maxDropsPerDay, held: 0, earned: 4 }).granted === 0,
  "بلغت سقف اليوم ⇒ لا شيء"
);
const hold = applyCaps({ grantedToday: 0, held: GARDEN_TUNING.maxHeldDrops, earned: 4 });
ok(hold.granted === 0 && hold.cappedByHold === 4, "اليد ممتلئة ⇒ لا زيادة");
ok(
  applyCaps({ grantedToday: 99, held: 99, earned: 5 }).granted === 0,
  "⚠️ ولا يُرجع سالبًا مهما تجاوزت الأرقام"
);

// ── أيام العناية ───────────────────────────────────────────
ok(careDays([]) === 0, "لا أيام");
ok(
  careDays(["2026-08-01T10:00:00Z", "2026-08-01T22:00:00Z"]) === 1,
  "سقيتان في يوم = يوم واحد"
);
ok(
  careDays(["2026-08-01T10:00:00Z", "2026-09-20T10:00:00Z"]) === 2,
  "⚠️ الانقطاع شهرًا لا يمحو اليوم الأول"
);

// ── الزينة ─────────────────────────────────────────────────
ok(unlockedRewards({ completedPlants: 0, careDays: 0 }).length === 0, "بداية بلا زينة");
ok(
  unlockedRewards({ completedPlants: 1, careDays: 0 }).includes("stone"),
  "أول نبتة تفتح الحجر"
);
const a = unlockedRewards({ completedPlants: 3, careDays: 0 });
const b = unlockedRewards({ completedPlants: 3, careDays: 0 });
ok(a.join() === b.join(), "⚠️ حتميّة: نفس الإنجاز يفتح نفس الزينة دائمًا");

let rewardsMonotonic = true;
let prevCount = -1;
for (let p = 0; p <= 12; p++) {
  const n = unlockedRewards({ completedPlants: p, careDays: 0 }).length;
  if (n < prevCount) rewardsMonotonic = false;
  prevCount = n;
}
ok(rewardsMonotonic, "⚠️ الزينة لا تُسحب بعد فتحها");

const fresh = newlyUnlocked(
  { completedPlants: 0, careDays: 0 },
  { completedPlants: 1, careDays: 0 }
);
ok(fresh.join() === "stone", "الجديد وحده يُعلن");
ok(
  newlyUnlocked({ completedPlants: 1, careDays: 0 }, { completedPlants: 1, careDays: 0 })
    .length === 0,
  "بلا إنجاز جديد لا إعلان"
);

console.log(`\n  ${passed} نجحت · ${failed} فشلت\n`);
process.exit(failed ? 1 : 0);
