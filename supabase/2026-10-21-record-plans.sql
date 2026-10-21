-- ═══════════════════════════════════════════════════════════════
-- باقتا سجل الدرجات وسجل الحضور + شراء السجل الإضافي ذاتيًّا (قرار حصة 2026-10-21)
--   • الباقة الكاملة: ٤ أشهر · ٤ سجلات · ٨ د.ك   • الباقة المختصرة: ٤ أشهر · سجلّان · ٤ د.ك
--   • سجلٌّ إضافيٌّ: ٤ د.ك — يُشترى من المنصّة ويُفعَّل تلقائيًّا، والإدارةُ تضيفه أيضًا
--
-- ⚠️ لا يمسّ payment_activate_tool ولا admin_set_tool ولا admin_grant — دوالٌّ جديدةٌ فقط.
-- يُشغَّل قبل نشر كود المنصّة (الكودُ يتحمّل غيابَه، لكنّ الدفعَ الجديد يحتاجه).
-- ═══════════════════════════════════════════════════════════════

-- ١) الأعمدة: عددُ سجلّات الباقة (NULL = ٤ كالسابق) والإضافيُّ لكلِّ أداة
alter table public.profiles add column if not exists gradebook_base   integer;
alter table public.profiles add column if not exists attendance_base  integer;
alter table public.profiles add column if not exists gradebook_extra  integer not null default 0;
alter table public.profiles add column if not exists attendance_extra integer not null default 0;

-- ٢) تفعيلُ باقةٍ بعددِ سجلّاتها (للدفع — service_role فقط)
--    المدةُ تُمدَّد كالمعتاد. وعددُ السجلّات: إن كان الاشتراكُ منتهيًا يصيرُ عددَ الباقةِ الجديدة،
--    وإن كان ساريًا يبقى الأكبرَ (فمن عندها ٤ وجدّدت بالمختصرة لا تنقص سجلّاتُها في المدة السارية).
create or replace function public.payment_activate_tool_slots(p_user uuid, p_tool text, p_months integer, p_slots integer)
 returns text language plpgsql security definer set search_path to 'public' as $$
begin
  if p_months is null or p_months <= 0 then raise exception 'invalid months'; end if;
  if p_slots is null or p_slots < 1 or p_slots > 50 then raise exception 'invalid slots'; end if;
  if p_tool = 'gradebook' then
    update public.profiles set
      gradebook_base  = case when gradebook_until is not null and gradebook_until > now()
                             then greatest(coalesce(gradebook_base, 4), p_slots) else p_slots end,
      gradebook_until = greatest(coalesce(gradebook_until, now()), now()) + (p_months || ' months')::interval
    where id = p_user;
  elsif p_tool = 'attendance' then
    update public.profiles set
      attendance_base  = case when attendance_until is not null and attendance_until > now()
                              then greatest(coalesce(attendance_base, 4), p_slots) else p_slots end,
      attendance_until = greatest(coalesce(attendance_until, now()), now()) + (p_months || ' months')::interval
    where id = p_user;
  else
    raise exception 'unknown tool: %', p_tool;
  end if;
  if not found then raise exception 'no such user'; end if;
  return 'activated';
end $$;
revoke all on function public.payment_activate_tool_slots(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.payment_activate_tool_slots(uuid, text, integer, integer) to service_role;

-- ٣) سجلٌّ إضافيٌّ مدفوع (service_role فقط) — جمعيٌّ فوق القائم
create or replace function public.payment_add_tool_records(p_user uuid, p_tool text, p_count integer)
 returns integer language plpgsql security definer set search_path to 'public' as $$
declare v integer;
begin
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'invalid count'; end if;
  if p_tool = 'gradebook' then
    update public.profiles set gradebook_extra = coalesce(gradebook_extra, 0) + p_count where id = p_user returning gradebook_extra into v;
  elsif p_tool = 'attendance' then
    update public.profiles set attendance_extra = coalesce(attendance_extra, 0) + p_count where id = p_user returning attendance_extra into v;
  else
    raise exception 'unknown tool: %', p_tool;
  end if;
  if v is null then raise exception 'no such user'; end if;
  return v;
end $$;
revoke all on function public.payment_add_tool_records(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.payment_add_tool_records(uuid, text, integer) to service_role;

-- ٤) منحٌ إداريٌّ للسجلّ الإضافي (لوحة التحكم) — is_admin() فقط، ويقبل السالب للتصحيح
create or replace function public.admin_add_tool_records(p_user uuid, p_tool text, p_count integer)
 returns integer language plpgsql security definer set search_path to 'public' as $$
declare v integer;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_count is null or p_count = 0 or p_count < -20 or p_count > 20 then raise exception 'invalid count'; end if;
  if p_tool = 'gradebook' then
    update public.profiles set gradebook_extra = greatest(coalesce(gradebook_extra, 0) + p_count, 0) where id = p_user returning gradebook_extra into v;
  elsif p_tool = 'attendance' then
    update public.profiles set attendance_extra = greatest(coalesce(attendance_extra, 0) + p_count, 0) where id = p_user returning attendance_extra into v;
  else
    raise exception 'unknown tool: %', p_tool;
  end if;
  return v;
end $$;
revoke all on function public.admin_add_tool_records(uuid, text, integer) from public, anon;
grant execute on function public.admin_add_tool_records(uuid, text, integer) to authenticated;

select 'record plans ready' as result;
