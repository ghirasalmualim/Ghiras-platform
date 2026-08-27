/**
 * غراس للمحاسبة — Stage 8: تحقق ملفات المستندات.
 *
 * قائمة بيضاء موجبة لأنواع MIME؛ تعقيم اسم الملف (الاسم الأصلي بيانات
 * وصفية فقط — مفتاح الكائن يولّده الخادم حتميًا فلا اجتياز مسار)؛ حدّ
 * الحجم قابل للضبط لكل شركة (acc_expense_settings.max_file_bytes)
 * والقيمة الاحتياطية أدناه تسري عند غيابه.
 */

/** أنواع الالتقاط المسموحة — إيصالات مصوّرة وPDF فقط */
export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
]);

/** احتياطي حدّ الحجم عند غياب ضبط الشركة — قابل للتعديل من الإعدادات */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

/** يعقّم اسم الملف الأصلي للتخزين كوصفٍ آمن — لا فواصل مسار ولا تحكم */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')  // محارف التحكم والمحارف الخطرة
    .replace(/\.{2,}/g, '.')                  // لا «..» — لا اجتياز مسار
    .trim();
  return cleaned.slice(0, 200) || 'untitled';
}

export function validateUpload(
  mime: string, byteSize: number, maxBytes: number | null
): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedMime(mime)) return { ok: false, reason: `نوع الملف غير مسموح: ${mime}` };
  const cap = maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (byteSize <= 0) return { ok: false, reason: 'ملف فارغ' };
  if (byteSize > cap) return { ok: false, reason: `الحجم يتجاوز الحد (${cap} بايت)` };
  return { ok: true };
}
