import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSurah } from '@/features/quran/data/corpus';
import { dayAtOffset } from '@/features/quran/engine/plan';
import { SETTLE_MIN_DISTINCT_DAYS } from '@/features/quran/engine/memory';
import {
  activeDays,
  ayahStates,
  goalSegments,
  groupAyahStates,
  spotDisplay,
  surahBuckets,
  timelineFromEvents,
  type JourneyGoal,
} from '@/features/quran/engine/journey';
import type { DueSegment } from '@/features/quran/engine/planner';
import type { ReviewState } from '@/features/quran/engine/review';
import type { SpotLite } from '@/features/quran/engine/plan';
import { daysBetween } from '@/features/quran/engine/review';

/**
 * «رحلتي مع القرآن» — طبقة تجميعٍ واحدة.
 *
 * ═══ لماذا مسارٌ واحد ═══
 * الصفحة تحتاج ستّ حقائق من ستّ جداول — لو سألها المتصفح ستّ مرات
 * لصار الفتح بطيئًا والشيفرة مبعثرة. هنا **ستّ قراءات متوازية**
 * (Promise.all) وردٌّ واحد مضغوط فيه ما تعرضه الشاشة فقط.
 *
 * ═══ ما لا يخرج من هنا أبدًا ═══
 * ⚠️ لا صوت، لا تفريغات، لا تشخيصات مزوّد، لا مفاتيح، لا عدّادات
 * تقنية (confirm_days وأخواتها تُترجم قبل الخروج). ومن جلسات
 * التسميع لا يُقرأ إلا تاريخ آخر جلسة — عمود واحد.
 *
 * ═══ خصوصية ═══
 * الرحلة لصاحبتها وحدها: الجلسة شرط، وكل قراءة بـ user.id،
 * ولا معرّفات مستخدمين آخرين ولا ترتيب.
 *
 * ⚠️ قراءةٌ خالصة — صفر كتابة، صفر أحداث جديدة، صفر مساسٍ بالحديقة.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toState = (r: Record<string, unknown>): ReviewState => ({
  box: Number(r.box ?? 0),
  distinctDays: Number(r.distinct_days ?? 0),
  lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
  dueOn: String(r.due_on),
});

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  const today = dayAtOffset(Date.now());
  const kwDay = (iso: string) => dayAtOffset(new Date(iso).getTime());

  const detailSurah = Number(req.nextUrl.searchParams.get('surah')) || null;

  const [goalsQ, reviewsQ, spotsQ, eventsQ, plantsQ, lastRecQ] = await Promise.all([
    supabase
      .from('quran_goal')
      .select('id, surah, from_ayah, to_ayah, target_date, status, source, is_active, completed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('quran_review_state')
      .select('surah, from_ayah, to_ayah, box, distinct_days, last_reviewed_on, due_on')
      .eq('user_id', user.id),
    supabase
      .from('quran_memory_spot')
      .select('surah, ayah, confirm_days, clear_days, transition_days')
      .eq('user_id', user.id),
    supabase
      .from('quran_event')
      .select('kind, surah, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('quran_garden_plant')
      .select('plant_type, drops_used, completed_at')
      .eq('user_id', user.id),
    supabase
      .from('quran_recitation_session')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const reviews: DueSegment[] = (reviewsQ.data ?? []).map((r) => ({
    surah: Number(r.surah),
    from_ayah: Number(r.from_ayah),
    to_ayah: Number(r.to_ayah),
    state: toState(r),
  }));
  const allSpots: SpotLite[] = (spotsQ.data ?? []).map((r) => ({
    surah: Number(r.surah),
    ayah: Number(r.ayah),
    confirmDays: Number(r.confirm_days ?? 0),
    clearDays: Number(r.clear_days ?? 0),
    transitionDays: Number(r.transition_days ?? 0),
  }));
  const activeSpots = allSpots.filter(
    (s) => s.confirmDays > 0 && s.clearDays < SETTLE_MIN_DISTINCT_DAYS
  );
  const events = (eventsQ.data ?? []).map((e) => ({
    kind: String(e.kind),
    surah: e.surah === null ? null : Number(e.surah),
    created_at: String(e.created_at),
  }));

  const goals = (goalsQ.data ?? []).map((g) => ({
    id: String(g.id),
    surah: Number(g.surah),
    from_ayah: Number(g.from_ayah),
    to_ayah: Number(g.to_ayah),
    targetDate: (g.target_date as string | null) ?? null,
    status: String(g.status ?? 'MEMORIZING'),
    source: String(g.source),
    isActive: Boolean(g.is_active),
    completedAt: g.completed_at ? kwDay(String(g.completed_at)) : null,
  }));
  const active = goals.find((g) => g.isActive && g.status !== 'CANCELLED') ?? null;
  const activeGoal: JourneyGoal | null = active
    ? { surah: active.surah, from_ayah: active.from_ayah, to_ayah: active.to_ayah, status: active.status }
    : null;

  const name = (n: number) => getSurah(n)?.name_ar ?? `سورة ${n}`;

  /* ── وضع التفاصيل: سورة واحدة بخريطتها ── */
  if (detailSurah) {
    const meta = getSurah(detailSurah);
    if (!meta) return NextResponse.json({ error: 'BAD_SURAH' }, { status: 400 });
    const states = ayahStates(detailSurah, meta.ayah_count, reviews, activeSpots, activeGoal, today);
    const surahReviews = reviews.filter((r) => r.surah === detailSurah);
    const lastReview = surahReviews
      .map((r) => r.state.lastReviewedOn)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;
    const dueCount = surahReviews.filter((r) => daysBetween(r.state.dueOn, today) >= 0).length;
    const reachedUpTo = (() => {
      let up = 0;
      while (up < meta.ayah_count && states[up] !== 'UPCOMING' && states[up] !== 'MEMORIZING') up++;
      return up;
    })();
    return NextResponse.json({
      surah: detailSurah,
      name: meta.name_ar,
      ayahCount: meta.ayah_count,
      /** كتلٌ متجانسة لا مئات العناصر — سورة البقرة بضع كتل لا ٢٨٦ نقطة */
      blocks: groupAyahStates(states),
      goal: activeGoal?.surah === detailSurah && active ? { from: active.from_ayah, to: active.to_ayah, targetDate: active.targetDate, status: active.status } : null,
      reachedUpTo,
      settledCount: states.filter((s) => s === 'SETTLED').length,
      dueCount,
      spots: activeSpots.filter((s) => s.surah === detailSurah).map(spotDisplay),
      lastReviewedOn: lastReview,
      today,
    });
  }

  /* ── الصفحة الرئيسية ── */
  const goalView = active
    ? (() => {
        const meta = getSurah(active.surah);
        const states = ayahStates(active.surah, meta?.ayah_count ?? active.to_ayah, reviews, activeSpots, activeGoal, today);
        const seg = goalSegments(activeGoal as JourneyGoal, states);
        return {
          surah: active.surah,
          name: name(active.surah),
          from: active.from_ayah,
          to: active.to_ayah,
          targetDate: active.targetDate,
          status: active.status,
          source: active.source,
          reached: seg.reached,
          settled: seg.settled,
          total: seg.total,
        };
      })()
    : null;

  const buckets = surahBuckets(reviews, activeGoal).map((b) => ({ ...b, name: name(b.surah) }));
  const dueToday = reviews.filter((r) => daysBetween(r.state.dueOn, today) >= 0).length;

  const plants = plantsQ.data ?? [];
  const currentPlant = plants.find((p) => !p.completed_at) ?? null;

  const eventDays = events.map((e) => kwDay(e.created_at));

  return NextResponse.json({
    today,
    goal: goalView,
    dueToday,
    spots: activeSpots.map((s) => ({ surah: s.surah, name: name(s.surah), ...spotDisplay(s) })),
    surahs: buckets,
    timeline: timelineFromEvents(events, kwDay).map((t) => ({ ...t, name: t.surah ? name(t.surah) : null })),
    /** «منذ بدء تسجيل رحلتك» — أول حدث موثوق، لا تاريخ مخترع */
    journeySince: events.length ? kwDay(events[events.length - 1].created_at) : null,
    pastGoals: goals
      .filter((g) => !g.isActive || g.status === 'COMPLETED' || g.status === 'CANCELLED')
      .filter((g) => g.id !== active?.id)
      .slice(0, 10)
      .map((g) => ({
        surah: g.surah,
        name: name(g.surah),
        from: g.from_ayah,
        to: g.to_ayah,
        status: g.status,
        source: g.source,
        completedAt: g.completedAt,
      })),
    garden: {
      completedPlants: plants.filter((p) => p.completed_at).length,
      current: currentPlant ? { type: String(currentPlant.plant_type), dropsUsed: Number(currentPlant.drops_used) } : null,
    },
    stats: {
      goalsCompleted: goals.filter((g) => g.status === 'COMPLETED').length,
      surahsStarted: new Set(reviews.map((r) => r.surah)).size,
      reviewsThisWeek: events.filter(
        (e) => ['review_completed', 'reviewed_on_time'].includes(e.kind) && daysBetween(kwDay(e.created_at), today) < 7 && daysBetween(kwDay(e.created_at), today) >= 0
      ).length,
      activeDaysThisMonth: activeDays(eventDays, today, 30),
    },
    lastRecitedOn: lastRecQ.data?.created_at ? kwDay(String(lastRecQ.data.created_at)) : null,
  });
}
