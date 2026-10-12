'use client';
/**
 * سلّةُ المشتريات (2026-10-10) — تُحفظ في متصفّح المعلمة (localStorage).
 *
 * السلّةُ قائمةُ «ماذا تريد» فقط: معرّفُ المنتجِ ونطاقُه. **لا سعرَ فيها** —
 * السعرُ يُقرأ من `PRODUCTS` عند العرض، ويُعادُ حسابُه في الخادمِ عند الدفع،
 * فتعديلُ السلّةِ من المتصفّح لا يغيّر ما يُدفع.
 *
 * أيُّ صفحةٍ تضيف بـ`addToCart`، أو برابطٍ `/cart?add=<productId>&scope=<id>&label=<نص>`
 * (للصفحاتِ التي لا تستورد هذا الملف، كصفحاتِ الألعابِ الخمس).
 */
import { PRODUCTS } from './pricing';

export type CartItem = { productId: string; scopeId?: string; scopeLabel?: string; qty?: number };

const KEY = 'ghiras_cart_v1';
export const CART_EVENT = 'ghiras-cart';

export const itemKey = (i: CartItem) => `${i.productId}:${i.scopeId ?? ''}`;

export function getCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((i): i is CartItem => !!i && typeof i.productId === 'string' && !!PRODUCTS[i.productId]);
  } catch {
    return [];
  }
}

function save(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  try {
    window.dispatchEvent(new Event(CART_EVENT));
  } catch {}
}

/** يعيد false إن كان المنتجُ (بنطاقِه) في السلّة من قبل. */
export function addToCart(item: CartItem): boolean {
  const p = PRODUCTS[item.productId];
  if (!p) return false;
  if ((p.kind === 'games' || p.kind === 'att_org' || p.kind === 'library' || p.kind === 'workshop') && !item.scopeId) return false;
  const items = getCart();
  // منتجُ الكمية: إضافتُه ثانيةً تُحدّث الكميةَ بدل الرفض
  if (p.kind === 'att_org' && items.some((i) => itemKey(i) === itemKey(item))) {
    save(items.map((i) => (itemKey(i) === itemKey(item) ? { ...i, qty: item.qty } : i)));
    return true;
  }
  if (items.some((i) => itemKey(i) === itemKey(item))) return false;
  save([...items, item]);
  return true;
}

export function setQty(key: string, qty: number) {
  save(getCart().map((i) => (itemKey(i) === key ? { ...i, qty } : i)));
}

export function removeFromCart(key: string) {
  save(getCart().filter((i) => itemKey(i) !== key));
}

export function clearCart() {
  save([]);
}
