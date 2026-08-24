#!/usr/bin/env node
/**
 * اختبارات المرحلة ٨ — «رحلتي مع القرآن».
 *
 * أهم ما يُحرس: أن الرحلة **تشتقّ ولا تدّعي** — لا «أتقنت ١٠٠٪» لما
 * لم يثبت، ولا تاريخ يُخترع، ولا لفظ يهدم، ولا سرّ ولا صوت في الردّ.
 */

import { readFileSync } from "node:fs";
import {
  ayahStates,
  groupAyahStates,
  surahBuckets,
  timelineFromEvents,
  activeDays,
  spotDisplay,
  goalSegments,
  AYAH_STATE_META,
  MILESTONE_LABEL,
} from "../../.quran-test/engine/journey.js";
import { dayAtOffset, COMPLETION_MIN_BOX } from "../../.quran-test/engine/plan.js";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };

const rev = (surah, from, to, box, dueOn, distinctDays = 1) => ({
  surah, from_ayah: from, to_ayah: to,
  state: { box, distinctDays, lastReviewedOn: null, dueOn },
});
const spot = (surah, ayah, transitionDays = 0, clearDays = 0) => ({
  surah, ayah, confirmDays: 1, clearDays, transitionDays,
});
const TODAY = "2026-09-01";
const kw = (iso) => dayAtOffset(new Date(iso).getTime());

console.log("\n═══ ١ · حالات الآية — الوصول ≠ التثبيت ═══");
{
  const goal = { surah: 67, from_ayah: 1, to_ayah: 10, status: "MEMORIZING" };
  const states = ayahStates(67, 10,
    [rev(67, 1, 3, COMPLETION_MIN_BOX, "2026-10-01", 3), rev(67, 4, 5, 1, "2026-10-01", 1)],
    [spot(67, 5)], goal, TODAY);
  check("المثبتة SETTLED", states[0] === "SETTLED" && states[2] === "SETTLED");
  check("المبلوغة REACHED لا SETTLED", states[3] === "REACHED");
  check("الموضع النشط NEEDS_CARE يغلب", states[4] === "NEEDS_CARE");
  check("ما بعد المدى المعروف MEMORIZING (ضمن الهدف)", states[5] === "MEMORIZING" && states[9] === "MEMORIZING");
  const noGoal = ayahStates(67, 10, [], [], null, TODAY);
  check("بلا شيء: الكل UPCOMING", noGoal.every((s) => s === "UPCOMING"));
}

console.log("═══ ٢ · مستحق اليوم يظهر عنايةً ═══");
{
  const states = ayahStates(112, 4, [rev(112, 1, 4, 2, TODAY, 2)], [], null, TODAY);
  check("المستحق اليوم NEEDS_CARE", states.every((s) => s === "NEEDS_CARE"));
  const future = ayahStates(112, 4, [rev(112, 1, 4, 2, "2026-09-05", 2)], [], null, TODAY);
  check("وغير المستحق يبقى REACHED", future.every((s) => s === "REACHED"));
}

console.log("═══ ٣ · التكتيل — سورة طويلة لا تثقل الصفحة ═══");
{
  const states = ayahStates(2, 286, [rev(2, 1, 20, COMPLETION_MIN_BOX, "2026-10-01", 3)], [], null, TODAY);
  const blocks = groupAyahStates(states);
  check("البقرة كتلتان لا ٢٨٦ عنصرًا", blocks.length === 2);
  check("الكتلة الأولى ١–٢٠ مثبتة", blocks[0].from === 1 && blocks[0].to === 20 && blocks[0].state === "SETTLED");
  check("والثانية ٢١–٢٨٦ قادمة", blocks[1].from === 21 && blocks[1].to === 286 && blocks[1].state === "UPCOMING");
  check("سورة قصيرة نظيفة: كتلة واحدة", groupAyahStates(ayahStates(108, 3, [], [], null, TODAY)).length === 1);
}

console.log("═══ ٤ · رحلة السور — ثلاث سلال ═══");
{
  const goal = { surah: 67, from_ayah: 1, to_ayah: 30, status: "MEMORIZING" };
  const buckets = surahBuckets(
    [rev(112, 1, 4, COMPLETION_MIN_BOX, "2026-10-01", 3), rev(113, 1, 5, 1, "2026-10-01", 1), rev(67, 1, 5, 1, "2026-10-01", 1)],
    goal
  );
  const of = (n) => buckets.find((b) => b.surah === n)?.bucket;
  check("سورة الهدف: جاري الحفظ", of(67) === "MEMORIZING_NOW");
  check("المثبتة كلها: حفظتها وراجعتها", of(112) === "MEMORIZED_REVIEWED");
  check("غير المثبتة: بدأت بها سابقًا", of(113) === "STARTED_BEFORE");
  check("ولا سورة بلا أثر تظهر", buckets.length === 3);
}

console.log("═══ ٥ · التاريخ — لا يُخترع ولا يعرض كل نقرة ═══");
{
  const events = [
    { kind: "goal_completed", surah: 112, created_at: "2026-08-30T10:00:00Z" },
    { kind: "recitation_completed", surah: 112, created_at: "2026-08-30T09:00:00Z" }, // ليس معلمًا
    { kind: "weak_spot_improved", surah: 67, created_at: "2026-08-29T10:00:00Z" },
    { kind: "weak_spot_improved", surah: 67, created_at: "2026-08-29T09:00:00Z" }, // مكرر يومه
  ];
  const tl = timelineFromEvents(events, kw);
  check("معلمان فقط من أربعة أحداث", tl.length === 2);
  check("النقرة العادية لا تظهر", !tl.some((t) => t.label.includes("undefined")));
  check("المكرر في يومه يُدمج", tl.filter((t) => t.label.includes("ثبّتِّ")).length === 1);
  check("سجل فارغ = timeline فارغ — لا ماضٍ يُلفَّق", timelineFromEvents([], kw).length === 0);
  check("كل الأنواع المختارة لها لغة تبني",
    Object.values(MILESTONE_LABEL).every((l) => !/ضعيف|فشل|فاتك|خسر/.test(l)));
}

console.log("═══ ٦ · النشاط بلا سلسلة عقابية ═══");
{
  const days = ["2026-09-01", "2026-08-31", "2026-08-31", "2026-08-20", "2026-07-01"];
  check("أيام مميزة في نافذة أسبوع", activeDays(days, TODAY, 7) === 2);
  check("وفي نافذة شهر", activeDays(days, TODAY, 30) === 3);
  check("القديم خارج النافذة لا يُحسب", activeDays(["2026-01-01"], TODAY, 30) === 0);
}

console.log("═══ ٧ · شريطا الهدف — لا شريط يكذب ═══");
{
  const goal = { surah: 67, from_ayah: 1, to_ayah: 10, status: "MEMORIZING" };
  const states = ayahStates(67, 10,
    [rev(67, 1, 4, COMPLETION_MIN_BOX, "2026-10-01", 3), rev(67, 5, 8, 1, "2026-10-01", 1)],
    [], goal, TODAY);
  const seg = goalSegments(goal, states);
  check("بُلغ ٨ وثبت ٤ — رقمان لا رقم", seg.reached === 8 && seg.settled === 4 && seg.total === 10);
}

console.log("═══ ٨ · المواضع بلغة الطالبة ═══");
{
  check("انتقال يومين = transition", spotDisplay(spot(67, 5, 2)).kind === "transition");
  check("انتقال يوم = spot عادي", spotDisplay(spot(67, 5, 1)).kind === "spot");
  check("انتقال عند الآية ١ لا يشير لما قبلها", spotDisplay(spot(67, 1, 3)).kind === "spot");
}

console.log("═══ ٩ · Accessibility — رمز ووسم لا لون وحده ═══");
{
  const metas = Object.values(AYAH_STATE_META);
  check("كل حالة لها رمز", metas.every((m) => m.symbol.length > 0));
  check("وكل حالة لها وسم عربي", metas.every((m) => m.label.length > 2));
  check("ولا وسم يهدم", metas.every((m) => !/ضعيف|فشل/.test(m.label)));
}

console.log("═══ ١٠ · يوم الكويت في الرحلة ═══");
{
  check("حدث ٢٢:٠٠ UTC يُنسب ليومه الكويتي التالي",
    kw("2026-08-31T22:00:00Z") === "2026-09-01");
}

console.log("═══ ١١ · الخصوصية والنظافة — من النصوص المنشورة ═══");
{
  const api = readFileSync("src/app/api/quran/journey/route.ts", "utf8");
  check("الرحلة وراء الجلسة", api.includes("SIGN_IN_REQUIRED"));
  check("كل قراءة مقيّدة بصاحبتها", (api.match(/eq\('user_id', user\.id\)/g) ?? []).length >= 6);
  check("لا صوت ولا تفريغ يُقرأ", !api.includes("audio") && !api.includes("transcript") && !api.includes("tokens"));
  check("من جلسات التسميع عمود التاريخ وحده", api.includes(".select('created_at')"));
  check("لا مفتاح خدمة — قراءة بجلسة الطالبة", !api.includes("SERVICE_ROLE"));
  check("قراءة خالصة: صفر كتابة", !/\.(insert|update|upsert|delete|rpc)\(/.test(api));
  check("ولا تجويد يُعرض", !/tajweed/i.test(api));

  const screen = readFileSync("src/features/quran/components/JourneyScreen.tsx", "utf8");
  check("لا مصطلح تقني للطالبة", !/confirm_days|transition_days|weak_spot|box/.test(screen));
  check("لا ادعاء ١٠٠٪ إتقان", !screen.includes("أتقنت") && !screen.includes("١٠٠٪"));
  check("الملغى بلا لغة سلبية", !/ألغي|فشل|ملغى/.test(screen) && screen.includes("هدف سابق"));
  check("الفراغ بداية لا حزن", screen.includes("رحلتك تبدأ من أول خطوة"));
  check("مراجعات مكتملة لا Empty حزينة", screen.includes("مراجعاتك اليوم مكتملة"));
  check("النشاط بلا تهديد سلسلة", !screen.includes("سلسلة") && !screen.includes("ستفقد"));
  check("خطة اليوم من مصدر المرحلة ٧ لا نسخة", screen.includes("/api/quran/plan"));
  check("Reduced motion محترم", screen.includes("motion-reduce"));
}

console.log(`\n  الرحلة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
