'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Ayah, Reciter } from '../types';
import { toArabic } from '../engine/numerals';
import { buildExpected } from '../engine/alignment';
import { nextHint, type Hint, type HintLevel } from '../engine/hints';
import type { MasteryLevel } from '../engine/grading';
import { SESSION_TUNING, splitIntoChunks } from '../engine/session';
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

type Mistake = { kind: string; surah: number; ayah: number | null; words: string[] };
type Verdict = { level: MasteryLevel; headline: string; detail: string };
type FinishResult = {
  usable: boolean;
  verdict: Verdict;
  summary: { expectedWords: number; matched: number; confirmedErrors: number; uncertain: number };
  mistakes: Mistake[];
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
  const [result, setResult] = useState<FinishResult | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorder = useRef<Recorder | null>(null);
  /** أجزاء التسجيل — تنقطع عند كل تلميح صوتي ثم تُوصل. */
  const parts = useRef<Float32Array[]>([]);
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
        setPhase('setup');
        setNote('توقّف التسميع لأن الشاشة أُغلقت أو خرجتِ من الصفحة. نبدأ من جديد؟');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // ── نبض السكوت — في وضع التدريب وحده ─────────────────────
  useEffect(() => {
    if (phase !== 'reciting') return;
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      if (mode !== 'train') return;
      const r = recorder.current;
      if (!r?.isRecording) return;
      setQuiet(r.liveRms(SESSION_TUNING.strugglingSec) < SESSION_TUNING.silenceRms);
    }, 700);
    return () => window.clearInterval(id);
  }, [phase, mode]);

  useEffect(() => {
    return () => {
      void recorder.current?.abort();
      audio.current?.pause();
    };
  }, []);

  // ── بدء التسجيل — داخل لمسة المستخدم، شرط iOS ────────────
  const begin = useCallback(async (fresh: boolean) => {
    setNote(null);
    setHint(null);
    setQuiet(false);
    try {
      const r = new Recorder();
      await r.start();
      recorder.current = r;
      if (fresh) {
        parts.current = [];
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
      if (cap.samples.length) parts.current.push(cap.samples);
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
  async function askForHelp() {
    const position = 0; // موضعها المرجَّح — يُحسَب من المطابقة بعد الجلسة
    const h = nextHint(expected, position, hintLevel);
    if (!h) return;

    helpUsed.current = true;
    setHintLevel((l) => Math.min(3, l + 1) as HintLevel);

    if (h.kind === 'PLAY') {
      await pauseCapture();
      setPhase('paused');
      setHint(h);
      const el = audio.current ?? new Audio();
      audio.current = el;
      el.src = ayahAudioUrl(reciter, h.surah, h.ayah);
      void el.play().catch(() => setNote('تعذّر تشغيل التلاوة — تأكدي من الإنترنت.'));
      return;
    }

    setHint(h);
  }

  // ── إنهاء الجلسة ─────────────────────────────────────────
  async function finish() {
    await pauseCapture();
    audio.current?.pause();
    setPhase('processing');
    setHint(null);
    setQuiet(false);

    const samples = joinParts(parts.current);
    parts.current = [];

    if (samples.length < TARGET_SAMPLE_RATE * 1) {
      setResult(unusable('التسجيل كان قصيرًا جدًا.'));
      setPhase('result');
      return;
    }

    try {
      const chunks = splitIntoChunks(samples, TARGET_SAMPLE_RATE);
      const tokens: { text: string; confidence?: number }[] = [];
      let at = 0;

      for (const chunk of chunks) {
        const wav = encodeWav(chunk.samples, TARGET_SAMPLE_RATE);
        const res = await fetch(
          `/api/quran/recite?surah=${surah.number}&from=${from}&to=${to}&at=${at}`,
          { method: 'POST', body: wav }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setResult(unusable(serverMessage(j.error)));
          setPhase('result');
          return;
        }
        const j = await res.json();
        for (const t of j.tokens ?? []) tokens.push({ text: t.text, confidence: t.confidence });
        at = Math.min(expected.length - 1, tokens.length);
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
          chunks: chunks.length,
          seconds: samples.length / TARGET_SAMPLE_RATE,
          tokens,
        }),
      });
      if (!done.ok) {
        const j = await done.json().catch(() => ({}));
        setResult(unusable(serverMessage(j.error)));
      } else {
        setResult((await done.json()) as FinishResult);
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
          canHint={mode === 'train' && hintLevel < 3}
          onHelp={() => void askForHelp()}
          onDone={() => void finish()}
        />
      )}

      {phase === 'paused' && (
        <Paused hint={hint} onResume={() => void begin(false)} onDone={() => void finish()} />
      )}

      {phase === 'processing' && (
        <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-10 text-center">
          <p className="text-lg font-bold text-[var(--q-ink)]">جاري مراجعة تسميعك… 🌿</p>
          <p className="mt-2 text-[0.85rem] text-[var(--q-mute)]">لحظات وتوصلك النتيجة</p>
        </div>
      )}

      {phase === 'result' && result && (
        <Result
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
        🎙️ ابدئي التسميع
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

        {/* ⚠️ لا نقول «أخطأتِ» — نحن نسمع سكوتًا لا خطأً */}
        {mode === 'train' && quiet && (
          <p className="mt-5 rounded-2xl bg-[#f2f7f3] px-4 py-3 text-base font-bold text-[var(--q-accent)]">
            خذي وقتك 🌱
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
      {hint && hint.kind === 'ENCOURAGE' && (
        <p className="text-center text-base font-bold text-[var(--q-accent)]">{hint.text}</p>
      )}

      <div className="flex gap-3">
        {mode === 'train' && (
          <button
            type="button"
            onClick={onHelp}
            disabled={!canHint}
            className="tap flex-1 rounded-2xl border-2 border-[var(--q-line)] px-4 py-4 text-base font-bold text-[var(--q-ink)] disabled:opacity-40"
          >
            💡 ساعديني
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
  onResume,
  onDone,
}: {
  hint: Hint | null;
  onResume: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-8 text-center">
        <p className="text-lg font-bold text-[var(--q-ink)]">
          {hint?.kind === 'PLAY' ? hint.text : 'استمعي ثم نكمل'}
        </p>
        {/* ⚠️ التسجيل موقوف الآن عن قصد: لو بقي شغّالًا لالتقط صوت
            القارئ وحُسب على الطالبة كأنها هي التي قالته. */}
        <p className="mt-2 text-[0.82rem] text-[var(--q-mute)]">
          التسجيل موقوف حتى ينتهي الصوت
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onResume}
          className="tap flex-1 rounded-2xl bg-[var(--q-accent)] px-4 py-4 text-base font-bold text-white"
        >
          🎙️ أكمل التسميع
        </button>
        <button
          type="button"
          onClick={onDone}
          className="tap rounded-2xl border-2 border-[var(--q-line)] px-5 py-4 text-base font-bold text-[var(--q-ink)]"
        >
          انتهيت
        </button>
      </div>
    </div>
  );
}

// ── النتيجة ────────────────────────────────────────────────

function Result({ result, onAgain }: { result: FinishResult; onAgain: () => void }) {
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
          🎙️ أعيدي التسميع
        </button>
      </div>
    );

  const mastered = result.summary.matched;
  const total = result.summary.expectedWords;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-8 text-center">
        <p className="text-2xl font-extrabold text-[var(--q-ink)]">{v.headline}</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--q-mute)]">{v.detail}</p>
      </div>

      <div className="rounded-2xl border border-[var(--q-line)] bg-[#f5faf6] p-4">
        <p className="text-[0.9rem] font-bold text-[var(--q-accent)]">✅ مواضع متقنة</p>
        <p className="mt-1 text-[0.85rem] text-[var(--q-mute)]">
          {toArabic(mastered)} كلمة من {toArabic(total)}
        </p>
      </div>

      {result.mistakes.length > 0 && (
        <div className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-4">
          <p className="mb-3 text-[0.9rem] font-bold text-[var(--q-ink)]">🌱 نراجعها معًا</p>
          <ul className="flex flex-col gap-2">
            {result.mistakes.map((m, i) => (
              <li key={i} className="rounded-xl bg-[#faf8f3] px-3 py-2">
                <p className="text-[0.78rem] text-[var(--q-mute)]">
                  الآية {m.ayah !== null ? toArabic(m.ayah) : '—'}
                </p>
                {m.words.length > 0 && (
                  <p className="font-[family-name:var(--font-amiri)] text-lg text-[var(--q-ink)]">
                    {m.words.join(' ')}
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
          🎙️ سمّعي مرة ثانية
        </button>
        {result.weakSpots.length > 0 && (
          <Link
            href={`/quran/review`}
            className="tap flex-1 rounded-2xl border-2 border-[var(--q-line)] px-5 py-4 text-center text-base font-bold text-[var(--q-ink)]"
          >
            🌱 راجعي المواضع
          </Link>
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
    weakSpots: [],
  };
}

/** ⚠️ رسائل بلغة الطالبة — لا رموز خطأ ولا مصطلحات مزوّد. */
function serverMessage(code?: string): string {
  switch (code) {
    case 'SIGN_IN_REQUIRED':
      return 'التسميع الذكي يحتاج تسجيل دخول. القراءة والاستماع تبقى مفتوحة للجميع.';
    case 'RATE_LIMITED':
      return 'سمّعتِ كثيرًا في وقت قصير — استريحي دقيقة ونكمل.';
    case 'PROVIDER_NOT_CONFIGURED':
      return 'التسميع الذكي غير متاح الآن. جرّبي بعد قليل.';
    case 'AUDIO_TOO_LONG':
    case 'TOO_LONG':
      return 'التسجيل كان طويلًا. جرّبي مقطعًا أقصر.';
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
        return 'ما وصلني إذن الميكروفون. اسمحي به من إعدادات المتصفح ثم جرّبي.';
      case 'NO_MICROPHONE':
        return 'ما لقيت ميكروفونًا على هذا الجهاز.';
      case 'NOT_SUPPORTED':
        return 'هذا المتصفح ما يدعم التسجيل. جرّبي من متصفح آخر.';
      default:
        return 'انقطع التسجيل. نبدأ من جديد؟';
    }
  }
  return 'صار خلل غير متوقع. نجرّب مرة ثانية؟';
}
