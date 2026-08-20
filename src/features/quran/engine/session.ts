/**
 * منظّم جلسة التسميع — يقسّم في الخفاء، والطالبة تسمّع مرة واحدة.
 *
 * ═══ المشكلة ═══
 * المزوّد يقبل ثلاثين ثانية في النداء الواحد. ودرسٌ من عشر آيات قد
 * يبلغ دقيقتين. فلا بدّ من تقسيم.
 *
 * ═══ ما لا نفعله ═══
 * ⚠️ لا نطلب من الطالبة أن تضغط «ابدأ» لكل آية. التسميع فعلٌ متصل،
 * وتقطيعه إلى أزرار يحوّله إلى إملاء ويكسر تسلسل الحفظ — وهو أهم ما
 * في التسميع.
 *
 * ⚠️ ولا نقطع عند حدٍّ زمني أعمى. القطعُ في وسط آية يبتر كلمةً نصفين،
 * فيراها المحرّك خطأً وهي خطؤنا نحن.
 *
 * ═══ ما نفعله ═══
 * نقطع عند **السكتات**. والقارئ يسكت بين الآيات طبعًا، فالسكتة حدٌّ
 * طبيعي يوافق بنية النص. ونكشفها من الصوت نفسه (طاقة منخفضة لمدة
 * كافية) — بلا مزوّد، وفي الجهاز، وفورًا.
 *
 * وإن طالت التلاوة بلا سكتة حتى قاربنا الحدّ، نمدّد قليلًا ثم نقطع عند
 * أهدأ نقطة وجدناها — ونُعلم المحرّك أن الحدّ مصطنع فيتحفّظ عنده.
 *
 * ⚠️ ولا يُبنى النص المتوقَّع للمقطع في المتصفح: الخادم يبنيه من مصحفه
 * بنفسه. هنا نقسّم **الصوت** فقط.
 */

/** حدّ المزوّد الأقصى بالثواني. */
export const PROVIDER_MAX_SEC = 30;

export type SessionTuning = {
  /** نستهدف القطع عند هذا الطول إن وجدنا سكتة. */
  targetSec: number;
  /** لا نقطع أبدًا بعد هذا مهما كان. */
  hardMaxSec: number;
  /** أقصر مقطع نرسله — أقلّ منه لا يستحق نداءً. */
  minSec: number;
  /**
   * كم يتراكم قبل أن تُقطع أولُ سكتةٍ وتُرسل — أثناء القراءة.
   *
   * ⚠️ هذا ما يقرّر انتظار القارئ عند «انتهيت»: ما لم يُرسل أثناء
   * القراءة يبقى ذيلًا يُعالَج بعدها. فكلّما صغُر، صغُر الانتظار.
   */
  liveCutSec: number;
  /** طاقة دونها تُعدّ سكوتًا (جذر متوسط المربّعات). */
  silenceRms: number;
  /** أقصر سكوت يصلح حدًّا للقطع. */
  silenceSec: number;
  /** سكوت بهذا الطول في وضع التدريب ⇒ الأرجح أنها تعثّرت. */
  strugglingSec: number;
};

export const SESSION_TUNING: SessionTuning = {
  /**
   * ٢٢ ثانية — دون حدّ المزوّد بهامش يسمح بمدّ البحث عن سكتة.
   * ولو استهدفنا الثلاثين لما بقي مجال للمرونة.
   */
  targetSec: 22,
  hardMaxSec: PROVIDER_MAX_SEC - 1,
  /** أقلّ من ثانيتين غالبًا نفَسٌ أو ضجّة لا تلاوة. */
  minSec: 2,

  /**
   * ٨ ثوانٍ — أقصر ممّا كان (١٣) عن قصد.
   *
   * ⚠️ والتكلفة لا تزيد: المزوّد يحاسب على **ثواني الصوت** لا على
   * عدد النداءات. فتقسيمُ الدقيقة إلى سبع قطعٍ بدل ثلاث يكلّف مثلها،
   * ويترك عند «انتهيت» ذيلًا أقصر يُعالَج أسرع.
   *
   * ولا يُقطع إلا عند سكتة، فالحدّ لا يكسر كلامًا.
   */
  liveCutSec: 8,
  /**
   * ⚠️ أرقام ابتدائية بلا قياس على أطفال. صوت الطفل أخفت، وقد نحتاج
   * خفض العتبة؛ والصف فيه ضجيج، وقد نحتاج رفعها. تُقاس ثم تُضبط.
   */
  silenceRms: 0.015,
  silenceSec: 0.35,
  strugglingSec: 3,
};

export type AudioChunk = {
  /** ترتيبه في الجلسة، من صفر. */
  index: number;
  /** بدايته من أول الجلسة بالثواني. */
  startSec: number;
  endSec: number;
  /** عيّنات هذا المقطع. */
  samples: Float32Array;
  /**
   * هل قُطع عند سكتة طبيعية؟
   *
   * `false` يعني أننا بلغنا الحدّ التقني ولم نجد سكتة — فحدّه مصطنع
   * وقد تكون كلمةٌ مبتورةً عنده، ويجب التحفّظ في الحكم على طرفيه.
   */
  cutAtSilence: boolean;
};

/** طاقة نافذة من العيّنات. */
function rmsOf(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n);
}

/**
 * مواضع السكوت في التسجيل، بالعيّنات.
 *
 * تُحسب على نوافذ قصيرة متتابعة، فتلتقط السكتة بين الآيات ولا تلتقط
 * الوقفات الطبيعية داخل الكلمة.
 */
export function findSilences(
  samples: Float32Array,
  sampleRate: number,
  t: SessionTuning = SESSION_TUNING
): { start: number; end: number }[] {
  const win = Math.max(1, Math.floor(sampleRate * 0.02)); // ٢٠ ملّي ثانية
  const need = Math.floor((t.silenceSec * sampleRate) / win);
  const out: { start: number; end: number }[] = [];

  let run = 0;
  for (let i = 0; i + win <= samples.length; i += win) {
    if (rmsOf(samples, i, i + win) < t.silenceRms) {
      run++;
    } else {
      if (run >= need) out.push({ start: i - run * win, end: i });
      run = 0;
    }
  }
  if (run >= need) out.push({ start: samples.length - run * win, end: samples.length });
  return out;
}

/**
 * تقسيم تسجيل الجلسة إلى مقاطع صالحة للإرسال.
 *
 * ⚠️ القاعدة: القطع عند منتصف سكتة، لا عند حافّتها — فيبقى للمقطع
 * السابق ذيلٌ من الصمت وللتالي رأسٌ منه، ولا تُبتر كلمة عند الحدّ.
 */
/**
 * ⚠️ لم يعد هذا مسارَ التسميع الحيّ.
 *
 * كان يقسّم التسجيل **بعد** انتهائه، فينتظر القارئ أربع ثوانٍ لكل
 * قطعة مجموعةً بعضها إلى بعض. وصارت القطع تُرسل **أثناء القراءة**
 * فور اكتمالها، فلا يبقى عند «انتهيت» إلا آخرها.
 *
 * ويبقى هنا مرجعًا للقواعد نفسها — أين يُقطع الصوت ولماذا — وتُختبر
 * به حدودُ المزوّد وسلوكُ الصمت بلا حاجة إلى تسجيلٍ حيّ.
 */
export function splitIntoChunks(
  samples: Float32Array,
  sampleRate: number,
  t: SessionTuning = SESSION_TUNING
): AudioChunk[] {
  const total = samples.length;
  if (!total) return [];

  const totalSec = total / sampleRate;
  if (totalSec <= t.hardMaxSec) {
    return [
      {
        index: 0,
        startSec: 0,
        endSec: totalSec,
        samples,
        cutAtSilence: true, // نهاية التسجيل حدٌّ طبيعي لا حدٌّ تقني
      },
    ];
  }

  const silences = findSilences(samples, sampleRate, t);
  const chunks: AudioChunk[] = [];
  let from = 0;

  while (from < total) {
    const remaining = (total - from) / sampleRate;
    if (remaining <= t.hardMaxSec) {
      chunks.push(make(chunks.length, from, total, true));
      break;
    }

    const target = from + Math.floor(t.targetSec * sampleRate);
    const hardMax = from + Math.floor(t.hardMaxSec * sampleRate);
    const minEnd = from + Math.floor(t.minSec * sampleRate);

    // أنسب سكتة: أقرب واحدة إلى الهدف وضمن الحدّ الأقصى
    let cut = -1;
    for (const s of silences) {
      const mid = Math.floor((s.start + s.end) / 2);
      if (mid <= minEnd || mid > hardMax) continue;
      if (cut === -1 || Math.abs(mid - target) < Math.abs(cut - target)) cut = mid;
    }

    if (cut === -1) {
      // ⚠️ لا سكتة: نقطع عند الحدّ التقني ونُعلن أن الحدّ مصطنع
      chunks.push(make(chunks.length, from, hardMax, false));
      from = hardMax;
    } else {
      chunks.push(make(chunks.length, from, cut, true));
      from = cut;
    }
  }

  return chunks;

  function make(index: number, a: number, b: number, atSilence: boolean): AudioChunk {
    return {
      index,
      startSec: a / sampleRate,
      endSec: b / sampleRate,
      samples: samples.subarray(a, b),
      cutAtSilence: atSilence,
    };
  }
}

/**
 * هل الطالبة صامتة الآن؟ — لوضع التدريب وحده.
 *
 * يُحسب في الجهاز على آخر ما سُجّل، فلا ينتظر مزوّدًا ولا شبكة. وهذا
 * ما يجعل «خذ وقتك 🌱» تظهر في حينها لا بعد أربع ثوانٍ من الرد.
 *
 * ⚠️ وهو **لا يقول إنها أخطأت**. يقول إنها سكتت، وقد تكون تتنفّس أو
 * تتذكّر. ولهذا لا يُعرض عنده إلا تشجيع، ويُترك طلب المساعدة لها.
 */
export function silentFor(
  samples: Float32Array,
  sampleRate: number,
  t: SessionTuning = SESSION_TUNING
): number {
  const win = Math.max(1, Math.floor(sampleRate * 0.02));
  let quiet = 0;
  for (let i = samples.length - win; i >= 0; i -= win) {
    if (rmsOf(samples, i, i + win) >= t.silenceRms) break;
    quiet += win;
  }
  return quiet / sampleRate;
}
