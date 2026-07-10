-- ============================================================
--  المرحلة الثانية — إعداد الحسابات والصلاحيات
--  Ghiras Al-Muallim — Phase 2 Setup
--
--  ⚠️ قبل تشغيل هذا الملف:
--  أنشئي حساب المدير من لوحة Supabase:
--  Authentication ← Users ← Add user ← Create new user
--    Email:    ghiras@ghiras-users.com
--    Password: كلمة مرور قوية (احفظيها!)
--    ✅ Auto Confirm User
--  ثم شغّلي هذا الملف كاملاً مرة واحدة.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) سياسة تسجيل عمليات الدخول
--    (تسمح لكل مستخدم بتسجيل دخوله هو فقط)
-- ─────────────────────────────────────────────

drop policy if exists "insert own login log" on public.login_logs;
create policy "insert own login log" on public.login_logs
  for insert with check (user_id = auth.uid());

-- تحديث "آخر نشاط" عبر دالة آمنة — لا تتيح تعديل أي حقل آخر
-- (لا نمنح المستخدم صلاحية update مباشرة على ملفه حتى لا يعدّل حالته أو اشتراكه)
create or replace function public.touch_last_active()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_active = now() where id = auth.uid();
$$;

-- ─────────────────────────────────────────────
-- 2) تهيئة حساب المدير
--    (يبحث عن الحساب الذي أنشأتِه بالبريد أعلاه ويجعله مديراً)
-- ─────────────────────────────────────────────

insert into public.profiles (id, full_name, username, role, status)
select id, 'إدارة غراس المعلم', 'ghiras', 'admin', 'active'
from auth.users
where email = 'ghiras@ghiras-users.com'
on conflict (id) do update
  set role = 'admin', status = 'active';

-- تحقق سريع: يجب أن يُظهر سطراً واحداً فيه role = admin
select username, full_name, role, status from public.profiles;

-- ============================================================
--  📋 قوالب جاهزة للاستخدام لاحقاً (لا تعمل الآن — أمثلة معلّقة)
--  انسخي القالب المطلوب، عدّلي القيم، ثم شغّليه وحده.
-- ============================================================

-- ─────────────────────────────────────────────
-- ✦ قالب: إنشاء حساب معلمة/معلم جديد
--   الخطوة أ) من لوحة Supabase: Authentication ← Users ← Add user
--            Email: USERNAME@ghiras-users.com  (بدّلي USERNAME)
--            Password + ✅ Auto Confirm
--   الخطوة ب) شغّلي هذا (بعد تعديل القيم):
-- ─────────────────────────────────────────────
/*
insert into public.profiles (id, full_name, username, role, status, sub_start, sub_end)
select id, 'اسم المعلمة الكامل', 'USERNAME', 'teacher', 'active',
       current_date, current_date + interval '1 year'
from auth.users
where email = 'USERNAME@ghiras-users.com';
*/

-- ─────────────────────────────────────────────
-- ✦ قوالب الصلاحيات (اختاري ما يناسب اشتراك المستخدم)
-- ─────────────────────────────────────────────

-- (1) صلاحية المنصة كاملة:
/*
insert into public.permissions (user_id, scope)
select id, 'all' from public.profiles where username = 'USERNAME';
*/

-- (2) صلاحية مرحلة كاملة (primary = الابتدائية، middle = المتوسطة):
/*
insert into public.permissions (user_id, scope, stage_id)
select p.id, 'stage', st.id
from public.profiles p, public.stages st
where p.username = 'USERNAME' and st.slug = 'primary';
*/

-- (3) صلاحية صف كامل (grade-1 إلى grade-9):
/*
insert into public.permissions (user_id, scope, grade_id)
select p.id, 'grade', g.id
from public.profiles p, public.grades g
where p.username = 'USERNAME' and g.slug = 'grade-5';
*/

-- (4) صلاحية مادة واحدة في صف محدد
--     (arabic / english / islamic / math / science / social):
/*
insert into public.permissions (user_id, scope, subject_id)
select p.id, 'subject', s.id
from public.profiles p,
     public.subjects s join public.grades g on g.id = s.grade_id
where p.username = 'USERNAME'
  and g.slug = 'grade-5' and s.slug = 'islamic';
*/

-- ─────────────────────────────────────────────
-- ✦ قالب: إضافة لعبة إلى مادة
-- ─────────────────────────────────────────────
/*
insert into public.games (subject_id, title, description, game_url, category, accent_color, sort_order)
select s.id,
       'عالم القلوب الساعية للجنة',
       'مراجعة تفاعلية شاملة لدروس الفصل الأول',
       'https://ghiras-games.vercel.app/islamic-g5/lesson-01',
       'مراجعة',
       '#7A9E7E',
       1
from public.subjects s join public.grades g on g.id = s.grade_id
where g.slug = 'grade-5' and s.slug = 'islamic';
*/

-- ─────────────────────────────────────────────
-- ✦ قوالب إدارة الحسابات
-- ─────────────────────────────────────────────

-- إيقاف حساب:
/*
update public.profiles set status = 'suspended' where username = 'USERNAME';
*/

-- إعادة تفعيل:
/*
update public.profiles set status = 'active' where username = 'USERNAME';
*/

-- تمديد اشتراك سنة إضافية:
/*
update public.profiles set sub_end = sub_end + interval '1 year' where username = 'USERNAME';
*/
