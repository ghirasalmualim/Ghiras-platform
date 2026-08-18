/**
 * أنواع قسم القرآن — المرحلة ٠.
 *
 * تعكس جداول `supabase/quran/2026-08-18-phase0-corpus.sql` حرفيًا.
 * أي تغيير هنا يجب أن يقابله تغيير هناك، والعكس.
 */

/** سورة من فهرس المصحف. */
export type Surah = {
  number: number;
  name_ar: string;
  name_translit: string;
  name_en: string;
  ayah_count: number;
  revelation_place: "meccan" | "medinan";
  revelation_order: number;
};

/**
 * آية.
 *
 * `text_uthmani` هو النص المرجعي، وهو **الوحيد** الذي يُعرض للمستخدم.
 * `text_simple` نسخة المقارنة كما وردت من المصدر نفسه (لا نشتقّها نحن)،
 * تُستعمل في البحث ولا تُعرض.
 */
export type Ayah = {
  surah: number;
  ayah: number;
  text_uthmani: string;
  text_simple: string;
};

/**
 * كلمة داخل آية.
 *
 * `position` يبدأ من ١ وهو جزء أصيل من البيانات: ترتيب الكلمات لا يُخلط
 * في أي شاشة أو نشاط. نشاط «رتّب الآية» ممنوع في هذه المنصة قرارًا لا سهوًا.
 *
 * `text_normalized` مشتقّة من العثماني بمطبِّع موثَّق، للمقارنة فقط،
 * ولا تُعرض ولا تُعتمد نصًا.
 */
export type QuranWord = {
  surah: number;
  ayah: number;
  position: number;
  text_uthmani: string;
  text_normalized: string;
};

/**
 * قارئ.
 *
 * لا يُفعَّل أي قارئ (`is_active`) قبل التأكد من مصدره وترخيصه والإذن
 * باستخدامه داخل المنصة. الجدول يستوعب قرّاءً كثيرين ولو اكتفت النسخة
 * الأولى بواحد.
 */
export type Reciter = {
  id: string;
  name_ar: string;
  style: string | null;
  base_url: string;
  licence: string;
  source_note: string | null;
  is_active: boolean;
};

/** ملف صوتي لآية بصوت قارئ. */
export type AyahAudio = {
  reciter_id: string;
  surah: number;
  ayah: number;
  url: string;
  duration_ms: number | null;
};

/** سجل نزاهة النص: بصمة كل استيراد ومن راجعه. */
export type CorpusMeta = {
  id: number;
  source_name: string;
  source_url: string;
  edition: string;
  riwayah: string;
  licence: string;
  uthmani_sha256: string;
  simple_sha256: string;
  surah_count: number;
  ayah_count: number;
  word_count: number;
  imported_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_current: boolean;
};

/**
 * دقة الحفظ ودقة التجويد منفصلتان تمامًا ولا تُدمجان في رقم واحد.
 *
 * السبب: الخلط بينهما يظلم الطالب. من يحفظ الآية كاملة صحيحة لكن يخطئ
 * في مدٍّ لا يجوز أن ينخفض «حفظه». ولا يصدر عن المنصة حكم تجويدي أصلًا
 * قبل وجود نموذج متخصص مُتحقَّق منه — إلى ذلك الحين يبقى هذا النوع
 * معرَّفًا وغير مستعمل.
 */
export type MemorizationAccuracy = {
  surah: number;
  ayah: number;
  /** نسبة الكلمات المطابقة بعد التطبيع (٠–١٠٠). */
  score: number;
  /** مواضع الكلمات التي لم تُطابق — الموضع لا الكلمة، حفاظًا على الخصوصية. */
  missed_positions: number[];
};

/** محجوز للمستقبل. لا يُحسب ولا يُعرض حتى يوجد نموذج تجويد متخصص مُتحقَّق منه. */
export type TajweedAccuracy = {
  surah: number;
  ayah: number;
  score: number;
  rule: string;
  word_position: number;
};
