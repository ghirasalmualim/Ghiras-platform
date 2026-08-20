/**
 * الحروف المقطَّعة — تُكتب كلمةً وتُقرأ أسماءَ حروف.
 *
 * ملفٌ مستقل لأن المحرّك وطبقةَ العوارض يحتاجانه معًا، ووضعُه في
 * أحدهما يجعل الآخر يستورد منه فتنشأ حلقة.
 */

/** الأربعة عشر حرفًا التي تُفتتح بها السور. */
export const MUQATTAAT_LETTERS = 'المصركهيعطسحقن';

/** الحركات القصيرة — غيابُها علامةٌ فارقة. */
const SHORT_VOWELS = /[ً-ْ]/;

/**
 * هل هذه الكلمة حروفًا مقطَّعة؟
 *
 * ⚠️ يُستنبَط من النص لا من قائمة سورٍ مكتوبة بيدنا: الحروف المقطَّعة
 * لا تحمل حركةً قصيرة (إنما سكونًا ومدّة)، وحروفها من أربعة عشر حرفًا
 * معلومة. والشرطان معًا يعطيان **٢٩ سورة بالضبط** — وهو العدد المعروف،
 * فالكاشف مضبوط لا مقارب.
 */
export function isMuqattaat(uthmani: string): boolean {
  if (SHORT_VOWELS.test(uthmani)) return false;
  const letters = uthmani.replace(/[^ء-ي]/g, '');
  if (letters.length < 1 || letters.length > 5) return false;
  for (const ch of letters.split('')) {
    if (MUQATTAAT_LETTERS.indexOf(ch) === -1) return false;
  }
  return true;
}
