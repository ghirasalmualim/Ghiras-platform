/**
 * أنواع «حديقتي» — لغة المجال، لا لغة قاعدة البيانات ولا المزوّد.
 *
 * ⚠️ **لا شيء هنا يعرف Azure ولا يذكره.** الحديقة تستقبل أحداثًا من
 * غراس وحدها: «أُكملت تلاوة»، «تحسّن موضع». ومن أين جاء الحكم على
 * التلاوة شأنٌ لا يخصّها. ولو بدّلنا المزوّد غدًا لما تغيّر في هذا
 * الملف حرف.
 *
 * ⚠️ ولا تجويد هنا ولا درجة نطق. النمو من الحفظ والمراجعة والالتزام،
 * والتجويد طورٌ مستقل لم يبدأ.
 */

/** البذور المتاحة — الاختيار جماليّ محض. */
export type PlantTypeKey = 'sunflower' | 'tulip' | 'rose' | 'herb' | 'tree';

/**
 * ⚠️ كل البذور سبع مراحل وبنفس الكلفة تمامًا.
 *
 * ولو جعلنا شجرةً أبطأ من زهرة لصار في الاختيار «أفضل» و«أسهل»،
 * ولانقلب اختيارٌ جماليّ إلى حسبة. والوردة والشجرة عند الحديقة سواء.
 */
export type PlantType = {
  key: PlantTypeKey;
  /** الاسم كما يُعرض. */
  nameAr: string;
  /** وصفٌ قصير يعين على الاختيار، لا يَعِد بشيء. */
  hintAr: string;
};

export const PLANT_TYPES: readonly PlantType[] = [
  { key: 'sunflower', nameAr: 'دوّار الشمس', hintAr: 'يتبع الضوء طول النهار' },
  { key: 'tulip', nameAr: 'التوليب', hintAr: 'هادئة ومرتّبة' },
  { key: 'rose', nameAr: 'الوردة', hintAr: 'تتفتّح على مهل' },
  { key: 'herb', nameAr: 'النبتة الخضراء', hintAr: 'بسيطة ودائمة الخضرة' },
  { key: 'tree', nameAr: 'الشجرة', hintAr: 'تكبر لتظلّل ما حولها' },
] as const;

export function isPlantType(v: unknown): v is PlantTypeKey {
  return typeof v === 'string' && PLANT_TYPES.some((p) => p.key === v);
}

/**
 * مراحل النمو — رقمٌ داخليّ لا يُعرض.
 *
 * ⚠️ الطالبة ترى نبتتها تكبر، ولا ترى «٤ من ٦». والرقم هنا ليقرأه
 * الكود ويختار الرسم، لا لتقرأه هي. وعرضُه يحوّل النمو إلى عدّاد.
 */
export type GrowthStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const STAGE_LABELS: Record<GrowthStage, string> = {
  0: 'بذرة',
  1: 'بداية الإنبات',
  2: 'برعم صغير',
  3: 'ساق وأوراق',
  4: 'نبتة نامية',
  5: 'نبتة مكتملة',
  6: 'مكتملة',
};

/**
 * أسباب استحقاق قطرة ماء.
 *
 * ⚠️ ليس فيها «عدد الآيات» ولا «طول المقطع» عن قصد. من حفظ ثلاث آيات
 * قصار ومن حفظ صفحة يأخذان القطرة نفسها — لأن الحديقة تكافئ الرجوع
 * والإتقان والمراجعة، لا الكمّ. ولو كافأت الكمّ لصارت سباقًا في كتاب
 * الله، وهذا ما لا نريده.
 */
export type DropReason =
  /** جلسة تسميع صالحة أُكملت — الالتزام. */
  | 'recitation_completed'
  /** أُكملت بلا طلب عون — الاستقلال. */
  | 'recitation_without_help'
  /** المقطع أُتقن كاملًا — الإتقان. */
  | 'passage_mastered'
  /** موضعٌ ضعيف تحسّن عمّا كان — التحسّن. */
  | 'weak_spot_improved'
  /** مراجعة مستحقّة أُنجزت في وقتها — المراجعة. */
  | 'review_completed';

export const DROP_REASONS: readonly DropReason[] = [
  'recitation_completed',
  'recitation_without_help',
  'passage_mastered',
  'weak_spot_improved',
  'review_completed',
] as const;

/** ما يُقال عند السقي — قصير ودافئ، بلا وعدٍ شرعيّ. */
export const DROP_LABELS: Record<DropReason, string> = {
  recitation_completed: 'أكملت تسميعك',
  recitation_without_help: 'سمّعت بدون مساعدة',
  passage_mastered: 'أتقنت المقطع كاملًا',
  weak_spot_improved: 'ثبّت موضعًا كان صعبًا',
  review_completed: 'راجعت في وقتها',
};

/** الزينة — تُفتح بالإنجاز، لا تُشترى ولا تُقامَر عليها. */
export type RewardKey =
  | 'stone'
  | 'fence'
  | 'butterfly'
  | 'lamp'
  | 'bench'
  | 'bird'
  | 'fountain'
  | 'lantern';

export const REWARD_LABELS: Record<RewardKey, string> = {
  stone: 'حجر جميل',
  fence: 'سياج صغير',
  butterfly: 'فراشة',
  lamp: 'مصباح حديقة',
  bench: 'مقعد',
  bird: 'طائر صغير',
  fountain: 'نافورة صغيرة',
  lantern: 'فانوس',
};
