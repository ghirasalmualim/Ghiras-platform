-- ============================================================================
-- اشتراكُ مكتبة حصص غراس (الاستوديو) — 2026-10-10. إضافيٌّ بالكامل.
-- قرار حصة: ٢٥ د.ك لمادةٍ في صفٍّ واحد، ٣ أشهر، تجديدٌ يُضاف للمدة.
--   • جدولٌ جديد library_subscriptions: صفٌّ لكل (معلمة، مادة-صف). المفتاحُ نصّيّ
--     «مرحلة|صف|مادة» يولّده الاستوديو من شجرة المنهج.
--   • تقرؤه المعلمة لنفسها (الاستوديو يقرأ بجلستها) والأدمِن؛ ولا يكتبه أحدٌ إلا
--     دالّةُ الدفع (service_role).
--   • لا يمسّ أيَّ دالةٍ أو سياسةٍ قائمة.
-- ============================================================================

-- 1) payment_orders: مفتاحُ المادة + نوعُ الطلب
alter table public.payment_orders add column if not exists scope_key text;
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('tool','games','studio','game_credits','bundle','att_org','library'));

-- 2) الاشتراكات
create table if not exists public.library_subscriptions (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  scope_key  text        not null,
  until      timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_key)
);
alter table public.library_subscriptions enable row level security;
drop policy if exists library_subs_read on public.library_subscriptions;
create policy library_subs_read on public.library_subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.library_subscriptions from anon;
grant select on public.library_subscriptions to authenticated;

-- 3) التفعيلُ بعد الدفع — لمفتاحِ الخدمةِ وحدَه
create or replace function public.payment_grant_library(p_user uuid, p_key text, p_months int default 3)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(trim(p_key), '') = '' then raise exception 'bad_key'; end if;
  insert into public.library_subscriptions as l (user_id, scope_key, until)
    values (p_user, trim(p_key), now() + make_interval(months => greatest(coalesce(p_months, 3), 1)))
  on conflict (user_id, scope_key) do update
    set until = greatest(l.until, now()) + make_interval(months => greatest(coalesce(p_months, 3), 1)),
        updated_at = now();
end $$;

revoke all on function public.payment_grant_library(uuid, text, int) from public, anon, authenticated;
grant execute on function public.payment_grant_library(uuid, text, int) to service_role;

select 'library subscriptions ready' as result;
