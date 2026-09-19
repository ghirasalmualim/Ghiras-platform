import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import UsageRanking from '@/components/UsageRanking';

/**
 * «الأكثر استخدامًا» — لدور admin فقط.
 * نفسُ حارسِ /admin حرفًا: الدالّةُ نفسُها تفحصُ is_admin مرّةً ثانيةً في
 * القاعدة، فالحراسةُ هنا للواجهةِ لا للبيانات (دفاعٌ في العمق).
 */
export const dynamic = 'force-dynamic';

export default async function AdminUsagePage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/usage');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/');

  return <UsageRanking />;
}
