-- ============================================================================
-- إدارة الحضور المدرسية بالدفع الأونلاين (السلّة) — 2026-10-10.
-- قرار حصة: ٤ د.ك لكل فصل، أقلّ اشتراك ١٠ فصول، ٤ أشهر قابلة للتجديد.
--
-- ⚠️ قُرئ التعريفُ الحيُّ لـschools_protect_subscription قبل كتابة هذا الملف
--    (2026-10-10) وطابقَ supabase/2026-09-23-schools-protect-subscription.sql حرفيًّا.
--    التعديلُ الوحيدُ عليه: سطرٌ يسمحُ لمفتاحِ الخدمة (service_role) — وهو مسارُ
--    الدفعِ وحدَه — كما يُسمَح للأدمِن. المتصفّحُ لا يحملُ هذا الدور أبدًا.
-- لا يمسّ admin_set_tool ولا admin_grant ولا att_org_set_subscription (يبقى للأدمِن).
-- ============================================================================

-- 1) payment_orders: نوعُ طلبٍ جديد + عددُ الفصول
alter table public.payment_orders add column if not exists qty int;
alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('tool','games','studio','game_credits','bundle','att_org'));

-- 2) الحارس: نفسُ التعريفِ الحيّ + سماحٌ لمسارِ الدفع (service_role)
create or replace function public.schools_protect_subscription()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.is_admin() then return new; end if;
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.att_until          is distinct from old.att_until
  or new.att_classes        is distinct from old.att_classes
  or new.att_org            is distinct from old.att_org
  or new.subscription_until is distinct from old.subscription_until
  or new.owner_id           is distinct from old.owner_id then
    raise exception 'forbidden_subscription_change';
  end if;
  return new;
end $$;

-- 3) دالّةُ التفعيلِ بعد الدفع — لمفتاحِ الخدمةِ وحدَه
create or replace function public.payment_att_org(p_user uuid, p_school uuid, p_classes int, p_months int default 4)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(p_classes, 0) < 10 then raise exception 'min_10_classes'; end if;
  -- المشترية يجب أن تكون مالكةَ المدرسة أو من إدارتِها (نفسُ شرطِ school_is_admin بلا auth.uid)
  if not exists (
    select 1 from public.schools s
     where s.id = p_school and s.att_org
       and (s.owner_id = p_user
            or exists (select 1 from public.school_members m
                        where m.school_id = s.id and m.user_id = p_user
                          and m.role in ('admin','principal','deputy')))
  ) then
    raise exception 'not_school_admin';
  end if;
  update public.schools s
     set att_classes = p_classes,
         att_until   = (case when s.att_until is not null and s.att_until > now() then s.att_until else now() end)
                       + make_interval(months => greatest(coalesce(p_months, 4), 1)),
         updated_at  = now()
   where s.id = p_school;
end $$;

revoke all on function public.payment_att_org(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.payment_att_org(uuid, uuid, int, int) to service_role;

select 'att_org payments ready' as result;
