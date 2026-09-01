import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * جسر قراءة الكشوف (OCR) الآمن لسجل الحضور.
 * يحمل المفتاح على الخادم، ويعمل فقط لمعلمة مشترِكة في الحضور (أو أدمِن).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GRADEBOOK_MODEL || 'claude-sonnet-5';

// حاجز الفاتورة: سقف يومي لكل مستخدم قبل نداء الذكاء (الأدمِن يتخطّى).
const OCR_DAILY = parseInt(process.env.OCR_DAILY || '30', 10) || 30;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { message: 'يجب تسجيل الدخول' } }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, attendance_until')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.attendance_until &&
      new Date(profile.attendance_until as string) > new Date());
  if (!active) {
    return NextResponse.json({ error: { message: 'اشتراك الحضور غير سارٍ' } }, { status: 403 });
  }

  // ── حاجز الفاتورة: حجز ذرّي يومي قبل نداء الذكاء (fail-closed) ──
  if (!isAdmin) {
    const { data: reserve, error: reserveErr } = await supabase.rpc('ai_reserve_daily', {
      p_kind: 'ocr',
      p_limit: OCR_DAILY,
    });
    if (reserveErr || !reserve) {
      return NextResponse.json(
        { error: { message: 'تعذّر التحقق من حدّ الاستخدام اليومي — حاولي بعد قليل.' } },
        { status: 503 }
      );
    }
    if (!(reserve as { allowed?: boolean }).allowed) {
      return NextResponse.json(
        { error: { message: 'وصلتِ الحدّ اليومي لقراءة الكشوف. جرّبي غدًا أو تواصلي مع إدارة غراس.' } },
        { status: 429 }
      );
    }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: { message: 'المفتاح غير مُعدّ على الخادم' } }, { status: 500 });
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
  const maxTokens = Math.min(4096, Math.max(256, isFinite(reqTokens) ? reqTokens : 1000));

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
