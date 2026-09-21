import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * رجوع MyFatoorah بعد الدفع. معزول. يتحقّق من حالة الدفع بالخادم (GetPaymentStatus)
 * ثم يفعّل الاشتراك عبر دوال الخدمة (service_role) — مرة واحدة (idempotent).
 * لا يلمس admin_set_tool/admin_grant. يعيد توجيه المستخدمة لصفحة نتيجة.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MF_BASE = process.env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com';

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
async function activate(admin: RpcClient, order: {
  id: string; user_id: string; product_id: string; kind: string; tool: string | null; scope: string | null; scope_id: string | null; months: number | null; credits: number | null;
}) {
  if (order.kind === 'tool' && order.tool && order.months) {
    return admin.rpc('payment_activate_tool', { p_user: order.user_id, p_tool: order.tool, p_months: order.months });
  }
  if (order.kind === 'games' && order.scope && order.scope_id && order.months) {
    return admin.rpc('payment_grant_games', { p_user: order.user_id, p_scope: order.scope, p_scope_id: order.scope_id, p_months: order.months });
  }
  // باقةٌ = منحٌ متعدّدةٌ في دالّةٍ واحدةٍ ذرّية: إمّا تُفعَّلُ كلُّها أو لا شيء.
  // (ستُّ نداءاتٍ منفصلةٍ كانت ستتركُ عند فشلِ إحداها طلبًا مدفوعًا نصفَ مُفعَّل.)
  if (order.kind === 'bundle' && order.product_id === 'teacher_pack') {
    return admin.rpc('payment_activate_teacher_pack', { p_user: order.user_id });
  }
  if (order.kind === 'game_credits' && order.credits) {
    return admin.rpc('payment_add_game_credits', { p_user: order.user_id, p_count: order.credits });
  }
  if (order.kind === 'studio' && order.credits) {
    return admin.rpc('payment_add_credits', { p_user: order.user_id, p_count: order.credits });
  }
  return { error: { message: 'bad order' } } as { error: { message: string } };
}

async function handle(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const done = (ok: boolean, product?: string) =>
    NextResponse.redirect(
      `${origin}/workspace?pay=${ok ? 'ok' : 'fail'}${ok && product ? `&p=${encodeURIComponent(product)}` : ''}`,
      { status: 303 },
    );

  const paymentId = req.nextUrl.searchParams.get('paymentId');
  const key = (process.env.MYFATOORAH_API_KEY || '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!paymentId || !key || !serviceKey || !supaUrl) return done(false);

  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  // تأكيد الحالة من MyFatoorah
  let mfJson: { Data?: { InvoiceStatus?: string; CustomerReference?: string; InvoiceId?: number } } = {};
  try {
    const r = await fetch(`${MF_BASE}/v2/GetPaymentStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ Key: paymentId, KeyType: 'PaymentId' }),
    });
    mfJson = await r.json();
  } catch { return done(false); }

  const status = mfJson?.Data?.InvoiceStatus;
  const orderId = mfJson?.Data?.CustomerReference;
  if (!orderId) return done(false);

  const { data: order } = await admin.from('payment_orders').select('id,user_id,product_id,kind,tool,scope,scope_id,months,credits,status').eq('id', orderId).maybeSingle();
  if (!order) return done(false);
  const o = order as { id: string; user_id: string; product_id: string; kind: string; tool: string | null; scope: string | null; scope_id: string | null; months: number | null; credits: number | null; status: string };

  if (o.status === 'paid') return done(true, o.product_id); // مُفعّل مسبقًا — idempotent

  if (status !== 'Paid') {
    await admin.from('payment_orders').update({ status: 'failed', mf_payment_id: paymentId }).eq('id', o.id).eq('status', 'pending');
    return done(false);
  }

  // تفعيل ثم وسم الطلب مدفوعًا (الوسم مشروط بأنه ما زال pending → يمنع التكرار)
  const { data: claimed } = await admin
    .from('payment_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), mf_payment_id: paymentId })
    .eq('id', o.id).eq('status', 'pending').select('id').maybeSingle();
  if (!claimed) return done(true, o.product_id); // فازت نسخة أخرى بالتفعيل

  const { error } = await activate(admin as unknown as RpcClient, o);
  if (error) {
    // أعِد الطلب لحالة تحتاج مراجعة يدوية (مدفوع لكن التفعيل تعذّر)
    await admin.from('payment_orders').update({ status: 'pending' }).eq('id', o.id);
    return done(false);
  }
  return done(true, o.product_id);
}

export const GET = handle;
export const POST = handle;
