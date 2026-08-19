/**
 * سُلَّم التلميحات — في وضع التدريب وحده.
 *
 * ═══ القاعدة ═══
 * ⚠️ لا تُعرض الآية كاملة من أول تعثّر. التذكّر عضلةٌ تُبنى بالمحاولة،
 * وإعطاء الجواب فورًا يمنع بناءها ويحوّل التسميع إلى قراءة.
 *
 * فالسُّلَّم يصعد درجةً درجة، والطالبة هي التي تطلب — إلا الدرجة
 * الأولى فتظهر وحدها لأنها تشجيعٌ لا جواب.
 *
 * ═══ الصوت ═══
 * ⚠️ تشغيل التلاوة يوقف التسجيل مؤقتًا: الميكروفون سيلتقط صوت القارئ
 * وإلا فيُحسب على الطالبة. وiOS يحوّل الصوت إلى السماعة الخارجية فور
 * فتح الميكروفون، فالتداخل مؤكّد لا محتمل.
 *
 * ═══ والنص ═══
 * ⚠️ كل ما يُعرض هنا من `text_uthmani` كما هو. لا يولّده ذكاء اصطناعي،
 * ولا يُعاد صوغه، ولا يُكتب من ذاكرة أحد.
 */

import type { ExpectedWord } from './alignment';

export type HintLevel = 0 | 1 | 2 | 3;

export type Hint =
  | { level: 1; kind: 'ENCOURAGE'; text: string }
  | { level: 2; kind: 'PLAY'; surah: number; ayah: number; text: string }
  | { level: 3; kind: 'REVEAL'; words: string[]; text: string };

/** كم كلمة تُكشف في الدرجة الأخيرة — أقلّ ما يُذكّر لا ما يُغني. */
const REVEAL_WORDS = 2;

/**
 * التلميح التالي.
 *
 * `position` موضع الطالبة المرجَّح في المقطع (رقم الكلمة المتوقَّعة).
 * ويأتي من آخر كلمة طابقت، لا من تخمين.
 */
export function nextHint(
  expected: ExpectedWord[],
  position: number,
  level: HintLevel
): Hint | null {
  const at = Math.max(0, Math.min(position, expected.length - 1));
  const word = expected[at];
  if (!word) return null;

  switch (level) {
    case 0:
      return { level: 1, kind: 'ENCOURAGE', text: 'خذي وقتك 🌱' };

    case 1:
      return {
        level: 2,
        kind: 'PLAY',
        surah: word.surah,
        ayah: word.ayah,
        text: 'نسمع الموضع من القارئ، ثم تكملين',
      };

    case 2: {
      const words: string[] = [];
      for (let i = at; i < expected.length && words.length < REVEAL_WORDS; i++)
        words.push(expected[i].uthmani);
      return {
        level: 3,
        kind: 'REVEAL',
        words,
        text: words.length === 1 ? 'الكلمة التالية:' : 'الكلمات التالية:',
      };
    }

    default:
      // لا درجة رابعة: بعدها تُعاد المحاولة، لا يُعرض المقطع كله
      return null;
  }
}

/**
 * موضع الطالبة من نتائج المقاطع المكتملة.
 *
 * ⚠️ من **آخر كلمة طابقت** لا من عدد الكلمات المسموعة: المزوّد قد
 * يزيد أو ينقص، والمطابقة وحدها موضعٌ موثوق.
 */
export function positionFromMatches(lastMatchedPosition: number | null): number {
  return lastMatchedPosition === null ? 0 : lastMatchedPosition + 1;
}
