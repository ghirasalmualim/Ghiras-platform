import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import MyFileApp from '@/components/head-shares/MyFileApp';

/**
 * «ملفّي» — صفحة المعلمة المُشارَكة من رئيسة الشعبة. الوصول مجاني: يكفي تسجيل
 * الدخول، والقاعدة (RLS) تضمن أنها لا ترى إلا مشاركاتها هي. من لا مشاركة لها
 * ترى رسالة ودّية بدل أي محتوى.
 */
export const dynamic = 'force-dynamic';

export default async function MyFilePage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my-file');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const firstName = ((profile?.full_name as string) || '').trim().split(/\s+/)[0] || '';

  return <MyFileApp firstName={firstName} />;
}
