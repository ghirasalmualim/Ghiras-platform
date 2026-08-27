'use client';
/**
 * غراس للمحاسبة — Stage 11: فواتيري — تدفق حقيقي فوق دوال Stage 4/6:
 * إنشاء عميل/منتج/مسودة، إصدار، تسجيل استلام، ووسم «مرسلة» الصادق
 * (C11): المشاركة يفعلها الجهاز (Web Share)، والنظام يسجل الحالة —
 * لا ادعاء بريد آلي ولا تذكير قبل بنية تسليم فعلية.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  EmptyNote, ownerFetch, ownerPost, t, useMoneyFmt, useOwner,
} from '../owner-client';
import type { OwnerKey } from '../owner-client';

interface InvoiceRow {
  id: string; number: string | null; statusKey: OwnerKey; rawStatus: string;
  customerName: string; totalMinor: string; outstandingMinor: string; currency: string;
}
interface InvoicesData {
  invoices: InvoiceRow[];
  customers: { id: string; name: string }[];
  products: { id: string; name: string; priceMinor: string; currency: string }[];
  viewerRole: string;
}

export default function FawatiriPage() {
  const { company } = useOwner();
  const fmt = useMoneyFmt();
  const [data, setData] = useState<InvoicesData | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // نموذج الإنشاء السريع (تدفق «عميل متكرر» ≤ ٣٠ ثانية)
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [productId, setProductId] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const res = await ownerFetch('invoices', company.id);
      if (!res.ok) { setError(true); return; }
      const d = await res.json();
      setData(d);
      if (!customerId && d.customers[0]) setCustomerId(d.customers[0].id);
      if (!productId && d.products[0]) setProductId(d.products[0].id);
      setError(false);
    } catch { setError(true); }
  }, [company, customerId, productId]);

  useEffect(() => { load(); }, [load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!company) return null;
    setBusy(true); setNote(null);
    const res = await ownerPost('invoices', { company_id: company.id, ...body });
    setBusy(false);
    if (!res.ok) {
      setNote(t('ERROR_GENERIC'));
      return null;
    }
    return res.json();
  }, [company]);

  const createAndIssue = useCallback(async () => {
    let cid = customerId;
    if (newCustomer.trim()) {
      const r = await post({ action: 'create_customer', name: newCustomer.trim() });
      if (!r) return;
      cid = r.customer_id;
    }
    let pid = productId;
    let price: string | null = null;
    if (newProduct.trim() && newPrice.trim()) {
      const r = await post({ action: 'create_product', name: newProduct.trim(), price_minor: newPrice.trim() });
      if (!r) return;
      pid = r.product_id;
      price = newPrice.trim();
    } else {
      price = data?.products.find((p) => p.id === pid)?.priceMinor ?? null;
    }
    if (!cid || !pid || !price) { setNote(t('ERROR_GENERIC')); return; }
    const draft = await post({
      action: 'create_draft', customer_id: cid,
      lines: [{ product_id: pid, quantity, unit_price_minor: price, currency: company!.baseCurrency }],
    });
    if (!draft) return;
    const issued = await post({ action: 'issue', invoice_id: draft.invoice_id });
    if (issued) {
      setCreating(false); setNewCustomer(''); setNewProduct(''); setNewPrice('');
      await load();
    }
  }, [customerId, newCustomer, productId, newProduct, newPrice, quantity, data, post, load, company]);

  const shareThenMarkSent = useCallback(async (inv: InvoiceRow) => {
    // المشاركة الحقيقية من الجهاز — إن اكتملت نسجّل الحالة بصدقها
    const text = `فاتورة ${inv.number ?? ''} — ${fmt(inv.totalMinor, inv.currency)} — ${inv.customerName}`;
    let shared = false;
    try {
      if (navigator.share) { await navigator.share({ text }); shared = true; }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); shared = true; }
    } catch { shared = false; }
    if (shared) {
      const r = await post({ action: 'mark_sent', invoice_id: inv.id });
      if (r) { setNote(t('INVOICE_SHARED_TRUTH')); await load(); }
    }
  }, [fmt, post, load]);

  const recordPayment = useCallback(async (inv: InvoiceRow) => {
    const r = await post({
      action: 'record_payment', invoice_id: inv.id,
      amount_minor: inv.outstandingMinor, currency: inv.currency,
    });
    if (r) await load();
  }, [post, load]);

  if (!company) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-cairo text-xl font-extrabold">{t('SECTION_INVOICES')}</h1>
        <button onClick={() => setCreating((v) => !v)} data-action="new-invoice"
          className="rounded-xl bg-sage px-3 py-1.5 text-sm font-semibold text-white">
          {t('INVOICE_NEW')}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-ink/50">{t('INVOICE_DELIVERY_PENDING')}</p>
      {note && <p className="mb-3 rounded-xl bg-sage-light px-3 py-2 text-xs text-sage-deep">{note}</p>}

      {creating && (
        <div className="card-3d mb-4 space-y-2 p-3" data-create-form>
          <label className="block text-xs text-ink/60">العميل
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sage-light bg-white px-2 py-1.5 text-sm">
              {(data?.customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <input placeholder="أو عميل جديد بالاسم" value={newCustomer}
            onChange={(e) => setNewCustomer(e.target.value)}
            className="w-full rounded-lg border border-sage-light px-2 py-1.5 text-sm" />
          <label className="block text-xs text-ink/60">الخدمة/المنتج
            <select value={productId} onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sage-light bg-white px-2 py-1.5 text-sm">
              {(data?.products ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {fmt(p.priceMinor, p.currency)}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <input placeholder="أو منتج جديد" value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              className="flex-1 rounded-lg border border-sage-light px-2 py-1.5 text-sm" />
            <input placeholder="سعره (فلس)" value={newPrice} inputMode="numeric"
              onChange={(e) => setNewPrice(e.target.value.replace(/\D/g, ''))}
              className="w-28 rounded-lg border border-sage-light px-2 py-1.5 text-sm" />
          </div>
          <label className="block text-xs text-ink/60">الكمية
            <input value={quantity} inputMode="numeric"
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
              className="mt-1 w-24 rounded-lg border border-sage-light px-2 py-1.5 text-sm" />
          </label>
          <button disabled={busy} onClick={createAndIssue} data-action="issue-invoice"
            className="w-full rounded-xl bg-sage-deep py-2 text-sm font-bold text-white disabled:opacity-40">
            {t('INVOICE_ISSUE')}
          </button>
        </div>
      )}

      {error && <EmptyNote vkey="ERROR_GENERIC" />}
      {!data && !error && <EmptyNote vkey="LOADING" />}
      {data && data.invoices.length === 0 && !creating && <EmptyNote vkey="MONEY_AWAITED_EMPTY" />}
      <ul className="space-y-2">
        {(data?.invoices ?? []).map((inv) => (
          <li key={inv.id} className="card-3d p-3" data-invoice={inv.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{inv.customerName}</p>
                <p className="text-[11px] text-ink/50">
                  {inv.number ? `#${inv.number} · ` : ''}{t(inv.statusKey)}
                </p>
              </div>
              <div className="text-left">
                <p className="font-tajawal text-sm font-bold tabular-nums">{fmt(inv.totalMinor, inv.currency)}</p>
                {inv.outstandingMinor !== '0' && inv.rawStatus !== 'DRAFT' && (
                  <p className="text-[11px] text-gold-dark tabular-nums">
                    {t('INVOICE_OUTSTANDING')}: {fmt(inv.outstandingMinor, inv.currency)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {inv.rawStatus === 'DRAFT' && (
                <button disabled={busy} onClick={async () => {
                  const r = await post({ action: 'issue', invoice_id: inv.id });
                  if (r) await load();
                }} className="rounded-xl bg-sage px-3 py-1.5 text-xs font-semibold text-white">
                  {t('INVOICE_ISSUE')}
                </button>
              )}
              {inv.rawStatus === 'ISSUED' && (
                <button disabled={busy} onClick={() => shareThenMarkSent(inv)} data-action="mark-sent"
                  className="rounded-xl bg-sage px-3 py-1.5 text-xs font-semibold text-white">
                  {t('INVOICE_MARK_SENT')}
                </button>
              )}
              {['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.rawStatus)
                && inv.outstandingMinor !== '0' && (
                <button disabled={busy} onClick={() => recordPayment(inv)} data-action="record-payment"
                  className="rounded-xl bg-gold px-3 py-1.5 text-xs font-semibold text-white">
                  {t('INVOICE_RECORD_PAYMENT')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
