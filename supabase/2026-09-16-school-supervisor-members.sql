-- «إدارة المدرسة»: متابعة المعلمات للمشرفة (معزول).
--   المشرفة تتابع المعلمات اللاتي يُدرِّسن في نطاق إشرافها (عبر school_teaching):
--   قراءة/رصد ملاحظات عليهنّ. يُبنى فوق school_supervises_class.
--   ★ يعدّل سياسات school_notes فقط.

create or replace function public.school_supervises_member(p_school uuid, p_member uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1 from public.school_teaching t
    where t.school_id = p_school and t.member_id = p_member
      and public.school_supervises_class(p_school, t.class_id)
  );
$$;
grant execute on function public.school_supervises_member(uuid, uuid) to authenticated;

-- الملاحظات: تُضاف للمشرفة قراءة/إضافة ملاحظات المعلمات ضمن نطاقها.
drop policy if exists school_notes_select on public.school_notes;
create policy school_notes_select on public.school_notes for select
  using (
    public.school_is_admin(school_id)
    or author_id = auth.uid()
    or (target_type = 'student' and exists (
          select 1 from public.school_students s
          where s.id = target_id and public.school_supervises_class(school_id, s.class_id)))
    or (target_type = 'member' and public.school_supervises_member(school_id, target_id))
  );
drop policy if exists school_notes_insert on public.school_notes;
create policy school_notes_insert on public.school_notes for insert
  with check (
    author_id = auth.uid() and (
      public.school_is_admin(school_id)
      or (target_type = 'student' and exists (
            select 1 from public.school_students s
            where s.id = target_id and public.school_supervises_class(school_id, s.class_id)))
      or (target_type = 'member' and public.school_supervises_member(school_id, target_id))
    )
  );

NOTIFY pgrst, 'reload schema';
select 'school supervisor-members ready' as ok;
