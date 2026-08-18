/**
 * توليد أسئلة التدريب.
 *
 * ⚠️⚠️ القاعدة الحاكمة لهذا الملف كله:
 *
 *   **كل حرف يظهر للطالب — صحيحًا كان أو خاطئًا — منقولٌ حرفيًا من
 *   نص المصحف المرجعي. لا يُولَّد نص قرآني هنا ولا في أي مكان.**
 *
 * الإجابة الصحيحة تُقتطع من الآية نفسها. والخيارات الخاطئة **كلمات
 * وآيات حقيقية من القرآن** تُؤخذ من مواضع أخرى — فليس فيها حرف مخترع،
 * وأسوأ ما فيها أنها في غير موضعها.
 *
 * ولهذا السبب بالذات تُعرض الخيارات في بطاقات منفصلة عن نص المصحف
 * (انظر `.answer-card` في globals.css): الخيار الخاطئ كلامٌ قرآني
 * صحيح في موضعه هو، فلو عُرض في سياق الآية لبدا كأنه منها. الفصل
 * البصري هو ما يمنع هذا اللبس.
 *
 * ⚠️ ولا تُخلط كلمات آية قط. في «الكلمة المفقودة» تبقى الآية كاملة
 * بترتيبها ويُفرَّغ موضع واحد. ولا يوجد — ولن يوجد — «رتّب الآية».
 *
 * والتوليد **حتمي**: نفس المقطع ونفس البذرة يعطيان نفس السؤال دائمًا،
 * فلا يتبدّل السؤال تحت يد الطالب، ويمكن اختبار السلوك.
 */

import type { Ayah } from '../types';
import { normalizeForComparison, splitWords } from './normalize.mjs';
import { seedFrom, seededShuffle } from './random.mjs';

export const ACTIVITY_KINDS = [
  'missing_word',
  'complete_ayah',
  'next_ayah',
  'listen_identify',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  missing_word: 'الكلمة المفقودة',
  complete_ayah: 'أكمل الآية',
  next_ayah: 'ما الآية التالية؟',
  listen_identify: 'اسمع وحدّد',
};

export const ACTIVITY_ICON: Record<ActivityKind, string> = {
  missing_word: '🔤',
  complete_ayah: '✍️',
  next_ayah: '➡️',
  listen_identify: '🎧',
};

export type Choice = {
  /** معرّف ثابت للخيار — لا يتغيّر مع إعادة الرسم. */
  id: string;
  /** نص منقول حرفيًا من المصحف. */
  text: string;
  correct: boolean;
};

type Base = {
  kind: ActivityKind;
  surah: number;
  /** الآية موضوع السؤال — دائمًا داخل المقطع المحدد. */
  ayah: number;
  choices: Choice[];
};

export type Question =
  | (Base & {
      kind: 'missing_word';
      /** كلمات الآية بترتيبها الأصلي — تُعرض كاملة ويُفرَّغ موضع واحد. */
      words: string[];
      /** موضع الكلمة المخفية داخل `words`. */
      blankIndex: number;
    })
  | (Base & {
      kind: 'complete_ayah';
      /** صدر الآية كما هو — يُعرض بخط المصحف. */
      head: string;
    })
  | (Base & {
      kind: 'next_ayah';
      /** نص الآية المعروضة كاملًا. */
      promptText: string;
    })
  | (Base & { kind: 'listen_identify' });

/** ما يحتاجه المولّد. `pool` آيات إضافية من السورة نفسها للخيارات فقط. */
export type QuestionSource = {
  /** آيات المقطع المحدد — ومنها وحدها يُختار موضوع السؤال. */
  segment: Ayah[];
  /** آيات أخرى من السورة، تُستعمل خيارات خاطئة عند قصر المقطع. */
  pool?: Ayah[];
};

const CHOICE_COUNT = 4;

/** عدد حروف الكلمة بعد التطبيع — بلا نشر نصّي، فهدف الترجمة أقدم من es2015. */
function letterCount(word: string): number {
  return (normalizeForComparison(word).match(/[\u0621-\u064A]/g) ?? []).length;
}

/** كلمة قصيرة جدًا لا تصلح سؤالًا: «فِى» و«مَا» ونحوها. */
const MIN_WORD_LETTERS = 3;

/** أقل عدد كلمات في آية تصلح لسؤال «أكمل الآية». */
const MIN_WORDS_FOR_SPLIT = 5;

function uniqueByNormalized(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    const k = normalizeForComparison(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** يبني خيارات: الصحيح + مشتِّتات حقيقية، مخلوطة ببذرة ثابتة. */
function buildChoices(correct: string, distractors: string[], seed: number): Choice[] {
  const correctKey = normalizeForComparison(correct);
  const picked = uniqueByNormalized(distractors)
    .filter((d) => normalizeForComparison(d) !== correctKey)
    .slice(0, CHOICE_COUNT - 1);

  const all = [
    { id: 'c', text: correct, correct: true },
    ...picked.map((t, i) => ({ id: `d${i}`, text: t, correct: false })),
  ];
  return seededShuffle(all, seed);
}

// ── ١) الكلمة المفقودة ──────────────────────────────────────

/**
 * الآية كاملة بترتيبها، ويُفرَّغ موضع كلمة واحدة.
 *
 * المشتِّتات كلمات حقيقية من آيات المقطع نفسه. اخترناها من المقطع لا
 * من كل المصحف عن قصد: تكون مألوفة للطالب فيصير السؤال تمييزًا لا
 * تخمينًا، وتبقى كلها كلامًا قرآنيًا.
 */
export function makeMissingWord(src: QuestionSource, seed: number): Question | null {
  const rand = seededShuffle(src.segment, seed);
  for (const a of rand) {
    const words = splitWords(a.text_uthmani);
    const candidates = words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => letterCount(w) >= MIN_WORD_LETTERS);
    if (!candidates.length) continue;

    const chosen: { w: string; i: number } = seededShuffle(candidates, seed + a.ayah)[0];

    const distractors = seededShuffle(
      [...src.segment, ...(src.pool ?? [])].flatMap((x) => splitWords(x.text_uthmani)),
      seed + 1
    ).filter((w) => letterCount(w) >= MIN_WORD_LETTERS);

    const choices = buildChoices(chosen.w, distractors, seed + 2);
    if (choices.length < 2) continue;

    return {
      kind: 'missing_word',
      surah: a.surah,
      ayah: a.ayah,
      // ⚠️ `words` بترتيبها الأصلي ولا تُخلط أبدًا
      words,
      blankIndex: chosen.i,
      choices,
    };
  }
  return null;
}

// ── ٢) أكمل الآية ───────────────────────────────────────────

/**
 * يُعرض صدر الآية، ويُطلب عجزها.
 *
 * المشتِّتات أعجاز آيات أخرى — نص قرآني حقيقي. ولذلك تُعرض في بطاقات
 * منفصلة لا موصولة بالصدر، لئلا تبدو آية مركّبة لا وجود لها.
 */
export function makeCompleteAyah(src: QuestionSource, seed: number): Question | null {
  const pool = [...src.segment, ...(src.pool ?? [])];
  for (const a of seededShuffle(src.segment, seed)) {
    const words = splitWords(a.text_uthmani);
    if (words.length < MIN_WORDS_FOR_SPLIT) continue;

    // نقطع عند منتصف الآية تقريبًا، فيبقى الصدر دالًّا والعجز مطلوبًا
    const cut = Math.max(2, Math.floor(words.length / 2));
    const head = words.slice(0, cut).join(' ');
    const tail = words.slice(cut).join(' ');

    const distractors = pool
      .filter((x) => !(x.surah === a.surah && x.ayah === a.ayah))
      .map((x) => {
        const w = splitWords(x.text_uthmani);
        if (w.length < MIN_WORDS_FOR_SPLIT) return null;
        return w.slice(Math.max(2, Math.floor(w.length / 2))).join(' ');
      })
      .filter((t): t is string => Boolean(t));

    const choices = buildChoices(tail, seededShuffle(distractors, seed + 3), seed + 4);
    if (choices.length < 2) continue;

    return { kind: 'complete_ayah', surah: a.surah, ayah: a.ayah, head, choices };
  }
  return null;
}

// ── ٣) ما الآية التالية؟ ────────────────────────────────────

/**
 * تُعرض آية، ويُسأل عن التي تليها.
 *
 * ⚠️ لا يُختار إلا موضعٌ **تاليه داخل المقطع** أيضًا. فلا نسأل الطالب
 * عن آية لم يُطلب منه حفظها، ولا نخرج عن المدى الذي اختاره.
 */
export function makeNextAyah(src: QuestionSource, seed: number): Question | null {
  const byAyah = new Map(src.segment.map((a) => [a.ayah, a]));
  const eligible = src.segment.filter((a) => byAyah.has(a.ayah + 1));
  if (!eligible.length) return null;

  for (const a of seededShuffle(eligible, seed)) {
    const next = byAyah.get(a.ayah + 1)!;
    const distractors = [...src.segment, ...(src.pool ?? [])]
      .filter(
        (x) =>
          !(x.surah === next.surah && x.ayah === next.ayah) &&
          !(x.surah === a.surah && x.ayah === a.ayah)
      )
      .map((x) => x.text_uthmani);

    const choices = buildChoices(
      next.text_uthmani,
      seededShuffle(distractors, seed + 5),
      seed + 6
    );
    if (choices.length < 2) continue;

    return {
      kind: 'next_ayah',
      surah: a.surah,
      ayah: a.ayah,
      promptText: a.text_uthmani,
      choices,
    };
  }
  return null;
}

// ── ٤) اسمع وحدّد ───────────────────────────────────────────

/**
 * تُتلى آية بلا نص، ويُطلب تحديدها.
 *
 * الصوت من نفس محرك الصوت ونفس القارئ المختار — لا مشغّل ثانٍ.
 */
export function makeListenIdentify(src: QuestionSource, seed: number): Question | null {
  if (src.segment.length < 2) return null;

  for (const a of seededShuffle(src.segment, seed)) {
    const distractors = [...src.segment, ...(src.pool ?? [])]
      .filter((x) => !(x.surah === a.surah && x.ayah === a.ayah))
      .map((x) => x.text_uthmani);

    const choices = buildChoices(
      a.text_uthmani,
      seededShuffle(distractors, seed + 7),
      seed + 8
    );
    if (choices.length < 2) continue;

    return { kind: 'listen_identify', surah: a.surah, ayah: a.ayah, choices };
  }
  return null;
}

// ── الاختيار بين الأنشطة ────────────────────────────────────

const MAKERS: Record<
  ActivityKind,
  (src: QuestionSource, seed: number) => Question | null
> = {
  missing_word: makeMissingWord,
  complete_ayah: makeCompleteAyah,
  next_ayah: makeNextAyah,
  listen_identify: makeListenIdentify,
};

/** خلاصة أداء الطالب في هذا المقطع — تُبنى من سجل المحاولات. */
export type ActivityPerformance = Partial<Record<ActivityKind, { wrong: number; total: number }>>;

/**
 * يرتّب الأنشطة حسب حاجة الطالب — **بقواعد صريحة لا ذكاء اصطناعي**.
 *
 * القاعدة: النشاط الذي يخطئ فيه أكثر يتقدّم، لأن الخطأ يدلّ على نوع
 * النسيان. من يخطئ في «ما الآية التالية؟» يجد صعوبة في الربط بين
 * الآيات، ومن يخطئ في «الكلمة المفقودة» ينسى داخل الآية. فنعطيه ما
 * يحتاجه لا ما يجيده.
 *
 * وليس عشوائيًا بالكامل: مرتّب بقاعدة وبذرة، فيمكن اختبار السلوك.
 */
export function rankActivities(
  perf: ActivityPerformance,
  seed: number
): ActivityKind[] {
  /** نشاط لم يُجرَّب بعد يأخذ قيمة وسطى. */
  const UNTRIED = 0.5;

  const errorRate = (k: ActivityKind) => {
    const p = perf[k];
    // الوسط لا الآخر: النشاط الذي لم يُجرَّب أولى بالعرض ممّا أتقنه
    // الطالب. ولو جعلناه آخرًا لظلّ يكرّر ما يجيده ولا يرى الجديد.
    if (!p || p.total === 0) return UNTRIED;
    return p.wrong / p.total;
  };
  // بذرة تكسر التعادل بثبات، فلا يتكرّر نفس النشاط أبدًا عند تساوي الأداء
  const jitter = seededShuffle(ACTIVITY_KINDS, seed);
  return [...ACTIVITY_KINDS].sort((a, b) => {
    const d = errorRate(b) - errorRate(a);
    if (Math.abs(d) > 0.001) return d;
    return jitter.indexOf(a) - jitter.indexOf(b);
  });
}

/**
 * يبني حصة تدريب قصيرة.
 *
 * قصيرة عن قصد: هيّسة طلبت ألا يشعر الطالب أنه أمام اختبار طويل.
 * ونتخطّى أي نشاط لا يمكن توليده من هذا المقطع (مقطع من آية واحدة
 * لا يصلح لـ«ما الآية التالية؟») بدل أن نُفشل الحصة كلها.
 */
export function buildSession(
  src: QuestionSource,
  perf: ActivityPerformance,
  seed: number,
  count = 4
): Question[] {
  const order = rankActivities(perf, seed);
  const out: Question[] = [];
  let round = 0;
  while (out.length < count && round < count * ACTIVITY_KINDS.length) {
    const kind = order[round % order.length];
    const q = MAKERS[kind](src, seedFrom(seed, kind, round));
    if (q && !out.some((x) => x.kind === q.kind && x.ayah === q.ayah)) out.push(q);
    round++;
  }
  return out;
}

/** التحقق من إجابة — بالمقارنة المطبَّعة، فلا يضرّ اختلاف رسم. */
export function isCorrectChoice(q: Question, choiceId: string): boolean {
  const c = q.choices.find((x) => x.id === choiceId);
  return Boolean(c?.correct);
}
