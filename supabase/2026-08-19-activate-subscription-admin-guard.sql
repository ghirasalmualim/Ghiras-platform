-- P1 SECURITY FIX: activate_subscription was executable by PUBLIC
-- (anon + authenticated) with NO internal authorization, letting any
-- user self-grant a 6-month subscription (sub_end/status/permissions).
-- Fix: revoke PUBLIC/anon execute, and add an admin-only guard INSIDE
-- the function (is_admin() resolves the caller's real role from
-- profiles via auth.uid() - never a client-supplied role). This is the
-- platform's established pattern (admin_add_game_credits, admin_set_tool).
-- Revoking from authenticated as well would deny admins too (admins are
-- the authenticated role), so authenticated keeps EXECUTE and the
-- is_admin() guard is the actual gate. Body/months/sub_end/permissions
-- logic is byte-identical to the live definition (6 months). Comments
-- in English to keep SQL-editor text direction intact.
-- Zero callers in the app repo; no legitimate caller broken.

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
  -- authorization: admin only, fail closed. is_admin() reads the
  -- caller's role from profiles keyed by auth.uid(); anon -> false.
  if not public.is_admin() then
    raise exception 'activating a subscription requires the admin role';
  end if;

  select scope into v_scope from public.plans where id = p_plan_id;

  update public.profiles
  set status = 'active',
      sub_start = current_date,
      sub_end = current_date + (v_months || ' months')::interval
  where id = p_user_id;

  insert into public.subscriptions
    (user_id, plan_id, starts_at, ends_at, auto_renew, is_active)
  values
    (p_user_id, p_plan_id, current_date,
     current_date + (v_months || ' months')::interval, false, true);

  insert into public.permissions (user_id, scope, grade_id, subject_id)
  values (
    p_user_id,
    v_scope,
    case when v_scope in ('grade','subject') then p_grade_id else null end,
    case when v_scope = 'subject' then p_subject_id else null end
  );
end;
$function$;

revoke execute on function public.activate_subscription(uuid,uuid,uuid,uuid) from public, anon;
grant  execute on function public.activate_subscription(uuid,uuid,uuid,uuid) to authenticated;

select 'P1 activate_subscription admin guard applied' as migration_revision;
