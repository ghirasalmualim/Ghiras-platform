-- ============================================================
-- Quran curriculum — primary and middle stages, term 1
--
-- GENERATED. Do not edit by hand.
-- Source of truth: src/features/quran/curriculum/{primary,middle}-term1.ts
-- Regenerate with: npm run quran:curriculum
--
-- Extracted from the official Ministry of Education distribution plan
-- for 2025/2026 (approved 16/9/2025), read page by page from the
-- scanned file and reviewed by the platform owner before entry.
--
-- No Quranic text is stored here. A lesson carries only a surah and an
-- ayah range; the text always comes from the platform's reference
-- mushaf. The curriculum tells us WHICH verses, never WHAT they say.
--
-- Primary (grade-1..5) and middle (grade-6..9), term 1 only.
-- Secondary is deliberately absent: the owner deferred it and may drop
-- it, so no secondary stage and no grades 10-12 exist in Ghiras.
--
-- Safe to run more than once: a unique key on
-- (grade_slug, term, sort_order) turns re-runs into updates.
--
-- Comments in English on purpose: Arabic text after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

-- Idempotency key. Without it a second run would duplicate every row.
create unique index if not exists quran_curriculum_lesson_key
  on public.quran_curriculum_lesson (grade_slug, term, sort_order);


-- ── grade-1 (primary) — 33 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('primary', 'grade-1', 1, 'الدرس الثاني: سورة الفاتحة', 1, 1, 3, 'memorize', 1, true),
  ('primary', 'grade-1', 1, 'الدرس الثاني: سورة الفاتحة', 1, 4, 5, 'memorize', 2, true),
  ('primary', 'grade-1', 1, 'الدرس الثاني: سورة الفاتحة', 1, 6, 7, 'memorize', 3, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس الثاني: سورة الفاتحة', 1, 1, 7, 'review', 4, true),
  ('primary', 'grade-1', 1, 'الدرس الثالث: سورة الناس', 114, 1, 3, 'memorize', 5, true),
  ('primary', 'grade-1', 1, 'الدرس الثالث: سورة الناس', 114, 4, 6, 'memorize', 6, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس الثاني والثالث: سورة الفاتحة', 1, 1, 7, 'review', 7, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس الثاني والثالث: سورة الناس', 114, 1, 6, 'review', 8, true),
  ('primary', 'grade-1', 1, 'الدرس الرابع: سورة الفلق', 113, 1, 3, 'memorize', 9, true),
  ('primary', 'grade-1', 1, 'الدرس الرابع: سورة الفلق', 113, 4, 5, 'memorize', 10, true),
  ('primary', 'grade-1', 1, 'الدرس الخامس: سورة الإخلاص', 112, 1, 2, 'memorize', 11, true),
  ('primary', 'grade-1', 1, 'الدرس الخامس: سورة الإخلاص', 112, 3, 4, 'memorize', 12, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس الرابع والخامس: سورة الفلق', 113, 1, 5, 'review', 13, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس الرابع والخامس: سورة الإخلاص', 112, 1, 4, 'review', 14, true),
  ('primary', 'grade-1', 1, 'الدرس السابع: سورة المسد', 111, 1, 3, 'memorize', 15, true),
  ('primary', 'grade-1', 1, 'الدرس السابع: سورة المسد', 111, 4, 5, 'memorize', 16, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس السابع: سورة المسد', 111, 1, 5, 'review', 17, true),
  ('primary', 'grade-1', 1, 'الدرس الثامن: سورة النصر', 110, 1, 2, 'memorize', 18, true),
  ('primary', 'grade-1', 1, 'الدرس الثامن: سورة النصر', 110, 3, 3, 'memorize', 19, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس السابع والثامن: سورة المسد', 111, 1, 5, 'review', 20, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس السابع والثامن: سورة النصر', 110, 1, 3, 'review', 21, true),
  ('primary', 'grade-1', 1, 'الدرس التاسع: سورة الكافرون', 109, 1, 3, 'memorize', 22, true),
  ('primary', 'grade-1', 1, 'الدرس التاسع: سورة الكافرون', 109, 4, 6, 'memorize', 23, true),
  ('primary', 'grade-1', 1, 'الدرس العاشر: سورة الكوثر', 108, 1, 3, 'memorize', 24, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس التاسع والعاشر: سورة الكافرون', 109, 1, 6, 'review', 25, true),
  ('primary', 'grade-1', 1, 'مراجعة الدرس التاسع والعاشر: سورة الكوثر', 108, 1, 3, 'review', 26, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة الفاتحة', 1, 1, 7, 'review', 27, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة الناس', 114, 1, 6, 'review', 28, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة الفلق', 113, 1, 5, 'review', 29, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة الإخلاص', 112, 1, 4, 'review', 30, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة المسد', 111, 1, 5, 'review', 31, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة النصر', 110, 1, 3, 'review', 32, true),
  ('primary', 'grade-1', 1, 'مراجعة عامة: سورة الكافرون', 109, 1, 6, 'review', 33, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-2 (primary) — 16 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('primary', 'grade-2', 1, 'الدرس الثاني: سورة العاديات (أ)', 100, 1, 5, 'memorize', 1, true),
  ('primary', 'grade-2', 1, 'الدرس الثالث: سورة العاديات (ب)', 100, 6, 11, 'memorize', 2, true),
  ('primary', 'grade-2', 1, 'مراجعة الدرس الثاني والثالث: سورة العاديات', 100, 1, 11, 'review', 3, true),
  ('primary', 'grade-2', 1, 'الدرس الرابع: سورة الزلزلة (أ)', 99, 1, 5, 'memorize', 4, true),
  ('primary', 'grade-2', 1, 'الدرس الخامس: سورة الزلزلة (ب)', 99, 6, 8, 'memorize', 5, true),
  ('primary', 'grade-2', 1, 'مراجعة الدرس الرابع والخامس: سورة الزلزلة', 99, 1, 8, 'review', 6, true),
  ('primary', 'grade-2', 1, 'الدرس السادس: سورة البينة (أ)', 98, 1, 5, 'memorize', 7, true),
  ('primary', 'grade-2', 1, 'الدرس السابع: سورة البينة (ب)', 98, 6, 8, 'memorize', 8, true),
  ('primary', 'grade-2', 1, 'مراجعة الدرس السادس والسابع: سورة البينة', 98, 1, 8, 'review', 9, true),
  ('primary', 'grade-2', 1, 'الدرس الثامن: سورة القدر', 97, 1, 3, 'memorize', 10, true),
  ('primary', 'grade-2', 1, 'الدرس الثامن: سورة القدر', 97, 4, 5, 'memorize', 11, true),
  ('primary', 'grade-2', 1, 'مراجعة الدرس الثامن: سورة القدر', 97, 1, 5, 'review', 12, true),
  ('primary', 'grade-2', 1, 'مراجعة عامة: سورة الزلزلة', 99, 1, 8, 'review', 13, true),
  ('primary', 'grade-2', 1, 'مراجعة عامة: سورة العاديات', 100, 1, 11, 'review', 14, true),
  ('primary', 'grade-2', 1, 'مراجعة عامة: سورة البينة', 98, 1, 8, 'review', 15, true),
  ('primary', 'grade-2', 1, 'مراجعة عامة: سورة القدر', 97, 1, 5, 'review', 16, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-3 (primary) — 26 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('primary', 'grade-3', 1, 'الدرس الثاني: سورة البلد (أ)', 90, 1, 4, 'memorize', 1, true),
  ('primary', 'grade-3', 1, 'الدرس الثاني: سورة البلد (أ)', 90, 5, 7, 'memorize', 2, true),
  ('primary', 'grade-3', 1, 'الدرس الثاني: سورة البلد (أ)', 90, 8, 10, 'memorize', 3, true),
  ('primary', 'grade-3', 1, 'الدرس الثالث: سورة البلد (ب)', 90, 11, 16, 'memorize', 4, true),
  ('primary', 'grade-3', 1, 'الدرس الثالث: سورة البلد (ب)', 90, 17, 20, 'memorize', 5, true),
  ('primary', 'grade-3', 1, 'مراجعة الدرس الثاني والثالث: سورة البلد', 90, 1, 20, 'review', 6, true),
  ('primary', 'grade-3', 1, 'الدرس الرابع: سورة الفجر (أ)', 89, 1, 8, 'memorize', 7, true),
  ('primary', 'grade-3', 1, 'الدرس الرابع: سورة الفجر (أ)', 89, 9, 14, 'memorize', 8, true),
  ('primary', 'grade-3', 1, 'الدرس الخامس: سورة الفجر (ب)', 89, 15, 16, 'memorize', 9, true),
  ('primary', 'grade-3', 1, 'الدرس الخامس: سورة الفجر (ب)', 89, 17, 20, 'memorize', 10, true),
  ('primary', 'grade-3', 1, 'الدرس السادس: سورة الفجر (ج)', 89, 21, 24, 'memorize', 11, true),
  ('primary', 'grade-3', 1, 'الدرس السادس: سورة الفجر (ج)', 89, 25, 30, 'memorize', 12, true),
  ('primary', 'grade-3', 1, 'مراجعة الدرس الرابع والخامس والسادس: سورة الفجر', 89, 1, 30, 'review', 13, true),
  ('primary', 'grade-3', 1, 'الدرس السابع: سورة الغاشية (أ)', 88, 1, 7, 'memorize', 14, true),
  ('primary', 'grade-3', 1, 'الدرس السابع: سورة الغاشية (ب)', 88, 8, 16, 'memorize', 15, true),
  ('primary', 'grade-3', 1, 'الدرس الثامن: سورة الغاشية (ج)', 88, 17, 20, 'memorize', 16, true),
  ('primary', 'grade-3', 1, 'الدرس التاسع: سورة الغاشية (ج)', 88, 21, 26, 'memorize', 17, true),
  ('primary', 'grade-3', 1, 'مراجعة الدرس السابع والثامن والتاسع: سورة الغاشية', 88, 1, 26, 'review', 18, true),
  ('primary', 'grade-3', 1, 'الدرس الحادي عشر: سورة الأعلى (أ)', 87, 1, 8, 'memorize', 19, true),
  ('primary', 'grade-3', 1, 'الدرس الثاني عشر: سورة الأعلى (أ)', 87, 9, 13, 'memorize', 20, true),
  ('primary', 'grade-3', 1, 'الدرس الثاني عشر: سورة الأعلى (ب)', 87, 14, 19, 'memorize', 21, true),
  ('primary', 'grade-3', 1, 'مراجعة الدرس الحادي عشر والثاني عشر: سورة الأعلى', 87, 1, 19, 'review', 22, true),
  ('primary', 'grade-3', 1, 'مراجعة عامة: سورة البلد', 90, 1, 20, 'review', 23, true),
  ('primary', 'grade-3', 1, 'مراجعة عامة: سورة الفجر', 89, 1, 30, 'review', 24, true),
  ('primary', 'grade-3', 1, 'مراجعة عامة: سورة الغاشية', 88, 1, 26, 'review', 25, true),
  ('primary', 'grade-3', 1, 'مراجعة عامة: سورة الأعلى', 87, 1, 19, 'review', 26, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-4 (primary) — 24 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('primary', 'grade-4', 1, 'الدرس الثاني: سورة المطففين (أ)', 83, 1, 3, 'memorize', 1, true),
  ('primary', 'grade-4', 1, 'الدرس الثاني: سورة المطففين (أ)', 83, 4, 6, 'memorize', 2, true),
  ('primary', 'grade-4', 1, 'الدرس الثالث: سورة المطففين (ب)', 83, 7, 12, 'memorize', 3, true),
  ('primary', 'grade-4', 1, 'الدرس الثالث: سورة المطففين (ب)', 83, 13, 17, 'memorize', 4, true),
  ('primary', 'grade-4', 1, 'مراجعة الدرس الثاني والثالث: سورة المطففين (أ–ب)', 83, 1, 17, 'review', 5, true),
  ('primary', 'grade-4', 1, 'الدرس الرابع: سورة المطففين (ج)', 83, 18, 24, 'memorize', 6, true),
  ('primary', 'grade-4', 1, 'الدرس الرابع: سورة المطففين (ج)', 83, 25, 28, 'memorize', 7, true),
  ('primary', 'grade-4', 1, 'الدرس الخامس: سورة المطففين (د)', 83, 29, 32, 'memorize', 8, true),
  ('primary', 'grade-4', 1, 'الدرس الخامس: سورة المطففين (د)', 83, 33, 36, 'memorize', 9, true),
  ('primary', 'grade-4', 1, 'مراجعة الدرس الرابع والخامس: سورة المطففين (ج–د)', 83, 18, 36, 'review', 10, true),
  ('primary', 'grade-4', 1, 'الدرس السابع: سورة الانفطار (أ)', 82, 1, 5, 'memorize', 11, true),
  ('primary', 'grade-4', 1, 'الدرس السابع: سورة الانفطار (أ)', 82, 6, 12, 'memorize', 12, true),
  ('primary', 'grade-4', 1, 'الدرس الثامن: سورة الانفطار (ب)', 82, 13, 19, 'memorize', 13, true),
  ('primary', 'grade-4', 1, 'مراجعة سورة الانفطار (أ–ب)', 82, 1, 19, 'review', 14, true),
  ('primary', 'grade-4', 1, 'الدرس التاسع: سورة التكوير (أ)', 81, 1, 5, 'memorize', 15, true),
  ('primary', 'grade-4', 1, 'الدرس التاسع: سورة التكوير (أ)', 81, 6, 9, 'memorize', 16, true),
  ('primary', 'grade-4', 1, 'الدرس التاسع: سورة التكوير (أ)', 81, 10, 14, 'memorize', 17, true),
  ('primary', 'grade-4', 1, 'الدرس العاشر: سورة التكوير (ب)', 81, 15, 20, 'memorize', 18, true),
  ('primary', 'grade-4', 1, 'الدرس العاشر: سورة التكوير (ب)', 81, 21, 25, 'memorize', 19, true),
  ('primary', 'grade-4', 1, 'الدرس العاشر: سورة التكوير (ب)', 81, 26, 29, 'memorize', 20, true),
  ('primary', 'grade-4', 1, 'مراجعة سورة التكوير', 81, 1, 29, 'review', 21, true),
  ('primary', 'grade-4', 1, 'مراجعة عامة: سورة المطففين', 83, 1, 36, 'review', 22, true),
  ('primary', 'grade-4', 1, 'مراجعة عامة: سورة الانفطار', 82, 1, 19, 'review', 23, true),
  ('primary', 'grade-4', 1, 'مراجعة عامة: سورة التكوير', 81, 1, 29, 'review', 24, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-5 (primary) — 24 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('primary', 'grade-5', 1, 'الدرس الثاني: سورة المرسلات (أ)', 77, 1, 3, 'memorize', 1, true),
  ('primary', 'grade-5', 1, 'الدرس الثاني: سورة المرسلات (أ)', 77, 4, 7, 'memorize', 2, true),
  ('primary', 'grade-5', 1, 'الدرس الثالث: سورة المرسلات (ب)', 77, 8, 11, 'memorize', 3, true),
  ('primary', 'grade-5', 1, 'الدرس الثالث: سورة المرسلات (ب)', 77, 12, 15, 'memorize', 4, true),
  ('primary', 'grade-5', 1, 'الدرس الثالث: سورة المرسلات (ب)', 77, 16, 19, 'memorize', 5, true),
  ('primary', 'grade-5', 1, 'مراجعة سورة المرسلات (أ–ب)', 77, 1, 19, 'review', 6, true),
  ('primary', 'grade-5', 1, 'الدرس الرابع: سورة المرسلات (ج)', 77, 20, 23, 'memorize', 7, true),
  ('primary', 'grade-5', 1, 'الدرس الرابع: سورة المرسلات (ج)', 77, 24, 28, 'memorize', 8, true),
  ('primary', 'grade-5', 1, 'الدرس الخامس: سورة المرسلات (د)', 77, 29, 31, 'memorize', 9, true),
  ('primary', 'grade-5', 1, 'الدرس الخامس: سورة المرسلات (د)', 77, 32, 34, 'memorize', 10, true),
  ('primary', 'grade-5', 1, 'الدرس الخامس: سورة المرسلات (د)', 77, 35, 37, 'memorize', 11, true),
  ('primary', 'grade-5', 1, 'الدرس الخامس: سورة المرسلات (د)', 77, 38, 40, 'memorize', 12, true),
  ('primary', 'grade-5', 1, 'مراجعة سورة المرسلات (ج–د)', 77, 20, 40, 'review', 13, true),
  ('primary', 'grade-5', 1, 'الدرس السادس: سورة المرسلات (هـ)', 77, 41, 43, 'memorize', 14, true),
  ('primary', 'grade-5', 1, 'الدرس السادس: سورة المرسلات (هـ)', 77, 44, 45, 'memorize', 15, true),
  ('primary', 'grade-5', 1, 'الدرس السادس: سورة المرسلات (هـ)', 77, 46, 47, 'memorize', 16, true),
  ('primary', 'grade-5', 1, 'الدرس السادس: سورة المرسلات (هـ)', 77, 48, 50, 'memorize', 17, true),
  ('primary', 'grade-5', 1, 'مراجعة الدرس السادس: سورة المرسلات (هـ)', 77, 41, 50, 'review', 18, true),
  ('primary', 'grade-5', 1, 'الدرس الثامن: سورة الإنسان (أ)', 76, 1, 3, 'memorize', 19, true),
  ('primary', 'grade-5', 1, 'الدرس الثامن: سورة الإنسان (أ)', 76, 4, 6, 'memorize', 20, true),
  ('primary', 'grade-5', 1, 'الدرس التاسع: سورة الإنسان (ب)', 76, 7, 11, 'memorize', 21, true),
  ('primary', 'grade-5', 1, 'مراجعة سورة الإنسان (أ–ب)', 76, 1, 11, 'review', 22, true),
  ('primary', 'grade-5', 1, 'مراجعة عامة: سورة المرسلات', 77, 1, 50, 'review', 23, true),
  ('primary', 'grade-5', 1, 'مراجعة عامة: سورة الإنسان', 76, 1, 11, 'review', 24, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-6 (middle) — 10 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('middle', 'grade-6', 1, 'الرسول ﷺ النذير', 74, 1, 10, 'memorize', 1, true),
  ('middle', 'grade-6', 1, 'الجحود يزيل النعم', 74, 11, 17, 'memorize', 2, true),
  ('middle', 'grade-6', 1, 'عاقبة المستهزئين بالدين', 74, 18, 30, 'memorize', 3, true),
  ('middle', 'grade-6', 1, 'الملائكة جنود الله تعالى', 74, 31, 31, 'memorize', 4, true),
  ('middle', 'grade-6', 1, 'التقدم بالطاعة والتأخر بالمعصية', 74, 32, 38, 'memorize', 5, true),
  ('middle', 'grade-6', 1, 'تحاور أهل الجنة مع أهل النار', 74, 39, 47, 'memorize', 6, true),
  ('middle', 'grade-6', 1, 'القرآن عظة وذكرى', 74, 48, 56, 'memorize', 7, true),
  ('middle', 'grade-6', 1, 'حياة القلوب بذكر الله تعالى', 73, 1, 4, 'memorize', 8, true),
  ('middle', 'grade-6', 1, 'حياة القلوب بذكر الله تعالى', 73, 5, 9, 'memorize', 9, true),
  ('middle', 'grade-6', 1, 'الصبر على الدعوة', 73, 10, 14, 'memorize', 10, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-7 (middle) — 10 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('middle', 'grade-7', 1, 'نوح عليه السلام النذير المبين', 71, 1, 4, 'memorize', 1, true),
  ('middle', 'grade-7', 1, 'لا يأس مع الدعوة إلى الله تعالى', 71, 5, 7, 'memorize', 2, true),
  ('middle', 'grade-7', 1, 'لا يأس مع الدعوة إلى الله تعالى', 71, 8, 9, 'memorize', 3, true),
  ('middle', 'grade-7', 1, 'الاستغفار من سبل الرزق', 71, 10, 14, 'memorize', 4, true),
  ('middle', 'grade-7', 1, 'التفكر في آيات الله تعالى عبادة', 71, 15, 20, 'memorize', 5, true),
  ('middle', 'grade-7', 1, 'الشكوى إلى الله تعالى من أسباب النجاة', 71, 21, 24, 'memorize', 6, true),
  ('middle', 'grade-7', 1, 'إهلاك العصاة في الدنيا والآخرة', 71, 25, 28, 'memorize', 7, true),
  ('middle', 'grade-7', 1, 'تهديد الله ووعيده للمكذبين', 70, 1, 7, 'memorize', 8, true),
  ('middle', 'grade-7', 1, 'وصف القرآن الكريم ليوم القيامة', 70, 8, 18, 'memorize', 9, true),
  ('middle', 'grade-7', 1, 'علاج القرآن لطبيعة الإنسان', 70, 19, 28, 'memorize', 10, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-8 (middle) — 10 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('middle', 'grade-8', 1, 'الرسول ﷺ على خلق عظيم', 68, 1, 7, 'memorize', 1, true),
  ('middle', 'grade-8', 1, 'دفاع الله تعالى عن أهل الحق', 68, 8, 12, 'memorize', 2, true),
  ('middle', 'grade-8', 1, 'دفاع الله تعالى عن أهل الحق', 68, 13, 16, 'memorize', 3, true),
  ('middle', 'grade-8', 1, 'قصة أصحاب البستان', 68, 17, 27, 'memorize', 4, true),
  ('middle', 'grade-8', 1, 'قصة أصحاب البستان', 68, 28, 33, 'memorize', 5, true),
  ('middle', 'grade-8', 1, 'الله تعالى أحكم الحاكمين', 68, 34, 39, 'memorize', 6, true),
  ('middle', 'grade-8', 1, 'الله تعالى أحكم الحاكمين', 68, 40, 43, 'memorize', 7, true),
  ('middle', 'grade-8', 1, 'استدراج الله تعالى للكافرين', 68, 44, 47, 'memorize', 8, true),
  ('middle', 'grade-8', 1, 'صاحب الحوت', 68, 48, 52, 'memorize', 9, true),
  ('middle', 'grade-8', 1, 'تطبيقات على أحكام النون الساكنة والتنوين (الإظهار الحلقي - الإدغام)', 68, 1, 52, 'read', 10, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;

-- ── grade-9 (middle) — 9 lessons ──
insert into public.quran_curriculum_lesson
  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)
values
  ('middle', 'grade-9', 1, 'آية الكرسي أعظم آية في كتاب الله', 2, 255, 255, 'memorize', 1, true),
  ('middle', 'grade-9', 1, 'توجيه رقيق للنبي ﷺ', 66, 1, 3, 'memorize', 2, true),
  ('middle', 'grade-9', 1, 'الله ينصر أولياءه', 66, 4, 5, 'memorize', 3, true),
  ('middle', 'grade-9', 1, 'الوقاية من النار', 66, 6, 7, 'memorize', 4, true),
  ('middle', 'grade-9', 1, 'التوبة النصوح', 66, 8, 9, 'memorize', 5, true),
  ('middle', 'grade-9', 1, 'أمثال وعبر', 66, 10, 10, 'memorize', 6, true),
  ('middle', 'grade-9', 1, 'أمثال وعبر', 66, 11, 12, 'memorize', 7, true),
  ('middle', 'grade-9', 1, 'إيمان ودعاء — خواتيم سورة البقرة', 2, 285, 285, 'memorize', 8, true),
  ('middle', 'grade-9', 1, 'إيمان ودعاء — خواتيم سورة البقرة', 2, 286, 286, 'memorize', 9, true)
on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;
