-- حماية أعمدة الاشتراك في schools من التعديل المباشر.
-- سياسة schools_update تسمح لمدير المدرسة بتحديث صفّها، فبدون هذا الحارس تستطيع
-- المالكة تمديد att_until أو رفع att_classes أو إطفاء att_org بطلب مباشر من المتصفح.
-- الحارس: هذه الأعمدة لا يغيّرها إلا أدمِن المنصّة (دوال التفعيل تعمل بهوية الأدمِن).
-- جديد بالكامل: لا يعيد تعريف أي دالة قائمة.

create or replace function public.schools_protect_subscription()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.is_admin() then return new; end if;
  if new.att_until          is distinct from old.att_until
  or new.att_classes        is distinct from old.att_classes
  or new.att_org            is distinct from old.att_org
  or new.subscription_until is distinct from old.subscription_until
  or new.owner_id           is distinct from old.owner_id then
    raise exception 'forbidden_subscription_change';
  end if;
  return new;
end $$;

revoke all on function public.schools_protect_subscription() from public, anon, authenticated;

drop trigger if exists trg_schools_protect_subscription on public.schools;
create trigger trg_schools_protect_subscription before update on public.schools
  for each row execute function public.schools_protect_subscription();

select 'schools protected' as result;
