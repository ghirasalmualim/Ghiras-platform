-- «إدارة المدرسة»: الإشراف الإداري (معزول، إضافي).
--   تعيين معلمة (بالاسم، بلا حساب) مشرفةً على نطاق: مرحلة / صف / فصل.
--   سجلٌّ تنظيمي أولًا (مَن تُشرف على ماذا). التقييد الفعلي عند تسجيل الدخول
--   يُفعَّل لاحقًا عند ربط حساب المعلمة (يُنسَخ إلى school_permissions).
--   لا يلمس school_permissions ولا أي كائن قائم — جدول جديد بالكامل.
create table if not exists public.school_supervisions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  member_id  uuid not null references public.school_members(id) on delete cascade,
  scope_type text not null check (scope_type in ('stage','grade','class')),
  scope_id   uuid not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (school_id, member_id, scope_type, scope_id)
);
create index if not exists school_supervisions_idx on public.school_supervisions(school_id);

alter table public.school_supervisions enable row level security;

-- الأعضاء يقرؤون؛ الإدارة تدير.
drop policy if exists school_superv_select on public.school_supervisions;
create policy school_superv_select on public.school_supervisions for select using (public.school_is_member(school_id));
drop policy if exists school_superv_ins on public.school_supervisions;
create policy school_superv_ins on public.school_supervisions for insert with check (public.school_is_admin(school_id));
drop policy if exists school_superv_upd on public.school_supervisions;
create policy school_superv_upd on public.school_supervisions for update using (public.school_is_admin(school_id)) with check (public.school_is_admin(school_id));
drop policy if exists school_superv_del on public.school_supervisions;
create policy school_superv_del on public.school_supervisions for delete using (public.school_is_admin(school_id));

revoke all on public.school_supervisions from anon;
grant select, insert, update, delete on public.school_supervisions to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_supervisions ready' as ok;
