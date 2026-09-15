-- ═══════════════════════════════════════════════════════════════
-- «أجندتي» — أجندة المعلّم/ة السحابية (استحقاق مستقل: agenda_until)
--
-- يُنفَّذ مرة واحدة في: Supabase → SQL Editor → New Query.
-- آمن لإعادة التشغيل (idempotent). التعليقات بالإنجليزية لتوجيه محرّر SQL.
-- ⚠️ RLS للجداول الأخرى لا تُمس؛ قائمة admin_set_tool تبقى مغلقة — يُضاف
--    سطر واحد فقط ('agenda'). الصور في Storage (bucket خاص) لا في القاعدة.
-- ═══════════════════════════════════════════════════════════════

-- 1) subscription column on profiles (timestamptz, NULL = no entitlement)
alter table public.profiles
  add column if not exists agenda_until timestamptz;

-- 2) per-user JSON snapshot table (tasks/events/notes/weekly/harvest/achievement-meta).
--    Images themselves live in Storage; only their paths/metadata are in `data`.
create table if not exists public.my_agenda_state (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.my_agenda_state enable row level security;

drop policy if exists my_agenda_state_select on public.my_agenda_state;
create policy my_agenda_state_select on public.my_agenda_state
  for select using (user_id = auth.uid());
drop policy if exists my_agenda_state_insert on public.my_agenda_state;
create policy my_agenda_state_insert on public.my_agenda_state
  for insert with check (user_id = auth.uid());
drop policy if exists my_agenda_state_update on public.my_agenda_state;
create policy my_agenda_state_update on public.my_agenda_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.my_agenda_state from anon;
revoke delete on public.my_agenda_state from authenticated;
grant select, insert, update on public.my_agenda_state to authenticated;

-- 3) private Storage bucket for achievement photos. Each user's files live under
--    a top-level folder named by their user id, and RLS scopes every operation to
--    that folder, so no one can read/write another user's photos. URLs are signed
--    server-side on load (bucket is NOT public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agenda', 'agenda', false, 6291456,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agenda_obj_select on storage.objects;
create policy agenda_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists agenda_obj_insert on storage.objects;
create policy agenda_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists agenda_obj_delete on storage.objects;
create policy agenda_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'agenda' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) admin_set_tool: add 'agenda' to the closed CASE list (full current list kept).
--    Granting extends the existing entitlement, never replaces it — original behavior.
CREATE OR REPLACE FUNCTION public.admin_set_tool(p_user uuid, p_tool text, p_months integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_col text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  v_col := case p_tool
    when 'studio'         then 'studio_until'
    when 'gradebook'      then 'gradebook_until'
    when 'attendance'     then 'attendance_until'
    when 'adventure'      then 'adventure_until'
    when 'multiplication' then 'multiplication_until'
    when 'head_records'   then 'head_records_until'
    when 'workshops'      then 'workshops_until'
    when 'clock'          then 'clock_until'
    when 'gharas_bank'    then 'gharas_bank_until'
    when 'agenda'         then 'agenda_until'
    else null
  end;

  if v_col is null then
    raise exception 'unknown tool: %', p_tool;
  end if;

  if p_months > 0 then
    execute format(
      'update public.profiles set %I = greatest(coalesce(%I, now()), now()) + ($1 || '' months'')::interval where id = $2',
      v_col, v_col
    ) using p_months, p_user;
    return 'granted';
  else
    execute format('update public.profiles set %I = null where id = $1', v_col)
      using p_user;
    return 'revoked';
  end if;
end;
$function$;

select 'my_agenda: table + agenda_until + storage bucket + admin_set_tool ready' as migration_revision;
