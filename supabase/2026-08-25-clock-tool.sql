-- ═══════════════════════════════════════════════════════════════
-- «الساعة التفاعلية» — الاستحقاق التاسع (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة)
--
-- ⚠️ RLS لا تُمس، وconsume_game_credit لا تُمس، وقائمة الأدوات المسموحة
-- في admin_set_tool تبقى قائمةً مغلقة — تُضاف حالة واحدة لا غير.
-- ═══════════════════════════════════════════════════════════════

-- ١) عمود الاستحقاق — نفس نوع بقية الأدوات (timestamptz، يقبل NULL = لا استحقاق)
alter table public.profiles
  add column if not exists clock_until timestamptz;

-- ٢) admin_set_tool: إضافة 'clock' إلى القائمة المغلقة
--
-- التعريف أدناه منقول حرفيًا من ghiras-staging · PREVIEW
-- (pg_get_functiondef — لقطات ٢٠٢٦-٠٨-٢٥)، والتغيير الوحيد فيه سطرُ
-- when 'clock' في CASE. المنح يمدّد الاستحقاق القائم ولا يستبدله —
-- سلوك أصلي يُحافَظ عليه كما هو.
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
