-- «إدارة المدرسة»: وصول المعلمة لفصولها (معزول).
--   المعلمة (حسابها مربوط) تدرّس فصولًا عبر school_teaching. نمنحها:
--   • قراءة طالبات فصولها (لسجل الدرجات والحضور).
--   • رصد حضور فصولها (سجل حضور المعلمة، يشتغل بحسابها بالمنصة).
--   ★ يعدّل سياسات جداولنا فقط (طالبات/حضور) إضافةً على ما سبق.

create or replace function public.school_teaches_class(p_school uuid, p_class uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1 from public.school_teaching t
    join public.school_members m on m.id = t.member_id
    where t.school_id = p_school and t.class_id = p_class and m.user_id = auth.uid()
  );
$$;
grant execute on function public.school_teaches_class(uuid, uuid) to authenticated;

-- الطالبات: تُضاف قراءة معلمة الفصل (بجانب الإدارة/الإشراف/الصلاحية الممنوحة).
drop policy if exists school_students_select on public.school_students;
create policy school_students_select on public.school_students for select
  using (
    public.school_is_admin(school_id)
    or public.school_supervises_class(school_id, class_id)
    or public.school_can(school_id, 'students', 'view', 'class', class_id)
    or public.school_teaches_class(school_id, class_id)
  );

-- الحضور: قراءة ورصد معلمة الفصل لفصولها.
drop policy if exists school_att_select on public.school_attendance;
create policy school_att_select on public.school_attendance for select
  using (
    public.school_is_admin(school_id)
    or public.school_supervises_class(school_id, class_id)
    or public.school_can(school_id, 'attendance', 'view', 'class', class_id)
    or public.school_teaches_class(school_id, class_id)
  );
drop policy if exists school_att_insert on public.school_attendance;
create policy school_att_insert on public.school_attendance for insert
  with check (public.school_can(school_id, 'attendance', 'add', 'class', class_id)
              or public.school_supervises_class(school_id, class_id)
              or public.school_teaches_class(school_id, class_id));
drop policy if exists school_att_update on public.school_attendance;
create policy school_att_update on public.school_attendance for update
  using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_teaches_class(school_id, class_id))
  with check (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
              or public.school_supervises_class(school_id, class_id)
              or public.school_teaches_class(school_id, class_id));
drop policy if exists school_att_delete on public.school_attendance;
create policy school_att_delete on public.school_attendance for delete
  using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_teaches_class(school_id, class_id));

NOTIFY pgrst, 'reload schema';
select 'school teacher-access ready' as ok;
