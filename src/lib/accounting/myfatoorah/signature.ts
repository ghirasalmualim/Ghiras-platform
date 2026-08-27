/**
 * غراس للمحاسبة — Stage 7: تحقّق توقيع MyFatoorah Webhook V2.
 *
 * العقد الرسمي (docs.myfatoorah.com/docs/webhook-signature + data-model
 * كل حدث): الرأس `myfatoorah-signature` (بحث غير حسّاس لحالة الأحرف)؛
 * السلسلة القانونية `key=value,key2=value2` بحقول الحدث **بترتيبها
 * الرسمي حصرًا**؛ null → سلسلة فارغة؛ UTF-8؛ HMAC SHA-256 بمفتاح
 * الويبهوك ثنائيًّا ثم Base64؛ مقارنة ثابتة الزمن.
 *
 * ⚠️ لا نرتّب أبجديًا، لا JSON.stringify، لا نضيف حقول Event.* إلا
 * ما نصّ عليه التوثيق، ولا نطبّع/نقصّ قيم المزوّد.
 * السر لا يُخزَّن ولا يُسجَّل — يمرّ بارامترًا من بيئة الخادم فقط.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type MfEventName =
  | 'PAYMENT_STATUS_CHANGED'
  | 'REFUND_STATUS_CHANGED'
  | 'BALANCE_TRANSFERRED'
  | 'DISPUTE_STATUS_CHANGED'
  | 'RECURRING_UPDATES'
  | 'SUPPLIER_STATUS_CHANGED'
  | 'SUPPLIER_UPDATE_REQUEST_CHANGED';

/** الترتيب الرسمي الحرفي لحقول التوقيع لكل حدث (dot-path داخل Data) */
export const SIGNED_FIELDS: Partial<Record<MfEventName, readonly string[]>> = {
  PAYMENT_STATUS_CHANGED: [
    'Invoice.Id', 'Invoice.Status', 'Transaction.Status',
    'Transaction.PaymentId', 'Invoice.ExternalIdentifier',
  ],
  REFUND_STATUS_CHANGED: [
    'Refund.Id', 'Refund.Status', 'Amount.ValueInBaseCurrency', 'ReferencedInvoice.Id',
  ],
  BALANCE_TRANSFERRED: [
    'Deposit.Reference', 'Deposit.ValueInBaseCurrency', 'Deposit.NumberOfTransactions',
  ],
  DISPUTE_STATUS_CHANGED: [
    'Dispute.DisputeTransactionId', 'Dispute.Status', 'Invoice.Id', 'Invoice.Status',
    'Transaction.Status', 'Transaction.PaymentId', 'Invoice.ExternalIdentifier',
  ],
  RECURRING_UPDATES: [
    'Recurring.Id', 'Recurring.Status', 'Recurring.InitialInvoiceId',
  ],
  // الموردون: بلا نموذج توقيع محاسبي — لا أثر (تُرفض المعالجة التجارية)
};

/** قراءة dot-path من كائن Data — بلا تطبيع؛ غير الموجود/undefined = null */
function readPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur === undefined ? null : cur;
}

/**
 * يبني السلسلة القانونية من `Data` بترتيب الحقول الرسمي للحدث.
 * القيمة تُدرَج كما وردت (نصًّا)؛ null → ''. لا حقل خارج القائمة
 * يدخل السلسلة (حقن حقل إضافي لا أثر له).
 */
export function canonicalString(eventName: MfEventName, data: unknown): string {
  const fields = SIGNED_FIELDS[eventName];
  if (!fields) throw new Error(`no official signature model for event: ${eventName}`);
  return fields
    .map((f) => {
      const v = readPath(data, f);
      return `${f}=${v === null ? '' : String(v)}`;
    })
    .join(',');
}

/** التوقيع المتوقَّع Base64 من السلسلة القانونية ومفتاح الويبهوك */
export function computeSignature(eventName: MfEventName, data: unknown, secret: string): string {
  const canonical = canonicalString(eventName, data);
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.from(canonical, 'utf8'))
    .digest('base64');
}

/** مقارنة ثابتة الزمن للتوقيع الوارد بالمتوقَّع — أطوال مختلفة = false */
export function verifySignature(
  eventName: MfEventName,
  data: unknown,
  secret: string,
  headerSignature: string | null | undefined
): boolean {
  if (!headerSignature) return false;
  let expected: string;
  try {
    expected = computeSignature(eventName, data, secret);
  } catch {
    return false;
  }
  const a = Buffer.from(headerSignature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** بحث رأس التوقيع غير حسّاس لحالة الأحرف */
export function extractSignatureHeader(headers: Record<string, string | undefined> | Headers): string | null {
  const get = (name: string) =>
    headers instanceof Headers ? headers.get(name) : headers[name];
  const lowerScan = () => {
    if (headers instanceof Headers) return headers.get('myfatoorah-signature');
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'myfatoorah-signature') return v ?? null;
    }
    return null;
  };
  return get('myfatoorah-signature') ?? get('MyFatoorah-Signature') ?? lowerScan();
}
