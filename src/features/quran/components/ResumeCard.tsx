'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLastPosition } from '../data/progress';

/**
 * «تابع من حيث وقفت».
 *
 * لا يظهر شيء حتى يوجد موضع محفوظ فعلًا، فالشاشة الأولى تبقى نظيفة
 * لمن يفتح القسم أول مرة. ويظهر للزائرة كما يظهر للمسجَّلة — الفرق
 * أن موضع الزائرة محفوظ في متصفحها وحده.
 */
export default function ResumeCard({ surahNames }: { surahNames: string[] }) {
  const [pos, setPos] = useState<{ surah: number; ayah: number } | null>(null);

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

  return (
    <Link
      href={`/quran/study/${pos.surah}/${pos.ayah}/${pos.ayah}`}
      className="tap mb-4 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[#dfe9e1] bg-[var(--q-accent-soft)] px-5 py-4 transition hover:border-[#c6dbcd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
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
  );
}

/** الأرقام العربية الشرقية — أنسب لسياق المصحف. */
export function toArabic(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
