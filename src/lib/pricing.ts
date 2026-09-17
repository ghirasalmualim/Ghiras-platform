/**
 * أسعار الأدوات/الألعاب/الستوديو للدفع عبر MyFatoorah — مصدرٌ واحد على الخادم.
 * السعر يُقرأ من هنا في مسار الدفع (لا يُوثَق بسعر المتصفح). العملة: KWD.
 * كل «قابل للتجديد» — أي دفعة تمدّد الاشتراك (منطق التمديد في payment_activate_tool).
 */
export type Product =
  | { id: string; kind: 'tool'; label: string; tool: string; months: number; priceKwd: number }
  | { id: string; kind: 'games'; label: string; scope: 'subject' | 'grade'; months: number; priceKwd: number }
  | { id: string; kind: 'studio'; label: string; credits: number; priceKwd: number };

export const PRODUCTS: Record<string, Product> = {
  gradebook:      { id: 'gradebook',      kind: 'tool', label: 'سجل الدرجات الذكي',        tool: 'gradebook',      months: 4,  priceKwd: 8 },
  attendance:     { id: 'attendance',     kind: 'tool', label: 'سجل الحضور الذكي',         tool: 'attendance',     months: 4,  priceKwd: 8 },
  agenda:         { id: 'agenda',         kind: 'tool', label: 'أجندتي',                    tool: 'agenda',         months: 4,  priceKwd: 8 },
  gharas_bank:    { id: 'gharas_bank',    kind: 'tool', label: 'بنك غراس',                  tool: 'gharas_bank',    months: 4,  priceKwd: 8 },
  adventure:      { id: 'adventure',      kind: 'tool', label: 'مغامرة المجموعات التفاعلية', tool: 'adventure',      months: 4,  priceKwd: 8 },
  multiplication: { id: 'multiplication', kind: 'tool', label: 'جدول الضرب التفاعلي',        tool: 'multiplication', months: 4,  priceKwd: 3 },
  clock:          { id: 'clock',          kind: 'tool', label: 'الساعة التفاعلية',          tool: 'clock',          months: 4,  priceKwd: 3 },
  head_records:   { id: 'head_records',   kind: 'tool', label: 'سجلات رئيسة الشعبة',        tool: 'head_records',   months: 12, priceKwd: 30 },
  // الألعاب (تختار المشترية المادة/الصف عند الدفع)
  games_subject:  { id: 'games_subject',  kind: 'games', label: 'ألعاب مادة واحدة', scope: 'subject', months: 4, priceKwd: 20 },
  games_grade:    { id: 'games_grade',    kind: 'games', label: 'ألعاب صف كامل',   scope: 'grade',   months: 4, priceKwd: 50 },
  // الستوديو (حصص)
  studio_1:       { id: 'studio_1',       kind: 'studio', label: 'استوديو الحصة — حصة واحدة', credits: 1, priceKwd: 3 },
  studio_5:       { id: 'studio_5',       kind: 'studio', label: 'استوديو الحصة — ٥ حصص',    credits: 5, priceKwd: 10 },
};

/** ربط صفحة القفل ← معرّف المنتج (للزر في صفحة القفل). */
export const LOCK_TO_PRODUCT: Record<string, string> = {
  gradebook: 'gradebook',
  attendance: 'attendance',
  'my-agenda': 'agenda',
  'gharas-bank': 'gharas_bank',
  adventure: 'adventure',
  multiplication: 'multiplication',
  clock: 'clock',
  'head-records': 'head_records',
};

export const fmtKwd = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, '')} د.ك`;
