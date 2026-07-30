import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * خصم رصيد لعبة واحدة عند تشغيل لعبة نهائية.
 * يُستدعى من أداة «من سيربح المليون» لحظة تثبيت اللعبة واللعب بها.
 * الأدمِن غير محدود (بلا خصم). المعاينة التجريبية لا تستدعي هذا أبداً.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('consume_game_credit');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const remaining = data as number;
  if (remaining === -1) {
    return NextResponse.json({ ok: false, error: 'no_credit', remaining: 0 }, { status: 402 });
  }

  return NextResponse.json({
    ok: true,
    remaining,
    unlimited: remaining === 999999,
  });
}
