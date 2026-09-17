import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * فحص إعداد MyFatoorah — للأدمِن فقط. لا يكشف التوكن (يعرض طوله فقط) ولا ينشئ دفعة حقيقية.
 * يستدعي SendPayment بمبلغ رمزي لرؤية رد البوابة الفعلي وتشخيص «token not valid».
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'login required' }, { status: 401 });
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'admin only' }, { status: 403 });

  const rawKey = process.env.MYFATOORAH_API_KEY || '';
  const key = rawKey.trim();
  const base = (process.env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com').trim();

  const out: Record<string, unknown> = {
    keyPresent: !!key,
    keyLength: key.length,
    keyHadWhitespace: rawKey.length !== key.length,
    baseUrl: base,
    serviceRolePresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!key) return NextResponse.json({ ...out, note: 'MYFATOORAH_API_KEY فارغ على الخادم' });

  try {
    const r = await fetch(`${base}/v2/SendPayment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ InvoiceValue: 1, CustomerName: 'debug', DisplayCurrencyIso: 'KWD', CallBackUrl: 'https://www.ghiras-edu.com/x', Language: 'AR' }),
    });
    const text = await r.text();
    out.mfHttpStatus = r.status;
    out.mfResponse = text.slice(0, 500);
  } catch (e) {
    out.fetchError = (e as Error).message;
  }
  return NextResponse.json(out);
}
