-- ═══════════════════════════════════════════════════════════════
-- «إدارة المدرسة» — الشُّعب والمعلمات (معزول، إضافي).
--   • school_departments: شُعب المدرسة، لكل شعبة رئيسة (head_member_id) ومعلماتها.
--   • school_members.department_id: عضوية المعلمة في شعبة.
--   • school_add_member: يضيف حسابًا مسجّلًا للمدرسة (بالاسم/الإيميل) بدورٍ وشعبة.
-- لا يمسّ profiles إلا كمرجع FK/قراءة، ولا يمسّ admin_set_tool ولا الاشتراكات.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.school_departments (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null,
  head_member_id uuid references public.school_members(id) on delete set null,  -- رئيسة الشعبة
  sort           int  not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists school_departments_school_idx on public.school_departments(school_id);

-- عضوية المعلمة في شعبة
alter table public.school_members
  add column if not exists department_id uuid references public.school_departments(id) on delete set null;

-- RLS
alter table public.school_departments enable row level security;
drop policy if exists school_departments_select on public.school_departments;
create policy school_departments_select on public.school_departments for select using (public.school_is_member(school_id));
drop policy if exists school_departments_insert on public.school_departments;
create policy school_departments_insert on public.school_departments for insert with check (public.school_is_admin(school_id));
drop policy if exists school_departments_update on public.school_departments;
create policy school_departments_update on public.school_departments for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_departments_delete on public.school_departments;
create policy school_departments_delete on public.school_departments for delete using (public.school_is_admin(school_id));

revoke all on public.school_departments from anon;
grant select, insert, update, delete on public.school_departments to authenticated;

-- audit trigger (تُعيد استخدام school_audit_trigger القائمة)
drop trigger if exists trg_audit_dept on public.school_departments;
create trigger trg_audit_dept after insert or update or delete on public.school_departments
  for each row execute function public.school_audit_trigger('department');

-- إضافة معلمة للمدرسة: تلقى الحساب بالاسم/الإيميل (case-insensitive)، وتضيفه بدورٍ
-- وشعبة. للأدمِن أو إدارة المدرسة فقط. تُرجع 'added' | 'not_found'.
create or replace function public.school_add_member(
  p_school uuid, p_login text, p_role text default 'teacher', p_dept uuid default null
) returns text language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  if not public.school_is_admin(p_school) then raise exception 'forbidden'; end if;
  select id into v_uid from public.profiles
   where lower(username) = lower(trim(p_login))
      or (email is not null and lower(email) = lower(trim(p_login)))
   limit 1;
  if v_uid is null then return 'not_found'; end if;
  insert into public.school_members(school_id, user_id, role, department_id)
    values (p_school, v_uid, coalesce(nullif(trim(p_role), ''), 'teacher'), p_dept)
  on conflict (school_id, user_id)
    do update set role = excluded.role, department_id = excluded.department_id;
  return 'added';
end $$;
grant execute on function public.school_add_member(uuid, text, text, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school departments + members ready' as ok;
