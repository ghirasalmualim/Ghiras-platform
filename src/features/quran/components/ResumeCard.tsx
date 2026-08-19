'use client';

import { toArabic } from '../engine/numerals';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clearLastPosition, getLastPosition } from '../data/progress';

/**
 * «تابع من حيث وقفت».
 *
 * لا يظهر شيء حتى يوجد موضع محفوظ فعلًا، فالشاشة الأولى تبقى نظيفة
 * لمن يفتح القسم أول مرة. ويظهر للزائرة كما يظهر للمسجَّلة — الفرق
 * أن موضع الزائرة محفوظ في متصفحها وحده.
 */
export default function ResumeCard({ surahNames }: { surahNames: string[] }) {
  const [pos, setPos] = useState<{ surah: number; ayah: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    getLastPosition()
      .then((p) => {
        if (alive && p) setPos({ surah: p.surah, ayah: p.ayah });
      })
      .catch(() => {
        /* التقدّم ميزة مساعدة — سقوطها لا يمنع القراءة */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!pos) return null;

  const name = surahNames[pos.surah - 1] ?? `سورة ${pos.surah}`;

  async function clear() {
    setPos(null);
    setConfirming(false);
    await clearLastPosition().catch(() => {
      /* موضع القراءة ميزة مساعدة — لا نُقلق الطالبة بفشل مسحه */
    });
  }

  return (
    <div className="mb-4 flex items-stretch gap-1 rounded-[1.25rem] border border-[#dfe9e1] bg-[var(--q-accent-soft)] transition hover:border-[#c6dbcd]">
      <Link
        href={`/quran/study/${pos.surah}/${pos.ayah}/${pos.ayah}`}
        className="tap flex min-w-0 flex-1 items-center justify-between gap-3 py-4 pr-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
      >
        <span className="min-w-0">
          <span className="block text-[0.72rem] font-bold tracking-wide text-[var(--q-mute)]">
            تابع من حيث وقفت
          </span>
          <span className="mt-0.5 block truncate font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">
            {name} · الآية {toArabic(pos.ayah)}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
          ←
        </span>
      </Link>

      {/* ⚠️ خارج الرابط: زرٌّ داخل رابط يفتح الدرس بدل أن يمسح. */}
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1 pl-3">
          <button
            type="button"
            onClick={clear}
            className="tap rounded-xl bg-[#c9463a] px-3 py-1.5 text-[0.76rem] font-bold text-white"
          >
            امسح
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="tap rounded-xl px-2 py-1.5 text-[0.76rem] font-bold text-[var(--q-mute)]"
          >
            تراجع
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="امسح موضع القراءة المحفوظ"
          className="tap shrink-0 px-4 text-[1.1rem] text-[#a9bcae] transition hover:text-[#c9463a]"
        >
          ×
        </button>
      )}
    </div>
  );
}
