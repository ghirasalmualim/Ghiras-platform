-- «إدارة المدرسة»: السماح بإضافة المعلمات بالاسم فقط (بلا حساب). معزول، إضافي.
--   • user_id صار اختياريًا (عضوٌ بالاسم فقط = بيانات للجدول، لا يسجّل دخول).
--   • member_name يحمل اسم العضو المُدخَل يدويًا.
--   • school_members_of يعيد اسم الحساب إن وُجد، وإلا member_name (LEFT JOIN).
-- الربط بحساب يبقى ممكنًا لاحقًا (school_add_member) لمن تريد الدخول بنفسها.
alter table public.school_members alter column user_id drop not null;
alter table public.school_members add column if not exists member_name text;

create or replace function public.school_members_of(p_school uuid)
 returns table(id uuid, user_id uuid, name text, role text, department_id uuid, created_at timestamptz)
 language sql security definer set search_path to 'public' stable as $$
  select m.id, m.user_id, coalesce(p.full_name, m.member_name) as name, m.role, m.department_id, m.created_at
  from public.school_members m
  left join public.profiles p on p.id = m.user_id
  where m.school_id = p_school and public.school_is_member(p_school)
  order by m.created_at;
$$;
grant execute on function public.school_members_of(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school members by-name ready' as ok;
