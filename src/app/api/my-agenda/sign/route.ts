import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * توقيع روابط عرض مؤقتة لصور الإنجازات (bucket خاص). يقبل قائمة مسارات ويعيد
 * خريطة path → signedUrl. محكوم بالاشتراك، ولا يوقّع إلا مسارات مجلد المستخدم.
 *   POST { paths: string[] } → { urls: { [path]: string } }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGN_TTL = 60 * 60;

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

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error === 'auth') return NextResponse.json({ error: 'auth' }, { status: 401 });
  if (g.error === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { supabase, user } = g;

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const paths = Array.isArray(body?.paths) ? (body!.paths as unknown[]).filter((p): p is string => typeof p === 'string') : [];
  const mine = paths.filter((p) => p.startsWith(`${user!.id}/`)).slice(0, 200);
  const urls: Record<string, string> = {};
  if (mine.length) {
    const { data } = await supabase!.storage.from('agenda').createSignedUrls(mine, SIGN_TTL);
    (data || []).forEach((d) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
  }
  return NextResponse.json({ urls });
}
