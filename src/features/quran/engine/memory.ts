/**
 * مواضع التثبيت — ذاكرة المراجعة على مستوى الآية.
 *
 * ═══ لماذا وُجد هذا الملف ═══
 * المراجعة المتباعدة تعرف حال **المقطع**: صندوقه وموعده. والتسميع
 * الذكي يعرف أدقّ من ذلك: أيّ **آية** تعثّرت، وهل التعثّر في أولها —
 * أي في الانتقال إليها من سابقتها. وكان هذان النظامان لا يلتقيان:
 * `WeakSpot` يُحسب ويُخزَّن «تُغذّى به المراجعة لاحقًا» — وبقي
 * «لاحقًا» بلا قارئ. هذا الملف هو اللاحق.
 *
 * ═══ الفلسفة — من قيود المشروع الحاكمة ═══
 * ⚠️ **الأولوية لتقليل الاتهام الكاذب لا لزيادة الاكتشاف.** فكلّ
 * قاعدة هنا محافظة: لا يدخل إلا المؤكَّد، ولا يُبنى على مرّة واحدة
 * حكمٌ دائم، والتحسّن يُصدَّق كما يُصدَّق التعثّر — بأيام مختلفة.
 *
 * ⚠️ ولا خوارزمية جديدة: ليتنر يبقى حاكمَ المقاطع كما هو. هذا الملف
 * يضيف طبقةً أدقّ تحته، لا بديلًا عنه. الذكاء من اختيار ما يُراجَع
 * بناءً على تسميعٍ حقيقي — لا من معادلةٍ أعقد.
 *
 * ═══ دوال نقية ═══
 * كالمحرّكات كلها: «اليوم» يأتي في المدخلات، فتُختبر على أي تاريخ
 * بلا انتظار أيام حقيقية. ولا قاعدة بيانات هنا ولا شبكة.
 */

import type { AlignmentResult } from './alignment';
import type { MasteryLevel } from './grading';
import type { Quality } from './review';

/* ═══════════════ ١ · من الحكم إلى جودة ليتنر ═══════════════ */

/**
 * ترجمة حكم التسميع إلى جودة جلسةٍ يفهمها ليتنر.
 *
 * ⚠️ `UNJUDGED` يرجع `null` — امتناعٌ عن التحديث لا جودة صفر.
 * جلسةٌ لم نستطع الحكم عليها لا تقدّم الجدول ولا تؤخّره: لو جعلناها
 * صفرًا لعاقبنا الطالبة على ميكروفون بعيد، ولو جعلناها نجاحًا
 * لكافأنا ضجيجًا.
 *
 * ⚠️ والتلميح يسقّف الجودة عند ١ — نفس فلسفة `attemptQuality`:
 * «التلميح ليس إتقانًا»، فلا يرفع صندوقًا ولا يُنزله.
 */
export function qualityFromVerdict(
  level: MasteryLevel,
  helpUsed: boolean
): Quality | null {
  if (level === 'UNJUDGED') return null;
  if (level === 'NEEDS_REVIEW') return 0;
  if (helpUsed) return 1;
  if (level === 'EXCELLENT') return 3;
  if (level === 'VERY_GOOD') return 2;
  return 1; // NEEDS_LIGHT — مراجعة نافعة، ليست إتقانًا
}

/* ═══════════════ ٢ · المشاهدات من نتيجة المحاذاة ═══════════════ */

/**
 * مشاهدة واحدة عن آية واحدة في جلسة واحدة.
 *
 * `CONFIRMED` = خطأ مؤكَّد وقع فيها. `CLEAN` = قُرئت كاملةً مطابِقةً
 * بلا خطأ **وبلا موضعٍ غير مؤكَّد** — فالآية التي فيها `UNCERTAIN`
 * ليست خطأً وليست نظيفة: لا نعرف، فلا نشهد.
 */
export type SpotObservation = {
  surah: number;
  ayah: number;
  kind: 'CONFIRMED' | 'CLEAN';
  /** الخطأ في أول الآية — أي في الانتقال إليها من سابقتها. */
  atTransition: boolean;
};

/**
 * يستخرج المشاهدات من نتيجة محاذاة.
 *
 * ⚠️ **هذه هي البوّابة التي تحمي جدول المراجعة من التلوّث:**
 * - `usable: false` → لا مشاهدات إطلاقًا. تسجيلٌ مقطوع أو ضجيج
 *   لا يشهد على حفظٍ ولا على نسيان.
 * - `UNCERTAIN` (ومنه صدى المزوّد `ECHO_OF_PASSAGE` والحروف
 *   المقطَّعة والالتباس) لا يصير `CONFIRMED` أبدًا — المحاذاة نفسها
 *   صنّفته امتناعًا، ونحن لا نعيد الحكم. وفوق ذلك يُبطل شهادة
 *   النظافة عن آيته: آيةٌ فيها موضعٌ لم نتأكد منه لا تُشهَد نظيفة.
 * - آيةٌ لم تصل أصلًا (تغطية ناقصة) لا تُشهد نظيفة — النظافة تحتاج
 *   أن تكون كل كلماتها المتوقَّعة قد طُوبقت.
 */
export function observationsFromAlignment(
  result: AlignmentResult
): SpotObservation[] {
  if (!result.usable) return [];

  /** لكل آية: كم كلمة متوقَّعة رأيناها، وكم منها طابق، وهل فيها شكّ. */
  const perAyah: {
    [key: string]: {
      surah: number;
      ayah: number;
      expectedSeen: number;
      matched: number;
      uncertain: boolean;
    };
  } = Object.create(null);

  for (const e of result.entries) {
    for (const w of e.expected) {
      const key = `${w.surah}:${w.ayah}`;
      const rec =
        perAyah[key] ??
        (perAyah[key] = {
          surah: w.surah,
          ayah: w.ayah,
          expectedSeen: 0,
          matched: 0,
          uncertain: false,
        });
      rec.expectedSeen++;
      if (e.kind === 'MATCH') rec.matched++;
      else if (e.kind === 'UNCERTAIN' || e.kind === 'LONG_PAUSE') rec.uncertain = true;
    }
  }

  const out: SpotObservation[] = [];

  // المؤكَّد — من `weakSpots` نفسها: مصدر واحد للحقيقة، لا حسابٌ ثانٍ
  for (const w of result.weakSpots)
    out.push({ surah: w.surah, ayah: w.ayah, kind: 'CONFIRMED', atTransition: w.atTransition });

  const confirmed = new Set(result.weakSpots.map((w) => `${w.surah}:${w.ayah}`));
  for (const key of Object.keys(perAyah)) {
    const a = perAyah[key];
    if (confirmed.has(key)) continue;
    if (a.uncertain) continue;
    if (a.matched === a.expectedSeen && a.expectedSeen > 0)
      out.push({ surah: a.surah, ayah: a.ayah, kind: 'CLEAN', atTransition: false });
  }

  out.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  return out;
}

/* ═══════════════ ٣ · حالة الموضع وتطوّرها ═══════════════ */

/**
 * عتبات محافظة — وكلها **أيام مختلفة** لا مرّات.
 *
 * لماذا يومان لا مرّة: نفس منطق الإتقان في ليتنر
 * (`MASTERY_MIN_DISTINCT_DAYS`) — النجاح خمس مرات في جلسة يثبت
 * تذكّرًا قصيرًا لا حفظًا، والتعثّر مرتين في دقيقة قد يكون ارتباكَ
 * لحظة. اليومان المختلفان هما ما يميّز الحال من العارض.
 */
/** قراءتان نظيفتان في يومين مختلفين تُسكِنان الموضع. */
export const SETTLE_MIN_DISTINCT_DAYS = 2;
/** تعثّرُ انتقالٍ في يومين مختلفين قبل أن يُسمّى ضعفَ انتقال. */
export const TRANSITION_MIN_DISTINCT_DAYS = 2;

/**
 * حالة موضع تثبيت واحد (مستخدم × سورة × آية).
 *
 * عدّاداتها كلها «أيام مختلفة»: عشر جلسات في يوم = يوم واحد،
 * كما في `ReviewState.distinctDays` سواء بسواء.
 */
export type SpotState = {
  /** أيام مختلفة تأكّد فيها خطأ في هذه الآية. */
  confirmDays: number;
  /** أيام مختلفة قُرئت فيها نظيفةً **منذ آخر تعثّر**. */
  clearDays: number;
  /** أيام مختلفة كان التعثّر فيها في أول الآية — في الانتقال. */
  transitionDays: number;
  lastConfirmedOn: string | null;
  lastClearedOn: string | null;
  lastTransitionOn: string | null;
  /** أول يوم رُصد فيه — للتاريخ لا للحساب. */
  firstSeenOn: string;
};

export function newSpot(today: string): SpotState {
  return {
    confirmDays: 0,
    clearDays: 0,
    transitionDays: 0,
    lastConfirmedOn: null,
    lastClearedOn: null,
    lastTransitionOn: null,
    firstSeenOn: today,
  };
}

/**
 * يطبّق مشاهدةً على حالة موضع.
 *
 * القواعد تُقرأ بالعربية كقواعد ليتنر:
 *
 *   تأكّد خطأ في يوم جديد   → يرتفع عدّاد التعثّر، **ويُصفَّر عدّاد
 *                              النظافة** — التحسّن يُحسب من آخر تعثّر
 *   قُرئ نظيفًا في يوم جديد  → يرتفع عدّاد النظافة وحده
 *   مشاهدة ثانية في نفس اليوم → لا تغيّر شيئًا (يومٌ واحد = يوم)
 *
 * ⚠️ ولا شيء هنا يمحو التاريخ: الموضع الذي سكن يبقى صفًّا محفوظًا
 * بعدّاداته، فإن عاد التعثّر يومًا عاد الحساب من سياقه لا من صفحة
 * بيضاء.
 */
export function applyObservation(
  prev: SpotState | null,
  obs: SpotObservation,
  today: string
): SpotState {
  const s: SpotState = prev ? { ...prev } : newSpot(today);

  if (obs.kind === 'CONFIRMED') {
    if (s.lastConfirmedOn !== today) {
      s.confirmDays++;
      s.lastConfirmedOn = today;
      s.clearDays = 0; // النظافة تُحسب من آخر تعثّر
    }
    if (obs.atTransition && s.lastTransitionOn !== today) {
      s.transitionDays++;
      s.lastTransitionOn = today;
    }
    return s;
  }

  // CLEAN — لا يُنشئ موضعًا: القراءة النظيفة طبيعية لا حدث
  if (!prev) return s;
  if (s.lastClearedOn !== today && s.lastConfirmedOn !== today) {
    s.clearDays++;
    s.lastClearedOn = today;
  }
  return s;
}

/** سكن الموضع: قُرئ نظيفًا في يومين مختلفين منذ آخر تعثّر. */
export function isSettled(s: SpotState): boolean {
  return s.confirmDays > 0 && s.clearDays >= SETTLE_MIN_DISTINCT_DAYS;
}

/** ما زال يحتاج تثبيتًا: تأكّد فيه خطأ ولم يسكن بعد. */
export function isActive(s: SpotState): boolean {
  return s.confirmDays > 0 && !isSettled(s);
}

/**
 * ضعف انتقال: تعثّرٌ في **أول** الآية في يومين مختلفين على الأقل.
 *
 * ⚠️ مرّة واحدة لا تكفي عمدًا — قد تكون التقاطةَ ميكروفون تأخّرت.
 * واليومان المختلفان يميّزان نمطًا من عارض.
 */
export function isTransitionPriority(s: SpotState): boolean {
  return isActive(s) && s.transitionDays >= TRANSITION_MIN_DISTINCT_DAYS;
}

/**
 * ترتيب مواضع اليوم: ضعف الانتقال أولًا (أثقل ما في الحفظ)، ثم
 * الأكثر تعثّرًا، ثم الأحدث تعثّرًا.
 */
export function spotPriority(s: SpotState): number {
  let p = s.confirmDays;
  if (isTransitionPriority(s)) p += 100;
  return p;
}

/* ═══════════════ ٤ · نطاق الدرس ═══════════════ */

/**
 * هل يقع المقطع كاملًا داخل نطاق درسٍ من المنهج؟
 *
 * ⚠️ القرار المعتمد (المرحلة ٦، البند ٨): القراءة حرّة في كل
 * المصحف — القيد الحاكم ٧ — لكن **تقدّم الدرس** لا يُحسب إلا ممّا
 * يقع داخل نطاقه كاملًا. مقطعٌ يفيض عن الدرس ولو بآية لا يُحسب
 * للدرس — يُحسب للقرآن العام الذي يحتفظ بتقدّمه المستقل.
 */
export function withinLessonRange(
  seg: { surah: number; from_ayah: number; to_ayah: number },
  lesson: { surah: number; from_ayah: number; to_ayah: number }
): boolean {
  return (
    seg.surah === lesson.surah &&
    seg.from_ayah >= lesson.from_ayah &&
    seg.to_ayah <= lesson.to_ayah
  );
}

/* ═══════════════ ٥ · لغة الطفل ═══════════════ */

/**
 * وصف الموضع بلغةٍ تبني.
 *
 * ⚠️ لا `weak_spot` ولا `box` ولا «ضعيف» ولا «أخطاؤك» — الطفل الذي
 * يُخبَر أنه ضعيف يصدّق. نفس عهد `BOX_LABEL` و`ReviewToday`.
 */
export function spotLine(s: SpotState): string {
  if (isSettled(s)) return 'ثبّتّيه — ما شاء الله';
  if (isTransitionPriority(s)) return 'نتدرّب على الوصل بين آيتين';
  return 'موضع نثبّته معًا';
}
