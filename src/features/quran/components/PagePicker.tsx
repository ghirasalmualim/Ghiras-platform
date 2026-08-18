'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toArabic } from '../engine/numerals';

/**
 * اختيار صفحة من المصحف.
 *
 * ── لماذا طريقتان للاختيار ──
 * «من آية إلى آية» طريقة المعلّمة، و«صفحة كذا» طريقة الحافظة. كثير من
 * الحفّاظ يحفظون بالورقة ويتذكّرون موضع الآية فيها، فمنعُهم من ذلك
 * إجبارٌ لهم على تحويل عادتهم إلى أرقام آيات في كل جلسة.
 *
 * ── لماذا الجزء أولًا ──
 * ٦٠٤ زرًا في شاشة واحدة ليست اختيارًا بل عناء. والناس يعرفون موضعهم
 * بالجزء («أنا في عمّ»)، فالجزء مدخل طبيعي يختصر الـ٦٠٤ إلى عشرين.
 *
 * ⚠️ لا يُرسَل ملف الصفحات كله إلى المتصفح: الخادم يبعث سطرًا لكل
 * صفحة (اسم أول سورة فيها) وهو أخفّ، ويبقى الملف على الخادم.
 */
export default function PagePicker({
  labels,
}: {
  /** ٦٠٤ سطرًا: اسم السورة التي تبدأ بها كل صفحة. */
  labels: string[];
}) {
  const router = useRouter();
  const total = labels.length;

  const [typed, setTyped] = useState('');
  // الجزء المفتوح — واحد فقط، فلا تطول الشاشة بلا نهاية
  const [openJuz, setOpenJuz] = useState<number | null>(null);

  const n = Number(typed);
  const valid = Number.isInteger(n) && n >= 1 && n <= total;

  function go(page: number) {
    router.push(`/quran/page/${page}`);
  }

  /** حدود صفحات الجزء — نفس تقريب `juzOfPage` معكوسًا. */
  function pagesOfJuz(j: number): number[] {
    const first = j === 1 ? 1 : (j - 1) * 20 + 2;
    const last = j === 30 ? total : j * 20 + 1;
    const out: number[] = [];
    for (let p = first; p <= last; p++) out.push(p);
    return out;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* الانتقال المباشر لمن يعرف رقمه */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) go(n);
        }}
        className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-4"
      >
        <label
          htmlFor="page-no"
          className="mb-2 block text-[0.86rem] font-bold text-[var(--q-ink)]"
        >
          اكتب رقم الصفحة
        </label>
        <div className="flex items-center gap-2">
          <input
            id="page-no"
            // ‏inputMode لتفتح لوحة الأرقام على الجوال والآيباد مباشرة
            inputMode="numeric"
            pattern="[0-9]*"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/[^\d]/g, ''))}
            placeholder={`١ – ${toArabic(total)}`}
            aria-label={`رقم الصفحة، من ١ إلى ${toArabic(total)}`}
            className="tap w-28 rounded-xl border border-[var(--q-line)] bg-[var(--q-bg)] px-3 py-2 text-center text-lg font-bold text-[var(--q-ink)] outline-none focus:border-[var(--q-accent)]"
            aria-describedby="page-hint"
          />
          <button
            type="submit"
            disabled={!valid}
            className="tap rounded-xl bg-[var(--q-accent)] px-5 py-2 text-sm font-bold text-white transition disabled:opacity-40"
          >
            افتح
          </button>
          {/* النائب يحمل المدى، فلا يُكرَّر هنا: التلميح يقول شيئًا
              جديدًا — أي سورة تبدأ بها — أو ينبّه على رقم خارج المصحف */}
          <span
            id="page-hint"
            role="status"
            className="text-[0.82rem] text-[var(--q-mute)]"
          >
            {typed === '' ? '' : valid ? `تبدأ بسورة ${labels[n - 1]}` : 'رقم خارج المصحف'}
          </span>
        </div>
      </form>

      {/* التصفّح لمن لا يعرف رقمه */}
      <div>
        <h2 className="mb-3 text-[0.86rem] font-bold text-[var(--q-ink)]">
          أو تصفّح بالأجزاء
        </h2>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
            const open = openJuz === j;
            const pages = open ? pagesOfJuz(j) : [];
            return (
              <div
                key={j}
                className="overflow-hidden rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenJuz(open ? null : j)}
                  aria-expanded={open}
                  className="tap flex w-full items-center justify-between px-4 py-3 text-right"
                >
                  <span className="font-bold text-[var(--q-ink)]">
                    الجزء {toArabic(j)}
                  </span>
                  {/* سهم لأسفل يدور عند الفتح: لا يعتمد على اتجاه
                      النص، فلا ينقلب في الواجهة العربية كما ينقلب ‹ */}
                  <span
                    aria-hidden
                    className="text-[var(--q-mute)] transition-transform"
                    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                  >
                    ⌄
                  </span>
                </button>

                {open && (
                  <div className="grid grid-cols-4 gap-2 border-t border-[var(--q-line)] p-3 sm:grid-cols-5">
                    {pages.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => go(p)}
                        className="tap rounded-xl border border-[var(--q-line)] bg-[var(--q-bg)] px-2 py-2 text-center transition hover:border-[var(--q-accent)]"
                      >
                        <span className="block text-base font-bold text-[var(--q-ink)]">
                          {toArabic(p)}
                        </span>
                        <span className="block truncate text-[0.7rem] text-[var(--q-mute)]">
                          {labels[p - 1]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
