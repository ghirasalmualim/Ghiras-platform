#!/usr/bin/env node
/**
 * اختبارات المرحلة ٧ — خطة الحفظ الشخصية.
 *
 * أهم ما يُحرس: أن الخطة لا تظلم — لا تقسم بعدّ الآيات الأعمى،
 * ولا تضاعف الحمل بعد الغياب، ولا تدفن المراجعة تحت الجديد، ولا
 * تبني مستحيلًا وتسكت. وأنها حتمية: نفس المدخلات نفس الخطة حرفًا.
 */

import { readFileSync } from "node:fs";
import {
  buildMemorizationPlan,
  goalStatus,
  consolidationDays,
  dayAtOffset,
  dayOfWeek,
  todayPlanDay,
  feasibilityMessage,
  DAILY_WORD_BUDGET,
  MAX_WORDS_PER_DAY,
  COMPLETION_MIN_BOX,
} from "../../.quran-test/engine/plan.js";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };

/* ── عُدّة ── */
const goal = (over = {}) => ({
  surah: 67, from_ayah: 1, to_ayah: 10, targetDate: null, startDate: "2026-09-01",
  daysOfWeek: [], intensity: "balanced", ...over,
});
/** آيات متساوية الكلمات افتراضًا — وتُخصَّص عند الحاجة. */
const words = (n, w = 8) => new Array(n).fill(w);
const inputs = (over = {}) => ({
  goal: goal(), ayahWords: words(10), verifiedUpTo: 0, userMarkedUpTo: 0,
  reviews: [], spots: [], today: "2026-09-01", ...over,
});
const rev = (surah, from, to, box, dueOn, distinctDays = 1) => ({
  surah, from_ayah: from, to_ayah: to,
  state: { box, distinctDays, lastReviewedOn: null, dueOn },
});

console.log("\n═══ ١ · الوزن بالكلمات لا بعدّ الآيات ═══");
{
  // آية عملاقة (40 كلمة) وسط قصار — لا تُشقّ وتأخذ يومها وحدها
  const aw = [5, 5, 40, 5, 5, 5, 5, 5, 5, 5];
  const plan = buildMemorizationPlan(inputs({ ayahWords: aw }));
  const giant = plan.days.find((d) => d.newMemorization && d.newMemorization.from_ayah <= 3 && d.newMemorization.to_ayah >= 3);
  check("الآية الطويلة لا تُشقّ", giant !== undefined);
  check("وتأخذ يومها وحدها", giant.newMemorization.from_ayah === 3 && giant.newMemorization.to_ayah === 3);
  // والقصار تُجمع: أول يوم يضم أكثر من آية
  const first = plan.days.find((d) => d.newMemorization);
  check("القصار تُجمع في يوم واحد", first.newMemorization.to_ayah > first.newMemorization.from_ayah);
}

console.log("═══ ٢ · سورة قصيرة ونطاق آيات ═══");
{
  const p1 = buildMemorizationPlan(inputs({ goal: goal({ surah: 112, to_ayah: 4 }), ayahWords: [4, 2, 4, 6] }));
  const memDays = p1.days.filter((d) => d.newMemorization);
  check("سورة قصيرة تنقضي في يوم أو يومين", memDays.length >= 1 && memDays.length <= 2);
  const last = memDays[memDays.length - 1];
  check("وتبلغ آخر المدى", last.newMemorization.to_ayah === 4);

  const p2 = buildMemorizationPlan(inputs({ goal: goal({ from_ayah: 3, to_ayah: 7 }), ayahWords: words(5) }));
  const m2 = p2.days.filter((d) => d.newMemorization);
  check("نطاق آيات يبدأ من أوله", m2[0].newMemorization.from_ayah === 3);
  check("ولا يفيض عن آخره", m2[m2.length - 1].newMemorization.to_ayah === 7);
}

console.log("═══ ٣ · بلا موعد: وتيرة الشدّة ═══");
{
  const light = buildMemorizationPlan(inputs({ goal: goal({ intensity: "light" }) }));
  const intense = buildMemorizationPlan(inputs({ goal: goal({ intensity: "intense" }) }));
  const daysOf = (p) => p.days.filter((d) => d.newMemorization).length;
  check("الخفيفة أيامها أكثر من المكثفة", daysOf(light) > daysOf(intense));
  check("بلا موعد لا واقعية تُحسب", light.wordsPerDayNeeded === null && light.feasibility === "OK");
}

console.log("═══ ٤ · موعد قريب وموعد مستحيل ═══");
{
  // 10 آيات × 8 كلمات = 80 كلمة في 3 أيام ⇒ ~40/يوم > ميزانية 20 ⇒ TIGHT
  const tight = buildMemorizationPlan(inputs({ goal: goal({ targetDate: "2026-09-03" }) }));
  check("موعد قريب ⇒ TIGHT", tight.feasibility === "TIGHT");
  check("ورسالته تصارح بلا إحباط", /قريب|أثقل/.test(feasibilityMessage("TIGHT")));

  // 80 كلمة غدًا ⇒ 80 > سقف الرحمة 48 ⇒ UNREALISTIC
  const impossible = buildMemorizationPlan(inputs({ goal: goal({ targetDate: "2026-09-01" }) }));
  check("موعد مستحيل ⇒ UNREALISTIC", impossible.feasibility === "UNREALISTIC");
  check("ورسالته تقترح التمديد", /تمديد/.test(feasibilityMessage("UNREALISTIC")));
  // ولا يُبنى المستحيل: لا يومَ فوق سقف الرحمة
  for (const d of impossible.days) {
    if (!d.newMemorization) continue;
    let w = 0;
    for (let a = d.newMemorization.from_ayah; a <= d.newMemorization.to_ayah; a++) w += 8;
    check("ولا يومَ فوق سقف الرحمة", w <= MAX_WORDS_PER_DAY);
    break;
  }
}

console.log("═══ ٥ · ذيل التثبيت — آخر الخطة ليس حفظًا ═══");
{
  check("خُمس الأيام بين ١ و٣", consolidationDays(10) === 2 && consolidationDays(30) === 3 && consolidationDays(4) === 1 && consolidationDays(1) === 0);
  const p = buildMemorizationPlan(inputs({ goal: goal({ targetDate: "2026-09-10" }) }));
  const lastDays = p.days.slice(-2);
  check("آخر أيام الموعد بلا حفظ جديد", lastDays.every((d) => !d.newMemorization));
}

console.log("═══ ٦ · الغياب: إعادة توزيع بلا مضاعفة ═══");
{
  const base = inputs({ goal: goal({ targetDate: "2026-09-10" }) });
  const p1 = buildMemorizationPlan(base);
  const day1 = p1.days.find((d) => d.newMemorization);
  // غابت ثلاثة أيام — نفس المدخلات واليوم صار 4/9
  const p2 = buildMemorizationPlan({ ...base, today: "2026-09-04" });
  const day2 = p2.days.find((d) => d.newMemorization);
  check("بعد الغياب تُبنى خطة من جديد", day2 !== undefined);
  const wordsOf = (d) => (d.newMemorization.to_ayah - d.newMemorization.from_ayah + 1) * 8;
  check("ولا يُجمع واجب ٣ أيام في يوم", wordsOf(day2) <= MAX_WORDS_PER_DAY);
  check("واليوم الأول لم يكن أصلًا فوق السقف", wordsOf(day1) <= MAX_WORDS_PER_DAY);
}

console.log("═══ ٧ · التقدّم الأسرع يخفّف ما بعده ═══");
{
  const slow = buildMemorizationPlan(inputs());
  const fast = buildMemorizationPlan(inputs({ verifiedUpTo: 6 }));
  const remaining = (p) => p.days.filter((d) => d.newMemorization).length;
  check("المتقدّمة أيام حفظها أقل", remaining(fast) < remaining(slow));
  const first = fast.days.find((d) => d.newMemorization);
  check("وتبدأ من بعد الموثوق لا من أوله", first.newMemorization.from_ayah === 7);
}

console.log("═══ ٨ · قول الطالبة يقدّم الجديد ولا يشهد ═══");
{
  const p = buildMemorizationPlan(inputs({ userMarkedUpTo: 5 }));
  const first = p.days.find((d) => d.newMemorization);
  check("«بلغت ٥» تبدأ الجديد من ٦", first.newMemorization.from_ayah === 6);
  // لكن الحالة لا تكتمل بقولها
  const st = goalStatus(goal(), 0, 10, []);
  check("بلوغ الآخر بقولها = FULL_RANGE_REACHED لا أكثر", st === "FULL_RANGE_REACHED");
}

console.log("═══ ٩ · المراجعة لا تُدفن تحت الجديد ═══");
{
  const manyReviews = Array.from({ length: 6 }, (_, i) => rev(1, i * 3 + 1, i * 3 + 3, i % 2, "2026-09-01"));
  const p = buildMemorizationPlan(inputs({ reviews: manyReviews }));
  const d1 = p.days[0];
  check("المراجعات المستحقة تُخدم أول يوم", d1.nearReview.length + d1.periodicReview.length > 0);
  // ومع الازدحام ينكمش الجديد عن يومٍ خالٍ
  const clean = buildMemorizationPlan(inputs());
  const newWords = (d) => (d?.newMemorization ? (d.newMemorization.to_ayah - d.newMemorization.from_ayah + 1) * 8 : 0);
  check("الجديد ينكمش يوم تزدحم المراجعة", newWords(p.days[0]) < newWords(clean.days[0]));
  check("ولا يختفي حق القديم: قريبة ودورية معًا",
    p.days[0].nearReview.every((r) => r.state.box <= 1) && p.days[0].periodicReview.every((r) => r.state.box >= 2));
}

console.log("═══ ١٠ · مواضع التثبيت في الخطة ═══");
{
  const spots = [
    { surah: 67, ayah: 3, transitionDays: 2, confirmDays: 2, clearDays: 0 },
    { surah: 67, ayah: 7, transitionDays: 0, confirmDays: 1, clearDays: 0 },
  ];
  const p = buildMemorizationPlan(inputs({ spots }));
  check("المواضع تدخل أيام الخطة", p.days[0].weakSpotPractice.length > 0);
  check("والانتقال المتكرّر يتقدّم", p.days[0].weakSpotPractice[0].ayah === 3);
  const none = buildMemorizationPlan(inputs());
  check("وبلا مواضع لا قسم تثبيت", none.days.every((d) => d.weakSpotPractice.length === 0));
}

console.log("═══ ١١ · أيام الأسبوع المتاحة ═══");
{
  // الأحد فقط (٠) — أيام الحفظ أحدٌ كلها، والمراجعة تُخدم في غيرها
  const p = buildMemorizationPlan(inputs({
    goal: goal({ daysOfWeek: [0] }),
    reviews: [rev(1, 1, 3, 2, "2026-09-02")],
  }));
  for (const d of p.days)
    if (d.newMemorization) check("الحفظ في المتاح وحده", dayOfWeek(d.date) === 0);
  const offDay = p.days.find((d) => dayOfWeek(d.date) !== 0 && (d.nearReview.length + d.periodicReview.length));
  check("والمراجعة تُخدم حتى في غير المتاح", offDay !== undefined);
}

console.log("═══ ١٢ · دورة حياة الهدف ═══");
{
  const g = goal({ to_ayah: 4, surah: 112 });
  check("قبل البلوغ: MEMORIZING", goalStatus(g, 2, 0, []) === "MEMORIZING");
  check("بلوغ موثوق: CONSOLIDATING", goalStatus(g, 4, 0, []) === "CONSOLIDATING");
  const strong = [rev(112, 1, 4, COMPLETION_MIN_BOX, "2026-10-01", 3)];
  check("مدًى راسخ كاملًا: COMPLETED", goalStatus(g, 4, 0, strong) === "COMPLETED");
  const partial = [rev(112, 1, 2, COMPLETION_MIN_BOX, "2026-10-01", 3)];
  check("رسوخ نصف المدى لا يكمل", goalStatus(g, 4, 0, partial) === "CONSOLIDATING");
  check("والوصول لآخر آية وحده لا يكمل شيئًا", goalStatus(g, 4, 0, [rev(112, 1, 4, 1, "2026-10-01")]) !== "COMPLETED");
}

console.log("═══ ١٣ · Determinism ═══");
{
  const a = JSON.stringify(buildMemorizationPlan(inputs({ reviews: [rev(1, 1, 3, 1, "2026-09-01")] })));
  const b = JSON.stringify(buildMemorizationPlan(inputs({ reviews: [rev(1, 1, 3, 1, "2026-09-01")] })));
  check("نفس المدخلات نفس الخطة حرفًا", a === b);
}

console.log("═══ ١٤ · يوم الكويت ═══");
{
  // ٢٢:٣٠ UTC = ١:٣٠ فجرًا في الكويت — اليوم التالي
  check("منتصف الليل ينقلب بتوقيت الكويت لا UTC",
    dayAtOffset(Date.UTC(2026, 8, 1, 22, 30)) === "2026-09-02");
  check("والظهر يبقى يومه", dayAtOffset(Date.UTC(2026, 8, 1, 9, 0)) === "2026-09-01");
  check("وقابلة للتوسّع بإزاحة أخرى", dayAtOffset(Date.UTC(2026, 8, 1, 22, 30), 0) === "2026-09-01");
}

console.log("═══ ١٥ · انقضاء الموعد وتغيير الإعدادات ═══");
{
  const p = buildMemorizationPlan(inputs({ goal: goal({ targetDate: "2026-08-20" }) }));
  check("موعد منقضٍ يُعلَم overdue", p.overdue === true);
  check("ولا حفظ جديد يُكدَّس بعده", p.days.every((d) => !d.newMemorization));

  // تغيير الشدّة يعيد الأيام القادمة فقط — الحساب من نفس المؤشر
  const before = buildMemorizationPlan(inputs({ verifiedUpTo: 4 }));
  const after = buildMemorizationPlan(inputs({ verifiedUpTo: 4, goal: goal({ intensity: "light" }) }));
  const s1 = before.days.find((d) => d.newMemorization);
  const s2 = after.days.find((d) => d.newMemorization);
  check("تغيير الشدّة لا يمسّ الموثوق", s1.newMemorization.from_ayah === 5 && s2.newMemorization.from_ayah === 5);
}

console.log("═══ ١٦ · نصيب اليوم وتقديره ═══");
{
  const p = buildMemorizationPlan(inputs());
  const d = todayPlanDay(p, "2026-09-01");
  check("نصيب اليوم يُلتقط", d !== null && d.date === "2026-09-01");
  check("وله تقدير دقائق لطيف", d.estimatedMinutes >= 2 && d.estimatedMinutes <= 30);
  check("ولا نصيب ليومٍ خارج الخطة", todayPlanDay(p, "2030-01-01") === null);
  check("وسبب اليوم داخلي موجود", typeof d.reason === "string" && d.reason.length > 0);
}

console.log("═══ ١٧ · المنهج والقرآن العام — من النصوص المنشورة ═══");
{
  const api = readFileSync("src/app/api/quran/goal/route.ts", "utf8");
  check("الخادم يصدّق النطاق على المصحف", api.includes("getSurah") && api.includes("BAD_RANGE"));
  check("وحدود الدرس تُفحص خادميًا", api.includes("withinLessonRange") && api.includes("OUTSIDE_LESSON"));
  check("والإلغاء لا يحذف تقدّمًا", api.includes("CANCELLED") && !api.includes("quran_review_state") && !api.includes("quran_memory_spot"));
  check("و«بلغت» تُقصّ إلى مدى الهدف", api.includes("Math.min(Number(g.to_ayah)"));

  const sql = readFileSync("supabase/quran/2026-08-24-phase7-plan.sql", "utf8");
  check("لا جدول هدف ثانٍ", !/create table/.test(sql));
  check("والأحداث الجديدة محايدة", sql.includes("plan_day_completed") && sql.includes("goal_completed"));
  check("ولا مساس بالحديقة", !/garden|drop_reason|tuning/i.test(sql));

  const planApi = readFileSync("src/app/api/quran/plan/route.ts", "utf8");
  check("خطة اليوم تُحسب على الخادم بيوم الكويت", planApi.includes("dayAtOffset"));
  check("والتقدّم الموثوق من جداول المرحلة ٦", planApi.includes("quran_review_state") && planApi.includes("quran_memory_spot"));
}

console.log(`\n  خطة الحفظ: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
