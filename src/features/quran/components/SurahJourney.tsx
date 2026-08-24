'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toArabic } from '../engine/numerals';
import { AYAH_STATE_META, type AyahBlock } from '../engine/journey';

/**
 * صفحة سورةٍ في الرحلة — خريطتها وأزرارها.
 *
 * ⚠️ الخريطة **كتلٌ** متجانسة لا نقطة لكل آية: البقرة بضعُ كتلٍ لا
 * ٢٨٦ عنصرًا يثقل الصفحة. وكل كتلة رمزٌ ووسمٌ ومدًى — لا لون وحده
 * (تمييز الأحوال بلا اعتماد على الألوان).
 *
 * ⚠️ الأزرار كلها أبواب الأنظمة القائمة — لا مشغّل ولا مسار تسميعٍ
 * جديد.
 */

type Detail = {
  surah: number;
  name: string;
  ayahCount: number;
  blocks: AyahBlock[];
  goal: { from: number; to: number; targetDate: string | null; status: string } | null;
  reachedUpTo: number;
  settledCount: number;
  dueCount: number;
  spots: { kind: 'transition' | 'spot'; ayah: number }[];
  lastReviewedOn: string | null;
};

const STATE_BG: Record<string, string> = {
  UPCOMING: 'bg-[#f2f5f2] text-[var(--q-mute)]',
  MEMORIZING: 'bg-[#fdf3dd] text-[#8a6d1f]',
  REACHED: 'bg-[#dcebe1] text-[#3c6650]',
  SETTLED: 'bg-[var(--q-accent)] text-white',
  NEEDS_CARE: 'bg-[#fbe9e2] text-[#9c4a2f]',
};

const fmtDay = (d: string) => {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
};

export default function SurahJourney({ surah }: { surah: number }) {
  const [d, setD] = useState<Detail | null | 'guest' | 'error'>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/quran/journey?surah=${surah}`)
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setD('guest');
        if (!r.ok) return setD('error');
        setD((await r.json()) as Detail);
      })
      .catch(() => alive && setD('error'));
    return () => { alive = false; };
  }, [surah]);

  if (d === null) return <p className="py-14 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>;
  if (d === 'guest' || d === 'error')
    return (
      <p className="py-14 text-center text-[var(--q-mute)]">
        {d === 'guest' ? (
          <Link href={`/login?next=/quran/journey/${surah}`} className="font-bold text-[var(--q-accent)] underline underline-offset-4">
            سجّل الدخول لرؤية رحلتك مع هذه السورة
          </Link>
        ) : (
          'تعذّرت القراءة — جرّب مرة ثانية'
        )}
      </p>
    );

  const start = d.reachedUpTo > 0 ? Math.min(d.reachedUpTo + 1, d.ayahCount) : 1;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4">
        <h2 className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          سورة {d.name}
        </h2>
        <p className="mt-1 text-[0.84rem] text-[var(--q-mute)]">
          {toArabic(d.ayahCount)} آية
          {d.reachedUpTo > 0 ? ` · وصلت إلى الآية ${toArabic(d.reachedUpTo)}` : ''}
          {d.settledCount > 0 ? ` · ${toArabic(d.settledCount)} مثبتة جيدًا` : ''}
          {d.lastReviewedOn ? ` · آخر مراجعة ${fmtDay(d.lastReviewedOn)}` : ''}
        </p>
        {d.goal && (
          <p className="mt-2 rounded-xl bg-[var(--q-accent-soft)] px-3.5 py-2.5 text-[0.84rem] font-bold text-[var(--q-ink)]">
            🎯 هدفك الحالي: الآيات {toArabic(d.goal.from)}–{toArabic(d.goal.to)}
            {d.goal.targetDate ? ` · موعده ${fmtDay(d.goal.targetDate)}` : ''}
          </p>
        )}
        {d.dueCount > 0 && (
          <p className="mt-2 text-[0.82rem] font-bold text-[var(--q-ink)]">
            🔄 فيها اليوم{' '}
            {d.dueCount === 1
              ? 'مراجعة مستحقة'
              : d.dueCount === 2
                ? 'مراجعتان مستحقتان'
                : d.dueCount <= 10
                  ? `${toArabic(d.dueCount)} مراجعات مستحقة`
                  : `${toArabic(d.dueCount)} مراجعة مستحقة`}
          </p>
        )}
      </section>

      {/* ── خريطة الآيات — كتل برموز ووسوم ── */}
      <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4">
        <h3 className="mb-3 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">
          خريطة السورة
        </h3>
        <ul className="flex flex-wrap gap-1.5" aria-label="حالة آيات السورة">
          {d.blocks.map((b, i) => {
            const meta = AYAH_STATE_META[b.state];
            const range = b.from === b.to ? toArabic(b.from) : `${toArabic(b.from)}–${toArabic(b.to)}`;
            return (
              <li
                key={i}
                className={`rounded-lg px-2.5 py-1.5 text-[0.76rem] font-bold ${STATE_BG[b.state]}`}
                aria-label={`الآيات ${range}: ${meta.label}`}
                title={meta.label}
              >
                <span aria-hidden>{meta.symbol}</span> {range}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--q-mute)]">
          {Object.values(AYAH_STATE_META).map((m) => `${m.symbol} ${m.label}`).join(' · ')}
        </p>
      </section>

      {/* ── مواضع فيها ── */}
      {d.spots.length > 0 && (
        <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4">
          <h3 className="mb-2 font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            🎯 نثبتها معًا
          </h3>
          <ul className="grid gap-1 text-[0.86rem] text-[var(--q-ink)]">
            {d.spots.map((s, i) => (
              <li key={i}>
                {s.kind === 'transition'
                  ? `الوصل بين الآيتين ${toArabic(s.ayah - 1)} و${toArabic(s.ayah)}`
                  : `الآية ${toArabic(s.ayah)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── الأبواب — كلها أنظمة قائمة ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Btn href={`/quran/study/${d.surah}/${start}/${Math.min(start + 3, d.ayahCount)}`} solid>
          🧠 أكمل الحفظ
        </Btn>
        <Btn href="/quran/review">🔄 راجع</Btn>
        <Btn href={`/quran/recite/${d.surah}/${Math.max(1, d.reachedUpTo > 0 ? 1 : 1)}/${Math.max(1, Math.min(d.reachedUpTo || 3, d.ayahCount))}`}>
          🎙️ سمّع لي
        </Btn>
      </div>
    </div>
  );
}

function Btn({ href, children, solid }: { href: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <Link
      href={href}
      className={`tap rounded-2xl px-4 py-3 text-center text-[0.9rem] font-extrabold transition ${
        solid ? 'bg-[var(--q-accent)] text-white hover:opacity-95' : 'bg-[#eef3ef] text-[var(--q-ink)] hover:bg-[var(--q-accent-soft)]'
      }`}
    >
      {children}
    </Link>
  );
}
