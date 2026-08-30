/**
 * مصدر الحقيقة الوحيد لأسعار غراس.
 * الأسعار الرسمية ثابتة؛ عرض الانطلاقة يُفعَّل/يُطفَأ بعلمٍ واحد
 * (LAUNCH_OFFER_ACTIVE) دون تعديلٍ منتشر. لا دفعَ آليّ يعتمد هذا
 * الملف حاليًا — التفعيل يدويٌّ عبر admin — فهذه أرقامٌ للعرض
 * والاتساق. أوقفي العرض بضبط LAUNCH_OFFER_ACTIVE = false فقط.
 */

export const CURRENCY = 'د.ك' as const;

/** الأسعار الرسمية (بالدينار الكويتي). */
export const OFFICIAL = {
  subjectPerGrade: 30, // المادة الواحدة للصف الواحد
  fullGrade: 100,      // الصف كاملًا بجميع مواده المتاحة
} as const;

/** أسعار عرض الانطلاقة المحدود. */
export const LAUNCH = {
  subjectPerGrade: 20,
  fullGrade: 50,
} as const;

/** علمُ تشغيل العرض — اطفئيه للعودة إلى الأسعار الرسمية. */
export const LAUNCH_OFFER_ACTIVE = true;

/** السعر الفعّال الآن لكل باقة (رسميٌّ أو عرض). */
export function effectivePrice(pkg: 'subjectPerGrade' | 'fullGrade'): number {
  return LAUNCH_OFFER_ACTIVE ? LAUNCH[pkg] : OFFICIAL[pkg];
}

/** خصم الباقة الكاملة أثناء العرض (بالدينار). */
export const FULL_GRADE_SAVING = OFFICIAL.fullGrade - LAUNCH.fullGrade; // 50
