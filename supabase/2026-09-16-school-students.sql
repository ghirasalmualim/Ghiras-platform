-- «إدارة المدرسة»: المتعلمات (معزول، إضافي). كل متعلمة مربوطة بفصل.
-- الصلاحية بالنطاق: الكتابة تتطلب school_can('students', action, 'class', class_id)
-- (الأدمِن/إدارة المدرسة يمرّون؛ شؤون طلبة بنطاق مرحلة/صف/فصل يُغطّى تلقائيًا).
create table if not exists public.school_students (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  name       text not null,
  sid_no     text,       -- رقم/معرف داخلي (اختياري)
  note       text,       -- ملاحظات إدارية
  archived   boolean not null default false,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_students_class_idx on public.school_students(school_id, class_id);

alter table public.school_students enable row level security;

drop policy if exists school_students_select on public.school_students;
create policy school_students_select on public.school_students
  for select using (public.school_is_member(school_id));
drop policy if exists school_students_insert on public.school_students;
create policy school_students_insert on public.school_students
  for insert with check (public.school_can(school_id, 'students', 'add', 'class', class_id));
drop policy if exists school_students_update on public.school_students;
create policy school_students_update on public.school_students
  for update using (public.school_can(school_id, 'students', 'edit', 'class', class_id))
           with check (public.school_can(school_id, 'students', 'edit', 'class', class_id));
drop policy if exists school_students_delete on public.school_students;
create policy school_students_delete on public.school_students
  for delete using (public.school_can(school_id, 'students', 'delete', 'class', class_id));

revoke all on public.school_students from anon;
grant select, insert, update, delete on public.school_students to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_students ready' as ok;
