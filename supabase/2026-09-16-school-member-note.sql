-- «إدارة المدرسة»: ملاحظة/قيد جدول لكل معلمة (معزول، إضافي).
--   نص اختياري يُقرأ عند توليد الجدول الذكي كقيد (مثال: «ما تأخذ الحصة الأولى»).
--   يُضاف عمود note ويُعاد كشفه في school_members_of. لا يمسّ أي كائن آخر.
alter table public.school_members add column if not exists note text;

drop function if exists public.school_members_of(uuid);
create or replace function public.school_members_of(p_school uuid)
 returns table(id uuid, user_id uuid, name text, role text, department_id uuid, note text, created_at timestamptz)
 language sql security definer set search_path to 'public' stable as $$
  select m.id, m.user_id, coalesce(p.full_name, m.member_name) as name, m.role, m.department_id, m.note, m.created_at
  from public.school_members m
  left join public.profiles p on p.id = m.user_id
  where m.school_id = p_school and public.school_is_member(p_school)
  order by m.created_at;
$$;
grant execute on function public.school_members_of(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school member-note ready' as ok;
