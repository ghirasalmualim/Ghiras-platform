/**
 * تقدير التسميع — مستويات لا أرقام.
 *
 * ═══ لماذا لا درجة من مئة ═══
 * ⚠️ «٧٢ من ١٠٠» يوحي بدقةٍ علمية لا نملكها. نظامنا لم يُقَس على صوت
 * طفل واحد بعد، ومزوّدنا لم ينشر رقمًا واحدًا عن تلاوة قرآنية. فرقمٌ
 * بمنزلتين عشريتين ادّعاءٌ لا يسنده شيء.
 *
 * والمستوى صادق: يقول «أتقنتِ معظمه» ولا يدّعي أنه يعرف أنها أتقنت
 * ٧٢٪ بالضبط. وإن احتجنا رقمًا داخليًا للإتقان فليبقَ داخليًا.
 *
 * ═══ الأثر النفسي ═══
 * الطفلة تحفظ كتاب الله. ورقمٌ منخفض يُقرأ حكمًا على علاقتها به لا
 * على جلسةٍ واحدة. فالعبارة تُصاغ لتقول: أين أنتِ الآن، وما التالي —
 * لا: كم خسرتِ.
 */

import type { AlignmentResult } from './alignment';

export type MasteryLevel =
  | 'EXCELLENT'
  | 'VERY_GOOD'
  | 'NEEDS_LIGHT'
  | 'NEEDS_REVIEW'
  /** لم نستطع الحكم — ليست درجةً بل امتناع عن الحكم. */
  | 'UNJUDGED';

export type Verdict = {
  level: MasteryLevel;
  /** العنوان الكبير — تشجيعٌ دائمًا. */
  headline: string;
  /** سطر يوضّح أين هي. */
  detail: string;
  /**
   * رقم داخلي ٠..١ للمراجعة المتباعدة — **لا يُعرض للطالبة**.
   * `null` حين لا نحكم أصلًا.
   */
  internalScore: number | null;
};

/**
 * تقدير النتيجة.
 *
 * ⚠️ `UNCERTAIN` لا يدخل الحساب إطلاقًا — لا يخفض مستوى ولا يظهر خطأً.
 * وما لم نتأكد منه لا يُحمَّل على الطالبة.
 */
export function gradeSession(result: AlignmentResult): Verdict {
  if (!result.usable)
    return {
      level: 'UNJUDGED',
      headline: 'ما قدرت أتأكد 🌿',
      detail: 'الصوت ما كان واضحًا كفاية عشان أحكم على تسميعك. نجرّب مرة ثانية؟',
      internalScore: null,
    };

  const { expectedWords, confirmedErrors, coverage } = result.summary;
  if (!expectedWords)
    return {
      level: 'UNJUDGED',
      headline: 'ما قدرت أتأكد 🌿',
      detail: 'نجرّب مرة ثانية؟',
      internalScore: null,
    };

  // الإتقان من التغطية المؤكَّدة وحدها
  const score = Math.max(0, Math.min(1, coverage));

  if (confirmedErrors === 0 && coverage >= 0.98)
    return {
      level: 'EXCELLENT',
      headline: 'أحسنت 🌿',
      detail: 'أتقنت المقطع كاملًا — ما فيه موضع واحد يحتاج مراجعة.',
      internalScore: score,
    };

  if (confirmedErrors <= 1 && coverage >= 0.9)
    return {
      level: 'VERY_GOOD',
      headline: 'أحسنت 🌿',
      detail: 'أتقنت معظم المقطع، وبقي موضع واحد نثبّته معًا.',
      internalScore: score,
    };

  if (confirmedErrors <= 3 && coverage >= 0.75)
    return {
      level: 'NEEDS_LIGHT',
      headline: 'ما شاء الله 🌱',
      detail: 'حفظك جيد، وفيه مواضع بسيطة تحتاج تثبيتًا.',
      internalScore: score,
    };

  return {
    level: 'NEEDS_REVIEW',
    headline: 'بدايةٌ طيبة 🌱',
    detail: 'نراجع بعض المواضع معًا وترجعين تسمّعن — والحفظ يثبت بالتكرار.',
    internalScore: score,
  };
}

/**
 * أحداثٌ تُحفظ الآن وتستعملها «حديقتي» لاحقًا.
 *
 * ⚠️ تُسجَّل ولا يُبنى عليها شيء في هذه المرحلة. وحفظها الآن يعني أن
 * الحديقة يوم تُبنى تجد تاريخًا حقيقيًا لا صفحةً بيضاء.
 */
export type RecitationEvent =
  | 'recitation_completed'
  | 'recitation_without_help'
  | 'weak_spot_improved'
  | 'review_completed';

export function eventsFor(
  result: AlignmentResult,
  verdict: Verdict,
  helpUsed: boolean
): RecitationEvent[] {
  if (!result.usable) return [];
  const out: RecitationEvent[] = ['recitation_completed'];
  if (!helpUsed && verdict.level !== 'UNJUDGED') out.push('recitation_without_help');
  return out;
}
