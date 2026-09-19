import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { PRODUCTS } from '@/lib/pricing';

/**
 * بدء الدفع عبر MyFatoorah. معزول تمامًا.
 * - يتحقّق من جلسة المستخدم، ويقرأ المنتج/السعر من الخادم (لا يوثَق ببيانات المتصفح).
 * - ينشئ طلب دفع (pending) بـ service_role، ثم SendPayment، ويعيد رابط الدفع.
 * السرّ في متغيّرات البيئة: MYFATOORAH_API_KEY, MYFATOORAH_BASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MF_BASE = process.env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com';

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });

  let body: { productId?: string; scopeId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }

  const product = body.productId ? PRODUCTS[body.productId] : undefined;
  if (!product) return NextResponse.json({ error: 'منتج غير معروف' }, { status: 400 });
  if (product.kind === 'games' && !body.scopeId) return NextResponse.json({ error: 'اختاري المادة/الصف' }, { status: 400 });

  const key = (process.env.MYFATOORAH_API_KEY || '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !serviceKey || !supaUrl) return NextResponse.json({ error: 'الدفع غير مُعدّ على الخادم' }, { status: 500 });

  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  const { data: prof } = await admin.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();

  // إنشاء الطلب (pending)
  const orderRow = {
    user_id: user.id,
    product_id: product.id,
    kind: product.kind,
    tool: product.kind === 'tool' ? product.tool : null,
    scope: product.kind === 'games' ? product.scope : null,
    scope_id: product.kind === 'games' ? body.scopeId : null,
    months: product.kind !== 'studio' ? product.months : null,
    credits: product.kind === 'studio' ? product.credits : null,
    amount_kwd: product.priceKwd,
    status: 'pending',
  };
  const { data: order, error: oErr } = await admin.from('payment_orders').insert(orderRow).select('id').single();
  if (oErr || !order) return NextResponse.json({ error: 'تعذّر إنشاء الطلب' }, { status: 500 });

  const origin = req.nextUrl.origin;
  const callbackBase = `${origin}/api/payments/myfatoorah/callback`;

  // SendPayment
  const mfBody = {
    NotificationOption: 'LNK',
    InvoiceValue: product.priceKwd,
    CustomerName: (prof?.full_name as string) || 'معلمة غراس',
    DisplayCurrencyIso: 'KWD',
    MobileCountryCode: '+965',
    CustomerMobile: ((prof?.phone as string) || '').replace(/[^0-9]/g, '').slice(-8) || undefined,
    CustomerReference: order.id,
    Language: 'AR',
    CallBackUrl: callbackBase,
    ErrorUrl: `${callbackBase}?failed=1`,
    UserDefinedField: product.id,
  };
  let mfRes: Response;
  try {
    mfRes = await fetch(`${MF_BASE}/v2/SendPayment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(mfBody),
    });
  } catch {
    await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
    return NextResponse.json({ error: 'تعذّر الاتصال ببوابة الدفع' }, { status: 502 });
  }
  const mfJson = await mfRes.json().catch(() => ({}));
  const url = mfJson?.Data?.InvoiceURL as string | undefined;
  const invoiceId = mfJson?.Data?.InvoiceId;
  if (!mfRes.ok || !url) {
    await admin.from('payment_orders').update({ status: 'failed' }).eq('id', order.id);
    const msg = (mfJson?.ValidationErrors?.[0]?.Error) || mfJson?.Message || 'تعذّر بدء الدفع';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  await admin.from('payment_orders').update({ mf_invoice_id: String(invoiceId ?? '') }).eq('id', order.id);

  return NextResponse.json({ url });
}
