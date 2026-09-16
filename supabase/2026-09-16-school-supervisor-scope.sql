-- «إدارة المدرسة»: تقييد المشرفة بنطاقها فعليًا في القاعدة (RLS). معزول.
--   دالة school_supervises_class: هل يُشرف المستخدم الحالي على هذا الفصل؟
--     (تغطية بالأسلاف: فصل مباشر، أو صفّه، أو مرحلته عبر school_supervisions).
--   ثم نُحكِم SELECT على الطالبات والحضور: الإدارة الكل، وغيرها نطاقها فقط.
--   ونسمح للمشرفة برصد حضور نطاقها + قراءة/رصد ملاحظات طالبات نطاقها.
--   ★ يعدّل سياسات جداول school_ الخاصة بنا فقط — لا يمسّ أي كائن خارج الوحدة.

create or replace function public.school_supervises_class(p_school uuid, p_class uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1
    from public.school_members m
    join public.school_supervisions sv on sv.member_id = m.id and sv.school_id = p_school
    join public.school_classes c on c.id = p_class and c.school_id = p_school
    join public.school_grades  g on g.id = c.grade_id
    where m.school_id = p_school and m.user_id = auth.uid()
      and (
           (sv.scope_type = 'class' and sv.scope_id = c.id)
        or (sv.scope_type = 'grade' and sv.scope_id = c.grade_id)
        or (sv.scope_type = 'stage' and sv.scope_id = g.stage_id)
      )
  );
$$;
grant execute on function public.school_supervises_class(uuid, uuid) to authenticated;

-- الطالبات: الإدارة الكل؛ غيرها نطاق إشرافها فقط.
drop policy if exists school_students_select on public.school_students;
create policy school_students_select on public.school_students for select
  using (public.school_is_admin(school_id) or public.school_supervises_class(school_id, class_id));

-- الحضور: القراءة نطاقيًا؛ والمشرفة ترصد حضور نطاقها (إضافة/تعديل).
drop policy if exists school_att_select on public.school_attendance;
create policy school_att_select on public.school_attendance for select
  using (public.school_is_admin(school_id) or public.school_supervises_class(school_id, class_id));
drop policy if exists school_att_insert on public.school_attendance;
create policy school_att_insert on public.school_attendance for insert
  with check (public.school_can(school_id, 'attendance', 'add', 'class', class_id)
              or public.school_supervises_class(school_id, class_id));
drop policy if exists school_att_update on public.school_attendance;
create policy school_att_update on public.school_attendance for update
  using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
         or public.school_supervises_class(school_id, class_id))
  with check (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
              or public.school_supervises_class(school_id, class_id));
drop policy if exists school_att_delete on public.school_attendance;
create policy school_att_delete on public.school_attendance for delete
  using (public.school_can(school_id, 'attendance', 'edit', 'class', class_id)
         or public.school_supervises_class(school_id, class_id));

-- الملاحظات: تُضاف قراءة/إضافة المشرفة لملاحظات طالبات نطاقها (بجانب الإدارة/الكاتبة).
drop policy if exists school_notes_select on public.school_notes;
create policy school_notes_select on public.school_notes for select
  using (
    public.school_is_admin(school_id)
    or author_id = auth.uid()
    or (target_type = 'student' and exists (
          select 1 from public.school_students s
          where s.id = target_id and public.school_supervises_class(school_id, s.class_id)))
  );
drop policy if exists school_notes_insert on public.school_notes;
create policy school_notes_insert on public.school_notes for insert
  with check (
    author_id = auth.uid() and (
      public.school_is_admin(school_id)
      or (target_type = 'student' and exists (
            select 1 from public.school_students s
            where s.id = target_id and public.school_supervises_class(school_id, s.class_id)))
    )
  );

NOTIFY pgrst, 'reload schema';
select 'school supervisor-scope ready' as ok;
