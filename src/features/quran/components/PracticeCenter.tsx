'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ayah, Reciter, Segment } from '../types';
import {
  ACTIVITY_ICON,
  ACTIVITY_LABEL,
  buildSession,
  type ActivityPerformance,
  type Question,
} from '../engine/activities';
import { attemptQuality, sessionQuality, type AttemptResult } from '../engine/review';
import { seedFrom } from '../engine/random.mjs';
import { ayahsForActivities } from '../engine/basmala';
import {
  finishSession,
  getActivityPerformance,
  recordAttempt,
  recordEvent,
} from '../data/practice';
import { toArabic } from '../engine/numerals';

/**
 * «تدرّب على حفظك» — حصة قصيرة من أربعة تدريبات.
 *
 * ⚠️ الفصل البصري قاعدة لا تجميل: الخيار الخاطئ هنا **كلام قرآني صحيح
 * في غير موضعه**. فالنص القرآني وحده يُعرض بخط المصحف على أرضية
 * بيضاء، والخيارات في بطاقات رمادية بخط الواجهة (`.answer-card`).
 *
 * ⚠️ ولا مؤقّت ولا عدّ تنازلي. الوقت ليس مقياس صعوبة.
 *
 * ⚠️ ولا صوت فوز صاخب ولا مؤثرات فوق النص. التقدير يظهر بعد النشاط.
 */
export default function PracticeCenter({
  ayahs,
  segment,
  reciter,
  onPlayAyah,
}: {
  ayahs: Ayah[];
  segment: Segment;
  reciter: Reciter;
  /** التشغيل يمرّ بمحرك الصوت نفسه — لا مشغّل ثانٍ لهذا القسم. */
  onPlayAyah: (ayah: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [hint, setHint] = useState<0 | 1 | 2 | 3>(0);
  const [done, setDone] = useState(false);
  const results = useRef<AttemptResult[]>([]);

  const q = questions?.[index] ?? null;

  const start = useCallback(async () => {
    let perf: ActivityPerformance = {};
    try {
      perf = await getActivityPerformance(segment);
    } catch {
      /* بلا سجل نبدأ بترتيب محايد */
    }
    // بذرة من المقطع واليوم: الحصة ثابتة داخل اليوم فلا تتبدّل تحت يد
    // الطالبة، وتتجدّد غدًا فلا تُحفظ الأسئلة بدل النص.
    const seed = seedFrom(
      segment.surah,
      segment.from_ayah,
      segment.to_ayah,
      new Date().toISOString().slice(0, 10)
    );
    // ⚠️ الأنشطة تعمل على النص **كما يُعرض** لا كما يُخزَّن.
    //
    // صيغة المصدر تُلحق البسملة بالآية الأولى، فلولا فصلها هنا لظهرت
    // في خيارات «اسمع وحدّد» ملتصقة بالآية بينما الصوت يتلو الآية
    // وحدها، ولجاز أن تُخفى كلمة منها في «الكلمة المفقودة».
    // ونفصلها بنفس الدالة التي تفصلها في العرض، فلا يفترق الاثنان.
    const forActivities = ayahsForActivities(ayahs);
    setQuestions(buildSession({ segment: forActivities }, perf, seed, 4));
    setIndex(0);
    setPicked(null);
    setWrongIds([]);
    setHint(0);
    setDone(false);
    results.current = [];
  }, [ayahs, segment]);

  useEffect(() => {
    // المقطع تغيّر — نغلق الحصة القديمة بدل أن نسأل عن آيات غادرناها
    setOpen(false);
    setQuestions(null);
    setDone(false);
  }, [segment.surah, segment.from_ayah, segment.to_ayah]);

  function choose(id: string) {
    if (!q || picked) return;
    const isRight = Boolean(q.choices.find((c) => c.id === id)?.correct);

    if (!isRight) {
      setWrongIds((w) => (w.includes(id) ? w : [...w, id]));
      // لا نُنهي المحاولة عند الخطأ: تُتاح إعادة المحاولة مع تلميح
      setHint((h) => (h < 2 ? ((h + 1) as 1 | 2) : h));
      return;
    }

    setPicked(id);
    const attempts = wrongIds.length + 1;
    const r: AttemptResult = { correct: true, attempts, hintLevel: hint };
    results.current.push(r);
    void recordAttempt({
      segment,
      ayah: q.ayah,
      activity: q.kind,
      firstTry: attempts === 1 && hint === 0,
      attempts,
      hintLevel: hint,
    });
  }

  function reveal() {
    if (!q || picked) return;
    setHint(3);
    const correct = q.choices.find((c) => c.correct);
    if (correct) setPicked(correct.id);
    const attempts = wrongIds.length + 1;
    results.current.push({ correct: true, attempts, hintLevel: 3 });
    void recordAttempt({
      segment,
      ayah: q.ayah,
      activity: q.kind,
      firstTry: false,
      attempts,
      hintLevel: 3,
    });
  }

  async function next() {
    if (!questions) return;
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      setWrongIds([]);
      setHint(0);
      return;
    }
    setDone(true);
    const quality = sessionQuality(results.current);
    await finishSession(segment, quality);
    if (quality === 3) void recordEvent('review_without_hint', segment);
  }

  // ── مغلق ──
  if (!open)
    return (
      <section className="mb-5">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void start();
          }}
          className="tap flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-4 text-right transition hover:border-[#cfe0d5]"
        >
          <span>
            <span className="block font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">
              ✨ تدرّب على حفظك
            </span>
            <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
              أربعة تدريبات قصيرة على هذا المقطع
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
            ←
          </span>
        </button>
      </section>
    );

  // ── انتهت الحصة ──
  if (done)
    return (
      <section className="practice-card mb-5 px-5 py-8 text-center">
        <p className="mb-2 text-3xl" aria-hidden>
          🌿
        </p>
        <p className="font-[family-name:var(--font-cairo)] text-lg font-extrabold text-[var(--q-ink)]">
          أحسنتِ، أنهيتِ التدريب
        </p>
        <p className="mt-1 text-[0.85rem] text-[var(--q-mute)]">
          {results.current.every((r) => attemptQuality(r) === 3)
            ? 'كل الإجابات من أول محاولة وبلا تلميح ✨'
            : 'كل مراجعة تثبّت أكثر 🌱'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => void start()}
            className="tap rounded-2xl bg-[var(--q-accent)] px-5 py-2.5 text-[0.9rem] font-extrabold text-white"
          >
            تدريب آخر
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="tap rounded-2xl border border-[var(--q-line)] bg-white px-5 py-2.5 text-[0.9rem] font-bold text-[var(--q-ink)]"
          >
            إغلاق
          </button>
        </div>
      </section>
    );

  if (!questions)
    return (
      <section className="practice-card mb-5 px-5 py-8 text-center text-[var(--q-mute)]">
        جارٍ التجهيز…
      </section>
    );

  if (!q)
    return (
      <section className="practice-card mb-5 px-5 py-8 text-center">
        <p className="text-[var(--q-mute)]">
          هذا المقطع قصير على التدريب — اختاري مدى أوسع قليلًا 🌱
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap mt-4 rounded-2xl border border-[var(--q-line)] bg-white px-5 py-2.5 text-[0.88rem] font-bold"
        >
          إغلاق
        </button>
      </section>
    );

  const answered = picked !== null;

  return (
    <section className="practice-card mb-5 p-5">
      {/* رأس الحصة */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[0.82rem] font-bold text-[var(--q-ink)]">
          <span aria-hidden className="ml-1">
            {ACTIVITY_ICON[q.kind]}
          </span>
          {ACTIVITY_LABEL[q.kind]}
        </p>
        <p className="text-[0.76rem] text-[var(--q-mute)]">
          {toArabic(index + 1)} من {toArabic(questions.length)}
        </p>
      </div>

      {/* ── النص القرآني — بخط المصحف على أرضية بيضاء ── */}
      <div className="mb-4 rounded-[1rem] bg-white px-4 py-6">
        <QuestionPrompt q={q} onPlay={() => onPlayAyah(q.ayah)} reciter={reciter} />
      </div>

      {/* ── الخيارات — فاصل صريح ثم بطاقات بخط الواجهة ── */}
      <p className="mb-2 text-[0.76rem] font-bold text-[var(--q-mute)]">
        {q.kind === 'missing_word' ? 'اختاري الكلمة' : 'اختاري الإجابة'}
      </p>
      <div className="grid gap-2">
        {q.choices.map((c) => {
          const isPicked = picked === c.id;
          const isWrong = wrongIds.includes(c.id);
          const showRight = answered && c.correct;
          return (
            <button
              key={c.id}
              type="button"
              disabled={answered}
              onClick={() => choose(c.id)}
              aria-pressed={isPicked}
              className={`answer-card tap ${showRight ? 'is-right' : ''} ${
                isWrong ? 'is-wrong' : ''
              }`}
            >
              {c.text}
            </button>
          );
        })}
      </div>

      {/* ── التلميح والخطأ — بلغة مشجّعة ── */}
      {!answered && wrongIds.length > 0 ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3">
          <p className="text-[0.85rem] font-bold text-[var(--q-ink)]">
            قريب 🌱 حاولي مرة ثانية
          </p>
          {hint >= 2 ? (
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[var(--q-mute)]">
              تلميح: الإجابة تبدأ بـ«
              <span className="font-bold text-[var(--q-accent)]">
                {firstLetterOf(q)}
              </span>
              »
            </p>
          ) : null}
          <button
            type="button"
            onClick={reveal}
            className="tap mt-2 text-[0.78rem] font-bold text-[var(--q-mute)] underline underline-offset-4"
          >
            أرِني الإجابة
          </button>
        </div>
      ) : null}

      {/* ── بعد الإجابة ── */}
      {answered ? (
        <div className="mt-4">
          <AfterAnswer q={q} hint={hint} onPlay={() => onPlayAyah(q.ayah)} />
          <button
            type="button"
            onClick={() => void next()}
            className="tap mt-3 w-full rounded-2xl bg-[var(--q-accent)] px-5 py-3 text-[0.95rem] font-extrabold text-white"
          >
            {index + 1 < questions.length ? 'التالي' : 'إنهاء التدريب'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** أول حرف من الإجابة الصحيحة — تلميح المستوى الثاني. */
function firstLetterOf(q: Question): string {
  const correct = q.choices.find((c) => c.correct)?.text ?? '';
  return correct.trim().charAt(0);
}

function QuestionPrompt({
  q,
  onPlay,
  reciter,
}: {
  q: Question;
  onPlay: () => void;
  reciter: Reciter;
}) {
  if (q.kind === 'missing_word')
    return (
      <p className="ayat" dir="rtl" lang="ar">
        {q.words.map((w, i) =>
          i === q.blankIndex ? (
            // ⚠️ الفراغ في موضع الكلمة تمامًا — الآية لم تُقطَّع ولم تُرتَّب
            <span key={i} className="blank" aria-label="كلمة ناقصة" />
          ) : (
            <span key={i}>{w} </span>
          )
        )}
      </p>
    );

  if (q.kind === 'complete_ayah')
    return (
      <>
        <p className="ayat" dir="rtl" lang="ar">
          {q.head} …
        </p>
        <p className="mt-2 text-center text-[0.8rem] text-[var(--q-mute)]">
          ما التكملة الصحيحة؟
        </p>
      </>
    );

  if (q.kind === 'next_ayah')
    return (
      <>
        <p className="ayat" dir="rtl" lang="ar">
          {q.promptText}
        </p>
        <p className="mt-2 text-center text-[0.8rem] text-[var(--q-mute)]">
          ما الآية التي تأتي بعدها؟
        </p>
      </>
    );

  // اسمع وحدّد — لا نص في البداية
  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onPlay}
        className="tap mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--q-accent)] text-2xl text-white"
        aria-label="تشغيل التلاوة"
      >
        <span aria-hidden>▶</span>
      </button>
      <p className="mt-3 text-[0.82rem] text-[var(--q-mute)]">
        استمعي ثم حدّدي الآية — بصوت {reciter.name_ar}
      </p>
    </div>
  );
}

function AfterAnswer({
  q,
  hint,
  onPlay,
}: {
  q: Question;
  hint: number;
  onPlay: () => void;
}) {
  const correct = q.choices.find((c) => c.correct)?.text ?? '';
  const full = q.kind === 'complete_ayah' ? `${q.head} ${correct}` : correct;

  return (
    <div className="rounded-[1rem] bg-white px-4 py-5">
      <p className="mb-2 text-center text-[0.8rem] font-bold text-[var(--q-accent)]">
        {hint >= 3 ? 'هذه هي الآية 🌱' : 'أحسنتِ ✨'}
      </p>
      {/* الآية كاملة من النص المرجعي بعد الإجابة */}
      <p className="ayat" dir="rtl" lang="ar">
        {full}
      </p>
      <button
        type="button"
        onClick={onPlay}
        className="tap mx-auto mt-3 block rounded-xl border border-[var(--q-line)] px-4 py-2 text-[0.82rem] font-bold text-[var(--q-ink)]"
      >
        🎧 استمعي إليها
      </button>
    </div>
  );
}
