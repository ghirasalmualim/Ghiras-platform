import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * جسر الذكاء الاصطناعي الآمن لأداة «من سيربح المليون».
 * يحمل المفتاح على الخادم، ولا يعمل إلا لمعلمة مسجّلة دخول ولديها رصيد ألعاب
 * (أو أدمِن). التوليد مجاني وقابل للإعادة ما دام هناك رصيد؛ الخصم يتم عند
 * تشغيل لعبة نهائية عبر /api/game-consume.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GRADEBOOK_MODEL || 'claude-sonnet-5';
const MAX_TOKENS_CAP = 8192;
const MAX_TOKENS_DEFAULT = 1000;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { message: 'يجب تسجيل الدخول' } },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, game_credits')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const credits = profile?.game_credits ?? 0;

  /**
   * ⚠️ **دفاعٌ متعدّد: حالةُ الحساب أوّلًا، ثم الرصيد.**
   *
   * كان الفحص `status === 'suspended'` وحده، فتمرّ حالةٌ استثنائية أو
   * مجهولة. وصار `!== 'active'` — رفضٌ آمن يشمل الموقوف والاستثنائي وكلَّ
   * وضعٍ يُضاف للـenum غدًا. وفشلُ قراءة الملف يُرفض كذلك، فالمجهول لا يمرّ.
   *
   * ⚠️ ولا يُربط برصيدٍ ولا بـ`sub_end`: رصيد الألعاب منتجٌ مستقلّ
   * يُشترى ويُستعمل بلا اشتراك مواد — والنصّ نفسه يقول «كل رصيد = لعبة
   * كاملة». فمن انقضى محتواه ورصيدُه باقٍ يُولّد به.
   *
   * ⚠️ والرسالتان مفصولتان: «لا رصيد» تهمةٌ في غير محلّها لمن حسابه
   * موقوف — وهو النمط الذي أخرج «ليس لديك صلاحية» عن عطبٍ تقنيّ.
   */
  if (!isAdmin && profile?.status !== 'active') {
    return NextResponse.json(
      { error: { message: 'هذا الحساب غير متاح حاليًا — يرجى التواصل مع إدارة غراس المعلم.' } },
      { status: 403 }
    );
  }
  if (!isAdmin && credits <= 0) {
    return NextResponse.json(
      { error: { message: 'لا يوجد رصيد ألعاب. شراء لعبة للمتابعة.' } },
      { status: 403 }
    );
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: { message: 'المفتاح غير مُعدّ على الخادم' } },
      { status: 500 }
    );
  }

  let body: { messages?: unknown; max_tokens?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'طلب غير صالح' } }, { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: { message: 'messages مفقودة' } }, { status: 400 });
  }

  const reqTokens = parseInt(String(body?.max_tokens), 10);
  const maxTokens = Math.min(
    MAX_TOKENS_CAP,
    Math.max(256, isFinite(reqTokens) ? reqTokens : MAX_TOKENS_DEFAULT)
  );

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
    });
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: { message: 'تعذّر الاتصال بخدمة الذكاء الاصطناعي' } },
      { status: 502 }
    );
  }
}
