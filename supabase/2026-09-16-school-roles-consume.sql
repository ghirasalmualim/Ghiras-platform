-- «إدارة المدرسة»: تفعيل الأدوار/الصلاحيات فعليًا (معزول). خطوة أولى:
--   • الوكيلة (deputy): تُضاف إلى school_is_admin ⇒ كل صلاحيات إدارة المدرسة
--     عدا الاشتراك وإنشاء المدرسة (هذولا يفحصان is_admin() المنصّة، لا يتأثران).
--   • القراءة بالصلاحية: SELECT الطالبات/الحضور تُكرِم school_can('…','view')
--     ⇒ من مُنِحت عرض الطالبات/الحضور (مثل شؤون الطالبات) تقرأ نطاقها فعليًا.
--   ★ يعيد تعريف دوالنا نحن (school_) فقط — لا يمسّ أي كائن خارج الوحدة.

-- 1) الوكيلة ضمن مستوى الإدارة (إضافة 'deputy' فقط).
create or replace function public.school_is_admin(p_school uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select public.is_admin()
      or exists (select 1 from public.schools s
                 where s.id = p_school and s.owner_id = auth.uid())
      or exists (select 1 from public.school_members m
                 where m.school_id = p_school and m.user_id = auth.uid()
                   and m.role in ('admin','principal','deputy'));
$$;

-- 1b) school_can: الوكيلة (deputy) تمرّ كإدارة أيضًا (بجانب admin/principal).
--     نفس المنطق الأصلي، مع إضافة 'deputy' في اختصار الدور فقط.
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
  if v_role is null then return false; end if;                            -- not a member
  if v_role in ('admin','principal','deputy') then return true; end if;   -- runs the school

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

-- 2) قراءة الطالبات/الحضور تُكرِم صلاحية العرض الممنوحة (بجانب الإدارة والإشراف).
drop policy if exists school_students_select on public.school_students;
create policy school_students_select on public.school_students for select
  using (
    public.school_is_admin(school_id)
    or public.school_supervises_class(school_id, class_id)
    or public.school_can(school_id, 'students', 'view', 'class', class_id)
  );

drop policy if exists school_att_select on public.school_attendance;
create policy school_att_select on public.school_attendance for select
  using (
    public.school_is_admin(school_id)
    or public.school_supervises_class(school_id, class_id)
    or public.school_can(school_id, 'attendance', 'view', 'class', class_id)
  );

NOTIFY pgrst, 'reload schema';
select 'school roles-consume ready' as ok;
