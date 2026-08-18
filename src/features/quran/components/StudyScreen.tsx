'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Ayah, Reciter, StudyMode, Surah } from '../types';
import { HIDE_LEVELS, LEVEL_LABEL, type HideLevel } from '../engine/hide';
import { opensWithSpokenBasmala } from '../engine/basmala';
import { getSegmentProgress, isGuest, saveLastPosition, saveSegmentProgress } from '../data/progress';
import AyahView from './AyahView';
import AudioBar from './AudioBar';
import { toArabic } from './ResumeCard';

/**
 * شاشة الدراسة — محرك التعلّم الوحيد في القسم.
 *
 * يستعمله القسم العام والمنهج الدراسي معًا. لا توجد نسخة ثانية من
 * نظام الحفظ ولن توجد: درس المنهج ما هو إلا مقطع (سورة + مدى) يُمرَّر
 * إلى هذه الشاشة نفسها.
 *
 * ثلاثة أوضاع: قراءة، استماع، حفظ. والحفظ يمشي في أربع خطوات
 * صريحة — استمع، كرّر، الحفظ الخفي، حاول من الذاكرة — لأن الطالب
 * يحتاج أن يرى أين هو من الطريق لا أن يُلقى في تمرين.
 */
export default function StudyScreen({
  surah,
  ayahs,
  from,
  to,
  reciter,
  backHref,
  backLabel,
  lessonTitle,
}: {
  surah: Surah;
  ayahs: Ayah[];
  from: number;
  to: number;
  reciter: Reciter;
  backHref: string;
  backLabel: string;
  lessonTitle?: string;
}) {
  const [mode, setMode] = useState<StudyMode>('read');
  const [hideLevel, setHideLevel] = useState<HideLevel>(0);
  const [activeAyah, setActiveAyah] = useState<number | null>(null);
  const [guest, setGuest] = useState(false);
  const segment = { surah: surah.number, from_ayah: from, to_ayah: to };

  // هل تُتلى بسملة قبل المقطع؟ يقرّره نصُّ الآيات لا المشغّل، ومن نفس
  // الدالة التي يعتمدها العرض — فلا تظهر البسملة مكتوبة ولا تُتلى،
  // ولا تُتلى ولا تُكتب.
  const withBasmala = opensWithSpokenBasmala(ayahs);

  // هل لمست الطالبة مستوى الإخفاء بنفسها؟
  //
  // تحميل التقدّم غير متزامن، وقد يصل بعد أن تكون قد ضغطت مستوى. فلولا
  // هذا الحارس لدهس الوصولُ المتأخرُ اختيارَها وقفز النص أمامها بلا سبب
  // تراه. اختيارها الصريح أحقّ دائمًا مما جاء من التخزين.
  const touched = useRef(false);

  useEffect(() => {
    // المقطع تغيّر: اختيار المقطع السابق لا يسري على الجديد
    touched.current = false;
    let alive = true;

    void saveLastPosition(surah.number, from);
    void isGuest().then((g) => {
      if (alive) setGuest(g);
    });
    void getSegmentProgress(surah.number, from, to).then((p) => {
      if (!alive || touched.current || !p) return;
      setHideLevel(Math.min(5, Math.max(0, p.hide_level)) as HideLevel);
    });

    return () => {
      alive = false;
    };
  }, [surah.number, from, to]);

  function changeHide(level: HideLevel) {
    touched.current = true;
    setHideLevel(level);
    void saveSegmentProgress(surah.number, from, to, {
      hide_level: level,
      status: level >= 5 ? 'memorized' : 'learning',
    });
  }

  const prevStart = Math.max(1, from - (to - from + 1));
  const nextStart = to + 1;
  const hasPrev = from > 1;
  const hasNext = to < surah.ayah_count;
  const span = to - from + 1;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-5">
      <nav className="mb-5 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> {backLabel}
        </Link>
        <Link
          href="/quran/source"
          className="tap text-[0.72rem] text-[var(--q-mute)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--q-accent)]"
        >
          مصدر النص
        </Link>
      </nav>

      <header className="mb-5 text-center">
        {lessonTitle ? (
          <p className="mb-1 text-[0.78rem] font-bold tracking-wide text-[var(--q-accent)]">
            {lessonTitle}
          </p>
        ) : null}
        <h1 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
          سورة {surah.name_ar}
        </h1>
        <p className="mt-1 text-[0.84rem] text-[var(--q-mute)]">
          {span === 1
            ? `الآية ${toArabic(from)}`
            : `الآيات ${toArabic(from)} – ${toArabic(to)}`}
        </p>
      </header>

      {/* ── الأوضاع ── */}
      <div
        role="tablist"
        aria-label="أوضاع الدراسة"
        className="mb-5 grid grid-cols-3 gap-1.5 rounded-2xl bg-[var(--q-accent-soft)] p-1.5"
      >
        {(
          [
            ['read', 'قراءة', '📖'],
            ['listen', 'استماع', '🎧'],
            ['memorize', 'حفظ', '🌱'],
          ] as const
        ).map(([m, label, icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`tap rounded-xl px-2 py-2.5 text-[0.9rem] font-extrabold transition ${
              mode === m
                ? 'bg-white text-[var(--q-ink)] shadow-[0_1px_4px_rgba(47,59,51,0.08)]'
                : 'text-[var(--q-mute)] hover:text-[var(--q-ink)]'
            }`}
          >
            <span aria-hidden className="ml-1">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* ── الحفظ: الخطوات ── */}
      {mode === 'memorize' && (
        <ol className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.76rem] font-bold text-[var(--q-mute)]">
          {['استمع', 'كرّر', 'الحفظ الخفي', 'حاول من الذاكرة'].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>←</span>}
              <span className={hideLevel > 0 && i >= 2 ? 'text-[var(--q-accent)]' : ''}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* ── النص ── */}
      <section className="mb-5 rounded-[1.5rem] border border-[var(--q-line)] bg-white px-4 py-8 sm:px-8">
        <AyahView
          ayahs={ayahs}
          hideLevel={mode === 'memorize' ? hideLevel : 0}
          activeAyah={activeAyah}
        />
      </section>

      {/* ── مستوى الإخفاء ── */}
      {mode === 'memorize' && (
        <section className="mb-5 rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="text-[0.82rem] font-bold text-[var(--q-ink)]">
              الحفظ الخفي
            </p>
            <p className="text-[0.78rem] text-[var(--q-accent)]">
              {LEVEL_LABEL[hideLevel]}
            </p>
          </div>
          <div className="flex gap-1.5">
            {HIDE_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => changeHide(lv)}
                aria-label={LEVEL_LABEL[lv]}
                aria-pressed={hideLevel === lv}
                className={`tap flex-1 rounded-xl border py-2.5 text-[0.85rem] font-extrabold transition ${
                  hideLevel === lv
                    ? 'border-[var(--q-accent)] bg-[var(--q-accent)] text-white'
                    : 'border-[var(--q-line)] bg-white text-[var(--q-mute)] hover:border-[#cfe0d5]'
                }`}
              >
                {toArabic(lv)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-[var(--q-mute)]">
            الكلمة المخفية تبقى في موضعها — اضغط عليها لتكشفها لحظة إذا احتجت.
          </p>

          {/* ── سمّع لي ──
              معطّل في المرحلة ١ ولم يُربط بأي تعرّف على الكلام بعد.
              يظهر مكانه محجوزًا حتى لا يتغيّر شكل الشاشة على الطالب
              حين يُفعَّل، وحتى تكون البنية جاهزة لاستقباله. */}
          <div className="mt-4 border-t border-[var(--q-line)] pt-4">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="tap flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--q-line)] px-4 py-3 text-[0.92rem] font-bold text-[#a9b8ac]"
            >
              <span aria-hidden>🎙️</span> سمّع لي
              <span className="rounded-full bg-[#f2f5f2] px-2 py-0.5 text-[0.68rem]">
                قريبًا
              </span>
            </button>
          </div>
        </section>
      )}

      {/* ── الصوت ── */}
      {(mode === 'listen' || mode === 'memorize') && (
        <section className="mb-5">
          <AudioBar
            reciter={reciter}
            segment={segment}
            onAyahChange={setActiveAyah}
            withBasmala={withBasmala}
            compact={false}
          />
        </section>
      )}

      {mode === 'read' && (
        <section className="mb-5">
          <AudioBar
            reciter={reciter}
            segment={segment}
            onAyahChange={setActiveAyah}
            withBasmala={withBasmala}
            compact
          />
        </section>
      )}

      {/* ── تلميح تسجيل الدخول — بلطف ومرة واحدة، وليس بابًا ── */}
      {guest && (
        <p className="mb-5 rounded-2xl bg-[var(--q-accent-soft)] px-4 py-3 text-center text-[0.8rem] leading-relaxed text-[var(--q-mute)]">
          تقدّمك محفوظ في هذا الجهاز.{' '}
          {/* inline-block مع حشو رأسي: يوسّع هدف اللمس على الجوال دون أن
              يكسر انسياب الجملة حوله. الرابط داخل نص، فلا يصلح أن نجعله
              كتلة كاملة بارتفاع ٤٤ بكسل. */}
          <Link
            href="/login"
            className="inline-block px-1 py-2 font-bold text-[var(--q-accent)] underline underline-offset-4"
          >
            سجّلي الدخول
          </Link>{' '}
          ليتبعك على كل أجهزتك.
        </p>
      )}

      {/* ── السابق / التالي ── */}
      {(hasPrev || hasNext) && (
        <nav className="flex items-center justify-between gap-3">
          {hasPrev ? (
            <Link
              href={`/quran/study/${surah.number}/${prevStart}/${from - 1}`}
              className="tap rounded-2xl border border-[var(--q-line)] bg-white px-5 py-3 text-[0.88rem] font-bold text-[var(--q-ink)] transition hover:border-[#cfe0d5]"
            >
              الآيات السابقة
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              href={`/quran/study/${surah.number}/${nextStart}/${Math.min(
                surah.ayah_count,
                nextStart + span - 1
              )}`}
              className="tap rounded-2xl border border-[var(--q-line)] bg-white px-5 py-3 text-[0.88rem] font-bold text-[var(--q-ink)] transition hover:border-[#cfe0d5]"
            >
              الآيات التالية
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
