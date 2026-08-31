/**
 * مساحتي — نموذج الاختصارات المنسّقة من المعلّم.
 *
 * هذا الملفّ **بيانات ووصفٌ فقط** ولا يخوّل شيئًا. الوصول الحقيقي يبقى
 * محكومًا حيًّا بـ `profiles.*_until` / `sub_end` / `can_access_subject`
 * عند العرض وعند النقر. `label`/`context` للعرض فقط ولا يُوثَق بها للتخويل.
 *
 * آمنٌ للاستيراد في الخادم والعميل (ثوابتُ محضة، بلا أسرار).
 */
import type { ToolCol } from './entitlements';

export type WsItemType = 'tool' | 'subject';
export const WS_ITEM_TYPES: readonly WsItemType[] = ['tool', 'subject'] as const;

export interface ToolDef {
  key: string;
  name: string;
  emoji: string;
  href: string;
  /** عمود الصلاحية في profiles — أو null لأداةٍ مجانية/خارجية بلا بوّابة داخلية. */
  col: ToolCol | null;
  /** صفحة «مقفلة» القائمة لهذه الأداة — وجهةُ «تجديد الاشتراك» عند الانتهاء. */
  locked: string | null;
  /** رابطٌ خارجيٌّ يُفتح في تبويبٍ جديد (أداة مستضافة خارج المنصّة). */
  external?: boolean;
}

/**
 * سجلٌّ واحد لكلّ أداةٍ قابلةٍ للتثبيت — روابطها مأخوذةٌ حرفيًا من
 * `HomeSections` و`workspace` القائمة، لا مخترَعة. أيُّ عنصرٍ مثبَّتٍ
 * بمفتاحٍ خارج هذا السجلّ لا يُعرَض (unknown → يُتجاهل بأمان).
 */
export const TOOL_REGISTRY: Record<string, ToolDef> = {
  attendance: {
    key: 'attendance', name: 'سجل الحضور الذكي', emoji: '🗓️',
    href: '/attendance', col: 'attendance_until', locked: '/attendance-locked',
  },
  adventure: {
    key: 'adventure', name: 'مغامرة المجموعات التفاعلية', emoji: '🚀',
    href: '/adventure', col: 'adventure_until', locked: '/adventure-locked',
  },
  gradebook: {
    key: 'gradebook', name: 'سجل الدرجات الذكي', emoji: '📊',
    href: '/api/tool-access?tool=gradebook', col: 'gradebook_until',
    locked: '/gradebook-locked', external: true,
  },
  // ستوديو الحصة الذكية: أداةٌ خارجيةٌ لها مصدرُ صلاحيةٍ قائم في profiles هو
  // `studio_until`. مساحتي تشتقّ الحالة منه: سارٍ/أدمن → يفتح الرابط الخارجي
  // (والاستوديو نفسه يفرض نفس القاعدة: أدمن أو studio_until سارٍ)؛ منتهٍ →
  // «تجديد الاشتراك» إلى «حسابي» بلا فتح الرابط.
  studio: {
    key: 'studio', name: 'ستوديو الحصة الذكية', emoji: '🎬',
    href: 'https://studio.ghiras-edu.com', col: 'studio_until', locked: '/account',
    external: true,
  },
  gharas_bank: {
    key: 'gharas_bank', name: 'بنك غراس', emoji: '🌱',
    href: '/gharas-bank', col: 'gharas_bank_until', locked: '/gharas-bank-locked',
  },
  workshops: {
    key: 'workshops', name: 'الورش التعليمية', emoji: '🎓',
    href: '/api/tool-access?tool=workshops', col: 'workshops_until',
    locked: '/workshops-locked', external: true,
  },
  quran: {
    key: 'quran', name: 'القرآن الكريم', emoji: '🌿',
    href: '/quran', col: null, locked: null,
  },
  games: {
    key: 'games', name: 'ألعاب غراس التفاعلية', emoji: '🎮',
    href: '/games', col: null, locked: null,
  },
};

export function isKnownTool(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, key);
}

/** مفتاح المادة: stageSlug/gradeSlug/subjectSlug (شرائحُ الرابط الثابتة). */
export function subjectKey(stage: string, grade: string, subject: string): string {
  return `${stage}/${grade}/${subject}`;
}

const SLUG_SEG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export function parseSubjectKey(
  key: string
): { stage: string; grade: string; subject: string } | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;
  const [stage, grade, subject] = parts;
  if (!SLUG_SEG.test(stage) || !SLUG_SEG.test(grade) || !SLUG_SEG.test(subject)) return null;
  return { stage, grade, subject };
}

export function subjectPath(key: string): string | null {
  const p = parseSubjectKey(key);
  return p ? `/stage/${p.stage}/${p.grade}/${p.subject}` : null;
}

/** تحقّقٌ من صحّة الشكل قبل القبول في الـAPI — لا يخوّل، يمنع الفوضى فقط. */
export function isValidItemShape(type: string, key: string): type is WsItemType {
  if (typeof key !== 'string' || key.trim() === '' || key.length > 200) return false;
  if (type === 'tool') return isKnownTool(key);
  if (type === 'subject') return parseSubjectKey(key) !== null;
  return false;
}
