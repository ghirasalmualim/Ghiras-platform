-- ============================================================================
-- Ghiras workshops (studio) - 2026-10-13. Additive only.
-- Decision: one workshop = a ready presentation the teacher presents inside
-- Ghiras (view only, no download). 5 KWD per workshop for one month; renewal
-- extends the end date.
--   * New table workshop_subscriptions: one row per (teacher, workshop).
--     workshop_key = the workshop template id in the studio.
--   * Read by the teacher herself (the studio reads with her session) and by
--     admins. Written only by the payment function (service_role) and by the
--     admin grant/stop functions (is_admin inside).
--   * payment_orders: adds 'workshop' to the allowed kinds. If this step fails,
--     an existing row has a kind not listed here: stop and report it.
--   * Touches no existing function or policy.
-- Comments in English on purpose: Arabic after "--" breaks text direction
-- inside the Supabase SQL editor.
-- ============================================================================

-- 1) payment_orders: allow the new kind
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('tool','games','studio','game_credits','bundle','att_org','library','workshop'));

-- 2) subscriptions
create table if not exists public.workshop_subscriptions (
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  workshop_key text        not null,
  until        timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, workshop_key)
);
alter table public.workshop_subscriptions enable row level security;
drop policy if exists workshop_subs_read on public.workshop_subscriptions;
create policy workshop_subs_read on public.workshop_subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.workshop_subscriptions from anon;
grant select on public.workshop_subscriptions to authenticated;

-- 3) activation after payment - service_role only
create or replace function public.payment_grant_workshop(p_user uuid, p_key text, p_months int default 1)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(trim(p_key), '') = '' then raise exception 'bad_key'; end if;
  insert into public.workshop_subscriptions as w (user_id, workshop_key, until)
    values (p_user, trim(p_key), now() + make_interval(months => greatest(coalesce(p_months, 1), 1)))
  on conflict (user_id, workshop_key) do update
    set until = greatest(w.until, now()) + make_interval(months => greatest(coalesce(p_months, 1), 1)),
        updated_at = now();
end $$;
revoke all on function public.payment_grant_workshop(uuid, text, int) from public, anon, authenticated;
grant execute on function public.payment_grant_workshop(uuid, text, int) to service_role;

-- 4) manual grant / stop by an admin (e.g. paid by bank transfer)
create or replace function public.admin_grant_workshop(p_user uuid, p_key text, p_months int default 1)
 returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_key), '') = '' then raise exception 'bad_key'; end if;
  insert into public.workshop_subscriptions as w (user_id, workshop_key, until)
    values (p_user, trim(p_key), now() + make_interval(months => greatest(coalesce(p_months, 1), 1)))
  on conflict (user_id, workshop_key) do update
    set until = greatest(w.until, now()) + make_interval(months => greatest(coalesce(p_months, 1), 1)),
        updated_at = now()
  returning until into v_until;
  return v_until;
end $$;

create or replace function public.admin_stop_workshop(p_user uuid, p_key text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.workshop_subscriptions set until = now(), updated_at = now()
   where user_id = p_user and workshop_key = trim(p_key);
end $$;

revoke all on function public.admin_grant_workshop(uuid, text, int) from public, anon;
revoke all on function public.admin_stop_workshop(uuid, text) from public, anon;
grant execute on function public.admin_grant_workshop(uuid, text, int) to authenticated;
grant execute on function public.admin_stop_workshop(uuid, text) to authenticated;

select 'workshops ready' as result;
