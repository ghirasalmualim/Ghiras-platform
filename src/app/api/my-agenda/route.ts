import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حالة «أجندتي» لكل معلّم/ة — صف JSON واحد (مهام · مواعيد · ملاحظات · أولويات
 * أسبوعية · بيانات الإنجازات · حصاد الشهر). صور الإنجازات في Storage، وهنا
 * مساراتها فقط. محكوم بجلسة + اشتراك agenda_until (أو أدمِن) عبر RLS.
 *   GET  → { data, updated_at }   (data = الشكل الافتراضي إن لم يُحفظ شيء).
 *   POST → يحفظ اللقطة الكاملة الآتية في body.data.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024; // حالة نصية فقط (الصور في Storage)
const EMPTY = { _v: 1, tasks: [], events: [], weekly: {}, notes: {}, achievements: [], harvest: {} };

async function guard() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'auth' as const, supabase, user: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, agenda_until')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.agenda_until &&
      new Date(profile.agenda_until as string) > new Date());

  if (!active) return { error: 'forbidden' as const, supabase, user };
  return { error: null, supabase, user };
}

export async function GET() {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  const { data, error } = await supabase!
    .from('my_agenda_state')
    .select('data, updated_at')
    .eq('user_id', user!.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data?.data ?? EMPTY,
    updated_at: data?.updated_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  let body: { data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const payload = body?.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !Array.isArray((payload as { tasks?: unknown }).tasks)) {
    return NextResponse.json({ error: 'invalid_shape' }, { status: 400 });
  }

  const updated_at = new Date().toISOString();
  const { error } = await supabase!.from('my_agenda_state').upsert(
    { user_id: user!.id, data: payload, updated_at },
    { onConflict: 'user_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated_at });
}
