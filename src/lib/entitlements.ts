/**
 * مصدرٌ واحد لحقيقة الاشتراكات.
 *
 * ⚠️ **التعريف كان مكرَّرًا مرّتين** — في `AdminPanel` و`AccountBar` — وثالثةٌ
 * في «حسابي» كانت تجعلها ثلاثًا تفترق. وقد رأينا ما يقع حين يتكرّر تعريفٌ
 * واحد في ثلاثة مواضع: فحصُ نطاق الكوكي اختلف بينها فسقطت الجلسات.
 *
 * ⚠️ والتعريف منقولٌ من `AdminPanel` لا مخترَعًا: `hasAnything` و`nearestEnd`
 * كما هما هناك حرفًا، فلا تفترق اللوحةُ عن صفحة المشترك في وصف حسابه.
 */

/** أعمدة الأدوات المدفوعة — تسعةٌ حُصرت بحثًا في الكود كلّه. */
export const TOOL_COLS = [
  'studio_until',
  'gradebook_until',
  'attendance_until',
  'head_records_until',
  'adventure_until',
  'multiplication_until',
  'workshops_until',
  'clock_until',
  'interactive_games_until',
] as const;

export type ToolCol = (typeof TOOL_COLS)[number];

/**
 * الأسماء العربية — منقولةٌ من عناوين صفحات «مقفلة» في المشروع.
 *
 * ⚠️ وحُذف منها «— خاص بالمشتركات»: صيغةٌ مؤنّثة، والمنصّة يستعملها
 * معلّمون ومعلّمات. ⚠️ و`sub_end` وحده اسمُه مستنتَج — لا عنوانَ له في الكود.
 */
export const ENTITLEMENT_NAMES: Record<string, string> = {
  sub_end: 'الألعاب التعليمية والمواد',
  studio_until: 'استوديو الحصة الذكية',
  gradebook_until: 'سجل الدرجات الذكي',
  attendance_until: 'سجل الحضور الذكي',
  head_records_until: 'سجلات رئيس القسم',
  adventure_until: 'مغامرة المجموعات التفاعلية',
  multiplication_until: 'جدول الضرب التفاعلي',
  workshops_until: 'الورش التعليمية',
  clock_until: 'الساعة التفاعلية',
  interactive_games_until: 'ألعاب غراس التفاعلية',
};

/** كل الأعمدة التي تحمل تاريخ انتهاء — `sub_end` ثم الأدوات. */
export const DATE_COLS = ['sub_end', ...TOOL_COLS] as const;

export type EntitlementRow = {
  key: string;
  name: string;
  /** التاريخ الخام كما جاء من القاعدة — `date` أو `timestamptz` */
  until: string | null;
  active: boolean;
};

/**
 * ⚠️ **`date` و`timestamptz` لا يُعامَلان معاملةً واحدة.**
 *
 * `sub_end` و`head_records_until` من نوع `date` (`2027-08-22`)، وبقيّة
 * الأدوات `timestamptz`. و`new Date('2027-08-22')` يُفسَّر **منتصف ليل
 * UTC** — أي ٣:٠٠ فجرًا بتوقيت الكويت. فيوم الانتهاء يبدو منقضيًا قبل
 * أوانه بثلاث ساعات لو قِيس بلحظةٍ لا بيوم.
 *
 * فالتاريخُ المجرَّد يُقارَن بيومٍ لا بلحظة، والطابعُ الزمني يُقارَن بلحظته.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isStillValid(raw: string | null): boolean {
  if (!raw) return false;
  if (DATE_ONLY.test(raw)) {
    // يومٌ مجرَّد: سارٍ ما دام يومَ اليوم أو بعده
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return raw >= todayStr;
  }
  const t = new Date(raw);
  return !Number.isNaN(t.getTime()) && t.getTime() > Date.now();
}

/** الكويت `UTC+3` ثابتًا بلا توقيتٍ صيفي — كما في `features/quran/engine/daytime.ts`. */
const KW_OFFSET_MS = 3 * 60 * 60 * 1000;

/** `DD/MM/YYYY` — واليومُ المجرَّد يُعرض كما هو بلا إزاحة. */
export function fmtDate(raw: string | null): string | null {
  if (!raw) return null;
  if (DATE_ONLY.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return null;
  const k = new Date(t.getTime() + KW_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(k.getUTCDate())}/${p(k.getUTCMonth() + 1)}/${k.getUTCFullYear()}`;
}

type ProfileLike = Record<string, unknown>;

/** كل استحقاقٍ سبق أن مُنح — الساري والمنتهي معًا. ما لم يُمنح قطُّ لا يُعرض. */
export function listEntitlements(p: ProfileLike): EntitlementRow[] {
  return DATE_COLS.map((k) => {
    const raw = (p[k] as string | null) ?? null;
    return { key: k, name: ENTITLEMENT_NAMES[k] ?? k, until: raw, active: isStillValid(raw) };
  }).filter((e) => Boolean(e.until));
}

/** هل مُنح شيءٌ يومًا؟ — نظير `hasAnything` في `AdminPanel`. */
export function hasAnyEntitlement(p: ProfileLike): boolean {
  return DATE_COLS.some((k) => Boolean(p[k]));
}

/** هل يسري شيءٌ الآن؟ — نظير `nearestEnd !== Infinity`. */
export function hasActiveEntitlement(p: ProfileLike): boolean {
  return DATE_COLS.some((k) => isStillValid((p[k] as string | null) ?? null));
}
