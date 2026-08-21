import type { TajweedAnnotation, TajweedRule } from './types';

/**
 * محرّك أحكام التجويد — اشتقاقٌ من الرسم العثماني لا استيراد.
 *
 * ═══ الأساس: الرسم يشفّر الحكم ═══
 * ⚠️ هذه ليست نظريةً بل **مسحٌ للمصحف كلّه** أجريناه قبل كتابة سطر:
 *
 *   إظهار  ‏`مِنْ هَادٍ`   نونٌ بسكونٍ ظاهر
 *   إخفاء  ‏`عِندَ`        نونٌ عاريةٌ بلا علامة
 *   إقلاب  ‏`مِنۢ بَعْدِ`  نون + ميمٌ صغيرة (U+06E2)
 *   إدغام  ‏`مِن رَّبِّ`   نونٌ عارية + التالي مشدّد
 *
 * ⚠️ **وأدقّ ما كشفه المسح — ولولاه لبنينا محرّكًا يكذب بثقة:**
 * الإدغام في (ر ل ن م) تُكتب شدّته، وفي (ي و) **لا تُكتب** لأن الغنّة
 * باقية فالإدغام ناقص. فمن اشترط الشدّة أخطأ في ٦٩٢ موضعًا، ومن
 * أهملها خلط الإدغام بالإخفاء.
 *
 * ⚠️ **والمسافة فارقة**: نون + (ي و) عبر كلمتين إدغام، وفي الكلمة
 * الواحدة إظهارٌ مطلق — ويرسمه النصّ بسكونٍ ظاهر (`ٱلدُّنْيَا`).
 *
 * ═══ ما لا يفعله هذا الملف ═══
 * ⚠️ لا يحكم على صوت، ولا يعطي درجة، ولا يعرف مستخدمًا. يقول: **هنا
 * حكمٌ متوقَّع** وكفى. والمرحلة ٥أ قضت ألّا نحكم صوتيًا، وهذا قائم.
 *
 * ⚠️ **ولا يُعرض شيءٌ من مخرجاته على متعلّم قبل مراجعة مختصّ في
 * التجويد.** نحن نبني الاشتقاق، ولا نُفتي في الحكم.
 */

// ── محارف الرسم ───────────────────────────────────────────
const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SUKUN = 'ْ';
const SHADDA = 'ّ';
const TANWEEN = 'ًٌٍ';
/** ميم صغيرة فوقية — علامة الإقلاب. */
const IQLAB_MARK = 'ۢ';
/** صفر مستدير — حرفٌ لا يُنطق (`ٱتَّقَوْا۟`). */
const ROUND_ZERO = '۟';
const UPRIGHT_ZERO = '۠';

const HARAKAT = FATHA + DAMMA + KASRA + SUKUN + SHADDA + TANWEEN;

/** حروف الحلق — بها الإظهار. */
const THROAT = 'ءأإآهعحغخ';
/** «ينمو» — بها الإدغام بغنّة. */
const GHUNNAH_LETTERS = 'ينمو';
/** بها الإدغام بغير غنّة. */
const NO_GHUNNAH_LETTERS = 'لر';
/** حروف القلقلة — «قطب جد». */
const QALQALAH = 'قطبجد';
/** الحروف الشمسية — تُدغم فيها لام التعريف. */
const SUN_LETTERS = 'تثدذرزسشصضطظلن';

const isLetter = (c: string) =>
  (c >= 'ء' && c <= 'ي') || c === 'ٱ' || c === 'ى';

/** توحيد صور الهمزة للمقارنة — للمقارنة وحدها، ولا يمسّ النصّ. */
function baseLetter(c: string): string {
  if ('أإآٱ'.indexOf(c) !== -1) return c === 'ٱ' ? 'ٱ' : 'ء';
  return c;
}

type Tok = {
  /** الحرف. */
  ch: string;
  /** موضعه في نصّ الآية. */
  at: number;
  /** العلامات التي تليه مباشرة. */
  marks: string;
  /** ترتيب كلمته. */
  word: number;
};

/** تفكيك الآية إلى حروف، كلٌّ بعلاماته وموضعه وكلمته. */
function scan(text: string): Tok[] {
  const out: Tok[] = [];
  let word = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ') {
      word++;
      continue;
    }
    if (!isLetter(c)) continue;
    let marks = '';
    let j = i + 1;
    while (j < text.length && text[j] !== ' ' && !isLetter(text[j])) {
      marks += text[j];
      j++;
    }
    out.push({ ch: c, at: i, marks, word });
  }
  return out;
}

const has = (m: string, c: string) => m.indexOf(c) !== -1;
const isSilent = (t: Tok) => has(t.marks, ROUND_ZERO) || has(t.marks, UPRIGHT_ZERO);
/** ساكنٌ بالرسم: سكونٌ ظاهر، أو عارٍ من كل حركة. */
const bare = (t: Tok) =>
  !has(t.marks, FATHA) && !has(t.marks, DAMMA) && !has(t.marks, KASRA) &&
  !has(t.marks, SHADDA) && !TANWEEN.split('').some((x) => has(t.marks, x)) &&
  !has(t.marks, SUKUN);
const hasSukun = (t: Tok) => has(t.marks, SUKUN);
const hasTanween = (t: Tok) => TANWEEN.split('').some((x) => has(t.marks, x));

/**
 * أحكام الآية الواحدة.
 *
 * ⚠️ دالّة خالصة: النصّ يدخل، والمواضع تخرج، ولا شيء بينهما. فتُختبر
 * كاملةً بلا قاعدة بيانات ولا شبكة.
 */
export function annotateAyah(
  text: string,
  surah: number,
  ayah: number
): TajweedAnnotation[] {
  const toks = scan(text);
  const out: TajweedAnnotation[] = [];

  const add = (
    t: Tok,
    rule: TajweedRule,
    next: Tok | null,
    span?: { start: number; end: number }
  ) =>
    out.push({
      surah,
      ayah,
      wordIndex: t.word,
      start: span ? span.start : t.at,
      end: span ? span.end : t.at + 1 + t.marks.length,
      rule,
      trigger: t.ch,
      next: next ? next.ch : '',
    });

  /**
   * الحرف التالي المنطوق.
   *
   * ⚠️ **تُتخطّى ألفُ التنوين.** تنوين الفتح يُرسم ومعه ألفٌ صامتة
   * (`كِتَٰبًا` · `مَآءً`)، وهي رسمٌ لا حرفٌ يُنطق. وقد حسبناها أوّل
   * مرّة حرفًا تاليًا، فأنتج ذلك ٢٬٩٧٩ حكمَ إخفاءٍ باطلًا — والألف
   * ليست من حروف الإخفاء أصلًا. كشفه أن سألنا: **ما الحرف الذي
   * يلي؟** بدل أن نسأل: كم حكمًا خرج؟
   */
  const nextSpoken = (i: number, t: Tok): Tok | null => {
    let j = i + 1;
    if (
      j < toks.length &&
      hasTanween(t) &&
      (toks[j].ch === 'ا' || toks[j].ch === 'ى') &&
      toks[j].marks === '' &&
      toks[j].word === t.word
    )
      j++;
    return j < toks.length ? toks[j] : null;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const n = nextSpoken(i, t);
    const sameWord = n !== null && n.word === t.word;

    // ── همزة الوصل ────────────────────────────────────────
    if (t.ch === 'ٱ') add(t, 'hamzat_wasl', null);

    // ── لام التعريف الشمسية ───────────────────────────────
    // ⚠️ الشرط ثلاثيّ لا واحد: ٱ ثم لام عارية ثم حرفٌ شمسيّ مشدّد.
    // ولولا اشتراط الشدّة لالتبست الشمسية بالقمرية في مثل `ٱلْقَمَر`.
    if (
      t.ch === 'ل' &&
      bare(t) &&
      i > 0 &&
      toks[i - 1].ch === 'ٱ' &&
      n &&
      sameWord &&
      SUN_LETTERS.indexOf(n.ch) !== -1 &&
      has(n.marks, SHADDA)
    )
      add(t, 'lam_shamsiyyah', n);

    // ── الغنّة: نون أو ميم مشدّدة ─────────────────────────
    if ((t.ch === 'ن' || t.ch === 'م') && has(t.marks, SHADDA)) add(t, 'ghunnah', null);

    // ── القلقلة ───────────────────────────────────────────
    // ⚠️ الساكن وحده. والمتحرّك من حروفها لا قلقلة فيه.
    if (QALQALAH.indexOf(t.ch) !== -1 && (hasSukun(t) || (bare(t) && !isSilent(t))))
      add(t, 'qalqalah', null);

    // ── الميم الساكنة ─────────────────────────────────────
    if (t.ch === 'م' && (hasSukun(t) || bare(t)) && !has(t.marks, SHADDA) && n) {
      if (n.ch === 'ب') add(t, 'ikhfa_shafawi', n);
      else if (n.ch === 'م') add(t, 'idgham_shafawi', n);
      else if (hasSukun(t)) add(t, 'idhhar_shafawi', n);
    }

    // ── النون الساكنة والتنوين ────────────────────────────
    const isNoonSakin = t.ch === 'ن' && !has(t.marks, SHADDA) && (hasSukun(t) || bare(t));
    const isTanween = hasTanween(t);
    if ((isNoonSakin || isTanween) && n && !isSilent(t)) {
      const nb = baseLetter(n.ch);

      if (has(t.marks, IQLAB_MARK)) {
        // ⚠️ الإقلاب يُعرف بعلامته لا باستنتاجه — والرسم يكفينا
        add(t, 'iqlab', n);
      } else if (THROAT.indexOf(nb) !== -1 || THROAT.indexOf(n.ch) !== -1) {
        add(t, 'idhhar', n);
      } else if (NO_GHUNNAH_LETTERS.indexOf(n.ch) !== -1 && has(n.marks, SHADDA)) {
        add(t, 'idgham_no_ghunnah', n);
      } else if (GHUNNAH_LETTERS.indexOf(n.ch) !== -1) {
        /**
         * ⚠️ **إدغامٌ عبر الكلمتين فقط.**
         * نون + (ي و) في الكلمة الواحدة إظهارٌ مطلق — `ٱلدُّنْيَا`
         * `بُنْيَٰن` `صِنْوَان` `قِنْوَان` — ويرسمها النصّ بسكونٍ
         * ظاهر. فاشتراطُ اختلاف الكلمة يفصل بينهما بلا استثناءات
         * مكتوبة بأسماء الكلمات.
         */
        if (!sameWord) add(t, 'idgham_ghunnah', n);
        else if (hasSukun(t)) add(t, 'idhhar', n);
      } else {
        add(t, 'ikhfa', n);
      }
    }
  }

  return out;
}
