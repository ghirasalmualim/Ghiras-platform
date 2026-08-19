import { NextRequest, NextResponse } from 'next/server';
import { getAyahs, getSurah } from '@/features/quran/data/corpus';
import {
  alignRecitation,
  buildExpected,
  type HeardToken,
} from '@/features/quran/engine/alignment';
import { normalizeForComparison } from '@/features/quran/engine/normalize.mjs';
import { AzureSpeechProvider, type TokenSource } from '@/features/quran/speech/azure';
import { isLabOwner } from '@/features/quran/speech/lab-guard';

/**
 * مسار التسميع التجريبي — نموذج أوّلي لا ميزة.
 *
 * ═══ التدفق ═══
 * صوت ← المزوّد ← مهايئ ← كلمات غراس ← محرّك المحاذاة ← نتيجة.
 * والصوت **لا يُحفظ في أي خطوة**: يصل في الذاكرة، يُرسل، تُستخرج
 * النتيجة، ثم يُفلَت. لا قرص ولا قاعدة بيانات ولا سجل ولا تخزين.
 *
 * ═══ الخصوصية ═══
 * ⚠️ لا يُرسل مع الصوت اسمُ طالبة ولا معرّفها ولا أي شيء يدلّ عليها.
 * ما يخرج إلى المزوّد: بايتات صوت + النص المتوقَّع من مصحفنا. وكفى.
 *
 * ⚠️ ولا يُطبع نصُّ التفريغ ولا مفتاحُ المزوّد في أي سجل. رسائل
 * الأخطاء رموزٌ لا محتوى.
 *
 * ═══ الحكم ═══
 * ⚠️ الحكم من محرّك غراس وحده. تصنيفات المزوّد ودرجات النطق تُنقل
 * في `diagnostics` للقياس، ولا تدخل في تقرير خطأ ولا في إتقان.
 *
 * ⚠️ مقفل بشرطين: `QURAN_LAB=1` **و** أن تكون صاحبة الطلب أدمِن.
 * وهذا المسار بالذات هو الذي يصرف المال: كل نداء يرسل صوتًا إلى مزوّد
 * بفاتورة. فتركه مفتوحًا لمن يعرف الرابط يعني رصيدًا يُستهلك بلا حساب.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** أقصى صوت يقبله تقييم Azure المكتوب: ثلاثون ثانية. */
const MAX_SECONDS = 30;
const MAX_BYTES = 16000 * 2 * MAX_SECONDS + 1024;

export async function POST(req: NextRequest) {
  // ٤٠٤ لا ٤٠٣: من لا يملك الحق لا يعرف أن هنا مسارًا أصلًا
  if (!(await isLabOwner()))
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const resource = process.env.AZURE_SPEECH_RESOURCE;
  const key = process.env.AZURE_SPEECH_KEY;
  if (!resource || !key)
    return NextResponse.json({ error: 'PROVIDER_NOT_CONFIGURED' }, { status: 503 });

  const q = req.nextUrl.searchParams;
  const surahNo = Number(q.get('surah'));
  const from = Number(q.get('from'));
  const to = Number(q.get('to'));
  const source: TokenSource = q.get('source') === 'assessed' ? 'assessed' : 'lexical';
  /**
   * صيغة النص المرجعي المرسَل إلى المزوّد.
   *
   * ⚠️ هذا **تحويل مُدخل لمزوّد** لا قاعدة تطبيع جديدة. `text_uthmani`
   * لا يُمسّ، و«المجرَّد» يمرّ بالمطبِّع الموثَّق نفسه المستعمل في
   * المقارنة — لا بقاعدة اخترعناها هنا.
   *
   * ولماذا الافتراضي مجرَّد؟ لأن نماذج العربية مدرَّبة على نصّ بلا
   * تشكيل، وبحث ٢٠٢٦ وجد أن التدريب بلا تشكيل يعطي نتائج أفضل. لكن
   * أثر ذلك على تقييم Azure **غير مقيس**، ولهذا الصيغتان متاحتان
   * للمقارنة في المختبر.
   */
  const refForm = q.get('ref') === 'uthmani' ? 'uthmani' : 'plain';

  if (!Number.isInteger(surahNo) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const surah = getSurah(surahNo);
  if (!surah || to > surah.ayah_count)
    return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const audio = await req.arrayBuffer();
  if (!audio.byteLength) return NextResponse.json({ error: 'EMPTY_AUDIO' }, { status: 400 });
  if (audio.byteLength > MAX_BYTES)
    return NextResponse.json({ error: 'AUDIO_TOO_LONG', maxSeconds: MAX_SECONDS }, { status: 413 });

  const ayahs = getAyahs(surahNo, from, to);
  const expected = buildExpected(ayahs);
  if (!expected.length) return NextResponse.json({ error: 'BAD_RANGE' }, { status: 400 });

  const uthmani = expected.map((w) => w.uthmani).join(' ');
  const referenceText = refForm === 'uthmani' ? uthmani : (normalizeForComparison(uthmani) as string);

  const provider = new AzureSpeechProvider(resource, key, source);
  const heard = await provider.transcribe({
    audio,
    referenceText,
    languageTag: q.get('lang') || 'ar-SA',
  });

  // الحكم لمحرّك غراس — لا لتصنيفات المزوّد
  const alignment =
    heard.status === 'OK'
      ? alignRecitation(expected, heard.tokens)
      : null;

  return NextResponse.json(
    {
      status: heard.status,
      reference: { surah: surahNo, from, to, form: refForm, text: referenceText },
      tokens: heard.tokens.map(compactToken),
      diagnostics: heard.diagnostics,
      alignment: alignment
        ? {
            usable: alignment.usable,
            unusableReason: alignment.unusableReason ?? null,
            summary: alignment.summary,
            weakSpots: alignment.weakSpots,
            entries: alignment.entries.map((e) => ({
              kind: e.kind,
              reason: e.reason ?? null,
              expected: e.expected.map((w) => w.uthmani),
              heard: e.heard.map((h) => h.text),
              similarity: e.similarity ?? null,
              confidence: e.confidence ?? null,
              pauseSec: e.pauseSec ?? null,
            })),
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  // الصوت لم يُكتب في أي مكان، ويُجمع مع القمامة بانتهاء الطلب.
}

function compactToken(t: HeardToken) {
  return {
    text: t.text,
    norm: t.norm,
    startSec: t.startSec ?? null,
    endSec: t.endSec ?? null,
    confidence: t.confidence ?? null,
  };
}
