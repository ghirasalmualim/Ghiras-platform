'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Segment } from '../types';
import { getActiveGoal, setGoal, type Goal } from '../data/practice';
import { isGuest } from '../data/progress';
import {
  buildPlan,
  PLAN_KIND_LABEL,
  todaySlice,
  type Plan,
} from '../engine/planner';
import { addDays, toDay } from '../engine/review';
import { toArabic } from '../engine/numerals';

/**
 * هدف الحفظ وخطته.
 *
 * ⚠️ مخطّط واحد لا اثنان: هذا المكوّن يستعمل `buildPlan` نفسه الذي
 * يستعمله المنهج. الفرق بينهما مصدر الموعد فقط — المعلمة تحدّده في
 * المنهج، والطالبة تحدّده هنا. وما بعد ذلك سواء.
 *
 * ولا تُخزَّن الخطة: تُحسب من (المتبقي، الأيام الباقية، ما أُتقن) وقت
 * العرض، فتُعيد توزيع نفسها إن غابت الطالبة يومًا بلا تدخّل.
 */
export default function GoalPlanner({
  segment,
  surahName,
}: {
  segment: Segment;
  surahName: string;
}) {
  const [guest, setGuest] = useState(true);
  const [goal, setGoalState] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(addDays(toDay(new Date()), 7));
  const [busy, setBusy] = useState(false);

  const today = toDay(new Date());

  const load = useCallback(async () => {
    if (await isGuest()) {
      setGuest(true);
      return;
    }
    setGuest(false);
    const g = await getActiveGoal().catch(() => null);
    setGoalState(g);
    setPlan(
      g ? buildPlan(g.surah, g.from_ayah, g.to_ayah, g.target_date, today) : null
    );
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    const ok = await setGoal(segment, date, 'personal');
    setBusy(false);
    if (ok) {
      setPicking(false);
      void load();
    }
  }

  if (guest) return null;

  // ── هدف قائم على هذا المقطع ──
  const isThisSegment =
    goal &&
    goal.surah === segment.surah &&
    goal.from_ayah === segment.from_ayah &&
    goal.to_ayah === segment.to_ayah;

  if (isThisSegment && plan) {
    const slice = todaySlice(plan, today);
    return (
      <section className="mb-5 rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            🎯 خطة الحفظ
          </h3>
          <span className="text-[0.74rem] text-[var(--q-mute)]">
            الموعد {goal.target_date}
          </span>
        </div>

        {plan.overdue ? (
          <p className="mb-3 rounded-xl bg-[var(--q-accent-soft)] px-3 py-2.5 text-[0.82rem] leading-relaxed text-[var(--q-ink)]">
            مضى الموعد 🌱 نكمل من حيث توقفنا — والباقي أمامك.
          </p>
        ) : null}

        {plan.overloaded ? (
          <p className="mb-3 rounded-xl bg-[#fdf6ec] px-3 py-2.5 text-[0.82rem] leading-relaxed text-[#8a6d3b]">
            المقدار اليومي كبير على الأيام المتبقية. لو أخّرتِ الموعد
            قليلًا لصارت الخطة أهدأ وأثبت.
          </p>
        ) : null}

        {slice ? (
          <div className="rounded-xl bg-[#f7f9f7] px-4 py-3">
            <p className="text-[0.76rem] font-bold text-[var(--q-accent)]">
              اليوم · {PLAN_KIND_LABEL[slice.kind]}
            </p>
            <p className="mt-1 text-[0.92rem] font-bold text-[var(--q-ink)]">
              {slice.from_ayah
                ? `احفظي الآيات ${toArabic(slice.from_ayah)}–${toArabic(slice.to_ayah!)}`
                : 'مراجعة المقطع كاملًا'}
            </p>
            {slice.review_from ? (
              <p className="mt-0.5 text-[0.8rem] text-[var(--q-mute)]">
                واربطي ما سبق {toArabic(slice.review_from)}–
                {toArabic(slice.review_to!)}
              </p>
            ) : null}
          </div>
        ) : null}

        <ol className="mt-3 grid gap-1">
          {plan.days.slice(0, 6).map((d) => (
            <li
              key={d.date}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[0.78rem] ${
                d.date === today
                  ? 'bg-[var(--q-accent-soft)] font-bold text-[var(--q-ink)]'
                  : 'text-[var(--q-mute)]'
              }`}
            >
              <span>{PLAN_KIND_LABEL[d.kind]}</span>
              <span>
                {d.from_ayah
                  ? `${toArabic(d.from_ayah)}–${toArabic(d.to_ayah!)}`
                  : 'مراجعة'}
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  // ── هدف على مقطع آخر ──
  if (goal && !isThisSegment && !picking)
    return (
      <section className="mb-5 rounded-[1.25rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-4">
        <p className="text-[0.85rem] text-[var(--q-mute)]">
          خطتك الحالية على مقطع آخر.{' '}
          <Link
            href={`/quran/study/${goal.surah}/${goal.from_ayah}/${goal.to_ayah}`}
            className="font-bold text-[var(--q-accent)] underline underline-offset-4"
          >
            افتحيها
          </Link>{' '}
          أو{' '}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="font-bold text-[var(--q-accent)] underline underline-offset-4"
          >
            اجعلي هذا المقطع هدفك
          </button>
        </p>
      </section>
    );

  // ── لا هدف بعد ──
  if (!picking)
    return (
      <section className="mb-5">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="tap flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-4 text-right transition hover:border-[#cfe0d5]"
        >
          <span>
            <span className="block font-[family-name:var(--font-cairo)] text-[0.98rem] font-extrabold text-[var(--q-ink)]">
              🎯 اجعلي هذا هدفك
            </span>
            <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
              حدّدي موعدًا ونقسّم لك {surahName} على الأيام
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
            ←
          </span>
        </button>
      </section>
    );

  return (
    <section className="mb-5 rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
      <h3 className="mb-3 font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
        🎯 متى تودّين إتمام الحفظ؟
      </h3>
      <label className="block">
        <span className="mb-1.5 block text-[0.8rem] font-bold text-[var(--q-mute)]">
          الموعد
        </span>
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          className="tap w-full rounded-2xl border border-[var(--q-line)] px-4 py-3 text-[1rem] font-bold text-[var(--q-ink)] outline-none focus:border-[var(--q-accent)]"
        />
      </label>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || date < today}
          className="tap flex-1 rounded-2xl bg-[var(--q-accent)] px-5 py-3 text-[0.95rem] font-extrabold text-white disabled:opacity-50"
        >
          ابدئي الخطة
        </button>
        <button
          type="button"
          onClick={() => setPicking(false)}
          className="tap rounded-2xl border border-[var(--q-line)] px-5 py-3 text-[0.9rem] font-bold text-[var(--q-ink)]"
        >
          إلغاء
        </button>
      </div>
    </section>
  );
}
