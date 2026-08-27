/**
 * غراس للمحاسبة — Stage 11: فلوسي — الطبقة النقدية القانونية الواحدة
 * (C9): حركة GL على الحسابات المعيَّنة فقط — الاستلام الواحد لا يُعدّ
 * مرتين، ودفعة المزوّد غير الواصلة للبنك مكانها «في الطريق» لا «دخل».
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeMoney } from '@/lib/accounting/owner/queries';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  try {
    const result = await computeMoney(gated.gate.db, companyId!, gated.gate.baseCurrency, month);
    return NextResponse.json({ month, ...result });
  } catch {
    return NextResponse.json({ error: 'money failed' }, { status: 500 });
  }
}
