'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CurriculumLesson, LessonRequirement } from '../types';

type GradeOpt = { slug: string; name: string; stageSlug: string; stageName: string };
type SurahOpt = { number: number; name_ar: string; ayah_count: number };

const REQUIREMENTS: { value: LessonRequirement; label: string }[] = [
  { value: 'memorize', label: 'حفظ' },
  { value: 'read', label: 'قراءة' },
  { value: 'review', label: 'مراجعة' },
];

/**
 * محرر دروس منهج القرآن.
 *
 * ⚠️ لا يحتوي هذا الملف بيانات منهج ولا قيمًا افتراضية لمقرر. كل درس
 * تكتبه المعلمة بنفسها، لأن المقرر مرجعه وزارة التربية لا تخميننا.
 *
 * التحقق هنا للراحة لا للحماية: قاعدة البيانات تفرض القيود نفسها
 * (`check` على المدى، وسياسة `is_admin()` على الكتابة). فلو عُطّل
 * جافاسكربت أو نُودي الجدول مباشرة، بقيت القيود قائمة.
 */
export default function QuranCurriculumEditor({
  grades,
  surahs,
}: {
  grades: GradeOpt[];
  surahs: SurahOpt[];
}) {
  const [gradeSlug, setGradeSlug] = useState(grades[0]?.slug ?? '');
  const [term, setTerm] = useState<1 | 2>(1);
  const [rows, setRows] = useState<CurriculumLesson[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // نموذج درس جديد
  const [title, setTitle] = useState('');
  const [surah, setSurah] = useState(1);
  const [fromAyah, setFromAyah] = useState(1);
  const [toAyah, setToAyah] = useState(1);
  const [requirement, setRequirement] = useState<LessonRequirement>('memorize');

  const surahInfo = surahs.find((s) => s.number === surah);
  const maxAyah = surahInfo?.ayah_count ?? 1;
  const grade = grades.find((g) => g.slug === gradeSlug);

  const load = useCallback(async () => {
    if (!gradeSlug) return;
    setBusy(true);
    const sb = createClient();
    const { data, error } = await sb
      .from('quran_curriculum_lesson')
      .select('*')
      .eq('grade_slug', gradeSlug)
      .eq('term', term)
      .order('sort_order');
    setRows(error ? [] : ((data ?? []) as CurriculumLesson[]));
    if (error) setNote(`تعذّرت القراءة: ${error.message}`);
    setBusy(false);
  }, [gradeSlug, term]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!title.trim()) return setNote('اكتبي اسم الدرس');
    if (toAyah < fromAyah) return setNote('آية النهاية قبل البداية');
    if (toAyah > maxAyah) return setNote(`السورة فيها ${maxAyah} آية فقط`);
    if (!grade) return;

    setBusy(true);
    setNote(null);
    const sb = createClient();
    const { error } = await sb.from('quran_curriculum_lesson').insert({
      stage_slug: grade.stageSlug,
      grade_slug: grade.slug,
      term,
      title: title.trim(),
      surah,
      from_ayah: fromAyah,
      to_ayah: toAyah,
      requirement,
      sort_order: rows.length + 1,
      is_visible: true,
    });
    setBusy(false);
    if (error) return setNote(`ما انحفظ: ${error.message}`);
    setTitle('');
    setNote('✅ أُضيف الدرس');
    void load();
  }

  async function toggleVisible(l: CurriculumLesson) {
    const sb = createClient();
    const { error } = await sb
      .from('quran_curriculum_lesson')
      .update({ is_visible: !l.is_visible })
      .eq('id', l.id);
    if (error) setNote(`ما تغيّر: ${error.message}`);
    void load();
  }

  async function move(l: CurriculumLesson, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.id === l.id);
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const sb = createClient();
    await Promise.all([
      sb.from('quran_curriculum_lesson').update({ sort_order: rows[j].sort_order }).eq('id', rows[i].id),
      sb.from('quran_curriculum_lesson').update({ sort_order: rows[i].sort_order }).eq('id', rows[j].id),
    ]);
    void load();
  }

  async function remove(l: CurriculumLesson) {
    if (!window.confirm(`حذف درس «${l.title}»؟`)) return;
    const sb = createClient();
    const { error } = await sb.from('quran_curriculum_lesson').delete().eq('id', l.id);
    if (error) setNote(`ما انحذف: ${error.message}`);
    void load();
  }

  const field =
    'w-full rounded-xl border border-sage/30 bg-white px-3 py-2.5 text-sm outline-none focus:border-sage';

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-sage-dark hover:text-sage-deep"
        >
          <span aria-hidden>→</span> لوحة التحكم
        </Link>
        <h1 className="text-2xl font-extrabold text-ink">منهج القرآن</h1>
        <p className="mt-1 text-sm text-ink/60">
          أدخلي دروس المقرر لكل صف وفصل. ما يظهر للطالبات هو الظاهر فقط.
        </p>
      </header>

      {/* ── اختيار الصف والفصل ── */}
      <section className="mb-5 grid gap-3 rounded-2xl border border-sage/20 bg-white p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-ink/60">الصف</span>
          <select
            value={gradeSlug}
            onChange={(e) => setGradeSlug(e.target.value)}
            className={field}
          >
            {grades.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.stageName} — {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-ink/60">
            الفصل الدراسي
          </span>
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value) as 1 | 2)}
            className={field}
          >
            <option value={1}>الفصل الأول</option>
            <option value={2}>الفصل الثاني</option>
          </select>
        </label>
      </section>

      {/* ── درس جديد ── */}
      <section className="mb-6 rounded-2xl border border-sage/20 bg-white p-4">
        <h2 className="mb-3 text-sm font-extrabold text-ink">درس جديد</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs font-bold text-ink/60">
              اسم الدرس
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: سورة الضحى"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink/60">السورة</span>
            <select
              value={surah}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSurah(n);
                setFromAyah(1);
                setToAyah(1);
              }}
              className={field}
            >
              {surahs.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}. {s.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink/60">
              من آية
            </span>
            <select
              value={fromAyah}
              onChange={(e) => {
                const n = Number(e.target.value);
                setFromAyah(n);
                if (n > toAyah) setToAyah(n);
              }}
              className={field}
            >
              {Array.from({ length: maxAyah }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink/60">
              إلى آية
            </span>
            <select
              value={toAyah}
              onChange={(e) => setToAyah(Number(e.target.value))}
              className={field}
            >
              {Array.from({ length: maxAyah }, (_, i) => i + 1)
                .filter((n) => n >= fromAyah)
                .map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink/60">
              نوع المطلوب
            </span>
            <select
              value={requirement}
              onChange={(e) => setRequirement(e.target.value as LessonRequirement)}
              className={field}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="mt-4 rounded-xl bg-sage px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-sage-dark disabled:opacity-50"
        >
          إضافة الدرس
        </button>

        {note ? (
          <p role="status" className="mt-3 text-sm font-bold text-sage-deep">
            {note}
          </p>
        ) : null}
      </section>

      {/* ── الدروس المُدخلة ── */}
      <section className="rounded-2xl border border-sage/20 bg-white p-4">
        <h2 className="mb-3 text-sm font-extrabold text-ink">
          دروس {grade?.name} — الفصل {term === 1 ? 'الأول' : 'الثاني'}
        </h2>

        {busy && !rows.length ? (
          <p className="py-6 text-center text-sm text-ink/50">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            ما أُدخل درس بعد لهذا الصف والفصل.
          </p>
        ) : (
          <ul className="grid gap-2">
            {rows.map((l, i) => {
              const s = surahs.find((x) => x.number === l.surah);
              return (
                <li
                  key={l.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${
                    l.is_visible ? 'border-sage/20' : 'border-dashed border-ink/15 bg-ink/[0.02]'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {l.title}
                    </span>
                    <span className="block text-xs text-ink/55">
                      {s?.name_ar} · {l.from_ayah}–{l.to_ayah} ·{' '}
                      {REQUIREMENTS.find((r) => r.value === l.requirement)?.label}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => move(l, -1)}
                    disabled={i === 0}
                    aria-label="أعلى"
                    className="rounded-lg border border-sage/25 px-2.5 py-1 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(l, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="أسفل"
                    className="rounded-lg border border-sage/25 px-2.5 py-1 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVisible(l)}
                    className="rounded-lg border border-sage/25 px-2.5 py-1 text-xs font-bold"
                  >
                    {l.is_visible ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(l)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600"
                  >
                    حذف
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
