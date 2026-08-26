-- ═══════════════════════════════════════════════════════════════
-- رصيد «ألعاب غراس التفاعلية» — منح إداري جمعي (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة)
--
-- المنتج رصيدُ عددٍ دائم لا اشتراكَ مدة: الأدمِن تضيف N ألعاب فوق
-- الرصيد القائم (ADDITIVE — لا استبدال)، والرصيد لا ينتهي بمرور
-- الوقت، والخصم يبقى حصرًا في consume_game_credit عند التثبيت
-- الأول — هذه الدالة لا تلمس الخصم ولا تُنشئ أي تاريخ انتهاء.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_add_game_credits(p_user uuid, p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'invalid count: %', p_count;
  end if;

  update public.profiles
     set game_credits = coalesce(game_credits, 0) + p_count
   where id = p_user
   returning game_credits into v_new;

  if v_new is null then
    raise exception 'user not found';
  end if;

  return v_new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_add_game_credits(uuid, integer) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_add_game_credits(uuid, integer) TO authenticated;
