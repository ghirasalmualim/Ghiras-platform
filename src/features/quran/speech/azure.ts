/**
 * مهايئ Azure — يترجم ردّ Azure إلى لغة غراس، ولا يزيد.
 *
 * ⚠️ Azure **مزوّد تجريبي أول**، لا اعتماد نهائي. غرضه الإجابة على
 * سؤال واحد: هل يكفي على تلاوة قرآنية، خصوصًا في تقليل الاتهام
 * الكاذب؟ فإن لم يكفِ، بُدِّل بمهايئ آخر ولم يُمسّ محرّك المحاذاة.
 *
 * ═══ ثلاثة اكتشافات من وثائق Azure غيّرت التصميم ═══
 *
 * ١) **الثقة لكل كلمة صفر.** في مثال Microsoft الرسمي لتقييم النطق،
 *    حقل `Confidence` لكل كلمة قيمته `0.0` في الكلمتين معًا، بينما
 *    ثقة الجملة `0.985`. فالثقة الحقيقية على مستوى الجملة لا الكلمة.
 *    ولهذا نعتمد ثقة الجملة ونوزّعها، ولا نصدّق صفرًا فنُسقط كل شيء
 *    إلى «لم أتأكد».
 *
 * ٢) **كلمة `Omission` لم تُسمع أصلًا.** Azure يُدرج في `Words[]`
 *    الكلماتِ المتوقَّعة التي لم تُنطق، ويسمّيها `Omission`. ولو
 *    نقلناها كما هي إلى محرّكنا لأطعمناه كلماتٍ **لم يقلها الطفل** —
 *    فيراها موجودة ويظن الحفظ سليمًا. تُستبعد استبعادًا صريحًا.
 *
 * ٣) **`Words[]` نصُّها نصُّ المرجع لا نصُّ الطفل.** في الوضع المكتوب
 *    (scripted) يحاذي Azure كلامَه بالنص المرجعي، فالكلمة المستبدَلة
 *    ترجع بلفظها **المتوقَّع** موسومةً `Mispronunciation` — أي أن ما
 *    قالته الطالبة فعلًا لا يظهر. ولو بنينا الكلمات من هنا وحدها
 *    لَما اكتشف محرّكنا استبدالًا أبدًا.
 *
 *    ولهذا المصدر الافتراضي هو `Lexical` — النص الحرّ كما سُمع فعلًا.
 *    و`Words[]` متاح للمقارنة في المختبر لا للحكم.
 *
 * ⚠️ ولا تُستعمل `AccuracyScore` ولا `PronScore` ولا `FluencyScore`
 * ولا `ProsodyScore` حكمًا على الحفظ. كلها أحكام على **كيف** نُطقت
 * الكلمة، وهذا تجويدٌ وأداءٌ مؤجَّل إلى مرحلة مستقلة بنموذج متخصص.
 * تُنقل في التشخيص للقياس فقط.
 */

import type { HeardToken } from '../engine/alignment';
import { normalizeForComparison, splitWords } from '../engine/normalize.mjs';
import type {
  ProviderDiagnostics,
  ProviderStatus,
  RecitationRequest,
  RecitationResponse,
  SpeechProvider,
} from './types';

/** وحدة التوقيت عند Azure: ١٠٠ نانوثانية. */
const TICKS_PER_SECOND = 10_000_000;

/** شكل ردّ Azure كما توثّقه Microsoft — لا يخرج هذا النوع من هذا الملف. */
type AzureWord = {
  Word: string;
  Offset?: number;
  Duration?: number;
  Confidence?: number;
  AccuracyScore?: number;
  ErrorType?: string;
};

type AzureNBest = {
  Confidence?: number;
  Lexical?: string;
  Display?: string;
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
  Words?: AzureWord[];
};

export type AzureResponse = {
  RecognitionStatus?: string;
  DisplayText?: string;
  Offset?: number;
  Duration?: number;
  SNR?: number;
  NBest?: AzureNBest[];
};

/**
 * من أين تُبنى الكلمات؟
 *
 * `lexical` — النص الحرّ: ما سمعه المزوّد فعلًا. الافتراضي، وهو
 *   الوحيد الذي يُظهر الاستبدال.
 * `assessed` — كلمات التقييم: فيها توقيت، لكن نصّها نصّ المرجع.
 *   للمقارنة في المختبر، ولقياس أثر التوقيت.
 */
export type TokenSource = 'lexical' | 'assessed';

/** ترجمة حال Azure إلى حالنا. */
function mapStatus(raw: string | undefined): ProviderStatus {
  switch (raw) {
    case 'Success':
      return 'OK';
    case 'NoMatch':
      return 'NO_SPEECH';
    case 'InitialSilenceTimeout':
      return 'SILENCE';
    case 'BabbleTimeout':
      return 'NOISE';
    default:
      return 'PROVIDER_ERROR';
  }
}

/**
 * تحويل ردّ Azure إلى كلمات غراس.
 *
 * دالة نقية بلا شبكة: تُختبر بردود محفوظة، فنفحص كل قواعد الترجمة
 * بلا مفتاح ولا فاتورة ولا إنترنت.
 */
export function adaptAzureResponse(
  json: AzureResponse,
  opts: { source?: TokenSource; audioBytes?: number; audioSec?: number; latencyMs?: number } = {}
): RecitationResponse {
  const source: TokenSource = opts.source ?? 'lexical';
  const status = mapStatus(json.RecognitionStatus);
  const best = json.NBest && json.NBest.length ? json.NBest[0] : undefined;

  const diagnostics: ProviderDiagnostics = {
    provider: 'azure',
    latencyMs: opts.latencyMs ?? 0,
    audioBytes: opts.audioBytes ?? 0,
    audioSec: opts.audioSec ?? 0,
  };
  if (json.RecognitionStatus) diagnostics.rawStatus = json.RecognitionStatus;
  if (json.SNR !== undefined) diagnostics.snr = json.SNR;
  if (best?.Confidence !== undefined) diagnostics.utteranceConfidence = best.Confidence;
  if (best?.Lexical !== undefined) diagnostics.lexical = best.Lexical;

  if (best?.Words?.length) {
    diagnostics.providerErrorTypes = best.Words.map((w) => ({
      word: w.Word,
      errorType: w.ErrorType ?? 'None',
    }));
  }
  // ⚠️ درجات نطق — تشخيص وقياس فقط، ولا تمسّ الحكم على الحفظ
  const scores: { [key: string]: number } = {};
  if (best?.AccuracyScore !== undefined) scores.accuracy = best.AccuracyScore;
  if (best?.FluencyScore !== undefined) scores.fluency = best.FluencyScore;
  if (best?.CompletenessScore !== undefined) scores.completeness = best.CompletenessScore;
  if (best?.PronScore !== undefined) scores.pronunciation = best.PronScore;
  if (Object.keys(scores).length) diagnostics.pronunciationScores = scores;

  if (status !== 'OK' || !best) return { status, tokens: [], diagnostics };

  const tokens =
    source === 'assessed' ? fromAssessedWords(best) : fromLexical(best);

  return { status, tokens, diagnostics };
}

/**
 * كلمات من النص الحرّ.
 *
 * بلا توقيت — Azure لا يعطي توقيتًا إلا في كلمات التقييم، وتلك
 * محاذاة بالمرجع. وغياب التوقيت لا يُعطّل شيئًا: المحرّك يعمل كاملًا
 * بدونه، ويمتنع عن الوقفات الطويلة وحدها. ولا نخترع توقيتًا لم نقسه.
 */
function fromLexical(best: AzureNBest): HeardToken[] {
  const text = best.Lexical ?? best.Display ?? '';
  const words = splitWords(text) as string[];
  const conf = best.Confidence;

  return words.map((w) => {
    const tok: HeardToken = { text: w, norm: normalizeForComparison(w) as string };
    // ثقة الجملة تُنسب إلى كل كلمة: هي الثقة الحقيقية الوحيدة عند Azure
    if (conf !== undefined) tok.confidence = conf;
    return tok;
  });
}

/**
 * كلمات من تقييم Azure — للمقارنة في المختبر.
 *
 * ⚠️ تُستبعد كلمات `Omission`: هي متوقَّعة لم تُنطق، وإدخالها يعني
 * إخبار محرّكنا بأن الطفل قال ما لم يقله.
 */
function fromAssessedWords(best: AzureNBest): HeardToken[] {
  const words = best.Words ?? [];
  const utter = best.Confidence;

  const out: HeardToken[] = [];
  for (const w of words) {
    if (w.ErrorType === 'Omission') continue;

    const tok: HeardToken = {
      text: w.Word,
      norm: normalizeForComparison(w.Word) as string,
    };
    if (w.Offset !== undefined) {
      tok.startSec = w.Offset / TICKS_PER_SECOND;
      if (w.Duration !== undefined)
        tok.endSec = (w.Offset + w.Duration) / TICKS_PER_SECOND;
    }
    /**
     * الثقة: ثقة الكلمة إن كانت ذات معنى، وإلا ثقة الجملة.
     *
     * ⚠️ Azure يُرجع `0.0` لكل كلمة في وضع التقييم — كما في مثاله
     * الرسمي. ولو صدّقناها لتحوّل كل شيء إلى «لم أتأكد» وصار المحرّك
     * لا يقول شيئًا أبدًا.
     */
    const c = w.Confidence !== undefined && w.Confidence > 0 ? w.Confidence : utter;
    if (c !== undefined) tok.confidence = c;

    out.push(tok);
  }
  return out;
}

/** ترويسة التقييم: JSON بترميز Base64 كما تطلبه Microsoft. */
export function buildAssessmentHeader(referenceText: string): string {
  const params = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Word',
    // ⚠️ Comprehensive شرطٌ للحصول على ErrorType لكل كلمة
    Dimension: 'Comprehensive',
    // ⚠️ يعمل مع صوت ≤ ٣٠ ثانية فقط — ولهذا ننادي لكل آية على حدة
    EnableMiscue: 'True',
    // لا تقييم أداء: العروض والنبر تجويدٌ مؤجَّل
    EnableProsodyAssessment: 'False',
  };
  if (typeof Buffer !== 'undefined') return Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(JSON.stringify(params))));
}

export function azureEndpoint(resourceName: string, languageTag: string): string {
  return (
    `https://${resourceName}.cognitiveservices.azure.com` +
    `/stt/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(languageTag)}&format=detailed`
  );
}

/**
 * المزوّد الحقيقي — لا يعمل إلا على الخادم.
 *
 * ⚠️ المفتاح يُقرأ من بيئة الخادم ولا يُمرَّر إلى المتصفح ولا يُطبع
 * في سجلّ. ولا يُرسَل مع الصوت اسمُ طالبة ولا معرّفها — الصوت وحده
 * والنص المتوقَّع، ثم يُنسى.
 */
export class AzureSpeechProvider implements SpeechProvider {
  readonly id = 'azure' as const;

  constructor(
    private readonly resourceName: string,
    private readonly key: string,
    private readonly source: TokenSource = 'lexical'
  ) {}

  async transcribe(req: RecitationRequest): Promise<RecitationResponse> {
    const started = Date.now();
    const audioSec = wavDurationSec(req.audio);

    const base: ProviderDiagnostics = {
      provider: 'azure',
      latencyMs: 0,
      audioBytes: req.audio.byteLength,
      audioSec,
    };

    try {
      const res = await fetch(azureEndpoint(this.resourceName, req.languageTag), {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          Accept: 'application/json',
          'Pronunciation-Assessment': buildAssessmentHeader(req.referenceText),
        },
        body: req.audio,
        cache: 'no-store',
      });

      const latencyMs = Date.now() - started;

      if (!res.ok) {
        return {
          status: 'PROVIDER_ERROR',
          tokens: [],
          diagnostics: {
            ...base,
            latencyMs,
            // ⚠️ نصّ الخطأ للسجل التقني لا للطفل، ولا يحوي صوتًا
            errorMessage: `HTTP ${res.status}`,
          },
        };
      }

      const json = (await res.json()) as AzureResponse;
      return adaptAzureResponse(json, {
        source: this.source,
        audioBytes: req.audio.byteLength,
        audioSec,
        latencyMs,
      });
    } catch (e) {
      return {
        status: 'PROVIDER_ERROR',
        tokens: [],
        diagnostics: {
          ...base,
          latencyMs: Date.now() - started,
          errorMessage: e instanceof Error ? e.message : 'network',
        },
      };
    }
  }
}

/** مدة ملف WAV من ترويسته — للتشخيص والتكلفة. */
export function wavDurationSec(buf: ArrayBuffer): number {
  if (buf.byteLength < 44) return 0;
  const view = new DataView(buf);
  const byteRate = view.getUint32(28, true);
  if (!byteRate) return 0;
  return (buf.byteLength - 44) / byteRate;
}
