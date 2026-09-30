import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { PRODUCTS, fmtKwd } from '@/lib/pricing';
import { checkCoupon, discountedPrice, startLabel } from '@/lib/coupons';

/**
 * التحقّق من كود الخصم قبل الدفع — للعرضِ وحدَه (السعرُ يُعادُ حسابُه في مسارِ الدفع).
 * يحتاجُ جلسةً مسجّلةً حتى لا تُجرَّبَ الأكوادُ من الخارج.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });

  let body: { code?: string; productId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }

  const product = body.productId ? PRODUCTS[body.productId] : undefined;
  if (!product) return NextResponse.json({ error: 'منتج غير معروف' }, { status: 400 });

  const check = checkCoupon(body.code);
  if (!check.ok) {
    const error =
      check.reason === 'early'
        ? `هذا الكود يبدأ ${startLabel(check.coupon)} — جرّبيه في حينه.`
        : check.reason === 'expired'
          ? 'انتهت مدّة هذا الكود.'
          : 'الكود غير صحيح أو انتهت مدّته.';
    return NextResponse.json({ ok: false, error });
  }
  const coupon = check.coupon;

  const price = discountedPrice(product.priceKwd, coupon.percent);
  return NextResponse.json({
    ok: true,
    code: coupon.code,
    percent: coupon.percent,
    price,
    priceLabel: fmtKwd(price),
    wasLabel: fmtKwd(product.priceKwd),
  });
}
