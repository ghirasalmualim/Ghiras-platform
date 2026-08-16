/**
 * أسماء العرض للمواد.
 *
 * مادة «الاجتماعيات» لها اسم مقرر مختلف في كل صف، بينما هي في قاعدة البيانات
 * صفٌّ واحد بـ slug ثابت `social`. هذه الدالة تبدّل **النص المعروض فقط** —
 * الـ slug والروابط ومعرّفات المادة والألعاب تبقى كما هي بلا أي تغيير.
 *
 * تعمل سواء جاءت المادة من Supabase أو من البيانات الاحتياطية، لأنها تعتمد
 * على slug المادة وslug الصف لا على الاسم المخزَّن.
 */

const SOCIAL_BY_GRADE: Record<string, string> = {
  'grade-1': 'وطني',
  'grade-2': 'وطني',
  'grade-3': 'وطني',
  'grade-4': 'وطني الكويت',
  'grade-5': 'وطني الكويت',
  'grade-6': 'دولة الكويت ودول الخليج العربية',
  'grade-7': 'دولة الكويت والوطن العربي',
  'grade-8': 'الكويت والعالم الإسلامي',
  'grade-9': 'دولة الكويت والعالم',
};

/** الاسم المعروض للمادة داخل صفٍّ معيّن. */
export function subjectDisplayName(
  subject: { slug: string; name: string },
  gradeSlug: string
): string {
  if (subject.slug !== 'social') return subject.name;
  return SOCIAL_BY_GRADE[gradeSlug] ?? subject.name;
}
