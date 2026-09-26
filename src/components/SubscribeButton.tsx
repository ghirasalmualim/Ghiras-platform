'use client';
import { useState } from 'react';
import { PRODUCTS, fmtKwd } from '@/lib/pricing';

/**
 * زر «اشترك الآن» في صفحات القفل — يبدأ الدفع عبر MyFatoorah ويحوّل لصفحة الدفع.
 * بيانات البطاقة تُدخَل في صفحة MyFatoorah (لا تمر علينا).
 *
 * كود الخصم: تُدخِلُه المعلمةُ هنا فيُتحقَّقُ منه في الخادم (/api/payments/coupon)
 * لعرضِ السعرِ الجديد، ثمّ يُرسَلُ نصُّ الكودِ مع الدفع حيث **يُعادُ حسابُ السعر**
 * — فلا يمكن تمريرُ سعرٍ من المتصفّح.
 */
export default function SubscribeButton({ productId, scopeId, label, hint, hidePrice }: { productId: string; scopeId?: string; label?: string; hint?: string; hidePrice?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [codeErr, setCodeErr] = useState('');
  const [deal, setDeal] = useState<{ code: string; percent: number; priceLabel: string; wasLabel: string } | null>(null);
  const product = PRODUCTS[productId];
  if (!product) return null;
  const months = product.kind === 'tool' || product.kind === 'games' || product.kind === 'bundle' ? product.months : 0;

  const apply = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setCodeErr('');
    try {
      const res = await fetch('/api/payments/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, productId }),
      });
      if (res.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
      const json = await res.json();
      if (json?.ok) {
        setDeal({ code: json.code, percent: json.percent, priceLabel: json.priceLabel, wasLabel: json.wasLabel });
      } else {
        setDeal(null);
        setCodeErr(json?.error || 'الكود غير صحيح.');
      }
    } catch {
      setCodeErr('تعذّر التحقّق. تحقّقي من الإنترنت.');
    }
    setChecking(false);
  };

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/payments/myfatoorah/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, scopeId, coupon: deal ? code : undefined }),
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

  const priceText = hidePrice ? '' : ` — ${deal ? deal.priceLabel : fmtKwd(product.priceKwd)}`;

  return (
    <div className="mt-7">
      <button
        onClick={go}
        disabled={busy}
        className="inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all disabled:opacity-60"
      >
        {busy ? '…جارٍ التحويل للدفع' : `🛒 ${label ?? 'اشترك الآن'}${priceText}`}
      </button>
      <div className="mt-1.5 text-[12px] text-ink/45">{hint ?? (months ? `اشتراك ${months} أشهر · تجديد بأي وقت` : '')}</div>

      {deal ? (
        <div className="mt-2 text-[13px] font-extrabold text-sage-dark">
          ✅ خصم «{deal.code}» {deal.percent}٪ — السعر {deal.priceLabel} بدل {deal.wasLabel}
        </div>
      ) : showCode ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void apply(); }}
            placeholder="اكتبي كود الخصم"
            className="rounded-xl border-2 border-ink/15 bg-white px-4 py-2 text-[14px] text-ink outline-none focus:border-sage"
            style={{ maxWidth: 200 }}
          />
          <button
            onClick={apply}
            disabled={checking || !code.trim()}
            className="rounded-xl border-2 border-sage px-5 py-2 text-[13px] font-extrabold text-sage-dark transition-all hover:bg-sage/10 disabled:opacity-50"
          >
            {checking ? '…' : 'تطبيق'}
          </button>
        </div>
      ) : (
        <button onClick={() => setShowCode(true)} className="mt-2 text-[12.5px] font-extrabold text-sage-dark underline">
          🎟️ عندي كود خصم
        </button>
      )}
      {codeErr && !deal ? <div className="mt-1.5 text-[12.5px] text-red-500">{codeErr}</div> : null}
      {err ? <div className="mt-2 text-[13px] text-red-500">{err}</div> : null}
    </div>
  );
}
