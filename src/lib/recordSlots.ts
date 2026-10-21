/**
 * عددُ سجلّاتِ (صفوفِ) سجلّي الدرجات والحضور لمعلمة: سجلّاتُ الباقة (٤ أو ٢) + الإضافيّة.
 * الأعمدةُ من supabase/2026-10-21-record-plans.sql — وقبل تشغيلِه (أو عند أيِّ خطأ)
 * يرجع ٤ + ما في attendance_extra كما كان، فلا تُقفلُ أداةُ أحدٍ بسببِ عمودٍ ناقص.
 */
type Reader = { from: (t: string) => any };

export async function recordSlots(supabase: Reader, userId: string, tool: 'gradebook' | 'attendance', fallbackExtra = 0): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`${tool}_base, ${tool}_extra`)
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return 4 + fallbackExtra;
    const base = Number((data as Record<string, unknown>)[`${tool}_base`]) || 4;
    const extra = Number((data as Record<string, unknown>)[`${tool}_extra`]) || 0;
    return Math.max(1, base + extra);
  } catch {
    return 4 + fallbackExtra;
  }
}
