import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import SchoolApp from '@/components/school/SchoolApp';

/**
 * «إدارة المدرسة» — نظام معزول تمامًا. البوابة **لكل مدرسة** (اشتراك على جدول
 * schools)، لا تمسّ نظام الاشتراكات القائم. الوصول:
 *   - admin (حصة): إدارة كل المدارس + منح الاشتراكات.
 *   - عضو مدرسة اشتراكها سارٍ: يرى مدرسته حسب دوره.
 * غير ذلك → صفحة القفل. القاعدة (RLS) هي الحكم على كل عملية.
 */
export const dynamic = 'force-dynamic';

export default async function SchoolPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/school');

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    // عضو؟ وهل لأي مدرسةٍ عضوٌ فيها اشتراكٌ سارٍ؟
    const { data: rows } = await supabase
      .from('school_members')
      .select('school:school_id(subscription_until)')
      .eq('user_id', user.id);
    const hasActive = (rows || []).some((m) => {
      const s = m.school as unknown as { subscription_until: string | null } | null;
      return s?.subscription_until && new Date(s.subscription_until) > new Date();
    });
    if (!hasActive) redirect('/school-locked');
  }

  const firstName = ((profile?.full_name as string) || '').trim().split(/\s+/)[0] || '';
  return <SchoolApp firstName={firstName} isAdmin={Boolean(isAdmin)} uid={user.id} />;
}
