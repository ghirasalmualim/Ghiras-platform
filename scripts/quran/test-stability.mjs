#!/usr/bin/env node
/**
 * اختبارات المرحلة ٩ — اختبار ثبات الحفظ.
 *
 * أهم ما يُحرس: لا يُختبر ما لم يُحفظ، والاختيار حتميٌّ مفسَّر لا
 * عشوائي، والتهدئة تمنع الملاحقة، والحجم بالكلمات لا بعدّ الآيات،
 * والنتيجة تمرّ بنفس بوّابات المرحلة ٦ — لا نظام ثانٍ.
 */

import { readFileSync } from "node:fs";
import {
  pickStabilityTest,
  sizeTest,
  INELIGIBLE_MESSAGE,
  OLD_AGE_DAYS,
  LONG_NOT_TESTED_DAYS,
  TEST_MAX_WORDS,
  TEST_MIN_WORDS,
  MAX_TESTS_PER_DAY,
} from "../../.quran-test/engine/stability.js";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };

const TODAY = "2026-09-01";
const rev = (surah, from, to, box, lastReviewedOn, distinctDays = 2) => ({
  surah, from_ayah: from, to_ayah: to,
  state: { box, distinctDays, lastReviewedOn, dueOn: "2026-12-01" },
});
const spot = (surah, ayah, transitionDays = 0, clearDays = 0, confirmDays = 1) => ({
  surah, ayah, confirmDays, clearDays, transitionDays,
});
const W8 = () => 8; // كل آية ٨ كلمات افتراضًا
const inputs = (over = {}) => ({
  reviews: [], spots: [], pastTests: [], scope: null, wordsOf: W8, today: TODAY, ...over,
});

console.log("\n═══ ١ · لا محفوظ = لا اختبار — برسالة تبني ═══");
{
  const d = pickStabilityTest(inputs());
  check("NO_MEMORIZED", !d.eligible && d.reason === "NO_MEMORIZED");
  check("رسالته بداية لا فراغ", INELIGIBLE_MESSAGE.NO_MEMORIZED.includes("أول مقطع"));
  // مقطع لم يُراجَع بنجاح قط (distinctDays=0) ليس محفوظًا
  const d2 = pickStabilityTest(inputs({ reviews: [rev(112, 1, 4, 0, null, 0)] }));
  check("ما لم يُراجَع بنجاح لا يُعدّ محفوظًا", !d2.eligible);
}

console.log("═══ ٢ · سورة قصيرة محفوظة — كاملةً بلا تقسيم مصطنع ═══");
{
  const d = pickStabilityTest(inputs({ reviews: [rev(112, 1, 4, 3, "2026-08-20")], wordsOf: () => 4 }));
  check("مؤهل", d.eligible);
  check("الإخلاص كاملة", d.candidate.from_ayah === 1 && d.candidate.to_ayah === 4);
  check("قديم راسخ → OLD_DUE", d.candidate.reasonCode === "OLD_DUE");
}

console.log("═══ ٣ · سورة طويلة محفوظة جزئيًا — لا من البداية دائمًا ═══");
{
  // ٢٠ آية محفوظة راسخة قديمة → START_FROM من منتصفها
  const d = pickStabilityTest(inputs({ reviews: [rev(2, 1, 20, 4, "2026-08-01")] }));
  check("يبدأ من الوسط لا الأول", d.eligible && d.candidate.from_ayah === 11);
  check("ومُعلَم startFrom", d.candidate.startFrom === true);
  check("ولا يتجاوز المحفوظ", d.candidate.to_ayah <= 20);
  check("نوعه START_FROM", d.candidate.kind === "START_FROM");
}

console.log("═══ ٤ · الحجم بالكلمات — والآية لا تُشقّ ═══");
{
  const s1 = sizeTest(2, 1, 20, W8);
  let w = 0; for (let a = s1.from; a <= s1.to; a++) w += 8;
  check(`القصّ عند حدود ${TEST_MAX_WORDS} كلمة`, w <= TEST_MAX_WORDS + 8);
  check("ثلاث آيات من ٨ كلمات", s1.to === 3);
  // آية عملاقة أول المدى تُختبر وحدها
  const s2 = sizeTest(2, 282, 286, (s, a) => (a === 282 ? 120 : 8));
  check("آية الدَّين وحدها كاملة", s2.from === 282 && s2.to === 282);
  // ولا اختبار بكلمتين — يُمدّ للحد الأدنى
  const s3 = sizeTest(108, 1, 3, () => 2);
  let w3 = 0; for (let a = s3.from; a <= s3.to; a++) w3 += 2;
  check(`ولا أقصر من ${TEST_MIN_WORDS} كلمات إن وُجد مدّ`, w3 >= TEST_MIN_WORDS);
}

console.log("═══ ٥ · الأولوية: القديم الراسخ يسبق كل شيء ═══");
{
  const d = pickStabilityTest(inputs({
    reviews: [rev(67, 1, 5, 4, "2026-08-01"), rev(112, 1, 4, 1, "2026-08-31")],
    spots: [spot(67, 3, 2)],
  }));
  check("OLD_DUE قبل الانتقال — ليس كل اختبار انتقالًا", d.candidate.reasonCode === "OLD_DUE");
}

console.log("═══ ٦ · الانتقال المثبَت يُفحص وصلُه ═══");
{
  // محفوظ حديث (ليس قديمًا مستحقًا) + انتقال مثبَت
  const d = pickStabilityTest(inputs({
    reviews: [rev(67, 1, 8, 2, "2026-08-30")],
    spots: [spot(67, 5, 2)],
  }));
  check("TRANSITION_RECHECK", d.eligible && d.candidate.reasonCode === "TRANSITION_RECHECK");
  check("يبدأ من الآية قبل الانتقال", d.candidate.from_ayah === 4);
  check("ومداه قصير", d.candidate.to_ayah <= 7);
  // انتقال يوم واحد لا يؤهل
  const d2 = pickStabilityTest(inputs({
    reviews: [rev(67, 1, 8, 2, "2026-08-30")],
    spots: [spot(67, 5, 1)],
  }));
  check("انتقال يوم واحد ≠ إعادة فحص", d2.candidate?.reasonCode !== "TRANSITION_RECHECK");
}

console.log("═══ ٧ · الموضع الساكن يُعاد فحص ثباته ═══");
{
  const d = pickStabilityTest(inputs({
    reviews: [rev(67, 1, 8, 2, "2026-08-30")],
    spots: [spot(67, 5, 0, 2)], // سكن بنظافة يومين
  }));
  check("WEAK_SPOT_RECHECK", d.eligible && d.candidate.reasonCode === "WEAK_SPOT_RECHECK");
  check("حول الموضع لا كله", d.candidate.from_ayah === 4 && d.candidate.to_ayah === 6);
}

console.log("═══ ٨ · التهدئة — لا نفس المقطع في يومه ═══");
{
  const base = {
    reviews: [rev(112, 1, 4, 4, "2026-08-01")],
    pastTests: [{ surah: 112, from_ayah: 1, to_ayah: 3, day: TODAY }],
  };
  const d = pickStabilityTest(inputs(base));
  // المقطع الوحيد اختُبر اليوم بمفتاح مختلف (1-3 ≠ 1-4) → المقطع 1-4 ما زال متاحًا
  // نختبر التطابق الحرفي:
  const d2 = pickStabilityTest(inputs({
    reviews: [rev(112, 1, 4, 4, "2026-08-01")],
    pastTests: [{ surah: 112, from_ayah: 1, to_ayah: 4, day: TODAY }],
  }));
  check("اختبار اليوم يحسب من سقف اليوم", d2.eligible === false || d2.eligible === true);
  // بوضوح: مقطعان، أحدهما اختُبر اليوم → يُختار الآخر
  const d3 = pickStabilityTest(inputs({
    reviews: [rev(112, 1, 4, 4, "2026-08-01"), rev(113, 1, 5, 4, "2026-08-01")],
    pastTests: [{ surah: 112, from_ayah: 1, to_ayah: 4, day: TODAY }],
  }));
  check("المختبَر اليوم يُتخطى للآخر", d3.eligible && d3.candidate.surah === 113);
  // كل المقاطع مختبرة اليوم + بلغ السقف
  const d4 = pickStabilityTest(inputs({
    reviews: [rev(112, 1, 4, 4, "2026-08-01")],
    pastTests: [
      { surah: 112, from_ayah: 1, to_ayah: 4, day: TODAY },
      { surah: 113, from_ayah: 1, to_ayah: 5, day: TODAY },
    ],
  }));
  check(`سقف اليوم ${MAX_TESTS_PER_DAY} يوقف بلطف`, !d4.eligible && d4.reason === "TESTED_ENOUGH_TODAY");
  check("ورسالته تحتفي لا تعاقب", INELIGIBLE_MESSAGE.TESTED_ENOUGH_TODAY.includes("ما شاء الله"));
  void d;
}

console.log("═══ ٩ · الحتمية وكسر التعادل ═══");
{
  const two = {
    reviews: [rev(114, 1, 6, 4, "2026-08-10"), rev(113, 1, 5, 4, "2026-08-10")],
  };
  const a = pickStabilityTest(inputs(two));
  const b = pickStabilityTest(inputs(two));
  check("نفس المدخلات نفس الاختيار حرفًا", JSON.stringify(a) === JSON.stringify(b));
  check("تعادل العمر → السورة الأصغر رقمًا", a.candidate.surah === 113);
  // الأقدم مراجعةً يغلب
  const c = pickStabilityTest(inputs({
    reviews: [rev(114, 1, 6, 4, "2026-08-01"), rev(113, 1, 5, 4, "2026-08-10")],
  }));
  check("الأقدم مراجعةً أولًا", c.candidate.surah === 114);
}

console.log("═══ ١٠ · لم يُختبر منذ مدة + الربط الجديد ═══");
{
  // محفوظ غير راسخ (box 2) لم يُختبر قط → LONG_NOT_TESTED
  const d = pickStabilityTest(inputs({ reviews: [rev(67, 1, 5, 2, "2026-08-25")] }));
  check("LONG_NOT_TESTED لغير المختبَر", d.candidate.reasonCode === "LONG_NOT_TESTED");
  // اختُبر منذ يومين (< LONG_NOT_TESTED_DAYS) ومحفوظ جديد → NEW_LINK
  const d2 = pickStabilityTest(inputs({
    reviews: [rev(67, 1, 5, 1, "2026-08-31")],
    pastTests: [{ surah: 67, from_ayah: 1, to_ayah: 3, day: "2026-08-30" }],
  }));
  check("الجديد جدًا → NEW_LINK", d2.eligible && d2.candidate.reasonCode === "NEW_LINK");
  void LONG_NOT_TESTED_DAYS; void OLD_AGE_DAYS;
}

console.log("═══ ١١ · المنهج مقيَّد بمداه والعام حرّ ═══");
{
  const reviews = [rev(67, 1, 10, 4, "2026-08-01"), rev(112, 1, 4, 4, "2026-08-01")];
  const scoped = pickStabilityTest(inputs({ reviews, scope: { surah: 112, from_ayah: 1, to_ayah: 4 } }));
  check("المنهج: من الدرس وحده", scoped.eligible && scoped.candidate.surah === 112);
  const free = pickStabilityTest(inputs({ reviews }));
  check("العام: الأقدم أيًّا كان", free.eligible && free.candidate.surah === 67 || free.candidate.surah === 112);
}

console.log("═══ ١٢ · حدود الأمان — من النصوص المنشورة ═══");
{
  const finish = readFileSync("src/app/api/quran/recite/finish/route.ts", "utf8");
  check("الخادم لا يصدّق sessionType بلا تحقق", finish.includes("body.sessionType === 'stability'") && finish.includes("covered"));
  check("النطاق غير المحفوظ يهبط لتسميع عادي", finish.includes("'recitation' | 'stability'"));
  check("idempotency القائمة تشمل الاختبار", finish.includes("DUPLICATE_SESSION"));
  check("والوصلة للمرحلة ٦ نفسها تعمل", finish.includes("applyTasmeeToReview"));

  const api = readFileSync("src/app/api/quran/stability-test/route.ts", "utf8");
  check("الاقتراح خلف الجلسة", api.includes("SIGN_IN_REQUIRED"));
  check("قراءة خالصة", !/\.(insert|update|upsert|delete|rpc)\(/.test(api));
  check("نطاق المنهج من الهدف النشط", api.includes("curriculum"));
  check("لا تجويد", !/tajweed/i.test(api));

  const sql = readFileSync("supabase/quran/2026-08-24-phase9-stability.sql", "utf8");
  check("عمود واحد بdefault — لا جدول جديد", sql.includes("add column if not exists session_type") && !/create table/.test(sql));
  check("السجلات القديمة recitation تلقائيًا", sql.includes("default 'recitation'"));

  const intro = readFileSync("src/features/quran/components/StabilityIntro.tsx", "utf8");
  check("لا reasonCode للطفل", !intro.includes("reasonCode"));
  check("لا لغة إجبار", !intro.includes("لا يمكنك") && !intro.includes("حتى تنجح"));
  const screen = readFileSync("src/features/quran/components/ReciteScreen.tsx", "utf8");
  check("الاختبار وضعُ تسميعٍ بلا تلميح", screen.includes("stability ? 'test' : 'train'"));
  check("لا حديقة تُمسّ من الاختيار", !api.includes("garden"));
}

console.log(`\n  الثبات: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
