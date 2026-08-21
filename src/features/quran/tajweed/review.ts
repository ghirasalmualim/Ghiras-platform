import type { TajweedRule } from './types';

/**
 * طبقة مراجعة المختصّ — سجلٌّ فوق المحرّك لا داخله.
 *
 * ⚠️ **لا يُعدَّل منطق المحرّك من هنا.** هذا الملف يصف ما فعله
 * المحرّك ويحمل حكم المختصّ عليه. والتعديل — إن لزم — يقع في التزامٍ
 * مستقلّ يُقارَن قبله وبعده.
 *
 * ⚠️ **ولا يُعرض حكمٌ على متعلّم ما لم يكن `reviewStatus === 'approved'`.**
 * والقاعدة غير المراجَعة تبقى مشتقّةً في الذاكرة ولا تصل إلى شاشة.
 */

/** نسخة المحرّك التي جرت عليها المراجعة — التزامُ git. */
export const ENGINE_VERSION = 'ea68e3a';

export type ReviewStatus =
  /** لم تُراجَع بعد. */
  | 'pending'
  /** ✅ صحيحة كما هي. */
  | 'approved'
  /** ⚠️ صحيحة مع تعديل — التعديل في `reviewerNote`. */
  | 'approved_with_change'
  /** ❌ غير صحيحة. */
  | 'rejected'
  /** 🔍 تحتاج نظرًا أطول. */
  | 'needs_more_review';

/**
 * ما نعرفه عن كل قاعدة — ومن أين جاءت.
 *
 * ⚠️ `quranicEvidence` شاهدٌ من المصحف لا من كتابٍ ننقل عنه، لأن
 * المختصّ يحكم على ما استدلَّ به المحرّك لا على ما نقلناه.
 */
export type RuleProvenance = {
  ruleId: TajweedRule;
  nameAr: string;
  /** القاعدة بلغةٍ يفهمها المقرئ. */
  ruleAr: string;
  /** كيف استدلّ المحرّك عليها من الرسم. */
  derivationMethod: string;
  /** شواهد من المصحف نفسه. */
  quranicEvidence: string[];
  /** ما افترضناه تقنيًا — وهو موضع السؤال الأول. */
  technicalAssumption: string[];
  /** ما امتنع المحرّك عن الجزم به عمدًا. */
  deliberateAbstention: string[];
  /** عدد المواضع في المصحف كاملًا. */
  occurrences: number;
};

/** حكم المختصّ على قاعدة واحدة. */
export type ReviewDecision = {
  ruleId: TajweedRule;
  reviewStatus: ReviewStatus;
  /** ملاحظة المختصّ — نصٌّ حرّ. */
  reviewerNote: string;
  /** تاريخ المراجعة (ISO). */
  reviewedAt: string | null;
  /** نسخة المحرّك التي رُوجعت. */
  engineVersion: string;
};

/**
 * سجلّ المراجعة كاملًا.
 *
 * ⚠️ **يُخزَّن ملفًّا مستقلًّا** (`tajweed-review.json`) لا داخل الكود
 * ولا داخل نصّ المصحف. فإدخال نتيجة المراجعة لاحقًا **لا يمسّ حرفًا
 * من `text_uthmani`** ولا سطرًا من المحرّك — يُستبدل ملفُ السجلّ وحده.
 */
export type ReviewLedger = {
  engineVersion: string;
  /** ⚠️ اسم المختصّ لا يُعرض للمستخدم إلا بقرارٍ مستقل. */
  reviewer?: string;
  decisions: ReviewDecision[];
};

/** هل تُعرض هذه القاعدة لمتعلّم؟ */
export function isUserFacing(
  rule: TajweedRule,
  ledger: ReviewLedger | null
): boolean {
  if (!ledger || ledger.engineVersion !== ENGINE_VERSION) return false;
  const d = ledger.decisions.find((x) => x.ruleId === rule);
  return d?.reviewStatus === 'approved' || d?.reviewStatus === 'approved_with_change';
}

/**
 * وصف كل قاعدة كما نفّذها المحرّك — مصدر حزمة المراجعة.
 *
 * ⚠️ **مكتوبٌ من الكود لا من الذاكرة**: كل سطر هنا يصف شرطًا فعليًا
 * في `engine.ts`. ولو خالفه الكود يومًا صار الوصف كذبًا على المختصّ.
 */
export const RULE_CATALOGUE: Omit<RuleProvenance, 'occurrences'>[] = [
  {
    ruleId: 'idhhar',
    nameAr: 'إظهار',
    ruleAr: 'نونٌ ساكنة أو تنوين يليه حرفٌ من حروف الحلق الستة (ء أ إ ه ع ح غ خ) فيُظهَر.',
    derivationMethod:
      'النون تحمل سكونًا ظاهرًا في الرسم، والحرف الذي يليها من حروف الحلق. ويُضاف إليه الإظهار المطلق: نونٌ ساكنة يليها واوٌ أو ياء في الكلمة نفسها.',
    quranicEvidence: ['مِنْ هَادٍ', 'ٱلدُّنْيَا', 'بُنْيَٰن'],
    technicalAssumption: [
      'اعتبرنا صور الهمزة (أ إ آ ء) حرفَ حلقٍ واحدًا في المقارنة.',
      'اعتبرنا سكونَ النون في الرسم دليلًا كافيًا على الإظهار.',
    ],
    deliberateAbstention: [],
  },
  {
    ruleId: 'ikhfa',
    nameAr: 'إخفاء',
    ruleAr: 'نونٌ ساكنة أو تنوين يليه أحد الخمسة عشر حرفًا الباقية فتُخفى مع غنّة.',
    derivationMethod:
      'النون عاريةٌ في الرسم من كل حركة وسكون — وهذا اصطلاح الرسم للإخفاء — والحرف الذي يليها ليس من الحلق ولا من حروف الإدغام ولا باءً.',
    quranicEvidence: ['عِندَ', 'أُنزِلَ', 'مِن قَبْلِ', 'يُنفِقُونَ'],
    technicalAssumption: [
      '⚠️ الحرف العاري من كل علامة ساكنٌ — وهذا اصطلاح الرسم العثماني.',
      '⚠️ ألفُ تنوين الفتح (كِتَٰبًا) رسمٌ لا حرفٌ منطوق، فتُتخطّى ولا تُعدّ الحرف التالي.',
    ],
    deliberateAbstention: [],
  },
  {
    ruleId: 'iqlab',
    nameAr: 'إقلاب',
    ruleAr: 'نونٌ ساكنة أو تنوين يليه باء، فتُقلَب ميمًا مخفاةً بغنّة.',
    derivationMethod:
      'يُعرَف بعلامته في الرسم: ميمٌ صغيرة فوقية (ۢ) توضع على النون أو بعد التنوين. ولم نستنتجه من الحروف، بل قرأناه من الرسم.',
    quranicEvidence: ['مِنۢ بَعْدِ', 'أَلِيمٌۢ بِمَا', 'عَوَانٌۢ بَيْنَ'],
    technicalAssumption: [
      'اعتمدنا علامة الرسم دليلًا قاطعًا، ولم نحكم بالإقلاب حيث لا علامة.',
    ],
    deliberateAbstention: [
      '⚠️ ٣٢ موضعًا تقع علامتُها في آخر الآية والباءُ في أول التي تليها — لم نحكم فيها، لأن الحكم يقع بالوصل ويسقط بالوقف، ولا نعلم أيّهما يختار القارئ. وهي كلُّ ما امتنعنا عنه: من ٥١٠ علاماتٍ في المصحف حكمنا بـ٤٧٨، والباقي كلُّه في أواخر الآيات بلا استثناء.',
    ],
  },
  {
    ruleId: 'idgham_ghunnah',
    nameAr: 'إدغام بغنّة',
    ruleAr: 'نونٌ ساكنة أو تنوين يليه (ي ن م و) في كلمةٍ أخرى فيُدغَم مع بقاء الغنّة.',
    derivationMethod:
      'النون عاريةٌ في الرسم، والحرف التالي من (ينمو)، وهو في كلمةٍ غير كلمتها. ⚠️ ولم نشترط الشدّة: الرسم يكتبها مع (ن م) ولا يكتبها مع (ي و) لأن الإدغام فيهما ناقصٌ والغنّة باقية.',
    quranicEvidence: ['مَن يَقُولُ', 'مِن وَلِىٍّ', 'مِن نِّعْمَةٍ', 'مِن مَّاءٍ'],
    technicalAssumption: [
      '⚠️ اشتراطُ اختلاف الكلمة هو ما يفصل الإدغام عن الإظهار المطلق، بدل كتابة الكلمات الأربع بأسمائها.',
    ],
    deliberateAbstention: [],
  },
  {
    ruleId: 'idgham_no_ghunnah',
    nameAr: 'إدغام بغير غنّة',
    ruleAr: 'نونٌ ساكنة أو تنوين يليه لامٌ أو راء فيُدغَم بلا غنّة.',
    derivationMethod:
      'النون عاريةٌ في الرسم، والحرف التالي لامٌ أو راءٌ **مشدّدة** — والشدّة مكتوبةٌ دائمًا في هذين لأن الإدغام كامل.',
    quranicEvidence: ['مِن رَّبِّ', 'مِن لَّدُنْ'],
    technicalAssumption: ['اشترطنا الشدّة المكتوبة، ووجدناها في المواضع كلها بلا استثناء.'],
    deliberateAbstention: [],
  },
  {
    ruleId: 'ikhfa_shafawi',
    nameAr: 'إخفاء شفوي',
    ruleAr: 'ميمٌ ساكنة يليها باء فتُخفى مع غنّة.',
    derivationMethod: 'ميمٌ ساكنة أو عارية غير مشدّدة، والحرف التالي باء.',
    quranicEvidence: ['هُم بِهِۦ', 'تَرْمِيهِم بِحِجَارَةٍ'],
    technicalAssumption: [],
    deliberateAbstention: [],
  },
  {
    ruleId: 'idgham_shafawi',
    nameAr: 'إدغام شفوي',
    ruleAr: 'ميمٌ ساكنة يليها ميم فتُدغَم مع غنّة.',
    derivationMethod: 'ميمٌ ساكنة أو عارية غير مشدّدة، والحرف التالي ميم.',
    quranicEvidence: ['لَهُم مَّا'],
    technicalAssumption: [],
    deliberateAbstention: [],
  },
  {
    ruleId: 'idhhar_shafawi',
    nameAr: 'إظهار شفوي',
    ruleAr: 'ميمٌ ساكنة يليها غير الباء والميم فتُظهَر.',
    derivationMethod:
      'ميمٌ تحمل سكونًا ظاهرًا، والحرف التالي ليس باءً ولا ميمًا. ⚠️ واشترطنا السكون الظاهر هنا احتياطًا، فلم نحكم على الميم العارية بالإظهار.',
    quranicEvidence: ['أَمْ لَمْ', 'عَلَيْهِمْ وَلَا'],
    technicalAssumption: ['⚠️ اشتراط السكون الظاهر قد يُسقط مواضع صحيحة — وهذا موضع سؤال.'],
    deliberateAbstention: [],
  },
  {
    ruleId: 'ghunnah',
    nameAr: 'غنّة',
    ruleAr: 'نونٌ أو ميمٌ مشدّدة، وفيها غنّة بمقدار حركتين.',
    derivationMethod: 'الحرف نونٌ أو ميم ويحمل شدّة في الرسم.',
    quranicEvidence: ['إِنَّ', 'ثُمَّ', 'ٱلنَّاسِ'],
    technicalAssumption: [
      '⚠️ حكمنا على **كل** نونٍ وميمٍ مشدّدة في المصحف، وصلًا ووقفًا وابتداءً.',
    ],
    deliberateAbstention: [],
  },
  {
    ruleId: 'qalqalah',
    nameAr: 'قلقلة',
    ruleAr: 'أحد حروف (قطب جد) ساكنًا، فيُقلقَل.',
    derivationMethod: 'الحرف من (ق ط ب ج د) ويحمل سكونًا ظاهرًا أو يكون عاريًا غير صامت.',
    quranicEvidence: ['قَدْ أَفْلَحَ', 'أَبْصَٰرِهِمْ', 'يَجْعَلُونَ'],
    technicalAssumption: [
      '⚠️ لم نفرّق بين الصغرى والكبرى: الكبرى تقع بالوقف، ولا نعلم أين يقف القارئ.',
    ],
    deliberateAbstention: [
      'لم نحكم بالقلقلة على حرفٍ متحرّك يصير ساكنًا بالوقف.',
    ],
  },
  {
    ruleId: 'lam_shamsiyyah',
    nameAr: 'لام شمسية',
    ruleAr: 'لام التعريف قبل حرفٍ شمسيّ، فلا تُنطق ويُشدَّد ما بعدها.',
    derivationMethod:
      'همزةُ وصل، ثم لامٌ عارية، ثم حرفٌ شمسيٌّ **مشدّد** في الكلمة نفسها. واشتراط الشدّة هو ما يفصلها عن القمرية.',
    quranicEvidence: ['ٱلرَّحْمَٰنِ', 'ٱلنَّاسِ', 'ٱلضَّآلِّينَ'],
    technicalAssumption: [
      '⚠️ أدخلنا لفظ الجلالة (ٱللَّه) في العدّ لأن اللام حرفٌ شمسيّ — وهو موضع سؤال.',
    ],
    deliberateAbstention: [],
  },
  {
    ruleId: 'hamzat_wasl',
    nameAr: 'همزة وصل',
    ruleAr: 'همزةٌ تُنطق في الابتداء وتسقط في الوصل.',
    derivationMethod: 'وجود المحرف ٱ في الرسم.',
    quranicEvidence: ['ٱللَّهِ', 'ٱلْحَمْدُ', 'وَٱسْتَكْبَرَ'],
    technicalAssumption: [
      '⚠️ حكمنا على كل همزة وصل في المصحف، ولم نستثنِ التي في أول الآية — وهي تُنطق عند الابتداء بها.',
    ],
    deliberateAbstention: [],
  },
];
