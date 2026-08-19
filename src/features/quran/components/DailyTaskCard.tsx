'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveGoal, getAllSegments } from '../data/practice';
import { isGuest } from '../data/progress';
import {
  buildDailyTask,
  buildPlan,
  dueToday,
  welcomeBack,
  type DailyTask,
} from '../engine/planner';
import { toDay } from '../engine/review';
import { toArabic } from '../engine/numerals';

/**
 * ☀️ مهمة اليوم.
 *
 * ⚠️ لا تظهر للزائرة: المهمة تُبنى من تاريخ يمتدّ أيامًا (ما استُحق،
 * وما بقي من الخطة)، وهذا لا يقوم إلا على حساب. ولا نُلحّ عليها
 * بالتسجيل — القراءة والاستماع مفتوحان لها بلا شرط.
 *
 * ⚠️ ولا تظهر أرقام ولا إحصاءات ولا مقارنة بأحد. عناصر قليلة وتقدير
 * زمني تقريبي، وكفى.
 */
export default function DailyTaskCard({ surahNames }: { surahNames: string[] }) {
  const [task, setTask] = useState<DailyTask | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [hidden, setHidden] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (await isGuest()) return;
      if (!alive) return;
      setHidden(false);

      const today = toDay(new Date());
      const [goal, segments] = await Promise.all([
        getActiveGoal().catch(() => null),
        getAllSegments().catch(() => []),
      ]);
      if (!alive) return;

      const plan = goal
        ? buildPlan(goal.surah, goal.from_ayah, goal.to_ayah, goal.target_date, today)
        : null;

      const due = dueToday(segments, today);

      // آخر نشاط = أحدث مراجعة، ومنه نعرف هل انقطعت الطالبة
      const lastActive = segments
        .map((s) => s.state.lastReviewedOn)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop() ?? null;

      setWelcome(welcomeBack(lastActive, today));
      setTask(
        buildDailyTask(
          plan,
          due,
          today,
          (n) => surahNames[n - 1] ?? `سورة ${n}`,
          toArabic
        )
      );
    })();

    return () => {
      alive = false;
    };
  }, [surahNames]);

  /**
   * إخفاء المهمة **لليوم وحده**.
   *
   * ⚠️ ولا تُحذف كما تُحذف المراجعة: مهمة اليوم ليست بيانات بل اقتراحٌ
   * يُحسب كل صباح من الخطة وجدول المراجعة. فحذفها نهائيًا لا معنى له —
   * ستُبنى غدًا من جديد. وما تحتاجه الطالبة أن تقول «مو اليوم».
   *
   * ⚠️ والتاريخ محفوظٌ لا مجرّد علَم: بلا تاريخٍ يبقى الإخفاء إلى
   * الأبد، فتظنّ أن الميزة تعطّلت. وبالتاريخ يعود غدًا وحده.
   */
  const dismissKey = 'ghiras.quran.task.dismissed';
  const todayKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(dismissKey) === todayKey) setDismissed(true);
    } catch {
      /* التخزين مقفل — تظهر المهمة، وهذا أهون من إخفائها بالغلط */
    }
  }, [todayKey]);

  function dismissToday() {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey, todayKey);
    } catch {
      /* تُخفى هذه الجلسة فقط */
    }
  }

  if (dismissed || hidden || !task || task.items.length === 0) {
    // رسالة العودة تظهر ولو لم تكن هناك مهمة — الترحيب لا يُشترط بعمل
    if (!hidden && welcome)
      return (
        <p className="mb-4 rounded-2xl bg-[var(--q-accent-soft)] px-4 py-3 text-center text-[0.9rem] font-bold text-[var(--q-ink)]">
          {welcome}
        </p>
      );
    return null;
  }

  return (
    <section className="mb-4">
      {welcome ? (
        <p className="mb-3 rounded-2xl bg-[var(--q-accent-soft)] px-4 py-3 text-center text-[0.9rem] font-bold text-[var(--q-ink)]">
          {welcome}
        </p>
      ) : null}

      <div className="rounded-[1.5rem] border border-[var(--q-line)] bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">
            ☀️ مهمة اليوم
          </h2>
          <span className="flex items-center gap-1">
            <span className="text-[0.76rem] text-[var(--q-mute)]">
              حوالي {toArabic(task.minutes)} دقائق
            </span>
            <button
              type="button"
              onClick={dismissToday}
              aria-label="أخفِ مهمة اليوم — تعود غدًا"
              title="مو اليوم"
              className="tap -mr-1 px-2 text-[1.05rem] leading-none text-[#b9c4bb] transition hover:text-[var(--q-ink)]"
            >
              ×
            </button>
          </span>
        </div>

        <ul className="grid gap-1.5">
          {task.items.map((item, i) => (
            <li key={i}>
              <Link
                href={item.href}
                className="tap flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.92rem] text-[var(--q-ink)] transition hover:bg-[#f6f9f7]"
              >
                <span aria-hidden className="shrink-0 text-lg">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span aria-hidden className="shrink-0 text-[var(--q-accent)]">
                  ←
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-center text-[0.72rem] text-[var(--q-mute)]">
          التقدير تقريبي — خذي وقتك
        </p>
      </div>
    </section>
  );
}
