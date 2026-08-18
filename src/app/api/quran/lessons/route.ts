import { NextRequest, NextResponse } from 'next/server';
import { getLessons } from '@/features/quran/data/curriculum';

/**
 * دروس صف في فصل — للقراءة فقط.
 *
 * مفتوح بلا تسجيل دخول لأن القسم مجاني والدروس تُقرأ من سياسة RLS
 * التي تسمح بقراءة الظاهر منها للجميع. لا يكتب هذا المسار شيئًا.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const grade = req.nextUrl.searchParams.get('grade');
  const term = Number(req.nextUrl.searchParams.get('term'));

  if (!grade) return NextResponse.json([], { status: 400 });

  const lessons = await getLessons(grade, term === 1 || term === 2 ? term : undefined);
  return NextResponse.json(lessons);
}
