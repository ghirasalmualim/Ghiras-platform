/**
 * دروس المنهج الدراسي.
 *
 * ⚠️ الجدول فارغ عمدًا. المقرر مرجعه وزارة التربية، وتخمينه أسوأ من
 * تركه فارغًا: معلمة تثق بما تراه فتُحفّظ طالبتها مقطعًا ليس مقررها.
 * الدروس تُدخلها المعلمة من محرر الإدارة وحده.
 *
 * الدرس ليس نظامًا مستقلًا: هو مقطع (سورة + مدى) يُمرَّر إلى نفس شاشة
 * الدراسة التي يستعملها القسم العام. لا نسخة ثانية من نظام الحفظ.
 */

import { createClient } from '@supabase/supabase-js';
import type { CurriculumLesson } from '../types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/**
 * دروس صف في فصل دراسي.
 *
 * لا يوجد بديل احتياطي: لو تعذّرت القراءة نُرجع فراغًا وتقول الواجهة
 * «لا توجد دروس بعد». بديلٌ مخترَع هنا يعني عرض مقرر غير حقيقي.
 */
export async function getLessons(
  gradeSlug: string,
  term?: number
): Promise<CurriculumLesson[]> {
  const sb = client();
  if (!sb) return [];
  let q = sb
    .from('quran_curriculum_lesson')
    .select('*')
    .eq('grade_slug', gradeSlug)
    .eq('is_visible', true);
  if (term) q = q.eq('term', term);
  const { data, error } = await q.order('term').order('sort_order');
  if (error) return [];
  return (data ?? []) as CurriculumLesson[];
}

/** الصفوف التي أُدخل لها درس واحد على الأقل — لئلا نعرض صفوفًا فارغة. */
export async function getGradesWithLessons(): Promise<string[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from('quran_curriculum_lesson')
    .select('grade_slug')
    .eq('is_visible', true);
  if (error) return [];
  // بلا نشر Set: هدف الترجمة في هذا المشروع أقدم من es2015 ولا يدعمه.
  const seen: Record<string, true> = {};
  for (const r of data ?? []) seen[r.grade_slug as string] = true;
  return Object.keys(seen);
}
