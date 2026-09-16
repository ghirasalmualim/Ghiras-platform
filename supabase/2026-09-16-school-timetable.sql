-- «إدارة المدرسة»: شبكة الجدول (مدخلات: يوم × حصة × فصل ← معلمة + مادة). معزول.
-- منع التعارض مبنيّ في القاعدة عبر قيدَي unique:
--   • فصل واحد لا يأخذ حصتين في نفس (اليوم، الحصة).
--   • معلمة واحدة لا تكون في فصلين في نفس (اليوم، الحصة).
alter table public.schools add column if not exists timetable_status text not null default 'draft';

create table if not exists public.school_timetable_entries (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  day        smallint not null check (day between 0 and 6),  -- 0=الأحد … 6=السبت
  period_id  uuid not null references public.school_periods(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  member_id  uuid not null references public.school_members(id) on delete cascade,
  subject_id uuid not null references public.school_subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint tt_class_slot  unique (school_id, class_id, day, period_id),
  constraint tt_member_slot unique (school_id, member_id, day, period_id)
);
create index if not exists school_tt_school_idx on public.school_timetable_entries(school_id);
create index if not exists school_tt_member_idx on public.school_timetable_entries(member_id);

alter table public.school_timetable_entries enable row level security;
drop policy if exists school_tt_select on public.school_timetable_entries;
create policy school_tt_select on public.school_timetable_entries for select using (public.school_is_member(school_id));
drop policy if exists school_tt_insert on public.school_timetable_entries;
create policy school_tt_insert on public.school_timetable_entries for insert with check (public.school_is_admin(school_id));
drop policy if exists school_tt_update on public.school_timetable_entries;
create policy school_tt_update on public.school_timetable_entries for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_tt_delete on public.school_timetable_entries;
create policy school_tt_delete on public.school_timetable_entries for delete using (public.school_is_admin(school_id));

revoke all on public.school_timetable_entries from anon;
grant select, insert, update, delete on public.school_timetable_entries to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_timetable ready' as ok;
