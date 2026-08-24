-- ═══════════════════════════════════════════════════════════════
-- المرحلة ٧ — خطة الحفظ الشخصية
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ لا جدول هدفٍ ثانٍ ولا جدول أيام: quran_goal القائم يتّسع،
--    والخطة اليومية تُحسب عند الطلب حتمِيًّا (قرار المرحلة ٢ نصًّا
--    في هذا الملف نفسه) — فتخزينها يجعلها تفسد يومَ أول غياب.
--
-- ⚠️ التوافق الخلفي: أعمدة جديدة كلها nullable أو لها default —
--    الأهداف القديمة تبقى صالحة وتُقرأ بقيمها الافتراضية.
--
-- التغيير الوحيد على عمود قائم: target_date يصير nullable —
-- توسعةٌ لا تضييق (خطة مرنة بلا موعد: «لا نخترع تاريخًا»). كل
-- الصفوف القديمة تحمل تاريخًا فلا يتأثر صفٌّ واحد.

-- ── ١. توسيع الهدف ──────────────────────────────────────────────
alter table public.quran_goal
  alter column target_date drop not null;

alter table public.quran_goal
  add column if not exists start_date date,
  -- أيام الأسبوع المتاحة للحفظ: ٠=الأحد … ٦=السبت. فارغة = كل الأيام
  add column if not exists days_of_week smallint[] not null default '{}',
  add column if not exists intensity text not null default 'balanced'
    check (intensity in ('light','balanced','intense')),
  -- دورة حياة الهدف — بلوغ آخر آية ليس نهاية: بعده تثبيت ثم اكتمال
  add column if not exists status text not null default 'MEMORIZING'
    check (status in ('MEMORIZING','FULL_RANGE_REACHED','CONSOLIDATING','COMPLETED','CANCELLED')),
  -- قول الطالبة «بلغت الآية كذا» — راحةٌ يُفرَّق بينها وبين الموثوق:
  -- التقدّم الموثوق يُشتق من quran_review_state ولا يُخزَّن هنا أصلًا
  add column if not exists user_marked_up_to smallint
    check (user_marked_up_to is null or user_marked_up_to >= 0),
  add column if not exists completed_at timestamptz;

-- ── ٢. أحداث محايدة جديدة — بلا مكافآت ولا مساس بالحديقة ────────
alter table public.quran_event drop constraint if exists quran_event_kind_check;
alter table public.quran_event add constraint quran_event_kind_check
  check (kind in (
    'daily_task_done','reviewed_on_time','segment_mastered',
    'streak_days','returned_after_break','review_without_hint',
    'recitation_completed','recitation_without_help',
    'weak_spot_improved','review_completed',
    'plan_day_completed','goal_completed'
  ));

-- ── ٣. أمن الصفوف ────────────────────────────────────────────────
-- سياسة «quran goal own» القائمة (المرحلة ٢) تغطي الأعمدة الجديدة:
-- الصفوف صفوف الطالبة نفسها قراءةً وكتابة. أما صحّة النطاق القرآني
-- وحدود درس المنهج فيحرسها الخادم في /api/quran/goal — القاعدة لا
-- تعرف المصحف، والخادم يعرفه.
