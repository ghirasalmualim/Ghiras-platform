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
 *
 * ═══ جولة UX (٢٠٢٦-٠٨-٢٤) — شكلٌ فقط، الوظائف معتمدة ═══
 * رحلةٌ دافئة لا لوحة إدارية: بطاقة الهدف Hero بأرضية عاجية دافئة
 * وشرحٍ يفهمه الطفل تحت الشريطين، وعناصر اليوم رقائق لا قائمة،
 * والسور بطاقات مضغوطة، والتاريخ خطٌّ حقيقي بنقاطه، والمحتوى يحدد
 * الارتفاع — لا فراغات. والجموع العربية تُصاغ بعددها
 * (`countAr`): مراجعة واحدة · مراجعتان · ٣ مراجعات · ١١ مراجعة.
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

const BUCKET_META: Record<string, { label: string; icon: string }> = {
  MEMORIZING_NOW: { label: 'جاري الحفظ', icon: '🌱' },
  MEMORIZED_REVIEWED: { label: 'حفظتها وراجعتها', icon: '✅' },
  STARTED_BEFORE: { label: 'بدأت بها سابقًا', icon: '🕊️' },
};

const fmtDay = (d: string) => {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
};

/**
 * جمعٌ عربي سليم بعدده: ١ مفرد · ٢ مثنى · ٣–١٠ جمع قلة بالرقم ·
 * ١١+ مفرد تمييزٍ بالرقم. «عندك ٢ مراجعتان» لحنٌ لا يُعرض لطفل.
 */
function countAr(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${toArabic(n)} ${few}`;
  return `${toArabic(n)} ${many}`;
}

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
      <Card className="border-dashed py-10 text-center">
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
      <Card className="py-8 text-center">
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
  const todayChips: { icon: string; label: string }[] = [];
  if (d?.newMemorization) todayChips.push({ icon: '🧠', label: 'حفظ جديد' });
  if (d?.nearReview.length) todayChips.push({ icon: '🔄', label: 'مراجعة قريبة' });
  if (d?.periodicReview.length) todayChips.push({ icon: '🌿', label: 'مراجعة دورية' });
  if (d?.weakSpotPractice.length) todayChips.push({ icon: '🎯', label: 'تثبيت موضع' });

  return (
    <div className="flex flex-col gap-4">
      {/* ══ Hero — الهدف الحالي ══ */}
      {g ? (
        <section className="overflow-hidden rounded-[1.5rem] border border-[#dce8df] bg-gradient-to-b from-[#f4f9f5] to-white shadow-[0_1px_10px_rgba(74,111,88,0.07)]">
          <div className="p-5 pb-4">
            <p className="mb-1.5 text-[0.82rem] font-bold text-[var(--q-accent)]">نكمل رحلتنا؟ 🌿</p>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-[family-name:var(--font-cairo)] text-[1.45rem] font-extrabold leading-tight text-[var(--q-ink)]">
                سورة {g.name}
              </h2>
              <span className="text-[0.78rem] font-bold text-[var(--q-mute)]">
                الآيات {toArabic(g.from)}–{toArabic(g.to)}
                {g.source === 'curriculum' ? ' · من منهجي' : ''}
              </span>
            </div>
            {g.targetDate && (
              <p className="mt-0.5 text-[0.76rem] text-[var(--q-mute)]">موعد الهدف {fmtDay(g.targetDate)}</p>
            )}

            {/* ⚠️ شريطان لا شريطٌ يكذب: الوصول ≠ التثبيت — بشرحٍ يفهمه طفل */}
            <div className="mt-4 grid gap-3">
              <Bar
                label="🧠 وصلت إليه"
                hint="ما حفظته حتى الآن"
                value={g.reached}
                total={g.total}
                tone="reach"
              />
              <Bar
                label="🌟 مثبت جيدًا"
                hint="ما راجعته وثبت معك"
                value={g.settled}
                total={g.total}
                tone="settle"
              />
            </div>
            {(g.status === 'CONSOLIDATING' || g.status === 'FULL_RANGE_REACHED') && (
              <p className="mt-3 rounded-xl bg-[var(--q-accent-soft)] px-3.5 py-2 text-[0.8rem] font-bold text-[var(--q-ink)]">
                بلغتِ آخر المدى — نثبّت الآن حتى يرسخ 🌿
              </p>
            )}
          </div>
          <Link
            href="/quran/plan"
            className="tap block bg-[var(--q-accent)] px-5 py-3.5 text-center font-extrabold text-white transition hover:opacity-95"
          >
            أكمل من حيث توقفت ←
          </Link>
        </section>
      ) : (
        <Card className="py-6 text-center">
          <p className="mb-3 font-bold text-[var(--q-ink)]">ما عندك هدف حفظ حالي</p>
          <Cta href="/quran/plan" solid>ابدأ هدفًا جديدًا 🌱</Cta>
        </Card>
      )}

      {/* ══ اليوم — رقائق لا قائمة ══ */}
      {todayChips.length > 0 && d && (
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">☀️ اليوم</h2>
            <span className="text-[0.74rem] text-[var(--q-mute)]">حوالي {toArabic(d.estimatedMinutes)} دقائق</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {todayChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#eef5f0] px-3 py-1.5 text-[0.82rem] font-bold text-[#3c6650]"
              >
                <span aria-hidden>{c.icon}</span> {c.label}
              </span>
            ))}
          </div>
          <Cta href="/quran/plan" solid className="mt-3 w-full">ابدأ خطة اليوم</Cta>
        </Card>
      )}

      {/* ══ مراجعة اليوم ══ */}
      <Card className={data.dueToday > 0 ? '' : 'py-3.5'}>
        {data.dueToday > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="font-bold text-[var(--q-ink)]">
              عندك {countAr(data.dueToday, 'مراجعة واحدة', 'مراجعتان', 'مراجعات', 'مراجعة')} اليوم 🌿
            </p>
            <Cta href="/quran/review" solid>ابدأ المراجعة</Cta>
          </div>
        ) : (
          <p className="text-center text-[0.92rem] font-bold text-[var(--q-ink)]">مراجعاتك اليوم مكتملة ✅</p>
        )}
      </Card>

      {/* ══ مواضع نثبّتها ══ */}
      {data.spots.length > 0 && (
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            عندنا {countAr(data.spots.length, 'موضع نثبّته معًا', 'موضعان نثبّتهما معًا', 'مواضع نثبّتها معًا', 'موضعًا نثبّتها معًا')} 🎯
          </h2>
          <ul className="grid gap-1">
            {data.spots.slice(0, 4).map((s, i) => (
              <li key={i}>
                <Link
                  href={s.kind === 'transition' ? `/quran/study/${s.surah}/${s.ayah - 1}/${s.ayah}` : `/quran/study/${s.surah}/${s.ayah}/${s.ayah}`}
                  className="tap flex items-center gap-2.5 rounded-xl bg-[#fbf9f2] px-3 py-2.5 text-[0.86rem] text-[var(--q-ink)] transition hover:bg-[#f4f0e2]"
                >
                  <span aria-hidden className="shrink-0">{s.kind === 'transition' ? '🔗' : '📍'}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.kind === 'transition'
                      ? `${s.name} — الوصل بين الآيتين ${toArabic(s.ayah - 1)} و${toArabic(s.ayah)}`
                      : `${s.name} — الآية ${toArabic(s.ayah)}`}
                  </span>
                  <span aria-hidden className="shrink-0 text-[var(--q-accent)]">←</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ══ سوري — بطاقات مضغوطة ══ */}
      {data.surahs.length > 0 && (
        <Card>
          <h2 className="mb-2.5 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">سوري</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.surahs.map((s) => {
              const meta = BUCKET_META[s.bucket] ?? BUCKET_META.STARTED_BEFORE;
              return (
                <Link
                  key={s.surah}
                  href={`/quran/journey/${s.surah}`}
                  className="tap rounded-2xl border border-[#e4ece6] bg-[#fafcfa] px-3.5 py-3 transition hover:border-[#cfe0d5] hover:bg-white"
                >
                  <span className="block truncate font-[family-name:var(--font-cairo)] text-[0.96rem] font-extrabold text-[var(--q-ink)]">
                    {s.name}
                  </span>
                  <span className="mt-0.5 block text-[0.72rem] font-bold text-[var(--q-mute)]">
                    <span aria-hidden>{meta.icon}</span> {meta.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* ══ حديقتي — مكافأة عاطفية ══ */}
      <section className="overflow-hidden rounded-[1.25rem] border border-[#dfe9d9] bg-gradient-to-l from-[#f3f8ee] to-[#fbfdf9]">
        <div className="flex items-center gap-4 p-4">
          <span aria-hidden className="text-3xl">🌱</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">حديقتي</h2>
            <p className="mt-0.5 text-[0.8rem] text-[var(--q-mute)]">
              {data.garden.current ? '🌱 نبتة تنمو الآن' : '🌱 بانتظار أول بذرة'}
              {' · '}
              🌳 {countAr(data.garden.completedPlants, 'نبتة مكتملة', 'نبتتان مكتملتان', 'نباتات مكتملة', 'نبتة مكتملة')}
            </p>
          </div>
          <Cta href="/quran/garden">زوريها</Cta>
        </div>
      </section>

      {/* ══ من رحلتي — خطٌّ حقيقي بنقاطه ══ */}
      {data.timeline.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">من رحلتي</h2>
            {data.journeySince && (
              <span className="text-[0.68rem] text-[var(--q-mute)]">منذ {fmtDay(data.journeySince)}</span>
            )}
          </div>
          <ol className="mt-3 border-r-2 border-[#e0eae3] pr-4">
            {data.timeline.slice(0, 4).map((t, i) => (
              <li key={i} className="relative pb-3.5 last:pb-0">
                <span
                  aria-hidden
                  className="absolute -right-[1.45rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--q-accent)]"
                />
                <p className="text-[0.86rem] font-bold leading-snug text-[var(--q-ink)]">
                  {t.label}
                  {t.name ? ` — ${t.name}` : ''}
                </p>
                <p className="text-[0.7rem] tabular-nums text-[var(--q-mute)]">{fmtDay(t.day)}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ══ أهدافي السابقة — صفوف مضغوطة ══ */}
      {data.pastGoals.length > 0 && (
        <Card>
          <h2 className="mb-2 font-[family-name:var(--font-cairo)] text-[1.02rem] font-extrabold text-[var(--q-ink)]">أهدافي السابقة</h2>
          <ul className="grid gap-1.5">
            {data.pastGoals.map((p, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-xl bg-[#fafcfa] px-3.5 py-2.5 text-[0.85rem]"
              >
                <span className="min-w-0 truncate font-bold text-[var(--q-ink)]">
                  <span aria-hidden>{p.status === 'COMPLETED' ? '✅' : '🕊️'}</span> {p.name}{' '}
                  <span className="text-[0.74rem] font-normal text-[var(--q-mute)]">
                    {toArabic(p.from)}–{toArabic(p.to)}
                  </span>
                </span>
                <span className="shrink-0 text-[0.72rem] font-bold text-[var(--q-mute)]">
                  {p.status === 'COMPLETED' ? 'اكتمل وما زال في مراجعتك' : 'هدف سابق'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ══ أرقام قليلة بلا مراقبة ══ */}
      <Card>
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 text-center sm:grid-cols-4">
          <Stat n={data.stats.goalsCompleted} label="أهداف مكتملة" />
          <Stat n={data.stats.surahsStarted} label="سور بدأت بها" />
          <Stat n={data.stats.reviewsThisWeek} label="مراجعات هذا الأسبوع" />
          <Stat n={data.stats.activeDaysThisMonth} label="أيام نشاط هذا الشهر" />
        </div>
        {data.stats.activeDaysThisMonth > 0 && (
          <p className="mt-3 border-t border-[#eef3ef] pt-2.5 text-center text-[0.8rem] font-bold text-[#3c6650]">
            نشطت مع القرآن {countAr(data.stats.activeDaysThisMonth, 'يومًا واحدًا', 'يومين', 'أيام', 'يومًا')} هذا الشهر 🌿
          </p>
        )}
      </Card>

      {/* دليل رموز خريطة الآيات — تظهر في صفحة السورة */}
      <p className="px-2 pb-1 text-center text-[0.68rem] leading-relaxed text-[var(--q-mute)]">
        {Object.values(AYAH_STATE_META)
          .map((m) => `${m.symbol} ${m.label}`)
          .join(' · ')}
      </p>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.25rem] border border-[var(--q-line)] bg-white p-4 ${className}`}>
      {children}
    </section>
  );
}

function Cta({ href, children, solid, className = '' }: { href: string; children: React.ReactNode; solid?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={`tap inline-block rounded-2xl px-4 py-2.5 text-center text-[0.86rem] font-extrabold transition ${
        solid ? 'bg-[var(--q-accent)] text-white hover:opacity-95' : 'bg-[#eef3ef] text-[var(--q-ink)] hover:bg-[var(--q-accent-soft)]'
      } ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * شريط تقدّم — قيمةٌ ووسمٌ وشرحٌ ورقم، لا لون وحده. وrole=progressbar
 * لقارئات الشاشة.
 */
function Bar({ label, hint, value, total, tone }: { label: string; hint: string; value: number; total: number; tone: 'reach' | 'settle' }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-[0.8rem]">
        <span className="font-extrabold text-[var(--q-ink)]">
          {label} <span className="text-[0.7rem] font-normal text-[var(--q-mute)]">— {hint}</span>
        </span>
        <span className="font-bold tabular-nums text-[var(--q-mute)]">{toArabic(value)}/{toArabic(total)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${label} — ${hint}`}
        className="h-3 overflow-hidden rounded-full bg-[#e9efe9]"
      >
        <div
          className={`h-full rounded-full transition-all motion-reduce:transition-none ${tone === 'settle' ? 'bg-[var(--q-accent)]' : 'bg-[#b9d3c1]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold tabular-nums leading-none text-[var(--q-accent)]">
        {toArabic(n)}
      </p>
      <p className="mt-1 text-[0.74rem] font-bold text-[var(--q-ink)]/70">{label}</p>
    </div>
  );
}
