'use client';
/**
 * غراس للمحاسبة — Stage 11: وضعي — البطاقات الست حصرًا (UX-022:
 * الأرقام الرئيسية الستة في الشاشة الأولى 390×844) + الصندوق
 * القانوني الواحد. الأرقام من DTO المالكة فقط؛ كل بطاقة تنفتح
 * «من وين جا هذا الرقم؟» بسلسلة إسناد كاملة.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DashboardCard, EmptyNote, ExplainSheet, InboxItemDTO, StatusChip,
  ownerFetch, ownerPost, t, useMoneyFmt, useOwner,
} from './owner-client';

interface DashboardData {
  cards: DashboardCard[];
  inboxTop: InboxItemDTO[];
  coverage: { adapterKey: string; status: string }[];
  viewerRole: string;
}

function CardBox({ card, onExplain }: { card: DashboardCard; onExplain: () => void }) {
  const fmt = useMoneyFmt();
  const headline = card.headline.scalar !== null
    ? (card.cardKey === 'RUNWAY' && card.messageKey === 'RUNWAY_DAYS'
        ? t('RUNWAY_DAYS', card.messageParams)
        : card.headline.scalar)
    : fmt(card.headline.amountMinor, card.headline.currency);
  return (
    <button onClick={onExplain} data-card={card.cardKey}
      className="card-3d flex min-h-[104px] flex-col items-start gap-1 p-3 text-right">
      <span className="text-[12px] font-bold text-sage-deep">{t(card.titleKey)}</span>
      <span className="font-tajawal text-lg font-extrabold tabular-nums text-ink" data-headline>
        {headline}
      </span>
      <StatusChip status={card.status} />
      {card.messageKey && card.messageKey !== 'RUNWAY_DAYS' && (
        <span className="text-[11px] leading-4 text-ink/60">
          {t(card.messageKey, card.messageParams)}
        </span>
      )}
    </button>
  );
}

function InboxItem({ item, companyId, onChanged }: {
  item: InboxItemDTO; companyId: string; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<null | 'BUSINESS' | 'PERSONAL'>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await ownerPost('inbox/action', {
      company_id: companyId, exception_id: item.id, ...body,
    });
    setBusy(false);
    if (res.ok) onChanged();
    else setNote(t('ERROR_GENERIC'));
    return res.ok;
  }, [companyId, item.id, onChanged]);

  return (
    <div className="card-3d p-3" data-exception={item.id}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-ink">{t(item.whatKey)}</p>
          <p className="mt-0.5 text-xs text-ink/60">{t(item.whyKey)}</p>
          {item.occurrence > 1 && (
            <p className="mt-0.5 text-[11px] text-gold-dark">
              {t('EXC_RECURRENCE', { n: String(item.occurrence) })}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-sage-mist px-2 py-0.5 text-[11px]">
          {t(item.stateKey)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.actions.includes('ACK') && (
          <button disabled={busy} data-action="ack"
            onClick={async () => { if (await act({ action: 'acknowledge' })) setNote(t('EXC_ACK_DONE')); }}
            className="rounded-xl bg-sage-light px-3 py-1.5 text-xs font-semibold text-sage-deep">
            {t('EXC_ACK')}
          </button>
        )}
        {item.actions.includes('ANSWER_AMBIGUITY') && (
          <>
            <button disabled={busy} data-action="answer-business"
              onClick={() => setAsking('BUSINESS')}
              className="rounded-xl bg-sage px-3 py-1.5 text-xs font-semibold text-white">
              {t('EXC_ANSWER_BUSINESS')}
            </button>
            <button disabled={busy} data-action="answer-personal"
              onClick={() => setAsking('PERSONAL')}
              className="rounded-xl bg-gold px-3 py-1.5 text-xs font-semibold text-white">
              {t('EXC_ANSWER_PERSONAL')}
            </button>
          </>
        )}
        {item.actions.includes('ATTACH_DOCUMENT') && (
          <Link href={`/owner/mustanadati?attach_to=${item.id}`}
            className="rounded-xl bg-sage px-3 py-1.5 text-xs font-semibold text-white">
            {t('EXC_ATTACH_DOC')}
          </Link>
        )}
        {item.actions.includes('HANDLED_BY_ACCOUNTANT') && (
          <span className="text-[11px] text-ink/50">{t('EXC_NEEDS_ACCOUNTANT')}</span>
        )}
        {item.acknowledged && <span className="text-[11px] text-sage-dark">✓ {t('EXC_ACK')}</span>}
      </div>
      {asking && (
        <div className="mt-2 rounded-xl bg-white/70 p-2">
          <label className="block text-[11px] text-ink/60">
            {t('REASON_LABEL')}
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sage-light px-2 py-1 text-sm" />
          </label>
          <div className="mt-2 flex gap-2">
            <button disabled={busy || !reason.trim()} data-action="confirm-answer"
              onClick={async () => {
                if (await act({ action: 'answer_ambiguity', answer: asking, reason })) setAsking(null);
              }}
              className="rounded-xl bg-sage-deep px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {t('CONFIRM')}
            </button>
            <button onClick={() => setAsking(null)}
              className="rounded-xl bg-gray-200 px-3 py-1.5 text-xs">{t('CANCEL')}</button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-sage-dark">{note}</p>}
    </div>
  );
}

export default function OwnerStatusPage() {
  const { company } = useOwner();
  const [data, setData] = useState<DashboardData | null>(null);
  const [inbox, setInbox] = useState<InboxItemDTO[] | null>(null);
  const [error, setError] = useState(false);
  const [explainCard, setExplainCard] = useState<string | null>(null);
  const [showInbox, setShowInbox] = useState(false);

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const res = await ownerFetch('dashboard', company.id);
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
  }, [company]);

  const loadInbox = useCallback(async () => {
    if (!company) return;
    try {
      const res = await ownerFetch('inbox', company.id);
      if (res.ok) setInbox((await res.json()).items);
    } catch { /* الصندوق يبقى على حاله */ }
  }, [company]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showInbox) loadInbox(); }, [showInbox, loadInbox]);

  if (!company) return null;
  return (
    <div>
      {error && <EmptyNote vkey="ERROR_GENERIC" />}
      {!data && !error && <EmptyNote vkey="LOADING" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3" data-dashboard>
            {data.cards.map((card) => (
              <CardBox key={card.cardKey} card={card}
                onExplain={() => card.cardKey === 'ATTENTION'
                  ? setShowInbox((v) => !v)
                  : setExplainCard(card.cardKey)} />
            ))}
          </div>

          {showInbox && (
            <section className="mt-4 space-y-3" data-inbox>
              <h2 className="font-bold text-ink">{t('CARD_ATTENTION')}</h2>
              {inbox === null && <EmptyNote vkey="LOADING" />}
              {inbox !== null && inbox.length === 0 && <EmptyNote vkey="ATTENTION_NONE_URGENT" />}
              {(inbox ?? []).map((item) => (
                <InboxItem key={item.id} item={item} companyId={company.id}
                  onChanged={() => { loadInbox(); load(); }} />
              ))}
            </section>
          )}
        </>
      )}
      <ExplainSheet card={explainCard} onClose={() => setExplainCard(null)} />
    </div>
  );
}
