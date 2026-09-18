import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isStillValid } from '@/lib/entitlements';
import { getStageBySlug, getGradeBySlug, getSubjects } from '@/lib/supabase/data';

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
  // لعبة الطالب: تُقيَّد بمدن (مواد) الصف التي تملك المشترِكة صلاحيتها فعلًا.
  student?: boolean;
  gradeSlug?: string; // صفّ اللعبة (مثل 'grade-5') — لحساب المدن المسموحة.
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
    student: true,
    gradeSlug: 'grade-5',
  },
  // لعبة الطالب (الصف الرابع) — نفس النموذج المشمول باشتراك المواد (sub_end).
  'student-g4': {
    url: 'https://games.ghiras-edu.com/student-g4/full-review',
    slug: 'student-g4',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
    student: true,
    gradeSlug: 'grade-4',
  },
  // لعبة الطالب (الصف الثالث) — نفس النموذج المشمول باشتراك المواد (sub_end).
  'student-g3': {
    url: 'https://games.ghiras-edu.com/student-g3/full-review',
    slug: 'student-g3',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
    student: true,
    gradeSlug: 'grade-3',
  },
  // لعبة الطالب (الصف الثاني) — نفس النموذج المشمول باشتراك المواد (sub_end).
  'student-g2': {
    url: 'https://games.ghiras-edu.com/student-g2/full-review',
    slug: 'student-g2',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
    student: true,
    gradeSlug: 'grade-2',
  },
  // لعبة الطالب (الصف الأول) — نفس النموذج المشمول باشتراك المواد (sub_end).
  'student-g1': {
    url: 'https://games.ghiras-edu.com/student-g1/full-review',
    slug: 'student-g1',
    until: 'sub_end',
    lock: '/student-game-locked',
    deviceLimit: false,
    student: true,
    gradeSlug: 'grade-1',
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
  let active =
    isAdmin ||
    (!!p &&
      p.status !== 'suspended' &&
      cols.some((c) => isStillValid((p[c] as string | null) ?? null)));

  // ── لعبة الطالب: تُقيَّد بالمدن (المواد) المملوكة فعلًا في هذا الصف ──
  // المدن المسموحة = المواد التي تُرجِع can_access_subject=صحيح (نفس منطق صفحات
  // الألعاب تمامًا). الأدمِن: كل المدن. وأي خطأ غير متوقّع ⇒ نُبقي السلوك الحالي
  // (sub_end) بلا قفل مدن — حتى لا ينكسر وصول أي مشترِكة (fail-open مقصود).
  let citiesParam: string | null = null;
  if (tool.student && tool.gradeSlug) {
    try {
      const stage = await getStageBySlug('primary');
      const grade = stage ? await getGradeBySlug(stage.id, tool.gradeSlug) : null;
      const subjects = grade ? await getSubjects(grade.id) : [];
      let allowed: string[];
      if (isAdmin) {
        allowed = subjects.map((s) => s.slug);
      } else {
        allowed = [];
        for (const s of subjects) {
          const { data: ok } = await supabase.rpc('can_access_subject', {
            p_subject: s.id,
          });
          if (ok === true) allowed.push(s.slug);
        }
      }
      active = isAdmin || allowed.length > 0;
      if (active) citiesParam = isAdmin ? 'all' : allowed.join(',');
    } catch (e) {
      console.error('[STUDENT_CITY_FALLBACK]', (e as Error)?.message ?? e);
    }
  }

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

  // مدن لعبة الطالب المسموحة — موقّعة بنفس صلاحية التوكن. حارس الألعاب يتحقق
  // منها ويمرّرها للّعبة (كوكي)، واللعبة تقفل المدن غير المسموحة. غيابها ⇒ لا قفل.
  if (citiesParam !== null) {
    const cEnc = b64url(enc.encode(citiesParam));
    const cSig = await hmac(`c|${tool.slug}|${exp}|${cEnc}`);
    dest.searchParams.set('c', `${exp}.${cEnc}.${cSig}`);
  }

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
