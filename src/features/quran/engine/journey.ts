/**
 * «رحلتي مع القرآن» — اشتقاقٌ لا تخزين.
 *
 * ═══ Derived dashboard, not duplicated state ═══
 * لا جدول «نسبة تقدّم» ولا حقيقة ثانية: كل ما تعرضه الرحلة يُشتق
 * هنا من الجداول التي تملكها المراحل السابقة — الهدف (٧)، المراجعة
 * والمواضع (٦)، أحداث (٢/٣). لو خُزّنت نسبةٌ لانحرفت يومَ أول
 * تعديلٍ في مصدرها، ولصار في المنصة رقمان يتنازعان الصدق.
 *
 * ═══ لا ادّعاء إتقان ═══
 * «مثبت جيدًا» تُقال عن صندوق ≥ ٣ (نفس عتبة اكتمال الهدف
 * `COMPLETION_MIN_BOX`) — لا «أتقنت ١٠٠٪»، فالإتقان الكامل عند
 * ليتنر أعلى من ذلك، والجزم بما لم يثبت كذبٌ لطيف يبقى كذبًا.
 *
 * ═══ دوال نقية ═══
 * «اليوم» يأتي معاملًا (يوم الكويت من `dayAtOffset`)، فتُختبر على
 * أي تاريخ. ولا لفظ يهدم: لا «ضعيف» ولا «فشل» ولا «فاتك».
 */

import { daysBetween, isMastered, type ReviewState } from './review';
import type { DueSegment } from './planner';
import { COMPLETION_MIN_BOX, type SpotLite } from './plan';
import { SETTLE_MIN_DISTINCT_DAYS, TRANSITION_MIN_DISTINCT_DAYS } from './memory';

/* ═══════════════ ١ · حالة الآية ═══════════════ */

/**
 * حالة آيةٍ واحدة في خريطة السورة — خمس حالات مشتقّة:
 *
 *   UPCOMING    ما زالت قادمة
 *   MEMORIZING  ضمن الهدف الجاري ولم يثبت بلوغها
 *   REACHED     بُلغت (راجعتها بنجاح يومًا على الأقل)
 *   SETTLED     مثبتة جيدًا (صندوق ≥ ٣ أو إتقان ليتنر)
 *   NEEDS_CARE  فيها موضعُ تثبيتٍ نشط أو مراجعتها مستحقة
 *
 * ⚠️ «الوصول ≠ الإتقان» — لذلك REACHED وSETTLED حالتان لا حالة.
 */
export type AyahState = 'UPCOMING' | 'MEMORIZING' | 'REACHED' | 'SETTLED' | 'NEEDS_CARE';

/** رمزٌ ووسمٌ لكل حالة — لا لونًا وحده (Accessibility). */
export const AYAH_STATE_META: Record<AyahState, { symbol: string; label: string }> = {
  UPCOMING: { symbol: '◌', label: 'قادمة' },
  MEMORIZING: { symbol: '✎', label: 'أحفظها الآن' },
  REACHED: { symbol: '●', label: 'وصلت إليها' },
  SETTLED: { symbol: '✓', label: 'مثبتة جيدًا' },
  NEEDS_CARE: { symbol: '↻', label: 'نتعاهدها' },
};

export type JourneyGoal = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  status: string;
};

/**
 * خريطة آيات سورة — من صفوف المراجعة والمواضع والهدف، بلا تخزين.
 */
export function ayahStates(
  surah: number,
  ayahCount: number,
  reviews: DueSegment[],
  spots: SpotLite[],
  activeGoal: JourneyGoal | null,
  today: string
): AyahState[] {
  const reached = new Set<number>();
  const settled = new Set<number>();
  const due = new Set<number>();
  for (const r of reviews) {
    if (r.surah !== surah) continue;
    const isDueNow = daysBetween(r.state.dueOn, today) >= 0;
    const strong = r.state.box >= COMPLETION_MIN_BOX || isMastered(r.state);
    for (let a = r.from_ayah; a <= Math.min(r.to_ayah, ayahCount); a++) {
      if (r.state.distinctDays >= 1) reached.add(a);
      if (strong) settled.add(a);
      if (isDueNow) due.add(a);
    }
  }
  const spotted = new Set(
    spots.filter((s) => s.surah === surah && s.confirmDays > 0 && s.clearDays < SETTLE_MIN_DISTINCT_DAYS).map((s) => s.ayah)
  );

  const out: AyahState[] = [];
  for (let a = 1; a <= ayahCount; a++) {
    if (spotted.has(a) || (due.has(a) && reached.has(a))) out.push('NEEDS_CARE');
    else if (settled.has(a)) out.push('SETTLED');
    else if (reached.has(a)) out.push('REACHED');
    else if (activeGoal && activeGoal.surah === surah && a >= activeGoal.from_ayah && a <= activeGoal.to_ayah)
      out.push('MEMORIZING');
    else out.push('UPCOMING');
  }
  return out;
}

/**
 * تكتيل الخريطة للسور الطويلة — لا مئات العناصر في الشاشة.
 * كل مقطعٍ متجانسٍ متتالٍ يصير كتلةً واحدة بمداه وحالته.
 */
export type AyahBlock = { from: number; to: number; state: AyahState };

export function groupAyahStates(states: AyahState[]): AyahBlock[] {
  const blocks: AyahBlock[] = [];
  for (let i = 0; i < states.length; i++) {
    const last = blocks[blocks.length - 1];
    if (last && last.state === states[i]) last.to = i + 1;
    else blocks.push({ from: i + 1, to: i + 1, state: states[i] });
  }
  return blocks;
}

/* ═══════════════ ٢ · رحلة السور ═══════════════ */

export type SurahBucket = 'MEMORIZING_NOW' | 'MEMORIZED_REVIEWED' | 'STARTED_BEFORE';

/**
 * تصنيف سور الطالبة — لا شبكة ١١٤ سورة مزدحمة:
 *   جاري الحفظ: سورة الهدف النشط
 *   حفظتها وراجعتها: كل مقاطعها المعروفة مثبتة جيدًا
 *   بدأت بها سابقًا: لها أثرُ مراجعةٍ ولم تثبت كلها
 */
export function surahBuckets(
  reviews: DueSegment[],
  activeGoal: JourneyGoal | null
): { surah: number; bucket: SurahBucket }[] {
  const bySurah = new Map<number, DueSegment[]>();
  for (const r of reviews) {
    const list = bySurah.get(r.surah) ?? [];
    list.push(r);
    bySurah.set(r.surah, list);
  }
  const out: { surah: number; bucket: SurahBucket }[] = [];
  const seen = new Set<number>();
  if (activeGoal) {
    out.push({ surah: activeGoal.surah, bucket: 'MEMORIZING_NOW' });
    seen.add(activeGoal.surah);
  }
  bySurah.forEach((segs, surah) => {
    if (seen.has(surah)) return;
    const allSettled = segs.every(
      (s: DueSegment) => s.state.box >= COMPLETION_MIN_BOX || isMastered(s.state)
    );
    out.push({ surah, bucket: allSettled ? 'MEMORIZED_REVIEWED' : 'STARTED_BEFORE' });
  });
  return out;
}

/* ═══════════════ ٣ · التاريخ الزمني ═══════════════ */

/**
 * المعالم من سجل الأحداث القائم — **لا حدث جديد ولا تاريخ يُخترع**:
 * ما لا يكفي سجلُّه لا يُلفَّق له ماضٍ، والصفحة تقول «منذ بدء تسجيل
 * رحلتك». وليست كل نقرة مَعلمًا — أنواعٌ مختارة وحدها.
 */
export const MILESTONE_LABEL: Record<string, string> = {
  segment_mastered: 'أتقنتِ مقطعًا حتى رسخ',
  goal_completed: 'اكتمل هدف حفظ 🌿',
  weak_spot_improved: 'ثبّتِّ موضعًا كان يحتاج عناية',
  recitation_without_help: 'سمّعتِ بلا أي مساعدة',
  returned_after_break: 'عدتِ بعد انقطاع — أهلًا بعودتك',
  reviewed_on_time: 'راجعتِ في موعدك',
};

export type TimelineItem = { day: string; label: string; surah: number | null };

export function timelineFromEvents(
  events: { kind: string; surah: number | null; created_at: string }[],
  kuwaitDayOf: (iso: string) => string,
  limit = 20
): TimelineItem[] {
  const out: TimelineItem[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const label = MILESTONE_LABEL[e.kind];
    if (!label) continue; // ليس كل حدثٍ مَعلمًا
    const day = kuwaitDayOf(e.created_at);
    const key = `${day}|${e.kind}|${e.surah ?? ''}`;
    if (seen.has(key)) continue; // معلمٌ واحد من نوعه في يومه
    seen.add(key);
    out.push({ day, label, surah: e.surah ?? null });
    if (out.length >= limit) break;
  }
  return out;
}

/* ═══════════════ ٤ · النشاط — بلا سلسلة عقابية ═══════════════ */

/**
 * أيام نشاط — «نشطتِ ٤ أيام هذا الأسبوع 🌿» لا «ستفقدين سلسلتك».
 * تُحسب أيامًا كويتية مميزة من أحداثٍ قائمة، ولا يظهر انقطاعٌ فشلًا.
 */
export function activeDays(
  eventDays: string[],
  today: string,
  windowDays: number
): number {
  const set = new Set<string>();
  for (const d of eventDays) {
    const gap = daysBetween(d, today);
    if (gap >= 0 && gap < windowDays) set.add(d);
  }
  return set.size;
}

/* ═══════════════ ٥ · تلخيص المواضع للعرض ═══════════════ */

/** سطر الموضع بلغة الطالبة — لا transition_days ولا confirm_days. */
export function spotDisplay(s: SpotLite): { kind: 'transition' | 'spot'; ayah: number } {
  return {
    kind: s.transitionDays >= TRANSITION_MIN_DISTINCT_DAYS && s.ayah > 1 ? 'transition' : 'spot',
    ayah: s.ayah,
  };
}

/** عدّاد تقدّم الهدف: بُلغ مقابل ثبت — شريطان لا شريط يكذب. */
export function goalSegments(
  goal: JourneyGoal,
  states: AyahState[]
): { reached: number; settled: number; total: number } {
  let reached = 0;
  let settled = 0;
  for (let a = goal.from_ayah; a <= goal.to_ayah; a++) {
    const st = states[a - 1];
    if (st === 'SETTLED') settled++;
    if (st === 'SETTLED' || st === 'REACHED' || st === 'NEEDS_CARE') reached++;
  }
  return { reached, settled, total: goal.to_ayah - goal.from_ayah + 1 };
}
