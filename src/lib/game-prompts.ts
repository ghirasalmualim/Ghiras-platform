/**
 * تعليماتُ الذكاء لألعاب المنصّة — تُبنى على الخادم وحدَه (قرار حصة 2026-10-12).
 *
 * كانت كلُّ صفحة لعبةٍ تكتبُ تعليماتها في المتصفّح وترسلُها كاملةً إلى
 * /api/game-ai، والخادمُ يمرّرُها كما هي — فكانَ بوسعِ أيِّ مستخدمةٍ أن تستبدلَ
 * التعليماتِ بما تشاء وتستعملَ الذكاءَ على حسابِ المنصّة لغيرِ الألعاب.
 * الآنَ يرسلُ المتصفّحُ بياناتِ الدرسِ فقط (الصف، الجنس، العنوان، النص، الصور)،
 * والنصُّ هنا هو الوحيدُ الذي يصلُ إلى الذكاء.
 *
 * النصوصُ منقولةٌ حرفيًّا من الصفحاتِ كما كانت، فلا يتغيّرُ شكلُ الأسئلة.
 */

export type GameId = 'millionaire' | 'balloons' | 'xo' | 'snake' | 'sinjim';

export const GAME_IDS: readonly GameId[] = ['millionaire', 'balloons', 'xo', 'snake', 'sinjim'];

export const GRADES = [
  'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
  'السادس', 'السابع', 'الثامن', 'التاسع',
] as const;

export interface GameInput {
  grade: string;
  gender: string;
  lessonName: string;
  text: string;
}

const head = (i: GameInput) =>
  `أنت خبير مناهج كويتي. أمامك محتوى درس للصف ${i.grade}${i.lessonName ? ` بعنوان "${i.lessonName}"` : ''}.`;

const genderNote = (g: string) =>
  g === 'بنات' ? 'خاطب الطالبات بصيغة المؤنث' : 'خاطب الطلاب بصيغة المذكر';

const tail = (text: string) => (text ? `\nنص الدرس:\n${text}` : '');

/** المليون وصيد البالونات: ١٠ أسئلة بمستوياتِ بلوم + اسمُ الدرس. */
function tenWithLevels(i: GameInput) {
  return `${head(i)}
ولّد 10 أسئلة اختيار من متعدد متدرّجة من السهل (تذكّر وفهم) إلى الصعب (تطبيق وتحليل وتقويم)، مستخرجة من محتوى الدرس فقط.
شروط: ${genderNote(i.gender)}. 4 خيارات، إجابة واحدة صحيحة، مشتتات خاطئة قطعاً. الشرح سطر واحد قصير جداً. الآيات والأحاديث تُنقل بدقة.
أجب بـ JSON مضغوط فقط بلا أسطر زائدة وبلا markdown:
{"lesson":"اسم الدرس","questions":[{"q":"..","options":["..","..","..",".."],"correct":0,"level":"تذكر","explain":".."}]}
${tail(i.text)}`;
}

/** إكس أو والسلم والثعبان: ١٠ أسئلة متدرّجة. */
function ten(i: GameInput) {
  return `${head(i)}
ولّد 10 أسئلة اختيار من متعدد متدرّجة من السهل إلى الصعب، مستخرجة من محتوى الدرس فقط.
شروط: ${genderNote(i.gender)}. 4 خيارات، إجابة واحدة صحيحة، مشتتات خاطئة قطعاً. الشرح سطر واحد قصير جداً. الآيات والأحاديث تُنقل بدقة.
أجب بـ JSON مضغوط فقط بلا markdown:
{"questions":[{"q":"..","options":["..","..","..",".."],"correct":0,"explain":".."}]}
${tail(i.text)}`;
}

/** سين جيم: ٣ فئات × ٥ أسئلة. */
function categories(i: GameInput) {
  return `${head(i)}
قسّم محتوى الدرس إلى 3 فئات (مواضيع) مناسبة، وولّد لكل فئة 5 أسئلة اختيار من متعدد متدرّجة من الأسهل إلى الأصعب (المجموع 15 سؤالاً)، مستخرجة من محتوى الدرس فقط.
شروط: ${genderNote(i.gender)}. 4 خيارات لكل سؤال، إجابة واحدة صحيحة، مشتتات خاطئة قطعاً. الشرح سطر واحد قصير جداً. الآيات والأحاديث تُنقل بدقة. اسم الفئة كلمة أو كلمتان.
أجب بـ JSON مضغوط فقط بلا markdown:
{"categories":[{"name":"اسم الفئة","questions":[{"q":"..","options":["..","..","..",".."],"correct":0,"explain":".."}]}]}
${tail(i.text)}`;
}

/**
 * التعليماتُ وسقفُ طولِ الجواب لكلِّ لعبة — السقفُ بيدِ الخادمِ لا المتصفّح.
 * ٣٥٠٠ لا ٢٥٠٠: سجلُّ game_ai_usage أظهرَ جوابَ إكس أو مقطوعًا عند ٢٥٠٠ بالضبط
 * فخرجتْ ٧ أسئلةٍ بدلَ ١٠ (2026-10-12). التكلفةُ على ما يُكتَبُ فعلًا لا على السقف.
 */
export function buildGamePrompt(game: GameId, input: GameInput): { prompt: string; maxTokens: number } {
  switch (game) {
    case 'millionaire':
    case 'balloons':
      return { prompt: tenWithLevels(input), maxTokens: 3500 };
    case 'xo':
    case 'snake':
      return { prompt: ten(input), maxTokens: 3500 };
    case 'sinjim':
      return { prompt: categories(input), maxTokens: 4096 };
  }
}
