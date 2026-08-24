'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toArabic } from '../engine/numerals';
import { AYAH_STATE_META } from '../engine/journey';

/**
 * 📖 رحلتي مع القرآن — وجهٌ هادئ لبياناتٍ مشتقّة.
 *
 * ⚠️ الشاشة لا تحسب شيئًا: `/api/quran/journey` طلبٌ واحد يجمع كل
 * شيء، و`/api/quran/plan` لبطاقة اليوم (نفس مصدر المرحلة ٧ — لا
 * نسخة من منطقها).
 *
 * ⚠️ لغةُ بناء: لا لفظ يهدم ولا عدٌّ متواصل يُهدَّد بفقده. والهدف
 * غير المكتمل «هدف سابق» لا سقوط. والفارغ بدايةٌ («رحلتك تبدأ من
 * أول خطوة 🌱») لا صفحة حزينة.
 */

type Journey = {
  today: string;
  goal: {
    surah: number; name: string; from: number; to: number;
    targetDate: string | null; status: string; source: string;
    reached: number; settled: number; total: number;
  } | null;
  dueToday: number;
  spots: { surah: number; name: string; kind: 'transition' | 'spot'; ayah: number }[];
  surahs: { surah: number; name: string; bucket: string }[];
  timeline: { day: string; label: string; name: string | null }[];
  journeySince: string | null;
  pastGoals: { surah: number; name: string; from: number; to: number; status: string; source: string; completedAt: string | null }[];
  garden: { completedPlants: number; current: { type: string; dropsUsed: number } | null };
  stats: { goalsCompleted: number; surahsStarted: number; reviewsThisWeek: number; activeDaysThisMonth: number };
};

type PlanToday = {
  todayDay: {
    newMemorization: { surah: number; from_ayah: number; to_ayah: number } | null;
    nearReview: unknown[]; periodicReview: unknown[]; weakSpotPractice: unknown[];
    estimatedMinutes: number;
  } | null;
} | null;

const BUCKET_LABEL: Record<string, string> = {
  MEMORIZING_NOW: '🌱 جاري الحفظ',
  MEMORIZED_REVIEWED: '✅ حفظتها وراجعتها',
  STARTED_BEFORE: '🕊️ بدأت بها سابقًا',
};

const fmtDay = (d: string) => {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
};

export default function JourneyScreen() {
  const [data, setData] = useState<Journey | null | 'guest'>(null);
  const [plan, setPlan] = useState<PlanToday>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetch('/api/quran/journey');
      if (!alive) return;
      if (r.status === 401) return setData('guest');
      setData((await r.json()) as Journey);
      try {
        const p = await fetch('/api/quran/plan');
        if (alive && p.ok) setPlan((await p.json()) as PlanToday);
      } catch {
        /* بطاقة اليوم اختيارية */
      }
    })().catch(() => alive && setData('guest'));
    return () => { alive = false; };
  }, []);

  if (data === null) return <p className="py-14 text-center text-[var(--q-mute)]">جارٍ التحميل…</p>;

  if (data === 'guest')
    return (
      <Card className="border-dashed py-12 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🌱</p>
        <p className="mb-1.5 font-bold text-[var(--q-ink)]">رحلتك تحتاج حسابًا</p>
        <p className="text-[0.85rem] text-[var(--q-mute)]">
          لأنها تتابعك عبر الأيام.{' '}
          <Link href="/login?next=/quran/journey" className="font-bold text-[var(--q-accent)] underline underline-offset-4">
            سجّل الدخول
          </Link>
        </p>
      </Card>
    );

  const empty = !data.goal && !data.surahs.length && !data.timeline.length;
  if (empty)
    return (
      <Card className="py-10 text-center">
        <p className="mb-2 text-3xl" aria-hidden>🌱</p>
        <p className="mb-1 font-[family-name:var(--font-cairo)] text-lg font-extrabold text-[var(--q-ink)]">
          رحلتك تبدأ من أول خطوة
        </p>
        <p className="mb-5 text-[0.85rem] text-[var(--q-mute)]">وكل رحلةٍ عظيمة بدأت بآية</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Cta href="/quran/plan" solid>ابدأ هدف حفظ</Cta>
          <Cta href="/quran/browse">اقرأ القرآن</Cta>
          <Cta href="/quran/review">راجع محفوظك</Cta>
        </div>
      </Card>
    );

  const g = data.goal;
  const d = plan?.todayDay;
  const todayItems = d
    ? (d.newMemorization ? 1 : 0) + d.nearReview.length + d.periodicReview.length + d.weakSpotPractice.length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── الهدف الحالي ── */}
      {g ? (
        <Card>
          <p className="mb-1 text-[0.8rem] font-bold text-[var(--q-mute)]">نكمل رحلتنا؟ 🌿</p>
          <h2 className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
            سورة {g.name}
          </h2>
          <p className="mt-0.5 text-[0.85rem] text-[var(--q-mute)]">
            الآيات {toArabic(g.from)}–{toArabic(g.to)}
            {g.targetDate ? ` · موعد الهدف ${fmtDay(g.targetDate)}` : ' · خطة مرنة'}
            {g.source === 'curriculum' ? ' · من منهجي' : ''}
          </p>

          {/* ⚠️ شريطان لا شريطٌ يكذب: الوصول ≠ التثبيت */}
          <div className="mt-4 grid gap-2.5">
            <Bar label="🧠 وصلت إليه" value={g.reached} total={g.total} tone="reach" />
            <Bar label="✓ مثبت جيدًا" value={g.settled} total={g.total} tone="settle" />
          </div>
          <p className="mt-2 text-[0.78rem] text-[var(--q-mute)]">
            {g.status === 'CONSOLIDATING' || g.status === 'FULL_RANGE_REACHED'
              ? 'بلغتِ آخر المدى — نثبّت الآن حتى يرسخ 🌿'
              : `وصلت إلى ${toArabic(g.reached)} من ${toArabic(g.total)} آية`}
          </p>
          <Cta href="/quran/plan" solid className="mt-4 w-full">أكمل من حيث توقفت</Cta>
        </Card>
      ) : (
        <Card className="text-center">
          <p className="mb-2 font-bold text-[var(--q-ink)]">ما عندك هدف حفظ حالي</p>
          <Cta href="/quran/plan" solid>ابدأ هدفًا جديدًا 🌱</Cta>
        </Card>
      )}

      {/* ── ☀️ اليوم ── */}
      {d && todayItems > 0 && (
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">☀️ اليوم</h2>
            <span className="text-[0.76rem] text-[var(--q-mute)]">حوالي {toArabic(d.estimatedMinutes)} دقائق</span>
          </div>
          <ul className="mt-2 grid gap-1 text-[0.88rem] text-[var(--q-ink)]">
            {d.newMemorization && <li>🧠 حفظ جديد</li>}
            {d.nearReview.length > 0 && <li>🔄 مراجعة قريبة</li>}
            {d.periodicReview.length > 0 && <li>🌿 مراجعة دورية</li>}
            {d.weakSpotPractice.length > 0 && <li>🎯 تثبيت موضع</li>}
          </ul>
          <Cta href="/quran/plan" solid className="mt-3 w-full">ابدأ خطة اليوم</Cta>
        </Card>
      )}

      {/* ── مراجعة اليوم ── */}
      <Card>
        {data.dueToday > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-[var(--q-ink)]">
              عندك {toArabic(data.dueToday)}{' '}
              {data.dueToday === 1 ? 'مراجعة' : data.dueToday === 2 ? 'مراجعتان' : 'مراجعات'} اليوم 🌿
            </p>
            <Cta href="/quran/review" solid>ابدأ المراجعة</Cta>
          </div>
        ) : (
          <p className="text-center font-bold text-[var(--q-ink)]">مراجعاتك اليوم مكتملة ✅</p>
        )}
      </Card>

      {/* ── مواضع نثبتها ── */}
      {data.spots.length > 0 && (
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">
            🎯 {data.spots.length === 1 ? 'في عندنا موضع نثبّته معًا' : data.spots.length === 2 ? 'في عندنا موضعان نثبّتهما معًا' : 'في عندنا مواضع نثبّتها معًا'}
          </h2>
          <ul className="grid gap-1.5">
            {data.spots.slice(0, 4).map((s, i) => (
              <li key={i}>
                <Link
                  href={s.kind === 'transition' ? `/quran/study/${s.surah}/${s.ayah - 1}/${s.ayah}` : `/quran/study/${s.surah}/${s.ayah}/${s.ayah}`}
                  className="tap flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.88rem] text-[var(--q-ink)] transition hover:bg-[#f6f9f7]"
                >
                  <span aria-hidden>{s.kind === 'transition' ? '🔗' : '📍'}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.kind === 'transition'
                      ? `${s.name} — الوصل بين الآيتين ${toArabic(s.ayah - 1)} و${toArabic(s.ayah)}`
                      : `${s.name} — الآية ${toArabic(s.ayah)}`}
                  </span>
                  <span aria-hidden className="text-[var(--q-accent)]">←</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── سوري ── */}
      {data.surahs.length > 0 && (
        <Card>
          <h2 className="mb-3 font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">سوري</h2>
          {(['MEMORIZING_NOW', 'MEMORIZED_REVIEWED', 'STARTED_BEFORE'] as const).map((bucket) => {
            const list = data.surahs.filter((s) => s.bucket === bucket);
            if (!list.length) return null;
            return (
              <div key={bucket} className="mb-3 last:mb-0">
                <h3 className="mb-1.5 text-[0.8rem] font-extrabold text-[var(--q-mute)]">{BUCKET_LABEL[bucket]}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => (
                    <Link
                      key={s.surah}
                      href={`/quran/journey/${s.surah}`}
                      className="tap rounded-xl bg-[#eef3ef] px-3.5 py-2 text-[0.85rem] font-bold text-[var(--q-ink)] transition hover:bg-[var(--q-accent-soft)]"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* ── حديقتي ── */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">🌱 حديقتي</h2>
            <p className="mt-0.5 text-[0.82rem] text-[var(--q-mute)]">
              {data.garden.completedPlants > 0
                ? `${toArabic(data.garden.completedPlants)} ${data.garden.completedPlants === 1 ? 'نبتة مكتملة' : 'نباتات مكتملة'}`
                : 'حديقتك بانتظار أول بذرة'}
              {data.garden.current ? ' · ونبتتك الحالية تنمو' : ''}
            </p>
          </div>
          <Cta href="/quran/garden">اذهب إلى حديقتي</Cta>
        </div>
      </Card>

      {/* ── من رحلتي ── */}
      {data.timeline.length > 0 && (
        <Card>
          <h2 className="mb-1 font-[family-name:var(--font-cairo)] text-[1.05rem] font-extrabold text-[var(--q-ink)]">من رحلتي</h2>
          {data.journeySince && (
            <p className="mb-3 text-[0.74rem] text-[var(--q-mute)]">منذ بدء تسجيل رحلتك في {fmtDay(data.journeySince)}</p>
          )}
          <ol className="grid gap-2">
            {data.timeline.map((t, i) => (
              <li key={i} className="flex items-baseline gap-3 text-[0.86rem]">
                <span className="shrink-0 text-[0.72rem] tabular-nums text-[var(--q-mute)]">{fmtDay(t.day)}</span>
                <span className="text-[var(--q-ink)]">
                  {t.label}
                  {t.name ? ` — ${t.name}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ── أهدافي السابقة ── */}
      {data.pastGoals.length > 0 && (
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">أهدافي السابقة</h2>
          <ul className="grid gap-1.5 text-[0.86rem]">
            {data.pastGoals.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7faf8] px-3.5 py-2.5">
                <span className="min-w-0 truncate font-bold text-[var(--q-ink)]">
                  {p.status === 'COMPLETED' ? '✅ ' : '🕊️ '}
                  {p.name} {toArabic(p.from)}–{toArabic(p.to)}
                </span>
                <span className="shrink-0 text-[0.74rem] text-[var(--q-mute)]">
                  {p.status === 'COMPLETED'
                    ? `اكتمل${p.completedAt ? ` في ${fmtDay(p.completedAt)}` : ''} · ما زال في مراجعتك`
                    : 'هدف سابق'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── أرقام قليلة بلا مراقبة ── */}
      <Card>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <Stat n={data.stats.goalsCompleted} label="أهداف مكتملة" />
          <Stat n={data.stats.surahsStarted} label="سور بدأت بها" />
          <Stat n={data.stats.reviewsThisWeek} label="مراجعات هذا الأسبوع" />
          <Stat n={data.stats.activeDaysThisMonth} label="أيام نشاط هذا الشهر" />
        </div>
        {data.stats.activeDaysThisMonth > 0 && (
          <p className="mt-3 text-center text-[0.8rem] text-[var(--q-mute)]">
            نشطت مع القرآن {toArabic(data.stats.activeDaysThisMonth)}{' '}
            {data.stats.activeDaysThisMonth === 1 ? 'يومًا' : 'أيام'} هذا الشهر 🌿
          </p>
        )}
      </Card>

      {/* دليل رموز خريطة الآيات — تظهر في صفحة السورة */}
      <p className="px-2 text-center text-[0.7rem] text-[var(--q-mute)]">
        {Object.values(AYAH_STATE_META)
          .map((m) => `${m.symbol} ${m.label}`)
          .join(' · ')}
      </p>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.25rem] border border-[var(--q-line)] bg-white p-5 ${className}`}>
      {children}
    </section>
  );
}

function Cta({ href, children, solid, className = '' }: { href: string; children: React.ReactNode; solid?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={`tap inline-block rounded-2xl px-4 py-2.5 text-center text-[0.88rem] font-extrabold transition ${
        solid ? 'bg-[var(--q-accent)] text-white hover:opacity-95' : 'bg-[#eef3ef] text-[var(--q-ink)] hover:bg-[var(--q-accent-soft)]'
      } ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * شريط تقدّم — قيمةٌ ووسمٌ ورقم، لا لون وحده. وrole=progressbar
 * لقارئات الشاشة.
 */
function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'reach' | 'settle' }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[0.78rem]">
        <span className="font-bold text-[var(--q-ink)]">{label}</span>
        <span className="tabular-nums text-[var(--q-mute)]">{toArabic(value)}/{toArabic(total)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="h-2.5 overflow-hidden rounded-full bg-[#eef3ef]"
      >
        <div
          className={`h-full rounded-full transition-all motion-reduce:transition-none ${tone === 'settle' ? 'bg-[var(--q-accent)]' : 'bg-[#a8c5b2]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-[family-name:var(--font-cairo)] text-xl font-extrabold tabular-nums text-[var(--q-ink)]">{toArabic(n)}</p>
      <p className="text-[0.72rem] text-[var(--q-mute)]">{label}</p>
    </div>
  );
}
