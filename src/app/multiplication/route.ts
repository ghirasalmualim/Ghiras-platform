import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { MULT_HTML } from './game-html';

/**
 * «جدول الضرب التفاعلي» — منتج مستقل بسعره الخاص (لا يشمله الاشتراك المشترك).
 * الوصول يتطلب صلاحية سارية في العمود multiplication_until (أو الأدمِن).
 * الشراء يفعّل النسخة الكاملة (كل الأوضاع) = «الكورس الكامل».
 * غير المشتركات تُوجَّه لصفحة الشراء /multiplication-locked.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/multiplication', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, multiplication_until')
    .eq('id', user.id)
    .single();

  const p = profile as
    | { role?: string; status?: string; multiplication_until?: string | null }
    | null;
  const isAdmin = p?.role === 'admin';
  const until = p?.multiplication_until ?? null;
  const active =
    isAdmin || (p?.status !== 'suspended' && !!until && new Date(until) > new Date());

  if (!active) {
    return NextResponse.redirect(new URL('/multiplication-locked', req.url));
  }

  return new NextResponse(MULT_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
