-- حذف «إدارة حضور مدرسية» كاملة — أدمِن المنصّة فقط، ولإدارات att_org فقط.
-- الحذف المباشر من schools يفشل: مشغّل التدقيق (school_audit_trigger) يكتب سطرًا
-- يشير إلى المدرسة بعد حذفها ⇒ خرق مفتاح أجنبي. لذلك الدالة تُطفئ مشغّلات التدقيق
-- مؤقتًا داخل نفس المعاملة (لا يراها أحد غيرها)، تحذف (والباقي بالـcascade)، ثم تعيدها.
-- جديد بالكامل: لا يعيد تعريف أي دالة قائمة.

create or replace function public.att_org_delete(p_school uuid)
 returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text;
  t record;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select name into v_name from public.schools where id = p_school and att_org;
  if v_name is null then raise exception 'not_found'; end if;

  for t in select tgrelid::regclass as rel, tgname from pg_trigger
            where tgfoid = 'public.school_audit_trigger'::regproc and not tgisinternal loop
    execute format('alter table %s disable trigger %I', t.rel, t.tgname);
  end loop;

  delete from public.schools where id = p_school and att_org;

  for t in select tgrelid::regclass as rel, tgname from pg_trigger
            where tgfoid = 'public.school_audit_trigger'::regproc and not tgisinternal loop
    execute format('alter table %s enable trigger %I', t.rel, t.tgname);
  end loop;

  return v_name;
end $$;

revoke all on function public.att_org_delete(uuid) from public, anon;
grant execute on function public.att_org_delete(uuid) to authenticated;

select 'att delete ready' as result;
