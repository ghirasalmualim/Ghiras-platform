-- ═══════════════════════════════════════════════════════════════
-- «إدارة المدرسة» — المرحلة ١: الأساس + الهيكل المدرسي.
--
-- يقدّم أول محور تعدد-مدارس (school_id) في المنصّة: مدرسة، عضوية الكادر بدور
-- مدرسي، صلاحيات RBAC بنطاق (school/stage/grade/class/department)، سجل عمليات،
-- وهيكل (مراحل/صفوف/فصول) — كلها بحماية RLS مبنية في القاعدة (لا إخفاء واجهة).
--
-- البوابة: إنشاء مدرسة يتطلب اشتراك school_until سارٍ (أو admin) — يُفرض في
-- الدالة school_create وحدها. بقية الكادر مجاني: وصولهم من العضوية + الصلاحيات.
--
-- يُنفَّذ مرة واحدة: Supabase → SQL Editor. آمن لإعادة التشغيل. تعليقات إنجليزية.
-- ═══════════════════════════════════════════════════════════════

-- 0) entitlement column: owning/creating a school is the paid gate.
alter table public.profiles
  add column if not exists school_until timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 1) core entities
-- ─────────────────────────────────────────────────────────────

create table if not exists public.schools (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  name          text not null,
  academic_year text,
  term          text,
  work_days     smallint[] not null default '{0,1,2,3,4}',  -- 0=Sunday … 6=Saturday
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists schools_owner_idx on public.schools(owner_id);

-- membership: which profile belongs to which school, and its school-role.
create table if not exists public.school_members (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'teacher'
             check (role in ('admin','principal','deputy','coordinator','supervisor','student_affairs','teacher')),
  title      text,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);
create index if not exists school_members_user_idx on public.school_members(user_id);

-- RBAC + scope grants (fine-grained, per module/action/scope).
create table if not exists public.school_permissions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module     text not null,                         -- structure/students/attendance/staff_attendance/timetable/…
  action     text not null check (action in ('view','add','edit','approve','delete','export')),
  scope_type text not null check (scope_type in ('school','stage','grade','class','department')),
  scope_id   uuid,                                  -- null iff scope_type='school'
  created_at timestamptz not null default now(),
  check ((scope_type = 'school' and scope_id is null) or (scope_type <> 'school' and scope_id is not null))
);
create index if not exists school_permissions_user_idx on public.school_permissions(school_id, user_id);

-- structure: school-owned stages → grades → classes (distinct from the global
-- content taxonomy). school_id is denormalized on children for cheap RLS.
create table if not exists public.school_stages (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_stages_school_idx on public.school_stages(school_id);

create table if not exists public.school_grades (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  stage_id   uuid not null references public.school_stages(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_grades_stage_idx on public.school_grades(school_id, stage_id);

create table if not exists public.school_classes (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  grade_id   uuid not null references public.school_grades(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists school_classes_grade_idx on public.school_classes(school_id, grade_id);

-- append-only audit trail.
create table if not exists public.school_audit_log (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,                        -- e.g. 'stage.insert', 'member.delete'
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists school_audit_school_idx on public.school_audit_log(school_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 2) authorization helpers (SECURITY DEFINER, the DB is the authority)
-- ─────────────────────────────────────────────────────────────

-- is the caller a member of this school (or platform admin)?
create or replace function public.school_is_member(p_school uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select public.is_admin()
      or exists (select 1 from public.school_members m
                 where m.school_id = p_school and m.user_id = auth.uid());
$$;

-- does the caller run this school (owner, or admin/principal member, or platform admin)?
create or replace function public.school_is_admin(p_school uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select public.is_admin()
      or exists (select 1 from public.schools s
                 where s.id = p_school and s.owner_id = auth.uid())
      or exists (select 1 from public.school_members m
                 where m.school_id = p_school and m.user_id = auth.uid()
                   and m.role in ('admin','principal'));
$$;

-- can the caller perform (module, action) within a target scope?
-- A permission at an ancestor scope (school > stage > grade > class) covers it.
create or replace function public.school_can(
  p_school uuid, p_module text, p_action text,
  p_scope_type text default 'school', p_scope_id uuid default null
) returns boolean
 language plpgsql security definer set search_path to 'public' stable as $$
declare
  v_role  text;
  v_stage uuid;
  v_grade uuid;
begin
  if public.is_admin() then return true; end if;

  select role into v_role from public.school_members
   where school_id = p_school and user_id = auth.uid();
  if v_role is null then return false; end if;                 -- not a member
  if v_role in ('admin','principal') then return true; end if; -- runs the school

  -- resolve the target's ancestors so an ancestor-scope grant covers it
  if p_scope_type = 'class' then
    select grade_id into v_grade from public.school_classes where id = p_scope_id and school_id = p_school;
    select stage_id into v_stage from public.school_grades  where id = v_grade;
  elsif p_scope_type = 'grade' then
    v_grade := p_scope_id;
    select stage_id into v_stage from public.school_grades where id = p_scope_id and school_id = p_school;
  elsif p_scope_type = 'stage' then
    v_stage := p_scope_id;
  end if;

  return exists (
    select 1 from public.school_permissions sp
    where sp.school_id = p_school and sp.user_id = auth.uid()
      and sp.module = p_module and sp.action = p_action
      and (
            sp.scope_type = 'school'
        or (sp.scope_type = 'stage'      and sp.scope_id = v_stage)
        or (sp.scope_type = 'grade'      and sp.scope_id = v_grade)
        or (sp.scope_type = 'class'      and p_scope_type = 'class'      and sp.scope_id = p_scope_id)
        or (sp.scope_type = 'department' and p_scope_type = 'department' and sp.scope_id = p_scope_id)
      )
  );
end $$;

grant execute on function public.school_is_member(uuid) to authenticated;
grant execute on function public.school_is_admin(uuid) to authenticated;
grant execute on function public.school_can(uuid, text, text, text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) audit trigger — logs every structural/membership change, DB-level
-- ─────────────────────────────────────────────────────────────
create or replace function public.school_audit_trigger()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid;
  v_id     uuid;
  v_label  text := tg_argv[0];
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  if v_label = 'school' then
    v_school := v_id;
  else
    if tg_op = 'DELETE' then v_school := old.school_id; else v_school := new.school_id; end if;
  end if;
  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (v_school, auth.uid(), v_label || '.' || lower(tg_op), v_label, v_id,
            case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists trg_audit_school   on public.schools;
create trigger trg_audit_school   after insert or update or delete on public.schools
  for each row execute function public.school_audit_trigger('school');
drop trigger if exists trg_audit_member   on public.school_members;
create trigger trg_audit_member   after insert or update or delete on public.school_members
  for each row execute function public.school_audit_trigger('member');
drop trigger if exists trg_audit_stage    on public.school_stages;
create trigger trg_audit_stage    after insert or update or delete on public.school_stages
  for each row execute function public.school_audit_trigger('stage');
drop trigger if exists trg_audit_grade    on public.school_grades;
create trigger trg_audit_grade    after insert or update or delete on public.school_grades
  for each row execute function public.school_audit_trigger('grade');
drop trigger if exists trg_audit_class    on public.school_classes;
create trigger trg_audit_class    after insert or update or delete on public.school_classes
  for each row execute function public.school_audit_trigger('class');

-- ─────────────────────────────────────────────────────────────
-- 4) RLS
-- ─────────────────────────────────────────────────────────────
alter table public.schools            enable row level security;
alter table public.school_members     enable row level security;
alter table public.school_permissions enable row level security;
alter table public.school_stages      enable row level security;
alter table public.school_grades      enable row level security;
alter table public.school_classes     enable row level security;
alter table public.school_audit_log   enable row level security;

-- schools: members read; admins update; owner/platform-admin delete; insert via RPC only.
drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools for select using (public.school_is_member(id));
drop policy if exists schools_update on public.schools;
create policy schools_update on public.schools for update using (public.school_is_admin(id)) with check (public.school_is_admin(id));
drop policy if exists schools_delete on public.schools;
create policy schools_delete on public.schools for delete using (owner_id = auth.uid() or public.is_admin());

-- members: members read; school-admins manage.
drop policy if exists school_members_select on public.school_members;
create policy school_members_select on public.school_members for select using (public.school_is_member(school_id));
drop policy if exists school_members_insert on public.school_members;
create policy school_members_insert on public.school_members for insert with check (public.school_is_admin(school_id));
drop policy if exists school_members_update on public.school_members;
create policy school_members_update on public.school_members for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_members_delete on public.school_members;
create policy school_members_delete on public.school_members for delete using (public.school_is_admin(school_id));

-- permissions: school-admins manage; a user may read her own grants.
drop policy if exists school_permissions_select on public.school_permissions;
create policy school_permissions_select on public.school_permissions for select using (public.school_is_admin(school_id) or user_id = auth.uid());
drop policy if exists school_permissions_insert on public.school_permissions;
create policy school_permissions_insert on public.school_permissions for insert with check (public.school_is_admin(school_id));
drop policy if exists school_permissions_update on public.school_permissions;
create policy school_permissions_update on public.school_permissions for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_permissions_delete on public.school_permissions;
create policy school_permissions_delete on public.school_permissions for delete using (public.school_is_admin(school_id));

-- structure: members read; writes need the 'structure' capability (admins pass).
drop policy if exists school_stages_select on public.school_stages;
create policy school_stages_select on public.school_stages for select using (public.school_is_member(school_id));
drop policy if exists school_stages_insert on public.school_stages;
create policy school_stages_insert on public.school_stages for insert with check (public.school_can(school_id,'structure','add'));
drop policy if exists school_stages_update on public.school_stages;
create policy school_stages_update on public.school_stages for update using (public.school_can(school_id,'structure','edit')) with check (public.school_can(school_id,'structure','edit'));
drop policy if exists school_stages_delete on public.school_stages;
create policy school_stages_delete on public.school_stages for delete using (public.school_can(school_id,'structure','delete'));

drop policy if exists school_grades_select on public.school_grades;
create policy school_grades_select on public.school_grades for select using (public.school_is_member(school_id));
drop policy if exists school_grades_insert on public.school_grades;
create policy school_grades_insert on public.school_grades for insert with check (public.school_can(school_id,'structure','add'));
drop policy if exists school_grades_update on public.school_grades;
create policy school_grades_update on public.school_grades for update using (public.school_can(school_id,'structure','edit')) with check (public.school_can(school_id,'structure','edit'));
drop policy if exists school_grades_delete on public.school_grades;
create policy school_grades_delete on public.school_grades for delete using (public.school_can(school_id,'structure','delete'));

drop policy if exists school_classes_select on public.school_classes;
create policy school_classes_select on public.school_classes for select using (public.school_is_member(school_id));
drop policy if exists school_classes_insert on public.school_classes;
create policy school_classes_insert on public.school_classes for insert with check (public.school_can(school_id,'structure','add'));
drop policy if exists school_classes_update on public.school_classes;
create policy school_classes_update on public.school_classes for update using (public.school_can(school_id,'structure','edit')) with check (public.school_can(school_id,'structure','edit'));
drop policy if exists school_classes_delete on public.school_classes;
create policy school_classes_delete on public.school_classes for delete using (public.school_can(school_id,'structure','delete'));

-- audit: school-admins read; writes only through the SECURITY DEFINER trigger.
drop policy if exists school_audit_select on public.school_audit_log;
create policy school_audit_select on public.school_audit_log for select using (public.school_is_admin(school_id));

-- ─────────────────────────────────────────────────────────────
-- 5) grants (client DML is RLS-gated; audit/insert-school go through functions)
-- ─────────────────────────────────────────────────────────────
revoke all on public.schools, public.school_members, public.school_permissions,
              public.school_stages, public.school_grades, public.school_classes,
              public.school_audit_log from anon;
revoke insert on public.schools from authenticated;            -- via school_create()
revoke all on public.school_audit_log from authenticated;
grant select on public.school_audit_log to authenticated;
grant select, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.school_members, public.school_permissions,
              public.school_stages, public.school_grades, public.school_classes to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) school_create: the ONLY way to create a school (enforces the paid gate)
-- ─────────────────────────────────────────────────────────────
create or replace function public.school_create(
  p_name text, p_year text default null, p_term text default null, p_work_days smallint[] default null
) returns uuid
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_ok boolean;
  v_id uuid;
begin
  select public.is_admin()
      or (status <> 'suspended' and school_until is not null and school_until > now())
    into v_ok
  from public.profiles where id = auth.uid();
  if not coalesce(v_ok, false) then raise exception 'forbidden'; end if;

  insert into public.schools(owner_id, name, academic_year, term, work_days)
    values (auth.uid(), nullif(trim(p_name), ''), nullif(trim(p_year), ''), nullif(trim(p_term), ''),
            coalesce(p_work_days, '{0,1,2,3,4}'::smallint[]))
    returning id into v_id;

  insert into public.school_members(school_id, user_id, role, title)
    values (v_id, auth.uid(), 'admin', 'مسؤولة المدرسة');

  return v_id;
end $$;

grant execute on function public.school_create(text, text, text, smallint[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7) admin_set_tool: add 'school' (full current list kept)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_tool(p_user uuid, p_tool text, p_months integer DEFAULT 6)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_col text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  v_col := case p_tool
    when 'studio'         then 'studio_until'
    when 'gradebook'      then 'gradebook_until'
    when 'attendance'     then 'attendance_until'
    when 'adventure'      then 'adventure_until'
    when 'multiplication' then 'multiplication_until'
    when 'head_records'   then 'head_records_until'
    when 'workshops'      then 'workshops_until'
    when 'clock'          then 'clock_until'
    when 'gharas_bank'    then 'gharas_bank_until'
    when 'agenda'         then 'agenda_until'
    when 'school'         then 'school_until'
    else null
  end;
  if v_col is null then raise exception 'unknown tool: %', p_tool; end if;
  if p_months > 0 then
    execute format(
      'update public.profiles set %I = greatest(coalesce(%I, now()), now()) + ($1 || '' months'')::interval where id = $2',
      v_col, v_col) using p_months, p_user;
    return 'granted';
  else
    execute format('update public.profiles set %I = null where id = $1', v_col) using p_user;
    return 'revoked';
  end if;
end;
$function$;

select 'school foundation: schools + members + permissions + structure + audit + school_create ready' as migration_revision;
