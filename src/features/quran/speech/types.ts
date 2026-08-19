/**
 * واجهة مزوّد الصوت — الحدّ الفاصل بين غراس وأي شركة.
 *
 * ═══ لماذا واجهة قبل أي مزوّد ═══
 * محرّك المحاذاة لا يعرف — ولن يعرف — من أين جاءت الكلمات. يستقبل
 * `HeardToken[]` وكفى. وكل ما يخصّ مزوّدًا بعينه (شكل ردّه، أسماء
 * حقوله، تصنيفاته، أخطاؤه) يبقى محبوسًا في مهايئه.
 *
 * فتبديل Azure بـDeepgram أو بنموذج نشغّله بأنفسنا = ملف مهايئ جديد،
 * بلا لمس المحرّك ولا الاختبارات ولا الشاشات.
 *
 * ═══ قاعدة لا تُخترق ═══
 * ⚠️ لا يتسرّب **أي** نوع خاص بمزوّد إلى ما بعد هذه الطبقة. ولا
 * تُستعمل درجة نطق ولا تجويد ولا تصنيف خطأ من المزوّد حكمًا على
 * الطالبة — تُنقل معلومةً تشخيصية فقط، والحكم لمحرّك غراس وحده.
 */

import type { HeardToken } from '../engine/alignment';

export type SpeechProviderId = 'azure' | 'mock';

export type RecitationRequest = {
  /** صوت خام: WAV PCM أحادي ١٦ ك.هرتز. */
  audio: ArrayBuffer;
  /**
   * النص المتوقَّع — من مصحف المشروع لا غير.
   *
   * ⚠️ لا يولّده ذكاء اصطناعي، ولا يُكتب من الذاكرة، ولا يُشتقّ من
   * كلام الطالبة. يُبنى من `surah + from_ayah + to_ayah` ويُرسل كما هو.
   */
  referenceText: string;
  /** وسم اللغة عند المزوّد. */
  languageTag: string;
};

/**
 * حال المحاولة — أسبابٌ تقنية لا أحكامٌ على الحفظ.
 *
 * كلها تنتهي إلى «أعيدي المحاولة» بلطف، ولا يُسجَّل منها شيء ضد أحد.
 */
export type ProviderStatus =
  /** وصل كلام مفهوم. */
  | 'OK'
  /** فيه صوت لكن لا كلام بهذه اللغة. */
  | 'NO_SPEECH'
  /** صمت — الميكروفون مقفل أو بعيد. */
  | 'SILENCE'
  /** ضجيج غلب على الصوت. */
  | 'NOISE'
  /** المزوّد نفسه تعثّر أو انقطع الاتصال. */
  | 'PROVIDER_ERROR';

/**
 * تشخيص — يُعرض في مختبر القياس، ولا يدخل الحكم إطلاقًا.
 *
 * ⚠️ `providerErrorTypes` و`pronunciationScores` هنا **للقياس وحده**.
 * وجودها في هذا الحقل بالذات تذكيرٌ دائم بأنها ليست حكمًا: لو أردنا
 * استعمالها حكمًا لوجب نقلها، وهذا لا يحدث سهوًا.
 */
export type ProviderDiagnostics = {
  provider: SpeechProviderId;
  /** ملّي ثانية من إرسال الصوت إلى وصول الرد. */
  latencyMs: number;
  /** حجم الصوت المرسل بالبايت. */
  audioBytes: number;
  /** مدة الصوت بالثواني. */
  audioSec: number;
  /** ثقة المزوّد بالجملة كلها، ٠..١، إن وُجدت. */
  utteranceConfidence?: number;
  /** نسبة الإشارة إلى الضجيج، إن أعطاها المزوّد. */
  snr?: number;
  /** النص الحرّ كما سمعه المزوّد فعلًا. */
  lexical?: string;
  /** حال المزوّد بنصّه، للتشخيص. */
  rawStatus?: string;
  /** تصنيفات المزوّد للأخطاء — معلومة مساعدة، ليست حكمًا. */
  providerErrorTypes?: { word: string; errorType: string }[];
  /** درجات نطق — ⚠️ لا تُستعمل حكمًا على الحفظ أبدًا. */
  pronunciationScores?: { [key: string]: number };
  /** رسالة الخطأ التقنية — للسجل لا للطفل. */
  errorMessage?: string;
};

export type RecitationResponse = {
  status: ProviderStatus;
  /** ما سُمع، بلغة محرّك غراس وحدها. */
  tokens: HeardToken[];
  diagnostics: ProviderDiagnostics;
};

export interface SpeechProvider {
  readonly id: SpeechProviderId;
  transcribe(req: RecitationRequest): Promise<RecitationResponse>;
}
