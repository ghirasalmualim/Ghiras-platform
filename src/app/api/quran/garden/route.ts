import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { readGardenState } from '@/features/quran/garden/state';
import { checkPolicySafe, RATE_MESSAGES } from '@/features/quran/engine/rate-policies';

/** حالة الحديقة — قراءةً فقط، بجلسة صاحبها. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });
  // حدّ الاستدعاء — سياسة READ المركزية (fail-open عند عطل العدّاد نفسه)
  {
    const rl = checkPolicySafe('READ', user.id);
    if (!rl.ok)
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: RATE_MESSAGES.shortWait, retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
  }


  return NextResponse.json(await readGardenState(supabase, user.id));
}
