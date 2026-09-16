-- «إدارة المدرسة»: منسقة المادة / رئيسة الشعبة (معزول).
--   رئيسة الشعبة = school_departments.head_member_id. نطاقها = شعبتها:
--   تدير مواد شعبتها وتوزيعها وحصص جدولها. تُضاف بجانب الإدارة في سياسات
--   subjects/teaching/timetable_entries. ★ يعدّل سياسات جداولنا فقط.

-- هل المستخدمة الحالية رئيسة هذه الشعبة؟
create or replace function public.school_heads_department(p_school uuid, p_dept uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1 from public.school_departments d
    join public.school_members m on m.id = d.head_member_id
    where d.id = p_dept and d.school_id = p_school and m.user_id = auth.uid()
  );
$$;
grant execute on function public.school_heads_department(uuid, uuid) to authenticated;

-- هل تنسّق المستخدمة الحالية هذه المادة؟ (مادة تتبع شعبة تَرأسها)
create or replace function public.school_coordinates_subject(p_school uuid, p_subject uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1 from public.school_subjects su
    where su.id = p_subject and su.school_id = p_school
      and su.department_id is not null
      and public.school_heads_department(p_school, su.department_id)
  );
$$;
grant execute on function public.school_coordinates_subject(uuid, uuid) to authenticated;

-- المواد: رئيسة الشعبة تدير مواد شعبتها.
drop policy if exists school_subjects_insert on public.school_subjects;
create policy school_subjects_insert on public.school_subjects for insert
  with check (public.school_is_admin(school_id)
              or (department_id is not null and public.school_heads_department(school_id, department_id)));
drop policy if exists school_subjects_update on public.school_subjects;
create policy school_subjects_update on public.school_subjects for update
  using (public.school_is_admin(school_id)
         or (department_id is not null and public.school_heads_department(school_id, department_id)))
  with check (public.school_is_admin(school_id)
              or (department_id is not null and public.school_heads_department(school_id, department_id)));
drop policy if exists school_subjects_delete on public.school_subjects;
create policy school_subjects_delete on public.school_subjects for delete
  using (public.school_is_admin(school_id)
         or (department_id is not null and public.school_heads_department(school_id, department_id)));

-- التوزيع: رئيسة الشعبة توزّع مواد شعبتها.
drop policy if exists school_teaching_insert on public.school_teaching;
create policy school_teaching_insert on public.school_teaching for insert
  with check (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));
drop policy if exists school_teaching_update on public.school_teaching;
create policy school_teaching_update on public.school_teaching for update
  using (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id))
  with check (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));
drop policy if exists school_teaching_delete on public.school_teaching;
create policy school_teaching_delete on public.school_teaching for delete
  using (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));

-- حصص الجدول: رئيسة الشعبة تدير حصص مواد شعبتها.
drop policy if exists school_tt_insert on public.school_timetable_entries;
create policy school_tt_insert on public.school_timetable_entries for insert
  with check (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));
drop policy if exists school_tt_update on public.school_timetable_entries;
create policy school_tt_update on public.school_timetable_entries for update
  using (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id))
  with check (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));
drop policy if exists school_tt_delete on public.school_timetable_entries;
create policy school_tt_delete on public.school_timetable_entries for delete
  using (public.school_is_admin(school_id) or public.school_coordinates_subject(school_id, subject_id));

NOTIFY pgrst, 'reload schema';
select 'school coordinator ready' as ok;
