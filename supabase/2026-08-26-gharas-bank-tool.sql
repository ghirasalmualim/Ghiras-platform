-- ═══════════════════════════════════════════════════════════════
-- «بنك غراس» منتجًا مدفوعًا: اشتراك ٦ أشهر بثمانية دنانير
-- (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة — قبل دمج الكود إلى main)
--
-- الدالة أدناه هي النسخة الحرفية المطبقة على الإنتاج (حتى clock)
-- + حالة واحدة جديدة. المنح الافتراضي ٦ أشهر يطابق مدة المنتج.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists gharas_bank_until timestamptz;

CREATE OR REPLACE FUNCTION public.admin_set_tool(p_user uuid, p_tool text, p_months integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_col text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

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
    else null
  end;

  if v_col is null then
    raise exception 'unknown tool: %', p_tool;
  end if;

  if p_months > 0 then
    execute format(
      'update public.profiles set %I = greatest(coalesce(%I, now()), now()) + ($1 || '' months'')::interval where id = $2',
      v_col, v_col
    ) using p_months, p_user;
    return 'granted';
  else
    execute format('update public.profiles set %I = null where id = $1', v_col)
      using p_user;
    return 'revoked';
  end if;
end;
$function$;
