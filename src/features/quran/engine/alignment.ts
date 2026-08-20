/**
 * محرّك المحاذاة القرآنية — قلب التسميع.
 *
 * ═══ ما هو ═══
 * يأخذ ما **يُفترض** أن يُقرأ (من مصحفنا المرجعي) وما **سُمع** (كلمات
 * من أي مزوّد صوت)، ويُخرج محاذاة تقول لكل كلمة: أصابها أم حذفها أم
 * زاد عليها أم أبدلها أم كرّرها أم تخطّى موضعها.
 *
 * ═══ لماذا هو ملكنا لا ملك المزوّد ═══
 * الحكم على حفظ الطفل قرارٌ نتحمّله نحن. فالمحرّك **حتمي** — نفس
 * المُدخل يعطي نفس المُخرج دائمًا — ولا يستشير نموذجًا ولا يسأل ذكاءً
 * اصطناعيًا «هل قرأ صح؟». المزوّد يسمع فقط، ونحن نحكم.
 *
 * ولهذا نموذج الأخطاء هنا **نموذج غراس** لا نموذج أي شركة. حين يأتي
 * مزوّد، يُكتب له مهايئ يترجم مخرجاته إلى `HeardToken[]`، ولا يتسرّب
 * تصنيفه هو إلى منطقنا. فتبديل المزوّد يوم نشاء تبديلُ ملف واحد.
 *
 * ═══ الفكرة التي تجعل هذا ممكنًا ═══
 * نحن **نعرف مقدّمًا** ما يُفترض أن يُقرأ. فلا نحتاج تعرّفًا ممتازًا
 * على الكلام، بل محاذاةً بين المعروف والمسموع. وهذه خلاصة خمسة وعشرين
 * عامًا من أبحاث «معلّم القراءة الآلي»: كشفُ الخطأ لا يحتاج أن يعرف
 * النظام ما قاله الطفل، بل أن يعرف أنه **ليس** الكلمة المتوقَّعة.
 *
 * ═══ القاعدة الحاكمة ═══
 * ⚠️ الأولوية لتقليل الاتهام الكاذب لا لزيادة الاكتشاف. متى شكّ
 * المحرّك أرجع `UNCERTAIN` ولم يتّهم. وهذا قرارٌ صريح: أفضل نظام
 * منشور في هذا المجال يعمل على أقل من ١٪ اتهام كاذب مقابل كشف ربع
 * أخطاء الاستبدال فقط — وهي المقايضة الصحيحة مع طفل يحفظ كتاب الله.
 *
 * ⚠️ ولا يُعدَّل `text_uthmani` هنا ولا في أي موضع. التطبيع نسخة
 * للمقارنة وحدها، والنتائج تُربط بالنص الأصلي **برقم الكلمة** لا
 * بإعادة كتابته.
 */

import { splitOpeningBasmala } from './basmala';
import { normalizeForComparison, splitWords } from './normalize.mjs';
import { ALIGNMENT_TUNING, type AlignmentTuning } from './alignment-tuning';
import type { Ayah } from '../types';

// ═══════════════════════ الأنواع ═══════════════════════

/** كلمة متوقَّعة من المصحف المرجعي. */
export type ExpectedWord = {
  surah: number;
  ayah: number;
  /** ترتيبها داخل آيتها، من صفر. */
  indexInAyah: number;
  /** ترتيبها في المقطع كله، من صفر. */
  position: number;
  /** النص المرجعي كما ورد — لا يُمسّ. */
  uthmani: string;
  /** نسخة المقارنة وحدها — لا تُعرض. */
  norm: string;
};

/** كلمة سمعها المزوّد. التوقيت والثقة اختياريان: ليس كل مزوّد يعطيهما. */
export type HeardToken = {
  text: string;
  norm: string;
  startSec?: number;
  endSec?: number;
  /** ٠..١ — ثقة المزوّد بهذه الكلمة. */
  confidence?: number;
};

/**
 * تصنيفات غراس. مستقلّة عن أي مزوّد، ومصمَّمة للحفظ لا للنطق.
 *
 * ⚠️ لا يوجد هنا تصنيف تجويد ولا مخارج حروف ولا جودة أداء، ولن يوجد
 * في هذا المحرّك. `MemorizationAccuracy` و`TajweedAccuracy` منفصلان
 * تمامًا، والثاني يحتاج مرحلة مستقلة ونموذجًا متخصصًا مُتحقَّقًا منه.
 */
export type AlignmentKind =
  /** قالها كما هي. */
  | 'MATCH'
  /** قال مكانها كلمة أخرى بعيدة عنها. */
  | 'SUBSTITUTION'
  /** لم يقلها. */
  | 'OMISSION'
  /** زاد كلمة ليست في النص. */
  | 'INSERTION'
  /** أعاد كلمة أو مقطعًا قاله للتو. */
  | 'REPETITION'
  /** قفز فوق آية كاملة أو مقطع طويل متّصل. */
  | 'SKIP'
  /** صمت طويل بين كلمتين — يحتاج توقيتًا من المزوّد. */
  | 'LONG_PAUSE'
  /** شيء ما هنا، ولا نثق بما يكفي لتسميته خطأً. */
  | 'UNCERTAIN';

/** سبب عدم اليقين — يُعرض للطالبة بلغة لطيفة، ويُقرأ في التشخيص. */
export type UncertainReason =
  /** ثقة المزوّد بالكلمة منخفضة. */
  | 'LOW_CONFIDENCE'
  /** الموضع متكرّر في المقطع، فلا يُعرف أيّ نسخة قُصدت. */
  | 'AMBIGUOUS_CONTEXT'
  /** الكلمتان متقاربتان — الأرجح خطأ سماع لا خطأ حفظ. */
  | 'NEAR_MISS'
  /** التسجيل يبدو مقطوعًا من أوله. */
  | 'TRUNCATED_START'
  /** التسجيل يبدو مقطوعًا من آخره. */
  | 'TRUNCATED_END'
  /** سُمع أقل من نصف المتوقَّع — تسجيل ناقص لا حفظ ناقص. */
  | 'TRANSCRIPT_TOO_SHORT'
  /** كلمة زائدة موجودة في النص المتوقَّع — قد تكون صدى من المزوّد. */
  | 'ECHO_OF_PASSAGE'
  /** حذفٌ يجاوره نصٌّ يتكرّر في المقطع — لا يُعرف أيّ نسخة سقطت. */
  | 'REPEATED_NEIGHBOURHOOD';

export type AlignmentEntry = {
  kind: AlignmentKind;
  /** الكلمات المتوقَّعة التي يخصّها هذا الموضع (قد تكون فارغة). */
  expected: ExpectedWord[];
  /** ما سُمع في هذا الموضع (قد يكون فارغًا). */
  heard: HeardToken[];
  /** ٠..١ حين يكون للمقارنة معنى. */
  similarity?: number;
  /** أدنى ثقة في كلمات هذا الموضع. */
  confidence?: number;
  reason?: UncertainReason;
  /** مدة الصمت بالثواني — في `LONG_PAUSE` وحده. */
  pauseSec?: number;
};

/** موضع يحتاج تثبيتًا — تُغذّى به المراجعة المتباعدة لاحقًا. */
export type WeakSpot = {
  surah: number;
  ayah: number;
  /**
   * الخطأ وقع في أول الآية، أي في **الانتقال** من سابقتها إليها.
   * وهذا أنفع للمراجعة من «راجع الآية كلها»: يُربط آخر السابقة بأول
   * هذه بأول التالية.
   */
  atTransition: boolean;
};

export type AlignmentSummary = {
  expectedWords: number;
  heardTokens: number;
  matched: number;
  /** أخطاء مؤكَّدة وحدها — لا يدخل فيها `UNCERTAIN` أبدًا. */
  confirmedErrors: number;
  uncertain: number;
  /** نسبة ما أصابه من المتوقَّع، ٠..١. */
  coverage: number;
};

export type AlignmentResult = {
  entries: AlignmentEntry[];
  summary: AlignmentSummary;
  weakSpots: WeakSpot[];
  /**
   * هل تصلح هذه النتيجة للحكم أصلًا؟
   *
   * `false` يعني: لا تعرض أخطاء ولا تُنقص إتقانًا ولا تسجّل شيئًا ضد
   * الطالبة. اطلب إعادة التسميع بلطف. وهذا يقع مع تسجيل فارغ أو مقطوع
   * أو ضعيف الصوت — وهي حالات تقنية لا حالات حفظ.
   */
  usable: boolean;
  /** سبب عدم الصلاحية، حين لا تصلح. */
  unusableReason?: 'EMPTY_TRANSCRIPT' | 'TRANSCRIPT_TOO_SHORT' | 'INPUT_TOO_LARGE';
};

// ═══════════════════════ بناء المُدخلات ═══════════════════════

/**
 * الاستعاذة والبسملة — تُقال قبل التلاوة ولا تُعدّ من المقطع.
 *
 * ⚠️ تُكتب هنا بالرسم العثماني وتُطبَّع وقت التحميل، ولا تُكتب مطبَّعةً
 * بيدنا: المطبِّع يُسقط الألف الخنجرية وغيرها، فالنسخة المكتوبة يدويًا
 * تفترق عن الحقيقة بحرف لا يُرى.
 *
 * ويتحقق `test-alignment` من أن نمط البسملة يطابق **حرفًا بحرف** الآية
 * الأولى من الفاتحة كما في ملف المصحف. فلو أخطأنا حرفًا سقط الاختبار
 * ولم يمرّ صامتًا.
 */
export const RITUAL_OPENING_PATTERNS: string[] = [
  'أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَٰنِ ٱلرَّجِيمِ',
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
].map((s) => normalizeForComparison(s) as string);

/**
 * الكلمات المتوقَّعة من آيات المصحف.
 *
 * ⚠️ البسملة تُرفع من أول السورة لأنها ليست آية معدودة فيها — إلا في
 * الفاتحة حيث هي الآية الأولى فتبقى. وهذا التمييز يخرج من النص نفسه
 * عبر `splitOpeningBasmala`، لا من قائمة أرقام سور مكتوبة بيدنا.
 *
 * ولولا ذلك لاتُّهم كلُّ طفل لا يجهر بالبسملة بحذف أربع كلمات، أو
 * لسقطت الآية الأولى من الفاتحة من الحساب.
 */
export function buildExpected(ayahs: Ayah[]): ExpectedWord[] {
  const out: ExpectedWord[] = [];
  let position = 0;

  for (const a of ayahs) {
    const split = splitOpeningBasmala([a]);
    // البسملة آية معدودة (الفاتحة) ⇒ تبقى كما هي. وإلا تُرفع.
    const effective = split.basmalaAyahNumber !== null ? a : split.ayahs[0];
    if (!effective) continue;

    const words = splitWords(effective.text_uthmani) as string[];
    words.forEach((w, i) => {
      out.push({
        surah: effective.surah,
        ayah: effective.ayah,
        indexInAyah: i,
        position: position++,
        uthmani: w,
        norm: normalizeForComparison(w) as string,
      });
    });
  }
  return out;
}

/**
 * كلمات مسموعة من نصّ خام — للمزوّد الذي لا يعطي إلا نصًّا.
 *
 * وهي أيضًا مدخل الاختبارات: نكتب ما «سمعه» المزوّد نصًّا فنختبر
 * المحرّك كله بلا مزوّد ولا مفتاح ولا إنترنت.
 */
export function tokensFromText(text: string): HeardToken[] {
  const words = splitWords(text) as string[];
  return words.map((w) => ({ text: w, norm: normalizeForComparison(w) as string }));
}

/**
 * كلمات مسموعة من مخرجات مزوّد.
 *
 * هذه هي النقطة الوحيدة التي يلمسها أي مهايئ مزوّد. ما بعدها لا يعرف
 * المحرّك من أين جاء الصوت ولا بأي شركة.
 */
export function tokensFromProvider(
  raw: { text: string; startSec?: number; endSec?: number; confidence?: number }[]
): HeardToken[] {
  const out: HeardToken[] = [];
  for (const t of raw) {
    const words = splitWords(t.text) as string[];
    // كلمة واحدة في الغالب؛ ولو أرجع المزوّد عبارة وزّعنا توقيتها عليها
    words.forEach((w) => {
      const tok: HeardToken = { text: w, norm: normalizeForComparison(w) as string };
      if (t.startSec !== undefined) tok.startSec = t.startSec;
      if (t.endSec !== undefined) tok.endSec = t.endSec;
      if (t.confidence !== undefined) tok.confidence = t.confidence;
      out.push(tok);
    });
  }
  return out;
}

// ═══════════════════════ التشابه ═══════════════════════

/** مسافة ليفنشتاين — عدد التعديلات الحرفية بين كلمتين. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);

  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * هل تفترق الكلمتان بحرف واحد فقط؟
 *
 * ⚠️ قياس التشابه النسبي منحازٌ ضد القصير انحيازًا فاحشًا: خطأُ حرفٍ
 * واحد يعطي ٠٫٨٨ في «يتساءلون» و**٠٫٥٠** في «عمّ». فالأولى تُعامَل
 * برفقٍ والثانية تُتَّهم — والقصيرة أحقّ بالرفق، لأنها أسرع نطقًا
 * وأخفّ صوتًا وأكثر ما يبتلعه المزوّد أو يخلطه.
 *
 * وحرفٌ واحد في حدود خطأ الآلة دائمًا، فلا يُبنى عليه اتهامُ طفلة.
 *
 * ⚠️ ولا يخالف هذا قاعدة «لا حكم على النطق»: نحن لا نقول إنها أحسنت
 * النطق ولا أساءته — نقول إننا لا نعلم، وهو الصدق.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  return levenshtein(a, b) <= 1;
}

/**
 * تشابه كلمتين، ٠..١.
 *
 * ⚠️ حرفيّ لا صوتيّ. والمقارنة الصوتية (أي أن «ذ» و«ز» متقاربتان في
 * سمع الآلة) تحتاج قياسًا على أصوات حقيقية قبل أن تُضاف — ولا تُضاف
 * بالحدس. فالمسافة الحرفية على نصّ **مطبَّع** تقريبٌ معقول ومحافظ.
 */
export function wordSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

// ═══════════════════════ المحاذاة ═══════════════════════

type RawOp = { kind: 'M' | 'D' | 'I'; e?: ExpectedWord; h?: HeardToken; sim?: number };

/**
 * محاذاة عامة بفجوة متدرّجة (Needleman–Wunsch بصيغة Gotoh).
 *
 * ثلاث مصفوفات: `M` تنتهي بمقابلة، و`D` بفجوة في المسموع (حذف)، و`I`
 * بفجوة في المتوقَّع (إضافة). والفصل بينها هو ما يجعل الفجوة الطويلة
 * أرخص من مجموع فجوات قصيرة — أي ما يجعل تخطّي آية خطأً واحدًا.
 */
function align(
  expected: ExpectedWord[],
  heard: HeardToken[],
  t: AlignmentTuning
): RawOp[] {
  const n = expected.length;
  const m = heard.length;
  const NEG = -1e9;

  const M: number[][] = [];
  const D: number[][] = [];
  const I: number[][] = [];
  for (let i = 0; i <= n; i++) {
    M.push(new Array(m + 1).fill(NEG));
    D.push(new Array(m + 1).fill(NEG));
    I.push(new Array(m + 1).fill(NEG));
  }

  M[0][0] = 0;
  for (let i = 1; i <= n; i++) D[i][0] = t.gapOpen + (i - 1) * t.gapExtend;
  for (let j = 1; j <= m; j++) I[0][j] = t.gapOpen + (j - 1) * t.gapExtend;

  // درجة المقابلة: من +١ (مطابقة) إلى -١ (لا صلة)
  const sub = (i: number, j: number) => 2 * wordSimilarity(expected[i - 1].norm, heard[j - 1].norm) - 1;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sub(i, j);
      M[i][j] = s + Math.max(M[i - 1][j - 1], D[i - 1][j - 1], I[i - 1][j - 1]);
      D[i][j] = Math.max(
        M[i - 1][j] + t.gapOpen,
        D[i - 1][j] + t.gapExtend,
        I[i - 1][j] + t.gapOpen
      );
      I[i][j] = Math.max(
        M[i][j - 1] + t.gapOpen,
        I[i][j - 1] + t.gapExtend,
        D[i][j - 1] + t.gapOpen
      );
    }
  }

  // التتبّع العكسي من أفضل نهاية
  const ops: RawOp[] = [];
  let i = n;
  let j = m;
  let state: 'M' | 'D' | 'I' =
    M[n][m] >= D[n][m] && M[n][m] >= I[n][m] ? 'M' : D[n][m] >= I[n][m] ? 'D' : 'I';

  while (i > 0 || j > 0) {
    if (state === 'M' && i > 0 && j > 0) {
      const s = wordSimilarity(expected[i - 1].norm, heard[j - 1].norm);
      ops.push({ kind: 'M', e: expected[i - 1], h: heard[j - 1], sim: s });
      const score = M[i][j] - (2 * s - 1);
      const prevM = M[i - 1][j - 1];
      const prevD = D[i - 1][j - 1];
      state = near(score, prevM) ? 'M' : near(score, prevD) ? 'D' : 'I';
      i--;
      j--;
    } else if (state === 'D' && i > 0) {
      ops.push({ kind: 'D', e: expected[i - 1] });
      const cur = D[i][j];
      state = near(cur, D[i - 1][j] + t.gapExtend)
        ? 'D'
        : near(cur, M[i - 1][j] + t.gapOpen)
          ? 'M'
          : 'I';
      i--;
    } else if (state === 'I' && j > 0) {
      ops.push({ kind: 'I', h: heard[j - 1] });
      const cur = I[i][j];
      state = near(cur, I[i][j - 1] + t.gapExtend)
        ? 'I'
        : near(cur, M[i][j - 1] + t.gapOpen)
          ? 'M'
          : 'D';
      j--;
    } else if (i > 0) {
      ops.push({ kind: 'D', e: expected[i - 1] });
      i--;
    } else {
      ops.push({ kind: 'I', h: heard[j - 1] });
      j--;
    }
  }

  ops.reverse();
  return ops;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

// ═══════════════════════ الالتباس القرآني ═══════════════════════

/**
 * المواضع الملتبسة في المقطع — أخطر ما في التسميع القرآني.
 *
 * ── المشكلة ──
 * القرآن فيه آيات متشابهة وبدايات متقاربة وكلمات تتكرر: «فبأي آلاء
 * ربكما تكذبان» إحدى وثلاثون مرة في الرحمن. فلو حذفت الطالبة واحدة
 * منها، **لا يستطيع أي محرّك في الدنيا أن يجزم أيّها حُذفت** — كل
 * التفسيرات متساوية في الوجاهة.
 *
 * ── العلاج ──
 * كلمة سياقها (ما قبلها، هي، ما بعدها) يتكرّر في المقطع تُعدّ ملتبسة.
 * وأي خطأ يقع عليها يُخفَّض إلى `UNCERTAIN` لا يُتَّهم به أحد.
 *
 * وهذا ليس تهرّبًا بل هو **الحكم الصحيح**: لا نعلم، فلا نقول إننا
 * نعلم. وقول «لم أستطع التأكد هنا» أصدق من اتهام طالبة بخطأ ربما لم
 * ترتكبه في الموضع الذي أشرنا إليه.
 *
 * ⚠️ ولا يُبحث عن التشابه في المصحف كله بل في **المقطع المحدَّد وحده**
 * (سورة + من آية + إلى آية). فالسياق مقيَّد أصلًا بما اختارته الطالبة،
 * وهذا وحده يزيل أكثر التباس الآيات المتشابهة عبر السور.
 */
/**
 * كلمات المقطع المتوقَّع، للكشف عن «صدى المزوّد».
 *
 * ⚠️ قيسَ هذا على صوت حقيقي لا على حدس: في تسجيلين فيهما تعثّر،
 * أضاف المزوّد في كلٍّ منهما كلمةً لم تُقَل — و**كلتاهما كلمة موجودة
 * في النص المتوقَّع الذي زوّدناه به**، ومرة في أول المقطع ومرة في
 * آخره. وفي تسجيلين صحيحين لم يُضِف شيئًا.
 *
 * فالتفسير أن المزوّد، حين يسمع ترددًا أو نفَسًا أو مقطعًا غامضًا،
 * يملأ الفراغ بكلمة من النص الذي أعطيناه. وهذا ليس تزويرًا كاملًا —
 * فقد أسقط الآية المتخطّاة بأمانة — لكنه صدى صغير عند كل تعثّر.
 *
 * ⚠️ وأثره وخيم: **كل تعثّر يصير تهمة**، وبثقة عالية فلا تلتقطه
 * بوابة الثقة المنخفضة. وهو بالضبط ما لا نريده مع طفلة تحفظ.
 */
function passageWords(expected: ExpectedWord[]): { [key: string]: true } {
  const set: { [key: string]: true } = Object.create(null);
  for (const w of expected) set[w.norm] = true;
  return set;
}

/**
 * هل يجاور هذا الحذفَ نصٌّ يتكرّر في المقطع؟
 *
 * ── الحالة التي كشفتها ──
 * النبأ ٤: «كَلَّا سَيَعْلَمُونَ» · النبأ ٥: «ثُمَّ كَلَّا سَيَعْلَمُونَ».
 * والفرق بينهما **كلمة واحدة**. فحين يُسقط المزوّد «ثمّ» يصير النصّان
 * سواءً، ولا يعلم أحدٌ أسقطتها القارئة أم دمج المزوّدُ التكرارين.
 *
 * وقاعدة السياق الثلاثي لا تمسك هذا: «ثمّ» نفسها لا تتكرّر، وإنما
 * يتكرّر **ما حولها**. فننظر إلى الجوار لا إلى الكلمة.
 *
 * ⚠️ والمتشابهات من هذا الباب أكثر ما يكون في القرآن: آيتان لا يفرّق
 * بينهما إلا حرف أو كلمة. فاتهام الطالبة بحذف الفارق ظلمٌ في الأغلب،
 * لأن المزوّد أحرى أن يكون هو من دمجهما.
 */
function repeatedNeighbourhood(
  expected: ExpectedWord[],
  from: number,
  to: number,
  span: number
): boolean {
  const norms = expected.map((w) => w.norm);

  const runOccurs = (run: string[]): boolean => {
    if (run.length < span) return false;
    const key = run.join(' ');
    let seen = 0;
    for (let i = 0; i + run.length <= norms.length; i++) {
      if (norms.slice(i, i + run.length).join(' ') === key) seen++;
      if (seen > 1) return true;
    }
    return false;
  };

  const after = norms.slice(to + 1, to + 1 + span);
  const before = norms.slice(Math.max(0, from - span), from);
  return runOccurs(after) || runOccurs(before);
}

function ambiguousPositions(expected: ExpectedWord[]): boolean[] {
  const counts: { [key: string]: number } = Object.create(null);
  const keys: string[] = [];

  for (let i = 0; i < expected.length; i++) {
    const prev = i > 0 ? expected[i - 1].norm : '^';
    const next = i < expected.length - 1 ? expected[i + 1].norm : '$';
    const key = `${prev}|${expected[i].norm}|${next}`;
    keys.push(key);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return keys.map((k) => counts[k] > 1);
}

// ═══════════════════════ المحرّك ═══════════════════════

export function alignRecitation(
  expected: ExpectedWord[],
  heard: HeardToken[],
  tuning: AlignmentTuning = ALIGNMENT_TUNING
): AlignmentResult {
  const t = tuning;

  const empty = (
    reason: AlignmentResult['unusableReason']
  ): AlignmentResult => ({
    entries: [],
    summary: {
      expectedWords: expected.length,
      heardTokens: heard.length,
      matched: 0,
      confirmedErrors: 0,
      uncertain: 0,
      coverage: 0,
    },
    weakSpots: [],
    usable: false,
    unusableReason: reason,
  });

  if (!expected.length || !heard.length) return empty('EMPTY_TRANSCRIPT');
  if (expected.length > t.maxExpectedWords || heard.length > t.maxHeardTokens)
    return empty('INPUT_TOO_LARGE');

  const trimmed = stripRitualOpening(expected, heard);

  if (!trimmed.length) return empty('EMPTY_TRANSCRIPT');

  const ops = align(expected, trimmed, t);
  const ambiguous = ambiguousPositions(expected);

  let entries = groupRuns(ops, t);
  entries = classifyRuns(entries, expected, t);
  entries = insertLongPauses(entries, trimmed, t);

  // الحكم النهائي يأتي أخيرًا: يرى الصورة كاملة فيخفّض ما لا يُوثق به
  const tooShort = trimmed.length < expected.length * t.minCoverageRatio;
  entries = applyConservatism(entries, expected, ambiguous, passageWords(expected), tooShort, t);

  const summary = summarize(entries, expected.length, trimmed.length);

  return {
    entries,
    summary,
    weakSpots: collectWeakSpots(entries),
    usable: !tooShort,
    ...(tooShort ? { unusableReason: 'TRANSCRIPT_TOO_SHORT' as const } : {}),
  };
}

/**
 * إسقاط الاستعاذة والبسملة من أول ما سُمع.
 *
 * الطفل يستعيذ ويبسمل قبل التلاوة، وهذا من أدب التلاوة لا زيادة على
 * النص. ولو حسبناها إضافةً لاتُّهم كلُّ من التزم الأدب.
 *
 * ⚠️ ولا تُسقَط إن كان المقطع نفسه يبدأ بالبسملة (الفاتحة): يومها هي
 * آية متوقَّعة تُحاذى كبقية الآيات.
 */
function stripRitualOpening(expected: ExpectedWord[], heard: HeardToken[]): HeardToken[] {
  const expectedHead = expected
    .slice(0, 8)
    .map((w) => w.norm)
    .join(' ');

  let out = heard;
  // قد يجتمع الاثنان: استعاذة ثم بسملة
  for (let pass = 0; pass < 2; pass++) {
    for (const opening of RITUAL_OPENING_PATTERNS) {
      const words = opening.split(' ');
      if (out.length <= words.length) continue;
      if (expectedHead.indexOf(opening) === 0) continue; // متوقَّعة فعلًا

      const head = out
        .slice(0, words.length)
        .map((x) => x.norm)
        .join(' ');
      if (wordSimilarity(head, opening) >= 0.9) {
        out = out.slice(words.length);
        break;
      }
    }
  }
  return out;
}

/** جمع المتتاليات: حذوف متجاورة موضع واحد، وكذلك الإضافات. */
function groupRuns(ops: RawOp[], t: AlignmentTuning): AlignmentEntry[] {
  const entries: AlignmentEntry[] = [];

  for (const op of ops) {
    const last = entries[entries.length - 1];

    if (op.kind === 'M') {
      const sim = op.sim ?? 0;
      const kind: AlignmentKind = sim >= t.sameWordSim ? 'MATCH' : 'SUBSTITUTION';
      const entry: AlignmentEntry = {
        kind,
        expected: [op.e as ExpectedWord],
        heard: [op.h as HeardToken],
        similarity: sim,
      };
      const c = (op.h as HeardToken).confidence;
      if (c !== undefined) entry.confidence = c;
      entries.push(entry);
      continue;
    }

    if (op.kind === 'D') {
      if (last && last.kind === 'OMISSION') {
        last.expected.push(op.e as ExpectedWord);
      } else {
        entries.push({ kind: 'OMISSION', expected: [op.e as ExpectedWord], heard: [] });
      }
      continue;
    }

    if (last && last.kind === 'INSERTION') {
      last.heard.push(op.h as HeardToken);
    } else {
      entries.push({ kind: 'INSERTION', expected: [], heard: [op.h as HeardToken] });
    }
  }

  // أدنى ثقة في المتتالية تمثّلها: أضعف حلقة هي التي تُوثَق
  for (const e of entries) {
    if (e.confidence !== undefined || !e.heard.length) continue;
    let min: number | undefined;
    for (const h of e.heard) {
      if (h.confidence === undefined) continue;
      min = min === undefined ? h.confidence : Math.min(min, h.confidence);
    }
    if (min !== undefined) e.confidence = min;
  }

  return entries;
}

/** تحويل المتتاليات الخام إلى تصنيفات غراس: تخطٍّ، تكرار. */
function classifyRuns(
  entries: AlignmentEntry[],
  expected: ExpectedWord[],
  t: AlignmentTuning
): AlignmentEntry[] {
  // كم كلمة في كل آية؟ لنعرف متى غطّى الحذفُ آيةً كاملة
  const ayahSize: { [key: string]: number } = Object.create(null);
  for (const w of expected) {
    const k = `${w.surah}:${w.ayah}`;
    ayahSize[k] = (ayahSize[k] ?? 0) + 1;
  }

  return entries.map((e, idx) => {
    if (e.kind === 'OMISSION') {
      // تخطٍّ إن غطّى آية كاملة، أو طال بما يتجاوز العتبة
      const perAyah: { [key: string]: number } = Object.create(null);
      for (const w of e.expected) {
        const k = `${w.surah}:${w.ayah}`;
        perAyah[k] = (perAyah[k] ?? 0) + 1;
      }
      let coversWholeAyah = false;
      for (const k of Object.keys(perAyah)) {
        if (perAyah[k] === ayahSize[k]) coversWholeAyah = true;
      }
      if (coversWholeAyah || e.expected.length >= t.skipMinWords) {
        return { ...e, kind: 'SKIP' as AlignmentKind };
      }
      return e;
    }

    if (e.kind === 'INSERTION' && isRepetition(entries, idx, t)) {
      return { ...e, kind: 'REPETITION' as AlignmentKind };
    }

    return e;
  });
}

/**
 * هل هذه الإضافة إعادةٌ لما قيل للتو (أو تمهيدٌ لما سيُقال)؟
 *
 * الطفل يتلعثم فيعيد الكلمة أو المقطع. وهذا **ليس خطأ حفظ** — النص
 * كله موجود ومرتَّب، لكنه قيل مرتين. فتسميته «زيادة على القرآن» ظلم
 * وتشويش، والصواب أن يُسمّى تكرارًا ويُعامل معاملةً أهون.
 */
function isRepetition(entries: AlignmentEntry[], idx: number, t: AlignmentTuning): boolean {
  const run = entries[idx].heard;
  if (!run.length) return false;
  const said = run.map((h) => h.norm);

  const before = collectNeighbourWords(entries, idx, -1, said.length);
  const after = collectNeighbourWords(entries, idx, +1, said.length);

  return (
    phraseSimilarity(said, before) >= t.repetitionSim ||
    phraseSimilarity(said, after) >= t.repetitionSim
  );
}

/** كلمات متوقَّعة مجاورة للموضع، بالاتجاه المطلوب. */
function collectNeighbourWords(
  entries: AlignmentEntry[],
  idx: number,
  dir: -1 | 1,
  count: number
): string[] {
  const out: string[] = [];
  for (let i = idx + dir; i >= 0 && i < entries.length && out.length < count; i += dir) {
    const e = entries[i];
    if (!e.expected.length) continue;
    const words = e.expected.map((w) => w.norm);
    if (dir === -1) {
      for (let k = words.length - 1; k >= 0 && out.length < count; k--) out.unshift(words[k]);
    } else {
      for (let k = 0; k < words.length && out.length < count; k++) out.push(words[k]);
    }
  }
  return out;
}

function phraseSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += wordSimilarity(a[i], b[i]);
  return sum / a.length;
}

/**
 * الوقفات الطويلة — تُقاس ولا تُخمَّن.
 *
 * ⚠️ إن لم يُرجع المزوّد توقيتًا فلا وقفات إطلاقًا. اختراع وقفة من
 * ترتيب الكلمات وحده تخمين، والتخمين هنا يتحوّل إلى «الطفل تردّد»
 * وهي تهمة صغيرة لكنها كاذبة.
 */
function insertLongPauses(
  entries: AlignmentEntry[],
  heard: HeardToken[],
  t: AlignmentTuning
): AlignmentEntry[] {
  const gaps: { afterToken: HeardToken; sec: number }[] = [];
  for (let i = 1; i < heard.length; i++) {
    const prevEnd = heard[i - 1].endSec;
    const start = heard[i].startSec;
    if (prevEnd === undefined || start === undefined) continue;
    const sec = start - prevEnd;
    if (sec >= t.longPauseSec) gaps.push({ afterToken: heard[i - 1], sec });
  }
  if (!gaps.length) return entries;

  const out: AlignmentEntry[] = [];
  for (const e of entries) {
    out.push(e);
    for (const g of gaps) {
      if (e.heard.indexOf(g.afterToken) !== -1) {
        out.push({ kind: 'LONG_PAUSE', expected: [], heard: [], pauseSec: g.sec });
      }
    }
  }
  return out;
}

/**
 * طبقة التحفّظ — أهم ما في المحرّك.
 *
 * كل ما سبقها استدلال، وهذه تسأل عن كل استدلال: هل نثق به بما يكفي
 * لنقوله لطفل؟ وما لا نثق به يصير `UNCERTAIN` — لا يُعرض خطأً، ولا
 * يُنقص إتقانًا، ولا يُسجَّل ضد أحد.
 */
function applyConservatism(
  entries: AlignmentEntry[],
  expected: ExpectedWord[],
  ambiguous: boolean[],
  inPassage: { [key: string]: true },
  tooShort: boolean,
  t: AlignmentTuning
): AlignmentEntry[] {
  const lastPos = expected.length - 1;

  // أول موضع سُمع فيه شيء وآخره — لكشف التسجيل المقطوع من طرفيه
  let firstHeardIdx = -1;
  let lastHeardIdx = -1;
  entries.forEach((e, i) => {
    if (!e.heard.length) return;
    if (firstHeardIdx === -1) firstHeardIdx = i;
    lastHeardIdx = i;
  });

  return entries.map((e, i) => {
    if (e.kind === 'MATCH' || e.kind === 'LONG_PAUSE') return e;

    const uncertain = (reason: UncertainReason): AlignmentEntry => ({
      ...e,
      kind: 'UNCERTAIN',
      reason,
    });

    // ١) التسجيل ناقص أصلًا ⇒ لا نتّهم بشيء
    if (tooShort) return uncertain('TRANSCRIPT_TOO_SHORT');

    // ٢) ثقة المزوّد منخفضة ⇒ لم نسمع جيدًا، فلا نحكم
    if (e.confidence !== undefined && e.confidence < t.lowConfidence)
      return uncertain('LOW_CONFIDENCE');

    // ٣) موضع ملتبس (متكرّر في المقطع) ⇒ لا يُعرف أيّ نسخة قُصدت
    for (const w of e.expected) {
      if (ambiguous[w.position]) return uncertain('AMBIGUOUS_CONTEXT');
    }

    // ٤) استبدال بكلمة قريبة ⇒ الأرجح خطأ سماع لا خطأ حفظ
    //
    // ⚠️ وحرفٌ واحد قريبٌ مهما قصرت الكلمة: القياس النسبي وحده يظلم
    // «عمّ» ويرفق بـ«يتساءلون» على نفس الخطأ.
    if (e.kind === 'SUBSTITUTION') {
      const heardNorm = e.heard[0]?.norm ?? '';
      const wantNorm = e.expected[0]?.norm ?? '';
      if (
        (e.similarity !== undefined && e.similarity >= t.nearMissSim) ||
        withinOneEdit(wantNorm, heardNorm)
      )
        return uncertain('NEAR_MISS');
    }

    // ٥) كلمة زائدة موجودة في المقطع ⇒ قد تكون صدى المزوّد لا صوتها
    //
    // ⚠️ فإن زادت كلمة **من خارج** المقطع فهي زيادة حقيقية: المزوّد
    // لا يخترع ما لم نعطه إياه. فلا تُعطَّل الإضافة، بل يُحرَس بابها.
    if (e.kind === 'INSERTION' && e.heard.length && e.heard.every((h) => inPassage[h.norm]))
      return uncertain('ECHO_OF_PASSAGE');

    // ٦) حذفٌ في طرفي المقطع ⇒ الأرجح أن التسجيل قُصّ لا أنها نسيت
    //
    // ⚠️ ولا نشترط أن يسبق الموضعَ سكوتٌ في القائمة: كلمةٌ واحدة
    // يخترعها المزوّد في المستهلّ تُزيح الحذفَ عن رأس القائمة فيصير
    // اتهامًا مؤكَّدًا — وقد وقع هذا فعلًا مع «عَمَّ» في أول النبأ.
    // فالمناط أن يمسّ الحذفُ أولَ المقطع أو آخره، لا ترتيبه بيننا.
    if (e.kind === 'OMISSION' || e.kind === 'SKIP') {
      const first = e.expected[0];
      const last = e.expected[e.expected.length - 1];
      if (first && first.position === 0) return uncertain('TRUNCATED_START');
      if (last && last.position === lastPos) return uncertain('TRUNCATED_END');

      /**
       * ٧) حذفٌ قصير يجاوره نصٌّ متكرّر ⇒ لا يُعرف أيّ نسخة سقطت.
       *
       * ⚠️ والقِصَر شرطٌ: المزوّد يدمج تكرارًا قصيرًا فتسقط كلمةٌ بين
       * نسختيه، ولا يبتلع آيةً كاملة لأن كلمتين قبلها تكرّرتا.
       */
      if (
        e.expected.length <= t.repeatedMaxWords &&
        repeatedNeighbourhood(expected, first.position, last.position, t.repeatedSpan)
      )
        return uncertain('REPEATED_NEIGHBOURHOOD');
    }

    return e;
  });
}

function summarize(
  entries: AlignmentEntry[],
  expectedWords: number,
  heardTokens: number
): AlignmentSummary {
  let matched = 0;
  let confirmedErrors = 0;
  let uncertain = 0;

  for (const e of entries) {
    if (e.kind === 'MATCH') matched += e.expected.length;
    else if (e.kind === 'UNCERTAIN') uncertain++;
    else if (e.kind !== 'LONG_PAUSE') confirmedErrors++;
  }

  return {
    expectedWords,
    heardTokens,
    matched,
    confirmedErrors,
    uncertain,
    coverage: expectedWords ? matched / expectedWords : 0,
  };
}

/**
 * المواضع التي تحتاج تثبيتًا.
 *
 * ⚠️ من الأخطاء **المؤكَّدة** وحدها. الموضع غير المؤكَّد لا يُرسل إلى
 * المراجعة: لو أرسلناه لصارت الطالبة تراجع مواضع لم تخطئ فيها لأن
 * الميكروفون ضعيف، وهذا يفسد المراجعة الذكية ويُشعرها بالظلم.
 */
function collectWeakSpots(entries: AlignmentEntry[]): WeakSpot[] {
  const seen: { [key: string]: WeakSpot } = Object.create(null);

  for (const e of entries) {
    if (e.kind === 'MATCH' || e.kind === 'UNCERTAIN' || e.kind === 'LONG_PAUSE') continue;
    for (const w of e.expected) {
      const key = `${w.surah}:${w.ayah}`;
      const atTransition = w.indexInAyah === 0;
      if (!seen[key]) seen[key] = { surah: w.surah, ayah: w.ayah, atTransition };
      else if (atTransition) seen[key].atTransition = true;
    }
  }

  const out: WeakSpot[] = [];
  for (const k of Object.keys(seen)) out.push(seen[k]);
  out.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  return out;
}
