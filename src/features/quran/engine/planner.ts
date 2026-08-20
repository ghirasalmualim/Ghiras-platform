/**
 * خطة الحفظ ومهمة اليوم.
 *
 * مخطّط **واحد** يخدم المنهج الدراسي والقسم العام معًا. الفرق بينهما
 * مصدر الهدف لا طريقة تقسيمه: درس المنهج له موعد تسميع تحدّده المعلمة،
 * والهدف الشخصي له تاريخ تختاره الطالبة. وما بعد ذلك واحد.
 *
 * ── لا تُخزَّن الخطة، بل تُحسب ──
 * لو خزّنّا جدول أيام لكل خطة، لصارت الخطة قديمة في اليوم الذي تغيب
 * فيه الطالبة، ولاحتجنا وظيفة تعيد جدولتها. أما حسابها من (المتبقي،
 * الأيام الباقية، ما أُتقن) وقت الطلب، فتصحّح نفسها بنفسها: غيابُ يوم
 * يعيد التوزيع تلقائيًا، وإتقانُ مقطع مبكرًا يخفّف ما بعده.
 *
 * ── ولا وقت في الحسابات ──
 * التقدير الزمني للعرض فقط («حوالي ٧ دقائق»)، ولا يدخل في أي قرار،
 * ولا يوجد مؤقّت، ولا تُقاس صعوبة بثوانٍ.
 */

import { addDays, daysBetween, type ReviewState, isMastered } from './review';

/** الحدّ الذي نعدّه فوق الطاقة ليوم واحد. */
export const MAX_AYAHS_PER_DAY = 8;

/** تقدير زمني تقريبي للعرض — ليس قياسًا ولا التزامًا. */
const MINUTES = { listen: 2, memorize: 3, review: 2, practice: 2 } as const;

export type PlanKind = 'memorize' | 'consolidate' | 'link' | 'final_review';

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  memorize: 'حفظ جديد',
  consolidate: 'تثبيت',
  link: 'ربط',
  final_review: 'مراجعة نهائية',
};

export type PlanDay = {
  /** YYYY-MM-DD */
  date: string;
  /** السورة — مكرّرة هنا ليكون اليوم مكتفيًا بذاته عند بناء المهمة. */
  surah: number;
  kind: PlanKind;
  /** المقدار الجديد لهذا اليوم — قد يكون فارغًا في أيام المراجعة. */
  from_ayah: number | null;
  to_ayah: number | null;
  /** ما يُراجع اليوم مما سبق حفظه. */
  review_from: number | null;
  review_to: number | null;
};

export type Plan = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  target_date: string;
  days: PlanDay[];
  /** الكمية اليومية تجاوزت المعقول — تُعرض للطالبة نصيحةٌ لا لومًا. */
  overloaded: boolean;
  /** انقضى الموعد ولم يكتمل الحفظ. */
  overdue: boolean;
};

/**
 * يبني الخطة من اليوم إلى موعد التسميع.
 *
 * @param masteredUpTo آخر آية أُتقنت من المقطع (٠ = لم يُتقن شيء).
 *                     البداية من بعدها، فلا يُعاد حفظ ما رسخ.
 */
export function buildPlan(
  surah: number,
  from_ayah: number,
  to_ayah: number,
  target_date: string,
  today: string,
  masteredUpTo = 0
): Plan {
  const start = Math.max(from_ayah, masteredUpTo + 1);
  const remaining = Math.max(0, to_ayah - start + 1);
  const daysLeft = daysBetween(today, target_date) + 1; // اليوم محسوب

  if (remaining === 0)
    return {
      surah,
      from_ayah,
      to_ayah,
      target_date,
      days: [],
      overloaded: false,
      overdue: false,
    };

  // انقضى الموعد: نعرض خطة اليوم كاملة ونصارح بأن الموعد مضى
  if (daysLeft <= 0)
    return {
      surah,
      from_ayah,
      to_ayah,
      target_date,
      days: [
        {
          date: today,
          surah,
          kind: 'final_review',
          from_ayah: start,
          to_ayah,
          review_from: from_ayah,
          review_to: to_ayah,
        },
      ],
      overloaded: remaining > MAX_AYAHS_PER_DAY,
      overdue: true,
    };

  // آخر يوم للمراجعة لا للحفظ الجديد — شرط صريح من هيّسة.
  // ولا يبقى بلا حفظ إلا إذا كان عندنا يومان فأكثر.
  const newDays = daysLeft > 1 ? daysLeft - 1 : 1;
  const perDay = Math.ceil(remaining / newDays);

  const days: PlanDay[] = [];
  let cursor = start;

  for (let i = 0; i < daysLeft; i++) {
    const date = addDays(today, i);
    const isLast = i === daysLeft - 1;
    const done = cursor > to_ayah;

    if (isLast && daysLeft > 1) {
      days.push({
        date,
        surah,
        kind: 'final_review',
        from_ayah: done ? null : cursor,
        to_ayah: done ? null : to_ayah,
        review_from: from_ayah,
        review_to: to_ayah,
      });
      break;
    }

    if (done) {
      // اكتمل الحفظ قبل الموعد — بقية الأيام تثبيت وربط
      days.push({
        date,
        surah,
        kind: 'link',
        from_ayah: null,
        to_ayah: null,
        review_from: from_ayah,
        review_to: to_ayah,
      });
      continue;
    }

    const sliceTo = Math.min(to_ayah, cursor + perDay - 1);
    days.push({
      date,
      surah,
      // اليوم الأول حفظ خالص، وما بعده حفظ جديد مع ربط ما سبق
      kind: i === 0 ? 'memorize' : 'consolidate',
      from_ayah: cursor,
      to_ayah: sliceTo,
      review_from: i === 0 ? null : from_ayah,
      review_to: i === 0 ? null : cursor - 1,
    });
    cursor = sliceTo + 1;
  }

  return {
    surah,
    from_ayah,
    to_ayah,
    target_date,
    days,
    overloaded: perDay > MAX_AYAHS_PER_DAY,
    overdue: false,
  };
}

/** نصيب اليوم من الخطة، أو null إن لم يكن اليوم ضمنها. */
export function todaySlice(plan: Plan, today: string): PlanDay | null {
  return plan.days.find((d) => d.date === today) ?? null;
}

// ── مهمة اليوم ──────────────────────────────────────────────

export type TaskItem = {
  icon: string;
  label: string;
  href: string;
  minutes: number;
};

export type DailyTask = {
  items: TaskItem[];
  /** تقدير إجمالي — تقريبي ولا يُلزم أحدًا. */
  minutes: number;
};

export type DueSegment = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  state: ReviewState;
};

/**
 * يبني مهمة اليوم.
 *
 * قصيرة عن قصد. وترتيبها مقصود: المراجعة المستحقة أولًا لأن المؤجَّل
 * منها يُنسى، ثم الحفظ الجديد، ثم ما يُثبّت.
 */
export function buildDailyTask(
  plan: Plan | null,
  due: DueSegment[],
  today: string,
  surahName: (n: number) => string,
  toArabicDigits: (n: number) => string
): DailyTask {
  const items: TaskItem[] = [];
  const slice = plan ? todaySlice(plan, today) : null;

  if (due.length) {
    items.push({
      icon: '🔄',
      label:
        due.length === 1
          ? `راجع ${surahName(due[0].surah)} ${toArabicDigits(due[0].from_ayah)}–${toArabicDigits(due[0].to_ayah)}`
          : `راجع ${toArabicDigits(due.length)} مقاطع مستحقة`,
      href: '/quran/review',
      minutes: MINUTES.review * Math.min(due.length, 3),
    });
  }

  if (slice && slice.from_ayah && slice.to_ayah) {
    const range = `${toArabicDigits(slice.from_ayah)}–${toArabicDigits(slice.to_ayah)}`;
    items.push({
      icon: '🎧',
      label: `استمع إلى ${surahName(slice.surah)} ${range}`,
      href: `/quran/study/${slice.surah}/${slice.from_ayah}/${slice.to_ayah}`,
      minutes: MINUTES.listen,
    });
    items.push({
      icon: '🧠',
      label: `احفظ ${range}`,
      href: `/quran/study/${slice.surah}/${slice.from_ayah}/${slice.to_ayah}`,
      minutes: MINUTES.memorize,
    });
  }

  if (slice && slice.review_from && slice.review_to) {
    items.push({
      icon: '🔗',
      label: `اربط ما حفظت ${toArabicDigits(slice.review_from)}–${toArabicDigits(slice.review_to)}`,
      href: `/quran/study/${slice.surah}/${slice.review_from}/${slice.review_to}`,
      minutes: MINUTES.review,
    });
  }

  if (items.length) {
    const t = slice ?? null;
    items.push({
      icon: '✨',
      label: 'أكمل تدريبًا قصيرًا',
      href: t?.from_ayah
        ? `/quran/study/${t.surah}/${t.from_ayah}/${t.to_ayah}`
        : due.length
          ? '/quran/review'
          : '/quran',
      minutes: MINUTES.practice,
    });
  }

  return { items, minutes: items.reduce((s, i) => s + i.minutes, 0) };
}

/**
 * رسالة العودة بعد انقطاع.
 *
 * ⚠️ لا «خسرتِ السلسلة» ولا «تأخّرتِ عن خطتك». من انقطع ثم عاد يحتاج
 * ترحيبًا لا محاسبة، والعتاب يجعل العودة أثقل من الانقطاع.
 */
export function welcomeBack(lastActiveOn: string | null, today: string): string | null {
  if (!lastActiveOn) return null;
  const gap = daysBetween(lastActiveOn, today);
  if (gap < 2) return null;
  return 'سعداء بعودتك 🌱 نكمل من المكان الذي توقفنا عنده.';
}

/** المستحق اليوم من بين مقاطع الطالبة. */
export function dueToday(segments: DueSegment[], today: string): DueSegment[] {
  return segments
    .filter((s) => daysBetween(s.state.dueOn, today) >= 0)
    .sort((a, b) => daysBetween(b.state.dueOn, today) - daysBetween(a.state.dueOn, today));
}

/** المقاطع التي تحتاج تقوية — ما لم يرسخ بعدُ، لا ما «فشل» فيه. */
export function needsWork(segments: DueSegment[]): DueSegment[] {
  return segments.filter((s) => !isMastered(s.state) && s.state.box <= 1);
}
