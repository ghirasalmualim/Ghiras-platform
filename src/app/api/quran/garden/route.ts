import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { readGardenState } from '@/features/quran/garden/state';

/** حالة الحديقة — قراءةً فقط، بجلسة صاحبها. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  return NextResponse.json(await readGardenState(supabase, user.id));
}
