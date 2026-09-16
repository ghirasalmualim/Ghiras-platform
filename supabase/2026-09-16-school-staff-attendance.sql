-- «إدارة المدرسة»: دوام الهيئة التعليمية (معزول، إضافي). بيانات إدارية خاصة:
-- الوصول محصورٌ بإدارة المدرسة فقط (school_is_admin) — لا يراها بقية الأعضاء.
-- (لاحقًا: تُضاف سياسة تتيح للمعلمة قراءة سجلها هي فقط عند ربط الحسابات.)
-- الحالات المفصّلة: حاضرة/مرضي/عرضي/تأخير/استئذان بداية-نهاية/تخفيف بداية-نهاية.
create table if not exists public.school_staff_attendance (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  member_id  uuid not null references public.school_members(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('present','sick','casual','late','permit_start','permit_end','reduction_start','reduction_end')),
  at_time    text,   -- وقت الوصول/الاستئذان 'HH:MM'
  note       text,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);
create index if not exists school_staff_att_idx on public.school_staff_attendance(school_id, date);
create index if not exists school_staff_att_member_idx on public.school_staff_attendance(member_id);

alter table public.school_staff_attendance enable row level security;
-- خصوصية: إدارة المدرسة فقط (admin/principal/owner/platform-admin) تقرأ وتكتب.
drop policy if exists school_staff_att_select on public.school_staff_attendance;
create policy school_staff_att_select on public.school_staff_attendance for select using (public.school_is_admin(school_id));
drop policy if exists school_staff_att_insert on public.school_staff_attendance;
create policy school_staff_att_insert on public.school_staff_attendance for insert with check (public.school_is_admin(school_id));
drop policy if exists school_staff_att_update on public.school_staff_attendance;
create policy school_staff_att_update on public.school_staff_attendance for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_staff_att_delete on public.school_staff_attendance;
create policy school_staff_att_delete on public.school_staff_attendance for delete using (public.school_is_admin(school_id));

revoke all on public.school_staff_attendance from anon;
grant select, insert, update, delete on public.school_staff_attendance to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_staff_attendance ready' as ok;
