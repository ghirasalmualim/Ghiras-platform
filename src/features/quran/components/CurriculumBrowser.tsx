'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Grade, Stage } from '@/lib/types';
import type { CurriculumLesson } from '../types';
import { toArabic } from './ResumeCard';

const REQUIREMENT_LABEL: Record<CurriculumLesson['requirement'], string> = {
  read: 'قراءة',
  memorize: 'حفظ',
  review: 'مراجعة',
};

/**
 * تصفّح المنهج: مرحلة ← صف ← فصل ← درس.
 *
 * الدرس المختار يقود إلى `/quran/study/...` أي إلى نفس شاشة الدراسة
 * التي يستعملها القسم العام تمامًا. لا يوجد «حفظ المنهج» منفصل عن
 * «حفظ القرآن» — محرك واحد يخدم الطريقين.
 */
export default function CurriculumBrowser({
  stages,
  gradesWithLessons,
}: {
  stages: { stage: Stage; grades: Grade[] }[];
  gradesWithLessons: string[];
}) {
  const [grade, setGrade] = useState<Grade | null>(null);
  const [term, setTerm] = useState<1 | 2>(1);
  const [lessons, setLessons] = useState<CurriculumLesson[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(g: Grade, t: 1 | 2) {
    setGrade(g);
    setTerm(t);
    setLoading(true);
    setLessons(null);
    try {
      const res = await fetch(
        `/api/quran/lessons?grade=${encodeURIComponent(g.slug)}&term=${t}`
      );
      setLessons(res.ok ? await res.json() : []);
    } catch {
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }

  if (grade) {
    return (
      <section>
        <button
          type="button"
          onClick={() => {
            setGrade(null);
            setLessons(null);
          }}
          className="tap mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> كل الصفوف
        </button>

        <h2 className="mb-4 font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          {grade.name}
        </h2>

        <div className="mb-5 flex gap-2">
          {([1, 2] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => open(grade, t)}
              aria-pressed={term === t}
              className={`tap rounded-xl border px-4 py-2 text-[0.88rem] font-bold transition ${
                term === t
                  ? 'border-[var(--q-accent)] bg-[var(--q-accent)] text-white'
                  : 'border-[var(--q-line)] bg-white text-[var(--q-ink)]'
              }`}
            >
              الفصل {toArabic(t)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-8 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>
        ) : lessons && lessons.length ? (
          <ul className="grid gap-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/quran/study/${l.surah}/${l.from_ayah}/${l.to_ayah}?lesson=${encodeURIComponent(l.title)}`}
                  className="tap flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-white px-4 py-3.5 transition hover:border-[#cfe0d5]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-[family-name:var(--font-cairo)] text-[1.02rem] font-bold text-[var(--q-ink)]">
                      {l.title}
                    </span>
                    <span className="block text-[0.78rem] text-[var(--q-mute)]">
                      الآيات {toArabic(l.from_ayah)} – {toArabic(l.to_ayah)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--q-accent-soft)] px-3 py-1 text-[0.72rem] font-bold text-[var(--q-accent)]">
                    {REQUIREMENT_LABEL[l.requirement]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--q-line)] bg-white px-5 py-10 text-center">
            <p className="mb-1 font-bold text-[var(--q-ink)]">
              ما أُدخلت دروس هذا الفصل بعد
            </p>
            <p className="text-[0.85rem] leading-relaxed text-[var(--q-mute)]">
              المقرر يُدخل من لوحة التحكم. وحتى ذلك الحين تقدرين تقرئين
              وتحفظين من{' '}
              <Link
                href="/quran/browse"
                className="font-bold text-[var(--q-accent)] underline underline-offset-4"
              >
                القرآن الكريم
              </Link>{' '}
              مباشرة.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      {stages.map(({ stage, grades }) => (
        <div key={stage.id}>
          <h2 className="mb-2.5 text-[0.8rem] font-bold tracking-wide text-[var(--q-mute)]">
            {stage.name}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {grades.map((g) => {
              const has = gradesWithLessons.includes(g.slug);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => open(g, 1)}
                    className="tap flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--q-line)] bg-white px-4 py-3 text-right transition hover:border-[#cfe0d5]"
                  >
                    <span className="font-[family-name:var(--font-cairo)] text-[1rem] font-bold text-[var(--q-ink)]">
                      {g.name}
                    </span>
                    {has ? (
                      <span className="shrink-0 rounded-full bg-[var(--q-accent-soft)] px-2.5 py-0.5 text-[0.7rem] font-bold text-[var(--q-accent)]">
                        فيه دروس
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
