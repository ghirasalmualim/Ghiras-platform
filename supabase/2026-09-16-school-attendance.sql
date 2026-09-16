-- «إدارة المدرسة»: حضور المتعلمات (معزول، إضافي). الافتراضي «حاضرة»؛ تُخزَّن
-- الاستثناءات فقط (غياب/تأخير/استئذان) — صفٌّ لكل متعلمة في اليوم. صلاحية بالنطاق.
create table if not exists public.school_attendance (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('present','absent','late','excused')),
  arrived_at text,  -- وقت الوصول عند التأخير 'HH:MM'
  created_at timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists school_att_class_date_idx on public.school_attendance(school_id, class_id, date);
create index if not exists school_att_student_idx on public.school_attendance(student_id);

alter table public.school_attendance enable row level security;
drop policy if exists school_att_select on public.school_attendance;
create policy school_att_select on public.school_attendance
  for select using (public.school_is_member(school_id));
drop policy if exists school_att_insert on public.school_attendance;
create policy school_att_insert on public.school_attendance
  for insert with check (public.school_can(school_id, 'attendance', 'add', 'class', class_id));
drop policy if exists school_att_update on public.school_attendance;
create policy school_att_update on public.school_attendance
  for update using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id))
           with check (public.school_can(school_id, 'attendance', 'edit', 'class', class_id));
drop policy if exists school_att_delete on public.school_attendance;
create policy school_att_delete on public.school_attendance
  for delete using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id));

revoke all on public.school_attendance from anon;
grant select, insert, update, delete on public.school_attendance to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_attendance ready' as ok;
