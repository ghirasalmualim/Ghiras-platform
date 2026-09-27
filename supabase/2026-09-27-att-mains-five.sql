-- ============================================================================
-- إدارة الحضور المدرسية — رفعُ عددِ المسؤولاتِ الرئيسيات إلى **خمس** (قرار حصة 2026-09-27).
--
-- المنشئة (owner) + أربعٌ غيرُها = خمس رئيسيات. كان الحدُّ ثلاثًا (المنشئة + ٢).
-- الملفُ يُعيدُ تعريفَ دالةٍ واحدةٍ فقط (att_add_member) بنصِّها الكاملِ حرفًا بحرفٍ
-- من مايجريشن 2026-09-22، ولم يتغيرّ فيها سوى الرقمُ (2 ← 4) ونصُّ الرسالة.
-- لا تمسُّ أيَّ دالّةٍ أخرى ولا أيَّ جدولٍ ولا سياسة (ولا علاقةَ لها بالمنح admin_*).
-- ============================================================================

create or replace function public.att_add_member(
  p_school uuid, p_identifier text, p_kind text,
  p_grades uuid[] default '{}', p_classes uuid[] default '{}', p_title text default null
) returns table(ok boolean, msg text, member_id uuid, member_name text)
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid; v_uid uuid; v_name text; v_mid uuid; v_mains int;
  v_ident text := trim(coalesce(p_identifier,''));
  g uuid; m text; a text;
begin
  if not public.school_is_admin(p_school) then
    return query select false, 'غير مصرّح — المسؤولة الرئيسية فقط', null::uuid, null::text; return;
  end if;
  select owner_id into v_owner from public.schools where id = p_school and att_org;
  if v_owner is null then
    return query select false, 'الإدارة غير موجودة', null::uuid, null::text; return;
  end if;
  if p_kind not in ('main','grade') then
    return query select false, 'نوع غير صالح', null::uuid, null::text; return;
  end if;
  if v_ident = '' then
    return query select false, 'أدخلي رقم الهاتف', null::uuid, null::text; return;
  end if;

  select id, full_name into v_uid, v_name from public.profiles
   where lower(username) = lower(v_ident)
      or (regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(v_ident, '[^0-9]', '', 'g')
          and regexp_replace(v_ident, '[^0-9]', '', 'g') <> '')
   limit 1;
  if v_uid is null then
    return query select false, 'لا يوجد حساب بهذا الرقم — تسجّل المسؤولة في غراس أولًا (مجانًا)', null::uuid, null::text; return;
  end if;
  if v_uid = v_owner then
    return query select false, 'هذه المنشئة — مسؤولة رئيسية أصلًا', null::uuid, null::text; return;
  end if;

  if p_kind = 'main' then
    select count(*) into v_mains from public.school_members
     where school_id = p_school and role in ('admin','principal','deputy')
       and user_id is distinct from v_owner and user_id is distinct from v_uid;
    if v_mains >= 4 then
      return query select false, 'الحدّ الأقصى خمس رئيسيات (المنشئة + أربع)', null::uuid, null::text; return;
    end if;
  end if;

  select id into v_mid from public.school_members where school_id = p_school and user_id = v_uid;
  if v_mid is null then
    insert into public.school_members(school_id, user_id, role, title)
      values (p_school, v_uid, case when p_kind='main' then 'admin' else 'supervisor' end,
              coalesce(nullif(trim(p_title),''), case when p_kind='main' then 'مسؤولة رئيسية' else 'مسؤولة صف' end))
      returning id into v_mid;
  else
    update public.school_members
       set role = case when p_kind='main' then 'admin' else 'supervisor' end,
           title = coalesce(nullif(trim(p_title),''), title)
     where id = v_mid;
  end if;

  -- نطاق مسؤولة الصف: حضور + طالبات (عرض/إضافة/تعديل) على الصفوف/الفصول المحدّدة
  delete from public.school_permissions
   where school_id = p_school and user_id = v_uid and module in ('attendance','students');
  if p_kind = 'grade' then
    foreach m in array array['attendance','students'] loop
      foreach a in array array['view','add','edit'] loop
        foreach g in array coalesce(p_grades,'{}') loop
          if exists (select 1 from public.school_grades where id = g and school_id = p_school) then
            insert into public.school_permissions(school_id, user_id, module, action, scope_type, scope_id)
              values (p_school, v_uid, m, a, 'grade', g);
          end if;
        end loop;
        foreach g in array coalesce(p_classes,'{}') loop
          if exists (select 1 from public.school_classes where id = g and school_id = p_school) then
            insert into public.school_permissions(school_id, user_id, module, action, scope_type, scope_id)
              values (p_school, v_uid, m, a, 'class', g);
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  insert into public.school_audit_log(school_id, actor_id, action, entity_type, entity_id, detail)
    values (p_school, auth.uid(), 'att.member', 'member', v_mid,
            jsonb_build_object('name', v_name, 'kind', p_kind, 'grades', p_grades, 'classes', p_classes));
  return query select true, 'تمت الإضافة', v_mid, v_name;
end $$;

revoke all on function public.att_add_member(uuid, text, text, uuid[], uuid[], text) from public, anon;
grant execute on function public.att_add_member(uuid, text, text, uuid[], uuid[], text) to authenticated;
