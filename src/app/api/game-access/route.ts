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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠️ **لا يُردّ أحدٌ صامتاً إلى الصفحة الرئيسية.**
 *
 * كانت ستّ حالاتٍ مختلفة تنتهي كلها بـ`redirect('/')`: عطبُ قاعدةٍ،
 * ورفضُ صلاحيةٍ حقيقي، واشتراكٌ منقضٍ، وحسابٌ موقوف، ولعبةٌ محذوفة،
 * ومعرّفٌ فاسد. والزرّ يفتح تبويباً جديداً — فترى المشتركة تبويباً فيه
 * صفحة غراس الرئيسية بلا كلمة، فلا تدري أالخلل عندها أم عندنا.
 *
 * ⚠️ وصمتٌ تامّ أسوأ من رسالةٍ خاطئة: الخاطئة خبرٌ يُصحَّح، وهذا لا خبر فيه.
 */
type AccessState =
  | 'ACCESS_DENIED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'STATUS_SUSPENDED'
  | 'PROFILE_MISSING'
  | 'GAME_NOT_FOUND'
  | 'TECHNICAL';

const REASON: Record<AccessState, string> = {
  ACCESS_DENIED: 'denied',
  SUBSCRIPTION_EXPIRED: 'expired',
  STATUS_SUSPENDED: 'suspended',
  PROFILE_MISSING: 'account',
  GAME_NOT_FOUND: 'missing',
  TECHNICAL: 'technical',
};

/**
 * ⚠️ رمز القاعدة يُسجَّل على الخادم ولا يُعرض للمستخدم أبداً: يُفشي بنية
 * القاعدة ولا يُفيد المشتركة في شيء.
 *
 * ⚠️ و`g` يُمرَّر للصفحة **فقط** حين تكون الإعادة ممكنة فعلاً — أي في
 * الحالة التقنية وبمعرّفٍ صالح. وزرُّ إعادةٍ لا يُعيد شيئاً أسوأ من غيابه.
 */
function deny(
  req: NextRequest,
  state: AccessState,
  code?: string | null,
  gameId?: string | null
) {
  if (state === 'TECHNICAL' || state === 'PROFILE_MISSING') {
    console.error('[GAME_ACCESS_FAULT]', state, code ?? '-');
  }
  const u = new URL(`/game-unavailable?r=${REASON[state]}`, req.url);
  if (state === 'TECHNICAL' && gameId && UUID_RE.test(gameId)) {
    u.searchParams.set('g', gameId);
  }
  return NextResponse.redirect(u, 303);
}

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

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('g');
  if (!gameId) return deny(req, 'GAME_NOT_FOUND');

  /**
   * ⚠️ `g` مدخلٌ خامّ من الرابط، و`games.id` عمود `uuid`.
   * فنصٌّ ليس UUID يُخرج `22P02` من القاعدة قبل أي فحص صلاحية — وكان
   * يُبتلع صامتاً فيُردّ المستخدم إلى الرئيسية بلا كلمة.
   *
   * ويُسجَّل رغم أنه يبدو خطأ مستخدم: قد يدلّ على رابطٍ مكسورٍ ولّدناه نحن.
   */
  if (!UUID_RE.test(gameId)) {
    console.error('[GAME_ACCESS_FAULT]', 'INVALID_GAME_ID', '-');
    return deny(req, 'GAME_NOT_FOUND');
  }

  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // صفحة الدخول تقرأ `next` وتعود إليه — فترجع المعلمة إلى لعبتها
    const back = req.nextUrl.pathname + req.nextUrl.search;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(back)}`, req.url)
    );
  }

  // اللعبة (سياسات RLS لا تُعيدها إلا لمن يملك صلاحيتها)
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, game_url, subject_id, is_visible')
    .eq('id', gameId)
    .maybeSingle();
  if (gameError)
    return deny(req, 'TECHNICAL', (gameError as { code?: string }).code, gameId);
  if (!game || !game.is_visible || !game.game_url)
    return deny(req, 'GAME_NOT_FOUND');

  // حالة الاشتراك
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status, sub_end, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError)
    return deny(req, 'TECHNICAL', (profileError as { code?: string }).code, gameId);
  if (!profile) return deny(req, 'PROFILE_MISSING', null, gameId);

  /**
   * ⚠️ **حواجزُ ثانية — أكثرها محجوبٌ اليوم، ولا يُحذف.**
   *
   * سياسة `games gated read` تستدعي `can_access_subject`، والدالّة تفحص
   * بداخلها: وجودَ الملف، و`status = 'active'`، وسريانَ الاشتراك،
   * والصلاحية. فمن سقط في أيٍّ منها **يختفي عنه صفُّ اللعبة أصلاً**،
   * فيصل إلى `GAME_NOT_FOUND` ولا يبلغ الفحوص التالية.
   *
   * فـ`PROFILE_MISSING` و`ACCESS_DENIED` محجوبان دائماً، و`SUSPENDED`
   * و`SUBSCRIPTION_EXPIRED` محجوبان لكل غير الأدمِن — لأن `is_admin()`
   * في السياسة يُظهر الصفَّ له وحده.
   *
   * ⚠️ **ومع ذلك تبقى — وليست كوداً ميتاً.**
   *
   * أمانُ هذا المسار لا يجوز أن يتعلّق بسياسةٍ واحدة، وسياساتُنا ليست
   * كلها في الإصدار: إحدى عشرة دالّةً وسياسةُ إدراجٍ ومشغّلٌ تعمل في
   * الإنتاج ولا نملك نصَّها. فلو خُفِّفت السياسة يوماً — بيدٍ أو بترحيلٍ
   * خاطئ — لبقي هذا هو الحارس. **ومن يحذفها يظنّها تكراراً، وهي الحاجز
   * الثاني.**
   */

  const expired =
    profile.sub_end && new Date(profile.sub_end) < new Date(new Date().toDateString());
  /**
   * ⚠️ **الأدمِن معفًى من التاريخ، لا من الحالة** — كما في
   * `can_access_subject` حرفاً: الحالة تشمل الجميع، وفحصُ `sub_end`
   * في فرع غير الأدمِن وحده.
   */
  const isAdmin = profile.role === 'admin';
  if (profile.status === 'suspended') return deny(req, 'STATUS_SUSPENDED');
  if (profile.status === 'expired' || (!isAdmin && Boolean(expired)))
    return deny(req, 'SUBSCRIPTION_EXPIRED');
  /**
   * ⚠️ **رفضٌ آمن لما لا نعرفه.**
   *
   * الأصل كان `status !== 'active'` فيرفض كل جديد. وتفكيكُه إلى حالاتٍ
   * مسمّاة يفتح ثغرةً ليوم يُضاف فيه وضعٌ جديد للـenum: يمرّ بلا حارس.
   * فالمجهول يُرفض هنا ويُسجَّل، ولا يُترك للدالّة وحدها.
   */
  if (profile.status !== 'active')
    return deny(req, 'TECHNICAL', 'UNKNOWN_STATUS', gameId);

  // ⚠️ دفاعٌ عن عمق: العمود `uuid not null`، فهذا يحرس ما لم نتوقّعه
  if (!UUID_RE.test(String(game.subject_id)))
    return deny(req, 'TECHNICAL', 'INVALID_SUBJECT_ID', gameId);

  // صلاحية هذه المادة تحديداً
  const { data: ok, error: rpcError } = await supabase.rpc('can_access_subject', {
    p_subject: game.subject_id,
  });
  /**
   * ⚠️ **ثلاثةٌ لا اثنان.**
   *
   * كان `if (ok !== true)` يجمع الخطأ والرفض وأيَّ جوابٍ غير متوقّع في
   * حكمٍ واحد: «ممنوع». وهو ما لدغَنا في صفحة المادة — رمت الدالّة خطأً
   * فصار `ok = null`، فقيل لحسابٍ صلاحيتُه سليمة إنه ممنوع.
   *
   * فالمنع لا يقع الآن إلا على `false` صريحٍ بلا خطأ.
   */
  if (rpcError)
    return deny(req, 'TECHNICAL', (rpcError as { code?: string }).code, gameId);
  if (ok === false) return deny(req, 'ACCESS_DENIED');
  if (ok !== true)
    return deny(req, 'TECHNICAL', 'RPC_UNEXPECTED_RESULT', gameId);

  // تسجيل الزيارة (لا يعطّل الفتح)
  void supabase.from('game_visits').insert({ game_id: game.id, user_id: user.id });

  // إصدار التوكن المربوط بمجلّد اللعبة
  let dest: URL;
  try {
    dest = new URL(game.game_url);
  } catch {
    return deny(req, 'TECHNICAL', 'BAD_GAME_URL', gameId);
  }
  const slug = dest.pathname.split('/').filter(Boolean)[0] || '';
  const exp = Date.now() + TOKEN_TTL_MS;
  /**
   * ⚠️ غيابُ `GAME_GATE_SECRET` كان يرمي بلا التقاط، فيرى المستخدم صفحة
   * خطأٍ خامّة (500) في تبويبٍ جديد. والرفض يبقى آمناً (fail-closed)،
   * لكنه يُقال الآن بلغةٍ مفهومة.
   */
  let sig: string;
  try {
    sig = await hmac(`t|${slug}|${exp}`);
  } catch {
    return deny(req, 'TECHNICAL', 'GATE_SECRET_MISSING', gameId);
  }
  dest.searchParams.set('t', `${exp}.${sig}`);

  return NextResponse.redirect(dest.toString());
}
