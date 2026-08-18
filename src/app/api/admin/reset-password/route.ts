import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * تعيين كلمة مرور مؤقتة لحساب معلمة — للأدمِن فقط.
 *
 * الدخول للمنصة برقم الجوال، ويتحوّل داخليًا إلى بريد وهمي
 * (9xxxxxxx@ghiras-users.com)، فلا بريد حقيقي تُرسل إليه رسالة استعادة.
 * وكان الحل الوحيد فتح لوحة Supabase التقنية لكل حالة نسيان.
 *
 * تغيير كلمة مرور مستخدم آخر يتطلب مفتاح الخدمة، وهو لا يُستخدم إلا هنا
 * على الخادم بعد التأكد من أن صاحب الطلب أدمِن بجلسته هو — لا بما يرسله.
 *
 * كلمة المرور تُولَّد عشوائيًا، تُعاد مرة واحدة في الرد، ولا تُخزَّن.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** كلمة مرور قوية سهلة القراءة — بلا محارف متشابهة (0/O، 1/l) */
function tempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return `Gh-${out}`;
}

export async function POST(req: NextRequest) {
  // ١) هوية صاحب الطلب من جلسته — لا من جسم الطلب
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرّح' }, { status: 403 });
  }

  // ٢) الحساب المستهدف
  let targetId = '';
  try {
    const body = await req.json();
    targetId = String(body?.userId ?? '');
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ error: 'معرّف الحساب مفقود' }, { status: 400 });
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', targetId)
    .single();
  if (!target) {
    return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
  }
  // حساب أدمِن لا يُعاد ضبطه من هنا — يُضبط من لوحة Supabase عمدًا،
  // حتى لا يصبح هذا المسار طريقًا للاستيلاء على حساب إداري.
  if (target.role === 'admin') {
    return NextResponse.json(
      { error: 'حسابات الإدارة تُضبط من لوحة Supabase' },
      { status: 400 }
    );
  }

  // ٣) التنفيذ بمفتاح الخدمة — خادمي بحت
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'إعداد الخادم ناقص' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(targetId, { password });

  if (error) {
    console.error('ADMIN_RESET_PASSWORD_FAILED', error.message);
    return NextResponse.json({ error: 'تعذّر تعيين كلمة المرور' }, { status: 500 });
  }

  return NextResponse.json({ password, name: target.full_name ?? '' });
}
