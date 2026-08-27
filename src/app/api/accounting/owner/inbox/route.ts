/** غراس للمحاسبة — Stage 11: الصندوق القانوني الواحد — قراءة المالكة */
import { NextRequest, NextResponse } from 'next/server';
import { listInbox } from '@/lib/accounting/owner/queries';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  try {
    const items = await listInbox(gated.gate.db, companyId!, gated.gate.role);
    return NextResponse.json({ items, viewerRole: gated.gate.role });
  } catch {
    return NextResponse.json({ error: 'inbox failed' }, { status: 500 });
  }
}
