'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Grade, Stage } from '@/lib/types';
import type { CurriculumLesson } from '../types';
import { toArabic } from '../engine/numerals';

const REQUIREMENT: Record<
  CurriculumLesson['requirement'],
  { label: string; icon: string }
> = {
  memorize: { label: 'حفظ', icon: '🌱' },
  read: { label: 'تلاوة', icon: '📖' },
  review: { label: 'مراجعة', icon: '🔄' },
};

/**
 * تصفّح المنهج: الصف ← الفصل ← الدرس.
 *
 * ⚠️ الدرس يقود إلى `/quran/study/...` أي إلى **نفس** شاشة الدراسة
 * التي يستعملها القسم العام. لا يوجد «حفظ منهج» منفصل عن «حفظ قرآن»:
 * محرك واحد، وكل ما بنيناه — القراءة والاستماع واختيار القارئ
 * والتكرار والحفظ الخفي والأنشطة والمراجعة المتباعدة — يعمل على مدى
 * آيات الدرس وحده.
 *
 * ⚠️ اسم السورة يُقرأ من المصحف لا من بيانات المنهج. المنهج يحمل رقم
 * السورة فقط، فلا تنشأ قائمة أسماء ثانية تنحرف يومًا عن المصحف.
 *
 * والتصميم لطفل ابتدائي: خطوات قليلة، وأزرار كبيرة، ونص قليل، وسؤال
 * واحد واضح في كل شاشة. وبلا مصطلحات تقنية.
 */
export default function CurriculumBrowser({
  stages,
  surahNames,
}: {
  stages: { stage: Stage; grades: Grade[] }[];
  surahNames: string[];
}) {
  const [grade, setGrade] = useState<Grade | null>(null);
  const [term, setTerm] = useState<1 | 2 | null>(null);
  const [lessons, setLessons] = useState<CurriculumLesson[] | null>(null);
  const [loading, setLoading] = useState(false);

  const surahName = (n: number) => surahNames[n - 1] ?? `سورة ${n}`;

  async function openTerm(g: Grade, t: 1 | 2) {
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

  // ── ٣) الدروس ──
  if (grade && term) {
    return (
      <section>
        <button
          type="button"
          onClick={() => {
            setTerm(null);
            setLessons(null);
          }}
          className="tap mb-5 inline-flex items-center gap-2 text-[0.95rem] font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> {grade.name}
        </button>

        <h2 className="mb-1 font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          الفصل {term === 1 ? 'الأول' : 'الثاني'}
        </h2>
        <p className="mb-5 text-[0.85rem] text-[var(--q-mute)]">
          {lessons ? `${toArabic(lessons.length)} درسًا` : ' '}
        </p>

        {loading ? (
          <p className="py-10 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>
        ) : lessons && lessons.length ? (
          <ul className="grid gap-2.5">
            {lessons.map((l, i) => {
              const req = REQUIREMENT[l.requirement];
              return (
                <li key={l.id}>
                  <Link
                    href={`/quran/study/${l.surah}/${l.from_ayah}/${l.to_ayah}?lesson=${encodeURIComponent(l.title)}`}
                    className="tap flex items-center gap-3.5 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-4 py-4 transition hover:border-[#cfe0d5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--q-accent-soft)] text-[0.9rem] font-extrabold text-[var(--q-accent)]">
                      {toArabic(i + 1)}
                    </span>

                    <span className="min-w-0 flex-1">
                      {/* اسم السورة ومداها أولًا — هذا ما يهمّ الطفل */}
                      <span className="block font-[family-name:var(--font-cairo)] text-[1.15rem] font-extrabold text-[var(--q-ink)]">
                        سورة {surahName(l.surah)}
                      </span>
                      <span className="mt-0.5 block text-[0.92rem] text-[var(--q-mute)]">
                        {l.from_ayah === l.to_ayah
                          ? `الآية ${toArabic(l.from_ayah)}`
                          : `الآيات ${toArabic(l.from_ayah)}–${toArabic(l.to_ayah)}`}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--q-accent-soft)] px-2.5 py-0.5 text-[0.8rem] font-bold text-[var(--q-accent)]">
                        <span aria-hidden>{req.icon}</span> {req.label}
                      </span>
                    </span>

                    <span className="shrink-0 rounded-xl bg-[var(--q-accent)] px-4 py-2 text-[0.9rem] font-extrabold text-white">
                      ابدأ
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--q-line)] bg-white px-5 py-10 text-center">
            <p className="mb-1 font-bold text-[var(--q-ink)]">
              ما فيه دروس في هذا الفصل
            </p>
            <p className="text-[0.85rem] leading-relaxed text-[var(--q-mute)]">
              جرّب الفصل الآخر، أو اقرأ من{' '}
              <Link
                href="/quran/browse"
                className="font-bold text-[var(--q-accent)] underline underline-offset-4"
              >
                القرآن الكريم
              </Link>
              .
            </p>
          </div>
        )}
      </section>
    );
  }

  // ── ٢) الفصل الدراسي ──
  if (grade) {
    return (
      <section>
        <button
          type="button"
          onClick={() => setGrade(null)}
          className="tap mb-5 inline-flex items-center gap-2 text-[0.95rem] font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> كل الصفوف
        </button>

        <h2 className="mb-1 font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          {grade.name}
        </h2>
        <p className="mb-5 text-[0.9rem] text-[var(--q-mute)]">أي فصل دراسي؟</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {([1, 2] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void openTerm(grade, t)}
              className="tap rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-6 text-center transition hover:border-[#cfe0d5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
            >
              <span className="block font-[family-name:var(--font-cairo)] text-[1.3rem] font-extrabold text-[var(--q-ink)]">
                الفصل {t === 1 ? 'الأول' : 'الثاني'}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // ── ١) الصف ──
  return (
    <section className="grid gap-6">
      {stages.map(({ stage, grades }) => (
        <div key={stage.id}>
          {/* لا نعرض اسم المرحلة إن لم يكن عندنا غيرها — خطوة أقل للطفل */}
          {stages.length > 1 ? (
            <h2 className="mb-3 text-[0.85rem] font-bold tracking-wide text-[var(--q-mute)]">
              {stage.name}
            </h2>
          ) : null}
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {grades.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGrade(g)}
                  className="tap flex w-full items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-5 text-right transition hover:border-[#cfe0d5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
                >
                  <span className="font-[family-name:var(--font-cairo)] text-[1.15rem] font-extrabold text-[var(--q-ink)]">
                    {g.name}
                  </span>
                  <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
                    ←
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
