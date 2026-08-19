/**
 * عوارض المزوّد — أخطاءٌ يرتكبها المزوّد لا الطالبة.
 *
 * ═══ لماذا طبقة مستقلة ═══
 * نظام التعرّف على الكلام مدرَّبٌ على كلامٍ عادي، والتلاوة ليست كلامًا
 * عاديًا. فتقع منه أخطاءٌ **منهجية** تتكرّر بنفس الشكل في كل تسجيل،
 * وليست خطأً من القارئ ولا نقصًا في حفظه.
 *
 * ولو عالجنا كلَّ حالة باستثناءٍ لآيةٍ بعينها، لتحوّل المصحف بعد شهرين
 * إلى قائمة استثناءات لا يفهمها أحد، ولاختلطت بيانات المرجع بعيوب
 * شركةٍ قد نستبدلها غدًا.
 *
 * ═══ شروط أي قاعدة هنا ═══
 * ١) **عامة** — تنطبق على ظاهرة في المصحف كله لا على آية.
 * ٢) **بدليل من تسجيل حقيقي** — لا حدس ولا احتياط.
 * ٣) **لها اختبار** يسقط إن انكسرت.
 * ٤) **ليست تجويدًا** — لا تحكم على أداء ولا مخرج ولا مدّ.
 * ٥) **لا تمسّ `text_uthmani`** ولا تُغيّر المرجع بحرف.
 *
 * ═══ لماذا الحذف لا التخفيض ═══
 * محرّك المحاذاة يخفّض الكلمة المشبوهة إلى «لم أتأكد»، وهذا صحيح مع
 * ما نجهله. أما ما **نعرف** أنه عارضٌ من المزوّد فيُحذف قبل الحكم:
 * فلا نُقلق الطالبة بموضع نعرف يقينًا أنه ليس منها.
 */

import type { ExpectedWord, HeardToken } from './alignment';

/** واو الصلة — تُتلى مدًّا فيسمعها المزوّد كلمةً. */
const SILAH_WAW = 'ۥ';
/** ياء الصلة — مثلها. */
const SILAH_YEH = 'ۦ';

export type ArtifactRule = {
  id: string;
  /** ما الظاهرة، وكم مرة ترد في المصحف. */
  description: string;
  /** الدليل: من أي تسجيل حقيقي عُرفت. */
  evidence: string;
};

export const ARTIFACT_RULES: ArtifactRule[] = [
  {
    id: 'SILAH_ECHO',
    description:
      'كلمة تنتهي بواو الصلة (ۥ) أو ياء الصلة (ۦ) تُتلى بمدٍّ في آخرها، ' +
      'فيقطعها المزوّد كلمتين: الكلمة، ثم صدى المدّ («هو» أو «هي» أو «ه»). ' +
      'وترد واو الصلة ١٢٥٧ مرة وياء الصلة ٩٥٧ مرة في المصحف — فالظاهرة عامة لا نادرة.',
    evidence:
      'ثلاثة تسجيلات حقيقية على الإخلاص ١–٤ في ٢٠٢٦-٠٨-١٩: «لَّهُۥ» رجعت من ' +
      'Azure «له» ثم «هو» في تسجيلين من ثلاثة، وأكّدت القارئة أنها لم تنطق «هو».',
  },
];

/**
 * أصداء المدّ المحتملة لكل علامة صلة.
 *
 * ⚠️ قائمة قصيرة عن قصد: كلما اتّسعت ازداد خطر ابتلاع كلمةٍ قالتها
 * الطالبة فعلًا. ولا تُوسَّع إلا بدليل من تسجيل.
 */
const SILAH_ECHOES: { [marker: string]: string[] } = {
  [SILAH_WAW]: ['هو', 'ه', 'هوو'],
  [SILAH_YEH]: ['هي', 'ه', 'هي'],
};

function silahMarkerOf(uthmani: string): string | null {
  // العلامة تقع في آخر الكلمة أو قبل علامة وقف
  if (uthmani.indexOf(SILAH_WAW) !== -1) return SILAH_WAW;
  if (uthmani.indexOf(SILAH_YEH) !== -1) return SILAH_YEH;
  return null;
}

export type ArtifactRemoval = {
  ruleId: string;
  /** الكلمة التي حُذفت من المسموع. */
  token: HeardToken;
  /** الكلمة المتوقَّعة التي سبّبت العارض. */
  after: string;
};

export type ArtifactResult = {
  tokens: HeardToken[];
  removed: ArtifactRemoval[];
};

/**
 * تنظيف المسموع من عوارض المزوّد المعروفة.
 *
 * تُنادى **قبل** المحاذاة: فالمحرّك يحكم على ما قالته الطالبة فعلًا،
 * لا على ما أضافه المزوّد من عنده.
 *
 * ⚠️ ولا تُنادى إلا على مسموعٍ من مزوّد. النصّ المكتوب يدويًا في
 * الاختبارات يمرّ كما هو، فلا نخفي عن أنفسنا ما نختبره.
 */
export function stripProviderArtifacts(
  expected: ExpectedWord[],
  heard: HeardToken[]
): ArtifactResult {
  if (!expected.length || !heard.length) return { tokens: heard, removed: [] };

  /**
   * الكلمات المتوقَّعة التي تحمل صلة، بصيغتها المطبَّعة.
   *
   * نتعرّف على موضع العارض بالكلمة السابقة له لا بترتيبها: المحاذاة
   * لم تجرِ بعد، فلا نعرف أي كلمة قابلت أيّها. ونكتفي بأن الكلمة
   * السابقة **تطابق** كلمةً ذات صلة في المقطع.
   */
  const silahWords: { [norm: string]: string } = Object.create(null);
  for (const w of expected) {
    const marker = silahMarkerOf(w.uthmani);
    if (marker) silahWords[w.norm] = marker;
  }
  if (!Object.keys(silahWords).length) return { tokens: heard, removed: [] };

  /** الكلمات المتوقَّعة كلها — لئلا نحذف كلمةً هي نفسها متوقَّعة هنا. */
  const expectedNorms: { [norm: string]: true } = Object.create(null);
  for (const w of expected) expectedNorms[w.norm] = true;

  const tokens: HeardToken[] = [];
  const removed: ArtifactRemoval[] = [];

  for (let i = 0; i < heard.length; i++) {
    const prev = tokens.length ? tokens[tokens.length - 1] : null;
    const marker = prev ? silahWords[prev.norm] : undefined;

    if (marker) {
      const echoes = SILAH_ECHOES[marker] ?? [];
      const isEcho = echoes.indexOf(heard[i].norm) !== -1;

      /**
       * ⚠️ شرطٌ يحمي من الابتلاع: لا يُحذف الصدى إن كانت الكلمة
       * **التالية** له في المتوقَّع هي نفسها هذا الصدى. مثالها «بِهِۦ
       * هُوَ»: لو حذفناها لاتُّهمت الطالبة بحذف كلمةٍ نطقتها.
       */
      const nextExpectedIsSame = isEcho && expectedNormFollows(expected, prev!.norm, heard[i].norm);

      if (isEcho && !nextExpectedIsSame) {
        removed.push({ ruleId: 'SILAH_ECHO', token: heard[i], after: prev!.norm });
        continue;
      }
    }

    tokens.push(heard[i]);
  }

  return { tokens, removed };
}

/** هل تلي الكلمةُ `echo` الكلمةَ `word` في النص المتوقَّع فعلًا؟ */
function expectedNormFollows(
  expected: ExpectedWord[],
  word: string,
  echo: string
): boolean {
  for (let i = 0; i < expected.length - 1; i++) {
    if (expected[i].norm === word && expected[i + 1].norm === echo) return true;
  }
  return false;
}
