import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حذف حساب مشترك نهائيًا — للأدمِن وحده.
 *
 * ⚠️ **حذفٌ لا رجعة فيه.** كل جداول المنصة مرتبطة بالحساب بحذفٍ
 * متسلسل، فيمضي معه: الفصول، وسجلّ الحضور، ودفتر الدرجات، وتقدّم
 * القرآن، والصلاحيات. ولا نسخة احتياطية تُستعاد منها.
 *
 * ولهذا يُشترط أن يُرسل الطالبُ رقمَ الحساب مكتوبًا كما هو، فيُقابَل
 * بالمخزَّن قبل التنفيذ. فلا يكفي ضغطُ زرٍّ بالخطأ.
 *
 * ⚠️ ولا يحذف الأدمِن نفسه: خطأٌ واحد يُغلق اللوحة على الجميع.
 *
 * ⚠️ ومفتاح الخدمة لا يُستعمل إلا هنا وبعد التأكد من أن صاحب الطلب
 * أدمِن **بجلسته هو** لا بما يرسله.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!me || me.role !== 'admin')
    return NextResponse.json({ error: 'غير مصرّح' }, { status: 403 });

  let targetId = '';
  let typed = '';
  try {
    const body = await req.json();
    targetId = String(body?.userId ?? '');
    typed = String(body?.confirmPhone ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }
  if (!targetId) return NextResponse.json({ error: 'معرّف الحساب مفقود' }, { status: 400 });

  if (targetId === user.id)
    return NextResponse.json({ error: 'لا يمكن حذف حسابك أنت' }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // الرقم المخزَّن — نقابله بما كُتب قبل أن نحذف شيئًا
  const { data: target, error: readErr } = await admin.auth.admin.getUserById(targetId);
  if (readErr || !target?.user)
    return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

  const stored = (target.user.email || '').split('@')[0];
  if (!typed || typed !== stored)
    return NextResponse.json(
      { error: 'الرقم المكتوب لا يطابق رقم الحساب' },
      { status: 400 }
    );

  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) return NextResponse.json({ error: 'تعذّر الحذف' }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: stored });
}
