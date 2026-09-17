'use client';
import { useState } from 'react';
import { PRODUCTS, fmtKwd } from '@/lib/pricing';

/**
 * زر «اشترك الآن» في صفحات القفل — يبدأ الدفع عبر MyFatoorah ويحوّل لصفحة الدفع.
 * بيانات البطاقة تُدخَل في صفحة MyFatoorah (لا تمر علينا).
 */
export default function SubscribeButton({ productId, scopeId, label, hint, hidePrice }: { productId: string; scopeId?: string; label?: string; hint?: string; hidePrice?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const product = PRODUCTS[productId];
  if (!product) return null;
  const months = product.kind !== 'studio' ? product.months : 0;

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/payments/myfatoorah/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, scopeId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        if (res.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
        setErr(json?.error || 'تعذّر بدء الدفع، حاولي مرة ثانية.');
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setErr('تعذّر الاتصال. تحقّقي من الإنترنت.');
      setBusy(false);
    }
  };

  return (
    <div className="mt-7">
      <button
        onClick={go}
        disabled={busy}
        className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all disabled:opacity-60"
      >
        {busy ? '…جارٍ التحويل للدفع' : `🛒 ${label ?? 'اشترك الآن'}${hidePrice ? '' : ` — ${fmtKwd(product.priceKwd)}`}`}
      </button>
      <div className="mt-1.5 text-[12px] text-ink/45">{hint ?? (months ? `اشتراك ${months} أشهر · تجديد بأي وقت` : '')}</div>
      {err ? <div className="mt-2 text-[13px] text-red-500">{err}</div> : null}
    </div>
  );
}
