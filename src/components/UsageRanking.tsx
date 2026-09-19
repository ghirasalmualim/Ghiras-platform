'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * «الأكثر استخدامًا» — ترتيبُ كلِّ الحساباتِ المسجَّلةِ لا المشترِكاتِ وحدَهنّ.
 *
 * ⚠️ لا «درجةَ استخدامٍ» مركَّبةٌ هنا عمدًا: رقمٌ واحدٌ يجمعُ أيّامًا وألعابًا
 * وطلباتِ ذكاءٍ يُخفي مصدرَه فيُضلّلُ صاحبةَ المنصّة. كلُّ مقياسٍ يُعرَضُ على
 * حدةٍ، والترتيبُ يُختارُ صراحةً.
 *
 * ⚠️ «أيّامُ النشاط» تُحصى من يومِ تشغيلِ سجلِّ النشاط (٢٠ سبتمبر ٢٠٢٦) —
 * لا تاريخَ قبلَه، فالمنصّةُ لم تكن تحفظُ الزيارات. أمّا الألعابُ والنتائجُ
 * وطلباتُ الذكاءِ فتاريخُها قائمٌ من قبل.
 */

type Row = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string | null;
  last_active: string | null;
  active_days: number;
  hits: number;
  games: number;
  results: number;
  ai_requests: number;
};

type SortKey = 'active_days' | 'hits' | 'games' | 'results' | 'ai_requests' | 'last_active';

const SPANS = [
  { days: 7, label: '٧ أيام' },
  { days: 30, label: '٣٠ يومًا' },
  { days: 90, label: '٣ أشهر' },
  { days: 3650, label: 'كل الوقت' },
] as const;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'active_days', label: 'أيام النشاط' },
  { key: 'hits', label: 'ساعات الاستخدام' },
  { key: 'games', label: 'ألعاب أنشأتها' },
  { key: 'results', label: 'نتائج طالبات' },
  { key: 'ai_requests', label: 'طلبات ذكاء' },
  { key: 'last_active', label: 'آخر ظهور' },
];

const DAY = 86_400_000;

function sinceLabel(iso: string | null): string {
  if (!iso) return 'لم تدخل قَطّ';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return 'اليوم';
  if (d === 1) return 'أمس';
  if (d < 30) return `قبل ${d} يومًا`;
  if (d < 365) return `قبل ${Math.floor(d / 30)} شهرًا`;
  return `قبل ${Math.floor(d / 365)} سنة`;
}

/** رقمُ المرتبةِ — الذهبُ للثلاثِ الأُوَل فقط، وما بعدَها رماديٌّ هادئ. */
function RankBadge({ i }: { i: number }) {
  const top = i < 3;
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${
        top ? 'bg-gold text-white' : 'bg-sage-light/60 text-sage-deep'
      }`}
    >
      {i + 1}
    </span>
  );
}

function Metric({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <span
      className={`rounded-lg px-2 py-1 text-xs font-bold ${
        n === 0
          ? 'bg-black/[.03] text-ink/35'
          : strong
            ? 'bg-sage-light/70 text-sage-deep'
            : 'bg-black/[.04] text-ink/65'
      }`}
      title={label}
    >
      {label} {n}
    </span>
  );
}

export default function UsageRanking() {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState<number>(30);
  const [sort, setSort] = useState<SortKey>('active_days');
  const [q, setQ] = useState('');
  const [hideIdle, setHideIdle] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const supabase = createClient();
    const { data, error } = await supabase.rpc('admin_usage_ranking', { p_days: days });
    if (error) {
      // الدالّةُ غيرُ منشورةٍ بعدُ على القاعدة — رسالةٌ صريحةٌ لا شاشةٌ فارغة
      setErr(
        error.message.includes('admin_usage_ranking')
          ? 'سجلّ الاستخدام غير منشور على القاعدة بعد — شغّلي ملف 2026-09-19-usage-ranking.sql.'
          : error.message
      );
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter((r) =>
        [r.full_name, r.username, r.phone].some((v) => (v ?? '').toLowerCase().includes(needle))
      );
    }
    if (hideIdle) {
      list = list.filter(
        (r) => r.active_days + r.games + r.results + r.ai_requests > 0 || r.last_active
      );
    }
    const by = (r: Row) =>
      sort === 'last_active' ? (r.last_active ? new Date(r.last_active).getTime() : 0) : r[sort];
    // نسخةٌ قبل الترتيب: sort تُبدّلُ المصفوفةَ في مكانِها والحالةُ لا تُعدَّل
    return [...list].sort((a, b) => by(b) - by(a));
  }, [rows, q, sort, hideIdle]);

  const totals = useMemo(
    () => ({
      active: rows.filter((r) => r.active_days > 0).length,
      seen: rows.filter((r) => r.last_active).length,
    }),
    [rows]
  );

  return (
    <main className="min-h-dvh px-5 py-8" dir="rtl">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-sage-deep">📈 الأكثر استخدامًا</h1>
          <div className="flex-1" />
          <Link
            href="/admin"
            className="rounded-xl border border-sage/40 bg-white px-4 py-2 text-sm font-bold text-sage-deep transition hover:border-sage"
          >
            ← لوحة التحكم
          </Link>
        </header>
        <p className="mt-2 text-sm text-ink/55">
          كل الحسابات المسجّلة — مشتركة أو لا — مرتّبة من الأكثر استخدامًا.
        </p>

        {/* المدة */}
        <div className="mt-5 flex flex-wrap gap-2">
          {SPANS.map((s) => (
            <button
              key={s.days}
              onClick={() => setDays(s.days)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                days === s.days
                  ? 'border-sage-dark bg-sage-dark text-white'
                  : 'border-sage/30 bg-white text-ink/70 hover:border-sage'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* الترتيب */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink/55">رتّبي بـ</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                sort === s.key
                  ? 'border-gold bg-gold-light/70 text-gold-dark'
                  : 'border-sage/25 bg-white text-ink/60 hover:border-sage'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو الجوال…"
            className="min-w-[200px] flex-1 rounded-xl border border-sage/30 bg-white px-4 py-2.5 outline-none transition focus:border-sage focus:ring-2 focus:ring-sage/20"
          />
          <label className="flex items-center gap-2 text-sm font-bold text-ink/65">
            <input
              type="checkbox"
              checked={hideIdle}
              onChange={(e) => setHideIdle(e.target.checked)}
              className="h-4 w-4 accent-[#5C7F60]"
            />
            أخفي من لم تدخل قَطّ
          </label>
          <button
            onClick={() => void load()}
            className="rounded-xl border border-sage/40 bg-white px-4 py-2.5 text-sm font-bold text-sage-deep transition hover:border-sage"
          >
            ↻ تحديث
          </button>
        </div>

        <p className="mt-3 text-sm font-bold text-ink/55">
          {loading
            ? 'جارٍ التحميل…'
            : `${view.length} حساب معروض · ${totals.active} نشطة في هذه المدة · ${totals.seen} دخلت المنصة مرة على الأقل`}
        </p>

        {err && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-600">
            {err}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {view.map((r, i) => (
            <li
              key={r.user_id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-sage/20 bg-white p-3.5"
            >
              <RankBadge i={i} />
              <div className="min-w-[150px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-ink">{r.full_name || '—'}</span>
                  {r.role === 'admin' && (
                    <span className="rounded-md bg-gold-light/70 px-1.5 py-0.5 text-[10px] font-bold text-gold-dark">
                      إدارة
                    </span>
                  )}
                  {r.status === 'suspended' && (
                    <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                      موقوف
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-ink/45">
                  {r.username || r.phone || '—'} · {sinceLabel(r.last_active)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Metric n={r.active_days} label="يوم" strong />
                <Metric n={r.hits} label="ساعة" strong />
                <Metric n={r.games} label="لعبة" />
                <Metric n={r.results} label="نتيجة" />
                <Metric n={r.ai_requests} label="ذكاء" />
              </div>
            </li>
          ))}
        </ul>

        {!loading && !err && view.length === 0 && (
          <p className="mt-6 text-center text-sm font-bold text-ink/45">لا نتائج</p>
        )}

        <p className="mt-8 rounded-xl bg-sage-light/30 p-4 text-xs leading-relaxed text-ink/55">
          <b>كيف تُقرأ الأرقام:</b> «يوم» = عدد الأيام التي فتحت فيها المنصة،
          و«ساعة» ≈ عدد الساعات التي كانت فيها داخلها (نبضة كل ساعة).
          <br />
          <b>مهم:</b> عدّاد الأيام والساعات بدأ من ٢٠ سبتمبر ٢٠٢٦ — قبل ذلك لم
          تكن المنصة تحفظ الزيارات أصلًا، فلا تاريخ له. أما الألعاب والنتائج
          وطلبات الذكاء فتاريخها قائم من قبل.
          <br />
          دروس استوديو الحصة غير محسوبة هنا: قاعدته منفصلة عن قاعدة المنصة.
        </p>
      </div>
    </main>
  );
}
