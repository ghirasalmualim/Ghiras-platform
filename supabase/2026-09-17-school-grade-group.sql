-- «إدارة المدرسة»: تصنيف بنود التقييم (معزول، إضافي).
--   group: 'period' = أعمال الفترة، 'papers' = أوراق التقييم (نموذج وزارة التربية).
--   عمود إضافي على school_grade_items فقط. لا يمسّ شيئًا آخر.
alter table public.school_grade_items add column if not exists grp text not null default 'period'
  check (grp in ('period','papers'));

NOTIFY pgrst, 'reload schema';
select 'school grade-group ready' as ok;
