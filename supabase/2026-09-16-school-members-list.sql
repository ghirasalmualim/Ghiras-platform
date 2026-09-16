-- «إدارة المدرسة»: عرض أعضاء المدرسة بأسمائهم (معزول، دالة واحدة).
-- الأعضاء حساباتٌ في profiles؛ وسياسة profiles تمنع غير الأدمِن من قراءة أسماء
-- الآخرين. هذه الدالة (SECURITY DEFINER، محكومة school_is_member) تُرجع أعضاء
-- المدرسة بأسمائهم لكل عضوٍ في المدرسة — دون كشف أي profile خارجها.
create or replace function public.school_members_of(p_school uuid)
 returns table(id uuid, user_id uuid, name text, role text, department_id uuid, created_at timestamptz)
 language sql security definer set search_path to 'public' stable as $$
  select m.id, m.user_id, p.full_name, m.role, m.department_id, m.created_at
  from public.school_members m
  join public.profiles p on p.id = m.user_id
  where m.school_id = p_school and public.school_is_member(p_school)
  order by m.created_at;
$$;
grant execute on function public.school_members_of(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_members_of ready' as ok;
