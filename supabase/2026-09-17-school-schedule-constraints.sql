-- «إدارة المدرسة»: قيود جدولة منظّمة للقسم والمعلمة (معزول، إضافي).
--   على القسم (school_departments):
--     • block        : حصص المعلمة لنفس الصف تكون متلاصقة (بلوك).
--     • lab_weekly   : عدد حصص المختبر أسبوعيًا لكل توزيع في مواد القسم.
--     • lab_capacity : عدد المختبرات المتاحة (سقف الحصص المتزامنة).
--   على المعلمة (school_members):
--     • block_off    : استثناء — تعطيل البلوك لهذه المعلمة عند الضرورة.
--   تُقرأ عند توليد الجدول الذكي. لا تمسّ أي كائن آخر.
alter table public.school_departments add column if not exists block boolean not null default false;
alter table public.school_departments add column if not exists lab_weekly int not null default 0;
alter table public.school_departments add column if not exists lab_capacity int not null default 0;
alter table public.school_members add column if not exists block_off boolean not null default false;

drop function if exists public.school_members_of(uuid);
create or replace function public.school_members_of(p_school uuid)
 returns table(id uuid, user_id uuid, name text, role text, department_id uuid, note text, block_off boolean, created_at timestamptz)
 language sql security definer set search_path to 'public' stable as $$
  select m.id, m.user_id, coalesce(p.full_name, m.member_name) as name, m.role, m.department_id, m.note, m.block_off, m.created_at
  from public.school_members m
  left join public.profiles p on p.id = m.user_id
  where m.school_id = p_school and public.school_is_member(p_school)
  order by m.created_at;
$$;
grant execute on function public.school_members_of(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school schedule-constraints ready' as ok;
