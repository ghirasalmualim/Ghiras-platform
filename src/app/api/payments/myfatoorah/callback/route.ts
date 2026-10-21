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
  id: string; user_id: string; product_id: string; kind: string; tool: string | null; scope: string | null; scope_id: string | null; months: number | null; credits: number | null; qty?: number | null; scope_key?: string | null;
}) {
  // سجلٌّ إضافيٌّ (درجات/حضور): بلا مدّة، يُضاف لعددِ السجلّات
  if (order.kind === 'tool' && order.tool && !order.months && order.credits) {
    return admin.rpc('payment_add_tool_records', { p_user: order.user_id, p_tool: order.tool, p_count: order.credits });
  }
  // باقةٌ بعددِ سجلّات (٤ أو ٢) — تمدّد المدّة وتضبط العدد
  if (order.kind === 'tool' && order.tool && order.months && order.credits && (order.tool === 'gradebook' || order.tool === 'attendance')) {
    const r = await admin.rpc('payment_activate_tool_slots', { p_user: order.user_id, p_tool: order.tool, p_months: order.months, p_slots: order.credits });
    // احتياط: إن لم تُشغَّل مايجريشن 2026-10-21 بعد، فالباقةُ الكاملةُ (٤) تُفعَّل بالدالّة القديمة كما كانت
    if (r.error && order.credits >= 4) return admin.rpc('payment_activate_tool', { p_user: order.user_id, p_tool: order.tool, p_months: order.months });
    return r;
  }
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
  // إدارة الحضور المدرسية: الدالّةُ تتحقّق أن المشترية من إدارةِ المدرسة وأن الفصول ≥ ١٠
  if (order.kind === 'att_org' && order.scope_id && order.qty && order.months) {
    return admin.rpc('payment_att_org', { p_user: order.user_id, p_school: order.scope_id, p_classes: order.qty, p_months: order.months });
  }
  // مكتبة حصص غراس: يُمدَّد اشتراكُ مادةٍ في صفٍّ (يقرؤه الاستوديو بجلسة المعلمة)
  if (order.kind === 'library' && order.scope_key && order.months) {
    return admin.rpc('payment_grant_library', { p_user: order.user_id, p_key: order.scope_key, p_months: order.months });
  }
  // ورش غراس: تُفتح ورشةٌ بعينها شهرًا (يقرؤه الاستوديو بجلسة المعلمة)، والتجديدُ يمدّ
  if (order.kind === 'workshop' && order.scope_key && order.months) {
    return admin.rpc('payment_grant_workshop', { p_user: order.user_id, p_key: order.scope_key, p_months: order.months });
  }
  // عرضٌ واحدٌ من مكتبة الاستوديو: يُفتح ثلاثةَ أشهر (يقرؤه الاستوديو بجلسة المعلمة)، والتجديدُ يمدّ
  if (order.kind === 'lesson' && order.scope_key && order.months) {
    return admin.rpc('payment_grant_lesson', { p_user: order.user_id, p_key: order.scope_key, p_months: order.months });
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

  type Order = { id: string; user_id: string; product_id: string; kind: string; tool: string | null; scope: string | null; scope_id: string | null; months: number | null; credits: number | null; qty?: number | null; scope_key?: string | null; status: string };
  // ⚠️ عمودُ qty يحتاج supabase/2026-10-10-payment-att-org.sql — يُشغَّل قبل نشرِ هذا الكود
  // ⚠️ scope_key يحتاج supabase/2026-10-10-library-subscriptions.sql قبل النشر
  const COLS = 'id,user_id,product_id,kind,tool,scope,scope_id,months,credits,qty,scope_key,status';

  // المرجعُ إمّا معرّفُ طلبٍ منفرد، وإمّا معرّفُ سلّةٍ (cart_id) تشتركُ فيه عدّةُ صفوف.
  const { data: single } = await admin.from('payment_orders').select(COLS).eq('id', orderId).maybeSingle();
  let orders: Order[] = single ? [single as Order] : [];
  const isCart = !single;
  if (isCart) {
    const { data: rows } = await admin.from('payment_orders').select(COLS).eq('cart_id', orderId);
    orders = (rows ?? []) as Order[];
  }
  if (!orders.length) return done(false);
  const label = isCart ? 'cart' : orders[0].product_id;

  if (orders.every((o) => o.status === 'paid')) return done(true, label); // مُفعّل مسبقًا — idempotent

  if (status !== 'Paid') {
    for (const o of orders) {
      await admin.from('payment_orders').update({ status: 'failed', mf_payment_id: paymentId }).eq('id', o.id).eq('status', 'pending');
    }
    return done(false);
  }

  // لكلِّ صف: وسمُه مدفوعًا (مشروطٌ بأنه ما زال pending → يمنع التكرار) ثم تفعيلُه.
  // صفٌّ يتعذّر تفعيلُه يعود pending للمراجعة اليدوية ولا يوقفُ بقيّةَ السلّة.
  let failed = 0;
  for (const o of orders) {
    const { data: claimed } = await admin
      .from('payment_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), mf_payment_id: paymentId })
      .eq('id', o.id).eq('status', 'pending').select('id').maybeSingle();
    if (!claimed) continue; // مدفوعٌ من قبل أو فازت به نسخةٌ أخرى
    const { error } = await activate(admin as unknown as RpcClient, o);
    if (error) {
      failed++;
      await admin.from('payment_orders').update({ status: 'pending' }).eq('id', o.id);
    }
  }
  if (failed) return done(false);
  return done(true, label);
}

export const GET = handle;
export const POST = handle;
