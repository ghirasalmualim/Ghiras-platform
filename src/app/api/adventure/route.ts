import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * تحميل/حفظ بيانات «مغامرة المجموعات» لكل معلمة (صف JSON واحد لكل مستخدم).
 * محكوم بجلسة المستخدم + اشتراك مغامرة سارٍ (أو أدمِن).
 * GET  → يُرجع البيانات.  POST → يحفظ/يحدّث البيانات.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'auth' as const, supabase, user: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, adventure_until')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.adventure_until &&
      new Date(profile.adventure_until as string) > new Date());

  if (!active) return { error: 'forbidden' as const, supabase, user };
  return { error: null, supabase, user };
}

export async function GET() {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  const { data, error } = await supabase!
    .from('adventure_data')
    .select('data')
    .eq('user_id', user!.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data?.data ?? { boards: [], active: null } });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  let body: { data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const payload = body?.data;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { boards?: unknown }).boards)
  ) {
    return NextResponse.json({ error: 'invalid_shape' }, { status: 400 });
  }

  const { error } = await supabase!.from('adventure_data').upsert(
    { user_id: user!.id, data: payload, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
