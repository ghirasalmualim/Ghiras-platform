import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * تحميل/حفظ بيانات سجل الحضور لكل معلمة (صف JSON واحد لكل مستخدم).
 * محكوم بجلسة المستخدم + اشتراك حضور سارٍ (أو أدمِن) + حدّ الجهازين.
 * GET  → يُرجع البيانات + عدد السجلات المسموح + حالة الجهاز.
 * POST → يحفظ/يحدّث البيانات.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_REGISTERS = 2; // سجلان مجاناً ضمن الاشتراك

async function guard() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'auth' as const, supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, attendance_until, attendance_extra')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.attendance_until &&
      new Date(profile.attendance_until as string) > new Date());

  if (!active) return { error: 'forbidden' as const, supabase, user, profile };
  return { error: null, supabase, user, profile, isAdmin };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user, profile, isAdmin } = g;

  const allowance = isAdmin
    ? 9999
    : BASE_REGISTERS + (((profile?.attendance_extra as number) ?? 0) || 0);

  // حدّ الجهازين (للمشترِكات فقط، الأدمِن مُعفى) — يعيد استخدام register_device
  let newDevice = false;
  let deviceId = req.cookies.get('gg_device')?.value || '';
  if (!isAdmin) {
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      newDevice = true;
    }
    const { data: dv } = await supabase!.rpc('register_device', { p_device: deviceId });
    if (dv === 'limit') {
      return NextResponse.json({ error: 'device_limit' }, { status: 200 });
    }
  }

  const { data, error } = await supabase!
    .from('attendance_data')
    .select('data')
    .eq('user_id', user!.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({
    data: data?.data ?? { classes: [] },
    allowance,
    isAdmin: !!isAdmin,
  });
  if (newDevice) {
    res.cookies.set('gg_device', deviceId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
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
    !Array.isArray((payload as { classes?: unknown }).classes)
  ) {
    return NextResponse.json({ error: 'invalid_shape' }, { status: 400 });
  }

  const { error } = await supabase!.from('attendance_data').upsert(
    { user_id: user!.id, data: payload, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
