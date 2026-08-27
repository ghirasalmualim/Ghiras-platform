'use client';
/**
 * غراس للمحاسبة — Stage 11: فلوسي — أربعة تبويبات: اللي دخل /
 * اللي طلع / في الطريق / اللي ما وصل بعد. المصدر: الطبقة النقدية
 * القانونية الواحدة (C9) — لا عدّ مزدوج، والمكوّن غير المهيأ يقولها
 * ولا يتظاهر بالصفر.
 */
import { useEffect, useState } from 'react';
import {
  EmptyNote, StatusChip, ownerFetch, t, useMoneyFmt, useOwner,
} from '../owner-client';
import type { OwnerKey, OwnerStatus } from '../owner-client';

interface MoneyData {
  status: OwnerStatus;
  movementsIn: { labelKey: OwnerKey; dateISO: string; amountMinor: string; currency: string }[];
  movementsOut: { labelKey: OwnerKey; dateISO: string; amountMinor: string; currency: string }[];
  totalInMinor: string | null;
  totalOutMinor: string | null;
  currency: string;
  transit: { gatewayMinor: string | null; toBankMinor: string | null; status: OwnerStatus };
  awaited: {
    invoices: { id: string; number: string | null; customerName: string;
      outstandingMinor: string; currency: string; statusKey: OwnerKey }[];
    totalMinor: string | null;
  };
}

const TABS = [
  { id: 'in', key: 'MONEY_TAB_IN' },
  { id: 'out', key: 'MONEY_TAB_OUT' },
  { id: 'transit', key: 'MONEY_TAB_TRANSIT' },
  { id: 'awaited', key: 'MONEY_TAB_AWAITED' },
] as const;

export default function FlusiPage() {
  const { company } = useOwner();
  const fmt = useMoneyFmt();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('in');
  const [data, setData] = useState<MoneyData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!company) return;
    let alive = true;
    (async () => {
      try {
        const res = await ownerFetch('money', company.id);
        if (!alive) return;
        if (!res.ok) { setError(true); return; }
        setData(await res.json());
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [company]);

  if (!company) return null;

  const Movements = ({ rows, emptyKey }: {
    rows: MoneyData['movementsIn']; emptyKey: OwnerKey;
  }) => rows.length === 0 ? <EmptyNote vkey={emptyKey} /> : (
    <ul className="space-y-2">
      {rows.map((m, i) => (
        <li key={i} className="card-3d flex items-center justify-between p-3">
          <div>
            <p className="text-sm font-semibold">{t(m.labelKey)}</p>
            <p className="text-[11px] text-ink/50">{m.dateISO}</p>
          </div>
          <span className="font-tajawal text-sm font-bold tabular-nums">
            {fmt(m.amountMinor, m.currency)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <h1 className="mb-3 font-cairo text-xl font-extrabold">{t('SECTION_MONEY')}</h1>
      <div className="mb-4 flex gap-1 rounded-2xl bg-sage-mist p-1" role="tablist">
        {TABS.map(({ id, key }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 rounded-xl px-1 py-2 text-[12px] font-semibold ${
              tab === id ? 'bg-white text-sage-deep shadow-soft' : 'text-ink/50'}`}>
            {t(key as OwnerKey)}
          </button>
        ))}
      </div>

      {error && <EmptyNote vkey="ERROR_GENERIC" />}
      {!data && !error && <EmptyNote vkey="LOADING" />}
      {data && data.status === 'NOT_CONFIGURED' && tab !== 'awaited' && tab !== 'transit' && (
        <EmptyNote vkey="MONEY_NOT_CONFIGURED" />
      )}
      {data && (
        <>
          {tab === 'in' && data.status === 'FINAL' && (
            <>
              <p className="mb-2 text-sm text-ink/70">
                {t('MONTH_THIS')} · <b className="tabular-nums">{fmt(data.totalInMinor, data.currency)}</b>
              </p>
              <Movements rows={data.movementsIn} emptyKey="MONEY_IN_EMPTY" />
            </>
          )}
          {tab === 'out' && data.status === 'FINAL' && (
            <>
              <p className="mb-2 text-sm text-ink/70">
                {t('MONTH_THIS')} · <b className="tabular-nums">{fmt(data.totalOutMinor, data.currency)}</b>
              </p>
              <Movements rows={data.movementsOut} emptyKey="MONEY_OUT_EMPTY" />
            </>
          )}
          {tab === 'transit' && (
            <div className="space-y-2">
              {[
                { key: 'TRANSIT_GATEWAY' as OwnerKey, v: data.transit.gatewayMinor },
                { key: 'TRANSIT_TO_BANK' as OwnerKey, v: data.transit.toBankMinor },
              ].map(({ key, v }) => (
                <div key={key} className="card-3d flex items-center justify-between p-3">
                  <span className="text-sm font-semibold">{t(key)}</span>
                  {v === null
                    ? <StatusChip status="NOT_CONFIGURED" />
                    : <span className="font-tajawal text-sm font-bold tabular-nums">{fmt(v, data.currency)}</span>}
                </div>
              ))}
            </div>
          )}
          {tab === 'awaited' && (
            data.awaited.invoices.length === 0
              ? <EmptyNote vkey="MONEY_AWAITED_EMPTY" />
              : (
                <ul className="space-y-2">
                  {data.awaited.invoices.map((inv) => (
                    <li key={inv.id} className="card-3d flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-semibold">{inv.customerName || t('MOVEMENT_FROM_INVOICE')}</p>
                        <p className="text-[11px] text-ink/50">
                          {inv.number ? `#${inv.number} · ` : ''}{t(inv.statusKey)}
                        </p>
                      </div>
                      <span className="font-tajawal text-sm font-bold tabular-nums">
                        {fmt(inv.outstandingMinor, inv.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
          )}
        </>
      )}
    </div>
  );
}
