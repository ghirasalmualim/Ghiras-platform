import type { MasteryLevel } from '../engine/grading';
import { DROPS_TO_COMPLETE, GARDEN_TUNING, type GardenTuning } from './tuning';
import type { DropReason, GrowthStage, RewardKey } from './types';

/**
 * محرّك نمو «حديقتي» — دوالٌّ خالصة، بلا قاعدة بيانات ولا واجهة.
 *
 * ═══ لماذا خالصة ═══
 * ما يقرّر نموّ نبتة طفل يجب أن يكون قابلًا للاختبار وحده: بلا خادم
 * ولا حساب ولا إنترنت. نُدخل حالةً ونقرأ حكمًا، فنفحص كل قاعدة في
 * أجزاء من الثانية، ونعيد الفحص كلما عدّلنا رقمًا في المعايرة.
 *
 * ═══ ما لا يفعله هذا الملف ═══
 * ⚠️ لا يُنقص. ليس فيه ذبولٌ ولا خصمٌ ولا انتهاء صلاحية — لا دالة
 * واحدة تُرجع تقدّمًا أقلّ ممّا دخل. وهذا قرارٌ صريح من صاحبة المنصة:
 * الغياب لا يُعاقَب، ومن رجع بعد شهرين وجد نبتته كما تركها.
 *
 * ⚠️ ولا يعرف تجويدًا ولا درجة نطق. النمو من الحفظ والمراجعة
 * والالتزام وحدها.
 *
 * ⚠️ ولا يعرف طول المقطع. `awardsForRecitation` لا تستقبل عدد آيات
 * أصلًا — فلا سبيل إلى أن يكافئ الكمَّ ولو أردنا.
 */

// ═══════════════════ المراحل ═══════════════════

/**
 * المرحلة التي بلغتها نبتةٌ استُعملت لها هذه القطرات.
 *
 * ⚠️ رقمٌ داخليّ لاختيار الرسم، لا يُعرض للطالبة. وعرضه يحوّل النمو
 * إلى عدّاد «٤ من ٦»، والمقصود أن ترى نبتتها لا أن تقرأ رقمها.
 */
export function stageForDrops(used: number, t: GardenTuning = GARDEN_TUNING): GrowthStage {
  let left = Math.max(0, Math.floor(used));
  let stage = 0;
  for (const cost of t.dropsPerStage) {
    if (left < cost) break;
    left -= cost;
    stage++;
  }
  return Math.min(stage, t.dropsPerStage.length) as GrowthStage;
}

/** اكتملت النبتة؟ */
export function isComplete(used: number, t: GardenTuning = GARDEN_TUNING): boolean {
  return Math.floor(used) >= t.dropsPerStage.reduce((a, b) => a + b, 0);
}

/**
 * تقدّمها داخل مرحلتها الحالية، من صفر إلى واحد.
 *
 * للرسم وحده: ارتفاع الساق أو انفتاح الورقة يتحرّك بها بين المرحلتين،
 * فيرى الطفل أثر قطرته فورًا ولا ينتظر مرحلةً كاملة ليرى شيئًا.
 */
export function progressWithinStage(used: number, t: GardenTuning = GARDEN_TUNING): number {
  let left = Math.max(0, Math.floor(used));
  for (const cost of t.dropsPerStage) {
    if (left < cost) return cost === 0 ? 1 : left / cost;
    left -= cost;
  }
  return 1;
}

/** كم قطرةً بقيت حتى الاكتمال — للداخل لا للعرض. */
export function dropsRemaining(used: number, t: GardenTuning = GARDEN_TUNING): number {
  return Math.max(0, t.dropsPerStage.reduce((a, b) => a + b, 0) - Math.floor(used));
}

// ═══════════════════ الاستحقاق ═══════════════════

export type RecitationOutcome = {
  /** حكم المرحلة الثالثة: هل صلحت الجلسة للحكم أصلًا؟ */
  usable: boolean;
  level: MasteryLevel;
  helpUsed: boolean;
  /** مواضع ضعيفة سابقة لم تعد خطأً مؤكَّدًا في هذه الجلسة. */
  improvedWeakSpots: number;
};

/**
 * ما تستحقّه جلسة تسميع.
 *
 * ⚠️ **الجلسة غير الصالحة لا تُعطي شيئًا.** حين نقول «ما قدرت أتأكد»
 * فنحن نمتنع عن الحكم، لا نحكم بالنجاح. ولو سقينا النبتة على تسميعٍ
 * لم نسمعه لكان ذلك ثناءً باطلًا — وهو أخطر من الاتهام الباطل، لأن
 * الاتهام يُراجَع والثناء يُصدَّق.
 *
 * ⚠️ و`UNCERTAIN` من المرحلة الثالثة لا يصل إلى هنا أصلًا: هو لا
 * يُحتسب خطأً ولا إتقانًا، فلا يرفع مستوى ولا يخفضه.
 *
 * ⚠️ والتحسّن يُكافأ **مرّة واحدة** مهما كثرت المواضع التي تحسّنت.
 * ولو كافأنا كل موضع لعاد الكمُّ من باب خلفيّ: من سمّع مقطعًا طويلًا
 * فيه عشرة مواضع ضعيفة أخذ عشرة أضعاف من ثبّت موضعًا واحدًا.
 */
export function awardsForRecitation(o: RecitationOutcome): DropReason[] {
  if (!o.usable || o.level === 'UNJUDGED') return [];

  const out: DropReason[] = ['recitation_completed'];
  if (!o.helpUsed) out.push('recitation_without_help');
  if (o.level === 'EXCELLENT') out.push('passage_mastered');
  if (o.improvedWeakSpots > 0) out.push('weak_spot_improved');
  return out;
}

/** ما تستحقّه مراجعةٌ مستحقّة أُنجزت. */
export function awardsForReview(done: { completed: boolean }): DropReason[] {
  return done.completed ? ['review_completed'] : [];
}

/** قيمة القطرات لأسبابٍ مستحقّة. */
export function dropsForReasons(
  reasons: readonly DropReason[],
  t: GardenTuning = GARDEN_TUNING
): number {
  return reasons.reduce((sum, r) => sum + (t.dropValue[r] ?? 0), 0);
}

// ═══════════════════ السقوف ═══════════════════

export type CapInput = {
  /** ما مُنح اليوم قبل هذه الجلسة. */
  grantedToday: number;
  /** ما بيد الطالبة الآن غير مستعمل. */
  held: number;
  /** ما تستحقّه الآن قبل السقوف. */
  earned: number;
};

export type CapResult = {
  granted: number;
  /** ما سقط بسبب سقف اليوم. */
  cappedByDay: number;
  /** ما سقط لأن يدها ممتلئة. */
  cappedByHold: number;
};

/**
 * تطبيق السقفين: سقف اليوم أوّلًا ثم سقف ما في اليد.
 *
 * ⚠️ الترتيب ليس اعتباطًا. سقف اليوم يقول «ارجع غدًا» وهو غرض
 * النظام، وسقف اليد يقول «اسقِ ما عندك» وهو تنظيم. فيُطبَّق الحدّ
 * الأشدّ معنًى أوّلًا.
 *
 * ⚠️ ولا شيء هنا يُنقص ما في اليد — السقف يمنع الزيادة ولا يأخذ.
 */
export function applyCaps(input: CapInput, t: GardenTuning = GARDEN_TUNING): CapResult {
  const earned = Math.max(0, Math.floor(input.earned));
  const dayRoom = Math.max(0, t.maxDropsPerDay - Math.max(0, input.grantedToday));
  const afterDay = Math.min(earned, dayRoom);

  const holdRoom = Math.max(0, t.maxHeldDrops - Math.max(0, input.held));
  const granted = Math.min(afterDay, holdRoom);

  return {
    granted,
    cappedByDay: earned - afterDay,
    cappedByHold: afterDay - granted,
  };
}

// ═══════════════════ الاستمرارية والزينة ═══════════════════

/**
 * أيام العناية — عددُ الأيام المختلفة التي سُقيت فيها نبتة.
 *
 * ⚠️ عدٌّ تراكميّ لا سلسلة متّصلة. الانقطاع لا يصفّره ولا ينقص منه،
 * لأن ما مضى وقع فعلًا ولا يُمحى بغياب أسبوع. وهذا فرقٌ جوهري بين
 * «أيام اعتنيتُ فيها بحديقتي» وبين streak مهدَّدٍ بالانهيار.
 */
export function careDays(daysISO: readonly string[]): number {
  return new Set(daysISO.map((d) => d.slice(0, 10))).size;
}

export type GardenStats = {
  completedPlants: number;
  careDays: number;
};

/**
 * الزينة المفتوحة — دالةٌ من الإنجاز، تُحسب ولا تُخزَّن كحقيقة.
 *
 * ⚠️ حتميّة تمامًا: نفس الإنجاز يفتح نفس الزينة دائمًا. لا نرد ولا
 * احتمال ولا صندوق. وما يشبه القمار لا يدخل منتجًا للأطفال ولو كان
 * بلا مال.
 */
export function unlockedRewards(
  stats: GardenStats,
  t: GardenTuning = GARDEN_TUNING
): RewardKey[] {
  const out: RewardKey[] = [];
  for (const [at, key] of Object.entries(t.rewardsByPlants))
    if (stats.completedPlants >= Number(at)) out.push(key);
  for (const [at, key] of Object.entries(t.rewardsByCareDays))
    if (stats.careDays >= Number(at)) out.push(key);
  return out;
}

/** ما فُتح الآن ولم يكن مفتوحًا قبل — لإظهار «زائر جديد» مرّة واحدة. */
export function newlyUnlocked(
  before: GardenStats,
  after: GardenStats,
  t: GardenTuning = GARDEN_TUNING
): RewardKey[] {
  const had = new Set(unlockedRewards(before, t));
  return unlockedRewards(after, t).filter((k) => !had.has(k));
}

export { DROPS_TO_COMPLETE };
