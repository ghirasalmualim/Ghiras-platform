/**
 * اختبار ثبات الحفظ — «غراس يختار، لا الطالبة».
 *
 * ═══ السؤال الذي يجيب عنه ═══
 * المراجعة (المرحلة ٦) تجيب: «ماذا أراجع اليوم؟». وهذا يجيب:
 * «هل حفظي القديم ما زال ثابتًا؟» — فيختار من **المحفوظ فعلًا**
 * مقطعًا يستحق الفحص، ويقيسه محرّكُ التسميع القائم نفسه (المرحلة
 * ٣)، وتغذّي نتيجتُه المراجعةَ بوصلة المرحلة ٦ نفسها. لا محاذاة
 * ثانية، لا جدول ضعفٍ ثانٍ، لا درجة جديدة.
 *
 * ═══ لا عشوائية عمياء ═══
 * الاختيار حتميٌّ مفسَّر: قواعدُ أولويةٍ مرتَّبة، ولكل اختيارٍ
 * `reasonCode` داخلي (لا يُعرض للطفل)، وكسرُ التعادل ثابت (الأقدم
 * مراجعةً، ثم السورة والآية تصاعديًا) — نفسُ المدخلات نفسُ الاختيار.
 *
 * ═══ لا يُختبر ما لم يُحفظ ═══
 * المرشّحون من مقاطع `quran_review_state` التي رُوجعت بنجاح يومًا
 * على الأقل — لا آية لم تبلغها الطالبة. والخادم يعيد هذا الفحص
 * عند الإنهاء فلا يصدّق واجهةً غيّرت النطاق.
 *
 * ═══ دوال نقية ═══
 * «اليوم» يومُ الكويت يأتي معاملًا. ولا Math.random في أي قرار.
 */

import { daysBetween } from './review';
import type { DueSegment } from './planner';
import type { SpotLite } from './plan';
import { SETTLE_MIN_DISTINCT_DAYS, TRANSITION_MIN_DISTINCT_DAYS } from './memory';

/* ═════════════════════════════════════════════════════════════
 * ⚠️ USER_VALIDATION_REQUIRED — معايرة اختبار الثبات كلها هنا
 * ═════════════════════════════════════════════════════════════
 * أرقامٌ تجريبية لا قرارات تربوية نهائية — كمعايرة الخطة والحديقة
 * سواء. تُراجَع بعد تجربة مستخدمين (PLAN_TUNING_VALIDATION).
 */

/** المحفوظ «قديمًا» يستحق فحص ثباته بعد هذه الأيام من آخر مراجعة. */
export const OLD_AGE_DAYS = 7;
/** مقطعٌ لم يُختبر ثباتُه قط أو منذ هذه المدة → مرشّح. */
export const LONG_NOT_TESTED_DAYS = 5;
/** المحفوظ «جديدًا» (لاختبار الربط) إن كانت آخر مراجعته دون هذا. */
export const NEW_LINK_MAX_AGE_DAYS = 3;
/** حجم الاختبار بالكلمات — لا بعدّ الآيات، والآية لا تُشقّ. */
export const TEST_MAX_WORDS = 24;
export const TEST_MIN_WORDS = 4;
/** لا يُعاد نفس المقطع في نفس اليوم الكويتي. */
export const SAME_SEGMENT_COOLDOWN_DAYS = 1;
/** أقصى اختبارات ثبات تُقترح في اليوم — لا نلاحق الطالبة كل ساعة. */
export const MAX_TESTS_PER_DAY = 2;

/* ═══════════ نهاية كتلة USER_VALIDATION_REQUIRED ═══════════ */

/** لماذا اختير هذا المقطع — داخلي للاختبارات والتشخيص، لا يُعرض لطفل. */
export type ReasonCode =
  | 'OLD_DUE'
  | 'TRANSITION_RECHECK'
  | 'WEAK_SPOT_RECHECK'
  | 'LONG_NOT_TESTED'
  | 'NEW_LINK';

export type TestKind = 'FIXED_SEGMENT' | 'START_FROM' | 'TRANSITION' | 'WEAK_RECHECK';

export type StabilityCandidate = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  kind: TestKind;
  reasonCode: ReasonCode;
  /** «ابدأ من الآية …» حين لا يبدأ الاختبار من أول السورة. */
  startFrom: boolean;
};

export type StabilityInputs = {
  /** مقاطع الطالبة — المحفوظ منها ما رُوجع بنجاح يومًا على الأقل. */
  reviews: DueSegment[];
  /** كل المواضع — النشط للانتقالات، والساكن لإعادة الفحص. */
  spots: SpotLite[];
  /** اختبارات الثبات السابقة: مقطعٌ ويومه الكويتي. */
  pastTests: { surah: number; from_ayah: number; to_ayah: number; day: string }[];
  /**
   * قيدُ نطاقٍ اختياري — درسُ المنهج: لا يخرج الاختبار عنه.
   * القرآن العام يمرّر null فيبقى مستقلًّا — لا خلط تقدّم.
   */
  scope: { surah: number; from_ayah: number; to_ayah: number } | null;
  /** كلمات الآيات — `wordsOf(surah, ayah)` من المصحف، تُمرَّر دالةً نقية. */
  wordsOf: (surah: number, ayah: number) => number;
  today: string;
};

export type StabilityDecision =
  | { eligible: true; candidate: StabilityCandidate }
  | {
      eligible: false;
      reason: 'NO_MEMORIZED' | 'TESTED_ENOUGH_TODAY' | 'ALL_ON_COOLDOWN';
    };

const segKey = (s: { surah: number; from_ayah: number; to_ayah: number }) =>
  `${s.surah}:${s.from_ayah}-${s.to_ayah}`;

const within = (
  seg: { surah: number; from_ayah: number; to_ayah: number },
  scope: { surah: number; from_ayah: number; to_ayah: number } | null
) =>
  !scope ||
  (seg.surah === scope.surah && seg.from_ayah >= scope.from_ayah && seg.to_ayah <= scope.to_ayah);

/**
 * قصُّ المقطع إلى حجم اختبارٍ بالكلمات — من آية البداية، بلا شقّ
 * آية: آيةٌ أطول من الميزانية تُختبر وحدها كاملة. والسورة القصيرة
 * تُترك كاملةً بلا تقسيم مصطنع.
 */
export function sizeTest(
  surah: number,
  from: number,
  to: number,
  wordsOf: (s: number, a: number) => number
): { from: number; to: number } {
  let used = 0;
  let end = from;
  for (let a = from; a <= to; a++) {
    const w = wordsOf(surah, a);
    if (used > 0 && used + w > TEST_MAX_WORDS) break;
    used += w;
    end = a;
    if (used >= TEST_MAX_WORDS) break;
  }
  // أقصر من الحد الأدنى ووراءه آيات محفوظة؟ نمدّ آيةً — اختبارُ
  // كلمتين لا يقيس شيئًا
  while (used < TEST_MIN_WORDS && end < to) {
    end++;
    used += wordsOf(surah, end);
  }
  return { from, to: end };
}

/**
 * الاختيار — قواعد مرتَّبة لا معادلة غامضة:
 *
 *   ١. OLD_DUE            محفوظ راسخ (صندوق ≥ ٣) مضى على مراجعته
 *                         OLD_AGE_DAYS — أحقُّ الجميع بفحص الثبات.
 *   ٢. TRANSITION_RECHECK انتقالٌ تكرّر تعثّره (يومان+) — يُختبر
 *                         الوصلُ من الآية قبله.
 *   ٣. WEAK_SPOT_RECHECK  موضعٌ تحسّن وسكن — نتأكد أنه ثبت.
 *   ٤. LONG_NOT_TESTED    محفوظٌ لم يُختبر ثباتُه منذ مدة.
 *   ٥. NEW_LINK           محفوظ جديد نسبيًا — اختبارُ ربطٍ خفيف.
 *
 * داخل كل قاعدة: الأقدم مراجعةً أولًا، ثم السورة فالآية تصاعديًا —
 * كسرُ تعادلٍ ثابت لا عشوائي.
 *
 * ⚠️ وليس كلُّ اختبارٍ انتقالًا: القاعدة ١ تسبق ٢ بالتصميم، فمن
 * عنده محفوظ قديم مستحق يُفحص هو قبل أي انتقال.
 */
export function pickStabilityTest(inputs: StabilityInputs): StabilityDecision {
  const { reviews, spots, pastTests, scope, wordsOf, today } = inputs;

  const memorized = reviews.filter((r) => r.state.distinctDays >= 1 && within(r, scope));
  if (!memorized.length) return { eligible: false, reason: 'NO_MEMORIZED' };

  const testsToday = pastTests.filter((t) => t.day === today);
  if (testsToday.length >= MAX_TESTS_PER_DAY)
    return { eligible: false, reason: 'TESTED_ENOUGH_TODAY' };

  // آخر اختبار لكل مقطع — للتهدئة (cooldown) ولقِدم الاختبار
  const lastTest = new Map<string, string>();
  for (const t of pastTests) {
    const k = segKey(t);
    const prev = lastTest.get(k);
    if (!prev || t.day > prev) lastTest.set(k, t.day);
  }
  const onCooldown = (seg: { surah: number; from_ayah: number; to_ayah: number }) => {
    const last = lastTest.get(segKey(seg));
    return last !== undefined && daysBetween(last, today) < SAME_SEGMENT_COOLDOWN_DAYS;
  };

  const age = (r: DueSegment) =>
    r.state.lastReviewedOn ? daysBetween(r.state.lastReviewedOn, today) : 9999;
  /** كسر التعادل الثابت: الأقدم مراجعةً، ثم السورة، ثم الآية. */
  const tie = (a: DueSegment, b: DueSegment) =>
    age(b) - age(a) || a.surah - b.surah || a.from_ayah - b.from_ayah;

  const pool = memorized.filter((r) => !onCooldown(r));

  const finish = (
    seg: { surah: number; from_ayah: number; to_ayah: number },
    kind: TestKind,
    reasonCode: ReasonCode
  ): StabilityDecision => {
    const sized = sizeTest(seg.surah, seg.from_ayah, seg.to_ayah, wordsOf);
    return {
      eligible: true,
      candidate: {
        surah: seg.surah,
        from_ayah: sized.from,
        to_ayah: sized.to,
        kind,
        reasonCode,
        startFrom: sized.from > 1,
      },
    };
  };

  // ── ١ · محفوظ قديم راسخ حان فحصُه ──
  const old = pool
    .filter((r) => r.state.box >= 3 && age(r) >= OLD_AGE_DAYS)
    .sort(tie);
  if (old.length) {
    const r = old[0];
    /**
     * سورة طويلة محفوظٌ منها الكثير: لا نبدأ دائمًا من أولها —
     * «ابدأ من هنا» يبدأ من منتصف المقطع إن اتسع لاختبارٍ كامل،
     * فتُختبر القدرة على البدء من غير الفاتحة المعتادة.
     */
    const span = r.to_ayah - r.from_ayah + 1;
    const half = r.from_ayah + Math.floor(span / 2);
    const fromMid = sizeTest(r.surah, half, r.to_ayah, wordsOf);
    let words = 0;
    for (let a = fromMid.from; a <= fromMid.to; a++) words += wordsOf(r.surah, a);
    if (span >= 6 && words >= TEST_MIN_WORDS)
      return finish({ surah: r.surah, from_ayah: half, to_ayah: r.to_ayah }, 'START_FROM', 'OLD_DUE');
    return finish(r, 'FIXED_SEGMENT', 'OLD_DUE');
  }

  // ── ٢ · انتقالٌ مثبَتُ التكرار — يُختبر الوصل ──
  const transitions = spots
    .filter(
      (s) =>
        s.transitionDays >= TRANSITION_MIN_DISTINCT_DAYS &&
        s.ayah > 1 &&
        memorized.some((r) => r.surah === s.surah && s.ayah >= r.from_ayah && s.ayah <= r.to_ayah)
    )
    .filter((s) => !onCooldown({ surah: s.surah, from_ayah: s.ayah - 1, to_ayah: s.ayah }))
    .sort((a, b) => b.transitionDays - a.transitionDays || a.surah - b.surah || a.ayah - b.ayah);
  if (transitions.length) {
    const s = transitions[0];
    const host = memorized.find((r) => r.surah === s.surah && s.ayah >= r.from_ayah && s.ayah <= r.to_ayah);
    const to = Math.min(host?.to_ayah ?? s.ayah + 1, s.ayah + 2);
    return finish({ surah: s.surah, from_ayah: s.ayah - 1, to_ayah: to }, 'TRANSITION', 'TRANSITION_RECHECK');
  }

  // ── ٣ · موضعٌ سكن — نتأكد أن سكونه ثبات ──
  const settledSpots = spots
    .filter(
      (s) =>
        s.confirmDays > 0 &&
        s.clearDays >= SETTLE_MIN_DISTINCT_DAYS &&
        memorized.some((r) => r.surah === s.surah && s.ayah >= r.from_ayah && s.ayah <= r.to_ayah)
    )
    .filter((s) => !onCooldown({ surah: s.surah, from_ayah: Math.max(1, s.ayah - 1), to_ayah: s.ayah + 1 }))
    .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  if (settledSpots.length) {
    const s = settledSpots[0];
    const host = memorized.find((r) => r.surah === s.surah && s.ayah >= r.from_ayah && s.ayah <= r.to_ayah);
    const from = Math.max(host?.from_ayah ?? 1, s.ayah - 1);
    const to = Math.min(host?.to_ayah ?? s.ayah, s.ayah + 1);
    return finish({ surah: s.surah, from_ayah: from, to_ayah: to }, 'WEAK_RECHECK', 'WEAK_SPOT_RECHECK');
  }

  // ── ٤ · لم يُختبر ثباتُه منذ مدة (أو قط) ──
  const notTested = pool
    .filter((r) => {
      const last = lastTest.get(segKey(r));
      return last === undefined || daysBetween(last, today) >= LONG_NOT_TESTED_DAYS;
    })
    .filter((r) => age(r) >= NEW_LINK_MAX_AGE_DAYS) // الجديد جدًا لقاعدة ٥
    .sort(tie);
  if (notTested.length) return finish(notTested[0], 'FIXED_SEGMENT', 'LONG_NOT_TESTED');

  // ── ٥ · محفوظ جديد نسبيًا — اختبار ربط خفيف ──
  const fresh = pool.filter((r) => age(r) < NEW_LINK_MAX_AGE_DAYS).sort(tie);
  if (fresh.length) return finish(fresh[0], 'FIXED_SEGMENT', 'NEW_LINK');

  return { eligible: false, reason: 'ALL_ON_COOLDOWN' };
}

/** رسائل عدم الأهلية — بلغةٍ تبني، لا شاشة فارغة. */
export const INELIGIBLE_MESSAGE: Record<
  Extract<StabilityDecision, { eligible: false }>['reason'],
  string
> = {
  NO_MEMORIZED: 'بعد ما تحفظ أول مقطع، غراس يقدر يختبر ثباته معك 🌱',
  TESTED_ENOUGH_TODAY: 'اختبرت ثباتك اليوم — ما شاء الله. نلقاك غدًا 🌿',
  ALL_ON_COOLDOWN: 'محفوظك كله اختُبر قريبًا — نرجع له بعد أيام 🌿',
};
