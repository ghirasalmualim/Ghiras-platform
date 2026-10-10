'use client';
import { useEffect, useState } from 'react';
import { PRODUCTS, fmtKwd, linePrice } from '@/lib/pricing';
import { CART_EVENT, addToCart, getCart, itemKey, removeFromCart, setQty, type CartItem } from '@/lib/cart';

/**
 * صفحةُ السلّة (2026-10-10): كلُّ ما أضافته المعلمة، وكودُ خصمٍ واحدٌ على
 * المجموع، ودفعةٌ واحدةٌ تفعّل الكلَّ معًا. الأسعارُ هنا للعرض — الخادمُ يعيد
 * حسابَها من `PRODUCTS` في `/api/payments/myfatoorah/cart-checkout`.
 */
const ICON: Record<string, string> = { tool: '🧰', games: '🎮', studio: '🪄', game_credits: '🎲', bundle: '🎁', att_org: '🏫' };

/** منتجاتٌ بلا نطاقٍ تُقترح للإضافة من صفحة السلّة نفسها. */
const SUGGEST = ['studio_1', 'studio_5', 'games_3', 'gradebook', 'attendance', 'agenda', 'gharas_bank', 'adventure', 'multiplication', 'clock', 'head_records', 'teacher_pack'];

const monthsOf = (id: string) => {
  const p = PRODUCTS[id];
  if (!p) return '';
  if (p.kind === 'tool' || p.kind === 'games' || p.kind === 'bundle') return `${p.months.toLocaleString('ar')} أشهر`;
  if (p.kind === 'att_org') return `${p.months.toLocaleString('ar')} أشهر · ${fmtKwd(p.priceKwd)} لكل فصل`;
  if (p.kind === 'studio') return `رصيد ${p.credits.toLocaleString('ar')} ${p.credits === 1 ? 'حصة' : 'حصص'}`;
  if (p.kind === 'game_credits') return `رصيد ${p.credits.toLocaleString('ar')} ألعاب — لا ينتهي`;
  return '';
};

export default function CartApp() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [deal, setDeal] = useState<{ code: string; percent: number } | null>(null);
  const [codeErr, setCodeErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    // إضافةٌ عبر الرابط: /cart?add=<productId>&scope=<id>&label=<نص>
    try {
      const u = new URL(window.location.href);
      const add = u.searchParams.get('add');
      if (add) {
        const q = Number(u.searchParams.get('qty'));
        const ok = addToCart({ productId: add, scopeId: u.searchParams.get('scope') || undefined, scopeLabel: u.searchParams.get('label') || undefined, qty: Number.isFinite(q) && q > 0 ? q : undefined });
        if (PRODUCTS[add]) setNote(ok ? `انضاف للسلة: ${PRODUCTS[add].label}` : 'هذا المنتج موجود بالسلة من قبل');
        window.history.replaceState(null, '', '/cart');
      }
    } catch {}
    const sync = () => setItems(getCart());
    sync();
    setReady(true);
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

  const subtotal = items.reduce((s, i) => s + (PRODUCTS[i.productId] ? linePrice(PRODUCTS[i.productId]!, i.qty) : 0), 0);
  const discount = deal ? Math.round(subtotal * deal.percent * 10) / 1000 : 0;
  const total = Math.max(0, Math.round((subtotal - discount) * 1000) / 1000);

  const applyCode = async () => {
    if (!code.trim() || !items.length) return;
    setChecking(true);
    setCodeErr('');
    try {
      const res = await fetch('/api/payments/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, productId: items[0].productId }),
      });
      if (res.status === 401) { window.location.href = '/login?next=/cart'; return; }
      const json = await res.json();
      if (json?.ok) setDeal({ code: json.code, percent: json.percent });
      else { setDeal(null); setCodeErr(json?.error || 'الكود غير صحيح.'); }
    } catch {
      setCodeErr('تعذّر التحقّق. تحقّقي من الإنترنت.');
    }
    setChecking(false);
  };

  const pay = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/payments/myfatoorah/cart-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(({ productId, scopeId, qty }) => ({ productId, scopeId, qty })), coupon: deal ? code : undefined }),
      });
      if (res.status === 401) { window.location.href = '/login?next=/cart'; return; }
      const json = await res.json();
      if (!res.ok || !json?.url) {
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

  const inCart = new Set(items.map((i) => i.productId));

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16">
      <h1 className="mt-2 text-3xl font-black text-sage-deep">🛒 سلّتي</h1>
      {note ? <div className="mt-3 rounded-xl bg-sage/10 px-4 py-2 text-sm font-extrabold text-sage-dark">✅ {note}</div> : null}

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_320px]">
        <div>
          {!ready ? null : items.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-ink/15 bg-white p-10 text-center text-ink/55">
              السلة فاضية — أضيفي من صفحات الأدوات والألعاب والمواد، أو من الاقتراحات تحت.
            </div>
          ) : (
            items.map((i) => {
              const p = PRODUCTS[i.productId]!;
              return (
                <div key={itemKey(i)} className="mb-3 flex items-center gap-3 rounded-2xl border-2 border-ink/10 bg-white p-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-cream text-2xl" aria-hidden>{ICON[p.kind] ?? '🛍️'}</div>
                  <div className="flex-1">
                    <div className="font-extrabold text-ink">{p.label}{i.scopeLabel ? `: ${i.scopeLabel}` : ''}</div>
                    <div className="text-[13px] text-ink/55">{monthsOf(p.id)}</div>
                    {p.kind === 'att_org' ? (
                      <div className="mt-1.5 flex items-center gap-2 text-[13px] font-bold text-ink/70">
                        <span>عدد الفصول:</span>
                        <button onClick={() => setQty(itemKey(i), Math.max(p.minQty, (i.qty ?? p.minQty) - 1))} className="h-7 w-7 rounded-lg border-2 border-ink/15" aria-label="أنقصي فصلًا">−</button>
                        <input type="number" min={p.minQty} value={i.qty ?? p.minQty}
                          onChange={(e) => setQty(itemKey(i), Math.max(p.minQty, Math.floor(Number(e.target.value) || p.minQty)))}
                          className="w-16 rounded-lg border-2 border-ink/15 px-2 py-0.5 text-center" />
                        <button onClick={() => setQty(itemKey(i), (i.qty ?? p.minQty) + 1)} className="h-7 w-7 rounded-lg border-2 border-ink/15" aria-label="زيدي فصلًا">+</button>
                        <span className="text-ink/45">(أقلّها {p.minQty.toLocaleString('ar')})</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="whitespace-nowrap text-lg font-black text-ink">{fmtKwd(linePrice(p, i.qty))}</div>
                  <button onClick={() => removeFromCart(itemKey(i))} className="px-2 text-xl text-red-500" aria-label={`احذفي ${p.label}`}>✕</button>
                </div>
              );
            })
          )}

          <h2 className="mt-8 text-lg font-black text-sage-deep">أضيفي أيضًا</h2>
          <p className="text-[13px] text-ink/50">ألعاب المادة والصف تنضاف من صفحة المادة أو الصف نفسها.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SUGGEST.filter((id) => !inCart.has(id)).map((id) => {
              const p = PRODUCTS[id]!;
              return (
                <div key={id} className="flex flex-col rounded-2xl border-2 border-ink/10 bg-white p-3">
                  <div className="text-2xl" aria-hidden>{ICON[p.kind]}</div>
                  <div className="mt-1 text-[14px] font-extrabold leading-snug text-ink">{p.label}</div>
                  <div className="text-[12px] text-ink/50">{monthsOf(id)}</div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <b className="text-ink">{fmtKwd(p.priceKwd)}</b>
                    <button onClick={() => addToCart({ productId: id })} className="rounded-lg bg-gold-light px-3 py-1 text-[13px] font-extrabold text-gold-dark">+ أضيفي</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="h-fit rounded-2xl border-2 border-ink/10 bg-white p-4 md:sticky md:top-5">
          <div className="flex justify-between font-bold"><span>المجموع</span><span>{fmtKwd(subtotal)}</span></div>
          {deal ? (
            <div className="mt-2 flex justify-between font-bold text-sage-dark"><span>خصم «{deal.code}» {deal.percent}٪</span><span>− {fmtKwd(discount)}</span></div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void applyCode(); }}
                placeholder="كود خصم" className="min-w-0 flex-1 rounded-xl border-2 border-ink/15 px-3 py-2 text-[14px] outline-none focus:border-sage" />
              <button onClick={applyCode} disabled={checking || !code.trim() || !items.length} className="rounded-xl border-2 border-sage px-3 text-[13px] font-extrabold text-sage-dark disabled:opacity-50">
                {checking ? '…' : 'تطبيق'}
              </button>
            </div>
          )}
          {codeErr && !deal ? <div className="mt-1.5 text-[12.5px] text-red-500">{codeErr}</div> : null}
          <div className="mt-3 flex justify-between border-t-2 border-ink/10 pt-3 text-xl font-black"><span>الإجمالي</span><span>{fmtKwd(total)}</span></div>
          <button onClick={pay} disabled={busy || !items.length}
            className="mt-4 w-full rounded-xl bg-sage py-3 font-extrabold text-white shadow-soft transition hover:bg-sage-dark disabled:opacity-50">
            {busy ? '…جارٍ التحويل للدفع' : '💳 ادفعي مرة وحدة'}
          </button>
          {err ? <div className="mt-2 text-[13px] text-red-500">{err}</div> : null}
          <p className="mt-2 text-[12px] leading-relaxed text-ink/45">الدفع من صفحة MyFatoorah الكويتية (كي نت والبطاقات)، وبعده يتفعّل كل شي بالسلة مرة وحدة.</p>
        </aside>
      </div>
    </div>
  );
}
