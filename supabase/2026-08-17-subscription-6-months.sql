-- Fix: activate_subscription granted 5 months instead of the agreed 6.
-- Only v_months changed (5 -> 6). Everything else is identical to the
-- definition currently live in production (captured 2026-08-17).
-- Comments kept in English on purpose: Arabic text after "--" breaks
-- text direction inside the Supabase SQL editor.
--
-- Scope: affects FUTURE activations only. Subscribers already activated
-- keep the sub_end that was written for them at the time.

CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_grade_id uuid DEFAULT NULL::uuid,
  p_subject_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope scope_type;
  v_months int := 6;
begin
  select scope into v_scope from public.plans where id = p_plan_id;

  -- activate the account and set the subscription window
  update public.profiles
  set status = 'active',
      sub_start = current_date,
      sub_end = current_date + (v_months || ' months')::interval
  where id = p_user_id;

  -- create the subscription row
  insert into public.subscriptions
    (user_id, plan_id, starts_at, ends_at, auto_renew, is_active)
  values
    (p_user_id, p_plan_id, current_date,
     current_date + (v_months || ' months')::interval, false, true);

  -- create the permission matching the plan scope
  insert into public.permissions (user_id, scope, grade_id, subject_id)
  values (
    p_user_id,
    v_scope,
    case when v_scope in ('grade','subject') then p_grade_id else null end,
    case when v_scope = 'subject' then p_subject_id else null end
  );
end;
$function$;
