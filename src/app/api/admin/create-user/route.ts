import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { usernameToEmail, toEnglishDigits } from '@/lib/supabase/client';

/**
 * إنشاء حساب مشترك من لوحة التحكم — للأدمِن وحده.
 *
 * ── لماذا ──
 * كان التسجيل ذاتيًا وحده: تسجّل المشتركة بنفسها ثم تُمنَح الصلاحيات
 * في خطوةٍ ثانية. وبين الخطوتين فجوةٌ تُنسى، فتشتكي أنها لا تصل إلى
 * الأدوات وقد أنشأت حسابها — فتصير مشكلةٌ على مشكلة.
 *
 * وهنا يُنشأ الحساب وتُمنح الصلاحيات **في طلبٍ واحد**، فلا فجوة.
 *
 * ⚠️ وكلمة المرور تُولَّد عشوائيًا، وتُعرض **مرة واحدة** في الرد،
 * ولا تُخزَّن في قاعدة ولا سجل. ويغيّرها صاحبها من «حسابي».
 *
 * ⚠️ ومفتاح الخدمة لا يُستعمل إلا بعد التأكد من أن صاحب الطلب أدمِن
 * **بجلسته هو** لا بما يرسله.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** كلمة قوية سهلة القراءة — بلا محارف متشابهة (0/O، 1/l). */
function tempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return `Gh-${out}`;
}

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

  let name = '';
  let phone = '';
  let months = 0;
  try {
    const body = await req.json();
    name = String(body?.fullName ?? '').trim();
    // ⚠️ الأرقام العربية تُوحَّد هنا أيضًا، وإلا أُنشئ الحساب بمعرّف
    // لا يصل إليه صاحبه حين يدخل بأرقام إنجليزية — أو العكس.
    phone = toEnglishDigits(String(body?.phone ?? '')).replace(/\D/g, '');
    if (phone.length > 8 && phone.startsWith('965')) phone = phone.slice(3);
    months = Number(body?.months) || 0;
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  if (!name) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
  if (phone.length < 8)
    return NextResponse.json({ error: 'رقم الجوال غير صحيح (٨ أرقام)' }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const password = tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(phone),
    password,
    email_confirm: true,
    user_metadata: { full_name: name, username: phone, phone },
  });

  if (error || !created?.user) {
    const m = (error?.message || '').toLowerCase();
    const already = m.includes('already') || m.includes('registered') || m.includes('exists');
    return NextResponse.json(
      { error: already ? 'رقم الجوال مسجّل مسبقًا' : 'تعذّر إنشاء الحساب' },
      { status: already ? 409 : 500 }
    );
  }

  // الصلاحيات في نفس الطلب — فلا فجوة بين الإنشاء والمنح
  let granted = false;
  if (months > 0) {
    // نفس الدالة التي تستعملها اللوحة — لا نظيرة لها تفترق عنها
    const { error: grantErr } = await admin.rpc('admin_grant', {
      p_user: created.user.id,
      p_kind: 'all',
      p_months: months,
    });
    granted = !grantErr;
  }

  return NextResponse.json({
    ok: true,
    id: created.user.id,
    name,
    phone,
    password,
    granted,
    // ⚠️ يُقال صراحةً حين يُنشأ الحساب بلا صلاحية، فلا يُنسى المنح
    note: months > 0 && !granted ? 'أُنشئ الحساب لكن لم تُمنح الصلاحيات — امنحها من القائمة' : null,
  });
}
