/**
 * غراس للمحاسبة — Stage 11: لوحة وضعي — البطاقات الست + رأس الصندوق.
 * كل تحميل يشغّل جولات الاستيعاب الموقّعة (تغطية C4) ثم يحسب
 * ويسجّل إسناد اللقطات — الأرقام لا تُعرض بلا إسناد دائم.
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeDashboard } from '@/lib/accounting/owner/queries';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { db, userId, role, baseCurrency } = gated.gate;
  try {
    const result = await computeDashboard(db, companyId!, userId, role, baseCurrency);
    return NextResponse.json({
      cards: result.cards,
      inboxTop: result.inboxTop,
      coverage: result.ingestion.map((r) => ({
        adapterKey: r.adapterKey, status: r.status,
      })),
      provenanceRecorded: result.provenanceRecorded,
      viewerRole: role,
    });
  } catch {
    return NextResponse.json({ error: 'dashboard failed' }, { status: 500 });
  }
}
