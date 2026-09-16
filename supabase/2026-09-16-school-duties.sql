-- «إدارة المدرسة»: المناوبات (معزول، إضافي). أماكن مناوبة + توزيع أسبوعي
-- (يوم × فترة × مكان ← معلمة). قيد unique يمنع المعلمة من مناوبتين بنفس الوقت.
create table if not exists public.school_duty_locations (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_duty_loc_idx on public.school_duty_locations(school_id);

create table if not exists public.school_duties (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  day         smallint not null check (day between 0 and 6),  -- 0=الأحد
  period_id   uuid not null references public.school_periods(id) on delete cascade,
  location_id uuid not null references public.school_duty_locations(id) on delete cascade,
  member_id   uuid not null references public.school_members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (school_id, day, period_id, member_id)  -- معلمة واحدة لا تُكلَّف مناوبتين بنفس الوقت
);
create index if not exists school_duties_idx on public.school_duties(school_id, day);

alter table public.school_duty_locations enable row level security;
alter table public.school_duties enable row level security;

-- الأماكن: الأعضاء يقرؤون؛ الإدارة تدير.
drop policy if exists school_dutyloc_select on public.school_duty_locations;
create policy school_dutyloc_select on public.school_duty_locations for select using (public.school_is_member(school_id));
drop policy if exists school_dutyloc_ins on public.school_duty_locations;
create policy school_dutyloc_ins on public.school_duty_locations for insert with check (public.school_is_admin(school_id));
drop policy if exists school_dutyloc_upd on public.school_duty_locations;
create policy school_dutyloc_upd on public.school_duty_locations for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_dutyloc_del on public.school_duty_locations;
create policy school_dutyloc_del on public.school_duty_locations for delete using (public.school_is_admin(school_id));

-- المناوبات: الأعضاء يقرؤون؛ الإدارة تدير.
drop policy if exists school_duties_select on public.school_duties;
create policy school_duties_select on public.school_duties for select using (public.school_is_member(school_id));
drop policy if exists school_duties_ins on public.school_duties;
create policy school_duties_ins on public.school_duties for insert with check (public.school_is_admin(school_id));
drop policy if exists school_duties_upd on public.school_duties;
create policy school_duties_upd on public.school_duties for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_duties_del on public.school_duties;
create policy school_duties_del on public.school_duties for delete using (public.school_is_admin(school_id));

revoke all on public.school_duty_locations, public.school_duties from anon;
grant select, insert, update, delete on public.school_duty_locations, public.school_duties to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_duties ready' as ok;
