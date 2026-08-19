import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import { buildExpected, type HeardToken } from '@/features/quran/engine/alignment';
import { stripProviderArtifacts } from '@/features/quran/engine/artifacts';
import { normalizeForComparison } from '@/features/quran/engine/normalize.mjs';
import { AzureSpeechProvider } from '@/features/quran/speech/azure';
import { checkRate, inspectWav, MAX_CLIP_BYTES } from '@/features/quran/speech/limits';

/**
 * مقطع صوتي واحد من جلسة تسميع.
 *
 * ═══ ماذا يستقبل ═══
 * ⚠️ **بايتات صوت + سورة/من/إلى وحدها.** لا نصّ من المتصفح إطلاقًا.
 * ولو قبلنا نصًّا لصار هذا المسار خدمةَ تعرّفٍ عامة مجانية على حسابنا:
 * يرسل أيٌّ كان أي صوت وأي نصّ ونحن ندفع.
 *
 * ═══ ماذا يُرجع ═══
 * الكلمات المسموعة بلغة غراس، بعد تنظيفها من عوارض المزوّد المعروفة.
 * ولا حكم هنا: الحكم في `finish` على الجلسة كاملة.
 *
 * ═══ الصوت ═══
 * ⚠️ يصل في الذاكرة، يُرسل، تُستخرج الكلمات، ثم يُفلَت. لا يُكتب في
 * قرص ولا قاعدة بيانات ولا سجل، ولا يُرفع إلى تخزين.
 *
 * ⚠️ ولا يُرسل مع الصوت اسمُ الطالبة ولا معرّفها. المزوّد يرى صوتًا
 * ونصًّا قرآنيًا، ولا يرى من نحن ولا من هي.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * سعة نافذة النص المرجعي المرسَلة إلى المزوّد، بالكلمات.
 *
 * لا نرسل المقطع كله: النافذة حول موضع الطالبة تلميحٌ أدقّ. ولا نرسل
 * كلمات قليلة: فلو تجاوزت الموضعَ خرجت من النافذة وضاع التلميح.
 */
const REF_WINDOW = 60;
const REF_BACK = 10;

export async function POST(req: NextRequest) {
  // ── ١) لا تسميع لمجهول ─────────────────────────────────────
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  // ── ٢) حدّ المعدّل ─────────────────────────────────────────
  const rate = checkRate(user.id);
  if (!rate.ok)
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
    );

  // ── ٣) المزوّد مضبوط؟ ──────────────────────────────────────
  const region = process.env.AZURE_SPEECH_REGION;
  const resourceName = process.env.AZURE_SPEECH_RESOURCE;
  const key = process.env.AZURE_SPEECH_KEY;
  if ((!region && !resourceName) || !key)
    return NextResponse.json({ error: 'PROVIDER_NOT_CONFIGURED' }, { status: 503 });

  // ── ٤) المدى من مصحفنا ─────────────────────────────────────
  const q = req.nextUrl.searchParams;
  const surahNo = Number(q.get('surah'));
  const from = Number(q.get('from'));
  const to = Number(q.get('to'));
  if (!Number.isInteger(surahNo) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const surah = getSurah(surahNo);
  if (!surah || to > surah.ayah_count)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const expected = buildExpected(getAyahs(surahNo, from, to));
  if (!expected.length) return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  // ── ٥) الصوت: نفحص بايتاته لا ادّعاء ترويسته ───────────────
  const audio = await req.arrayBuffer();
  if (audio.byteLength > MAX_CLIP_BYTES)
    return NextResponse.json({ error: 'AUDIO_TOO_LONG' }, { status: 413 });

  const wav = inspectWav(audio);
  if (!wav.ok) return NextResponse.json({ error: wav.reason }, { status: 400 });

  // ── ٦) النص المتوقَّع — من مصحفنا، نافذةً حول موضعها ────────
  const at = Math.max(0, Math.min(Number(q.get('at')) || 0, expected.length - 1));
  const start = Math.max(0, at - REF_BACK);
  const window = expected.slice(start, start + REF_WINDOW);
  const uthmani = window.map((w) => w.uthmani).join(' ');
  const referenceText = normalizeForComparison(uthmani) as string;

  // ── ٧) المزوّد ─────────────────────────────────────────────
  const provider = new AzureSpeechProvider({ region, resourceName }, key, 'lexical');
  const heard = await provider.transcribe({
    audio,
    referenceText,
    languageTag: process.env.AZURE_SPEECH_LANG || 'ar-SA',
  });

  // ── ٨) تنظيف عوارض المزوّد قبل أي حكم ──────────────────────
  const cleaned =
    heard.status === 'OK'
      ? stripProviderArtifacts(window, heard.tokens)
      : { tokens: [] as HeardToken[], removed: [] };

  return NextResponse.json(
    {
      status: heard.status,
      tokens: cleaned.tokens,
      artifactsRemoved: cleaned.removed.length,
      /** تشخيصٌ آمن — لا نصّ خام ولا درجات نطق تصل إلى الطالبة. */
      meta: {
        seconds: Math.round(wav.seconds * 10) / 10,
        confidence: heard.diagnostics.utteranceConfidence ?? null,
        snr: heard.diagnostics.snr ?? null,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  // الصوت لم يُكتب في أي مكان، ويُجمع مع القمامة بانتهاء الطلب.
}
