'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Ayah, Reciter } from '../types';
import { toArabic } from '../engine/numerals';
import { buildExpected, type ExpectedWord } from '../engine/alignment';
import { nextHint, type Hint, type HintLevel } from '../engine/hints';
import type { MasteryLevel } from '../engine/grading';
import { SESSION_TUNING } from '../engine/session';
import { Recorder, CaptureFailure, encodeWav, TARGET_SAMPLE_RATE } from '../capture/recorder';
import { ayahAudioUrl } from '../engine/audio';

/**
 * «سمّع لي» — الشاشة التي تراها الطالبة.
 *
 * ═══ تصميم هادئ عن قصد ═══
 * ⚠️ لا مؤشرات ولا موجات ولا أرقام تتحرّك. الطالبة تحتاج أن تعرف
 * شيئًا واحدًا: **أنا أسمّع الآن**. وكل ما زاد على ذلك يشتّت من تحفظ.
 *
 * ═══ الصدق فيما نَعِد ═══
 * ⚠️ لا ندّعي تصحيحًا حيًّا كلمةً بكلمة: مزوّدنا يردّ بعد أربع ثوانٍ،
 * فادّعاء ذلك كذب على الطالبة وعلى أنفسنا. ما نفعله في وضع التدريب
 * صادقٌ وفوري: نسمع **السكوت** في الجهاز نفسه، فنقول «خذي وقتك» —
 * ولا نقول «أخطأتِ» لأننا لا نعلم.
 *
 * ═══ الجلسة واحدة والتقسيم مخفي ═══
 * المزوّد يقبل ثلاثين ثانية، والدرس قد يبلغ دقيقتين. فنقسّم الصوت
 * **عند السكتات** بعد انتهائها — والطالبة تسمّع مرة واحدة متصلة ولا
 * تضغط زرًّا لكل آية.
 *
 * ═══ الصوت ═══
 * ⚠️ يبقى في الذاكرة. يُرسل، تُستخرج النتيجة، ثم يزول. لا يُحفظ في
 * قرص ولا قاعدة بيانات ولا سجل — لا هنا ولا على الخادم.
 */

type Mode = 'train' | 'test';
type Phase = 'setup' | 'reciting' | 'paused' | 'processing' | 'result';

type ChunkOutcome = {
  tokens: { text: string; confidence?: number }[];
  status: string;
  snr: number | null;
  confidence: number | null;
  seconds: number;
  artifactsRemoved: number;
  failed?: string;
};

type ChunkDiag = {
  index: number;
  seconds: number;
  status: string;
  snr: number | null;
  confidence: number | null;
  tokens: number;
  artifactsRemoved: number;
  atSilence: boolean;
};

type Mistake = {
  kind: string;
  surah: number;
  ayah: number | null;
  words: string[];
  heard?: string[];
};

/** وصفٌ لطيف لكل نوع — «نراجعها معًا» لا «أخطأتِ». */
function mistakeLabel(kind: string): string {
  switch (kind) {
    case 'OMISSION':
      return 'ما وصلتني هذي';
    case 'SKIP':
      return 'هذا الموضع ما قرأته';
    case 'SUBSTITUTION':
      return 'هنا كلمة غير المتوقَّعة';
    case 'INSERTION':
      return 'كلمة زايدة على النص';
    case 'REPETITION':
      return 'كرّرت هنا';
    default:
      return 'نراجعه معًا';
  }
}
type Verdict = { level: MasteryLevel; headline: string; detail: string };
type GardenOutcome = {
  granted: number;
  reason: 'GRANTED' | 'ALREADY_TODAY' | 'DAY_CAP' | 'HOLD_FULL' | 'NOT_ELIGIBLE' | 'UNAVAILABLE';
};

/**
 * ما يُقال عن القطرة — صدقًا لا وعدًا.
 *
 * ⚠️ كان يُقال «تسميعك اليوم صار قطرة ماء 💧» بلا شرط، فسمّعت صاحبة
 * المنصة مقطعًا سمّعته قبل ساعة فلم تُمنح — وقد رفض الحارس بحقّ —
 * فذهبت تبحث عن قطرةٍ وعدناها بها ولم تكن. **والوعد الذي لا يقع
 * أسوأ من الصمت.**
 *
 * ⚠️ و`null` تعني: لا تقل شيئًا. فالجلسة غير الصالحة شرحتها النتيجةُ
 * نفسها، وغيابُ المفتاح شأنٌ لا يعني الطالبة.
 */
function gardenLine(g?: GardenOutcome): string | null {
  if (!g) return null;
  switch (g.reason) {
    case 'GRANTED':
      return g.granted === 1
        ? 'تسميعك صار قطرة ماء 💧'
        : `تسميعك صار ${g.granted} قطرات ماء 💧`;
    case 'ALREADY_TODAY':
      return 'سمّعت هذا المقطع اليوم وأخذت قطرته — جرّب مقطعًا ثانيًا 🌿';
    case 'DAY_CAP':
      return 'خذت قطرات اليوم كاملة — ونكمل بكرة 🌿';
    case 'HOLD_FULL':
      return 'عندك قطرات كثيرة محفوظة — اسقِ نبتتك أول 💧';
    default:
      return null;
  }
}

type FinishResult = {
  usable: boolean;
  garden?: GardenOutcome;
  /** سبب عدم الصلاحية — يُصاغ منه ما يُقال للطالبة. */
  unusableReason?: string | null;
  verdict: Verdict;
  summary: { expectedWords: number; matched: number; confirmedErrors: number; uncertain: number };
  mistakes: Mistake[];
  unsure: { ayah: number | null; words: string[]; heard?: string[] }[];
  weakSpots: { surah: number; ayah: number; atTransition: boolean }[];
};

export default function ReciteScreen({
  surah,
  ayahs,
  from,
  to,
  reciter,
  backHref,
  backLabel,
  lessonTitle,
}: {
  surah: { number: number; name_ar: string };
  ayahs: Ayah[];
  from: number;
  to: number;
  reciter: Reciter;
  backHref: string;
  backLabel: string;
  lessonTitle?: string;
}) {
  const expected = buildExpected(ayahs);

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('train');
  const [note, setNote] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintLevel, setHintLevel] = useState<HintLevel>(0);
  const [quiet, setQuiet] = useState(false);
  /** الآية التي اختارتها للعون — تُسأل ولا تُخمَّن. */
  const [helpAyah, setHelpAyah] = useState<number | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /**
   * تشخيص كل قطعة — لا يُعرض للطالبة إطلاقًا.
   *
   * ⚠️ يظهر فقط بإضافة `?diag=1` إلى الرابط، وهو للقياس أثناء البناء.
   * والطالبة لا يعنيها كم قطعةً أُرسلت ولا كم كان نقاء الصوت؛ يعنيها
   * أن تعرف ما تفعل. فالتشخيص لنا وحدنا.
   */
  const [diag, setDiag] = useState<ChunkDiag[]>([]);

  const recorder = useRef<Recorder | null>(null);
  /** كل ما سُجّل — لحساب المدة وحدها. */
  const parts = useRef<Float32Array[]>([]);
  /**
   * ما سُجّل **ولم يُرسل بعد**.
   *
   * ⚠️ الفصل بينه وبين `parts` ضرورة لا ترتيب: ما يُرسل أثناء القراءة
   * يخرج من هنا ويبقى هناك للمدة. ولولا الفصل لالتبس المُرسَل بغيره،
   * فإما أُرسل مرتين فتُحسب الآيات مكرَّرة، وإما لم يُرسل أصلًا —
   * وقد وقع الثاني: ما جمعه إيقافُ المسجّل عند «انتهيت» لم يُرسل،
   * فضاع نصف التلاوة وظهر «٢٠ من ٣٨».
   */
  const unsent = useRef<Float32Array[]>([]);
  /**
   * القطع المرسَلة أثناء القراءة، بترتيبها.
   *
   * ⚠️ الترتيب شرط: الكلمات تُوصَل بعضها ببعض لتُحاذى بالنص، فلو
   * وصلت قطعةٌ قبل سابقتها لاختلّ الترتيب وصار الحكم على غير ما قُرئ.
   * فنحفظ الوعود مرتَّبةً وننتظرها بترتيبها لا بترتيب وصولها.
   */
  const inFlight = useRef<Promise<ChunkOutcome>[]>([]);
  /** ما أُرسل ولم يُسحب بعدُ من المسجّل — يمنع الإرسال المتكرر. */
  const cutting = useRef(false);
  const helpUsed = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedAt = useRef(0);

  // ── مغادرة الصفحة أثناء التسجيل ──────────────────────────
  //
  // ⚠️ iOS يجمّد سياق الصوت بعد نحو نصف دقيقة في الخلفية، فيخرج تسجيل
  // مبتور يبدو نسيانًا وليس نسيانًا. إنهاء الجلسة صراحةً أصدق.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && recorder.current?.isRecording) {
        void recorder.current.abort();
        recorder.current = null;
        parts.current = [];
        unsent.current = [];
        inFlight.current = [];
        setPhase('setup');
        setNote('توقّف التسميع لأن الشاشة أُغلقت أو خرجت من الصفحة. نبدأ من جديد؟');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // ── نبض الجلسة: السكوت، والقطع، والإرسال المبكّر ─────────
  //
  // ⚠️ يُقطع **عند سكتة** ما أمكن. والسكتة بين الآيات حدٌّ طبيعي،
  // أما القطع في وسط كلمة فيُفقد المزوّدَ سياقَها فيُخطئ فيها.
  useEffect(() => {
    if (phase !== 'reciting') return;
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      const r = recorder.current;
      if (!r?.isRecording) return;

      const silent = r.liveRms(0.5) < SESSION_TUNING.silenceRms;
      if (mode === 'train')
        setQuiet(r.liveRms(SESSION_TUNING.strugglingSec) < SESSION_TUNING.silenceRms);

      const held = r.heldSeconds();
      // بلغ الحدّ التقني ⇒ يُقطع اضطرارًا ولو في وسط الكلام
      if (held >= SESSION_TUNING.hardMaxSec - 1) void cutAndSend(true);
      // أو سكت بعد ما تجمّع ما يكفي ⇒ حدٌّ طبيعي
      else if (held >= SESSION_TUNING.liveCutSec && silent) void cutAndSend(false);
    }, 700);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  useEffect(() => {
    return () => {
      void recorder.current?.abort();
      audio.current?.pause();
    };
  }, []);

  // ── بدء التسجيل — داخل لمسة المستخدم، شرط iOS ────────────
  const begin = useCallback(async (fresh: boolean) => {
    /**
     * ⚠️ يُقطع صوت القارئ أولًا.
     *
     * كان يُترك يكمل الآية بعد أن تضغط «أكمل التسميع»، فيقع أمران:
     * تسمعه وهي تريد أن تقرأ بنفسها، **والميكروفون يلتقطه فيُحسب
     * عليها كأنها هي التي قالته**. والثاني أخطر: ما جاء عونًا يصير
     * تهمة.
     */
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;

    setNote(null);
    setHint(null);
    setQuiet(false);
    try {
      const r = new Recorder();
      await r.start();
      recorder.current = r;
      if (fresh) {
        parts.current = [];
        unsent.current = [];
        inFlight.current = [];
        helpUsed.current = false;
        setHintLevel(0);
        startedAt.current = Date.now();
        setElapsed(0);
      }
      setPhase('reciting');
    } catch (e) {
      setNote(captureMessage(e));
      setPhase('setup');
    }
  }, []);

  /** يوقف التسجيل الحالي ويحتفظ بعيّناته. */
  async function pauseCapture(): Promise<boolean> {
    const r = recorder.current;
    if (!r) return false;
    try {
      const cap = await r.stop();
      recorder.current = null;
      // ⚠️ يدخل الاثنين: `parts` للمدة، و`unsent` لأنه لم يُرسل بعد
      if (cap.samples.length) {
        parts.current.push(cap.samples);
        unsent.current.push(cap.samples);
      }
      return true;
    } catch {
      recorder.current = null;
      return false;
    }
  }

  // ── التلميح ──────────────────────────────────────────────
  //
  // ⚠️ الدرجة الثانية تُشغّل صوت القارئ، فيجب إيقاف التسجيل أولًا:
  // الميكروفون سيلتقط صوته وإلا فيُحسب على الطالبة. وiOS يحوّل الصوت
  // إلى السماعة الخارجية فور فتح الميكروفون، فالتداخل مؤكّد لا محتمل.
  /**
   * إرسال قطعة إلى الخادم — تُنادى أثناء القراءة وعند نهايتها.
   *
   * ⚠️ لا تُوقف شيئًا ولا تُظهر شيئًا: القارئ يقرأ ولا يعلم أن ثمّة
   * إرسالًا. وإن تعثّرت قطعة لم تُقطع الجلسة — يُحفظ خبرُها ويُقال
   * في آخرها، لأن قطع القراءة لأجل خللٍ في الشبكة أشدّ من الخلل.
   */
  function sendChunk(samples: Float32Array, at: number): Promise<ChunkOutcome> {
    const seconds = samples.length / TARGET_SAMPLE_RATE;
    const wav = encodeWav(samples, TARGET_SAMPLE_RATE);
    return fetch(
      `/api/quran/recite?surah=${surah.number}&from=${from}&to=${to}&at=${at}`,
      { method: 'POST', body: wav }
    )
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return {
            tokens: [], status: 'HTTP_ERROR', snr: null, confidence: null,
            seconds, artifactsRemoved: 0, failed: j.error ?? String(res.status),
          };
        }
        const j = await res.json();
        return {
          tokens: (j.tokens ?? []).map((t: { text: string; confidence?: number }) => ({
            text: t.text, confidence: t.confidence,
          })),
          status: j.status ?? '—',
          snr: typeof j.meta?.snr === 'number' ? j.meta.snr : null,
          confidence: j.meta?.confidence ?? null,
          seconds, artifactsRemoved: j.artifactsRemoved ?? 0,
        };
      })
      .catch(() => ({
        tokens: [], status: 'NETWORK', snr: null, confidence: null,
        seconds, artifactsRemoved: 0, failed: 'NETWORK',
      }));
  }

  /**
   * قطعُ ما تراكم وإرساله، والقراءة مستمرّة.
   *
   * ⚠️ يُقطع **عند سكتة** ما أمكن: القطع في وسط كلمة يُفقد المزوّدَ
   * سياقَها فيُخطئ فيها، والسكتة بين الآيات حدٌّ طبيعي لا مصطنع.
   * ولا يُقطع عند الحدّ التقني إلا اضطرارًا.
   */
  async function cutAndSend(force: boolean) {
    const r = recorder.current;
    if (!r || !r.isRecording || cutting.current) return;
    cutting.current = true;
    try {
      const fresh = r.drain();
      if (fresh.length) parts.current.push(fresh);

      // ما تبقّى من قطعةٍ قصيرة سابقة يُضمّ إلى هذه
      const piece = joinParts(unsent.current.concat(fresh.length ? [fresh] : []));
      if (piece.length < TARGET_SAMPLE_RATE) {
        // أقل من ثانية: يُحتفظ به لينضمّ إلى ما بعده، لا يُرسل هواءً
        unsent.current = piece.length ? [piece] : [];
        return;
      }
      unsent.current = [];

      // موضعُ النافذة تقديرٌ من عدد ما أُرسل — تلميحٌ للمزوّد لا حكم
      const at = Math.min(expected.length - 1, inFlight.current.length * 12);
      inFlight.current.push(sendChunk(piece, at));
    } finally {
      cutting.current = false;
    }
  }

  /**
   * طلبُ العون: نوقف التسجيل ونسألها أين وقفت.
   *
   * ── لماذا نسألها ──
   * ⚠️ كنّا نستنبط موضعها بإرسال آخر ما سجّلت إلى المزوّد وعدّ كلماته،
   * وكان خطأً مضاعفًا: عددُ كلماتِ آخرِ عشر ثوانٍ ليس موضعَها المطلق —
   * فمن قرأت ثلاثين كلمة يُحسب موضعها ثمانيةً فيأتيها تلميحُ أول
   * المقطع. ويكلّف فوق ذلك نداءً وأربعَ ثوانٍ تنتظرها وهي متعثّرة.
   *
   * والطالبة تعرف أين وقفت. فسؤالها فوريٌّ ومضبوطٌ دائمًا وبلا كلفة.
   *
   * ⚠️ والتسجيل يُوقَف أولًا: الميكروفون سيلتقط صوت القارئ وإلا فيُحسب
   * عليها، وiOS يحوّل الصوت إلى السماعة فور فتح الميكروفون.
   */
  async function askForHelp() {
    helpUsed.current = true;
    await pauseCapture();
    setHint(null);
    setHelpAyah(null);
    setHintLevel(0);
    setPhase('paused');
  }

  /** اختارت آيةً — يُشغَّل صوتها، وإعادةُ الطلب تكشف أوائل كلماتها. */
  function helpWith(ayah: number) {
    const level = helpAyah === ayah ? hintLevel : 0;
    const h = nextHint(expected, ayah, level as HintLevel);
    if (!h) return;

    setHelpAyah(ayah);
    setHintLevel(Math.min(2, level + 1) as HintLevel);
    setHint(h);

    if (h.kind === 'PLAY') {
      const el = audio.current ?? new Audio();
      audio.current = el;
      el.src = ayahAudioUrl(reciter, h.surah, h.ayah);
      void el.play().catch(() => setNote('تعذّر تشغيل التلاوة — تأكد من الإنترنت.'));
    }
  }

  // ── إنهاء الجلسة ─────────────────────────────────────────
  async function finish() {
    await pauseCapture();
    audio.current?.pause();
    setPhase('processing');
    setHint(null);
    setQuiet(false);

    const tail = joinParts(unsent.current);
    unsent.current = [];
    const samples = joinParts(parts.current);
    parts.current = [];

    if (samples.length < TARGET_SAMPLE_RATE * 1) {
      setResult(unusable('التسجيل كان قصيرًا جدًا.'));
      setPhase('result');
      return;
    }

    try {
      /**
       * ما بقي بعد ما أُرسل أثناء القراءة.
       *
       * ⚠️ ولا يُعاد إرسال ما أُرسل: `drain` أفرغ المخزَن في حينه،
       * فما هنا إلا الذيل. وإعادةُ إرساله تعني حسابَ الآيات مرتين.
       */
      if (tail.length >= TARGET_SAMPLE_RATE) {
        const at = Math.min(expected.length - 1, inFlight.current.length * 12);
        inFlight.current.push(sendChunk(tail, at));
      }

      // ⚠️ بترتيبها لا بترتيب وصولها: الكلمات تُحاذى بالنص متتابعةً
      const outcomes = await Promise.all(inFlight.current);
      inFlight.current = [];

      const tokens: { text: string; confidence?: number }[] = [];
      const statuses: string[] = [];
      const collected: ChunkDiag[] = [];
      let worstSnr: number | null = null;
      let hardFail: string | null = null;

      outcomes.forEach((o, i) => {
        if (o.failed && !hardFail) hardFail = o.failed;
        statuses.push(o.status);
        if (o.snr !== null && (worstSnr === null || o.snr < worstSnr)) worstSnr = o.snr;
        for (const t of o.tokens) tokens.push(t);
        collected.push({
          index: i,
          seconds: Math.round(o.seconds * 10) / 10,
          status: o.status,
          snr: o.snr === null ? null : Math.round(o.snr * 10) / 10,
          confidence: o.confidence,
          tokens: o.tokens.length,
          artifactsRemoved: o.artifactsRemoved,
          atSilence: true,
        });
      });

      setDiag(collected);

      if (!tokens.length && hardFail) {
        setResult(unusable(serverMessage(hardFail)));
        setPhase('result');
        return;
      }

      const done = await fetch('/api/quran/recite/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surah: surah.number,
          from,
          to,
          mode,
          helpUsed: helpUsed.current,
          chunks: outcomes.length,
          seconds: samples.length / TARGET_SAMPLE_RATE,
          tokens,
        }),
      });
      if (!done.ok) {
        const j = await done.json().catch(() => ({}));
        setResult(unusable(serverMessage(j.error)));
      } else {
        const r = (await done.json()) as FinishResult;
        // النتيجة غير صالحة ⇒ نقول لماذا بما قِسناه، لا بعبارة عامة
        setResult(
          r.usable
            ? r
            : {
                ...r,
                verdict: {
                  ...r.verdict,
                  detail: whyUnusable(statuses, worstSnr, r.unusableReason),
                },
              }
        );
      }
    } catch {
      setResult(unusable('انقطع الاتصال أثناء المراجعة.'));
    }
    setPhase('result');
  }

  // ═══════════════════ العرض ═══════════════════

  const span =
    from === to ? `الآية ${toArabic(from)}` : `الآيات ${toArabic(from)} – ${toArabic(to)}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8" dir="rtl">
      <nav className="mb-6">
        <Link href={backHref} className="tap text-sm font-bold text-[var(--q-mute)]">
          <span aria-hidden>→</span> {backLabel}
        </Link>
      </nav>

      <header className="mb-8 text-center">
        {lessonTitle && (
          <p className="mb-1 text-[0.8rem] font-bold text-[var(--q-accent)]">{lessonTitle}</p>
        )}
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          سورة {surah.name_ar}
        </h1>
        <p className="mt-1 text-[0.9rem] text-[var(--q-mute)]">{span}</p>
      </header>

      {note && (
        <p className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center text-[0.9rem] text-amber-900">
          {note}
        </p>
      )}

      {phase === 'setup' && (
        <Setup mode={mode} onMode={setMode} onStart={() => void begin(true)} />
      )}

      {phase === 'reciting' && (
        <Reciting
          mode={mode}
          elapsed={elapsed}
          quiet={quiet}
          hint={hint}
          canHint={mode === 'train'}
          onHelp={() => void askForHelp()}
          onDone={() => void finish()}
        />
      )}

      {phase === 'paused' && (
        <Paused
          hint={hint}
          expected={expected}
          chosen={helpAyah}
          onChoose={helpWith}
          onResume={() => void begin(false)}
          onDone={() => void finish()}
        />
      )}

      {phase === 'processing' && (
        <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-10 text-center">
          <p className="text-lg font-bold text-[var(--q-ink)]">جاري مراجعة تسميعك… 🌿</p>
          <p className="mt-2 text-[0.85rem] text-[var(--q-mute)]">لحظات وتوصلك النتيجة</p>
        </div>
      )}

      {phase === 'result' && result && (
        <Result
          diag={diag}
          result={result}
          onAgain={() => {
            setResult(null);
            setPhase('setup');
          }}
        />
      )}
    </main>
  );
}

// ── الشاشة الأولى ──────────────────────────────────────────

function Setup({
  mode,
  onMode,
  onStart,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <ModeCard
          active={mode === 'train'}
          onClick={() => onMode('train')}
          emoji="🌱"
          title="تدريب"
          detail="أقدر أطلب المساعدة إذا تعثّرت"
        />
        <ModeCard
          active={mode === 'test'}
          onClick={() => onMode('test')}
          emoji="⭐"
          title="اختبار"
          detail="أسمّع المقطع كاملًا بدون مساعدة"
        />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="tap rounded-3xl bg-[var(--q-accent)] px-6 py-6 text-xl font-extrabold text-white shadow-sm"
      >
        🎙️ ابدأ التسميع
      </button>

      {/* ⚠️ وعدٌ صريح للطالبة ولوليّها — ونحن ننفّذه في الكود لا في النية */}
      <p className="text-center text-[0.78rem] leading-relaxed text-[var(--q-mute)]">
        صوتك ما يُحفظ عندنا. نسمعه، نطلع النتيجة، وينمسح.
      </p>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  emoji,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap rounded-2xl border-2 p-4 text-right transition ${
        active
          ? 'border-[var(--q-accent)] bg-[var(--q-card)]'
          : 'border-[var(--q-line)] bg-transparent'
      }`}
    >
      <p className="text-base font-extrabold text-[var(--q-ink)]">
        <span aria-hidden>{emoji}</span> {title}
      </p>
      <p className="mt-1 text-[0.84rem] text-[var(--q-mute)]">{detail}</p>
    </button>
  );
}

// ── أثناء التسميع ──────────────────────────────────────────

function Reciting({
  mode,
  elapsed,
  quiet,
  hint,
  canHint,
  onHelp,
  onDone,
}: {
  mode: Mode;
  elapsed: number;
  quiet: boolean;
  hint: Hint | null;
  canHint: boolean;
  onHelp: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border-2 border-[var(--q-accent)] bg-[var(--q-card)] p-10 text-center">
        <p className="text-2xl font-extrabold text-[var(--q-ink)]">أنا أسمّع الآن</p>
        <p className="mt-3 text-[0.9rem] text-[var(--q-mute)]">
          <span aria-hidden>🎙️</span> {toArabic(elapsed)} ثانية
        </p>

        {/* ⚠️ لا نقول «أخطأت» — نحن نسمع سكوتًا لا خطأً */}
        {mode === 'train' && quiet && (
          <p className="mt-5 rounded-2xl bg-[#f2f7f3] px-4 py-3 text-base font-bold text-[var(--q-accent)]">
            خذ وقتك 🌱
          </p>
        )}
      </div>

      {hint && hint.kind === 'REVEAL' && (
        <div className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-4 text-center">
          <p className="mb-2 text-[0.8rem] text-[var(--q-mute)]">{hint.text}</p>
          <p className="font-[family-name:var(--font-amiri)] text-2xl text-[var(--q-ink)]">
            {hint.words.join(' ')}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        {mode === 'train' && (
          <button
            type="button"
            onClick={onHelp}
            disabled={!canHint}
            className="tap flex-1 rounded-2xl border-2 border-[var(--q-line)] px-4 py-4 text-base font-bold text-[var(--q-ink)] disabled:opacity-40"
          >
            💡 ساعدني
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="tap flex-1 rounded-2xl bg-[var(--q-ink)] px-4 py-4 text-base font-bold text-white"
        >
          انتهيت
        </button>
      </div>
    </div>
  );
}

function Paused({
  hint,
  expected,
  chosen,
  onChoose,
  onResume,
  onDone,
}: {
  hint: Hint | null;
  /** الكلمات المتوقَّعة — منها أوائلُ الآيات بلا بسملة. */
  expected: ExpectedWord[];
  chosen: number | null;
  onChoose: (ayah: number) => void;
  onResume: () => void;
  onDone: () => void;
}) {
  /**
   * أوائل كل آية.
   *
   * ⚠️ كانت تُعرض **أواخرُها** — كتبتُها كذلك تهرّبًا من أن نصّ الآية
   * الأولى المخزَّن يبدأ بالبسملة. فكانت الطالبة تبحث عن بدايةٍ تعرفها
   * فتُعرض عليها نهاياتٌ لا تدلّها، فتحتار. والصواب أن تُبنى من
   * الكلمات المتوقَّعة، وهي مرفوعةُ البسملة أصلًا.
   */
  const heads: { ayah: number; head: string }[] = [];
  for (const w of expected) {
    const last = heads[heads.length - 1];
    if (!last || last.ayah !== w.ayah) heads.push({ ayah: w.ayah, head: w.uthmani });
    else if (last.head.split(/\s+/).length < 4) last.head += ' ' + w.uthmani;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-6">
        <p className="text-center text-lg font-bold text-[var(--q-ink)]">
          {hint ? hint.text : 'شوف وين وقفت 🌿'}
        </p>
        <p className="mt-1 text-center text-[0.82rem] text-[var(--q-mute)]">
          {hint ? 'التسجيل موقوف حتى تكمل' : 'اضغط الآية لتسمعها'}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {heads.map((a) => {
            const on = chosen === a.ayah;
            return (
              <li key={a.ayah}>
                <button
                  type="button"
                  onClick={() => onChoose(a.ayah)}
                  className={`tap flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-right transition ${
                    on
                      ? 'border-[var(--q-accent)] bg-[var(--q-accent-soft)]'
                      : 'border-[var(--q-line)] bg-white hover:border-[#cfe0d5]'
                  }`}
                >
                  <span className="shrink-0 text-[0.74rem] font-bold text-[var(--q-mute)]">
                    {toArabic(a.ayah)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-amiri)] text-lg text-[var(--q-ink)]">
                    {a.head}…
                  </span>
                  <span aria-hidden className="shrink-0 text-[var(--q-accent)]">
                    {on ? '🔊' : '▶'}
                  </span>
                </button>

                {on && hint?.kind === 'REVEAL' && (
                  <p className="mt-1 rounded-xl bg-[var(--q-accent-soft)] px-4 py-2 font-[family-name:var(--font-amiri)] text-xl text-[var(--q-accent)]">
                    {hint.words.join(' ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {chosen !== null && (
          <p className="mt-3 text-center text-[0.78rem] text-[var(--q-mute)]">
            اضغطها مرة ثانية لو تبي أوائل كلماتها
          </p>
        )}
      </div>

      {/* ⚠️ زرٌّ واحد بارز: «أكمل». وكان بجانبه «انتهيت» بنفس الحجم
          فقُرئت «خلصت من السماع» وهي تعني «أنهِ الجلسة» — فقطعت
          التسميع مرتين على الطالبة. الآن نصٌّ صغير لا زرٌّ منافس،
          وعبارتُه صريحة في أنها تُنهي التسميع كله. */}
      <button
        type="button"
        onClick={onResume}
        className="tap w-full rounded-2xl bg-[var(--q-accent)] px-4 py-5 text-lg font-bold text-white"
      >
        🎙️ أكمل التسميع من وين وقفت
      </button>

      <button
        type="button"
        onClick={onDone}
        className="tap mx-auto text-[0.82rem] font-bold text-[var(--q-mute)] underline underline-offset-4"
      >
        أنهِ التسميع واعرض النتيجة
      </button>
    </div>
  );
}

// ── النتيجة ────────────────────────────────────────────────

function Result({
  result,
  onAgain,
  diag,
}: {
  result: FinishResult;
  onAgain: () => void;
  /** تشخيص القطع — للقياس أثناء البناء، لا تراه الطالبة. */
  diag: ChunkDiag[];
}) {
  const v = result.verdict;

  if (!result.usable)
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-8 text-center">
          <p className="text-xl font-extrabold text-[var(--q-ink)]">{v.headline}</p>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--q-mute)]">{v.detail}</p>
        </div>
        {/* ⚠️ لا درجة، ولا قائمة أخطاء، ولا خصم إتقان — عطلٌ تقني لا حفظ ناقص */}
        <button
          type="button"
          onClick={onAgain}
          className="tap rounded-2xl bg-[var(--q-accent)] px-6 py-5 text-lg font-extrabold text-white"
        >
          🎙️ أعد التسميع
        </button>
      </div>
    );

  const mastered = result.summary.matched;
  const total = result.summary.expectedWords;
  const unsure = result.unsure ?? [];
  /** ⚠️ لا يظهر إلا لمن أضاف `?diag=1` عمدًا — الطالبة لا تراه أبدًا. */
  const showDiag =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('diag') === '1';

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-8 text-center">
        <p className="text-2xl font-extrabold text-[var(--q-ink)]">{v.headline}</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--q-mute)]">{v.detail}</p>
      </div>

      {showDiag && diag.length > 0 && (
        <details
          open
          className="rounded-2xl border border-dashed border-[var(--q-line)] bg-[#fbfbf9] p-3 text-[0.75rem]"
        >
          <summary className="cursor-pointer font-bold text-[var(--q-mute)]">
            تشخيص تقني ({diag.length} {diag.length === 1 ? 'قطعة' : 'قطع'})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-right" dir="rtl">
              <thead className="text-[var(--q-mute)]">
                <tr>
                  <th className="p-1">#</th>
                  <th className="p-1">ثوانٍ</th>
                  <th className="p-1">قُطعت عند</th>
                  <th className="p-1">الحال</th>
                  <th className="p-1">نقاء</th>
                  <th className="p-1">ثقة</th>
                  <th className="p-1">كلمات</th>
                  <th className="p-1">عوارض</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {diag.map((d) => (
                  <tr key={d.index} className="border-t border-[var(--q-line)]">
                    <td className="p-1">{d.index + 1}</td>
                    <td className="p-1">{d.seconds}</td>
                    <td className="p-1">{d.atSilence ? 'سكتة' : '⚠️ حدّ تقني'}</td>
                    <td className="p-1">{d.status}</td>
                    <td className="p-1">{d.snr ?? '—'}</td>
                    <td className="p-1">{d.confidence?.toFixed(2) ?? '—'}</td>
                    <td className="p-1">{d.tokens}</td>
                    <td className="p-1">{d.artifactsRemoved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[var(--q-mute)]">
              متوقَّع {result.summary.expectedWords} · مسموع{' '}
              {diag.reduce((n, d) => n + d.tokens, 0)} · مطابق {result.summary.matched} · مؤكَّد{' '}
              {result.summary.confirmedErrors} · غير مؤكَّد {result.summary.uncertain}
            </p>
          </div>
        </details>
      )}

      <div className="rounded-2xl border border-[var(--q-line)] bg-[#f5faf6] p-4">
        <p className="text-[0.9rem] font-bold text-[var(--q-accent)]">✅ مواضع متقنة</p>
        <p className="mt-1 text-[0.85rem] text-[var(--q-mute)]">
          {toArabic(mastered)} كلمة من {toArabic(total)}
        </p>
      </div>

      {/* ⚠️ الفراغ يقلق أكثر من الخبر: لو قلنا «٤ من ٦» وسكتنا، بقي
          السؤال «وين الاثنتان؟» بلا جواب. فكل كلمة لم تُحتسب متقنةً
          يُقال عنها شيء — إما خطأ مؤكَّد، وإما أننا لم نتأكد. */}
      {unsure.length > 0 && (
        <div className="rounded-2xl border border-[var(--q-line)] bg-[#faf9f4] p-4">
          <p className="text-[0.9rem] font-bold text-[var(--q-ink)]">
            🌿 ما قدرت أتأكد
          </p>
          <p className="mt-1 text-[0.83rem] leading-relaxed text-[var(--q-mute)]">
            {unsure.length === 1 ? 'فيه موضع' : `فيه ${toArabic(unsure.length)} مواضع`} ما
            وصلني واضحًا — يمكن الصوت أو الميكروفون.{' '}
            <strong className="text-[var(--q-ink)]">وما حسبته عليك.</strong>
            {/* ⚠️ العدد وحده، ولا تُذكر الكلمات.
                جُرّب ذكرُها فقُرئت قائمةَ اتهامٍ ناعمة: «هذي ما تأكّد
                منها» تصير عند القارئ «يمكن أخطأتُ فيها» — وهي مواضع
                لم يُتَّهم فيها أصلًا. فالإخبار بلا تسمية أرفق: يعرف
                أن ثمّة ما لم يصل، ولا يُوسوَس في حفظٍ صحيح. */}
          </p>
        </div>
      )}

      {result.mistakes.length > 0 && (
        <div className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-4">
          <p className="mb-3 text-[0.9rem] font-bold text-[var(--q-ink)]">🌱 نراجعها معًا</p>
          <ul className="flex flex-col gap-2">
            {result.mistakes.map((m, i) => (
              <li key={i} className="rounded-xl bg-[#faf8f3] px-3 py-2">
                <p className="text-[0.78rem] text-[var(--q-mute)]">
                  {mistakeLabel(m.kind)}
                  {m.ayah !== null ? ` · الآية ${toArabic(m.ayah)}` : ''}
                </p>
                {/* الكلمة المتوقَّعة إن وُجدت، وإلا فما سُمع — ولا تبقى
                    البطاقة فارغة في الزيادة والتكرار. */}
                {(m.words.length > 0 || (m.heard?.length ?? 0) > 0) && (
                  <p className="font-[family-name:var(--font-amiri)] text-lg text-[var(--q-ink)]">
                    {m.words.length > 0 ? m.words.join(' ') : (m.heard ?? []).join(' ')}
                  </p>
                )}
                {/* في الاستبدال نُظهر ما سُمع أيضًا: بلا هذا تقرأ الطالبة
                    «هنا كلمة غير المتوقَّعة» ولا تعرف ما الذي سُمع مكانها،
                    فلا تدري أخطأت هي أم أخطأ السمع. */}
                {m.kind === 'SUBSTITUTION' && (m.heard?.length ?? 0) > 0 && (
                  <p className="mt-0.5 text-[0.8rem] text-[var(--q-mute)]">
                    وصلني:{' '}
                    <span className="font-[family-name:var(--font-amiri)] text-[1rem]">
                      {(m.heard ?? []).join(' ')}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onAgain}
          className="tap flex-1 rounded-2xl bg-[var(--q-accent)] px-5 py-4 text-base font-extrabold text-white"
        >
          🎙️ سمّع مرة ثانية
        </button>
        {result.weakSpots.length > 0 && (
          <Link
            href={`/quran/review`}
            className="tap flex-1 rounded-2xl border-2 border-[var(--q-line)] px-5 py-4 text-center text-base font-bold text-[var(--q-ink)]"
          >
            🔄 راجع المواضع
          </Link>
        )}
      </div>

      {/*
        باب الحديقة من آخر التسميع.
        ⚠️ وموضعه في الذيل مقصود: التسميع هو العمل، والحديقة أثره.
        ولو وُضع في الأعلى لسابق النتيجةَ نفسها على عين القارئ.
        وهنا يأتي في حينه: قرأتْ نتيجتها، فتُدعى لترى ما صنعتْه.
      */}
      <div className="mt-1 border-t border-[var(--q-line)] pt-4">
        <Link
          href="/quran/garden"
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--q-accent)] px-5 py-4 text-center text-base font-extrabold text-white"
        >
          🌱 ازرع حديقتك
        </Link>
        {gardenLine(result.garden) && (
          <p className="mt-2 text-center text-[0.8rem] font-bold text-[var(--q-mute)]">
            {gardenLine(result.garden)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── مساعدات ────────────────────────────────────────────────

function joinParts(parts: Float32Array[]): Float32Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function unusable(detail: string): FinishResult {
  return {
    usable: false,
    verdict: { level: 'UNJUDGED', headline: 'ما قدرت أتأكد 🌿', detail },
    summary: { expectedWords: 0, matched: 0, confirmedErrors: 0, uncertain: 0 },
    mistakes: [],
    unsure: [],
    weakSpots: [],
  };
}

/** ⚠️ رسائل بلغة الطالبة — لا رموز خطأ ولا مصطلحات مزوّد. */
/**
 * لماذا لم نستطع الحكم — بلغة الطالبة، ومن قياسٍ لا من تخمين.
 *
 * ⚠️ ونقاء الصوت (SNR) **يشرح** الفشل ولا **يسبّبه**: قِيس تسجيلٌ عند
 * ٢١ ومرّ سليمًا تمامًا، فلو جعلناه سببًا للرفض لمنعنا تسميعًا صحيحًا.
 * فلا يُذكر إلا بعد أن يفشل الحكم لسببٍ آخر.
 */
function whyUnusable(statuses: string[], snr: number | null, reason?: string | null): string {
  const has = (s: string) => statuses.indexOf(s) !== -1;

  // ⚠️ سببٌ يخصّ المحتوى لا الصوت: يُقدَّم على كل تشخيصٍ صوتي
  if (reason === 'NOT_THIS_PASSAGE')
    return 'ما وصلتني تلاوة لهذي الآيات. تأكد إنك تسمّع المقطع المطلوب 🌿';

  if (has('NOISE') || (snr !== null && snr < QUIET_ENOUGH_SNR))
    return 'يبدو فيه ضجّة حواليك. جرّب في مكان أهدأ 🌿';
  if (has('SILENCE')) return 'ما وصلني صوتك. قرّب الميكروفون شوي وجرّب.';
  if (has('NO_SPEECH')) return 'ما قدرت أميّز التلاوة. اقرأ بصوت أوضح شوي.';
  if (has('PROVIDER_ERROR')) return 'صار خلل مؤقت. جرّب مرة ثانية بعد لحظة.';
  return 'الصوت ما كان واضحًا كفاية عشان أحكم على التسميع.';
}

/**
 * دون هذا النقاء **نرجّح** أن الضجّة هي السبب.
 *
 * ⚠️ ونقاء الصوت مقياسٌ ضعيف عندنا، والقياس نفسه أظهر ضعفه:
 *
 *   هادئ    : ٢٨٫٠ · ٢٩٫٠ · ٣١٫١ · ٣٢٫٠ · ٣٢٫٨   (ثقة ٠٫٨٢–٠٫٩١)
 *   تلفزيون : ٢١٫٠                                (ثقة ٠٫٨٩)
 *   تلفزيون أقرب : ٢٦٫٩                           (ثقة ٠٫٧٧)
 *
 * فالضجّة **الأقرب** أعطت نقاءً **أعلى** من الأبعد — والمقياس لا يفصل.
 * والثقة تنزل بانتظام مع الضجّة، لكن مدياتها تتداخل مع الهادئ أيضًا
 * (٠٫٨٢ هادئ مقابل ٠٫٨٩ بضجّة)، فلا هي فاصلة.
 *
 * ولهذا يبقى الرقم **تخمينًا يشرح فشلًا وقع**، لا حكمًا يمنع تسميعًا.
 * والفصل الحقيقي ينتظر قياسًا أوسع على أصوات أطفال في صفوف حقيقية.
 */
const QUIET_ENOUGH_SNR = 25;

function serverMessage(code?: string): string {
  switch (code) {
    case 'SIGN_IN_REQUIRED':
      return 'التسميع الذكي يحتاج تسجيل دخول. القراءة والاستماع تبقى مفتوحة للجميع.';
    case 'RATE_LIMITED':
      return 'سمّعت كثيرًا في وقت قصير — استرِح دقيقة ونكمل.';
    case 'PROVIDER_NOT_CONFIGURED':
      return 'التسميع الذكي غير متاح الآن. جرّب بعد قليل.';
    case 'AUDIO_TOO_LONG':
    case 'TOO_LONG':
      return 'التسجيل كان طويلًا. جرّب مقطعًا أقصر.';
    case 'TOO_SHORT':
      return 'التسجيل كان قصيرًا جدًا.';
    case 'NOT_WAV':
    case 'BAD_FORMAT':
      return 'صار خلل في التسجيل على هذا الجهاز.';
    default:
      return 'الصوت ما كان واضحًا كفاية عشان أحكم على التسميع.';
  }
}

function captureMessage(e: unknown): string {
  if (e instanceof CaptureFailure) {
    switch (e.code) {
      case 'PERMISSION_DENIED':
        return 'ما وصلني إذن الميكروفون. اسمح به من إعدادات المتصفح ثم جرّب.';
      case 'NO_MICROPHONE':
        return 'ما لقيت ميكروفونًا على هذا الجهاز.';
      case 'NOT_SUPPORTED':
        return 'هذا المتصفح ما يدعم التسجيل. جرّب من متصفح آخر.';
      default:
        return 'انقطع التسجيل. نبدأ من جديد؟';
    }
  }
  return 'صار خلل غير متوقع. نجرّب مرة ثانية؟';
}
