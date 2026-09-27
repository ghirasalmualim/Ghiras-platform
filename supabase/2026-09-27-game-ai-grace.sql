-- ============================================================================
-- مهلة التصحيح لتوليد الألعاب (قرار حصة 2026-09-27).
--
-- صار رصيد الألعاب يُخصم عند التوليد بالذكاء. لكن المعلمة قد لا تعجبها الأسئلة
-- فتعيد التوليد — فتخسر رصيدًا ثانيًا على الدرس نفسه. فجعلنا لها **مهلة ١٠
-- دقائق** بعد كل خصم: كل توليد داخلها مجاني.
--
-- الجدول يكتبه الخادم وحده (service_role): RLS مفعّلة **بلا أي سياسة**، فلا
-- يقرأه ولا يكتبه أحد من المتصفح. ولو تُركت الكتابة للمستخدمة لأمكنها تمديد
-- المهلة بنفسها فيصير التوليد مجانيًا للأبد.
--
-- إضافيٌّ بالكامل: جدول واحد جديد، ولا يمسّ consume_game_credit ولا غيرها.
-- ============================================================================
create table if not exists public.game_ai_charges (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  last_charged_at timestamptz not null default now()
);

alter table public.game_ai_charges enable row level security;

revoke all on table public.game_ai_charges from anon, authenticated;

comment on table public.game_ai_charges is
  'آخر خصم رصيد ألعاب عند التوليد — يُستعمل لمهلة إعادة التوليد المجانية (يكتبه الخادم فقط)';
