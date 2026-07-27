import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import AdminPanel from '@/components/AdminPanel';

/**
 * لوحة تحكم الأدمِن — لدور admin فقط.
 * عرض كل المشتركين + تفعيل مجاني (وصول كامل / دفتر) + إيقاف/تفعيل.
 */
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/');

  return <AdminPanel />;
}
