-- ═══════════════════════════════════════════════════════════════
-- رصيد «حصص ستوديو الحصة الذكية» — منح إداري بالعدد (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة)
--
-- التسعير بالعدد لا بالمدة: باقة حصة واحدة، وباقة خمس حصص. الرصيد
-- عددٌ دائم لا ينتهي بمرور الوقت — الأدمِن تضيف N حصص فوق الرصيد
-- القائم (ADDITIVE — لا استبدال). الخصم حصرًا في consume_lesson_credit،
-- ويقع مرة واحدة لكل درس عند اكتمال توليده (العلم في قاعدة الستوديو).
--
-- نفس نمط رصيد الألعاب: عمود على profiles + دالة منح إدارية
-- (admin_add_lesson_credits) + دالة خصم بجلسة المعلمة نفسها
-- (consume_lesson_credit). RLS لا تُمس، وسياسة «own profile read»
-- القائمة تكفي المعلمة لقراءة رصيدها.
-- ═══════════════════════════════════════════════════════════════

-- ١) العمود — عددٌ يقبل NULL (يُعامَل NULL كصفر عبر coalesce، مثل game_credits)
alter table public.profiles
  add column if not exists lesson_credits integer;

-- ٢) منح إداري جمعي — إضافة N حصص فوق الرصيد القائم (لا استبدال)
--    p_count: 1 لباقة الحصة الواحدة، 5 لباقة الخمس حصص (والمدى 1..100 يتيح منحًا يدويًا).
--    مطابِقة لـ admin_add_game_credits: is_admin() فقط، لا تلمس الخصم ولا أي تاريخ.
CREATE OR REPLACE FUNCTION public.admin_add_lesson_credits(p_user uuid, p_count integer)
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
     set lesson_credits = coalesce(lesson_credits, 0) + p_count
   where id = p_user
   returning lesson_credits into v_new;

  if v_new is null then
    raise exception 'user not found';
  end if;

  return v_new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_add_lesson_credits(uuid, integer) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_add_lesson_credits(uuid, integer) TO authenticated;

-- ٣) الخصم — بجلسة المعلمة نفسها، على حسابها هي فقط (auth.uid())
--    ينقص واحدًا فقط إن كان الرصيد > 0، وإلا يرفع خطأً ليوقف التوليد.
--    الأدمِن معفى: وصولٌ مفتوح بلا خصم (يُرجِع -1 كإشارة «غير محدود») —
--    متسقٌ مع hasStudioAccess في الستوديو التي تُعفي الأدمِن.
--    الاستدعاء يتم مرة واحدة لكل درس (يحرسه علم creditCharged في الستوديو).
CREATE OR REPLACE FUNCTION public.consume_lesson_credit()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new integer;
begin
  if public.is_admin() then
    return -1;  -- الأدمِن بلا خصم
  end if;

  update public.profiles
     set lesson_credits = coalesce(lesson_credits, 0) - 1
   where id = auth.uid()
     and coalesce(lesson_credits, 0) > 0
   returning lesson_credits into v_new;

  if v_new is null then
    -- لا رصيد (صفر) أو لا جلسة — التوليد يُمنع
    raise exception 'no lesson credits';
  end if;

  return v_new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.consume_lesson_credit() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.consume_lesson_credit() TO authenticated;
