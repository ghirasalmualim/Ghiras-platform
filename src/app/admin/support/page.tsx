import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import AdminSupportInbox from '@/components/AdminSupportInbox';

/** 📥 رسائل الدعم — حارس الأدمِن نفسه المستخدم في /admin. */
export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/support');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile as { role?: string }).role !== 'admin') redirect('/');

  return <AdminSupportInbox />;
}
