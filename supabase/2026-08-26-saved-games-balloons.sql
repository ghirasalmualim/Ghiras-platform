-- ═══════════════════════════════════════════════════════════════
-- «صيد البالون» في مكتبة الألعاب المحفوظة (Staging أولًا، ثم الإنتاج بيد صاحبة المنصة)
--
-- السبب المثبت (تجربة إدراج حية على Staging ٢٠٢٦-٠٨-٢٥):
-- 23514 — new row violates check constraint "saved_games_game_type_check"
-- الجدول يحصر الأنواع الأربعة القديمة، فحفظ البالون يفشل بصمت.
--
-- ⚠️ لا جدول جديد، لا عمود جديد، لا RLS — إعادة تعريف القيد نفسه
-- بإضافة نوع خامس لا غير.
-- ═══════════════════════════════════════════════════════════════

alter table public.saved_games
  drop constraint if exists saved_games_game_type_check;

alter table public.saved_games
  add constraint saved_games_game_type_check
  check (game_type in ('millionaire', 'snake', 'xo', 'sinjim', 'balloons'));
