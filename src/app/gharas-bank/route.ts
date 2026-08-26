import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { BANK_HTML } from './game-html';

/**
 * «بنك غراس» — أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص.
 * دمج رقيق بنمط الساعة/جدول الضرب: HTML مضمّن يُقدَّم عبر جلسة غراس.
 *
 * ⚠️ نموذج الوصول في هذه المرحلة قرارٌ صريح من صاحبة المنصة:
 * كل مسجلة نشطة تدخل — لا عمود استحقاق ولا تسعير قبل قرار البيع.
 * suspended ممنوعة، والأدمِن مسموح، وأي حالة غير مثبتة fail closed.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/gharas-bank', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  const p = profile as { role?: string; status?: string } | null;
  const isAdmin = p?.role === 'admin';
  const active = isAdmin || (!!p && p.status === 'active');

  if (!active) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return new NextResponse(BANK_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
