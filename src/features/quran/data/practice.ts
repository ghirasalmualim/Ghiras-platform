'use client';

/**
 * تسجيل التدريب وحالة المراجعة.
 *
 * ⚠️ ما يُحفظ هنا هو الحد الأدنى المفيد فقط: المقطع، والآية، ونوع
 * النشاط، وهل أجابت من أول محاولة، وعدد المحاولات، ومستوى التلميح.
 * ولا صوت ولا تفريغ ولا أي أثر لصوت طفل — لا الآن ولا حين يأتي
 * التسميع الذكي.
 *
 * ⚠️ وهذا كله **للمسجَّلة وحدها**. الزائرة تقرأ وتستمع وتتدرّب بحرية،
 * ولا نتتبّعها ولا نبني لها ملفًا. المراجعة المتباعدة تحتاج تاريخًا
 * يمتدّ أيامًا، وهذا لا يقوم إلا على حساب.
 */

import { createClient } from '@/lib/supabase/client';
import type { ActivityKind } from '../engine/activities';
import {
  applySession,
  toDay,
  type Quality,
  type ReviewState,
} from '../engine/review';
import type { Segment } from '../types';

export type AttemptRecord = {
  segment: Segment;
  ayah: number;
  activity: ActivityKind;
  firstTry: boolean;
  attempts: number;
  hintLevel: 0 | 1 | 2 | 3;
};

async function currentUserId(): Promise<string | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

/** يسجّل نتيجة تدريب واحد. الفشل صامت — التدريب لا يتعطّل لأجل سجل. */
export async function recordAttempt(a: AttemptRecord): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const sb = createClient();
  try {
    await sb.from('quran_activity_attempt').insert({
      user_id: uid,
      surah: a.segment.surah,
      from_ayah: a.segment.from_ayah,
      to_ayah: a.segment.to_ayah,
      ayah: a.ayah,
      activity: a.activity,
      first_try: a.firstTry,
      attempts: Math.min(20, Math.max(1, a.attempts)),
      hint_level: a.hintLevel,
    });
  } catch {
    /* التدريب أهم من سجلّه */
  }
}

const toState = (r: Record<string, unknown>): ReviewState => ({
  box: Number(r.box ?? 0),
  distinctDays: Number(r.distinct_days ?? 0),
  lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
  dueOn: String(r.due_on),
});

export async function getReviewState(seg: Segment): Promise<ReviewState | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const sb = createClient();
  const { data } = await sb
    .from('quran_review_state')
    .select('box, distinct_days, last_reviewed_on, due_on')
    .eq('user_id', uid)
    .eq('surah', seg.surah)
    .eq('from_ayah', seg.from_ayah)
    .eq('to_ayah', seg.to_ayah)
    .maybeSingle();
  return data ? toState(data) : null;
}

/**
 * يُنهي جلسة تدريب: يحسب الحالة الجديدة ويحفظها.
 *
 * الحساب يجري في `applySession` — دالة نقية مختبَرة. وهذه الدالة لا
 * تفعل غير القراءة والكتابة، فلا تُعاد قواعد المراجعة هنا ولا تتفرّع
 * عن نظيرتها في المحرك.
 */
export async function finishSession(
  seg: Segment,
  quality: Quality,
  today = toDay(new Date())
): Promise<ReviewState | null> {
  const uid = await currentUserId();
  if (!uid) return null;

  const prev = await getReviewState(seg);
  const next = applySession(prev, quality, today);

  const sb = createClient();
  try {
    await sb.from('quran_review_state').upsert(
      {
        user_id: uid,
        surah: seg.surah,
        from_ayah: seg.from_ayah,
        to_ayah: seg.to_ayah,
        box: next.box,
        distinct_days: next.distinctDays,
        last_reviewed_on: next.lastReviewedOn,
        due_on: next.dueOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,surah,from_ayah,to_ayah' }
    );
  } catch {
    /* يُعاد الحساب في الجلسة القادمة */
  }
  return next;
}

export type StoredSegment = Segment & { state: ReviewState };

/** كل مقاطع الطالبة وحالتها — تقرأها صفحة المراجعة ومهمة اليوم. */
export async function getAllSegments(): Promise<StoredSegment[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const sb = createClient();
  const { data, error } = await sb
    .from('quran_review_state')
    .select('surah, from_ayah, to_ayah, box, distinct_days, last_reviewed_on, due_on')
    .eq('user_id', uid)
    .order('due_on');
  if (error || !data) return [];
  return data.map((r) => ({
    surah: Number(r.surah),
    from_ayah: Number(r.from_ayah),
    to_ayah: Number(r.to_ayah),
    state: toState(r),
  }));
}

/**
 * إزالة مقطع من المراجعة.
 *
 * ── لماذا نحتاجها ──
 * المقطع يدخل المراجعة بمجرّد أن تفتحه الطالبة، وقد تفتحه ثم تعدل
 * عنه — أو تجرّب المنصة أول مرة فتخلّف وراءها مقاطع لا تنوي حفظها.
 * وبلا إزالة تبقى معلّقة في مراجعتها أبدًا، فتثقل قائمتها كل يوم
 * وتُشعرها بتأخّرٍ لا ذنب لها فيه.
 *
 * ⚠️ ولا تُحذف إلا حالة المراجعة: التدريبات السابقة وموضع القراءة
 * يبقيان. فإن عادت إلى المقطع يومًا بدأ جدولُه من جديد، ولم يضِع
 * تاريخُها معه.
 *
 * ⚠️ والحذف مقصورٌ على صفوف الطالبة نفسها بسياسة قاعدة البيانات —
 * لا بشرطٍ في هذا السطر وحده.
 */
export async function removeSegment(seg: Segment): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const sb = createClient();
  const { error } = await sb
    .from('quran_review_state')
    .delete()
    .eq('user_id', uid)
    .eq('surah', seg.surah)
    .eq('from_ayah', seg.from_ayah)
    .eq('to_ayah', seg.to_ayah);
  return !error;
}

/** أداء الطالبة حسب نوع النشاط — يوجّه اختيار التدريب القادم. */
export async function getActivityPerformance(
  seg: Segment
): Promise<Partial<Record<ActivityKind, { wrong: number; total: number }>>> {
  const uid = await currentUserId();
  if (!uid) return {};
  const sb = createClient();
  const { data } = await sb
    .from('quran_activity_attempt')
    .select('activity, first_try')
    .eq('user_id', uid)
    .eq('surah', seg.surah)
    .eq('from_ayah', seg.from_ayah)
    .eq('to_ayah', seg.to_ayah)
    .order('created_at', { ascending: false })
    .limit(60);
  if (!data) return {};

  const out: Partial<Record<ActivityKind, { wrong: number; total: number }>> = {};
  for (const r of data) {
    const k = r.activity as ActivityKind;
    const cur = out[k] ?? { wrong: 0, total: 0 };
    cur.total += 1;
    if (!r.first_try) cur.wrong += 1;
    out[k] = cur;
  }
  return out;
}

// ── الأهداف ────────────────────────────────────────────────

export type Goal = Segment & {
  id: string;
  target_date: string;
  source: 'personal' | 'curriculum';
};

export async function getActiveGoal(): Promise<Goal | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const sb = createClient();
  const { data } = await sb
    .from('quran_goal')
    .select('id, surah, from_ayah, to_ayah, target_date, source')
    .eq('user_id', uid)
    .eq('is_active', true)
    .order('target_date')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    surah: Number(data.surah),
    from_ayah: Number(data.from_ayah),
    to_ayah: Number(data.to_ayah),
    target_date: String(data.target_date),
    source: data.source as 'personal' | 'curriculum',
  };
}

export async function setGoal(
  seg: Segment,
  targetDate: string,
  source: 'personal' | 'curriculum' = 'personal',
  lessonId?: string
): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const sb = createClient();
  // هدف واحد نشط في كل مرة — خطة واحدة أوضح للطالبة من خطط متزاحمة
  await sb.from('quran_goal').update({ is_active: false }).eq('user_id', uid);
  const { error } = await sb.from('quran_goal').insert({
    user_id: uid,
    surah: seg.surah,
    from_ayah: seg.from_ayah,
    to_ayah: seg.to_ayah,
    target_date: targetDate,
    source,
    lesson_id: lessonId ?? null,
    is_active: true,
  });
  return !error;
}

// ── الأحداث ────────────────────────────────────────────────

export type EventKind =
  | 'daily_task_done'
  | 'reviewed_on_time'
  | 'segment_mastered'
  | 'streak_days'
  | 'returned_after_break'
  | 'review_without_hint'
  // ── أحداث التسميع (المرحلة ٣) — تُسجَّل الآن وتقرأها الحديقة لاحقًا
  | 'recitation_completed'
  | 'recitation_without_help'
  | 'weak_spot_improved'
  | 'review_completed';

/**
 * يسجّل حدثًا يستحق الاحتفاء لاحقًا.
 *
 * لا تقرأ منه المرحلة ٢ شيئًا ولا تعرضه. وُجد الآن ليكون للحديقة في
 * المرحلة القادمة سجلٌّ تقرأ منه، بدل أن تُشتقّ التقدّم من جديد أو —
 * وهو الأسوأ — ينبت بجانب هذا النظام نظامُ تقدّم ثانٍ.
 */
export async function recordEvent(kind: EventKind, seg?: Segment): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const sb = createClient();
  try {
    await sb.from('quran_event').insert({
      user_id: uid,
      kind,
      surah: seg?.surah ?? null,
      from_ayah: seg?.from_ayah ?? null,
      to_ayah: seg?.to_ayah ?? null,
    });
  } catch {
    /* الاحتفاء لا يستحق تعطيل شيء */
  }
}

/* ═══════════════ مواضع التثبيت (المرحلة ٦) ═══════════════ */

/**
 * موضع تثبيت كما تعرضه الواجهة — آيةٌ رصد التسميعُ فيها تعثّرًا
 * مؤكَّدًا ولم تسكن بعد.
 *
 * ⚠️ القراءة فقط: الجدول لا يقبل كتابةً من المتصفح أصلًا — يكتبه
 * الخادم وحده بعد أن يحكم على التسميع بنفسه. فلا دالة حفظ هنا،
 * وليست نسيانًا.
 */
export type MemorySpot = {
  surah: number;
  ayah: number;
  confirmDays: number;
  clearDays: number;
  transitionDays: number;
};

export async function getMemorySpots(): Promise<MemorySpot[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const sb = createClient();
  const { data, error } = await sb
    .from('quran_memory_spot')
    .select('surah, ayah, confirm_days, clear_days, transition_days')
    .eq('user_id', uid)
    .order('surah')
    .order('ayah');
  if (error || !data) return [];
  return data.map((r) => ({
    surah: Number(r.surah),
    ayah: Number(r.ayah),
    confirmDays: Number(r.confirm_days ?? 0),
    clearDays: Number(r.clear_days ?? 0),
    transitionDays: Number(r.transition_days ?? 0),
  }));
}
