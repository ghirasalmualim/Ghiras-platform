-- STAGING BRANCH ONLY. Never run on main.
--
-- Verified against the branch schema on 2026-08-22:
--   stages.id / grades.id / subjects.id : uuid DEFAULT gen_random_uuid()
--   UNIQUE stages(slug)
--   UNIQUE grades(stage_id, slug)
--   UNIQUE subjects(grade_id, slug)
--
-- Slugs match src/lib/types.ts so the app resolves the route:
--   /stage/primary/grade-1/islamic
--
-- Idempotent: ON CONFLICT DO UPDATE (not DO NOTHING) so the CTE still
-- returns a row on a second run.

with s as (
  insert into public.stages (name, slug, sort_order, is_visible)
  values ('المرحلة الابتدائية', 'primary', 1, true)
  on conflict (slug) do update set name = excluded.name
  returning id
), g as (
  insert into public.grades (stage_id, name, slug, sort_order, is_visible)
  select s.id, 'الصف الأول', 'grade-1', 1, true from s
  on conflict (stage_id, slug) do update set name = excluded.name
  returning id
)
insert into public.subjects (grade_id, name, slug, icon, color, sort_order, is_visible)
select g.id, 'التربية الإسلامية', 'islamic', '🕌', '#7A9E7E', 1, true from g
on conflict (grade_id, slug) do update set name = excluded.name;
