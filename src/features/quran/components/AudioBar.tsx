'use client';

import { useEffect, useRef, useState } from 'react';
import type { Reciter, Segment } from '../types';
import {
  buildPlaylist,
  clampRepeat,
  MAX_REPEAT,
  REPEAT_PRESETS,
  type PlaylistItem,
  type RepeatScope,
} from '../engine/audio';
import { toArabic } from './ResumeCard';

/**
 * مشغّل التلاوة مع التكرار.
 *
 * ⚠️ قيد Safari على iPhone/iPad الذي يحكم كل التصميم هنا:
 * لا يُسمح بتشغيل صوت إلا استجابةً لِلمسة من المستخدم. فلو أنشأنا
 * عنصر <audio> جديدًا لكل آية، لسقط الإذن عند أول انتقال وتوقف
 * التكرار بعد الآية الأولى.
 *
 * الحل: **عنصر <audio> واحد** يُنشأ مرة، ويُبدَّل مصدره (src) عند كل
 * انتقال. تبديل المصدر على عنصر يعمل أصلًا يبقى ضمن الإذن الممنوح
 * باللمسة الأولى، فيمشي التكرار كاملًا بلا انقطاع.
 *
 * ولهذا أيضًا نبني قائمة التشغيل كاملة مقدَّمًا: نعرف الرابط التالي
 * فنحمّله مسبقًا ونشغّله فور انتهاء سابقه.
 */
export default function AudioBar({
  reciter,
  segment,
  onAyahChange,
  compact = false,
  withBasmala = false,
  reciters = [],
  onReciterChange,
  playAyahRef,
}: {
  reciter: Reciter;
  /**
   * المقطع، أو مقاطع صفحة المصحف حين تعبر أكثر من سورة.
   *
   * وسّعنا النوع بدل أن نبني مشغّلًا ثانيًا للصفحات: عنصر <audio>
   * واحد هو ما يمنع تداخل صوتين، ومشغّلان يعنيان صوتين.
   */
  segment: Segment | Segment[];
  /** يُبلّغ الشاشة بالآية الجارية لتظليلها. */
  onAyahChange?: (ayah: number | null) => void;
  compact?: boolean;
  /**
   * يُسبَق المقطع ببسملة مُتلوّة — يقرّره النص لا المشغّل.
   * ومع مقاطع الصفحة: علَمٌ لكل مقطع، لأن السورة الثانية في الصفحة
   * العابرة تبدأ من أولها فتحتاج بسملتها هي أيضًا.
   */
  withBasmala?: boolean | boolean[];
  /** القرّاء المتاحون. أقل من اثنين ← لا يُعرض اختيار أصلًا. */
  reciters?: Reciter[];
  onReciterChange?: (id: string) => void;
  /**
   * يضع فيه المشغّل دالةَ تشغيل آية مفردة.
   *
   * مركز التدريب يحتاج تشغيل آية في «اسمع وحدّد»، ويجب أن يمرّ بهذا
   * المشغّل نفسه لا بمشغّل ثانٍ: عنصر <audio> واحد هو ما يمنع تداخل
   * صوتين، وهو أيضًا شرط Safari لاستمرار التشغيل.
   */
  playAyahRef?: React.MutableRefObject<((ayah: number) => void) | null>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<PlaylistItem[]>([]);
  const indexRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<PlaylistItem | null>(null);
  const [repeat, setRepeat] = useState(1);
  const [customOpen, setCustomOpen] = useState(false);
  const [scope, setScope] = useState<RepeatScope>('range');
  const [error, setError] = useState<string | null>(null);

  const segments = Array.isArray(segment) ? segment : [segment];
  // مفتاح نصّي للمقاطع: نُقارن به في التبعيات بدل مقارنة مصفوفة
  // بمرجعها، فلا يُوقَف الصوت في كل إعادة رسم.
  const segKey = segments
    .map((s) => `${s.surah}:${s.from_ayah}-${s.to_ayah}`)
    .join('|');
  const totalAyahs = segments.reduce(
    (n, s) => n + (s.to_ayah - s.from_ayah + 1),
    0
  );
  const single = totalAyahs === 1;

  // عنصر صوت واحد لكل عمر المكوّن — لا يُنشأ غيره أبدًا
  useEffect(() => {
    const el = new Audio();
    el.preload = 'auto';
    audioRef.current = el;

    const onEnded = () => {
      const next = indexRef.current + 1;
      const list = playlistRef.current;
      if (next < list.length) {
        indexRef.current = next;
        setCurrent(list[next]);
        onAyahChange?.(list[next].isBasmala ? null : list[next].ayah);
        el.src = list[next].url;
        void el.play().catch(() => stopAll());
      } else {
        stopAll();
      }
    };
    const onError = () => {
      setError('تعذّر تحميل التلاوة — تأكد من اتصالك بالإنترنت');
      stopAll();
    };

    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      el.pause();
      el.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تغيّر المقطع — أو القارئ — يوقف ما يعمل.
  //
  // القارئ في قائمة التبعيات ضرورة لا احتياط: قائمة التشغيل مبنية
  // بروابط القارئ السابق، فلو تُرك ما يعمل لسُمع صوتان معًا، أو لأكمل
  // القارئ القديم مقطعًا اختارت له غيره.
  useEffect(() => {
    stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey, reciter.id]);

  function stopAll() {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    playlistRef.current = [];
    indexRef.current = 0;
    setPlaying(false);
    setCurrent(null);
    onAyahChange?.(null);
  }

  function start(fromAyah?: number) {
    const el = audioRef.current;
    if (!el) return;
    setError(null);

    // آية مفردة: نبحث عن مقطعها لنعرف سورتها — الصفحة قد تحمل سورتين
    const owner = fromAyah
      ? segments.find((s) => fromAyah >= s.from_ayah && fromAyah <= s.to_ayah)
      : undefined;
    const seg =
      fromAyah && owner
        ? { surah: owner.surah, from_ayah: fromAyah, to_ayah: fromAyah }
        : segments;
    // آية مفردة اختارها الطالب لا تُسبق ببسملة: هو داخل السورة لا في أولها
    const list = buildPlaylist(
      reciter,
      seg,
      repeat,
      fromAyah ? 'ayah' : scope,
      fromAyah ? false : withBasmala
    );
    if (!list.length) return;

    playlistRef.current = list;
    indexRef.current = 0;
    setCurrent(list[0]);
    onAyahChange?.(list[0].isBasmala ? null : list[0].ayah);
    el.src = list[0].url;

    // ‏.play() يُستدعى مباشرة داخل معالج اللمسة — شرط Safari
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        setError('المتصفح منع التشغيل — اضغط زر التشغيل مرة أخرى');
        stopAll();
      });
  }

  // نُسلّم دالة التشغيل للأعلى بعد تعريفها
  useEffect(() => {
    if (!playAyahRef) return;
    playAyahRef.current = (ayah: number) => start(ayah);
    return () => {
      playAyahRef.current = null;
    };
  });

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else if (playlistRef.current.length) {
      void el.play().then(() => setPlaying(true)).catch(() => stopAll());
    } else {
      start();
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل التلاوة'}
          className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--q-accent)] text-xl text-white transition hover:bg-[#456d59] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
        >
          <span aria-hidden>{playing ? '❚❚' : '▶'}</span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-bold text-[var(--q-ink)]">
            {reciter.name_ar}
            {reciter.style ? ` · ${reciter.style}` : ''}
          </p>
          <p className="truncate text-[0.76rem] text-[var(--q-mute)]">
            {!current
              ? 'جاهز'
              : current.isBasmala
                ? 'البسملة'
                : `الآية ${toArabic(current.ayah)}${
                    current.of > 1
                      ? ` · التكرار ${toArabic(current.round)} من ${toArabic(current.of)}`
                      : ''
                  }`}
          </p>
        </div>

        {playing || current ? (
          <button
            type="button"
            onClick={stopAll}
            className="tap shrink-0 rounded-xl px-3 text-[0.8rem] font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
          >
            إيقاف
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="status" className="mt-3 rounded-xl bg-[#fdf1ec] px-3 py-2 text-[0.8rem] text-[#a4553a]">
          {error}
        </p>
      ) : null}

      {!compact && (
        <div className="mt-4 border-t border-[var(--q-line)] pt-4">
          <p className="mb-2 text-[0.78rem] font-bold text-[var(--q-mute)]">
            كرّر التلاوة
          </p>
          <div className="flex flex-wrap gap-2">
            {REPEAT_PRESETS.map((n) => (
              <Chip
                key={n}
                active={repeat === n && !customOpen}
                onClick={() => {
                  setRepeat(n);
                  setCustomOpen(false);
                }}
              >
                {n === 1 ? 'مرة' : `${toArabic(n)} مرات`}
              </Chip>
            ))}
            <Chip active={customOpen} onClick={() => setCustomOpen((v) => !v)}>
              عدد مخصص
            </Chip>
          </div>

          {customOpen && (
            <label className="mt-3 flex items-center gap-3">
              <span className="text-[0.8rem] font-bold text-[var(--q-mute)]">
                عدد المرات
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_REPEAT}
                value={repeat}
                onChange={(e) => setRepeat(clampRepeat(Number(e.target.value)))}
                className="tap w-24 rounded-xl border border-[var(--q-line)] px-3 py-2 text-center text-[1rem] font-bold text-[var(--q-ink)] outline-none focus:border-[var(--q-accent)]"
              />
            </label>
          )}

          {!single && (
            <>
              <p className="mb-2 mt-4 text-[0.78rem] font-bold text-[var(--q-mute)]">
                ماذا نكرّر؟
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip active={scope === 'range'} onClick={() => setScope('range')}>
                  المقطع كامل
                </Chip>
                <Chip active={scope === 'ayah'} onClick={() => setScope('ayah')}>
                  آية آية
                </Chip>
              </div>
              <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--q-mute)]">
                {scope === 'range'
                  ? 'يُتلى المقطع كاملًا ثم يُعاد من أوله — يربط الآيات ببعضها'
                  : 'تُكرَّر كل آية وحدها قبل الانتقال للتي بعدها — يثبّت آية آية'}
              </p>
            </>
          )}

          {/* ── القارئ ──
              في آخر اللوحة عن قصد: اختيار يُضبط مرة ويُنسى، فلا يزاحم
              التشغيل والتكرار وهما ما يُستعمل في كل جلسة. ويختفي أصلًا
              إذا لم يكن هناك أكثر من قارئ مفعَّل. */}
          {reciters.length > 1 && onReciterChange ? (
            <div className="mt-4 border-t border-[var(--q-line)] pt-4">
              <p className="mb-2 text-[0.78rem] font-bold text-[var(--q-mute)]">
                القارئ
              </p>
              <div className="flex flex-wrap gap-2">
                {reciters.map((r) => (
                  <Chip
                    key={r.id}
                    active={r.id === reciter.id}
                    onClick={() => onReciterChange(r.id)}
                  >
                    {r.name_ar}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap rounded-xl border px-3.5 py-2 text-[0.85rem] font-bold transition ${
        active
          ? 'border-[var(--q-accent)] bg-[var(--q-accent)] text-white'
          : 'border-[var(--q-line)] bg-white text-[var(--q-ink)] hover:border-[#cfe0d5]'
      }`}
    >
      {children}
    </button>
  );
}
