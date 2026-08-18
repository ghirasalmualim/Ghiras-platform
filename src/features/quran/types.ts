/**
 * أنواع قسم القرآن.
 *
 * مصدران لا ثالث لهما:
 *   • النص الثابت — ملفات `corpus/` في المستودع (السور، الآيات، البصمة).
 *   • ما يتغيّر فعلًا — جداول `supabase/quran/2026-08-19-phase1.sql`
 *     (القرّاء، تقدّم الطالبة، دروس المنهج).
 *
 * أي تغيير هنا يقابله تغيير هناك، والعكس.
 */

/**
 * بطاقة تعريف النسخة المعروضة: مصدرها وترخيصها وبصمتها.
 *
 * تُقرأ من `corpus/manifest.json` الذي يجاور ملف النص في نفس المجلد
 * ونفس الالتزام. صفحة الإسناد تعرض هذه القيم لا نصًا مكتوبًا بأيدينا،
 * حتى لا يبقى الإسناد يصف نسخة بينما المعروض نسخة أخرى.
 */
export type CorpusManifest = {
  source_name: string;
  source_url: string;
  edition: string;
  riwayah: string;
  licence: string;
  licence_url: string;
  /** الترخيص يوجب ذكر المصدر — انظر README القسم ١. */
  attribution_required: boolean;
  text_file: string;
  text_sha256: string;
  surah_count: number;
  ayah_count: number;
  word_count: number;
  imported_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

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
 * `text_uthmani` هو النص المرجعي والوحيد المخزَّن والوحيد المعروض.
 *
 * لا نحتفظ بنسخة مبسّطة إلى جانبه: كل ما يحتاجه البحث والمقارنة
 * يُشتقّ منه وقت الطلب عبر `engine/normalize.mjs`، والاشتقاق حتمي.
 * نسخةٌ ثانية مخزَّنة تعني نصّين قد يفترقان يومًا، والقرآن لا يحتمل ذلك.
 */
export type Ayah = {
  surah: number;
  ayah: number;
  text_uthmani: string;
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

/** مقطع من المصحف: سورة ومدى آيات. وحدة العمل في القراءة والحفظ والمنهج. */
export type Segment = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
};

/** أوضاع شاشة الدراسة الثلاثة في المرحلة ١. */
export type StudyMode = "read" | "listen" | "memorize";

/** حالة مقطع عند الطالبة. */
export type SegmentStatus = "new" | "learning" | "memorized";

/**
 * تقدّم الطالبة في مقطع.
 * `hide_level` مستوى الإخفاء الذي بلغته في الحفظ الخفي (٠ = النص كامل).
 */
export type SegmentProgress = Segment & {
  status: SegmentStatus;
  hide_level: number;
  updated_at: string;
};

/** آخر موضع وقفت عنده الطالبة، لتُستأنف القراءة من مكانها. */
export type LastPosition = {
  surah: number;
  ayah: number;
  updated_at: string;
};

/** نوع المطلوب في درس المنهج. */
export type LessonRequirement = "read" | "memorize" | "review";

/**
 * درس من المنهج الدراسي.
 *
 * البيانات تُدخلها المعلمة من محرر الإدارة. لا نضع نحن أي مقرر من عندنا
 * ولا نخمّنه — المنهج مرجعه وزارة التربية، والتخمين فيه ضرر لا نفع فيه.
 */
export type CurriculumLesson = {
  id: string;
  stage_slug: string;
  grade_slug: string;
  term: number;
  title: string;
  surah: number;
  from_ayah: number;
  to_ayah: number;
  requirement: LessonRequirement;
  sort_order: number;
  is_visible: boolean;
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
