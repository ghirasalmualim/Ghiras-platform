-- «إدارة المدرسة»: أوقات اليوم الدراسي (الحصص/الفسح/التجمّع). معزول، إضافي.
-- kind: lesson=حصة، break=فسحة، assembly=تجمّع صباحي، other=وقت غير تدريسي.
create table if not exists public.school_periods (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  kind       text not null default 'lesson' check (kind in ('lesson','break','assembly','other')),
  start_time text,   -- 'HH:MM'
  end_time   text,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_periods_school_idx on public.school_periods(school_id);

alter table public.school_periods enable row level security;
drop policy if exists school_periods_select on public.school_periods;
create policy school_periods_select on public.school_periods for select using (public.school_is_member(school_id));
drop policy if exists school_periods_insert on public.school_periods;
create policy school_periods_insert on public.school_periods for insert with check (public.school_is_admin(school_id));
drop policy if exists school_periods_update on public.school_periods;
create policy school_periods_update on public.school_periods for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_periods_delete on public.school_periods;
create policy school_periods_delete on public.school_periods for delete using (public.school_is_admin(school_id));

revoke all on public.school_periods from anon;
grant select, insert, update, delete on public.school_periods to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_periods ready' as ok;
