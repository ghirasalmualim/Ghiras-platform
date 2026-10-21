import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { PRODUCTS, linePrice, type Product } from '@/lib/pricing';
import { findCoupon, discountedPrice } from '@/lib/coupons';

/**
 * دفعُ السلّة كاملةً بفاتورةِ MyFatoorah واحدة (2026-10-10). معزولٌ مثل checkout.
 *
 * - كلُّ عنصرٍ يصيرُ صفًّا في `payment_orders` كالطلبِ المنفرد تمامًا، وكلُّها
 *   تشتركُ في `cart_id`؛ والفاتورةُ ترجعُ بـ`CustomerReference = cart_id`،
 *   فيفعّلُ الـcallback صفوفَ السلّةِ كلَّها (`activate` نفسُها لكلِّ صف).
 * - الأسعارُ من `PRODUCTS` على الخادم، والمتصفّحُ يرسلُ المعرّفاتِ والنطاقَ فقط.
 * - كودُ الخصمِ على المجموع: الفاتورةُ = المجموعُ بعد الخصم، وكلُّ صفٍّ يُسجَّلُ
 *   بسعرِه بعد الخصم للمحاسبة.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MF_BASE = process.env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com';
const MAX_ITEMS = 30;

function orderRow(product: Product, scopeId: string | undefined, qty: number | undefined) {
  return {
    product_id: product.id,
    kind: product.kind,
    tool: product.kind === 'tool' ? product.tool : null,
    scope: product.kind === 'games' ? product.scope : product.kind === 'att_org' ? 'school' : product.kind === 'library' ? 'library' : product.kind === 'workshop' ? 'workshop' : product.kind === 'lesson' ? 'lesson' : null,
    scope_id: product.kind === 'games' || product.kind === 'att_org' ? scopeId : null,
    months: product.kind === 'tool' && product.extra ? null : product.kind === 'tool' || product.kind === 'games' || product.kind === 'bundle' || product.kind === 'att_org' || product.kind === 'library' || product.kind === 'workshop' || product.kind === 'lesson' ? product.months : null,
    // سجلّا الدرجات والحضور: credits = عددُ سجلّاتِ الباقة، أو ١ للسجلّ الإضافي
    credits: product.kind === 'studio' || product.kind === 'game_credits' ? product.credits : product.kind === 'tool' ? (product.extra ? 1 : product.slots ?? null) : null,
    // عمودُ qty يُرسَل لمنتجِ الكمية وحدَه — فالسلّةُ العاديةُ لا تحتاجه
    ...(product.kind === 'att_org' ? { qty } : {}),
    // مفتاحُ مادةِ المكتبة نصٌّ لا uuid — عمودُه الخاص
    ...(product.kind === 'library' || product.kind === 'workshop' || product.kind === 'lesson' ? { scope_key: scopeId } : {}),
  };
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });

  let body: { items?: { productId?: string; scopeId?: string; qty?: number }[]; coupon?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }

  const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const seen = new Set<string>();
  const lines: { product: Product; scopeId?: string; qty?: number }[] = [];
  for (const it of raw) {
    const product = it?.productId ? PRODUCTS[it.productId] : undefined;
    if (!product) return NextResponse.json({ error: 'في السلة منتج غير معروف — احذفيه وحاولي مرة ثانية' }, { status: 400 });
    const scopeId = typeof it.scopeId === 'string' && it.scopeId ? it.scopeId : undefined;
    if (product.kind === 'games' && !scopeId) return NextResponse.json({ error: `«${product.label}» ناقصها المادة/الصف — احذفيها وأضيفيها من صفحتها` }, { status: 400 });
    let qty: number | undefined;
    if (product.kind === 'att_org') {
      qty = Math.floor(Number(it.qty));
      if (!scopeId) return NextResponse.json({ error: 'إدارة الحضور ناقصها المدرسة — أضيفيها من صفحة إدارة الحضور' }, { status: 400 });
      if (!Number.isFinite(qty) || qty < product.minQty || qty > 500) return NextResponse.json({ error: `عدد الفصول أقلّه ${product.minQty}` }, { status: 400 });
      // المشترية لازم تكون من إدارةِ المدرسة — يُسأل بجلستِها هي
      const { data: isAdm } = await supabase.rpc('school_is_admin', { p_school: scopeId });
      if (!isAdm) return NextResponse.json({ error: 'اشتراك إدارة الحضور تشتريه مسؤولة المدرسة الرئيسية' }, { status: 403 });
    }
    if (product.kind === 'library') {
      // «مرحلة|صف|مادة» — نصٌّ قصيرٌ بثلاثة أجزاء، والاستوديو يقرأ المفتاحَ نفسَه
      if (!scopeId || scopeId.length > 160 || scopeId.split('|').length !== 3) {
        return NextResponse.json({ error: 'اشتراك المكتبة ناقصه المادة — أضيفيه من مكتبة الاستوديو' }, { status: 400 });
      }
    }
    if (product.kind === 'workshop') {
      // معرّفُ قالبِ الورشة في الاستوديو — نصٌّ قصيرٌ آمن
      if (!scopeId || !/^[A-Za-z0-9_-]{4,64}$/.test(scopeId)) {
        return NextResponse.json({ error: 'الورشة ناقصها التحديد — أضيفيها من صفحة ورش غراس' }, { status: 400 });
      }
    }
    if (product.kind === 'lesson') {
      // معرّفُ قالبِ العرض في مكتبة الاستوديو — نصٌّ قصيرٌ آمن
      if (!scopeId || !/^[A-Za-z0-9_-]{4,64}$/.test(scopeId)) {
        return NextResponse.json({ error: 'العرض ناقصه التحديد — أضيفيه من مكتبة الاستوديو' }, { status: 400 });
      }
    }
    const k = `${product.id}:${scopeId ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push({ product, scopeId, qty });
  }
  if (!lines.length) return NextResponse.json({ error: 'السلة فاضية' }, { status: 400 });

  const coupon = findCoupon(body.coupon);
  const subtotal = lines.reduce((s, l) => s + linePrice(l.product, l.qty), 0);
  const amountKwd = coupon ? discountedPrice(subtotal, coupon.percent) : Math.round(subtotal * 1000) / 1000;

  const key = (process.env.MYFATOORAH_API_KEY || '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !serviceKey || !supaUrl) return NextResponse.json({ error: 'الدفع غير مُعدّ على الخادم' }, { status: 500 });

  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  const { data: prof } = await admin.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();

  const cartId = randomUUID();
  const rows = lines.map(({ product, scopeId, qty }) => ({
    ...orderRow(product, scopeId, qty),
    user_id: user.id,
    cart_id: cartId,
    amount_kwd: coupon ? discountedPrice(linePrice(product, qty), coupon.percent) : linePrice(product, qty),
    status: 'pending',
    ...(coupon ? { coupon_code: coupon.code, discount_pct: coupon.percent } : {}),
  }));
  const { error: oErr } = await admin.from('payment_orders').insert(rows);
  if (oErr) {
    const needsSql = /cart_id/.test(oErr.message);
    return NextResponse.json({ error: needsSql ? 'السلة لم تُفعَّل بعد على الخادم' : 'تعذّر إنشاء الطلب' }, { status: 500 });
  }
  const failAll = () => admin.from('payment_orders').update({ status: 'failed' }).eq('cart_id', cartId).eq('status', 'pending');

  const callbackBase = `${req.nextUrl.origin}/api/payments/myfatoorah/callback`;
  const mfBody = {
    NotificationOption: 'LNK',
    InvoiceValue: amountKwd,
    CustomerName: (prof?.full_name as string) || 'معلمة غراس',
    DisplayCurrencyIso: 'KWD',
    MobileCountryCode: '+965',
    CustomerMobile: ((prof?.phone as string) || '').replace(/[^0-9]/g, '').slice(-8) || undefined,
    CustomerReference: cartId,
    Language: 'AR',
    CallBackUrl: callbackBase,
    ErrorUrl: `${callbackBase}?failed=1`,
    UserDefinedField: 'cart',
    InvoiceItems: lines.map((l, i) => ({ ItemName: (l.qty ? `${l.product.label} (${l.qty} فصلًا)` : l.product.label).slice(0, 120), Quantity: 1, UnitPrice: rows[i].amount_kwd })),
  };
  // InvoiceItems يجب أن يساوي مجموعُها InvoiceValue؛ إن اختلفا بفلسٍ من التقريب نُسقطها.
  const itemsSum = Math.round(rows.reduce((s, r) => s + r.amount_kwd, 0) * 1000) / 1000;
  if (itemsSum !== amountKwd) delete (mfBody as { InvoiceItems?: unknown }).InvoiceItems;

  let mfRes: Response;
  try {
    mfRes = await fetch(`${MF_BASE}/v2/SendPayment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(mfBody),
    });
  } catch {
    await failAll();
    return NextResponse.json({ error: 'تعذّر الاتصال ببوابة الدفع' }, { status: 502 });
  }
  const mfJson = await mfRes.json().catch(() => ({}));
  const url = mfJson?.Data?.InvoiceURL as string | undefined;
  const invoiceId = mfJson?.Data?.InvoiceId;
  if (!mfRes.ok || !url) {
    await failAll();
    const msg = (mfJson?.ValidationErrors?.[0]?.Error) || mfJson?.Message || 'تعذّر بدء الدفع';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  await admin.from('payment_orders').update({ mf_invoice_id: String(invoiceId ?? '') }).eq('cart_id', cartId);
  return NextResponse.json({ url });
}
