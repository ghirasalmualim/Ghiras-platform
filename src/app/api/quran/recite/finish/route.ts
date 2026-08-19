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
};

/** حدٌّ يمنع جسمًا ضخمًا: صفحة مصحف ~٢٠٠ كلمة، فألف هامش واسع. */
const MAX_TOKENS = 1000;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

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

  return NextResponse.json(
    {
      usable: result.usable,
      unusableReason: result.unusableReason ?? null,
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
            .filter((e) => e.kind === 'UNCERTAIN')
            .map((e) => ({
              ayah: e.expected[0]?.ayah ?? null,
              words: e.expected.map((w) => w.uthmani),
            }))
        : [],
      mistakes: result.usable
        ? result.entries
            .filter((e) => e.kind !== 'MATCH' && e.kind !== 'UNCERTAIN' && e.kind !== 'LONG_PAUSE')
            .map((e) => ({
              kind: e.kind,
              surah: e.expected[0]?.surah ?? surahNo,
              ayah: e.expected[0]?.ayah ?? null,
              words: e.expected.map((w) => w.uthmani),
            }))
        : [],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
