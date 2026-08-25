import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { CLOCK_HTML } from './game-html';

/**
 * «الساعة التفاعلية» — منتج مستقل بسعره الخاص (لا يشمله الاشتراك المشترك).
 * الوصول يتطلب صلاحية سارية في العمود clock_until (أو الأدمِن).
 * غير المشتركات تُوجَّه لصفحة الشراء /clock-locked.
 *
 * ⚠️ sub_end لا يُقرأ هنا عمدًا — Model B: كل منتج يُسأل عن عموده وحده،
 * فمشترِكة انتهى اشتراكها العام وساعتها سارية تدخل الساعة.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/clock', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, clock_until')
    .eq('id', user.id)
    .single();

  const p = profile as
    | { role?: string; status?: string; clock_until?: string | null }
    | null;
  const isAdmin = p?.role === 'admin';
  const until = p?.clock_until ?? null;
  const active =
    isAdmin || (p?.status !== 'suspended' && !!until && new Date(until) > new Date());

  if (!active) {
    return NextResponse.redirect(new URL('/clock-locked', req.url));
  }

  return new NextResponse(CLOCK_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
