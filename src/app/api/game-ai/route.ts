import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

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

// حاجز الفاتورة: سقف يومي لكل مستخدم قبل نداء الذكاء (الأدمِن يتخطّى).
const GAME_DAILY = parseInt(process.env.GAME_DAILY || '25', 10) || 25;

/**
 * مهلة التصحيح: بعد كل خصم، إعادةُ التوليد خلال هذه الدقائق مجانية.
 * السبب: أسئلةٌ لم تعجب المعلمة يجب أن تُعاد بلا أن تُحاسَب مرتين على درسٍ واحد.
 */
const REGEN_GRACE_MIN = parseInt(process.env.GAME_REGEN_GRACE_MIN || '10', 10) || 10;

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

  // ── حاجز الفاتورة: حجز ذرّي يومي قبل نداء الذكاء (fail-closed) ──
  // الأدمِن مُعفى. أي خطأ في الحجز = رفضٌ آمن بلا نداء ذكاء.
  if (!isAdmin) {
    const { data: reserve, error: reserveErr } = await supabase.rpc('ai_reserve_daily', {
      p_kind: 'game',
      p_limit: GAME_DAILY,
    });
    if (reserveErr || !reserve) {
      return NextResponse.json(
        { error: { message: 'تعذّر التحقق من حدّ الاستخدام اليومي — حاولي بعد قليل.' } },
        { status: 503 }
      );
    }
    if (!(reserve as { allowed?: boolean }).allowed) {
      return NextResponse.json(
        { error: { message: 'وصلتِ الحدّ اليومي لتوليد الألعاب. جرّبي غدًا أو تواصلي مع إدارة غراس.' } },
        { status: 429 }
      );
    }
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

    /**
     * الخصم عند التوليد (قرار حصة 2026-09-27) — بدل الخصم عند التشغيل.
     *
     * السبب: الرصيد كان يُخصم عند تشغيل اللعبة فقط، فصار التوليد بالذكاء —
     * وهو وحده ما يكلّفنا فاتورة — مجانيًا بلا حدّ عمليّ (٢٥ طلبًا يوميًا).
     * فمعلمةٌ اشترت ٣ أرصدة بدينارين تولّد عشرات المرات.
     *
     * الخصم **بعد نجاح الطلب** حتى لا تُحاسَب معلمةٌ على توليدٍ فشل، والأدمِن
     * معفى. فشلُ الخصم نفسه لا يُلغي النتيجة — الأسئلة وصلت والمعلمة تستحقها،
     * والحارس الأوّل (رصيد > 0) يمنع الاستهلاك بلا رصيد أصلًا.
     */
    if (!isAdmin && res.ok) {
      /**
       * سجلّ آخر خصم يكتبه الخادم بمفتاح الخدمة — وليس المتصفّح ولا المستخدمة،
       * وإلا أمكن تمديدُ المهلة يدويًا فيصير التوليد مجانيًا للأبد.
       * تعذّرُ قراءة السجل = خصمٌ عاديّ (رفضٌ آمن لصالح الفاتورة).
       */
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const admin =
        supaUrl && serviceKey
          ? createClient(supaUrl, serviceKey, { auth: { persistSession: false } })
          : null;

      let inGrace = false;
      if (admin) {
        const { data: last } = await admin
          .from('game_ai_charges')
          .select('last_charged_at')
          .eq('user_id', user.id)
          .maybeSingle();
        const at = (last as { last_charged_at?: string } | null)?.last_charged_at;
        if (at) inGrace = Date.now() - new Date(at).getTime() < REGEN_GRACE_MIN * 60_000;
      }

      if (!inGrace) {
        const { error: consumeErr } = await supabase.rpc('consume_game_credit');
        if (consumeErr) {
          console.error('[game-ai] consume failed:', consumeErr.message);
        } else if (admin) {
          await admin
            .from('game_ai_charges')
            .upsert({ user_id: user.id, last_charged_at: new Date().toISOString() });
        }
      }
    }

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
