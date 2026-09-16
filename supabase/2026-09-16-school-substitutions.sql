-- «إدارة المدرسة»: الاحتياط (تغطية حصص المعلمات الغائبات). معزول، إضافي.
-- صفٌّ لكل (تاريخ + حصة + فصل) يحتاج تغطية؛ sub_member_id = البديلة المعتمدة.
-- إدارة الاحتياط للإدارة فقط (يكشف هوية الغائبة)؛ السبب لا يُخزَّن هنا إطلاقًا.
create table if not exists public.school_substitutions (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  date             date not null,
  period_id        uuid not null references public.school_periods(id) on delete cascade,
  class_id         uuid not null references public.school_classes(id) on delete cascade,
  subject_id       uuid references public.school_subjects(id) on delete set null,
  absent_member_id uuid references public.school_members(id) on delete set null,
  sub_member_id    uuid references public.school_members(id) on delete set null,  -- البديلة المعتمدة
  created_at       timestamptz not null default now(),
  unique (school_id, date, period_id, class_id)
);
create index if not exists school_sub_date_idx on public.school_substitutions(school_id, date);
create index if not exists school_sub_member_idx on public.school_substitutions(sub_member_id);

alter table public.school_substitutions enable row level security;
drop policy if exists school_sub_select on public.school_substitutions;
create policy school_sub_select on public.school_substitutions for select using (public.school_is_admin(school_id));
drop policy if exists school_sub_insert on public.school_substitutions;
create policy school_sub_insert on public.school_substitutions for insert with check (public.school_is_admin(school_id));
drop policy if exists school_sub_update on public.school_substitutions;
create policy school_sub_update on public.school_substitutions for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_sub_delete on public.school_substitutions;
create policy school_sub_delete on public.school_substitutions for delete using (public.school_is_admin(school_id));

revoke all on public.school_substitutions from anon;
grant select, insert, update, delete on public.school_substitutions to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_substitutions ready' as ok;
