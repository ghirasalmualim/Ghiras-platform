'use client';
/**
 * غراس للمحاسبة — Stage 11: العدة المشتركة لواجهة المالكة.
 *
 * كل نص يمر من طبقة المفردات t() حصرًا (UX-004) — لا نص مالي حرفي
 * في المكوّنات. البيانات من مسارات /api/accounting/owner/* فقط
 * (fail-closed في الخادم). كاش «اشرح» بلا أسرار: DTO مالكة مُعقّم
 * فقط، مفاتيحه معزولة بالمستخدم والشركة والنسخة، ويُطهَّر عند فقدان
 * الجلسة (C12) — والنسخة المحفوظة تُعلن نفسها ولا تتنكر رقمًا حيًا.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { OWNER_VOCAB, t } from '@/lib/accounting/owner/vocabulary';
import type { OwnerKey } from '@/lib/accounting/owner/vocabulary';
import type { DashboardCard, ExplainNode, InboxItemDTO, OwnerStatus } from '@/lib/accounting/owner/dto';

export { t };
export type { OwnerKey, DashboardCard, ExplainNode, InboxItemDTO, OwnerStatus };

// ── سياق الشركة ──
interface CompanyInfo { id: string; name: string; role: string; baseCurrency: string }
interface CurrencyInfo { code: string; minorUnit: number; symbol: string | null }

interface OwnerCtx {
  loading: boolean;
  denied: boolean;
  userId: string | null;
  companies: CompanyInfo[];
  company: CompanyInfo | null;
  setCompanyId: (id: string) => void;
  currencies: CurrencyInfo[];
}

const Ctx = createContext<OwnerCtx>({
  loading: true, denied: false, userId: null, companies: [],
  company: null, setCompanyId: () => {}, currencies: [],
});

export const useOwner = () => useContext(Ctx);

const CACHE_PREFIX = 'ghiras-owner-';

function purgeOwnerCache() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch { /* لا تخزين متاح — لا شيء يُطهَّر */ }
}

export function OwnerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<OwnerCtx, 'setCompanyId'>>({
    loading: true, denied: false, userId: null, companies: [], company: null, currencies: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/accounting/owner/context');
        if (!alive) return;
        if (res.status === 401 || res.status === 403) {
          purgeOwnerCache();  // C12: فقدان الجلسة يطهّر كاش المالكة
          setState((s) => ({ ...s, loading: false, denied: true }));
          return;
        }
        const data = await res.json();
        const companies: CompanyInfo[] = data.companies ?? [];
        let chosen: CompanyInfo | null = null;
        try {
          const saved = localStorage.getItem(`${CACHE_PREFIX}company`);
          chosen = companies.find((c) => c.id === saved) ?? null;
        } catch { /* بدون تخزين: أول شركة */ }
        setState({
          loading: false, denied: companies.length === 0,
          userId: data.userId ?? null, companies,
          company: chosen ?? companies[0] ?? null,
          currencies: data.currencies ?? [],
        });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false, denied: true }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const setCompanyId = useCallback((id: string) => {
    setState((s) => {
      const company = s.companies.find((c) => c.id === id) ?? s.company;
      try { localStorage.setItem(`${CACHE_PREFIX}company`, id); } catch { /* اختياري */ }
      return { ...s, company };
    });
  }, []);

  const value = useMemo(() => ({ ...state, setCompanyId }), [state, setCompanyId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── تنسيق المبالغ: minor نصًّا → عرض بدقة العملة — لا Number أبدًا ──
export function useMoneyFmt() {
  const { currencies } = useOwner();
  return useCallback((minorStr: string | null, code: string | null): string => {
    if (minorStr === null || code === null) return '—';
    const cur = currencies.find((c) => c.code === code);
    const minorUnit = cur?.minorUnit ?? 3;
    const neg = minorStr.startsWith('-');
    const digits = (neg ? minorStr.slice(1) : minorStr).padStart(minorUnit + 1, '0');
    const whole = digits.slice(0, digits.length - minorUnit) || '0';
    const frac = minorUnit > 0 ? digits.slice(digits.length - minorUnit) : '';
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const symbol = cur?.symbol ?? code;
    return `${neg ? '−' : ''}${grouped}${frac ? `.${frac}` : ''} ${symbol}`;
  }, [currencies]);
}

// ── شارة الحالة — الصدق حالةً أولى (ZERO ≠ UNKNOWN ≠ …) ──
const STATUS_KEY: Record<OwnerStatus, OwnerKey> = {
  FINAL: 'STATUS_FINAL', PROVISIONAL: 'STATUS_PROVISIONAL', STALE: 'STATUS_STALE',
  UNKNOWN: 'STATUS_UNKNOWN', NOT_CONFIGURED: 'STATUS_NOT_CONFIGURED',
};
const STATUS_STYLE: Record<OwnerStatus, string> = {
  FINAL: 'bg-sage-light text-sage-deep',
  PROVISIONAL: 'bg-gold-light text-gold-dark',
  STALE: 'bg-gold-light text-gold-dark',
  UNKNOWN: 'bg-amber-100 text-amber-800',
  NOT_CONFIGURED: 'bg-gray-200 text-gray-600',
};

export function StatusChip({ status }: { status: OwnerStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
      {t(STATUS_KEY[status])}
    </span>
  );
}

export function tp(key: OwnerKey, params?: Record<string, string>): string {
  return t(key, params);
}

// ── ورقة «اشرح أي رقم» — REP-006 + كاش صادق (C12) ──
interface CachedExplain { tree: ExplainNode; cachedAt: string }

function explainCacheKey(userId: string, companyId: string, card: string) {
  return `${CACHE_PREFIX}explain:${userId}:${companyId}:${card}:v1`;
}

export function useExplain(card: string | null) {
  const { userId, company } = useOwner();
  const [tree, setTree] = useState<ExplainNode | null>(null);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!card || !company || !userId) { setTree(null); setOfflineAt(null); return; }
    let alive = true;
    setLoading(true); setTree(null); setOfflineAt(null);
    const key = explainCacheKey(userId, company.id, card);
    (async () => {
      try {
        const res = await fetch(`/api/accounting/owner/explain?company_id=${company.id}&card=${card}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!alive) return;
        setTree(data.tree); setLoading(false);
        try {
          localStorage.setItem(key, JSON.stringify(
            { tree: data.tree, cachedAt: new Date().toISOString() } satisfies CachedExplain));
        } catch { /* التخزين اختياري */ }
      } catch {
        if (!alive) return;
        // النسخة المحفوظة تُعرض بهويتها الصريحة — لا تنكّر رقمًا حيًا
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const cached = JSON.parse(raw) as CachedExplain;
            setTree(cached.tree); setOfflineAt(cached.cachedAt);
          }
        } catch { /* كاش تالف = لا كاش */ }
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [card, company, userId]);

  return { tree, offlineAt, loading };
}

export function ExplainTree({ node, depth = 0 }: { node: ExplainNode; depth?: number }) {
  const fmt = useMoneyFmt();
  const label = node.labelKey ? t(node.labelKey) : (node.label ?? '');
  const amount = node.value.scalar !== null && node.value.scalar !== undefined
    ? node.value.scalar
    : fmt(node.value.amountMinor, node.value.currency);
  return (
    <div className={depth > 0 ? 'mr-3 border-r-2 border-sage-light pr-3' : ''}>
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className={depth === 0 ? 'font-bold text-ink' : 'text-sm text-ink/90'}>{label}</span>
        <span className="flex items-center gap-2">
          <span className="font-tajawal tabular-nums text-sm font-semibold">{amount}</span>
          <StatusChip status={node.status} />
        </span>
      </div>
      {node.noteKey && (
        <p className="pb-1 text-xs text-ink/60">{t(node.noteKey, node.noteParams)}</p>
      )}
      {(node.children ?? []).map((c, i) => (
        <ExplainTree key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ExplainSheet({ card, onClose }: { card: string | null; onClose: () => void }) {
  const { tree, offlineAt, loading } = useExplain(card);
  if (!card) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose} role="dialog" aria-label={t('EXPLAIN_TITLE')}>
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-cream p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-lg">{t('EXPLAIN_TITLE')}</h2>
          <button onClick={onClose} className="rounded-full bg-sage-light px-3 py-1 text-sm">
            {t('CLOSE')}
          </button>
        </div>
        {offlineAt && (
          <p className="mb-3 rounded-xl bg-gold-light px-3 py-2 text-xs text-gold-dark">
            {t('EXPLAIN_OFFLINE_COPY', { date: offlineAt.slice(0, 10) })}
          </p>
        )}
        {loading && <p className="text-sm text-ink/60">{t('LOADING')}</p>}
        {!loading && !tree && <p className="text-sm text-ink/60">{t('ERROR_GENERIC')}</p>}
        {tree && <ExplainTree node={tree} />}
      </div>
    </div>
  );
}

// ── أدوات صغيرة ──
export function EmptyNote({ vkey }: { vkey: OwnerKey }) {
  return <p className="py-6 text-center text-sm text-ink/50">{t(vkey)}</p>;
}

export function ownerFetch(path: string, companyId: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ company_id: companyId, ...(extra ?? {}) });
  return fetch(`/api/accounting/owner/${path}?${params}`);
}

export function ownerPost(path: string, body: Record<string, unknown>) {
  return fetch(`/api/accounting/owner/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// عدد المفردات المرجعي للعقود الساكنة
export const VOCAB_SIZE = Object.keys(OWNER_VOCAB).length;
