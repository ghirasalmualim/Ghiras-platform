-- ============================================================
-- سجلات رئيس القسم — عمود صلاحية الاشتراك
-- شغّلي هذا في محرر SQL داخل لوحة Supabase.
-- آمن للتكرار: لا يفعل شيئًا إن كان العمود موجودًا.
-- ============================================================

alter table public.profiles
  add column if not exists head_records_until date;

comment on column public.profiles.head_records_until is
  'نهاية اشتراك «سجلات رئيس القسم». فارغ أو تاريخ ماضٍ = لا وصول.';


-- ── منح الاشتراك يدويًا (بدّلي البريد والمدة) ──────────────
-- update public.profiles
--    set head_records_until = greatest(coalesce(head_records_until, current_date), current_date)
--                             + interval '6 months'
--  where email = 'teacher@example.com';


-- ── سحب الاشتراك ───────────────────────────────────────────
-- update public.profiles set head_records_until = null
--  where email = 'teacher@example.com';


-- ── من لديه اشتراك سارٍ الآن؟ ──────────────────────────────
-- select full_name, email, head_records_until
--   from public.profiles
--  where head_records_until > current_date
--  order by head_records_until;


-- ============================================================
-- الخطوة التالية (تحتاج تعريف الدالة الحالي):
-- لإضافة زر «منح سجلات رئيس القسم» في لوحة /admin يجب توسيع
-- الدالة admin_grant بنوع جديد 'head_records'. شغّلي هذا
-- الاستعلام وأرسلي لي الناتج لأكتب لك النسخة الموسّعة بدقة:
--
--   select pg_get_functiondef(oid)
--     from pg_proc
--    where proname = 'admin_grant';
-- ============================================================
