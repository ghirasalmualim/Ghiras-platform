/** غراس للمحاسبة — Stage 11: سياق المالكة — شركاتها وأدوارها والعملات */
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOwnerContext } from '@/lib/accounting/owner/queries';
import { svc } from '../_lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  try {
    const ctx = await getOwnerContext(svc(), auth.user.id);
    return NextResponse.json({ userId: auth.user.id, ...ctx });
  } catch {
    return NextResponse.json({ error: 'context failed' }, { status: 500 });
  }
}
