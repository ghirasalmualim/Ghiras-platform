// نبضةٌ خفيفةٌ لصفحة /check — تثبت أن الجهاز يصل لخادم المنصّة فعلًا،
// وترويسة التاريخ فيها تكشف انحراف ساعة الجهاز (سببٌ شائع لرفض الشهادة).
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET() {
  return new NextResponse(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
