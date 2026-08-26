import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * أفعال حالة المحادثة.
 *
 * صلاحية UPDATE من المتصفح مقصورة على user_seen_at وحده — فكل تغيير
 * حالةٍ هنا يمر بمفتاح الخدمة بعد إثبات الحق: الإغلاق لمن تُثبت RLS
 * أنها ترى المحادثة (صاحبتها أو الأدمِن)، والاستلام/الإعادة/الرد
 * للأدمِن وحده بعد فحص الدور.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  let body: { id?: string; action?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const id = String(body.id || '');
  const action = String(body.action || '');
  if (!id || !action) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin';

  const now = new Date().toISOString();

  if (action === 'seen') {
    await supabase.from('support_conversations').update({ user_seen_at: now }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'close') {
    // إثبات الحق بقراءة RLS (صاحبتها أو الأدمِن) ثم الكتابة بمفتاح الخدمة
    const { data: can } = await supabase
      .from('support_conversations')
      .select('id')
      .eq('id', id)
      .single();
    if (!can) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const svc = serviceClient();
    if (!svc) return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    const { error } = await svc
      .from('support_conversations')
      .update({ status: 'closed' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── ما يلي أفعال إدارة صرفة ──
  if (!isAdmin) return NextResponse.json({ error: 'ADMIN_ONLY' }, { status: 403 });

  const svcA = serviceClient();
  if (!svcA) return NextResponse.json({ error: 'FAILED' }, { status: 500 });

  if (action === 'takeover') {
    const { error } = await svcA
      .from('support_conversations')
      .update({ handling_mode: 'human', status: 'human_handling' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reactivate_ai') {
    const { error } = await svcA
      .from('support_conversations')
      .update({ handling_mode: 'ai', status: 'open' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reply') {
    const content = String(body.content || '').trim();
    if (!content || content.length > 2000)
      return NextResponse.json({ error: 'BAD_CONTENT' }, { status: 400 });
    const { error } = await supabase.from('support_messages').insert({
      conversation_id: id,
      sender_type: 'admin',
      sender_user_id: user.id,
      content,
    });
    if (error) return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    await svcA
      .from('support_conversations')
      .update({
        last_message_at: now,
        last_sender: 'admin',
        handling_mode: 'human',
        status: 'human_handling',
      })
      .eq('id', id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
