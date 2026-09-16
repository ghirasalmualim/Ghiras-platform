-- «إدارة المدرسة»: الحضور الذكي بالحصص (معزول).
--   كل معلمة تسجّل استثناءات حصتها (غياب/تأخير/استئذان) لطالبات الفصل الذي
--   تدرّسه في تلك الحصة (يُعرَف من الجدول school_timetable_entries عبر school_teaches_class).
--   استثناءات فقط (الحاضرة = لا صف). تتجمّع لاحقًا في كشف الطالبة والتقارير.
--   ★ جدول جديد بالكامل — لا يمسّ school_attendance اليومي ولا أي كائن آخر.
create table if not exists public.school_period_attendance (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  date        date not null,
  period_id   uuid not null references public.school_periods(id) on delete cascade,
  class_id    uuid not null references public.school_classes(id) on delete cascade,
  student_id  uuid not null references public.school_students(id) on delete cascade,
  status      text not null check (status in ('absent','late','permission')),
  recorded_by uuid references public.school_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, date, period_id)
);
create index if not exists school_pattend_class_date_idx on public.school_period_attendance(school_id, class_id, date);
create index if not exists school_pattend_student_idx     on public.school_period_attendance(school_id, student_id, date);

alter table public.school_period_attendance enable row level security;

-- القراءة: الإدارة + مشرفة النطاق + معلمة الفصل + صاحبة صلاحية عرض الحضور.
drop policy if exists school_pattend_select on public.school_period_attendance;
create policy school_pattend_select on public.school_period_attendance for select
  using (public.school_is_admin(school_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_teaches_class(school_id, class_id)
         or public.school_can(school_id, 'attendance', 'view', 'class', class_id));

-- الكتابة: الإدارة + معلمة الفصل + مشرفة النطاق + صاحبة صلاحية إضافة/تعديل الحضور.
drop policy if exists school_pattend_ins on public.school_period_attendance;
create policy school_pattend_ins on public.school_period_attendance for insert
  with check (public.school_is_admin(school_id)
              or public.school_teaches_class(school_id, class_id)
              or public.school_supervises_class(school_id, class_id)
              or public.school_can(school_id, 'attendance', 'add', 'class', class_id));
drop policy if exists school_pattend_upd on public.school_period_attendance;
create policy school_pattend_upd on public.school_period_attendance for update
  using (public.school_is_admin(school_id)
         or public.school_teaches_class(school_id, class_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_can(school_id, 'attendance', 'edit', 'class', class_id))
  with check (public.school_is_admin(school_id)
              or public.school_teaches_class(school_id, class_id)
              or public.school_supervises_class(school_id, class_id)
              or public.school_can(school_id, 'attendance', 'edit', 'class', class_id));
drop policy if exists school_pattend_del on public.school_period_attendance;
create policy school_pattend_del on public.school_period_attendance for delete
  using (public.school_is_admin(school_id)
         or public.school_teaches_class(school_id, class_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_can(school_id, 'attendance', 'edit', 'class', class_id));

revoke all on public.school_period_attendance from anon;
grant select, insert, update, delete on public.school_period_attendance to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_period_attendance ready' as ok;
