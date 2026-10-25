import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { GAME_IDS, GRADES, buildGamePrompt, type GameId } from '@/lib/game-prompts';

/**
 * جسر الذكاء الاصطناعي الآمن لألعاب المنصّة (المليون، البالونات، إكس أو،
 * السلم والثعبان، سين جيم). يحمل المفتاح على الخادم، ولا يعمل إلا لمعلمة
 * مسجّلة دخول ولديها رصيد ألعاب (أو أدمِن). الخصم عند نجاح التوليد (أدناه).
 *
 * منذ 2026-10-12: المتصفّحُ يرسلُ بياناتِ الدرسِ فقط، والتعليماتُ وطولُ الجوابِ
 * يحدّدُهما الخادم (src/lib/game-prompts.ts)، وكلُّ طلبٍ تُسجَّلُ تكلفتُه الفعليّة
 * في game_ai_usage.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GRADEBOOK_MODEL || 'claude-sonnet-5';

/**
 * حدودُ الطلبِ يفرضُها الخادم (قرار حصة 2026-10-12) — كانَ المتصفّحُ يرسلُ
 * التعليماتِ وطولَ الجوابِ بنفسِه بلا أيِّ فحص.
 * الصفحاتُ نفسُها تقبلُ ٥ صورٍ مصغّرةٍ إلى ٩٠٠ بكسل، فالحدودُ هنا لا تمسُّ
 * الاستعمالَ الطبيعيّ، وتمنعُ ما سواه.
 */
const MAX_IMAGES = 5;
const MAX_IMAGE_B64 = 1_500_000; // ≈ ١.١ ميغا للصورة الواحدة بعد الفكّ
const MAX_TEXT = 20_000; // حروفُ نصِّ الدرسِ الملصوق
const MAX_LESSON_NAME = 120;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** سعرُ النموذجِ بالدولار لكلِّ مليون رمز — للتقريرِ فقط، يُعدَّلُ من البيئة إن تغيّر. */
const PRICE_IN = Number(process.env.GAME_PRICE_IN_PER_M || 3);
const PRICE_OUT = Number(process.env.GAME_PRICE_OUT_PER_M || 15);

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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: { message: 'المفتاح غير مُعدّ على الخادم' } },
      { status: 500 }
    );
  }

  // ── الطلب: بياناتُ الدرسِ فقط، والتعليماتُ تُبنى هنا ──
  let body: {
    game?: unknown; grade?: unknown; gender?: unknown;
    lessonName?: unknown; text?: unknown; images?: unknown; messages?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'طلب غير صالح' } }, { status: 400 });
  }

  // صفحةٌ قديمةٌ مفتوحةٌ من قبلِ التحديث ما زالتْ ترسلُ التعليماتِ بنفسِها
  if (body?.messages !== undefined && body?.game === undefined) {
    return NextResponse.json(
      { error: { message: 'تحدّثت الأداة — حدّث الصفحة (Refresh) ثم أعد المحاولة.' } },
      { status: 400 }
    );
  }

  const game = String(body?.game ?? '') as GameId;
  if (!GAME_IDS.includes(game)) {
    return NextResponse.json({ error: { message: 'لعبة غير معروفة' } }, { status: 400 });
  }
  const grade = String(body?.grade ?? '');
  if (!(GRADES as readonly string[]).includes(grade)) {
    return NextResponse.json({ error: { message: 'اختر الصف' } }, { status: 400 });
  }
  const gender = body?.gender === 'بنين' ? 'بنين' : 'بنات';
  // سطرٌ واحدٌ قصير: العنوانُ يدخلُ التعليماتِ بين علامتي تنصيص
  const lessonName = String(body?.lessonName ?? '').replace(/[\r\n"]+/g, ' ').trim().slice(0, MAX_LESSON_NAME);
  const text = String(body?.text ?? '').trim();
  if (text.length > MAX_TEXT) {
    return NextResponse.json(
      { error: { message: `نص الدرس طويل جدًا — الحد ${MAX_TEXT.toLocaleString('ar')} حرف. قسّمه على أكثر من لعبة.` } },
      { status: 413 }
    );
  }

  const rawImages = Array.isArray(body?.images) ? body.images : [];
  if (rawImages.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: { message: `الحد ${MAX_IMAGES} صور في المرة الواحدة.` } },
      { status: 413 }
    );
  }
  const images: { type: string; data: string }[] = [];
  for (const im of rawImages) {
    const type = String((im as { type?: unknown })?.type ?? '');
    const data = String((im as { data?: unknown })?.data ?? '');
    if (!IMAGE_TYPES.has(type) || !data || data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return NextResponse.json(
        { error: { message: 'إحدى الصور غير صالحة أو كبيرة جدًا — جرّب صورة أوضح بحجم أصغر.' } },
        { status: 413 }
      );
    }
    images.push({ type, data });
  }
  if (images.length === 0 && !text) {
    return NextResponse.json({ error: { message: 'ارفع صور الدرس أو الصق النص أولًا' } }, { status: 400 });
  }

  // الحجزُ اليوميُّ بعدَ الفحص: الطلبُ المرفوضُ لا يأكلُ من حدِّ اليوم
  // ── حاجز الفاتورة: حجز ذرّي يومي قبل نداء الذكاء (fail-closed) ──
  // الأدمِن مُعفى. أي خطأ في الحجز = رفضٌ آمن بلا نداء ذكاء.
  if (!isAdmin) {
    const { data: reserve, error: reserveErr } = await supabase.rpc('ai_reserve_daily', {
      p_kind: 'game',
      p_limit: GAME_DAILY,
    });
    if (reserveErr || !reserve) {
      return NextResponse.json(
        { error: { message: 'تعذّر التحقق من حدّ الاستخدام اليومي — حاول بعد قليل.' } },
        { status: 503 }
      );
    }
    if (!(reserve as { allowed?: boolean }).allowed) {
      return NextResponse.json(
        { error: { message: 'وصلت الحدّ اليومي لتوليد الألعاب. جرّب غدًا أو تواصل مع إدارة غراس.' } },
        { status: 429 }
      );
    }
  }

  const { prompt, maxTokens } = buildGamePrompt(game, { grade, gender, lessonName, text });
  const messages = [
    {
      role: 'user',
      content: [
        ...images.map((im) => ({
          type: 'image',
          source: { type: 'base64', media_type: im.type, data: im.data },
        })),
        { type: 'text', text: prompt },
      ],
    },
  ];

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

    // سجلُّ التكلفةِ الفعليّة — من عدّادِ الرموزِ الذي يعيدُه المزوّد نفسُه
    await logUsage(user.id, game, images.length, text.length, res.ok, data);

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

/**
 * سجلُّ استهلاكِ ذكاءِ الألعاب (جدول game_ai_usage) — لتعرفَ الإدارةُ تكلفةَ كلِّ
 * طلبٍ بالضبط: من طلبَه، وأيُّ لعبة، وكم صورة، وكم رمزًا دخلَ وخرج، وكم كلّف.
 * يُكتبُ بمفتاحِ الخدمة. فشلُه لا يُفشلُ التوليد — السجلُّ للمتابعةِ لا للفوترة.
 */
async function logUsage(
  userId: string,
  game: string,
  imageCount: number,
  textChars: number,
  ok: boolean,
  raw: string
) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) return;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const u = (JSON.parse(raw) as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    inputTokens = Number(u?.input_tokens ?? 0);
    outputTokens = Number(u?.output_tokens ?? 0);
  } catch {
    // ردُّ خطأٍ بلا usage — يُسجَّلُ بصفر
  }
  const costUsd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;
  try {
    const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
    await admin.from('game_ai_usage').insert({
      user_id: userId,
      game,
      image_count: imageCount,
      text_chars: textChars,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      ok,
      model: MODEL,
    });
  } catch (e) {
    console.error('[game-ai] usage log failed:', (e as Error).message);
  }
}
