-- «إدارة المدرسة»: رصد الملاحظات (معزول، إضافي).
--   ملاحظة على طالبة (سلوك/متابعة) أو على معلمة (متابعة أداء).
--   target_type: 'student' → school_students.id | 'member' → school_members.id
--   الكاتبة = الحساب المسجِّل (author_id). الخصوصية: الإدارة أو كاتبة الملاحظة فقط
--   تقرأ عبر RLS؛ قراءة المشرفة ضمن نطاقها تُضاف لاحقًا بدالة نطاق (خطوة ٣).
create table if not exists public.school_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('student','member')),
  target_id   uuid not null,
  target_name text,                       -- اسم الطالبة/المعلمة وقت الرصد (للعرض)
  category    text,                       -- سلوك / متابعة / عام …
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists school_notes_idx on public.school_notes(school_id, target_type, target_id);

alter table public.school_notes enable row level security;

-- القراءة: الإدارة أو كاتبة الملاحظة (خصوصية). المشرفة ضمن نطاقها تُضاف بدالة لاحقًا.
drop policy if exists school_notes_select on public.school_notes;
create policy school_notes_select on public.school_notes for select
  using (public.school_is_admin(school_id) or author_id = auth.uid());
-- الإضافة: الإدارة (المشرفة تُضاف بدالة نطاق لاحقًا)؛ الكاتبة = نفسها.
drop policy if exists school_notes_insert on public.school_notes;
create policy school_notes_insert on public.school_notes for insert
  with check (public.school_is_admin(school_id) and author_id = auth.uid());
-- التعديل/الحذف: الإدارة أو الكاتبة.
drop policy if exists school_notes_update on public.school_notes;
create policy school_notes_update on public.school_notes for update
  using (public.school_is_admin(school_id) or author_id = auth.uid())
  with check (public.school_is_admin(school_id) or author_id = auth.uid());
drop policy if exists school_notes_delete on public.school_notes;
create policy school_notes_delete on public.school_notes for delete
  using (public.school_is_admin(school_id) or author_id = auth.uid());

revoke all on public.school_notes from anon;
grant select, insert, update, delete on public.school_notes to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_notes ready' as ok;
