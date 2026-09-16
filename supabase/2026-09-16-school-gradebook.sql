-- «إدارة المدرسة»: سجل الدرجات لكل معلمة (معزول، إضافي).
--   • school_grade_items: عمود تقييم (اختبار/واجب/مشاركة…) تملكه معلمة لمادة×فصل.
--   • school_grade_scores: درجة طالبة في تقييم (واحدة لكل تقييم×طالبة).
--   الخصوصية: المعلمة تدير سجلها فقط؛ الإدارة تشوف الكل؛ رئيسة الشعبة تشوف
--   تقييمات مواد شعبتها (متابعة). لا يمسّ أي كائن خارج الوحدة.

-- هل member يخص المستخدمة الحالية؟ (حسابها مربوط)
create or replace function public.school_is_my_member(p_school uuid, p_member uuid)
 returns boolean language sql security definer set search_path to 'public' stable as $$
  select exists (
    select 1 from public.school_members m
    where m.id = p_member and m.school_id = p_school and m.user_id = auth.uid()
  );
$$;
grant execute on function public.school_is_my_member(uuid, uuid) to authenticated;

create table if not exists public.school_grade_items (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  member_id  uuid not null references public.school_members(id) on delete cascade,
  subject_id uuid not null references public.school_subjects(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  name       text not null,
  max_score  numeric not null default 100,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_grade_items_idx on public.school_grade_items(school_id, member_id, class_id, subject_id);

create table if not exists public.school_grade_scores (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  item_id    uuid not null references public.school_grade_items(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete cascade,
  score      numeric,
  created_at timestamptz not null default now(),
  unique (item_id, student_id)
);
create index if not exists school_grade_scores_idx on public.school_grade_scores(item_id);

alter table public.school_grade_items  enable row level security;
alter table public.school_grade_scores enable row level security;

-- التقييمات (الأعمدة). القراءة: الإدارة + المعلمة صاحبته + رئيسة الشعبة +
--   المشرفة على نطاق فصله + كل مسؤولة مُنِحت صلاحية عرض الدرجات (بنطاقها).
drop policy if exists school_gitems_select on public.school_grade_items;
create policy school_gitems_select on public.school_grade_items for select
  using (public.school_is_admin(school_id)
         or public.school_is_my_member(school_id, member_id)
         or public.school_coordinates_subject(school_id, subject_id)
         or public.school_supervises_class(school_id, class_id)
         or public.school_can(school_id, 'grades', 'view', 'class', class_id));
drop policy if exists school_gitems_ins on public.school_grade_items;
create policy school_gitems_ins on public.school_grade_items for insert
  with check (public.school_is_admin(school_id) or public.school_is_my_member(school_id, member_id));
drop policy if exists school_gitems_upd on public.school_grade_items;
create policy school_gitems_upd on public.school_grade_items for update
  using (public.school_is_admin(school_id) or public.school_is_my_member(school_id, member_id))
  with check (public.school_is_admin(school_id) or public.school_is_my_member(school_id, member_id));
drop policy if exists school_gitems_del on public.school_grade_items;
create policy school_gitems_del on public.school_grade_items for delete
  using (public.school_is_admin(school_id) or public.school_is_my_member(school_id, member_id));

-- الدرجات (الخلايا) — تتبع صلاحية التقييم الأب
drop policy if exists school_gscores_select on public.school_grade_scores;
create policy school_gscores_select on public.school_grade_scores for select
  using (exists (select 1 from public.school_grade_items gi where gi.id = item_id
                 and (public.school_is_admin(gi.school_id)
                      or public.school_is_my_member(gi.school_id, gi.member_id)
                      or public.school_coordinates_subject(gi.school_id, gi.subject_id)
                      or public.school_supervises_class(gi.school_id, gi.class_id)
                      or public.school_can(gi.school_id, 'grades', 'view', 'class', gi.class_id))));
drop policy if exists school_gscores_ins on public.school_grade_scores;
create policy school_gscores_ins on public.school_grade_scores for insert
  with check (exists (select 1 from public.school_grade_items gi where gi.id = item_id
                      and (public.school_is_admin(gi.school_id) or public.school_is_my_member(gi.school_id, gi.member_id))));
drop policy if exists school_gscores_upd on public.school_grade_scores;
create policy school_gscores_upd on public.school_grade_scores for update
  using (exists (select 1 from public.school_grade_items gi where gi.id = item_id
                 and (public.school_is_admin(gi.school_id) or public.school_is_my_member(gi.school_id, gi.member_id))))
  with check (exists (select 1 from public.school_grade_items gi where gi.id = item_id
                      and (public.school_is_admin(gi.school_id) or public.school_is_my_member(gi.school_id, gi.member_id))));
drop policy if exists school_gscores_del on public.school_grade_scores;
create policy school_gscores_del on public.school_grade_scores for delete
  using (exists (select 1 from public.school_grade_items gi where gi.id = item_id
                 and (public.school_is_admin(gi.school_id) or public.school_is_my_member(gi.school_id, gi.member_id))));

revoke all on public.school_grade_items, public.school_grade_scores from anon;
grant select, insert, update, delete on public.school_grade_items, public.school_grade_scores to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school_gradebook ready' as ok;
