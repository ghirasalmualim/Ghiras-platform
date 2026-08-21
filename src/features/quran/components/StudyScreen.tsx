'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Ayah, Reciter, Segment, StudyMode, Surah } from '../types';
import { HIDE_LEVELS, LEVEL_LABEL, type HideLevel } from '../engine/hide';
import { opensWithSpokenBasmala } from '../engine/basmala';
import {
  getReciterId,
  getSegmentProgress,
  isGuest,
  saveLastPosition,
  saveReciterId,
  saveSegmentProgress,
} from '../data/progress';
import { getReciter } from '../engine/reciters';
import AyahView from './AyahView';
import PracticeCenter from './PracticeCenter';
import GoalPlanner from './GoalPlanner';
import AudioBar from './AudioBar';
import { toArabic } from '../engine/numerals';

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
  reciter: defaultReciter,
  reciters,
  backHref,
  backLabel,
  lessonTitle,
  segments: pageSegments,
  heading,
  subheading,
  prevHref,
  nextHref,
  nextSurah,
  prevSurah,
}: {
  surah: Surah;
  ayahs: Ayah[];
  from: number;
  to: number;
  /** القارئ الافتراضي — الحصري. */
  reciter: Reciter;
  /** القرّاء المفعَّلون، ليختار الطالب بينهم. */
  reciters: Reciter[];
  backHref: string;
  backLabel: string;
  lessonTitle?: string;
  /**
   * مقاطع الصفحة حين تُفتح صفحة مصحف تعبر أكثر من سورة.
   *
   * تُترك فارغة في الحالة المعتادة فيُبنى المقطع من (السورة، من، إلى)
   * كما كان. ووسّعنا الشاشة بدل أن نكتب لها نظيرة: كل ما بنيناه —
   * التكرار والإخفاء والتدريب والمراجعة — يعمل على كليهما بلا فرع.
   */
  segments?: Segment[];
  heading?: string;
  subheading?: string;
  prevHref?: string;
  nextHref?: string;
  /** السورة التالية — لتستمرّ القراءة بعد آخر آية. */
  nextSurah?: { number: number; name_ar: string; ayah_count: number };
  prevSurah?: { number: number; name_ar: string; ayah_count: number };
}) {
  const [mode, setMode] = useState<StudyMode>('read');
  const [hideLevel, setHideLevel] = useState<HideLevel>(0);
  const [activeAyah, setActiveAyah] = useState<number | null>(null);
  /**
   * الآية التي لمسها القارئ — تُعرض عليها خياراتُها.
   *
   * ⚠️ ولا يبدأ الصوت باللمسة وحدها. لمسةٌ عابرة على النصّ لا ينبغي
   * أن تُطلق تلاوةً في صفٍّ أو مجلس — فنسأل قبل أن نصوّت.
   */
  const [pickedAyah, setPickedAyah] = useState<number | null>(null);
  const [guest, setGuest] = useState(false);

  /**
   * القارئ المختار.
   *
   * ⚠️ لا يوجد محرك صوت ثانٍ للعفاسي: المحرك يستقبل القارئ **معطًى**
   * ويبني منه الروابط، فتبديل القارئ تبديلُ بيانات لا تبديلُ منطق.
   * كل خصائص الصوت — التكرار والنطاق والانتقال التلقائي والإيقاف —
   * تعمل مع أي قارئ بلا سطر إضافي.
   */
  const [reciter, setReciter] = useState<Reciter>(defaultReciter);

  /**
   * مقبض تشغيل آية مفردة، يملؤه `AudioBar`.
   *
   * مركز التدريب يستعمله في «اسمع وحدّد» فيمرّ بمحرك الصوت نفسه —
   * لا مشغّل ثانٍ لهذا النشاط، ولا احتمال لتداخل صوتين.
   */
  const playAyah = useRef<((ayah: number) => void) | null>(null);

  /**
   * مقبض «ابدأ من هذه الآية وأكمل» — لمن لمس آيةً في المصحف.
   *
   * ⚠️ منفصلٌ عن `playAyah` عمدًا: ذاك يُسمع آيةً مفردة ثم يقف، وهو
   * ما يحتاجه نشاط «اسمع وحدّد». ولو وحّدناهما لانقلب سؤال التدريب
   * إلى جوابٍ يُتلى كاملًا.
   */
  const playFrom = useRef<((ayah: number) => void) | null>(null);

  const segment = { surah: surah.number, from_ayah: from, to_ayah: to };
  /**
   * المقاطع المعروضة. الصفحة قد تكون أكثر من مقطع، والمدى مقطع واحد.
   * ويبقى `segment` مفتاحَ التقدّم والمراجعة — سطر واحد لكل ما يُفتح،
   * فلا تتشظّى حالة الطالبة على مقاطع الصفحة.
   */
  const segments = pageSegments ?? [segment];

  // هل تُتلى بسملة قبل المقطع؟ يقرّره نصُّ الآيات لا المشغّل، ومن نفس
  // الدالة التي يعتمدها العرض — فلا تظهر البسملة مكتوبة ولا تُتلى،
  // ولا تُتلى ولا تُكتب.
  // لكل مقطع بسملته: الصفحة العابرة تبدأ فيها سورة جديدة فتحتاجها
  const basmalaFlags = segments.map((sg) =>
    opensWithSpokenBasmala(ayahs.filter((a) => a.surah === sg.surah && a.ayah >= sg.from_ayah && a.ayah <= sg.to_ayah))
  );

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
    // القارئ المحفوظ — إن سقط الاختيار أو أُطفئ القارئ عاد الافتراضي
    void getReciterId().then((id) => {
      if (alive && id) setReciter(getReciter(id));
    });
    void getSegmentProgress(surah.number, from, to).then((p) => {
      if (!alive || touched.current || !p) return;
      setHideLevel(Math.min(5, Math.max(0, p.hide_level)) as HideLevel);
    });

    return () => {
      alive = false;
    };
  }, [surah.number, from, to]);

  function changeReciter(id: string) {
    setReciter(getReciter(id));
    void saveReciterId(id);
  }

  function changeHide(level: HideLevel) {
    touched.current = true;
    setHideLevel(level);
    void saveSegmentProgress(surah.number, from, to, {
      hide_level: level,
      status: level >= 5 ? 'memorized' : 'learning',
    });
  }

  const span = to - from + 1;
  const prevStart = Math.max(1, from - span);
  const nextStart = to + 1;

  /**
   * التنقّل يعبر حدود السورة.
   *
   * ⚠️ كان يقف عند آخر آية فيختفي الزرّ — وهو ما شكت منه صاحبة
   * المنصة: «إذا خلصت السورة ما يطلع لي التالي، خلّه يطلع حتى لو
   * سورة جديدة». والمصحف يُقرأ متّصلًا، ووقوفُ التنقّل عند حدٍّ لا
   * يقف عنده القارئ يجعله يرجع إلى القائمة في كل سورة.
   *
   * ⚠️ والمدى في السورة الجارة **يُقصَّ على حدودها**: مقطع عشر آيات
   * لا يصلح في الكوثر، ولو بنيناه بلا قصٍّ لردّت الصفحةُ «غير
   * موجودة» — وزرٌّ يكسر أسوأ من زرٍّ غائب.
   */
  const nextInSurah = to < surah.ayah_count;
  const nextIsNewSurah = !nextInSurah && Boolean(nextSurah);
  const hasNext = nextInSurah || nextIsNewSurah;

  const prevInSurah = from > 1;
  const prevIsNewSurah = !prevInSurah && Boolean(prevSurah);
  const hasPrev = prevInSurah || prevIsNewSurah;

  const nextPath = nextInSurah
    ? `/quran/study/${surah.number}/${nextStart}/${Math.min(surah.ayah_count, nextStart + span - 1)}`
    : nextSurah
      ? `/quran/study/${nextSurah.number}/1/${Math.min(nextSurah.ayah_count, span)}`
      : '';

  const prevPath = prevInSurah
    ? `/quran/study/${surah.number}/${prevStart}/${from - 1}`
    : prevSurah
      ? `/quran/study/${prevSurah.number}/${Math.max(1, prevSurah.ayah_count - span + 1)}/${prevSurah.ayah_count}`
      : '';

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
          {heading ?? `سورة ${surah.name_ar}`}
        </h1>
        <p className="mt-1 text-[0.84rem] text-[var(--q-mute)]">
          {subheading ??
            (span === 1
              ? `الآية ${toArabic(from)}`
              : `الآيات ${toArabic(from)} – ${toArabic(to)}`)}
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
          onAyahClick={setPickedAyah}
        />

        {/* ⚠️ يُقال إن الآيات تُلمس — وإلا بقيت الميزة سرًّا بين
            من كتبها ومن يقرأ الكود */}
        <p className="mt-5 text-center text-[0.78rem] text-[var(--q-mute)]">
          اضغط على أي آية لتسمعها 🔊
        </p>
      </section>

      {/* ── خيارات الآية الملموسة ── */}
      {pickedAyah !== null && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--q-line)] bg-white px-5 pb-6 pt-4 shadow-[0_-6px_24px_rgba(0,0,0,0.08)]"
          role="dialog"
          aria-label={`خيارات الآية ${toArabic(pickedAyah)}`}
        >
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
            <span className="text-[0.9rem] font-extrabold text-[var(--q-ink)]">
              الآية {toArabic(pickedAyah)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const a = pickedAyah;
                  setPickedAyah(null);
                  /**
                   * ⚠️ التشغيل داخل معالج اللمسة مباشرة — شرطُ Safari
                   * على iPhone وiPad: الصوت لا يبدأ إلا استجابةً للمسة،
                   * ولو أجّلناه بمؤقّتٍ سقط الإذن ولم يعمل على الآيباد.
                   */
                  if (a !== null) playFrom.current?.(a);
                }}
                className="tap rounded-2xl bg-[var(--q-accent)] px-6 py-3 text-[0.92rem] font-extrabold text-white"
              >
                🔊 استمع من هنا
              </button>
              <button
                type="button"
                onClick={() => setPickedAyah(null)}
                aria-label="إغلاق"
                className="tap rounded-2xl border border-[var(--q-line)] px-4 py-3 text-[0.9rem] font-bold text-[var(--q-mute)]"
              >
                ✕
              </button>
            </div>
          </div>
          {/* ⚠️ يُقال ما سيحدث قبل أن يحدث — لا يفاجئه أنها تكمل وحدها */}
          <p className="mx-auto mt-2 w-full max-w-2xl text-center text-[0.76rem] text-[var(--q-mute)]">
            تبدأ من هذه الآية وتكمل آيةً بعد آية
          </p>
        </div>
      )}

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
              يفتح شاشة مستقلة لا يعمل داخل هذه: التسميع يحتاج هدوءًا
              تامًا وشاشة لا شيء فيها غير «أنا أسمّع الآن». وإقحامه هنا
              بين التكرار والإخفاء يشتّت من تحفظ. */}
          <div className="mt-4 border-t border-[var(--q-line)] pt-4">
            <Link
              href={`/quran/recite/${surah.number}/${from}/${to}${
                lessonTitle ? `?lesson=${encodeURIComponent(lessonTitle)}` : ''
              }`}
              className="tap flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--q-accent)] px-4 py-3 text-[0.95rem] font-extrabold text-[var(--q-accent)] transition hover:bg-[#f2f7f3]"
            >
              <span aria-hidden>🎙️</span> سمّع لي
            </Link>
            <p className="mt-2 text-center text-[0.74rem] text-[var(--q-mute)]">
              صوتك ما يُحفظ — نسمعه، نطلع النتيجة، وينمسح
            </p>
          </div>
        </section>
      )}

      {/* ── الصوت ── */}
      {(mode === 'listen' || mode === 'memorize') && (
        <section className="mb-5">
          <AudioBar
            reciter={reciter}
            segment={segments}
            onAyahChange={setActiveAyah}
            withBasmala={basmalaFlags}
            reciters={reciters}
            onReciterChange={changeReciter}
            playAyahRef={playAyah}
            playFromRef={playFrom}
            compact={false}
          />
        </section>
      )}

      {/* ⚠️ ومقبضُ التشغيل هنا أيضًا. كان ناقصًا في وضع القراءة وحده،
          فظهر خيار «استمع من هنا» ولا يفعل شيئًا — ولمسُ الآية في
          القراءة أكثر ما يقع، فحرمانُه يجعل الميزة زرًّا يكذب. */}
      {mode === 'read' && (
        <section className="mb-5">
          <AudioBar
            reciter={reciter}
            segment={segments}
            onAyahChange={setActiveAyah}
            withBasmala={basmalaFlags}
            playAyahRef={playAyah}
            playFromRef={playFrom}
            compact
          />
        </section>
      )}

      {/* ── مركز التدريب ──
          في وضع الحفظ وحده: التدريب يأتي بعد الاستماع والتكرار
          والإخفاء، لا قبلها. */}
      {mode === 'memorize' ? (
        <GoalPlanner segment={segment} surahName={surah.name_ar} />
      ) : null}

      {mode === 'memorize' ? (
        <PracticeCenter
          ayahs={ayahs}
          segment={segment}
          reciter={reciter}
          onPlayAyah={(a) => playAyah.current?.(a)}
        />
      ) : null}

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
            سجّل الدخول
          </Link>{' '}
          ليتبعك على كل أجهزتك.
        </p>
      )}

      {/* ── السابق / التالي ── */}
      {(prevHref || nextHref || hasPrev || hasNext) && (
        <nav className="flex items-center justify-between gap-3">
          {prevHref || hasPrev ? (
            <Link
              href={prevHref ?? prevPath}
              className="tap rounded-2xl border border-[var(--q-line)] bg-white px-5 py-3 text-[0.88rem] font-bold text-[var(--q-ink)] transition hover:border-[#cfe0d5]"
            >
              {prevHref
                ? 'الصفحة السابقة'
                : prevIsNewSurah && prevSurah
                  ? `سورة ${prevSurah.name_ar}`
                  : 'الآيات السابقة'}
            </Link>
          ) : (
            <span />
          )}
          {nextHref || hasNext ? (
            <Link
              href={nextHref ?? nextPath}
              className="tap rounded-2xl border border-[var(--q-line)] bg-white px-5 py-3 text-[0.88rem] font-bold text-[var(--q-ink)] transition hover:border-[#cfe0d5]"
            >
              {/* ⚠️ يُسمّى ما ينتقل إليه: الانتقال إلى سورة أخرى حدثٌ
                  يستحقّ أن يُعرف قبل وقوعه لا بعده */}
              {nextHref
                ? 'الصفحة التالية'
                : nextIsNewSurah && nextSurah
                  ? `سورة ${nextSurah.name_ar} ←`
                  : 'الآيات التالية'}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
