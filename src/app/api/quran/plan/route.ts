import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import {
  buildMemorizationPlan,
  dayAtOffset,
  feasibilityMessage,
  goalStatus,
  todayPlanDay,
  type PlanGoal,
  type SpotLite,
} from '@/features/quran/engine/plan';
import { SETTLE_MIN_DISTINCT_DAYS } from '@/features/quran/engine/memory';
import type { DueSegment } from '@/features/quran/engine/planner';
import type { ReviewState } from '@/features/quran/engine/review';
import { checkPolicySafe, RATE_MESSAGES } from '@/features/quran/engine/rate-policies';

/**
 * خطة اليوم — تُحسب هنا وتُقرأ من كل الواجهات.
 *
 * ═══ لماذا على الخادم ═══
 * المصحفُ ملفٌّ في المستودع (ميغابايتات) لا يُشحن للمتصفح لعدّ
 * كلمات، والتقدّمُ الموثوق يُشتق من جداول المرحلة ٦ — فالحساب يقع
 * حيث البيانات، والواجهات كلها (بطاقة اليوم، «خطة حفظي») تقرأ من
 * نقطةٍ واحدة فلا تختلف بطاقةٌ عن صفحة.
 *
 * ⚠️ قراءةٌ خالصة: لا يكتب هذا المسار شيئًا. الكتابة كلها في
 * `/api/quran/goal`.
 *
 * ⚠️ «اليوم» يومُ الكويت (`dayAtOffset`) لا يوم UTC.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toState = (r: Record<string, unknown>): ReviewState => ({
  box: Number(r.box ?? 0),
  distinctDays: Number(r.distinct_days ?? 0),
  lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
  dueOn: String(r.due_on),
});

/** كلمات كل آية — عدٌّ بسيط مفسَّر من نص المصحف نفسه. */
function ayahWordCounts(surah: number, from: number, to: number): number[] {
  return getAyahs(surah, from, to).map((a) => a.text_uthmani.trim().split(/\s+/).length);
}

/**
 * التقدّم الموثوق: أبعدُ آيةٍ متصلة من أول الهدف غطّتها مقاطعُ
 * راجعتها الطالبة بنجاح يومًا واحدًا على الأقل (تدريبًا أو تسميعًا
 * محكومًا — كلاهما يكتب `quran_review_state`).
 *
 * ⚠️ الاتصال شرط: ثقبٌ في الوسط يوقف العدّ عنده — «بلغتُ» تعني
 * أن ما قبلها كلَّه مرّ، لا أن جزيرةً بعيدة لُمست.
 */
function verifiedUpToFrom(goal: PlanGoal, reviews: DueSegment[]): number {
  const covered = new Set<number>();
  for (const r of reviews) {
    if (r.surah !== goal.surah || r.state.distinctDays < 1) continue;
    for (let a = r.from_ayah; a <= r.to_ayah; a++) covered.add(a);
  }
  let up = goal.from_ayah - 1;
  while (up < goal.to_ayah && covered.has(up + 1)) up++;
  return up;
}

export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });
  // حدّ الاستدعاء — سياسة READ المركزية (fail-open عند عطل العدّاد نفسه)
  {
    const rl = checkPolicySafe('READ', user.id);
    if (!rl.ok)
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: RATE_MESSAGES.shortWait, retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
  }


  const today = dayAtOffset(Date.now());

  const { data: g } = await supabase
    .from('quran_goal')
    .select(
      'id, surah, from_ayah, to_ayah, target_date, start_date, days_of_week, intensity, status, source, lesson_id, user_marked_up_to, created_at'
    )
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!g) return NextResponse.json({ goal: null, today });

  const goal: PlanGoal = {
    surah: Number(g.surah),
    from_ayah: Number(g.from_ayah),
    to_ayah: Number(g.to_ayah),
    targetDate: (g.target_date as string | null) ?? null,
    startDate: (g.start_date as string | null) ?? today,
    daysOfWeek: ((g.days_of_week as number[] | null) ?? []).map(Number),
    intensity: (['light', 'balanced', 'intense'].includes(String(g.intensity))
      ? String(g.intensity)
      : 'balanced') as PlanGoal['intensity'],
  };

  // مقاطع الطالبة كلها — المراجعة عامّة لا تخصّ سورة الهدف وحدها
  const { data: revRows } = await supabase
    .from('quran_review_state')
    .select('surah, from_ayah, to_ayah, box, distinct_days, last_reviewed_on, due_on')
    .eq('user_id', user.id);
  const reviews: DueSegment[] = (revRows ?? []).map((r) => ({
    surah: Number(r.surah),
    from_ayah: Number(r.from_ayah),
    to_ayah: Number(r.to_ayah),
    state: toState(r),
  }));

  const { data: spotRows } = await supabase
    .from('quran_memory_spot')
    .select('surah, ayah, confirm_days, clear_days, transition_days')
    .eq('user_id', user.id);
  const spots: SpotLite[] = (spotRows ?? [])
    .map((r) => ({
      surah: Number(r.surah),
      ayah: Number(r.ayah),
      confirmDays: Number(r.confirm_days ?? 0),
      clearDays: Number(r.clear_days ?? 0),
      transitionDays: Number(r.transition_days ?? 0),
    }))
    .filter((s) => s.confirmDays > 0 && s.clearDays < SETTLE_MIN_DISTINCT_DAYS);

  const verifiedUpTo = verifiedUpToFrom(goal, reviews);
  const userMarkedUpTo = Number(g.user_marked_up_to ?? 0);

  const plan = buildMemorizationPlan({
    goal,
    ayahWords: ayahWordCounts(goal.surah, goal.from_ayah, goal.to_ayah),
    verifiedUpTo,
    userMarkedUpTo,
    reviews,
    spots,
    today,
  });

  const status =
    g.status === 'CANCELLED' ? 'CANCELLED' : goalStatus(goal, verifiedUpTo, userMarkedUpTo, reviews);

  /**
   * الحالة تُثبَّت في الصف حين تتقدّم — كتابةُ مزامنةٍ وحيدة، من
   * حالةٍ اشتُقّت هنا من الجداول الموثوقة لا من قول المتصفح.
   */
  const ORDER = ['MEMORIZING', 'FULL_RANGE_REACHED', 'CONSOLIDATING', 'COMPLETED'];
  if (status !== 'CANCELLED' && ORDER.indexOf(status) > ORDER.indexOf(String(g.status))) {
    await supabase
      .from('quran_goal')
      .update({ status, ...(status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}) })
      .eq('id', g.id)
      .eq('user_id', user.id);
    if (status === 'COMPLETED') {
      // حدثٌ محايد — لا مكافأة ولا مساس بالحديقة (قرار المرحلة ٧)
      await supabase
        .from('quran_event')
        .insert({ user_id: user.id, kind: 'goal_completed', surah: goal.surah, from_ayah: goal.from_ayah, to_ayah: goal.to_ayah })
        .then(undefined, () => {});
    }
  }

  const surahMeta = getSurah(goal.surah);
  const totalWords = ayahWordCounts(goal.surah, goal.from_ayah, goal.to_ayah).reduce((a, b) => a + b, 0);
  const doneWords =
    verifiedUpTo >= goal.from_ayah
      ? ayahWordCounts(goal.surah, goal.from_ayah, verifiedUpTo).reduce((a, b) => a + b, 0)
      : 0;

  return NextResponse.json({
    today,
    goal: {
      id: g.id,
      surah: goal.surah,
      surahName: surahMeta?.name_ar ?? `سورة ${goal.surah}`,
      from_ayah: goal.from_ayah,
      to_ayah: goal.to_ayah,
      targetDate: goal.targetDate,
      daysOfWeek: goal.daysOfWeek,
      intensity: goal.intensity,
      source: g.source,
      status,
      verifiedUpTo,
      userMarkedUpTo,
      progressPercent: totalWords ? Math.round((doneWords / totalWords) * 100) : 0,
    },
    todayDay: todayPlanDay(plan, today),
    /** نظرة قريبة فقط — لا تقويم ضخمًا. */
    upcoming: plan.days.filter((d) => d.date > today).slice(0, 4),
    feasibility: plan.feasibility,
    feasibilityMessage: feasibilityMessage(plan.feasibility),
    overdue: plan.overdue,
  });
}
