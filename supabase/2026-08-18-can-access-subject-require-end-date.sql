-- Fix: can_access_subject treated a NULL sub_end as a valid, never-ending
-- subscription (fail-open). A teacher granted a permission row without an end
-- date kept access forever.
--
-- Change: the date check now lives inside the non-admin branch and requires a
-- real end date. Admins keep unconditional access — they legitimately have no
-- sub_end, and putting the check before the admin branch would lock them out.
--
-- Everything else is identical to the definition live in production
-- (captured 2026-08-17). Comments in English on purpose: Arabic text after
-- "--" breaks text direction inside the Supabase SQL editor.
--
-- Verified before running: zero active accounts had a permission row with a
-- NULL sub_end, so no existing subscriber loses access.

CREATE OR REPLACE FUNCTION public.can_access_subject(p_subject uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles pr
    join public.subjects s  on s.id = p_subject
    join public.grades   g  on g.id = s.grade_id
    where pr.id = auth.uid()
      and pr.status = 'active'
      and (
        pr.role = 'admin'
        or (
          pr.sub_end is not null
          and pr.sub_end >= current_date
          and exists (
            select 1 from public.permissions p
            where p.user_id = pr.id and (
              p.scope = 'all'
              or (p.scope = 'stage'   and p.stage_id   = g.stage_id)
              or (p.scope = 'grade'   and p.grade_id   = s.grade_id)
              or (p.scope = 'subject' and p.subject_id = s.id)
            )
          )
        )
      )
  );
$function$;
