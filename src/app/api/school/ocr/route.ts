import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * OCR معزول لـ«إدارة المدرسة»: يقرأ صورة/PDF قائمة أسماء ويعيد نص الذكاء.
 * جسرٌ رفيع إلى Anthropic (المفتاح على الخادم). البوابة: عضو مدرسة أو admin —
 * مستقلٌّ عن اشتراك الحضور. سقفٌ يوميّ عبر ai_reserve_daily (kind=school_ocr).
 * لا يمسّ أي أداة أخرى.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GRADEBOOK_MODEL || 'claude-sonnet-5';
const OCR_DAILY = parseInt(process.env.OCR_DAILY || '30', 10) || 30;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: 'يجب تسجيل الدخول' } }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  // عضوٌ في أي مدرسة؟ (name-only members لهم user_id فارغ فلا يُحسبون — وهذا صحيح)
  let member = false;
  if (!isAdmin) {
    const { count } = await supabase.from('school_members').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    member = (count || 0) > 0;
  }
  if (!isAdmin && !member) return NextResponse.json({ error: { message: 'غير مصرّح' } }, { status: 403 });

  // حاجز الفاتورة اليومي (الأدمِن يتخطّى)
  if (!isAdmin) {
    const { data: reserve, error: rErr } = await supabase.rpc('ai_reserve_daily', { p_kind: 'school_ocr', p_limit: OCR_DAILY });
    if (rErr || !reserve) return NextResponse.json({ error: { message: 'تعذّر التحقق من حدّ الاستخدام — حاولي بعد قليل.' } }, { status: 503 });
    if (!(reserve as { allowed?: boolean }).allowed) return NextResponse.json({ error: { message: 'وصلتِ الحدّ اليومي. جرّبي غدًا.' } }, { status: 429 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: { message: 'المفتاح غير مُعدّ على الخادم' } }, { status: 500 });

  let body: { messages?: unknown; max_tokens?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'طلب غير صالح' } }, { status: 400 });
  }
  if (!Array.isArray(body?.messages)) return NextResponse.json({ error: { message: 'messages مفقودة' } }, { status: 400 });
  const reqTokens = parseInt(String(body?.max_tokens), 10);
  const maxTokens = Math.min(16000, Math.max(256, isFinite(reqTokens) ? reqTokens : 1500));

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: body.messages }),
    });
    const data = await res.text();
    return new NextResponse(data, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return NextResponse.json({ error: { message: 'تعذّر الاتصال بخدمة الذكاء' } }, { status: 502 });
  }
}
