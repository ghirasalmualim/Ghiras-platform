import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import SchoolApp from '@/components/school/SchoolApp';

/**
 * «إدارة المدرسة» — البوابة. الوصول لمن:
 *   (أ) عضو في مدرسة (كادر أضافته المسؤولة) — مجانًا، ويرى ما تسمح به صلاحياته؛ أو
 *   (ب) يملك اشتراك school_until سارٍ (أو admin) — يستطيع إنشاء مدرسة وإدارتها.
 * غير ذلك → صفحة القفل. القاعدة (RLS) هي الحكم الفعلي على كل عملية.
 */
export const dynamic = 'force-dynamic';

export default async function SchoolPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/school');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name, school_until')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const entitled =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.school_until &&
      new Date(profile.school_until as string) > new Date());

  // أول عضوية للمستخدمة (النسخة الحالية: مدرسة واحدة لكل حساب)
  const { data: membership } = await supabase
    .from('school_members')
    .select('school_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership && !entitled) redirect('/school-locked');

  const firstName = ((profile?.full_name as string) || '').trim().split(/\s+/)[0] || '';

  return (
    <SchoolApp
      firstName={firstName}
      schoolId={(membership?.school_id as string) || null}
      memberRole={(membership?.role as string) || null}
      canCreate={Boolean(entitled)}
      isAdmin={Boolean(isAdmin)}
    />
  );
}
