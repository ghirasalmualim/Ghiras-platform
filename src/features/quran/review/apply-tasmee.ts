import { createClient } from '@supabase/supabase-js';
import type { AlignmentResult } from '../engine/alignment';
import type { Verdict } from '../engine/grading';
import { applySession, toDay, type ReviewState } from '../engine/review';
import {
  applyObservation,
  observationsFromAlignment,
  qualityFromVerdict,
  type SpotState,
} from '../engine/memory';
import type { Segment } from '../types';

/**
 * الوصلة: من حكم التسميع إلى جدول المراجعة — خادميًا وحده.
 *
 * ═══ لماذا خادميًا ═══
 * المراجعة كانت تُغذّى من تدريبات المتصفح (`finishSession` في
 * `data/practice.ts`) — وذلك بابه، فالتدريب حكمُه في المتصفح أصلًا.
 * أما التسميع فقد **حكم الخادمُ عليه بنفسه** في `recite/finish`،
 * فتمريرُ حكمه عبر المتصفح ليعود إلى القاعدة يفتح بابَ تزوير كان
 * مغلقًا. الحكم هنا لا يغادر الخادم.
 *
 * ═══ لماذا مفتاح الخدمة ═══
 * `quran_memory_spot` بلا سياسة كتابةٍ أصلًا — كجداول الحديقة حرفًا.
 * و`quran_review_state` وإن قبلت كتابة المالك، تُكتب هنا بنفس
 * المفتاح ليكون المسار واحدًا.
 *
 * ═══ ما لا يفعله هذا الملف ═══
 * ⚠️ لا يرمي أبدًا — كـ`grantDrops`: نتيجة الطالبة لا تُعطَّل لأجل
 *   جدول. إن غاب المفتاح أو تعثّرت القاعدة رجعنا بصمتٍ والجدول
 *   يلحق في الجلسة القادمة.
 * ⚠️ لا يلمس الحديقة — قرار المرحلة ٦ البند ٩ صريح.
 * ⚠️ لا يكتب شيئًا عن الدروس — تقدّم الدرس لا يُخزَّن أصلًا (يُحسب
 *   عند الطلب من نطاق الهدف نفسه)، فليس هنا ما يُلوَّث.
 * ⚠️ ولا idempotency هنا — تلك مسؤولية المسار (`client_key` فريد
 *   في القاعدة): من لم يصل إلى هذه الدالة مرتين لا يحدَّث مرتين.
 */

export type ApplyOutcome = {
  applied: boolean;
  reason:
    | 'APPLIED'
    /** الحكم امتنع (`UNJUDGED`) — لا جودة تُطبَّق ولا مشاهدات. */
    | 'NOT_JUDGED'
    /** المفتاح غائب أو القاعدة تعثّرت — يُسجَّل ولا يُقال للطالبة. */
    | 'UNAVAILABLE';
  /** كم مشاهدة طُبّقت — للسجل والاختبار. */
  spots: number;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const toReviewState = (r: Record<string, unknown>): ReviewState => ({
  box: Number(r.box ?? 0),
  distinctDays: Number(r.distinct_days ?? 0),
  lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
  dueOn: String(r.due_on),
});

const toSpotState = (r: Record<string, unknown>): SpotState => ({
  confirmDays: Number(r.confirm_days ?? 0),
  clearDays: Number(r.clear_days ?? 0),
  transitionDays: Number(r.transition_days ?? 0),
  lastConfirmedOn: (r.last_confirmed_on as string | null) ?? null,
  lastClearedOn: (r.last_cleared_on as string | null) ?? null,
  lastTransitionOn: (r.last_transition_on as string | null) ?? null,
  firstSeenOn: String(r.first_seen_on ?? ''),
});

export async function applyTasmeeToReview(input: {
  userId: string;
  segment: Segment;
  verdict: Verdict;
  result: AlignmentResult;
  helpUsed: boolean;
  today?: string;
}): Promise<ApplyOutcome> {
  const { userId, segment, verdict, result, helpUsed } = input;
  const today = input.today ?? toDay(new Date());

  // البوّابة: ما لم يُحكم لا يُجدول. usable:false يعطي UNJUDGED
  // في gradeSession، وobservationsFromAlignment ترجع [] له كذلك —
  // حارسان مستقلان على نفس الباب.
  const quality = qualityFromVerdict(verdict.level, helpUsed);
  if (quality === null || !result.usable)
    return { applied: false, reason: 'NOT_JUDGED', spots: 0 };

  const sb = serviceClient();
  if (!sb) {
    console.error('[QURAN_REVIEW] SERVICE_KEY_MISSING');
    return { applied: false, reason: 'UNAVAILABLE', spots: 0 };
  }

  // ── ١) حالة المقطع — ليتنر كما هو، بلا تغيير في قواعده ──────
  try {
    const { data: prevRow } = await sb
      .from('quran_review_state')
      .select('box, distinct_days, last_reviewed_on, due_on')
      .eq('user_id', userId)
      .eq('surah', segment.surah)
      .eq('from_ayah', segment.from_ayah)
      .eq('to_ayah', segment.to_ayah)
      .maybeSingle();

    const next = applySession(prevRow ? toReviewState(prevRow) : null, quality, today);

    await sb.from('quran_review_state').upsert(
      {
        user_id: userId,
        surah: segment.surah,
        from_ayah: segment.from_ayah,
        to_ayah: segment.to_ayah,
        box: next.box,
        distinct_days: next.distinctDays,
        last_reviewed_on: next.lastReviewedOn,
        due_on: next.dueOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,surah,from_ayah,to_ayah' }
    );
  } catch (err) {
    console.error('[QURAN_REVIEW] STATE_WRITE_FAILED', String(err).slice(0, 200));
    return { applied: false, reason: 'UNAVAILABLE', spots: 0 };
  }

  // ── ٢) مواضع التثبيت — آيةً آية ─────────────────────────────
  // فشلُها لا يُبطل ما سبق: حالة المقطع تحدّثت، والمواضع تلحق.
  const observations = observationsFromAlignment(result);
  let spots = 0;
  try {
    if (observations.length) {
      const ayahs = observations.map((o) => o.ayah);
      const { data: rows } = await sb
        .from('quran_memory_spot')
        .select(
          'ayah, confirm_days, clear_days, transition_days, last_confirmed_on, last_cleared_on, last_transition_on, first_seen_on'
        )
        .eq('user_id', userId)
        .eq('surah', segment.surah)
        .in('ayah', ayahs);

      const existing: { [ayah: number]: SpotState } = Object.create(null);
      for (const r of rows ?? []) existing[Number(r.ayah)] = toSpotState(r);

      const upserts: Record<string, unknown>[] = [];
      for (const obs of observations) {
        const prev = existing[obs.ayah] ?? null;
        // القراءة النظيفة لا تُنشئ موضعًا — النظافة طبيعية لا حدث
        if (!prev && obs.kind === 'CLEAN') continue;
        const next = applyObservation(prev, obs, today);
        upserts.push({
          user_id: userId,
          surah: obs.surah,
          ayah: obs.ayah,
          confirm_days: next.confirmDays,
          clear_days: next.clearDays,
          transition_days: next.transitionDays,
          last_confirmed_on: next.lastConfirmedOn,
          last_cleared_on: next.lastClearedOn,
          last_transition_on: next.lastTransitionOn,
          first_seen_on: next.firstSeenOn,
          updated_at: new Date().toISOString(),
        });
      }
      if (upserts.length) {
        await sb.from('quran_memory_spot').upsert(upserts, { onConflict: 'user_id,surah,ayah' });
        spots = upserts.length;
      }
    }
  } catch (err) {
    console.error('[QURAN_REVIEW] SPOT_WRITE_FAILED', String(err).slice(0, 200));
  }

  return { applied: true, reason: 'APPLIED', spots };
}
