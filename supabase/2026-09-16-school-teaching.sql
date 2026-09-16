-- «إدارة المدرسة»: المواد + التوزيع (معلمة ← مادة ← فصل ← نصاب أسبوعي). معزول، إضافي.
create table if not exists public.school_subjects (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  name          text not null,
  department_id uuid references public.school_departments(id) on delete set null,  -- شعبة المادة (اختياري)
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists school_subjects_school_idx on public.school_subjects(school_id);

-- توزيع: معلمة (member) تدرّس مادة لفصل بعدد حصص أسبوعية.
create table if not exists public.school_teaching (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  member_id    uuid not null references public.school_members(id) on delete cascade,
  subject_id   uuid not null references public.school_subjects(id) on delete cascade,
  class_id     uuid not null references public.school_classes(id) on delete cascade,
  weekly_hours int  not null default 1,
  created_at   timestamptz not null default now(),
  unique (school_id, member_id, subject_id, class_id)
);
create index if not exists school_teaching_school_idx on public.school_teaching(school_id);
create index if not exists school_teaching_member_idx on public.school_teaching(member_id);

alter table public.school_subjects enable row level security;
alter table public.school_teaching enable row level security;

-- المواد: الأعضاء يقرؤون؛ إدارة المدرسة تدير.
drop policy if exists school_subjects_select on public.school_subjects;
create policy school_subjects_select on public.school_subjects for select using (public.school_is_member(school_id));
drop policy if exists school_subjects_insert on public.school_subjects;
create policy school_subjects_insert on public.school_subjects for insert with check (public.school_is_admin(school_id));
drop policy if exists school_subjects_update on public.school_subjects;
create policy school_subjects_update on public.school_subjects for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_subjects_delete on public.school_subjects;
create policy school_subjects_delete on public.school_subjects for delete using (public.school_is_admin(school_id));

-- التوزيع: الأعضاء يقرؤون؛ إدارة المدرسة تدير.
drop policy if exists school_teaching_select on public.school_teaching;
create policy school_teaching_select on public.school_teaching for select using (public.school_is_member(school_id));
drop policy if exists school_teaching_insert on public.school_teaching;
create policy school_teaching_insert on public.school_teaching for insert with check (public.school_is_admin(school_id));
drop policy if exists school_teaching_update on public.school_teaching;
create policy school_teaching_update on public.school_teaching for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_teaching_delete on public.school_teaching;
create policy school_teaching_delete on public.school_teaching for delete using (public.school_is_admin(school_id));

revoke all on public.school_subjects, public.school_teaching from anon;
grant select, insert, update, delete on public.school_subjects, public.school_teaching to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school subjects + teaching ready' as ok;
