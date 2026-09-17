-- ═══════════════════════════════════════════════════════════════
-- الدفع الإلكتروني عبر MyFatoorah — طبقة معزولة تمامًا.
--
-- ★ لا تمسّ admin_set_tool ولا admin_grant ولا admin_add_lesson_credits ولا
--   لوحة المنح. تنشئ توائم تفعيل تُنفَّذ من **service_role فقط** (عبر Webhook
--   الخادم بعد تأكيد الدفع) — بنفس منطق التمديد الأصلي (greatest+interval)،
--   بلا حارس is_admin (لأن المنفّذ خادمٌ لا أدمِن). التفعيل اليدوي يبقى كما هو.
-- يُنفَّذ مرة على Supabase → SQL Editor. آمن لإعادة التشغيل.
-- ═══════════════════════════════════════════════════════════════

-- 1) جدول طلبات الدفع
create table if not exists public.payment_orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  product_id  text not null,                 -- معرّف المنتج (gradebook, games_subject, studio_5 …)
  kind        text not null check (kind in ('tool','games','studio')),
  tool        text,                          -- kind=tool: مفتاح الأداة
  scope       text,                          -- kind=games: 'subject' | 'grade'
  scope_id    uuid,                           -- kind=games: معرّف المادة/الصف
  months      int,                            -- tool/games
  credits     int,                            -- studio
  amount_kwd  numeric(8,3) not null,
  status      text not null default 'pending' check (status in ('pending','paid','failed','canceled')),
  mf_invoice_id text,
  mf_payment_id text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders(user_id, created_at desc);
create index if not exists payment_orders_mf_idx on public.payment_orders(mf_invoice_id);

alter table public.payment_orders enable row level security;
-- المشترية تقرأ طلباتها؛ الأدمِن الكل. الكتابة للخادم فقط (service_role يتجاوز RLS).
drop policy if exists payment_orders_select on public.payment_orders;
create policy payment_orders_select on public.payment_orders for select
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.payment_orders from anon;
grant select on public.payment_orders to authenticated;

-- 2) توأم تفعيل الأدوات (نفس CASE في admin_set_tool، بلا حارس is_admin) — خادم فقط
create or replace function public.payment_activate_tool(p_user uuid, p_tool text, p_months integer)
 returns text language plpgsql security definer set search_path to 'public' as $$
declare v_col text;
begin
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
    else null end;
  if v_col is null then raise exception 'unknown tool: %', p_tool; end if;
  if p_months is null or p_months <= 0 then raise exception 'invalid months'; end if;
  execute format(
    'update public.profiles set %I = greatest(coalesce(%I, now()), now()) + ($1 || '' months'')::interval where id = $2',
    v_col, v_col
  ) using p_months, p_user;
  return 'activated';
end $$;
revoke all on function public.payment_activate_tool(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.payment_activate_tool(uuid, text, integer) to service_role;

-- 3) توأم منح الألعاب بالنطاق (مادة/صف): يمدّد sub_end + يضيف صلاحية — خادم فقط
create or replace function public.payment_grant_games(p_user uuid, p_scope text, p_scope_id uuid, p_months integer)
 returns text language plpgsql security definer set search_path to 'public' as $$
begin
  if p_scope not in ('subject','grade') then raise exception 'bad scope: %', p_scope; end if;
  if p_scope_id is null then raise exception 'missing scope_id'; end if;
  if p_months is null or p_months <= 0 then raise exception 'invalid months'; end if;
  -- تمديد sub_end (تاريخ) — قابل للتجديد
  update public.profiles
     set sub_end = (greatest(coalesce(sub_end, current_date), current_date) + (p_months || ' months')::interval)::date
   where id = p_user;
  -- صلاحية النطاق (بلا تكرار)
  if p_scope = 'subject' then
    if not exists (select 1 from public.permissions where user_id = p_user and scope = 'subject' and subject_id = p_scope_id) then
      insert into public.permissions(user_id, scope, subject_id) values (p_user, 'subject', p_scope_id);
    end if;
  else
    if not exists (select 1 from public.permissions where user_id = p_user and scope = 'grade' and grade_id = p_scope_id) then
      insert into public.permissions(user_id, scope, grade_id) values (p_user, 'grade', p_scope_id);
    end if;
  end if;
  return 'activated';
end $$;
revoke all on function public.payment_grant_games(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.payment_grant_games(uuid, text, uuid, integer) to service_role;

-- 4) توأم إضافة حصص الستوديو — خادم فقط
create or replace function public.payment_add_credits(p_user uuid, p_count integer)
 returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_new integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 then raise exception 'invalid count'; end if;
  update public.profiles set lesson_credits = coalesce(lesson_credits, 0) + p_count
   where id = p_user returning lesson_credits into v_new;
  if v_new is null then raise exception 'user not found'; end if;
  return v_new;
end $$;
revoke all on function public.payment_add_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.payment_add_credits(uuid, integer) to service_role;

NOTIFY pgrst, 'reload schema';
select 'payments-myfatoorah ready' as ok;
