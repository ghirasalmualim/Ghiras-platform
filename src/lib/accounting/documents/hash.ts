/**
 * غراس للمحاسبة — Stage 8: بصمات المحتوى.
 *
 * سلطة البصمة النهائية للخادم: العميل قد يحسب بصمة مساعدة للتحقق
 * المبكر، لكن الدليل المعتمد هو ما يحسبه الخادم من البايتات المرفوعة
 * فعليًا (acc_confirm_document_page)، وبصمة الـmanifest تُحسب في
 * القاعدة من بصمات الصفحات المرتبة — لا تُقبل بصمة عميل كدليل.
 */
import { createHash } from 'node:crypto';

/** SHA-256 hex لبايتات — تُستخدم في الخادم بعد استلام الملف */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** بصمة manifest حتمية لمستند متعدد الصفحات (مطابقة لحساب القاعدة) */
export function manifestSha256(pages: ReadonlyArray<{ pageNo: number; sha256: string }>): string {
  const ordered = [...pages].sort((a, b) => a.pageNo - b.pageNo);
  const canonical = ordered.map((p) => `${p.pageNo}:${p.sha256}`).join('|');
  return createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
}
