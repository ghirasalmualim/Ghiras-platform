import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import { dayAtOffset } from '@/features/quran/engine/plan';
import {
  INELIGIBLE_MESSAGE,
  pickStabilityTest,
  type StabilityInputs,
} from '@/features/quran/engine/stability';
import type { DueSegment } from '@/features/quran/engine/planner';
import type { ReviewState } from '@/features/quran/engine/review';
import type { SpotLite } from '@/features/quran/engine/plan';

/**
 * اقتراح اختبار الثبات — «غراس يختار من محفوظك».
 *
 * قراءةٌ خالصة: يجمع المحفوظ والمواضع واختبارات الثبات السابقة
 * ويمرّرها للمحرّك النقي، ويردّ المقترح — أو سبب عدم الأهلية
 * برسالةٍ تبني. `reasonCode` في الردّ للتشخيص والاختبار الآلي؛
 * الواجهة لا تعرضه للطفل.
 *
 * ⚠️ نطاق المنهج: هدفٌ نشط مصدره درسٌ يقيّد المرشحين بمداه —
 * القرآن العام مستقلٌّ بلا خلط. والتنفيذ نفسه (start→finish) يمرّ
 * بمحرّك التسميع القائم، والخادم يعيد التحقق عند الإنهاء.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toState = (r: Record<string, unknown>): ReviewState => ({
  box: Number(r.box ?? 0),
  distinctDays: Number(r.distinct_days ?? 0),
  lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
  dueOn: String(r.due_on),
});

export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  const today = dayAtOffset(Date.now());

  const [reviewsQ, spotsQ, testsQ, goalQ] = await Promise.all([
    supabase
      .from('quran_review_state')
      .select('surah, from_ayah, to_ayah, box, distinct_days, last_reviewed_on, due_on')
      .eq('user_id', user.id),
    supabase
      .from('quran_memory_spot')
      .select('surah, ayah, confirm_days, clear_days, transition_days')
      .eq('user_id', user.id),
    supabase
      .from('quran_recitation_session')
      .select('surah, from_ayah, to_ayah, created_at')
      .eq('user_id', user.id)
      .eq('session_type', 'stability')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('quran_goal')
      .select('surah, from_ayah, to_ayah, source')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ]);

  const reviews: DueSegment[] = (reviewsQ.data ?? []).map((r) => ({
    surah: Number(r.surah),
    from_ayah: Number(r.from_ayah),
    to_ayah: Number(r.to_ayah),
    state: toState(r),
  }));
  const spots: SpotLite[] = (spotsQ.data ?? []).map((r) => ({
    surah: Number(r.surah),
    ayah: Number(r.ayah),
    confirmDays: Number(r.confirm_days ?? 0),
    clearDays: Number(r.clear_days ?? 0),
    transitionDays: Number(r.transition_days ?? 0),
  }));
  const pastTests = (testsQ.data ?? []).map((t) => ({
    surah: Number(t.surah),
    from_ayah: Number(t.from_ayah),
    to_ayah: Number(t.to_ayah),
    day: dayAtOffset(new Date(String(t.created_at)).getTime()),
  }));

  const g = goalQ.data;
  const scope =
    g && String(g.source) === 'curriculum'
      ? { surah: Number(g.surah), from_ayah: Number(g.from_ayah), to_ayah: Number(g.to_ayah) }
      : null;

  /** كلمات الآية من المصحف — عدٌّ بسيط كمعايرة المرحلة ٧ نفسها. */
  const cache = new Map<string, number>();
  const wordsOf = (surah: number, ayah: number) => {
    const k = `${surah}:${ayah}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getAyahs(surah, ayah, ayah)[0]?.text_uthmani.trim().split(/\s+/).length ?? 0;
      cache.set(k, v);
    }
    return v;
  };

  const decision = pickStabilityTest({
    reviews,
    spots,
    pastTests,
    scope,
    wordsOf,
    today,
  } satisfies StabilityInputs);

  if (!decision.eligible)
    return NextResponse.json({
      eligible: false,
      reason: decision.reason,
      message: INELIGIBLE_MESSAGE[decision.reason],
    });

  const c = decision.candidate;
  return NextResponse.json({
    eligible: true,
    candidate: {
      surah: c.surah,
      name: getSurah(c.surah)?.name_ar ?? `سورة ${c.surah}`,
      from_ayah: c.from_ayah,
      to_ayah: c.to_ayah,
      startFrom: c.startFrom,
      kind: c.kind,
      /** داخلي — للتشخيص والاختبار، لا يُرسم في الواجهة. */
      reasonCode: c.reasonCode,
    },
    today,
  });
}
