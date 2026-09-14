import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حفظ/تحميل حالة «سجلات رئيس الشعبة» سحابيًّا — صفّ JSON واحد لكل مستخدمة.
 * محكوم بنفس حارس الأداة: جلسة مسجّلة + اشتراك head_records_until سارٍ (أو أدمِن).
 *   GET  → يُرجع { data, updated_at }  (data = null إن لم يُحفظ شيء بعد).
 *   POST → يحفظ/يحدّث اللقطة الكاملة (snapshot) الآتية في body.data.
 *
 * الأمان: العميل لا يحمل أي مفتاح؛ الجلسة تُقرأ من الكوكيز، وRLS في القاعدة
 * تضمن أن كل مستخدمة لا تقرأ/تكتب إلا صفّها هي (auth.uid() = user_id).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// حدّ أعلى للقطة المحفوظة سحابيًّا (الحماية من صفوف ضخمة). ~8MB نصًّا.
const MAX_BYTES = 8 * 1024 * 1024;

async function guard() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'auth' as const, supabase, user: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, head_records_until')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.head_records_until &&
      new Date(profile.head_records_until as string) > new Date());

  if (!active) return { error: 'forbidden' as const, supabase, user };
  return { error: null, supabase, user };
}

export async function GET() {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  const { data, error } = await supabase!
    .from('head_records_state')
    .select('data, updated_at')
    .eq('user_id', user!.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data?.data ?? null,
    updated_at: data?.updated_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  let body: { data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const payload = body?.data;
  // نقبل أي لقطة صالحة: كائن (وليس مصفوفة) يحمل ترويسة الإصدار _v.
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (payload as { _v?: unknown })._v === undefined
  ) {
    return NextResponse.json({ error: 'invalid_shape' }, { status: 400 });
  }

  const updated_at = new Date().toISOString();
  const { error } = await supabase!.from('head_records_state').upsert(
    { user_id: user!.id, data: payload, updated_at },
    { onConflict: 'user_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated_at });
}
