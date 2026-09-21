-- ═══════════════════════════════════════════════════════════════
-- «باقة المعلم» — ٣٠ د.ك.
--   أربعُ أدواتٍ ٤ أشهر: بنك غراس · سجل الحضور الذكي · سجل الدرجات الذكي · أجندتي
--   + حصّةُ استوديو واحدة (lesson_credits +1)
--   + هديّةٌ مفاجئة: رصيدُ لعبةٍ واحدة من ألعاب غراس التفاعلية (game_credits +1)
--
-- ★ لا يمسُّ admin_set_tool ولا admin_grant ولا payment_activate_tool ولا أيَّ
--   دالّةٍ قائمة: نوعُ طلبٍ جديد (bundle) ودالّةٌ جديدةٌ من service_role فقط.
--
-- ★ دالّةٌ واحدةٌ ذرّيةٌ لا ستُّ نداءات: التحديثُ كلُّه في جملةٍ واحدةٍ فإمّا
--   تُفعَّلُ الباقةُ كاملةً أو لا شيء — فلا يبقى طلبٌ مدفوعٌ نصفَ مُفعَّل.
--
-- ★ التمديدُ لا القصّ: من عندها أداةٌ ساريةٌ تُضافُ الأشهرُ الأربعةُ فوقَ
--   تاريخِها — نفسُ تعبيرِ payment_activate_tool حرفًا.
--
-- يُنفَّذُ مرّةً على Supabase → SQL Editor. آمنٌ لإعادةِ التشغيل.
-- ═══════════════════════════════════════════════════════════════

-- 1) توسيعُ قيدِ الأنواعِ ليقبلَ 'bundle'
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('tool','games','studio','game_credits','bundle'));

-- 2) دالّةُ تفعيلِ الباقة — خادمٌ فقط
create or replace function public.payment_activate_teacher_pack(p_user uuid)
 returns text language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  update public.profiles set
    gharas_bank_until = greatest(coalesce(gharas_bank_until, now()), now()) + interval '4 months',
    attendance_until  = greatest(coalesce(attendance_until,  now()), now()) + interval '4 months',
    gradebook_until   = greatest(coalesce(gradebook_until,   now()), now()) + interval '4 months',
    agenda_until      = greatest(coalesce(agenda_until,      now()), now()) + interval '4 months',
    lesson_credits    = coalesce(lesson_credits, 0) + 1,
    game_credits      = coalesce(game_credits,   0) + 1
  where id = p_user
  returning id into v_id;
  if v_id is null then raise exception 'user not found'; end if;
  return 'activated';
end $$;
revoke all on function public.payment_activate_teacher_pack(uuid) from public, anon, authenticated;
grant execute on function public.payment_activate_teacher_pack(uuid) to service_role;

NOTIFY pgrst, 'reload schema';

-- 3) التحقّق: صفّان — القيدُ وفيه bundle، والدالّةُ موجودة
select 'kind check' as "البند", pg_get_constraintdef(oid) as "القيمة"
  from pg_constraint where conname = 'payment_orders_kind_check'
union all
select 'payment_activate_teacher_pack', 'موجودة'
  from pg_proc where proname = 'payment_activate_teacher_pack';
