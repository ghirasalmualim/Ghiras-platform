-- ═══════════════════════════════════════════════════════════════
-- منتجُ «ألعاب غراس التفاعلية» — ٣ ألعابٍ بدينارَيْنِ مرّةً واحدة.
--
-- ★ لا يمسُّ admin_add_game_credits ولا admin_set_tool ولا admin_grant.
--   يضيفُ نوعَ طلبٍ جديدًا (game_credits) ودالّةَ تفعيلٍ جديدةً تُنفَّذُ
--   من service_role فقط (Webhook الدفع). المنحُ اليدويُّ يبقى كما هو.
--
-- الرصيدُ عددٌ دائمٌ لا مدةَ له، والخصمُ يبقى حصرًا في consume_game_credit
-- عند تثبيتِ لعبةٍ جديدة — هذه الدالّةُ إضافةٌ جمعيّةٌ فقط (ADDITIVE).
--
-- يُنفَّذُ مرّةً على Supabase → SQL Editor. آمنٌ لإعادةِ التشغيل.
-- ═══════════════════════════════════════════════════════════════

-- 1) توسيعُ قيدِ الأنواعِ في payment_orders ليقبلَ 'game_credits'
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('tool','games','studio','game_credits'));

-- 2) دالّةُ تفعيلٍ جديدةٌ — خادمٌ فقط
create or replace function public.payment_add_game_credits(p_user uuid, p_count integer)
 returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_new integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 then raise exception 'invalid count'; end if;
  update public.profiles set game_credits = coalesce(game_credits, 0) + p_count
   where id = p_user returning game_credits into v_new;
  if v_new is null then raise exception 'user not found'; end if;
  return v_new;
end $$;
revoke all on function public.payment_add_game_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.payment_add_game_credits(uuid, integer) to service_role;

NOTIFY pgrst, 'reload schema';

-- 3) التحقّق: يجبُ أن يرجعَ صفّانِ — القيدُ الجديدُ والدالّةُ الجديدة
select 'kind check' as "البند", pg_get_constraintdef(oid) as "القيمة"
  from pg_constraint where conname = 'payment_orders_kind_check'
union all
select 'payment_add_game_credits', 'موجودة'
  from pg_proc where proname = 'payment_add_game_credits';
