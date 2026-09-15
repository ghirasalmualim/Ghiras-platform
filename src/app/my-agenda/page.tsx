import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import AgendaApp, { type AgendaData } from '@/components/agenda/AgendaApp';

/**
 * «أجندتي» — بوابة الأداة. تسجيل دخول + اشتراك agenda_until سارٍ (أو أدمِن)،
 * وإلا صفحة القفل. الحالة تُحمَّل خادميًّا وتُمرَّر للتطبيق، ثم يتزامن عبر /api/my-agenda.
 */
export const dynamic = 'force-dynamic';

const EMPTY: AgendaData = { _v: 1, tasks: [], events: [], weekly: {}, notes: {}, achievements: [], harvest: {} };

export default async function MyAgendaPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my-agenda');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name, agenda_until')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const active =
    isAdmin ||
    (profile &&
      profile.status !== 'suspended' &&
      profile.agenda_until &&
      new Date(profile.agenda_until as string) > new Date());
  if (!active) redirect('/my-agenda-locked');

  let initial: AgendaData = EMPTY;
  const { data: row } = await supabase.from('my_agenda_state').select('data').eq('user_id', user.id).maybeSingle();
  if (row?.data && typeof row.data === 'object') initial = { ...EMPTY, ...(row.data as AgendaData) };

  const firstName = ((profile?.full_name as string) || '').trim().split(/\s+/)[0] || '';

  return <AgendaApp initial={initial} firstName={firstName} />;
}
