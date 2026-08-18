/**
 * محرك الصوت — بناء روابط التلاوة وخطة التكرار.
 *
 * دوال نقية بلا حالة وبلا شبكة، حتى تكون قابلة للاختبار وحدها. التشغيل
 * الفعلي في `components/AudioPlayer.tsx` ويستهلك ما تنتجه هذه الدوال.
 *
 * القارئ ليس ثابتًا في الشيفرة: يأتي من جدول `quran_reciter` الذي يحمل
 * ترخيص كل تلاوة. تبديل القارئ سطر في الجدول لا تعديل في الشيفرة —
 * وهذا مقصود، لأن مصدر الصوت قد يتغيّر يومًا لأسباب حقوقية.
 */

import type { Reciter, Segment } from "../types";

/**
 * عدد آيات كل سورة. ثابت متواتر مكرّر هنا عمدًا: هذه الدوال نقية
 * وتعمل على العميل حيث لا يوجد ملف المصحف، والقيم مُتحقَّق من مطابقتها
 * لـ `corpus/surahs.json` في `test-audio.mjs`.
 */
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
  49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
  26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];

/** مجموع الآيات قبل كل سورة — يُحسب مرة واحدة. */
const OFFSETS = (() => {
  const o = [0];
  for (let i = 0; i < AYAH_COUNTS.length; i++) o.push(o[i] + AYAH_COUNTS[i]);
  return o;
})();

export function ayahCountOf(surah: number): number {
  return AYAH_COUNTS[surah - 1] ?? 0;
}

/**
 * رقم الآية العام (١..٦٢٣٦) — وهو ما تُسمّى به ملفات الصوت.
 * مثال: أول آية في البقرة (٢:١) رقمها العام ٨.
 */
export function globalAyahNumber(surah: number, ayah: number): number {
  if (surah < 1 || surah > 114) throw new Error(`رقم سورة خارج المدى: ${surah}`);
  const count = AYAH_COUNTS[surah - 1];
  if (ayah < 1 || ayah > count)
    throw new Error(`الآية ${ayah} خارج سورة ${surah} (فيها ${count})`);
  return OFFSETS[surah - 1] + ayah;
}

/** رابط تلاوة آية واحدة بصوت قارئ. */
export function ayahAudioUrl(reciter: Reciter, surah: number, ayah: number): string {
  return `${reciter.base_url}/${globalAyahNumber(surah, ayah)}.mp3`;
}

/**
 * رابط تلاوة البسملة.
 *
 * ملفات المصدر مرقّمة بالآيات، والبسملة في ١١٣ سورة ليست آية معدودة
 * فلا ملف لها. لكنها **في الفاتحة آية**، ورقمها العام ١، فملفّها موجود
 * ويحوي البسملة وحدها (٥٫٢ ثانية بصوت الحصري — مقيسة لا مفترَضة).
 *
 * فنستعملها بسملةً لأول أي سورة: نفس القارئ، ونفس الكلمات، ونفس
 * المصدر المرخَّص. لا نُنشئ صوتًا ولا نقتطع من ملف.
 */
export function basmalaAudioUrl(reciter: Reciter): string {
  return `${reciter.base_url}/1.mp3`;
}

/** خيارات التكرار المعروضة. «مخصص» يُدخله الطالب بنفسه. */
export const REPEAT_PRESETS = [1, 3, 5, 7, 10] as const;

/** أقصى تكرار مسموح — حدٌّ يمنع قائمة تشغيل لا تنتهي بالغلط. */
export const MAX_REPEAT = 99;

export function clampRepeat(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_REPEAT, Math.max(1, Math.floor(n)));
}

/** نطاق التكرار: آية واحدة، أم المدى المحدد كله. */
export type RepeatScope = "ayah" | "range";

export type PlaylistItem = {
  surah: number;
  ayah: number;
  url: string;
  /** الجولة الحالية من أصل `of` — لعرض «٢ من ٥» للطالب. */
  round: number;
  of: number;
  /** البسملة الافتتاحية: ليست آية، فلا تُظلَّل ولا يُعرض لها رقم. */
  isBasmala?: boolean;
};

/**
 * يبني قائمة التشغيل كاملةً مقدَّمًا.
 *
 * القائمة صريحة لا محسوبة أثناء التشغيل، لأن Safari على iPhone وiPad
 * لا يسمح ببدء صوت جديد إلا ضمن تفاعل من المستخدم أو استكمالًا لتشغيل
 * قائم. فبمعرفة العنصر التالي سلفًا نستطيع تحميله مسبقًا ثم تشغيله
 * فور انتهاء سابقه بلا انقطاع يبطل الإذن.
 *
 * الفرق بين النطاقين مقصود ومهم في الحفظ:
 *   ayah  → تُكرَّر الآية الأولى ٥ مرات، ثم الثانية ٥ مرات… (تثبيت آية آية)
 *   range → يُتلى المدى كاملًا، ثم يُعاد كاملًا ٥ مرات (ربط الآيات ببعضها)
 */
export function buildPlaylist(
  reciter: Reciter,
  /**
   * مقطع واحد، أو مقاطع صفحة تعبر أكثر من سورة.
   *
   * ٥١ صفحة من ٦٠٤ تعبر سورة، فالصفحة قائمة مقاطع لا مقطعًا واحدًا.
   * ووسّعنا هذه الدالة بدل أن نكتب لها نظيرة: منطق التكرار واحد، ولو
   * تفرّع لاختلف سلوك الصفحة عن سلوك المدى بلا سبب.
   */
  segment: Segment | Segment[],
  repeat: number,
  scope: RepeatScope,
  /**
   * هل يُسبَق كل مقطع ببسملة مُتلوّة؟ قيمة واحدة للمقطع المفرد، أو
   * قائمة بطول المقاطع. يقرّره النص لا المشغّل.
   */
  withBasmala: boolean | boolean[] = false
): PlaylistItem[] {
  const segments = Array.isArray(segment) ? segment : [segment];
  const flags = Array.isArray(withBasmala)
    ? withBasmala
    : segments.map((_, i) => (i === 0 ? withBasmala : false));

  const times = clampRepeat(repeat);
  const items: PlaylistItem[] = [];

  type Unit = { surah: number; ayah: number; basmala: boolean };
  const units: Unit[] = [];
  segments.forEach((seg, i) => {
    if (flags[i]) units.push({ surah: seg.surah, ayah: 0, basmala: true });
    for (let a = seg.from_ayah; a <= seg.to_ayah; a++)
      units.push({ surah: seg.surah, ayah: a, basmala: false });
  });
  const ayahUnits = units.filter((u) => !u.basmala);
  if (!ayahUnits.length) return items;

  const push = (u: Unit, round: number, of: number) => {
    const item: PlaylistItem = {
      surah: u.surah,
      ayah: u.ayah,
      url: u.basmala
        ? basmalaAudioUrl(reciter)
        : ayahAudioUrl(reciter, u.surah, u.ayah),
      round,
      of,
    };
    if (u.basmala) item.isBasmala = true;
    items.push(item);
  };

  // البسملة تُتلى **مرة واحدة** لا مع كل جولة تكرار: هي افتتاحية للسورة
  // لا جزء من المقطع المحفوظ، ولو أُعيدت لسُمعت عشر مرات في تمرين من
  // عشر جولات. وفي الصفحة العابرة تُتلى لكل سورة تبدأ فيها.
  for (const b of units.filter((u) => u.basmala)) push(b, 1, 1);

  if (scope === 'ayah') {
    for (const u of ayahUnits) for (let r = 1; r <= times; r++) push(u, r, times);
  } else {
    for (let r = 1; r <= times; r++) for (const u of ayahUnits) push(u, r, times);
  }
  return items;
}
