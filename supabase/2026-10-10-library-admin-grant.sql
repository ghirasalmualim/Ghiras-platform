-- ============================================================================
-- إهداءُ اشتراكِ مكتبة حصص غراس يدويًّا (الأدمِن) — 2026-10-10. إضافيٌّ بالكامل.
-- دالّتانِ جديدتانِ تتحقّقان من is_admin() داخلهما، وتُنادَيانِ من شاشة الأدمِن
-- في الاستوديو بجلسة الأدمِن. لا تمسّان admin_set_tool ولا admin_grant ولا الدفع.
-- ============================================================================

create or replace function public.admin_grant_library(p_user uuid, p_key text, p_months int default 3)
 returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_key), '') = '' then raise exception 'bad_key'; end if;
  insert into public.library_subscriptions as l (user_id, scope_key, until)
    values (p_user, trim(p_key), now() + make_interval(months => greatest(coalesce(p_months, 3), 1)))
  on conflict (user_id, scope_key) do update
    set until = greatest(l.until, now()) + make_interval(months => greatest(coalesce(p_months, 3), 1)),
        updated_at = now()
  returning until into v_until;
  return v_until;
end $$;

create or replace function public.admin_stop_library(p_user uuid, p_key text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.library_subscriptions set until = now(), updated_at = now()
   where user_id = p_user and scope_key = trim(p_key);
end $$;

revoke all on function public.admin_grant_library(uuid, text, int) from public, anon;
revoke all on function public.admin_stop_library(uuid, text) from public, anon;
grant execute on function public.admin_grant_library(uuid, text, int) to authenticated;
grant execute on function public.admin_stop_library(uuid, text) to authenticated;

select 'library admin grant ready' as result;
