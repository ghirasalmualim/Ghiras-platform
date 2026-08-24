'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toArabic } from '../engine/numerals';

/**
 * شاشة «خطة حفظي» — عرضُ ما حسبه الخادم، وإدخالُ ما تقرّره الطالبة.
 *
 * ⚠️ لا حساب خطةٍ هنا: `/api/quran/plan` هو العقل، وهذه الشاشة وجه.
 * ⚠️ ولغة البناء لا الهدم: لا «فاتتك الخطة» ولا «فشلت» — الغائبة
 *   يستقبلها «نكمّل من وين وقفنا 🌿» والخطة أعادت توزيع نفسها أصلًا.
 */

type SurahOpt = { number: number; name: string; ayahs: number };

type Seg = { surah: number; from_ayah: number; to_ayah: number };
type PlanDay = {
  date: string;
  newMemorization: Seg | null;
  nearReview: Seg[];
  periodicReview: Seg[];
  weakSpotPractice: { surah: number; ayah: number; transitionDays: number }[];
  estimatedMinutes: number;
};
type PlanResponse = {
  today: string;
  goal: {
    id: string;
    surah: number;
    surahName: string;
    from_ayah: number;
    to_ayah: number;
    targetDate: string | null;
    daysOfWeek: number[];
    intensity: string;
    status: string;
    verifiedUpTo: number;
    progressPercent: number;
  } | null;
  todayDay: PlanDay | null;
  upcoming: PlanDay[];
  feasibilityMessage: string | null;
  overdue: boolean;
};

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const نطاق = (s: Seg) => `${toArabic(s.from_ayah)}–${toArabic(s.to_ayah)}`;

export default function PlanScreen({ surahs }: { surahs: SurahOpt[] }) {
  const [data, setData] = useState<PlanResponse | null | 'guest'>(null);
  const [busy, setBusy] = useState(false);
  const search = useSearchParams();

  const load = useCallback(async () => {
    const r = await fetch('/api/quran/plan');
    if (r.status === 401) return setData('guest');
    setData((await r.json()) as PlanResponse);
  }, []);
  useEffect(() => {
    void load().catch(() => setData('guest'));
  }, [load]);

  if (data === null)
    return <p className="py-14 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>;

  if (data === 'guest')
    return (
      <div className="rounded-[1.25rem] border border-dashed border-[var(--q-line)] bg-white px-5 py-12 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🌱</p>
        <p className="mb-1.5 font-bold text-[var(--q-ink)]">خطة الحفظ تحتاج حسابًا</p>
        <p className="text-[0.85rem] text-[var(--q-mute)]">
          لأنها تتابعك عبر الأيام.{' '}
          <Link href="/login?next=/quran/plan" className="font-bold text-[var(--q-accent)] underline underline-offset-4">
            سجّل الدخول
          </Link>
        </p>
      </div>
    );

  if (!data.goal || data.goal.status === 'CANCELLED' || data.goal.status === 'COMPLETED')
    return (
      <>
        {data.goal?.status === 'COMPLETED' && (
          <div className="mb-5 rounded-2xl bg-[var(--q-accent-soft)] px-5 py-6 text-center">
            <p className="text-2xl" aria-hidden>🌿</p>
            <p className="mt-1 font-[family-name:var(--font-cairo)] text-lg font-extrabold text-[var(--q-ink)]">
              اكتمل هدفك — {data.goal.surahName}
            </p>
            <p className="mt-1 text-[0.85rem] text-[var(--q-mute)]">
              مراجعته الدورية مستمرة في «مراجعة اليوم» — المحفوظ يُتعاهد ولا يُودَّع.
            </p>
          </div>
        )}
        <Wizard surahs={surahs} presetLesson={search.get('lesson')} preset={search} onCreated={load} />
      </>
    );

  const g = data.goal;
  const d = data.todayDay;

  async function cancel() {
    if (busy) return;
    setBusy(true);
    await fetch('/api/quran/goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', goalId: g.id }),
    });
    setBusy(false);
    void load();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── الهدف ── */}
      <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-[family-name:var(--font-cairo)] text-[1.1rem] font-extrabold text-[var(--q-ink)]">
            🎯 {g.surahName} — الآيات {نطاق(g)}
          </h2>
          <span className="text-[0.78rem] font-bold text-[var(--q-mute)]">
            {g.targetDate ? `الموعد: ${g.targetDate}` : 'خطة مرنة بلا موعد'}
          </span>
        </div>
        {/* تقدمي — نسبة بلا ضغط */}
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#eef3ef]">
          <div
            className="h-full rounded-full bg-[var(--q-accent)] transition-all"
            style={{ width: `${g.progressPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-[0.78rem] text-[var(--q-mute)]">
          ثبت معك حتى الآية {toArabic(g.verifiedUpTo)} · {toArabic(g.progressPercent)}٪
          {g.status === 'CONSOLIDATING' || g.status === 'FULL_RANGE_REACHED'
            ? ' · بلغتِ الآخر — نثبّت الآن 🌿'
            : ''}
        </p>
        {data.feasibilityMessage && (
          <p className="mt-3 rounded-xl bg-gold-light/60 px-4 py-3 text-[0.83rem] font-bold text-gold-dark">
            {data.feasibilityMessage}
          </p>
        )}
      </section>

      {/* ── اليوم ── */}
      <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">
            ☀️ اليوم
          </h2>
          {d && (
            <span className="text-[0.76rem] text-[var(--q-mute)]">
              حوالي {toArabic(d.estimatedMinutes)} دقائق — خذ وقتك
            </span>
          )}
        </div>
        {!d ? (
          <p className="py-4 text-center text-[0.9rem] text-[var(--q-mute)]">
            اليوم راحة من الحفظ الجديد 🌿 — والمراجعة المستحقة في «مراجعة اليوم»
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {d.newMemorization && (
              <Item
                icon="🧠"
                label={`حفظ: الآيات ${نطاق(d.newMemorization)}`}
                href={`/quran/study/${d.newMemorization.surah}/${d.newMemorization.from_ayah}/${d.newMemorization.to_ayah}`}
              />
            )}
            {d.nearReview.map((s, i) => (
              <Item key={`n${i}`} icon="🔄" label={`مراجعة قريبة: ${نطاق(s)}`} href={`/quran/study/${s.surah}/${s.from_ayah}/${s.to_ayah}`} />
            ))}
            {d.periodicReview.map((s, i) => (
              <Item key={`p${i}`} icon="🌿" label={`مراجعة دورية: ${نطاق(s)}`} href={`/quran/study/${s.surah}/${s.from_ayah}/${s.to_ayah}`} />
            ))}
            {d.weakSpotPractice.map((s, i) => (
              <Item
                key={`w${i}`}
                icon="🎯"
                label={
                  s.transitionDays >= 2 && s.ayah > 1
                    ? `تثبيت: الوصل من الآية ${toArabic(s.ayah - 1)} إلى ${toArabic(s.ayah)}`
                    : `تثبيت: الآية ${toArabic(s.ayah)}`
                }
                href={
                  s.transitionDays >= 2 && s.ayah > 1
                    ? `/quran/study/${s.surah}/${s.ayah - 1}/${s.ayah}`
                    : `/quran/study/${s.surah}/${s.ayah}/${s.ayah}`
                }
              />
            ))}
          </ul>
        )}
        {d?.newMemorization && (
          <Link
            href={`/quran/study/${d.newMemorization.surah}/${d.newMemorization.from_ayah}/${d.newMemorization.to_ayah}`}
            className="tap mt-4 block rounded-2xl bg-[var(--q-accent)] px-5 py-3 text-center font-extrabold text-white"
          >
            ابدأ
          </Link>
        )}
      </section>

      {/* ── القادم — نظرة بسيطة لا تقويم ── */}
      {data.upcoming.length > 0 && (
        <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
          <h2 className="mb-3 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">
            القادم
          </h2>
          <ul className="grid gap-1.5 text-[0.86rem] text-[var(--q-ink)]">
            {data.upcoming.map((u) => (
              <li key={u.date} className="flex items-center justify-between rounded-xl bg-[#f7faf8] px-3.5 py-2.5">
                <span className="font-bold">{DAY_NAMES[new Date(`${u.date}T00:00:00Z`).getUTCDay()]}</span>
                <span className="text-[0.8rem] text-[var(--q-mute)]">
                  {u.newMemorization
                    ? `حفظ ${نطاق(u.newMemorization)}`
                    : u.nearReview.length + u.periodicReview.length
                      ? 'مراجعة وتثبيت'
                      : 'تثبيت وربط'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="tap self-center px-3 py-2 text-[0.8rem] font-bold text-[var(--q-mute)] underline underline-offset-4 transition hover:text-[#c9463a]"
      >
        إلغاء الهدف — محفوظك ومراجعاتك تبقى كما هي
      </button>
    </div>
  );
}

function Item({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <li>
      <Link href={href} className="tap flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.92rem] text-[var(--q-ink)] transition hover:bg-[#f6f9f7]">
        <span aria-hidden className="shrink-0 text-lg">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span aria-hidden className="shrink-0 text-[var(--q-accent)]">←</span>
      </Link>
    </li>
  );
}

/* ═══════════════ «وش حاب تحفظ؟» ═══════════════ */

function Wizard({
  surahs,
  presetLesson,
  preset,
  onCreated,
}: {
  surahs: SurahOpt[];
  presetLesson: string | null;
  preset: ReturnType<typeof useSearchParams>;
  onCreated: () => void;
}) {
  const pSurah = Number(preset.get('surah')) || 112;
  const [surah, setSurah] = useState(pSurah);
  const meta = surahs.find((s) => s.number === surah);
  const [from, setFrom] = useState(Number(preset.get('from')) || 1);
  const [to, setTo] = useState(Number(preset.get('to')) || (surahs.find((s) => s.number === pSurah)?.ayahs ?? 1));
  const [target, setTarget] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [intensity, setIntensity] = useState('balanced');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const startDate = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const r = await fetch('/api/quran/goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        surah,
        from,
        to,
        startDate,
        targetDate: target || null,
        daysOfWeek: days,
        intensity,
        ...(presetLesson ? { lessonId: presetLesson } : {}),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg(
        j.error === 'OUTSIDE_LESSON'
          ? 'المدى خارج حدود درس المنهج'
          : j.error === 'BAD_TARGET'
            ? 'التاريخ المستهدف قبل اليوم'
            : 'تعذّر إنشاء الهدف — جرّب مرة ثانية'
      );
      return;
    }
    onCreated();
  }

  const chip = (active: boolean) =>
    `tap rounded-xl px-3 py-2 text-[0.82rem] font-bold transition ${
      active ? 'bg-[var(--q-accent)] text-white' : 'bg-[#eef3ef] text-[var(--q-ink)]'
    }`;

  return (
    <section className="rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5">
      <h2 className="mb-4 font-[family-name:var(--font-cairo)] text-[1.15rem] font-extrabold text-[var(--q-ink)]">
        وش حاب تحفظ؟ 🌱
      </h2>

      <label className="mb-1.5 block text-sm font-bold text-[var(--q-ink)]/80">السورة</label>
      <select
        value={surah}
        onChange={(e) => {
          const n = Number(e.target.value);
          setSurah(n);
          setFrom(1);
          setTo(surahs.find((s) => s.number === n)?.ayahs ?? 1);
        }}
        disabled={Boolean(presetLesson)}
        className="w-full rounded-xl border border-[var(--q-line)] bg-white px-4 py-2.5 outline-none focus:border-[var(--q-accent)]"
      >
        {surahs.map((s) => (
          <option key={s.number} value={s.number}>
            {s.name} · {toArabic(s.ayahs)} آية
          </option>
        ))}
      </select>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[var(--q-ink)]/80">من الآية</label>
          <input type="number" min={1} max={meta?.ayahs ?? 1} value={from} disabled={Boolean(presetLesson)}
            onChange={(e) => setFrom(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--q-line)] px-4 py-2.5 outline-none focus:border-[var(--q-accent)]" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[var(--q-ink)]/80">إلى الآية</label>
          <input type="number" min={from} max={meta?.ayahs ?? 1} value={to} disabled={Boolean(presetLesson)}
            onChange={(e) => setTo(Number(e.target.value))}
            className="w-full rounded-xl border border-[var(--q-line)] px-4 py-2.5 outline-none focus:border-[var(--q-accent)]" />
        </div>
      </div>

      <label className="mb-1.5 mt-3 block text-sm font-bold text-[var(--q-ink)]/80">
        متى تحب تخلّص؟ <span className="font-normal text-[var(--q-mute)]">(اختياري — نقدر نمشي بلا موعد)</span>
      </label>
      <input type="date" value={target} onChange={(e) => setTarget(e.target.value)}
        className="w-full rounded-xl border border-[var(--q-line)] px-4 py-2.5 outline-none focus:border-[var(--q-accent)]" />

      <label className="mb-1.5 mt-3 block text-sm font-bold text-[var(--q-ink)]/80">
        أيام الحفظ <span className="font-normal text-[var(--q-mute)]">(اتركها كلها إن كان كل يوم يناسبك)</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {DAY_NAMES.map((n, i) => (
          <button key={i} type="button" className={chip(days.includes(i))}
            onClick={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}>
            {n}
          </button>
        ))}
      </div>

      <label className="mb-1.5 mt-3 block text-sm font-bold text-[var(--q-ink)]/80">وتيرة الخطة</label>
      <div className="flex gap-1.5">
        {(
          [
            ['light', 'خفيفة 🌱'],
            ['balanced', 'متوازنة 🌿'],
            ['intense', 'مكثفة 🔥'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" className={chip(intensity === v)} onClick={() => setIntensity(v)}>
            {l}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mt-4 rounded-xl bg-gold-light/70 px-4 py-3 text-sm font-bold text-gold-dark">{msg}</p>
      )}

      <button type="button" onClick={create} disabled={busy}
        className="tap mt-5 w-full rounded-2xl bg-[var(--q-accent)] px-5 py-3 font-extrabold text-white disabled:opacity-60">
        {busy ? 'جارٍ الإنشاء…' : 'ابنِ خطتي 🌿'}
      </button>
    </section>
  );
}
