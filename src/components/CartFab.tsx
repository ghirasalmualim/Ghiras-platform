'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CART_EVENT, getCart } from '@/lib/cart';

/**
 * زرُّ السلّةِ العائم — في كلِّ صفحات المنصّة (من الـlayout)، ويظهر فقط حين
 * يكون في السلّةِ شيء، ويختفي في صفحةِ السلّةِ نفسِها.
 */
export default function CartFab() {
  const path = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(getCart().length);
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!count || path === '/cart') return null;
  return (
    <a
      href="/cart"
      className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-2xl border-2 border-gold bg-gold-light px-4 py-3 font-extrabold text-gold-dark shadow-soft transition hover:-translate-y-0.5"
      aria-label={`السلة — ${count} منتج`}
    >
      <span className="text-2xl" aria-hidden>🛒</span>
      <span>السلة</span>
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-[13px] text-white">{count.toLocaleString('ar')}</span>
    </a>
  );
}
