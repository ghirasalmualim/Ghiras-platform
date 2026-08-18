/**
 * الإتقان والمراجعة المتباعدة.
 *
 * دوال نقية بلا حالة ولا وقت خفي: كل ما تحتاجه يأتي في المدخلات
 * (بما فيها «اليوم»)، فتُختبر بلا انتظار أيام حقيقية.
 *
 * ── لماذا صناديق مرقّمة لا معادلة ──
 * النماذج الشائعة (SM-2 وأشباهه) تحسب فواصل بمعاملات كسرية لا يفهمها
 * أحد ولا يستطيع أحد أن يراجعها. وهيّسة طلبت نموذجًا «قابلًا للتفسير
 * والاختبار». فالمقطع هنا يسكن صندوقًا مرقّمًا، وكل صندوق له فاصل
 * معلوم، والانتقال بينها بقواعد تُقرأ بالعربية:
 *
 *   أتقنتِ اليوم بلا تلميح  → ترتفعين صندوقًا، فيبعُد الموعد
 *   أتقنتِ بعد محاولات      → تبقين، فيتكرر نفس الفاصل
 *   احتجتِ تلميحًا          → تبقين — التلميح ليس إتقانًا
 *   أخطأتِ أو كُشف الحل     → تنزلين صندوقًا، فيقرُب الموعد
 *
 * ── ما ليس هنا ──
 * لا وقت ولا سرعة. الوقت ليس مقياس صعوبة، ولا يدخل في أي حساب.
 */

/**
 * فواصل المراجعة بالأيام لكل صندوق.
 *
 * مكانها هنا لا في الواجهة: تعديلها قرار تربوي قد يتغيّر بالتجربة،
 * فيجب أن يكون سطرًا واحدًا في مكان واحد لا أرقامًا مبعثرة في شاشات.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** أعلى صندوق. الوصول إليه لا يعني الانتهاء — المراجعة تستمر كل ٣٠ يومًا. */
export const MAX_BOX = REVIEW_INTERVALS_DAYS.length;

/**
 * الإتقان يتطلب النجاح في **يومين مختلفين** على الأقل.
 *
 * من أجاب صحيحًا خمس مرات في جلسة واحدة لم يُثبِت حفظًا، أثبت أنه
 * يتذكّر ما قرأه قبل دقيقة. والتباعد عبر الأيام هو ما يميّز الاثنين.
 */
export const MASTERY_MIN_BOX = 4;
export const MASTERY_MIN_DISTINCT_DAYS = 2;

/**
 * جودة الجلسة — أربع درجات صريحة لا مقياس ضبابي.
 * تُشتق من نتائج التدريبات عبر `sessionQuality`.
 */
export type Quality = 0 | 1 | 2 | 3;

export const QUALITY_LABEL: Record<Quality, string> = {
  3: 'من أول محاولة وبلا تلميح',
  2: 'صحيح بعد محاولات',
  1: 'صحيح بمساعدة تلميح',
  0: 'يحتاج مراجعة',
};

/** نتيجة تدريب واحد كما تسجّلها الواجهة. */
export type AttemptResult = {
  correct: boolean;
  /** عدد المحاولات حتى الإجابة الصحيحة (١ = من أول مرة). */
  attempts: number;
  /** ٠ = بلا تلميح … ٣ = كُشف الحل كاملًا. */
  hintLevel: 0 | 1 | 2 | 3;
};

/**
 * جودة تدريب واحد.
 *
 * كشف الحل كاملًا (المستوى ٣) يُعطي صفرًا ولو انتهى بإجابة صحيحة:
 * من رأى الجواب لم يستذكره. وهذا نصّ شرط هيّسة: «لا تجعل الطالب يحصل
 * على نفس درجة الإتقان إذا احتاج الحل الكامل».
 */
export function attemptQuality(a: AttemptResult): Quality {
  if (!a.correct) return 0;
  if (a.hintLevel >= 3) return 0;
  if (a.hintLevel >= 1) return 1;
  return a.attempts <= 1 ? 3 : 2;
}

/**
 * جودة الجلسة كلها = **أدنى** جودة فيها لا متوسطها.
 *
 * المتوسط يخفي الضعف: من أتقن أربع آيات ونسي الخامسة ليس متقنًا
 * للمقطع، والمعدّل الحسابي يمنحه إتقانًا كاذبًا ثم يباعد المراجعة عن
 * الآية التي نسيها بالضبط.
 */
export function sessionQuality(results: AttemptResult[]): Quality {
  if (!results.length) return 0;
  return results.reduce<Quality>(
    (worst, r) => (attemptQuality(r) < worst ? attemptQuality(r) : worst),
    3
  );
}

/** حالة مقطع في نظام المراجعة. */
export type ReviewState = {
  /** ٠..MAX_BOX */
  box: number;
  /** عدد الأيام المختلفة التي نجحت فيها — لا عدد الجلسات. */
  distinctDays: number;
  /** آخر يوم روجع فيه، بصيغة YYYY-MM-DD. */
  lastReviewedOn: string | null;
  /** موعد المراجعة القادمة، بصيغة YYYY-MM-DD. */
  dueOn: string;
};

export const NEW_SEGMENT_BOX = 0;

/** يوم بصيغة YYYY-MM-DD — نتعامل بالأيام لا باللحظات، فالمراجعة يومية. */
export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** فاصل الصندوق بالأيام. الصندوق ٠ يعني «غدًا». */
export function intervalOf(box: number): number {
  const i = Math.max(0, Math.min(MAX_BOX, box));
  return REVIEW_INTERVALS_DAYS[Math.max(0, i - 1)] ?? REVIEW_INTERVALS_DAYS[0];
}

/**
 * يُحدّث حالة المقطع بعد جلسة تدريب.
 *
 * @param state الحالة قبل الجلسة، أو null لمقطع جديد
 * @param quality جودة الجلسة
 * @param today اليوم بصيغة YYYY-MM-DD — يُمرَّر ولا يُقرأ من الساعة،
 *              حتى تكون الدالة نقية وقابلة للاختبار على أي تاريخ
 */
export function applySession(
  state: ReviewState | null,
  quality: Quality,
  today: string
): ReviewState {
  const prev: ReviewState = state ?? {
    box: NEW_SEGMENT_BOX,
    distinctDays: 0,
    lastReviewedOn: null,
    dueOn: today,
  };

  // يوم جديد فقط يزيد العدّاد. عشر جلسات في يوم واحد = يوم واحد.
  const newDay = prev.lastReviewedOn !== today;
  const distinctDays =
    quality > 0 && newDay ? prev.distinctDays + 1 : prev.distinctDays;

  let box = prev.box;
  if (quality === 3) box = Math.min(MAX_BOX, box + 1);
  else if (quality === 0) box = Math.max(0, box - 1);
  // الجودتان ١ و٢ تُبقيان الصندوق: مراجعة نافعة لكنها ليست إتقانًا.

  return {
    box,
    distinctDays,
    lastReviewedOn: today,
    dueOn: addDays(today, intervalOf(box)),
  };
}

/** هل حان موعد مراجعة هذا المقطع؟ */
export function isDue(state: ReviewState, today: string): boolean {
  return daysBetween(state.dueOn, today) >= 0;
}

/** هل يُعدّ المقطع متقنًا؟ صندوق عالٍ **و**نجاح في أيام مختلفة. */
export function isMastered(state: ReviewState): boolean {
  return state.box >= MASTERY_MIN_BOX && state.distinctDays >= MASTERY_MIN_DISTINCT_DAYS;
}

/**
 * وصف حال المقطع بكلمة تفهمها الطالبة.
 * لا «ضعيف» ولا «فشل» — الألفاظ تبني أو تهدم.
 */
export const BOX_LABEL = [
  'جديد',
  'بدأتِ',
  'تتحسّن',
  'جيدة',
  'راسخة',
  'متقنة',
] as const;

export function stateLabel(state: ReviewState): string {
  if (isMastered(state)) return 'متقنة';
  return BOX_LABEL[Math.max(0, Math.min(BOX_LABEL.length - 1, state.box))];
}

/**
 * نسبة تقدّم للعرض (٠..١٠٠).
 * مؤشر بسيط غير تنافسي، ولا يُقارَن بأحد ولا يُرتَّب.
 */
export function progressPercent(state: ReviewState): number {
  return Math.round((Math.min(MAX_BOX, state.box) / MAX_BOX) * 100);
}

/**
 * المقاطع التي «تحتاج مراجعة بسيطة».
 *
 * تعريفها صريح: نزلت صندوقًا أو أكثر عن الإتقان، أو ما تجاوزت الصندوق
 * الأول رغم مراجعات متعددة. ولا نسمّيها ضعفًا ولا أخطاءً.
 */
export function needsStrengthening(state: ReviewState): boolean {
  return state.box <= 1 && state.distinctDays >= 1;
}
