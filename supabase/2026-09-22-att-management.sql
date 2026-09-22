-- ============================================================================
-- «إدارة الحضور المدرسية» 🏫 — منتج منفصل فوق جداول «إدارة المدرسة» (/school).
-- معزول وإضافي بالكامل:
--   • لا يمسّ attendance_data ولا /api/attendance (سجل الحضور الذكي يبقى كما هو).
--   • لا يمسّ profiles ولا admin_set_tool ولا admin_grant ولا register_device.
--   • لا يعيد تعريف أي دالة school_* قائمة — يستدعيها فقط (school_can/school_is_admin).
--   • اشتراكه منفصل (schools.att_until + att_classes) عن subscription_until الخاص
--     بـ/school، فمشتركة إدارة الحضور لا تفتح نظام المدرسة الكامل.
-- التسعير (قرار حصة): ٤ د.ك لكل فصل، أقلّ اشتراك ١٠ فصول، لمدة ٤ شهور قابلة للتجديد.
-- الأدوار: المنشئة (owner) + حتى رئيسيتين غيرها = مستوى الإدارة (school_is_admin)،
--          ومسؤولات الصفوف = أعضاء 'supervisor' بصلاحيات حضور/طالبات بنطاق الصف.
-- الكتابة كلها عبر دوال att_* (SECURITY DEFINER) تتحقّق من الاشتراك والنطاق وتكتب
-- سجل التعديلات باسم المسؤولة (يدعم الحساب المشترك: «مَن تسجّل الآن؟»).
-- ============================================================================

-- 1) أعمدة منفصلة على schools (جدولنا المعزول) --------------------------------
alter table public.schools add column if not exists att_org     boolean not null default false;
alter table public.schools add column if not exists att_until   timestamptz;
alter table public.schools add column if not exists att_classes int  not null default 0;
alter table public.schools add column if not exists att_gender  text not null default 'girls';
alter table public.schools add column if not exists att_cutoff  time not null default '07:45';
do $$ begin
  alter table public.schools add constraint schools_att_gender_chk check (att_gender in ('girls','boys'));
exception when duplicate_object then null; end $$;

-- 2) توسيع حالات school_attendance لتطابق سجل الحضور الذكي بالضبط -------------
--    (توسيع فقط: القيم القديمة present/absent/late/excused تبقى صالحة)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.school_attendance'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.school_attendance drop constraint %I', c);
  end loop;
end $$;
alter table public.school_attendance add constraint school_attendance_status_check
  check (status in ('present','absent','late','excused','excused_out','excused_abs'));

-- 3) اعتماد اليوم لكل فصل (الفصل الذي كلّه حاضرات لا صفوف غياب له) -------------
create table if not exists public.school_att_days (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  class_id      uuid not null references public.school_classes(id) on delete cascade,
  date          date not null,
  approved      boolean not null default false,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_name text,
  approved_at   timestamptz,
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_name  text,
  updated_at    timestamptz not null default now(),
  unique (class_id, date)
);
create index if not exists school_att_days_school_date_idx on public.school_att_days(school_id, date);

alter table public.school_att_days enable row level security;
drop policy if exists school_att_days_select on public.school_att_days;
create policy school_att_days_select on public.school_att_days for select
  using (
    public.school_is_admin(school_id)
    or public.school_can(school_id, 'attendance', 'view', 'class', class_id)
  );
-- لا سياسات كتابة: الكتابة عبر دوال att_* فقط.
revoke all on public.school_att_days from anon;
grant select on public.school_att_days to authenticated;

-- 4) دوال مساعدة -----------------------------------------------------------------
create or replace function public.att_is_active(p_school uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select public.is_admin()
      or exists (select 1 from public.schools s
                  where s.id = p_school and s.att_org and s.att_until is not null and s.att_until > now());
$$;

create or replace function public.att_actor_name(p_name text)
 returns text language sql security definer set search_path to 'public' stable as $$
  select coalesce(nullif(trim(p_name), ''),
                  (select nullif(trim(full_name), '') from public.profiles where id = auth.uid()),
                  'مستخدمة');
$$;

-- حدّ الفصول المدفوعة: بعد التفعيل لا يُضاف فصل فوق الحصة (قبل التفعيل الإعداد حرّ).
create or replace function public.att_classes_quota()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v record; v_count int;
begin
  select att_org, att_until, att_classes into v from public.schools where id = new.school_id;
  if v.att_org and v.att_until is not null and not public.is_admin() then
    select count(*) into v_count from public.school_classes
     where school_id = new.school_id and not archived;
    if v_count >= v.att_classes then
      raise exception 'att_quota' using hint = 'بلغتِ عدد الفصول المشترك فيه';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_att_classes_quota on public.school_classes;
create trigger trg_att_classes_quota before insert on public.school_classes
  for each row execute function public.att_classes_quota();

-- 5) إنشاء إدارة جديدة (أي مستخدمة مسجّلة) + الهيكل الافتراضي ---------------------
--    الافتراضي: المرحلة الابتدائية، ٥ صفوف × ٦ فصول، أسماء «الأول / ١» … — كلها معاملات.
create or replace function public.att_org_create(
  p_name        text,
  p_gender      text    default 'girls',
  p_year        text    default null,
  p_stage       text    default 'المرحلة الابتدائية',
  p_grades      text[]  default array['الأول','الثاني','الثالث','الرابع','الخامس'],
  p_per_grade   int[]   default array[6,6,6,6,6]
) returns uuid
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_stage uuid;
  v_grade uuid;
  i int; j int; n int;
  ar text[] := array['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  v_num text;
begin
  if v_uid is null then raise exception 'auth'; end if;
  if exists (select 1 from public.profiles where id = v_uid and status = 'suspended') then
    raise exception 'suspended';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'name_required'; end if;
  if coalesce(p_gender,'girls') not in ('girls','boys') then raise exception 'bad_gender'; end if;
  if (select count(*) from public.schools where owner_id = v_uid and att_org) >= 5 and not public.is_admin() then
    raise exception 'too_many_orgs';
  end if;
  if coalesce(array_length(p_grades,1),0) = 0
     or coalesce(array_length(p_grades,1),0) <> coalesce(array_length(p_per_grade,1),0)
     or coalesce(array_length(p_grades,1),0) > 15 then
    raise exception 'bad_structure';
  end if;

  insert into public.schools(owner_id, name, academic_year, att_org, att_gender)
    values (v_uid, trim(p_name), nullif(trim(p_year), ''), true, coalesce(p_gender,'girls'))
    returning id into v_id;

  insert into public.school_members(school_id, user_id, role, title)
    values (v_id, v_uid, 'admin', 'المسؤولة الرئيسية (المنشئة)');

  insert into public.school_stages(school_id, name, sort)
    values (v_id, coalesce(nullif(trim(p_stage), ''), 'المرحلة الابتدائية'), 1)
    returning id into v_stage;

  for i in 1 .. array_length(p_grades,1) loop
    insert into public.school_grades(school_id, stage_id, name, sort)
      values (v_id, v_stage, trim(p_grades[i]), i) returning id into v_grade;
    n := least(greatest(coalesce(p_per_grade[i],0),0), 20);
    for j in 1 .. n loop
      v_num := array_to_string(array(select ar[d::int + 1] from regexp_split_to_table(j::text, '') d), '');
      insert into public.school_classes(school_id, grade_id, name, sort)
        values (v_id, v_grade, trim(p_grades[i]) || ' / ' || v_num, j);
    end loop;
  end loop;

  return v_id;
end $$;

-- 6) التفعيل/التجديد — الأدمِن فقط (مسار منفصل تمامًا عن admin_set_tool) ----------
create or replace function public.att_org_set_subscription(p_school uuid, p_classes int, p_months int default 4)
 returns table(att_until timestamptz, att_classes int)
 language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.schools s
     set att_classes = greatest(10, coalesce(p_classes, 10)),
         att_until   = (case when s.att_until is not null and s.att_until > now() then s.att_until else now() end)
                       + make_interval(months => greatest(coalesce(p_months, 4), 1)),
         updated_at  = now()
   where s.id = p_school and s.att_org;
  if not found then raise exception 'not_found'; end if;
  return query select s.att_until, s.att_classes from public.schools s where s.id = p_school;
end $$;

create or replace function public.att_org_stop(p_school uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.schools set att_until = now(), updated_at = now() where id = p_school and att_org;
end $$;

-- 7) المسؤولات ----------------------------------------------------------------------
-- p_kind: 'main' (رئيسية — حتى ٢ غير المنشئة) | 'grade' (مسؤولة صف بنطاق صفوف/فصول)
create or replace function public.att_add_member(
  p_school uuid, p_identifier text, p_kind text,
  p_grades uuid[] default '{}', p_classes uuid[] default '{}', p_title text default null
) returns table(ok boolean, msg text, member_id uuid, member_name text)
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid; v_uid uuid; v_name text; v_mid uuid; v_mains int;
  v_ident text := trim(coalesce(p_identifier,''));
  g uuid; m text; a text;
begin
  if not public.school_is_admin(p_school) then
    return query select false, 'غير مصرّح — المسؤولة الرئيسية فقط', null::uuid, null::text; return;
  end if;
  select owner_id into v_owner from public.schools where id = p_school and att_org;
  if v_owner is null then
    return query select false, 'الإدارة غير موجودة', null::uuid, null::text; return;
  end if;
  if p_kind not in ('main','grade') then
    return query select false, 'نوع غير صالح', null::uuid, null::text; return;
  end if;
  if v_ident = '' then
    return query select false, 'أدخلي رقم الهاتف', null::uuid, null::text; return;
  end if;

  select id, full_name into v_uid, v_name from public.profiles
   where lower(username) = lower(v_ident)
      or (regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(v_ident, '[^0-9]', '', 'g')
          and regexp_replace(v_ident, '[^0-9]', '', 'g') <> '')
   limit 1;
  if v_uid is null then
    return query select false, 'لا يوجد حساب بهذا الرقم — تسجّل المسؤولة في غراس أولًا (مجانًا)', null::uuid, null::text; return;
  end if;
  if v_uid = v_owner then
    return query select false, 'هذه المنشئة — مسؤولة رئيسية أصلًا', null::uuid, null::text; return;
  end if;

  if p_kind = 'main' then
    select count(*) into v_mains from public.school_members
     where school_id = p_school and role in ('admin','principal','deputy')
       and user_id is distinct from v_owner and user_id is distinct from v_uid;
    if v_mains >= 2 then
      return query select false, 'الحدّ الأقصى رئيسيتان غير المنشئة', null::uuid, null::text; return;
    end if;
  end if;

  select id into v_mid from public.school_members where school_id = p_school and user_id = v_uid;
  if v_mid is null then
    insert into public.school_members(school_id, user_id, role, title)
      values (p_school, v_uid, case when p_kind='main' then 'admin' else 'supervisor' end,
              coalesce(nullif(trim(p_title),''), case when p_kind='main' then 'مسؤولة رئيسية' else 'مسؤولة صف' end))
      returning id into v_mid;
  else
    update public.school_members
       set role = case when p_kind='main' then 'admin' else 'supervisor' end,
           title = coalesce(nullif(trim(p_title),''), title)
     where id = v_mid;
  end if;

  -- نطاق مسؤولة الصف: حضور + طالبات (عرض/إضافة/تعديل) على الصفوف/الفصول المحدّدة
  delete from public.school_permissions
   where school_id = p_school and user_id = v_uid and module in ('attendance','students');
  if p_kind = 'grade' then
    foreach m in array array['attendance','students'] loop
      foreach a in array array['view','add','edit'] loop
        foreach g in array coalesce(p_grades,'{}') loop
          if exists (select 1 from public.school_grades where id = g and school_id = p_school) then
            insert into public.school_permissions(school_id, user_id, module, action, scope_type, scope_id)
              values (p_school, v_uid, m, a, 'grade', g);
          end if;
        end loop;
        foreach g in array coalesce(p_classes,'{}') loop
          if exists (select 1 from public.school_classes where id = g and school_id = p_school) then
            insert into public.school_permissions(school_id, user_id, module, action, scope_type, scope_id)
              values (p_school, v_uid, m, a, 'class', g);
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (p_school, auth.uid(), 'att.member', 'member', v_mid,
            jsonb_build_object('name', v_name, 'kind', p_kind, 'grades', p_grades, 'classes', p_classes));
  return query select true, 'تمت الإضافة', v_mid, v_name;
end $$;

create or replace function public.att_remove_member(p_member uuid)
 returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_school uuid; v_uid uuid; v_owner uuid;
begin
  select m.school_id, m.user_id, s.owner_id into v_school, v_uid, v_owner
    from public.school_members m join public.schools s on s.id = m.school_id
   where m.id = p_member and s.att_org;
  if v_school is null then return false; end if;
  if not public.school_is_admin(v_school) then raise exception 'forbidden'; end if;
  if v_uid = v_owner then raise exception 'cannot_remove_owner'; end if;
  delete from public.school_permissions where school_id = v_school and user_id = v_uid;
  delete from public.school_members where id = p_member;
  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (v_school, auth.uid(), 'att.member_remove', 'member', p_member, '{}'::jsonb);
  return true;
end $$;

-- قائمة المسؤولات مع نطاقاتهن (للإدارة الرئيسية فقط)
create or replace function public.att_members(p_school uuid)
 returns table(member_id uuid, user_id uuid, name text, phone text, kind text, is_owner boolean,
               grade_ids uuid[], class_ids uuid[])
 language sql security definer set search_path to 'public' stable as $$
  select m.id, m.user_id, coalesce(p.full_name, m.member_name), p.phone,
         case when m.role in ('admin','principal','deputy') then 'main' else 'grade' end,
         (m.user_id = s.owner_id),
         coalesce(array(select distinct sp.scope_id from public.school_permissions sp
                         where sp.school_id = m.school_id and sp.user_id = m.user_id
                           and sp.module = 'attendance' and sp.scope_type = 'grade'), '{}'),
         coalesce(array(select distinct sp.scope_id from public.school_permissions sp
                         where sp.school_id = m.school_id and sp.user_id = m.user_id
                           and sp.module = 'attendance' and sp.scope_type = 'class'), '{}')
  from public.school_members m
  join public.schools s on s.id = m.school_id
  left join public.profiles p on p.id = m.user_id
  where m.school_id = p_school and s.att_org and public.school_is_admin(p_school)
  order by (m.user_id = s.owner_id) desc, m.role, m.created_at;
$$;

-- إداراتي: كل إدارة حضور أنا منشئتها أو عضو فيها + نوعي + نطاقي
create or replace function public.att_my_orgs()
 returns table(school_id uuid, name text, gender text, active boolean, att_until timestamptz,
               att_classes int, cutoff time, kind text, grade_ids uuid[], class_ids uuid[])
 language sql security definer set search_path to 'public' stable as $$
  select s.id, s.name, s.att_gender,
         (s.att_until is not null and s.att_until > now()), s.att_until, s.att_classes, s.att_cutoff,
         case when public.school_is_admin(s.id) then 'main' else 'grade' end,
         coalesce(array(select distinct sp.scope_id from public.school_permissions sp
                         where sp.school_id = s.id and sp.user_id = auth.uid()
                           and sp.module = 'attendance' and sp.scope_type = 'grade'), '{}'),
         coalesce(array(select distinct sp.scope_id from public.school_permissions sp
                         where sp.school_id = s.id and sp.user_id = auth.uid()
                           and sp.module = 'attendance' and sp.scope_type = 'class'), '{}')
  from public.schools s
  where s.att_org
    and (s.owner_id = auth.uid()
         or exists (select 1 from public.school_members m where m.school_id = s.id and m.user_id = auth.uid()))
  order by s.created_at;
$$;

-- إعدادات الإدارة (الاسم/الجنس/وقت التنبيه) — الرئيسية فقط
create or replace function public.att_org_update(p_school uuid, p_name text default null,
                                                 p_gender text default null, p_cutoff time default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.school_is_admin(p_school) then raise exception 'forbidden'; end if;
  if p_gender is not null and p_gender not in ('girls','boys') then raise exception 'bad_gender'; end if;
  update public.schools
     set name = coalesce(nullif(trim(p_name),''), name),
         att_gender = coalesce(p_gender, att_gender),
         att_cutoff = coalesce(p_cutoff, att_cutoff),
         updated_at = now()
   where id = p_school and att_org;
end $$;

-- 8) التسجيل اليومي -------------------------------------------------------------------
create or replace function public.att_guard(p_class uuid)
 returns uuid language plpgsql security definer set search_path to 'public' stable as $$
declare v_school uuid;
begin
  select c.school_id into v_school from public.school_classes c
    join public.schools s on s.id = c.school_id
   where c.id = p_class and s.att_org;
  if v_school is null then raise exception 'not_found'; end if;
  if not public.att_is_active(v_school) then raise exception 'inactive'; end if;
  if not public.school_can(v_school, 'attendance', 'edit', 'class', p_class) then
    raise exception 'forbidden';
  end if;
  return v_school;
end $$;

create or replace function public.att_touch_day(p_school uuid, p_class uuid, p_date date, p_name text)
 returns void language sql security definer set search_path to 'public' as $$
  insert into public.school_att_days(school_id, class_id, date, updated_by, updated_name, updated_at)
    values (p_school, p_class, p_date, auth.uid(), p_name, now())
  on conflict (class_id, date) do update
    set updated_by = excluded.updated_by, updated_name = excluded.updated_name, updated_at = now();
$$;

-- تغيير حالة طالبة واحدة (الضغطة الدائرية)
create or replace function public.att_mark(p_class uuid, p_date date, p_student uuid,
                                           p_status text, p_by_name text default null)
 returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid := public.att_guard(p_class);
  v_name   text := public.att_actor_name(p_by_name);
  v_old    text; v_sname text; v_cname text;
begin
  if p_status not in ('present','absent','late','excused_out','excused_abs') then
    raise exception 'bad_status';
  end if;
  select name into v_sname from public.school_students
   where id = p_student and class_id = p_class and not archived;
  if v_sname is null then raise exception 'student_not_in_class'; end if;

  select status into v_old from public.school_attendance where student_id = p_student and date = p_date;
  v_old := coalesce(v_old, 'present');

  if p_status = 'present' then
    delete from public.school_attendance where student_id = p_student and date = p_date;
  else
    insert into public.school_attendance(school_id, student_id, class_id, date, status)
      values (v_school, p_student, p_class, p_date, p_status)
    on conflict (student_id, date) do update set status = excluded.status, class_id = excluded.class_id;
  end if;

  perform public.att_touch_day(v_school, p_class, p_date, v_name);

  if v_old <> p_status then
    select name into v_cname from public.school_classes where id = p_class;
    insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
      values (v_school, auth.uid(), 'att.mark', 'student', p_student,
              jsonb_build_object('by', v_name, 'class_id', p_class, 'class', v_cname,
                                 'student', v_sname, 'date', p_date, 'from', v_old, 'to', p_status));
  end if;
  return p_status;
end $$;

-- الكل حاضرات / الكل غياب …
create or replace function public.att_mark_all(p_class uuid, p_date date, p_status text, p_by_name text default null)
 returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid := public.att_guard(p_class);
  v_name   text := public.att_actor_name(p_by_name);
  v_n int; v_cname text;
begin
  if p_status not in ('present','absent','late','excused_out','excused_abs') then
    raise exception 'bad_status';
  end if;
  delete from public.school_attendance where class_id = p_class and date = p_date;
  if p_status <> 'present' then
    insert into public.school_attendance(school_id, student_id, class_id, date, status)
      select v_school, st.id, p_class, p_date, p_status
        from public.school_students st where st.class_id = p_class and not st.archived;
  end if;
  select count(*) into v_n from public.school_students where class_id = p_class and not archived;
  perform public.att_touch_day(v_school, p_class, p_date, v_name);
  select name into v_cname from public.school_classes where id = p_class;
  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (v_school, auth.uid(), 'att.mark_all', 'class', p_class,
            jsonb_build_object('by', v_name, 'class', v_cname, 'date', p_date, 'to', p_status, 'count', v_n));
  return v_n;
end $$;

-- إعادة تعيين اليوم (يمسح التسجيل والاعتماد)
create or replace function public.att_reset_day(p_class uuid, p_date date, p_by_name text default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid := public.att_guard(p_class);
  v_name   text := public.att_actor_name(p_by_name);
  v_cname  text;
begin
  delete from public.school_attendance where class_id = p_class and date = p_date;
  delete from public.school_att_days where class_id = p_class and date = p_date;
  select name into v_cname from public.school_classes where id = p_class;
  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (v_school, auth.uid(), 'att.reset', 'class', p_class,
            jsonb_build_object('by', v_name, 'class', v_cname, 'date', p_date));
end $$;

-- ✅ اعتماد حضور اليوم
create or replace function public.att_approve(p_class uuid, p_date date, p_by_name text default null)
 returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid := public.att_guard(p_class);
  v_name   text := public.att_actor_name(p_by_name);
  v_cname  text; v_absent int;
begin
  insert into public.school_att_days(school_id, class_id, date, approved, approved_by, approved_name, approved_at,
                                     updated_by, updated_name, updated_at)
    values (v_school, p_class, p_date, true, auth.uid(), v_name, now(), auth.uid(), v_name, now())
  on conflict (class_id, date) do update
    set approved = true, approved_by = excluded.approved_by, approved_name = excluded.approved_name,
        approved_at = now(), updated_by = excluded.updated_by, updated_name = excluded.updated_name,
        updated_at = now();
  select name into v_cname from public.school_classes where id = p_class;
  select count(*) into v_absent from public.school_attendance where class_id = p_class and date = p_date;
  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (v_school, auth.uid(), 'att.approve', 'class', p_class,
            jsonb_build_object('by', v_name, 'class', v_cname, 'date', p_date, 'exceptions', v_absent));
  return now();
end $$;

-- 9) الصلاحيات على الدوال ----------------------------------------------------------
revoke all on function public.att_is_active(uuid)                                   from public, anon;
revoke all on function public.att_actor_name(text)                                  from public, anon;
revoke all on function public.att_guard(uuid)                                       from public, anon;
revoke all on function public.att_touch_day(uuid, uuid, date, text)                 from public, anon, authenticated;
revoke all on function public.att_org_create(text, text, text, text, text[], int[]) from public, anon;
revoke all on function public.att_org_set_subscription(uuid, int, int)              from public, anon;
revoke all on function public.att_org_stop(uuid)                                    from public, anon;
revoke all on function public.att_add_member(uuid, text, text, uuid[], uuid[], text) from public, anon;
revoke all on function public.att_remove_member(uuid)                               from public, anon;
revoke all on function public.att_members(uuid)                                     from public, anon;
revoke all on function public.att_my_orgs()                                         from public, anon;
revoke all on function public.att_org_update(uuid, text, text, time)                from public, anon;
revoke all on function public.att_mark(uuid, date, uuid, text, text)                from public, anon;
revoke all on function public.att_mark_all(uuid, date, text, text)                  from public, anon;
revoke all on function public.att_reset_day(uuid, date, text)                       from public, anon;
revoke all on function public.att_approve(uuid, date, text)                         from public, anon;

grant execute on function public.att_is_active(uuid)                                   to authenticated;
grant execute on function public.att_org_create(text, text, text, text, text[], int[]) to authenticated;
grant execute on function public.att_org_set_subscription(uuid, int, int)              to authenticated;
grant execute on function public.att_org_stop(uuid)                                    to authenticated;
grant execute on function public.att_add_member(uuid, text, text, uuid[], uuid[], text) to authenticated;
grant execute on function public.att_remove_member(uuid)                               to authenticated;
grant execute on function public.att_members(uuid)                                     to authenticated;
grant execute on function public.att_my_orgs()                                         to authenticated;
grant execute on function public.att_org_update(uuid, text, text, time)                to authenticated;
grant execute on function public.att_mark(uuid, date, uuid, text, text)                to authenticated;
grant execute on function public.att_mark_all(uuid, date, text, text)                  to authenticated;
grant execute on function public.att_reset_day(uuid, date, text)                       to authenticated;
grant execute on function public.att_approve(uuid, date, text)                         to authenticated;

NOTIFY pgrst, 'reload schema';
select 'att management ready' as ok;
