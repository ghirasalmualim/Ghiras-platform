import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import {
  alignRecitation,
  buildExpected,
  type HeardToken,
} from '@/features/quran/engine/alignment';
import { normalizeForComparison } from '@/features/quran/engine/normalize.mjs';
import { eventsFor, gradeSession } from '@/features/quran/engine/grading';
import { MAX_CHUNKS_PER_SESSION } from '@/features/quran/speech/limits';
import { grantDrops } from '@/features/quran/garden/grant';
import { applyTasmeeToReview } from '@/features/quran/review/apply-tasmee';
import { awardsForRecitation } from '@/features/quran/garden/growth';
import { checkPolicySafe, RATE_MESSAGES } from '@/features/quran/engine/rate-policies';

/**
 * نهاية جلسة التسميع — هنا يقع الحكم.
 *
 * ═══ لماذا على الخادم ═══
 * الحكم على حفظ طفل يجب أن يخرج من مكانٍ واحد معروف. والمحرّك حتمي،
 * فالنتيجة واحدة أينما جرى — لكن إجراءه هنا يجعل ما يُحفظ في قاعدة
 * البيانات مشتقًّا مما حكمنا به نحن لا مما أرسله المتصفح.
 *
 * ═══ ما يصل ═══
 * الكلمات المسموعة التي أخرجها مسارُ المقاطع، ومدى المقطع، والوضع.
 * ⚠️ ولا نصّ متوقَّع من المتصفح: يُبنى هنا من المصحف كما في كل موضع.
 *
 * ═══ ما يُحفظ ═══
 * ⚠️ نتيجةٌ فقط. لا صوت ولا تفريغ ولا كلمة مما نطقته الطالبة — ولا
 * حتى الكلمات المسموعة. تُستعمل للحكم ثم تُفلَت.
 *
 * ⚠️ والمواضع الضعيفة تُرسل للمراجعة من **الأخطاء المؤكَّدة وحدها**.
 * فلو أُرسل غير المؤكَّد لصارت الطالبة تراجع مواضع لم تخطئ فيها لأن
 * الميكروفون كان بعيدًا — وهذا ظلمٌ يفسد المراجعة ويكسر ثقتها.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  surah?: number;
  from?: number;
  to?: number;
  mode?: string;
  helpUsed?: boolean;
  chunks?: number;
  seconds?: number;
  tokens?: { text?: string; confidence?: number }[];
  /** حدود المقاطع التي قُطعت عند حدٍّ تقني لا عند سكتة. */
  artificialCuts?: number;
  /**
   * مفتاح idempotency — يولّده المتصفح لكل جلسة ويعيده نفسه إن أعاد
   * الإرسال. فإعادة `finish` لنفس الجلسة لا تحفظ سجلًّا ثانيًا ولا
   * تمنح قطرةً ثانية ولا تحرّك جدول المراجعة مرتين.
   */
  clientKey?: string;
  /** «اختبار ثبات» تدّعيه الواجهة — والخادم يتحقق قبل أن يصدّق. */
  sessionType?: string;
};

/** حدٌّ يمنع جسمًا ضخمًا: صفحة مصحف ~٢٠٠ كلمة، فألف هامش واسع. */
const MAX_TOKENS = 1000;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });
  // حدّ الاستدعاء — سياسة JUDGE المركزية (fail-open عند عطل العدّاد نفسه)
  {
    const rl = checkPolicySafe('JUDGE', user.id);
    if (!rl.ok)
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: RATE_MESSAGES.shortWait, retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
  }


  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'BAD_BODY' }, { status: 400 });
  }

  const surahNo = Number(body.surah);
  const from = Number(body.from);
  const to = Number(body.to);
  const mode = body.mode === 'test' ? 'test' : 'train';

  if (!Number.isInteger(surahNo) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const surah = getSurah(surahNo);
  if (!surah || to > surah.ayah_count)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const raw = Array.isArray(body.tokens) ? body.tokens : [];
  if (raw.length > MAX_TOKENS) return NextResponse.json({ error: 'TOO_MANY_TOKENS' }, { status: 413 });

  const chunks = Math.max(1, Math.min(Number(body.chunks) || 1, MAX_CHUNKS_PER_SESSION));

  /**
   * ── الجلسة المكرَّرة تُرَدّ قبل أي حكم ──────────────────────
   *
   * ⚠️ حارسان على نفس الباب: هذا الفحص هنا، وفهرسٌ فريد على
   * `(user_id, client_key)` في القاعدة نفسها — فلو تسابق طلبان
   * متزامنان ومرّا من هذا الفحص معًا، رُفض ثانيهما عند الإدراج.
   *
   * والردّ صريح `DUPLICATE_SESSION` لا نتيجة ملفَّقة: النتيجة
   * الحقيقية وصلت مع الطلب الأول، وتلفيقُ ثانيةٍ من السجل يعرض
   * حكمًا منقوصًا كأنه كامل. والمتصفح الحالي لا يعيد الإرسال أصلًا
   * — هذا حزامُ أمانٍ لمن يعيده يومًا.
   */
  const clientKey =
    typeof body.clientKey === 'string' && /^[\w-]{8,64}$/.test(body.clientKey)
      ? body.clientKey
      : null;
  if (clientKey) {
    const { data: dup } = await supabase
      .from('quran_recitation_session')
      .select('id')
      .eq('user_id', user.id)
      .eq('client_key', clientKey)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: 'DUPLICATE_SESSION' }, { status: 409 });
  }

  // ── النص المتوقَّع من مصحفنا ────────────────────────────────
  const expected = buildExpected(getAyahs(surahNo, from, to));
  if (!expected.length) return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const tokens: HeardToken[] = [];
  for (const t of raw) {
    const text = typeof t?.text === 'string' ? t.text.slice(0, 60) : '';
    if (!text.trim()) continue;
    const tok: HeardToken = { text, norm: normalizeForComparison(text) as string };
    if (typeof t.confidence === 'number' && t.confidence >= 0 && t.confidence <= 1)
      tok.confidence = t.confidence;
    tokens.push(tok);
  }

  /**
   * ── نوع الجلسة: اختبار ثبات لا يُصدَّق على كلمة الواجهة ──────
   *
   * ⚠️ «الثبات» يعني أن غراس اختار مقطعًا **محفوظًا** — فلو أرسل
   * المتصفح النوع على نطاقٍ لم تبلغه الطالبة (كل آيةٍ فيه لم
   * تُراجَع بنجاح يومًا) هُبط بهدوء إلى تسميعٍ عادي: لا خطأ يُرمى
   * — التسميع الحرّ مشروع دائمًا — لكن السجل لا يكذب عن نوعه.
   */
  let sessionType: 'recitation' | 'stability' = 'recitation';
  if (body.sessionType === 'stability') {
    const { data: covRows } = await supabase
      .from('quran_review_state')
      .select('from_ayah, to_ayah, distinct_days')
      .eq('user_id', user.id)
      .eq('surah', surahNo);
    const covered = new Set<number>();
    for (const r of covRows ?? [])
      if (Number(r.distinct_days) >= 1)
        for (let a = Number(r.from_ayah); a <= Number(r.to_ayah); a++) covered.add(a);
    let all = true;
    for (let a = from; a <= to; a++) if (!covered.has(a)) { all = false; break; }
    if (all) sessionType = 'stability';
  }

  // ── الحكم ─────────────────────────────────────────────────
  const result = alignRecitation(expected, tokens);
  const helpUsed = body.helpUsed === true;
  const verdict = gradeSession(result);

  /**
   * ⚠️ التلميح ليس خطأً، لكنه ليس تسميعًا مستقلًا أيضًا. فلا نخفض
   * المستوى بسببه، ونسجّله ليُعرف أن الجلسة لم تكن بلا مساعدة.
   */
  const weakSpots = result.usable ? result.weakSpots : [];

  // ── الحفظ — نتيجة فقط ─────────────────────────────────────
  try {
    await supabase.from('quran_recitation_session').insert({
      user_id: user.id,
      surah: surahNo,
      from_ayah: from,
      to_ayah: to,
      mode,
      level: verdict.level.toLowerCase(),
      internal_score: verdict.internalScore,
      confirmed_errors: result.summary.confirmedErrors,
      uncertain_count: result.summary.uncertain,
      coverage: result.summary.coverage,
      help_used: helpUsed,
      chunk_count: chunks,
      audio_seconds: typeof body.seconds === 'number' ? Math.round(body.seconds * 10) / 10 : null,
      weak_spots: weakSpots,
      client_key: clientKey,
      session_type: sessionType,
    });

    for (const kind of eventsFor(result, verdict, helpUsed)) {
      await supabase.from('quran_event').insert({
        user_id: user.id,
        kind,
        surah: surahNo,
        from_ayah: from,
        to_ayah: to,
      });
    }
  } catch {
    /* السجل لا يستحق تعطيل نتيجةٍ استحقّتها الطالبة */
  }

  /**
   * ── الحديقة ────────────────────────────────────────────────
   *
   * ⚠️ **هنا وحده يُخلق التقدّم**، وبعد أن حكم الخادمُ بنفسه. والمتصفح
   * لم يخبرنا بشيء عن نجاحها: هو أرسل صوتًا، ونحن حكمنا.
   *
   * ⚠️ و«تحسّن موضع» يُقاس بالتاريخ لا بالدعوى: نقارن مواضعها الضعيفة
   * في آخر جلسةٍ لهذا المقطع بما بقي ضعيفًا الآن. فمن ثبّتت موضعًا
   * تعثّرت فيه أمس تُكافأ، ومن لم تسمّعه قبلُ لا تُكافأ على تحسّنٍ لم
   * يقع — لأن أول جلسةٍ لا سابقَ لها تُقارَن به.
   *
   * ⚠️ ولا شيء هنا يُعطَّل نتيجةَ التسميع. `grantDrops` لا ترمي أبدًا.
   */
  let improvedWeakSpots = 0;
  try {
    const { data: previous } = await supabase
      .from('quran_recitation_session')
      .select('weak_spots')
      .eq('user_id', user.id)
      .eq('surah', surahNo)
      .eq('from_ayah', from)
      .eq('to_ayah', to)
      .order('created_at', { ascending: false })
      .range(1, 1)
      .maybeSingle();

    const before = (((previous?.weak_spots ?? []) as { ayah?: number }[]) || [])
      .map((w) => w.ayah)
      .filter((a): a is number => typeof a === 'number');
    const stillWeak = weakSpots.map((w) => w.ayah);
    const seen: number[] = [];
    for (const ayah of before) {
      if (seen.indexOf(ayah) !== -1) continue;
      seen.push(ayah);
      if (stillWeak.indexOf(ayah) === -1) improvedWeakSpots++;
    }
  } catch {
    /* بلا تاريخ لا تحسّن — ولا نخترع واحدًا */
  }

  const reasons = awardsForRecitation({
    usable: result.usable,
    level: verdict.level,
    helpUsed,
    improvedWeakSpots,
  });

  const garden = await grantDrops({
    userId: user.id,
    reasons,
    segmentKey: `${surahNo}:${from}-${to}`,
    sourceKind: 'recitation',
  });

  /**
   * ── المراجعة الذكية (المرحلة ٦) ────────────────────────────
   *
   * حكمُ التسميع يغذّي جدول المراجعة **من هنا وحدها** — الخادم حكم
   * والخادم يجدول، والمتصفح لا يمرّ في الطريق. البوّابة في الوصلة
   * نفسها: `UNJUDGED` وusable:false لا يحرّكان شيئًا، وUNCERTAIN
   * لا يصير موضعَ تثبيتٍ أبدًا.
   *
   * ⚠️ ولا تُعطَّل نتيجةُ الطالبة لأجلها — الوصلة لا ترمي، وفشلُها
   * يلحق في الجلسة القادمة.
   */
  const review = await applyTasmeeToReview({
    userId: user.id,
    segment: { surah: surahNo, from_ayah: from, to_ayah: to },
    verdict,
    result,
    helpUsed,
  });

  return NextResponse.json(
    {
      usable: result.usable,
      unusableReason: result.unusableReason ?? null,
      /** ⚠️ يُقال للطالبة ما وقع فعلًا، لا ما نتمنّاه. */
      garden,
      review: { applied: review.applied },
      sessionType,
      verdict,
      summary: result.summary,
      weakSpots,
      /**
       * ما يُعرض في «نراجعها معًا» — الأخطاء المؤكَّدة وحدها.
       * ⚠️ `UNCERTAIN` لا يخرج من هنا إطلاقًا: يُعدّ ولا يُسمّى خطأً.
       */
      /**
       * مواضع لم نتأكد منها — تُعرض **مطمئِنةً لا متّهِمة**.
       *
       * ⚠️ ولولا عرضها لبقي في الشاشة فراغ: تقول «أتقنتِ ٤ من ٦»
       * ولا تقول أين الاثنتان. والرقم حينئذٍ يقلق بلا أن يفيد، وهو
       * أسوأ من الصمت ومن الاتهام معًا.
       */
      unsure: result.usable
        ? result.entries
            .map((e, i) => {
              if (e.kind !== 'UNCERTAIN') return null;

              /**
               * ⚠️ ولا يكفي نقل المتوقَّع: موضعٌ سببه كلمةٌ اخترعها
               * المزوّد لا كلمة متوقَّعة له، فكان يُعدّ ولا يُعرض —
               * فتقرأ الطالبة «فيه أربعة مواضع» ولا تعرف أين، وهذا
               * يقلق ولا يفيد. وموضعُه يُؤخذ من آخر كلمة سبقته.
               */
              let anchor = e.expected[0];
              for (let k = i - 1; k >= 0 && !anchor; k--) {
                const prev = result.entries[k].expected;
                if (prev.length) anchor = prev[prev.length - 1];
              }

              return {
                ayah: anchor?.ayah ?? null,
                words: e.expected.map((w) => w.uthmani),
                /** ما وصلنا في هذا الموضع — هو الخبر حين لا متوقَّع له. */
                heard: e.heard.map((h) => h.text),
              };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null)
        : [],
      /**
       * المواضع المؤكَّدة.
       *
       * ⚠️ ولا يكفي نقل المتوقَّع: الزيادة والتكرار **لا كلمة متوقَّعة
       * لهما** — الخبر فيهما ما سُمع لا ما كان يُنتظر. ولو اكتفينا
       * بالمتوقَّع لظهرت بطاقة فارغة مكتوب فيها «الآية —» وحدها،
       * فتقلق الطالبة بموضعٍ لا تعرف ما هو ولا أين.
       *
       * وموضعها يُؤخذ من آخر كلمة متوقَّعة سبقتها، فتُنسب إلى آية
       * بدل أن تُنسب إلى لا شيء.
       */
      mistakes: result.usable
        ? result.entries
            .map((e, i) => {
              if (e.kind === 'MATCH' || e.kind === 'UNCERTAIN' || e.kind === 'LONG_PAUSE')
                return null;

              let anchor = e.expected[0];
              for (let k = i - 1; k >= 0 && !anchor; k--) {
                const prev = result.entries[k].expected;
                if (prev.length) anchor = prev[prev.length - 1];
              }

              return {
                kind: e.kind,
                surah: anchor?.surah ?? surahNo,
                ayah: anchor?.ayah ?? null,
                words: e.expected.map((w) => w.uthmani),
                /** ما سُمع فعلًا — هو الخبر في الزيادة والتكرار. */
                heard: e.heard.map((h) => h.text),
              };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
