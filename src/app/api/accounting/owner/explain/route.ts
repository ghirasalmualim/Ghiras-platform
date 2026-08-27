/**
 * غراس للمحاسبة — Stage 11: اشرح أي رقم (REP-006/007) — شجرة كاملة
 * الإسناد بتسميات المالكة؛ التتبع البياني كامل والمصطلح المهني غائب
 * بنيويًا (يُترجم في المصدر لا يُخفى في العرض).
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeExplain } from '@/lib/accounting/owner/queries';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

const CARDS = ['CASH_TODAY', 'PROFIT_MONTH', 'MONEY_IN_TRANSIT', 'RUNWAY', 'OBLIGATIONS', 'ATTENTION'];

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const card = req.nextUrl.searchParams.get('card') ?? '';
  if (!CARDS.includes(card)) {
    return NextResponse.json({ error: 'unknown card' }, { status: 400 });
  }
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { db, userId, role, baseCurrency } = gated.gate;
  try {
    const tree = await computeExplain(db, companyId!, userId, role, baseCurrency, card);
    return NextResponse.json({ card, tree });
  } catch {
    return NextResponse.json({ error: 'explain failed' }, { status: 500 });
  }
}
