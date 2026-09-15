import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * رفع/حذف صور إنجازات «أجندتي» في Supabase Storage (bucket خاص `agenda`).
 * كل صورة تحت مجلد باسم user_id، وRLS يقصر كل عملية على مجلد صاحبها.
 * الصورة تُضغط في المتصفّح قبل الرفع؛ هنا نستقبلها base64 ونرفعها ونعيد مسارها
 * ورابطًا موقّعًا مؤقتًا للعرض.
 *   POST   { dataUrl }         → { path, url }
 *   DELETE { path }            → { ok }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 6 * 1024 * 1024;
const SIGN_TTL = 60 * 60; // ساعة
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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
    (profile && profile.status !== 'suspended' && profile.agenda_until && new Date(profile.agenda_until as string) > new Date());
  if (!active) return { error: 'forbidden' as const, supabase, user };
  return { error: null, supabase, user };
}

const uuid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  let body: { dataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const dataUrl = body?.dataUrl || '';
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return NextResponse.json({ error: 'bad_image' }, { status: 400 });
  const mime = m[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const path = `${user!.id}/${uuid()}.${ext}`;
  const { error: upErr } = await supabase!.storage.from('agenda').upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed } = await supabase!.storage.from('agenda').createSignedUrl(path, SIGN_TTL);
  return NextResponse.json({ path, url: signed?.signedUrl || null });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const path = body?.path || '';
  // حماية: لا يُحذف إلا داخل مجلد المستخدم (RLS يحرسه أيضًا)
  if (!path.startsWith(`${user!.id}/`)) return NextResponse.json({ error: 'forbidden_path' }, { status: 403 });
  const { error } = await supabase!.storage.from('agenda').remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
