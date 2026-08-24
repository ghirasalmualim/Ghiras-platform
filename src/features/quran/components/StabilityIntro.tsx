'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toArabic } from '../engine/numerals';

/**
 * 🧠 اختبر ثبات حفظك — البوابة القصيرة.
 *
 * UX من ثلاث خطوات لا ثماني شاشات: اقتراحٌ → «ابدأ التسميع» →
 * شاشة التسميع القائمة نفسها (وضع الاختبار: لا نصّ ولا تلميح).
 *
 * ⚠️ يُعرض للطالبة **الضروري فقط**: السورة والمدى و«ابدأ من الآية»
 * — ولا رمزَ سببٍ تقنيًّا ولا أعمار مقاطع ولا أوزان. تلك للتشخيص وحده.
 * ⚠️ والاختبار دعوةٌ لا بوابة: لا يُقفل حفظٌ جديد خلفه أبدًا.
 */

type Res =
  | { eligible: true; candidate: { surah: number; name: string; from_ayah: number; to_ayah: number; startFrom: boolean } }
  | { eligible: false; message: string; reason: string }
  | null
  | 'guest';

export default function StabilityIntro() {
  const [res, setRes] = useState<Res>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/quran/stability-test')
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setRes('guest');
        setRes((await r.json()) as Res);
      })
      .catch(() => alive && setRes('guest'));
    return () => { alive = false; };
  }, []);

  if (res === null) return <p className="py-14 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>;

  if (res === 'guest')
    return (
      <section className="rounded-[1.25rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-10 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🌱</p>
        <p className="mb-1.5 font-bold text-[var(--q-ink)]">اختبار الثبات يحتاج حسابًا</p>
        <p className="text-[0.85rem] text-[var(--q-mute)]">
          لأنه يُبنى على محفوظك.{' '}
          <Link href="/login?next=/quran/stability" className="font-bold text-[var(--q-accent)] underline underline-offset-4">
            سجّل الدخول
          </Link>
        </p>
      </section>
    );

  if (!res.eligible)
    return (
      <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-8 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🌿</p>
        <p className="mb-4 font-bold leading-relaxed text-[var(--q-ink)]">{res.message}</p>
        {res.reason === 'NO_MEMORIZED' && (
          <Link
            href="/quran/plan"
            className="tap inline-block rounded-2xl bg-[var(--q-accent)] px-5 py-2.5 font-extrabold text-white"
          >
            ابدأ الحفظ 🌱
          </Link>
        )}
      </section>
    );

  const c = res.candidate;
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[#dce8df] bg-gradient-to-b from-[#f4f9f5] to-white">
      <div className="p-5 text-center">
        <p aria-hidden className="mb-2 text-3xl">🧠</p>
        <p className="mb-1 text-[0.82rem] font-bold text-[var(--q-accent)]">
          غراس اختار لك مقطعًا من محفوظك — نتأكد أن الحفظ ما زال ثابتًا 🌿
        </p>
        <h2 className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          سورة {c.name}
        </h2>
        <p className="mt-1 text-[0.95rem] font-bold text-[var(--q-ink)]">
          {c.startFrom ? (
            <>ابدأ من الآية {toArabic(c.from_ayah)} — وسمّع حتى الآية {toArabic(c.to_ayah)}</>
          ) : (
            <>سمّع الآيات {toArabic(c.from_ayah)}–{toArabic(c.to_ayah)}</>
          )}
        </p>
        <p className="mt-2 text-[0.74rem] text-[var(--q-mute)]">
          بلا نصٍّ أمامك — من حفظك وحده، وخذ وقتك
        </p>
      </div>
      <Link
        href={`/quran/recite/${c.surah}/${c.from_ayah}/${c.to_ayah}?st=1`}
        className="tap block bg-[var(--q-accent)] px-5 py-3.5 text-center font-extrabold text-white transition hover:opacity-95"
      >
        🎙️ ابدأ التسميع
      </Link>
    </section>
  );
}
