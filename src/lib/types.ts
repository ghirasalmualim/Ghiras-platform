/** أنواع البيانات الأساسية للمنصة */

export interface Stage {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_visible: boolean;
}

export interface Grade {
  id: string;
  stage_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_visible: boolean;
}

export interface Subject {
  id: string;
  grade_id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface Game {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  game_url: string;
  category: string | null;
  accent_color: string | null;
  sort_order: number;
  is_visible: boolean;
}

/* ─────────────────────────────────────────────
   بيانات احتياطية (Fallback)
   تُستخدم تلقائياً إذا لم تُضبط مفاتيح Supabase بعد،
   حتى تعمل الواجهة فوراً أثناء الإعداد.
   ───────────────────────────────────────────── */

export const SEED_STAGES: Stage[] = [
  { id: 'primary', name: 'المرحلة الابتدائية', slug: 'primary', sort_order: 1, is_visible: true },
  { id: 'middle', name: 'المرحلة المتوسطة', slug: 'middle', sort_order: 2, is_visible: true },
];

const PRIMARY_GRADES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];
const MIDDLE_GRADES = ['السادس', 'السابع', 'الثامن', 'التاسع'];

export const SEED_GRADES: Grade[] = [
  ...PRIMARY_GRADES.map((n, i) => ({
    id: `grade-${i + 1}`,
    stage_id: 'primary',
    name: `الصف ${n}`,
    slug: `grade-${i + 1}`,
    sort_order: i + 1,
    is_visible: true,
  })),
  ...MIDDLE_GRADES.map((n, i) => ({
    id: `grade-${i + 6}`,
    stage_id: 'middle',
    name: `الصف ${n}`,
    slug: `grade-${i + 6}`,
    sort_order: i + 1,
    is_visible: true,
  })),
];

const SUBJECT_DEFS = [
  { name: 'اللغة العربية', slug: 'arabic', icon: '📖', color: '#8E6FB0' },
  { name: 'اللغة الإنجليزية', slug: 'english', icon: '🔤', color: '#4A90B8' },
  { name: 'التربية الإسلامية', slug: 'islamic', icon: '🕌', color: '#7A9E7E' },
  { name: 'الرياضيات', slug: 'math', icon: '🔢', color: '#C9A84C' },
  { name: 'العلوم', slug: 'science', icon: '🔬', color: '#5BA88F' },
  { name: 'الاجتماعيات', slug: 'social', icon: '🗺️', color: '#C08552' },
];

export const SEED_SUBJECTS: Subject[] = SEED_GRADES.flatMap((g) =>
  SUBJECT_DEFS.map((s, i) => ({
    id: `${g.slug}-${s.slug}`,
    grade_id: g.id,
    name: s.name,
    slug: s.slug,
    icon: s.icon,
    color: s.color,
    sort_order: i + 1,
    is_visible: true,
  }))
);
