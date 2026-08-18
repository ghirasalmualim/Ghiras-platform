/**
 * عشوائية ببذرة — تبدو عشوائية وتتكرّر بنفسها.
 *
 * نحتاج هذا في موضعين: اختيار الكلمات المخفية، واختيار أسئلة التدريب
 * وخياراتها. وفي الموضعين تكون `Math.random` خطأً:
 *
 *   • في الإخفاء تجعل النص يرتجف مع كل إعادة رسم، فلا يستقر على شكل
 *     يحفظه الطالب.
 *   • في التدريب تجعل السؤال يتبدّل تحت يد الطالب أثناء إجابته، وتمنع
 *     اختبار سلوك النظام لأنه لا يعيد النتيجة نفسها مرتين.
 *
 * mulberry32 — صغير وسريع وكافٍ تمامًا لهذا الغرض. وليس للتعمية.
 */

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * خلط نسخة من المصفوفة ببذرة ثابتة.
 *
 * ⚠️ لا يُستعمل هذا على كلمات آية قط. خلط كلام الله ممنوع في هذه
 * المنصة قرارًا دائمًا. مكانه الوحيد ترتيب **خيارات الإجابة** — وهي
 * بطاقات تدريب لا نص مصحف.
 */
/**
 * @template T
 * @param {readonly T[]} items
 * @param {number} seed
 * @returns {T[]}
 */
export function seededShuffle(items, seed) {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** بذرة عددية ثابتة من نص — لتوليد أسئلة تتكرّر بنفسها. */
/**
 * @param {...(string|number)} parts
 * @returns {number}
 */
export function seedFrom(...parts) {
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
