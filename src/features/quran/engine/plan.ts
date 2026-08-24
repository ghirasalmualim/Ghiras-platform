/**
 * خطة الحفظ الشخصية — «شنو أحفظ اليوم؟ وشنو أراجع؟»
 *
 * ═══ محرّك واحد للمنهج والقرآن العام ═══
 * كعهد `planner.ts` الأول: الفرق مصدرُ الهدف لا طريقةُ تقسيمه.
 * درسُ المنهج هدفٌ حدودُه حدودُ الدرس، والهدف الشخصي حدودُه ما
 * اختارته الطالبة — وما بعد ذلك دالّة واحدة.
 *
 * ═══ لا تُخزَّن الخطة، بل تُحسب ═══
 * نفس قرار المرحلة ٢ ونصُّه في SQL: خطةٌ مخزَّنة تفسد يومَ أول
 * غياب وتحتاج وظيفةً تعيد بناءها. أما المحسوبة من (المتبقي، الأيام
 * المتاحة، التقدّم الموثوق، المراجعات المستحقة) فتصحّح نفسها:
 * الغياب يعيد التوزيع بلا أحد، والتقدّم الأسرع يخفّف ما بعده.
 *
 * ═══ الوزن بالكلمات لا بعدّ الآيات ═══
 * «٢٠ آية ÷ ٥ أيام» ظلمٌ أعمى: آية الدَّين وحدها أطول من سورة
 * كاملة. فالمقدار اليومي ميزانيةُ **كلمات**، والآية وحدةٌ لا تُشقّ
 * — آيةٌ أطول من الميزانية تأخذ يومها كاملًا وحدها.
 *
 * ═══ ثبات الحفظ أهم من سرعة الإنجاز ═══
 * المراجعات المستحقة ومواضعُ التثبيت تُحمَّل على ميزانية اليوم
 * **قبل** الحفظ الجديد، فإذا تراكمت انكمش الجديد ولم تُدفَن هي.
 *
 * ═══ دوال نقية ═══
 * «اليوم» يأتي في المدخلات، ولا عشوائية في أي قرار — نفس المدخلات
 * تعطي نفس الخطة حرفًا بحرف، فتُختبر على أي تاريخ.
 *
 * ═══ اليوم يومُ الكويت ═══
 * كل تواريخ هذا الملف أيامٌ مجرّدة `YYYY-MM-DD` بتقويم الكويت
 * (UTC+3 ثابتًا بلا توقيت صيفي — نفس مصطلح `daytime.ts` و`fmtDate`).
 * المحرّك لا يقرأ ساعةً أصلًا؛ والطبقة التي تناديه تحسب «اليوم»
 * بـ`kwToday()` من `data/plan.ts`. ولمّا تتوسع المنصة خارج الكويت
 * يتبدّل حسابُ «اليوم» في تلك الدالة وحدها والمحرّك كما هو.
 */

import { addDays, daysBetween, isMastered, type ReviewState } from './review';
import type { DueSegment } from './planner';

/* ═══════════════ ١ · الأنواع ═══════════════ */

export type PlanIntensity = 'light' | 'balanced' | 'intense';

/* ═════════════════════════════════════════════════════════════
 * ⚠️ USER_VALIDATION_REQUIRED — معايرة الخطة كلها هنا
 * ═════════════════════════════════════════════════════════════
 *
 * كل رقم في هذه الكتلة **اجتهادٌ تجريبي لا قرار تربوي نهائي** —
 * كأرقام الحديقة يومَ وُلدت. لم يجرّبها مستخدم حقيقي بعد، وتُراجَع
 * بعد تجربة مستخدمين (بند PLAN_TUNING_VALIDATION في ورقة الحالة).
 * تعديل أيٍّ منها سطرٌ واحد هنا ولا يمسّ منطقًا.
 */

/**
 * ميزانية الكلمات اليومية لكل شدّة. مرجعها التقريبي: قصار المفصّل
 * ١٠–٢٥ كلمة للسورة — فالخفيفة نصف سورة قصيرة والمكثفة نحو سورة.
 */
export const DAILY_WORD_BUDGET: Record<PlanIntensity, number> = {
  light: 12,
  balanced: 20,
  intense: 32,
};

/** فوق هذا الحدّ لا يُحمَّل يومٌ مهما ضاق الموعد — سقفُ رحمة. */
export const MAX_WORDS_PER_DAY = 48;

/**
 * كلفة عناصر المراجعة بالكلمات المكافئة — تُخصم من ميزانية اليوم
 * قبل الحفظ الجديد.
 */
export const REVIEW_WORD_COST = 6;
export const SPOT_WORD_COST = 3;

/** أقصى ما يُخدم يوميًّا من كل نوع — قريبة، دورية، مواضع. */
export const MAX_NEAR_PER_DAY = 2;
export const MAX_PERIODIC_PER_DAY = 2;
export const MAX_SPOTS_PER_DAY = 2;

/**
 * رسوخُ الاكتمال: المدى كله بمقاطع صندوقها ≥ هذا الرقم قبل أن
 * يُقال «اكتمل». ٣ = دون الإتقان الكامل (٤ + يومان) وفوق البداية.
 * ⚠️ قرارٌ تربوي يُراجع بعد تجربة حقيقية.
 */
export const COMPLETION_MIN_BOX = 3;

/** التقدير الزمني: كلمات/دقيقة تقريبًا — للعرض فقط، لا يدخل قرارًا. */
const WORDS_PER_MINUTE = 4;

/* ═══════════ نهاية كتلة USER_VALIDATION_REQUIRED ═══════════ */

/** نصيب التثبيت من ذيل خطةٍ لها موعد: خُمس الأيام، بين يوم وثلاثة. */
export function consolidationDays(totalDays: number): number {
  if (totalDays <= 1) return 0;
  return Math.max(1, Math.min(3, Math.floor(totalDays / 5)));
}

export type GoalStatus =
  | 'MEMORIZING'
  | 'FULL_RANGE_REACHED'
  | 'CONSOLIDATING'
  | 'COMPLETED'
  | 'CANCELLED';

export type PlanGoal = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  /** null = خطة مرنة بلا موعد — لا نخترع تاريخًا. */
  targetDate: string | null;
  startDate: string;
  /** أيام الأسبوع المتاحة للحفظ: ٠=الأحد … ٦=السبت. */
  daysOfWeek: number[];
  intensity: PlanIntensity;
};

export type SpotLite = {
  surah: number;
  ayah: number;
  transitionDays: number;
  confirmDays: number;
  clearDays: number;
};

export type PlanInputs = {
  goal: PlanGoal;
  /** كلمات كل آية في مدى الهدف — `ayahWords[0]` للآية `from_ayah`. */
  ayahWords: number[];
  /**
   * آخر آية ثبت تقدّمها **من الأنظمة** (مراجعة/تسميع) — لا من زرّ.
   * ٠ = لم يثبت شيء.
   */
  verifiedUpTo: number;
  /** آخر آية قالت الطالبة إنها بلغتها — للراحة، ويُفرَّق بينهما. */
  userMarkedUpTo: number;
  /** مقاطع الطالبة وحالاتها — من المرحلة ٦ (`quran_review_state`). */
  reviews: DueSegment[];
  /** مواضع التثبيت النشطة — من المرحلة ٦ (`quran_memory_spot`). */
  spots: SpotLite[];
  /** يوم الكويت الحالي YYYY-MM-DD. */
  today: string;
};

export type PlanDayV2 = {
  date: string;
  /** 🧠 الحفظ الجديد — آياتٌ من مدى الهدف، أو null في أيام بلا جديد. */
  newMemorization: { surah: number; from_ayah: number; to_ayah: number } | null;
  /** 🔄 مراجعة قريبة — محفوظٌ حديث (صندوق ≤ ١). */
  nearReview: DueSegment[];
  /** 🌿 مراجعة دورية — محفوظٌ قديم (صندوق ≥ ٢). */
  periodicReview: DueSegment[];
  /** 🎯 تثبيت مواضع — من «سمّع لي». */
  weakSpotPractice: SpotLite[];
  /** تقدير لطيف للعرض — ليس مؤقّتًا ولا يدخل في إتقان. */
  estimatedMinutes: number;
  /** لماذا بُني اليوم هكذا — داخلي، لا يُعرض للطالبة. */
  reason: string;
};

export type Feasibility = 'OK' | 'TIGHT' | 'UNREALISTIC';

export type MemorizationPlan = {
  days: PlanDayV2[];
  /** واقعية الموعد — تُترجم في الواجهة رسائلَ لا أرقامًا. */
  feasibility: Feasibility;
  /** كم كلمة يحتاج اليومُ الواحد لبلوغ الموعد — للتشخيص. */
  wordsPerDayNeeded: number | null;
  /** انقضى الموعد ولم يكتمل. */
  overdue: boolean;
};

/* ═══════════════ ٢ · عُدّة صغيرة ═══════════════ */

/**
 * يوم الكويت من لحظة UTC — `UTC+3` ثابتًا بلا توقيت صيفي، نفس
 * مصطلح `daytime.ts` و`fmtDate` حرفًا.
 *
 * ⚠️ «اليوم» و«فات يوم» بتقويم الكويت لا UTC: الساعة ٢٣:٣٠ UTC هي
 * ٢:٣٠ فجرًا في الكويت — يومٌ تالٍ. لو اعتمدنا UTC لتأخّر انقلاب
 * اليوم ثلاث ساعات فبقيت «خطة اليوم» أمسيّةً بعد الفجر.
 *
 * وللتوسّع مستقبلًا: الإزاحة معاملٌ — منطقة أخرى تمرّر إزاحتها هنا
 * ولا يتغيّر في المحرّك حرف.
 */
export const KUWAIT_UTC_OFFSET_MIN = 3 * 60;

export function dayAtOffset(msUtc: number, offsetMin = KUWAIT_UTC_OFFSET_MIN): string {
  return new Date(msUtc + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** ٠=الأحد … ٦=السبت — من يوم مجرّد، بلا منطقة زمنية خفية. */
export function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

function isAvailable(day: string, daysOfWeek: number[]): boolean {
  if (!daysOfWeek.length) return true; // بلا تحديد = كل الأيام
  return daysOfWeek.includes(dayOfWeek(day));
}

/** مجموع كلمات المدى [from..to] داخل مدى الهدف. */
function wordsIn(goal: PlanGoal, ayahWords: number[], from: number, to: number): number {
  let sum = 0;
  for (let a = from; a <= to; a++) sum += ayahWords[a - goal.from_ayah] ?? 0;
  return sum;
}

/* ═══════════════ ٣ · حالة الهدف ═══════════════ */

/**
 * دورة حياة الهدف — الوصول إلى آخر آية ليس نهاية:
 *
 *   MEMORIZING → FULL_RANGE_REACHED → CONSOLIDATING → COMPLETED
 *
 * ⚠️ البلوغ يقبل قولَ الطالبة (`userMarkedUpTo`) لأنه انتقالُ طورٍ
 * لا شهادة — لكن **COMPLETED لا يُمنح إلا بتقدّم موثوق**: كلُّ
 * المدى مغطًّى بمقاطع بلغ صندوقُها ٣ فأكثر. رقم ٣ اجتهادٌ معلن:
 * دون الإتقان الكامل (٤ + يومان) وفوق البداية — «رسخ» لا «اكتمل
 * حرفًا». والمقطع المتقن (`isMastered`) يُقبل كذلك.
 */
export function goalStatus(
  goal: PlanGoal,
  verifiedUpTo: number,
  userMarkedUpTo: number,
  reviews: DueSegment[]
): Exclude<GoalStatus, 'CANCELLED'> {
  const reached = Math.max(verifiedUpTo, userMarkedUpTo) >= goal.to_ayah;
  if (!reached) return 'MEMORIZING';

  // هل المدى كله مغطًّى بمقاطع راسخة؟
  const covered: boolean[] = new Array(goal.to_ayah - goal.from_ayah + 1).fill(false);
  for (const r of reviews) {
    if (r.surah !== goal.surah) continue;
    const strong = r.state.box >= COMPLETION_MIN_BOX || isMastered(r.state);
    if (!strong) continue;
    for (let a = Math.max(r.from_ayah, goal.from_ayah); a <= Math.min(r.to_ayah, goal.to_ayah); a++)
      covered[a - goal.from_ayah] = true;
  }
  if (covered.every(Boolean)) return 'COMPLETED';

  // بلغ الآخر بتقدّم موثوق → تثبيت. بقول الطالبة وحده → بلوغٌ يُثبَّت
  return verifiedUpTo >= goal.to_ayah ? 'CONSOLIDATING' : 'FULL_RANGE_REACHED';
}

/* ═══════════════ ٤ · بناء الخطة ═══════════════ */

/**
 * أفق الخطة المرنة (بلا موعد): نبني أيامًا تكفي المتبقي ثم ذيل
 * تثبيت — ولا نبني سنةً كاملة عبثًا.
 */
const FLEX_HORIZON_MAX_DAYS = 60;

export function buildMemorizationPlan(inputs: PlanInputs): MemorizationPlan {
  const { goal, ayahWords, reviews, spots, today } = inputs;

  /**
   * مؤشّر الحفظ الجديد: الموثوق أو قولُ الطالبة — أيّهما أبعد.
   * ⚠️ قولها يقدّم الجديد (راحةً — لا نحبسها عند آيةٍ تحفظها)،
   * لكنه لا يُدخل شيئًا في COMPLETED ولا في أي شهادة — تلك من
   * `verifiedUpTo` وحدها (راجع `goalStatus`).
   */
  const cursor0 = Math.max(
    goal.from_ayah - 1,
    Math.min(goal.to_ayah, Math.max(inputs.verifiedUpTo, inputs.userMarkedUpTo))
  );
  const remainingWords =
    cursor0 >= goal.to_ayah ? 0 : wordsIn(goal, ayahWords, cursor0 + 1, goal.to_ayah);

  const budget = DAILY_WORD_BUDGET[goal.intensity];

  /**
   * ── المراجعات والمواضع — من المرحلة ٦، لا نظام ثانٍ ──
   *
   * ⚠️ الاستحقاق يُقاس **بيوم الخطة لا بيوم البناء**: مراجعةٌ
   * تستحق بعد غد تظهر في يومها من «القادم» — لا تختفي لأنها لم
   * تكن مستحقةً لحظةَ الحساب. (عيبٌ أمسكه الاختبار قبل أي مستخدم.)
   */
  const dueSorted = [...reviews].sort(
    (a, b) => daysBetween(b.state.dueOn, today) - daysBetween(a.state.dueOn, today)
  );
  const activeSpots = [...spots].sort(
    (a, b) => b.transitionDays * 100 + b.confirmDays - (a.transitionDays * 100 + a.confirmDays)
  );

  // ── واقعية الموعد ──
  let feasibility: Feasibility = 'OK';
  let wordsPerDayNeeded: number | null = null;
  let overdue = false;
  let horizon: number; // عدد أيام التقويم التي نبنيها

  if (goal.targetDate) {
    const calDays = daysBetween(today, goal.targetDate) + 1;
    if (calDays <= 0) {
      overdue = true;
      horizon = 1;
    } else {
      horizon = calDays;
      // كم يومَ حفظٍ متاح فعلًا (بعد حجز ذيل التثبيت)؟
      let avail = 0;
      for (let i = 0; i < calDays; i++)
        if (isAvailable(addDays(today, i), goal.daysOfWeek)) avail++;
      const memDays = Math.max(1, avail - consolidationDays(avail));
      wordsPerDayNeeded = Math.ceil(remainingWords / memDays);
      if (wordsPerDayNeeded > MAX_WORDS_PER_DAY) feasibility = 'UNREALISTIC';
      else if (wordsPerDayNeeded > budget) feasibility = 'TIGHT';
    }
  } else {
    // مرنة: أيام بقدر الحاجة على وتيرة الشدّة، ثم ذيل تثبيت
    const est = Math.ceil(remainingWords / budget) + 3;
    horizon = Math.min(FLEX_HORIZON_MAX_DAYS, Math.max(7, est * 2));
  }

  /**
   * ميزانية اليوم الفعلية:
   * - موعدٌ ضيّق (TIGHT) يرفعها إلى المطلوب — بسقف الرحمة.
   * - UNREALISTIC **لا** يبني خطةً مستحيلة: يمضي بسقف الرحمة
   *   والواجهة تصارح وتعرض الخيارات.
   */
  const dailyNewBudget =
    goal.targetDate && wordsPerDayNeeded !== null
      ? Math.min(MAX_WORDS_PER_DAY, Math.max(budget, wordsPerDayNeeded))
      : budget;

  // ── التوزيع يومًا يومًا ──
  const days: PlanDayV2[] = [];
  let cursor = cursor0;
  let reviewQueue = [...dueSorted];
  let spotQueue = [...activeSpots];
  const totalAvail = (() => {
    let n = 0;
    for (let i = 0; i < horizon; i++) if (isAvailable(addDays(today, i), goal.daysOfWeek)) n++;
    return Math.max(1, n);
  })();
  const tail = goal.targetDate ? consolidationDays(totalAvail) : 0;
  let availSeen = 0;

  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const available = isAvailable(date, goal.daysOfWeek);
    if (available) availSeen++;

    /**
     * المراجعة تُخدم كل يوم — حتى غير المتاح للحفظ: ليتنر لا يعرف
     * «أيامي المتاحة»، والمؤجَّل منه يُنسى. أما الحفظ الجديد فمقيّد
     * بالأيام المتاحة وبذيل التثبيت.
     */
    const dueByDate = (r: DueSegment) => daysBetween(r.state.dueOn, date) >= 0;
    const near = reviewQueue.filter((r) => dueByDate(r) && r.state.box <= 1).slice(0, MAX_NEAR_PER_DAY);
    const periodic = reviewQueue.filter((r) => dueByDate(r) && r.state.box >= 2).slice(0, MAX_PERIODIC_PER_DAY);
    const served = new Set([...near, ...periodic]);
    reviewQueue = reviewQueue.filter((r) => !served.has(r));
    const daySpots = spotQueue.splice(0, MAX_SPOTS_PER_DAY);

    // كلفة المراجعة تُخصم قبل الجديد — ثبات القديم أولًا
    const reviewCost = (near.length + periodic.length) * REVIEW_WORD_COST + daySpots.length * SPOT_WORD_COST;
    const inTail = goal.targetDate ? totalAvail - availSeen < tail : false;
    const canMemorize = available && !inTail && cursor < goal.to_ayah && !overdue;

    let newMem: PlanDayV2['newMemorization'] = null;
    let reason = '';
    if (canMemorize) {
      const roomWords = Math.max(0, dailyNewBudget - reviewCost);
      let to = cursor;
      let used = 0;
      while (to < goal.to_ayah) {
        const w = ayahWords[to + 1 - goal.from_ayah] ?? 0;
        if (used > 0 && used + w > roomWords) break;
        // آية واحدة على الأقل إن كان في اليوم متّسع أصلًا — والآية
        // الأطول من الميزانية تأخذ يومها وحدها ولا تُشقّ
        if (used === 0 && roomWords === 0) break;
        used += w;
        to++;
        if (used >= roomWords) break;
      }
      if (to > cursor) {
        newMem = { surah: goal.surah, from_ayah: cursor + 1, to_ayah: to };
        cursor = to;
        reason = `budget=${dailyNewBudget} reviewCost=${reviewCost} used=${used}`;
      } else {
        reason = `review-heavy: cost=${reviewCost} budget=${dailyNewBudget}`;
      }
    } else {
      reason = !available
        ? 'day-off'
        : inTail
          ? 'consolidation-tail'
          : cursor >= goal.to_ayah
            ? 'range-done'
            : 'overdue';
    }

    const minutes = Math.max(
      2,
      Math.round(
        ((newMem ? wordsIn(goal, ayahWords, newMem.from_ayah, newMem.to_ayah) : 0) + reviewCost) /
          WORDS_PER_MINUTE
      ) + (newMem ? 2 : 0)
    );

    const empty = !newMem && !near.length && !periodic.length && !daySpots.length;
    if (!empty || available)
      days.push({
        date,
        newMemorization: newMem,
        nearReview: near,
        periodicReview: periodic,
        weakSpotPractice: daySpots,
        estimatedMinutes: minutes,
        reason,
      });

    // خطة مرنة اكتمل مداها وقوائمها — لا نبني أيامًا فارغة بعدها
    if (!goal.targetDate && cursor >= goal.to_ayah && !reviewQueue.length && !spotQueue.length && i >= 2)
      break;
  }

  return { days, feasibility, wordsPerDayNeeded, overdue };
}

/* ═══════════════ ٥ · نصيب اليوم ═══════════════ */

export function todayPlanDay(plan: MemorizationPlan, today: string): PlanDayV2 | null {
  return plan.days.find((d) => d.date === today) ?? null;
}

/**
 * رسالة الواقعية — تُصارح ولا تُحبط، وتُبقي القرار للطالبة.
 * «مكثفة» هنا تعني رفع الميزانية بسقف الرحمة — لا إلغاء المراجعة.
 */
export function feasibilityMessage(f: Feasibility): string | null {
  if (f === 'UNREALISTIC')
    return 'الوقت قصير لهذا الهدف. نقدر نسوي خطة مركّزة، لكن الأفضل تمديد الموعد شوي.';
  if (f === 'TIGHT') return 'الموعد قريب — الخطة أثقل من المعتاد شوي. تقدرين تمدّدين الموعد متى شئتِ.';
  return null;
}
