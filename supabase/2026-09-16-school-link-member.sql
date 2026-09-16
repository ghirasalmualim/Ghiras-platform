-- «إدارة المدرسة»: ربط عضو (بالاسم) بحساب حقيقي ليدخل بنفسه. معزول، إضافي.
--   الإدارة تُدخل اسم المستخدم أو الهاتف → تُربط user_id للعضو.
--   ★ يقرأ profiles فقط للبحث (لا يعدّلها) — متوافق مع مبدأ العزل.
--   admin المدرسة فقط. لا يلمس admin_set_tool ولا الاشتراكات.

create or replace function public.school_link_member(p_member uuid, p_identifier text)
 returns table(ok boolean, msg text, linked_name text)
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_school uuid;
  v_uid    uuid;
  v_name   text;
  v_ident  text := trim(p_identifier);
begin
  select school_id into v_school from public.school_members where id = p_member;
  if v_school is null then
    return query select false, 'العضو غير موجود', null::text; return;
  end if;
  if not public.school_is_admin(v_school) then
    return query select false, 'غير مصرّح — الإدارة فقط', null::text; return;
  end if;
  if v_ident is null or v_ident = '' then
    return query select false, 'أدخلي اسم المستخدم أو الهاتف', null::text; return;
  end if;

  -- بحث بالاسم أو الهاتف (تطبيع أرقام الهاتف: إزالة الفراغات/الرموز)
  select id, full_name into v_uid, v_name
  from public.profiles
  where lower(username) = lower(v_ident)
     or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(v_ident, '[^0-9]', '', 'g')
        and regexp_replace(v_ident, '[^0-9]', '', 'g') <> ''
  limit 1;

  if v_uid is null then
    return query select false, 'لا يوجد حساب بهذا الاسم/الهاتف', null::text; return;
  end if;

  -- الحساب مربوط بعضو آخر في نفس المدرسة؟
  if exists (select 1 from public.school_members
             where school_id = v_school and user_id = v_uid and id <> p_member) then
    return query select false, 'هذا الحساب مربوط بعضو آخر في المدرسة', null::text; return;
  end if;

  update public.school_members set user_id = v_uid where id = p_member;
  return query select true, 'تم الربط', v_name;
end;
$$;
grant execute on function public.school_link_member(uuid, text) to authenticated;

-- فكّ الربط (يعود العضو بالاسم فقط)
create or replace function public.school_unlink_member(p_member uuid)
 returns boolean
 language plpgsql security definer set search_path to 'public' as $$
declare v_school uuid;
begin
  select school_id into v_school from public.school_members where id = p_member;
  if v_school is null or not public.school_is_admin(v_school) then
    return false;
  end if;
  update public.school_members set user_id = null where id = p_member;
  return true;
end;
$$;
grant execute on function public.school_unlink_member(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
select 'school link-member ready' as ok;
