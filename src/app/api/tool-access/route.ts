import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isStillValid } from '@/lib/entitlements';

/**
 * مُصدِّر تصاريح الأدوات المحمية (دفتر التقييم الذكي + عروض غراس التفاعلية).
 * يتأكد من تسجيل الدخول + اشتراك الأداة السارّي، ثم يُصدر توكناً موقّعاً قصير العمر
 * ويوجّه المعلمة لرابط الأداة. الحارس على مستودع الألعاب يتحقق من التوكن.
 * بدون اشتراك سارٍ + توكن، لا تُفتح الأداة (لا من البطاقة ولا من الرابط المباشر).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 2 * 60 * 1000; // عمر التوكن: دقيقتان
const enc = new TextEncoder();

type ToolCfg = {
  url: string; // رابط الأداة على مستودع الألعاب
  slug: string; // المجلّد (لربط التوكن)
  // عمود صلاحيةٍ واحد، أو عدّة أعمدة — أيُّها سارٍ يفتح الأداة (منطق «أو»).
  until: string | readonly string[];
  lock: string; // صفحة «خاص بالمشتركين»
  deviceLimit: boolean; // هل تُطبّق قاعدة الجهازين؟
};

// الأدوات المحمية
const TOOLS: Record<string, ToolCfg> = {
  gradebook: {
    url: 'https://games.ghiras-edu.com/gradebook/full-review',
    slug: 'gradebook',
    until: 'gradebook_until',
    lock: '/gradebook-locked',
    deviceLimit: true,
  },
  workshops: {
    url: 'https://games.ghiras-edu.com/workshops/',
    slug: 'workshops',
    until: 'workshops_until',
    lock: '/workshops-locked',
    deviceLimit: false,
  },
  // لعبة الطالب (الصف الخامس) — مزيّةٌ ضمن اشتراك المواد الكامل: تُفتح لكل
  // مشترِكٍ اشتراكُه ساري المفعول (sub_end)، ولا تُباع منفصلة.
  'student-g5': {
    url: 'https://games.ghiras-edu.com/student-g5/full-review',
    slug: 'student-g5',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
  },
  // لعبة الطالب (الصف الرابع) — نفس النموذج المشمول باشتراك المواد (sub_end).
  'student-g4': {
    url: 'https://games.ghiras-edu.com/student-g4/full-review',
    slug: 'student-g4',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
  },
};

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

  // صلاحية اشتراك الأداة في عمودها الخاص (أو أحد أعمدتها). والأدمِن يفتح كل شيء.
  const cols = Array.isArray(tool.until) ? tool.until : [tool.until];
  const { data: profile } = await supabase
    .from('profiles')
    .select(`role, status, ${cols.join(', ')}`)
    .eq('id', user.id)
    .single();

  const p = profile as { role?: string; status?: string; [k: string]: unknown } | null;
  const isAdmin = p?.role === 'admin';
  // سارٍ إن كان أدمِن، أو الحساب غير موقوف وأحدُ أعمدة الصلاحية ساري المفعول.
  const active =
    isAdmin ||
    (!!p &&
      p.status !== 'suspended' &&
      cols.some((c) => isStillValid((p[c] as string | null) ?? null)));
  if (!active) {
    // ليست مشترِكة في هذه الأداة — صفحة توضيحية بدل التوجيه الصامت
    return NextResponse.redirect(new URL(tool.lock, req.url));
  }

  // حدّ الجهازين (للأدوات المُفعّل عليها فقط، الأدمِن مُعفى)
  let newDevice = false;
  let deviceId = req.cookies.get('gg_device')?.value || '';
  if (tool.deviceLimit && !isAdmin) {
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      newDevice = true;
    }
    const { data: dv } = await supabase.rpc('register_device', { p_device: deviceId });
    if (dv === 'limit') {
      return NextResponse.redirect(new URL('/device-limit', req.url));
    }
  }

  // إصدار التوكن المربوط بمجلّد الأداة
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await hmac(`t|${tool.slug}|${exp}`);
  const dest = new URL(tool.url);
  dest.searchParams.set('t', `${exp}.${sig}`);

  // توكن موحّد للدفتر: يؤمّن جسر الذكاء الاصطناعي (SEC-001) والتخزين السحابي (REL-002).
  // يحمل هوية المعلّمة، صالح ٨ ساعات (نفس عمر جلسة الدفتر).
  if (tool.slug === 'gradebook') {
    const kExp = Date.now() + 8 * 60 * 60 * 1000;
    const kSig = await hmac(`k|${user.id}|${kExp}`);
    dest.searchParams.set('k', `${kExp}.${user.id}.${kSig}`);
  }

  const res = NextResponse.redirect(dest.toString());
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
