import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * مُصدِّر تصاريح الألعاب.
 * يتأكد من تسجيل الدخول + الاشتراك + صلاحية المادة، ثم يُصدر توكناً موقّعاً
 * قصير العمر ويوجّه المعلمة لرابط اللعبة مع التوكن. الحارس على مستودع الألعاب
 * يتحقق من التوكن قبل فتح اللعبة. بدون هذا التوكن لا تُفتح أي لعبة مباشرة.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 2 * 60 * 1000; // عمر التوكن: دقيقتان فقط (لا ينفع للمشاركة)
const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(msg: string) {
  const secret = process.env.GAME_GATE_SECRET;
  if (!secret) throw new Error('GAME_GATE_SECRET غير مضبوط — رفض آمن (fail-closed)');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}

function home(req: NextRequest) {
  return NextResponse.redirect(new URL('/', req.url));
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('g');
  if (!gameId) return home(req);

  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // اللعبة (سياسات RLS لا تُعيدها إلا لمن يملك صلاحيتها)
  const { data: game } = await supabase
    .from('games')
    .select('id, game_url, subject_id, is_visible')
    .eq('id', gameId)
    .single();
  if (!game || !game.is_visible || !game.game_url) return home(req);

  // حالة الاشتراك
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, sub_end')
    .eq('id', user.id)
    .single();
  const expired =
    profile?.sub_end && new Date(profile.sub_end) < new Date(new Date().toDateString());
  if (!profile || profile.status !== 'active' || Boolean(expired)) return home(req);

  // صلاحية هذه المادة تحديداً
  const { data: ok } = await supabase.rpc('can_access_subject', {
    p_subject: game.subject_id,
  });
  if (ok !== true) return home(req);

  // تسجيل الزيارة (لا يعطّل الفتح)
  void supabase.from('game_visits').insert({ game_id: game.id, user_id: user.id });

  // إصدار التوكن المربوط بمجلّد اللعبة
  let dest: URL;
  try {
    dest = new URL(game.game_url);
  } catch {
    return home(req);
  }
  const slug = dest.pathname.split('/').filter(Boolean)[0] || '';
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await hmac(`t|${slug}|${exp}`);
  dest.searchParams.set('t', `${exp}.${sig}`);

  return NextResponse.redirect(dest.toString());
}
