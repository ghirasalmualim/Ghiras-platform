import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { BANK_HTML } from './game-html';

/**
 * «بنك غراس» — أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص.
 * دمج رقيق بنمط الساعة/جدول الضرب: HTML مضمّن يُقدَّم عبر جلسة غراس.
 *
 * منتج مدفوع باعتماد صاحبة المنصة: اشتراك ٦ أشهر بثمانية دنانير —
 * الوصول بعمود gharas_bank_until (أو الأدمِن)، suspended ممنوعة،
 * وأي حالة غير مثبتة fail closed إلى صفحة الاشتراك.
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
    .select('role, status, gharas_bank_until')
    .eq('id', user.id)
    .single();

  const p = profile as
    | { role?: string; status?: string; gharas_bank_until?: string | null }
    | null;
  const isAdmin = p?.role === 'admin';
  const until = p?.gharas_bank_until ?? null;
  const active =
    isAdmin || (p?.status !== 'suspended' && !!until && new Date(until) > new Date());

  if (!active) {
    return NextResponse.redirect(new URL('/gharas-bank-locked', req.url));
  }

  return new NextResponse(BANK_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
