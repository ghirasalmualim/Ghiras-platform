/**
 * صفحات المصحف.
 *
 * ── لماذا ──
 * كثير من الحفّاظ يحفظون بالصفحة لا بالآيات: «اليوم صفحة». وحدود
 * الصفحة سندٌ بصري للحافظ — يتذكّر موضع الآية في الورقة. فاختيار
 * «صفحة ٥٨٢» أقرب إلى عادته من «الملك ١ إلى ١٢».
 *
 * ── المصدر ──
 * ترقيم **مصحف المدينة** (٦٠٤ صفحات)، من بيانات Tanzil نفسها التي
 * جاء منها النص. فلا مصدر جديد ولا ترخيص جديد ولا احتمال أن تنحرف
 * حدود الصفحة عن النص الذي تصفه.
 *
 * ── الصفحة العابرة ──
 * ٥١ صفحة من ٦٠٤ تعبر أكثر من سورة (٨٪). فالصفحة **قائمة مقاطع** لا
 * مقطعًا واحدًا. و٩٢٪ منها مقطع واحد فتمرّ بالمحرك كما هي.
 *
 * ولم نُخفِ العبور بتقسيم الصفحة: الصفحة في المصحف تُظهر السورتين معًا،
 * وإخفاء ذلك يناقض سبب الميزة. فتُعرض كما هي، وتُحفظ داخليًا مقاطع
 * لأن التقدّم والمراجعة يحتاجان سورةً ومدى.
 *
 * ⚠️ والنص نصّنا لا صورة المصحف: نفس آيات الصفحة بخط أميري، فالحدود
 * مطابقة والشكل شكلنا.
 */

import type { Segment } from '../types';
import raw from '../corpus/pages.json';

/** عدد صفحات مصحف المدينة. */
export const TOTAL_PAGES = 604;

/** `[surah, from_ayah, to_ayah]` — الصيغة المخزَّنة، مضغوطة عن قصد. */
type RawSegment = [number, number, number];

const PAGES = raw as unknown as RawSegment[][];

export type Page = {
  /** ١..٦٠٤ */
  number: number;
  /** مقاطع الصفحة مرتّبة. أكثر من واحد يعني أنها تعبر سورة. */
  segments: Segment[];
};

function toPage(n: number): Page {
  return {
    number: n,
    segments: PAGES[n - 1].map(([surah, from_ayah, to_ayah]) => ({
      surah,
      from_ayah,
      to_ayah,
    })),
  };
}

export function getPage(n: number): Page | null {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_PAGES) return null;
  return toPage(n);
}

/** الصفحة التي تقع فيها آية — لعرض «أنت في صفحة كذا». */
export function pageOf(surah: number, ayah: number): number | null {
  for (let i = 0; i < PAGES.length; i++) {
    for (const [s, f, t] of PAGES[i]) {
      if (s === surah && ayah >= f && ayah <= t) return i + 1;
    }
  }
  return null;
}

/** أرقام صفحات سورة — لاختيار «صفحات هذه السورة». */
export function pagesOfSurah(surah: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < PAGES.length; i++) {
    if (PAGES[i].some(([s]) => s === surah)) out.push(i + 1);
  }
  return out;
}

/** السور التي تظهر في الصفحة — لعنوانها. */
export function surahsOfPage(page: Page): number[] {
  const seen: number[] = [];
  for (const s of page.segments) if (!seen.includes(s.surah)) seen.push(s.surah);
  return seen;
}

/** عدد آيات الصفحة. */
export function ayahCountOfPage(page: Page): number {
  return page.segments.reduce((n, s) => n + (s.to_ayah - s.from_ayah + 1), 0);
}

/**
 * الجزء الذي تقع فيه الصفحة (١..٣٠).
 *
 * حسابيّ لا مخزَّن: المصحف ثلاثون جزءًا موزّعة على ٦٠٤ صفحات بانتظام
 * تقريبي، والجزء الأول يبدأ من الصفحة ١ وكل جزء بعده كل ٢٠ صفحة.
 * تقريبٌ يكفي للعرض ولا يُبنى عليه شيء.
 */
export function juzOfPage(n: number): number {
  if (n <= 1) return 1;
  return Math.min(30, Math.floor((n - 2) / 20) + 1);
}
