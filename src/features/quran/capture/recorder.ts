'use client';

/**
 * التقاط الصوت — طبقة تعرف الأجهزة ولا يعرفها ما بعدها.
 *
 * ═══ لماذا لا نستعمل MediaRecorder ═══
 * الطريق الطبيعي هو `MediaRecorder`، وقد تركناه عمدًا:
 *
 * • **Safari على آيباد لا يعطي WebM.** يعطي `audio/mp4` بترميز AAC،
 *   وAzure لا يقبل إلا WAV/PCM أو OGG/OPUS. فمسار MediaRecorder على
 *   آيباد ينتهي بصيغة لا يقبلها المزوّد أصلًا.
 * • **قطع `timeslice` من `audio/mp4` غير مستقلة**: أولها وحده يحمل
 *   ترويسة الملف، فما بعده بايتات لا تُفكّ وحدها.
 * • `onstop` و`pause()` و`resume()` غير موثوقة على iOS بتقارير
 *   متعددة من مطوّرين، فقد ينتهي التسجيل ولا يصلنا شيء.
 *
 * ولهذا نلتقط **عيّنات خامًا** ثم نبني WAV بأنفسنا: نتحكّم بالصيغة
 * تحكّمًا كاملًا، والقطع مستقلة بطبيعتها، وأعطال MediaRecorder على
 * iOS تصير غير ذات موضوع.
 *
 * ⚠️ **لم يُختبر هذا على Safari حقيقي على آيباد بعد.** المكتوب هنا
 * مبنيّ على وثائق WebKit وتقارير أعطال موثَّقة، لا على تجربة أجريناها.
 * ولا يُقال إنه يعمل قبل أن يُشغَّل على الجهاز.
 *
 * ═══ الخصوصية ═══
 * ⚠️ الصوت يعيش في الذاكرة فقط. لا يُكتب في قرص ولا قاعدة بيانات ولا
 * سجل، ولا يحمل اسم طالبة ولا معرّفها. يُرسل، تُستخرج النتيجة، ثم
 * يُنسى بإفلات المرجع.
 */

/** معدّل العيّنة الذي يطلبه المزوّد. */
export const TARGET_SAMPLE_RATE = 16000;

export type CaptureError =
  | 'PERMISSION_DENIED'
  | 'NO_MICROPHONE'
  | 'NOT_SUPPORTED'
  | 'INTERRUPTED';

export class CaptureFailure extends Error {
  constructor(readonly code: CaptureError) {
    super(code);
  }
}

export type CaptureResult = {
  /** WAV أحادي ١٦ ك.هرتز، ١٦ بت. */
  wav: ArrayBuffer;
  /**
   * العيّنات بعد إعادة العيّنة — يقسّمها منظّم الجلسة عند السكتات.
   *
   * ⚠️ في الذاكرة وحدها. لا تُكتب ولا تُرفع، وتزول بانتهاء الجلسة.
   */
  samples: Float32Array;
  durationSec: number;
  /** جذر متوسط المربّعات ٠..١ — لكشف التسجيل الضعيف قبل إرساله. */
  rms: number;
  /** أعلى سعة ٠..١ — لكشف القصّ (الصوت القريب جدًا من الميكروفون). */
  peak: number;
  /** معدّل العيّنة الذي أعطاه الجهاز فعلًا، قبل إعادة العيّنة. */
  deviceSampleRate: number;
};

/**
 * وحدة معالجة تُشغَّل في خيط الصوت.
 *
 * تُبنى نصًّا ثم تُحمَّل من رابط Blob، فلا نحتاج ملفًا في `public/`
 * ولا مسارًا يجب أن يبقى صحيحًا بعد كل نقل.
 */
const WORKLET_SOURCE = `
class GhirasCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('ghiras-capture', GhirasCapture);
`;

export class Recorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private workletUrl: string | null = null;
  private recording = false;

  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * البدء — **يجب أن يُنادى داخل لمسة المستخدم**.
   *
   * ⚠️ iOS لا يسمح ببدء `AudioContext` إلا من حدث لمس مباشر. ولو
   * نودي من `useEffect` لبقي السياق موقوفًا والتسجيل صامتًا بلا خطأ
   * ظاهر — وهو أسوأ أنواع الأعطال.
   */
  async start(): Promise<void> {
    if (this.recording) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
      throw new CaptureFailure('NOT_SUPPORTED');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // ⚠️ خيارات تُقاس مع الأطفال لاحقًا: كبح الضجيج قد يبتلع
          // صوتًا خافتًا، وضبط الكسب قد يرفع ضجيج الصف. القيم الحالية
          // اجتهاد لا قياس.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError')
        throw new CaptureFailure('PERMISSION_DENIED');
      if (name === 'NotFoundError' || name === 'OverconstrainedError')
        throw new CaptureFailure('NO_MICROPHONE');
      throw new CaptureFailure('NOT_SUPPORTED');
    }

    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) throw new CaptureFailure('NOT_SUPPORTED');

    // ⚠️ لا نفرض معدّل عيّنة: iOS يتجاهله أو يُخطئ، فنقرأ ما أعطاه
    // الجهاز فعلًا ونعيد العيّنة بأنفسنا.
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const src = this.ctx.createMediaStreamSource(this.stream);
    this.chunks = [];

    if (this.ctx.audioWorklet) {
      this.workletUrl = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
      );
      await this.ctx.audioWorklet.addModule(this.workletUrl);
      const node = new AudioWorkletNode(this.ctx, 'ghiras-capture');
      node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (this.recording) this.chunks.push(ev.data);
      };
      src.connect(node);
      // ⚠️ لا يُوصَل بالمخرج: لا نريد أن تسمع الطالبة صوتها مضخَّمًا
      this.node = node;
    } else {
      // بديل للمتصفحات القديمة — مهجور لكنه يعمل حيث لا AudioWorklet
      const node = this.ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (ev) => {
        if (this.recording) this.chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      };
      src.connect(node);
      node.connect(this.ctx.destination);
      this.node = node;
    }

    this.recording = true;
  }

  /**
   * طاقة آخر لحظات التسجيل — لكشف السكوت في وضع التدريب.
   *
   * ⚠️ يُحسب في الجهاز على العيّنات الخام، فلا ينتظر شبكةً ولا مزوّدًا.
   * ولهذا تظهر «خذي وقتك 🌱» في حينها لا بعد أربع ثوانٍ من ردّ المزوّد.
   *
   * ولا يقول إنها أخطأت — يقول إنها سكتت، وقد تتنفّس أو تتذكّر.
   */
  liveRms(seconds = 0.4): number {
    if (!this.ctx || !this.chunks.length) return 0;
    const need = Math.floor(this.ctx.sampleRate * seconds);
    let have = 0;
    let sum = 0;
    for (let i = this.chunks.length - 1; i >= 0 && have < need; i--) {
      const c = this.chunks[i];
      for (let j = c.length - 1; j >= 0 && have < need; j--, have++) sum += c[j] * c[j];
    }
    return have ? Math.sqrt(sum / have) : 0;
  }

  /** كم ثانيةً تراكمت ولم تُسحب بعد. */
  heldSeconds(): number {
    if (!this.ctx) return 0;
    let n = 0;
    for (const c of this.chunks) n += c.length;
    return n / this.ctx.sampleRate;
  }

  /**
   * سحب ما تراكم وإفراغه — **والتسجيل مستمرّ**.
   *
   * ── لماذا ──
   * كنّا نسجّل الجلسة كلها ثم نرسل قطعها بعد «انتهيت»، فينتظر القارئ
   * أربع ثوانٍ لكل قطعة مجموعةً بعضها إلى بعض. وأكثر ذلك الانتظار
   * كان يمكن أن يمضي **وهو يقرأ**.
   *
   * فصار ما يتمّ من الصوت يُرسل في حينه، ولا يبقى عند «انتهيت» إلا
   * آخر قطعة. والقارئ لا يشعر بشيء: يقرأ متصلًا كما كان.
   *
   * ⚠️ ويُفرَّغ المخزَن هنا لا يُنسَخ: ما سُحب أُرسل، وإبقاؤه يعني
   * إرساله مرتين فتُحسب الآيات مكرَّرة على القارئ.
   */
  drain(): Float32Array {
    if (!this.ctx) return new Float32Array(0);
    const raw = concat(this.chunks);
    this.chunks = [];
    return resample(raw, this.ctx.sampleRate, TARGET_SAMPLE_RATE);
  }

  /** الإيقاف وبناء WAV. يُنادى مرة واحدة. */
  async stop(): Promise<CaptureResult> {
    if (!this.ctx) throw new CaptureFailure('INTERRUPTED');
    this.recording = false;

    const deviceRate = this.ctx.sampleRate;
    const raw = concat(this.chunks);
    this.chunks = [];
    await this.release();

    const samples = resample(raw, deviceRate, TARGET_SAMPLE_RATE);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      sum += samples[i] * samples[i];
      if (v > peak) peak = v;
    }

    return {
      wav: encodeWav(samples, TARGET_SAMPLE_RATE),
      samples,
      durationSec: samples.length / TARGET_SAMPLE_RATE,
      rms: samples.length ? Math.sqrt(sum / samples.length) : 0,
      peak,
      deviceSampleRate: deviceRate,
    };
  }

  /**
   * إلغاء ما سُجّل وإفلات الميكروفون.
   *
   * يُنادى عند مغادرة الصفحة أو إخفائها: iOS يُجمّد سياق الصوت بعد
   * نحو نصف دقيقة في الخلفية، فيخرج تسجيل مبتور يبدو نسيانًا وليس
   * نسيانًا. إنهاء الجلسة صراحةً أصدق من نتيجة مبتورة.
   */
  async abort(): Promise<void> {
    this.recording = false;
    this.chunks = [];
    await this.release();
  }

  private async release(): Promise<void> {
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {
        /* المتصفح أغلقه قبلنا */
      }
      this.node = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* مغلق أصلًا */
      }
      this.ctx = null;
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * إعادة العيّنة إلى ١٦ ك.هرتز بالاستيفاء الخطّي.
 *
 * ⚠️ خطوة إلزامية لا تحسين: iOS ثبّت `AudioContext.sampleRate` على
 * ٤٤١٠٠ حتى حين يعمل العتاد على ٤٨٠٠٠، فإرسال ما يعطيه الجهاز كما هو
 * يعني صوتًا بمعدّل خاطئ يرفضه المزوّد أو يقرؤه مشوَّهًا.
 */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (!input.length || from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const low = Math.floor(pos);
    const high = Math.min(low + 1, input.length - 1);
    const frac = pos - low;
    out[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return out;
}

/** بناء WAV أحادي ١٦ بت — الصيغة الوحيدة التي يقبلها المزوّد. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // حجم كتلة fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // أحادي
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // بايت في الثانية
  view.setUint16(32, 2, true); // محاذاة الكتلة
  view.setUint16(34, 16, true); // بت لكل عيّنة
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let at = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    at += 2;
  }
  return buffer;
}
