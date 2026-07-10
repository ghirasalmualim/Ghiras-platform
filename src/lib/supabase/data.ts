import { createClient } from '@supabase/supabase-js';
import {
  Stage,
  Grade,
  Subject,
  SEED_STAGES,
  SEED_GRADES,
  SEED_SUBJECTS,
} from '@/lib/types';

/**
 * طبقة البيانات — تقرأ من Supabase إذا كانت المفاتيح مضبوطة،
 * وإلا تعود تلقائياً للبيانات الاحتياطية حتى تعمل الواجهة فوراً.
 *
 * ملاحظة أمنية: هذه الطبقة تقرأ الهيكل العام فقط (مراحل/صفوف/مواد).
 * روابط الألعاب محمية بسياسات RLS ولا تُقرأ إلا بعد تسجيل الدخول (المرحلة 2).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

function client() {
  if (!supabaseConfigured) return null;
  return createClient(url!, anonKey!);
}

export async function getStages(): Promise<Stage[]> {
  const sb = client();
  if (!sb) return SEED_STAGES;
  const { data, error } = await sb
    .from('stages')
    .select('*')
    .eq('is_visible', true)
    .order('sort_order');
  if (error || !data?.length) return SEED_STAGES;
  return data as Stage[];
}

export async function getStageBySlug(slug: string): Promise<Stage | null> {
  const stages = await getStages();
  return stages.find((s) => s.slug === slug) ?? null;
}

export async function getGrades(stageId: string): Promise<Grade[]> {
  const sb = client();
  if (!sb) return SEED_GRADES.filter((g) => g.stage_id === stageId);
  const { data, error } = await sb
    .from('grades')
    .select('*')
    .eq('stage_id', stageId)
    .eq('is_visible', true)
    .order('sort_order');
  if (error || !data?.length)
    return SEED_GRADES.filter((g) => g.stage_id === stageId);
  return data as Grade[];
}

export async function getGradeBySlug(
  stageId: string,
  slug: string
): Promise<Grade | null> {
  const grades = await getGrades(stageId);
  return grades.find((g) => g.slug === slug) ?? null;
}

export async function getSubjects(gradeId: string): Promise<Subject[]> {
  const sb = client();
  if (!sb) return SEED_SUBJECTS.filter((s) => s.grade_id === gradeId);
  const { data, error } = await sb
    .from('subjects')
    .select('*')
    .eq('grade_id', gradeId)
    .eq('is_visible', true)
    .order('sort_order');
  if (error || !data?.length)
    return SEED_SUBJECTS.filter((s) => s.grade_id === gradeId);
  return data as Subject[];
}
