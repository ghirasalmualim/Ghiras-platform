'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllSegments, type StoredSegment } from '../data/practice';
import { isGuest } from '../data/progress';
import { dueToday, needsWork } from '../engine/planner';
import { removeSegment } from '../data/practice';
import { stateLabel, toDay, progressPercent } from '../engine/review';
import { toArabic } from '../engine/numerals';

/**
 * قائمة المراجعة المستحقة اليوم.
 *
 * ⚠️ لغة هذه الشاشة مقصودة: لا «ضعيف» ولا «فشل» ولا «أخطاء كثيرة».
 * الطفل الذي يُخبَر أنه ضعيف يصدّق، والمقصود أن يعود لا أن ينكسر.
 */
export default function ReviewToday({ surahNames }: { surahNames: string[] }) {
  const [segments, setSegments] = useState<StoredSegment[] | null>(null);
  /** المقطع الذي طُلبت إزالته وينتظر تأكيدًا — واحدٌ لا أكثر. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const keyOf = (s: { surah: number; from_ayah: number; to_ayah: number }) =>
    `${s.surah}:${s.from_ayah}-${s.to_ayah}`;

  /**
   * الإزالة تُطبَّق على الشاشة فورًا ثم تُرسَل.
   *
   * ⚠️ ولو فشل الإرسال أعدناه إلى مكانه: إخفاءُ ما لم يُحذف يجعل
   * الطالبة تظنّه راح، ثم يعود غدًا بلا تفسير.
   */
  async function remove(seg: StoredSegment) {
    const key = keyOf(seg);
    const before = segments;
    setConfirming(null);
    setSegments((list) => (list ?? []).filter((x) => keyOf(x) !== key));
    const ok = await removeSegment(seg);
    if (!ok) setSegments(before);
  }
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let alive = true;
    void isGuest().then((g) => alive && setGuest(g));
    void getAllSegments()
      .then((s) => alive && setSegments(s))
      .catch(() => alive && setSegments([]));
    return () => {
      alive = false;
    };
  }, []);

  const name = (n: number) => surahNames[n - 1] ?? `سورة ${n}`;

  if (guest)
    return (
      <div className="rounded-[1.25rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-10 text-center">
        <p className="mb-2 text-3xl" aria-hidden>
          🌱
        </p>
        <p className="mb-1.5 font-bold text-[var(--q-ink)]">
          المراجعة تحتاج حسابًا
        </p>
        <p className="text-[0.85rem] leading-relaxed text-[var(--q-mute)]">
          لأن المراجعة تتابعك عبر الأيام، وهذا لا يقوم إلا على حساب.
          <br />
          <Link
            href="/login"
            className="mt-2 inline-block px-1 py-2 font-bold text-[var(--q-accent)] underline underline-offset-4"
          >
            سجّل الدخول
          </Link>
        </p>
      </div>
    );

  if (segments === null)
    return <p className="py-10 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>;

  const today = toDay(new Date());
  const due = dueToday(segments, today);
  const weak = needsWork(segments).filter(
    (w) => !due.some((d) => d.surah === w.surah && d.from_ayah === w.from_ayah)
  );

  return (
    <>
      {due.length === 0 ? (
        <div className="rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-10 text-center">
          <p className="mb-2 text-3xl" aria-hidden>
            ✨
          </p>
          <p className="font-[family-name:var(--font-cairo)] text-lg font-extrabold text-[var(--q-ink)]">
            {segments.length
              ? 'ما عليك مراجعة اليوم'
              : 'ابدأ بحفظ مقطع وستظهر مراجعته هنا'}
          </p>
          <p className="mt-1 text-[0.85rem] text-[var(--q-mute)]">
            {segments.length ? 'نراك غدًا بإذن الله 🌿' : ''}
          </p>
          <Link
            href="/quran/browse"
            className="tap mt-5 inline-block rounded-2xl bg-[var(--q-accent)] px-5 py-2.5 text-[0.9rem] font-extrabold text-white"
          >
            {segments.length ? 'احفظ مقطعًا جديدًا' : 'اختر سورة'}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 rounded-2xl bg-[var(--q-accent-soft)] px-4 py-3 text-center text-[0.92rem] font-bold text-[var(--q-ink)]">
            لديك اليوم {toArabic(due.length)}{' '}
            {due.length === 1 ? 'مراجعة' : due.length === 2 ? 'مراجعتان' : 'مراجعات'} 🌿
          </p>
          <ul className="grid gap-2">
            {due.map((s) => (
              <li
                key={keyOf(s)}
                className="flex items-stretch gap-2 rounded-2xl border border-[var(--q-line)] bg-white transition hover:border-[#cfe0d5]"
              >
                <Link
                  href={`/quran/study/${s.surah}/${s.from_ayah}/${s.to_ayah}`}
                  className="tap flex min-w-0 flex-1 items-center gap-3 py-3.5 pr-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-[family-name:var(--font-cairo)] text-[1.02rem] font-bold text-[var(--q-ink)]">
                      {name(s.surah)}
                    </span>
                    <span className="block text-[0.78rem] text-[var(--q-mute)]">
                      الآيات {toArabic(s.from_ayah)}–{toArabic(s.to_ayah)} ·{' '}
                      {stateLabel(s.state)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.74rem] font-bold text-[var(--q-accent)]">
                    {toArabic(progressPercent(s.state))}٪
                  </span>
                </Link>

                {/* ⚠️ زرٌّ مستقلٌّ لا داخل الرابط: عنصرٌ قابل للنقر
                    داخل آخر يربك قارئات الشاشة ولوحة المفاتيح. */}
                {confirming === keyOf(s) ? (
                  <span className="flex shrink-0 items-center gap-1 pl-2">
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      className="tap rounded-xl bg-[#c9463a] px-3 py-1.5 text-[0.76rem] font-bold text-white"
                    >
                      إزالة
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="tap rounded-xl px-2 py-1.5 text-[0.76rem] font-bold text-[var(--q-mute)]"
                    >
                      تراجع
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(keyOf(s))}
                    aria-label={`إزالة ${name(s.surah)} ${toArabic(s.from_ayah)}–${toArabic(s.to_ayah)} من المراجعة`}
                    className="tap shrink-0 px-3 text-[1.1rem] text-[#b9c4bb] transition hover:text-[#c9463a]"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── مواضع تحتاج تقوية ── */}
      {weak.length ? (
        <section className="mt-8">
          <h2 className="mb-1 font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">
            🌱 مواضع تحتاج مراجعة بسيطة
          </h2>
          <p className="mb-3 text-[0.82rem] text-[var(--q-mute)]">
            ليست أخطاء — مقاطع لم ترسخ بعد، وستثبت بمرور قليل عليها
          </p>
          <ul className="grid gap-2">
            {weak.slice(0, 5).map((s) => (
              <li key={`w-${s.surah}:${s.from_ayah}-${s.to_ayah}`}>
                <Link
                  href={`/quran/study/${s.surah}/${s.from_ayah}/${s.to_ayah}`}
                  className="tap flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--q-line)] bg-white px-4 py-3 text-[0.9rem] transition hover:border-[#cfe0d5]"
                >
                  <span className="font-bold text-[var(--q-ink)]">
                    {name(s.surah)} {toArabic(s.from_ayah)}–{toArabic(s.to_ayah)}
                  </span>
                  <span aria-hidden className="text-[var(--q-accent)]">
                    ←
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
