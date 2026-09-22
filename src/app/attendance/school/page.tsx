import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import AttSchoolApp from '@/components/att-school/AttSchoolApp';

/**
 * «إدارة الحضور المدرسية» 🏫 — منتج منفصل فوق جداول «إدارة المدرسة».
 * البوابة هنا تسجيل الدخول فقط: أي مستخدمة تنشئ إدارة وتجهّزها، والتسجيل اليومي
 * لا يعمل إلا بعد التفعيل (att_until على المدرسة). القاعدة (RLS + دوال att_*) هي الحكم.
 * لا يمسّ سجل الحضور الذكي (/attendance) ولا بياناته.
 */
export const dynamic = 'force-dynamic';

export default async function AttSchoolPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/attendance/school');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.status === 'suspended') redirect('/attendance-locked');

  return (
    <AttSchoolApp
      uid={user.id}
      isAdmin={profile?.role === 'admin'}
      fullName={((profile?.full_name as string) || '').trim()}
    />
  );
}
