import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import HeadSharesApp from '@/components/head-shares/HeadSharesApp';

/**
 * لوحة «مشاركة الملفات» لرئيسة الشعبة. قدرة المشاركة تأتي مع اشتراك «سجلات رئيس
 * الشعبة»: حارسٌ يطابق حارس الأداة (admin أو head_records_until سارٍ وغير موقوفة)،
 * وإلا صفحة القفل القائمة. الإضافة نفسها تُفرض ثانيةً في الدالة head_share_add.
 */
export const dynamic = 'force-dynamic';

export default async function HeadSharesPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/head-shares');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name, head_records_until')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.head_records_until &&
      new Date(profile.head_records_until as string) > new Date());

  // ليست رئيسة شعبة مشترِكة: إن كانت معلمةً شُورِكت (لها صف كـteacher) نوجّهها
  // لصفحتها «ملفّي» بدل قفلٍ محيّر — فقد تصل هنا من تبويب «مشاركة الملفات».
  if (!active) {
    const { count } = await supabase
      .from('head_shares')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', user.id);
    if ((count || 0) > 0) redirect('/my-file');
    redirect('/head-records-locked');
  }

  const firstName = ((profile?.full_name as string) || '').trim().split(/\s+/)[0] || '';
  return <HeadSharesApp firstName={firstName} />;
}
