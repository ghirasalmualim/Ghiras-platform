'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Surah } from '../types';
import { toArabic } from '../engine/numerals';

/**
 * اختيار السورة ثم المدى.
 *
 * البحث يطابق الاسم بعد إزالة «ال» والتشكيل، فمن كتب «بقرة» يجد
 * «البقرة»، ومن كتب رقم السورة يجدها كذلك.
 *
 * القائمة كلها ١١٤ عنصرًا تُرسَم دفعة واحدة: عدد صغير لا يستحق
 * تعقيد التحميل التدريجي، والتمرير الطبيعي أسرع على الجوال من أي بديل.
 */
export default function SurahPicker({ surahs }: { surahs: Surah[] }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Surah | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = normalise(query);
    if (!q) return surahs;
    return surahs.filter(
      (s) =>
        normalise(s.name_ar).includes(q) ||
        s.name_translit.toLowerCase().includes(q) ||
        String(s.number) === q
    );
  }, [query, surahs]);

  function choose(s: Surah) {
    setPicked(s);
    setFrom(1);
    setTo(Math.min(s.ayah_count, 5));
  }

  function start() {
    if (!picked) return;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    router.push(`/quran/study/${picked.number}/${lo}/${hi}`);
  }

  if (picked) {
    const options = Array.from({ length: picked.ayah_count }, (_, i) => i + 1);
    return (
      <section>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="tap mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> كل السور
        </button>

        <div className="rounded-[1.5rem] border border-[var(--q-line)] bg-white p-6">
          <h2 className="mb-1 text-center font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
            سورة {picked.name_ar}
          </h2>
          <p className="mb-6 text-center text-[0.85rem] text-[var(--q-mute)]">
            {picked.revelation_place === 'meccan' ? 'مكية' : 'مدنية'} ·{' '}
            {toArabic(picked.ayah_count)} آية
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <RangeSelect
              label="من الآية"
              value={from}
              options={options}
              onChange={(v) => {
                setFrom(v);
                if (v > to) setTo(v);
              }}
            />
            <RangeSelect
              label="إلى الآية"
              value={to}
              options={options.filter((n) => n >= from)}
              onChange={setTo}
            />
          </div>

          <p className="mt-4 text-center text-[0.82rem] text-[var(--q-mute)]">
            {to - from + 1 === 1
              ? 'آية واحدة'
              : `${toArabic(to - from + 1)} آيات`}
          </p>

          <button
            type="button"
            onClick={start}
            className="tap mt-5 w-full rounded-2xl bg-[var(--q-accent)] px-6 py-3.5 text-[1.02rem] font-extrabold text-white transition hover:bg-[#456d59] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
          >
            ابدأ
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <input
        type="search"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم السورة أو رقمها"
        aria-label="ابحث عن سورة"
        className="tap mb-5 w-full rounded-2xl border border-[var(--q-line)] bg-white px-5 py-3 text-[1rem] text-[var(--q-ink)] outline-none transition placeholder:text-[#a9b8ac] focus:border-[var(--q-accent)]"
      />

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-[var(--q-mute)]">
          ما لقينا سورة بهذا الاسم
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.number}>
              <button
                type="button"
                onClick={() => choose(s)}
                className="tap flex w-full items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-white px-4 py-3 text-right transition hover:border-[#cfe0d5] hover:bg-[#fcfdfc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--q-accent-soft)] text-[0.8rem] font-extrabold text-[var(--q-accent)]">
                  {toArabic(s.number)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-[family-name:var(--font-cairo)] text-[1.02rem] font-bold text-[var(--q-ink)]">
                    {s.name_ar}
                  </span>
                  <span className="block text-[0.75rem] text-[var(--q-mute)]">
                    {toArabic(s.ayah_count)} آية
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RangeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8rem] font-bold text-[var(--q-mute)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // النسق الأصلي للقائمة على iOS يفتح عجلة اختيار مريحة —
        // أفضل بكثير من أي بديل مصنوع باليد على شاشة صغيرة.
        className="tap w-full rounded-2xl border border-[var(--q-line)] bg-white px-4 py-3 text-[1.05rem] font-bold text-[var(--q-ink)] outline-none transition focus:border-[var(--q-accent)]"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {toArabic(n)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** يُسقط «ال» التعريف والتشكيل ليطابق البحث ما يكتبه الطفل فعلًا. */
function normalise(s: string): string {
  return s
    .trim()
    .replace(/[ً-ٟۖ-ۭ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/^ال/, '')
    .toLowerCase();
}
