import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * مُصدِّر تصاريح الأدوات المحمية (دفتر التقييم الذكي).
 * يتأكد من تسجيل الدخول + اشتراك الأداة السارّي، ثم يُصدر توكناً موقّعاً قصير العمر
 * ويوجّه المعلمة لرابط الأداة. الحارس على مستودع الألعاب يتحقق من التوكن.
 * بدون اشتراك سارٍ + توكن، لا تُفتح الأداة (لا من البطاقة ولا من الرابط المباشر).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 2 * 60 * 1000; // عمر التوكن: دقيقتان
const enc = new TextEncoder();

// الأدوات المحمية: المفتاح -> رابط الأداة ومجلّدها (slug)
const TOOLS: Record<string, { url: string; slug: string }> = {
  gradebook: {
    url: 'https://ghiras-games.vercel.app/gradebook/full-review',
    slug: 'gradebook',
  },
};

function b64url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(msg: string) {
  const secret = process.env.GAME_GATE_SECRET || '';
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
  const toolKey = req.nextUrl.searchParams.get('tool') || 'gradebook';
  const tool = TOOLS[toolKey];
  if (!tool) return home(req);

  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // اشتراك الدفتر مستقل: صلاحيته في عمود gradebook_until. والأدمِن يفتح كل شيء.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, gradebook_until')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.gradebook_until &&
      new Date(profile.gradebook_until) > new Date());
  if (!active) {
    // ليست مشترِكة في الدفتر — صفحة توضيحية بدل التوجيه الصامت
    return NextResponse.redirect(new URL('/gradebook-locked', req.url));
  }

  // إصدار التوكن المربوط بمجلّد الأداة
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await hmac(`t|${tool.slug}|${exp}`);
  const dest = new URL(tool.url);
  dest.searchParams.set('t', `${exp}.${sig}`);

  return NextResponse.redirect(dest.toString());
}
