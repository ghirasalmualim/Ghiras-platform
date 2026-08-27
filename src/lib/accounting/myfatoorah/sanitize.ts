/**
 * غراس للمحاسبة — Stage 7: تقليل البيانات بقائمة **بيضاء موجبة**.
 *
 * سياسة التخزين الأساس: لا نُبقي إلا الحقول التي يحتاجها المحاسبة
 * (هوية الحدث، أدلة التوقيع، معرّفات كيانات المزوّد، الحالات،
 * الطوابع الزمنية، مراجع الفاتورة/الدفع، الحقائق المالية والعملات،
 * مراجع التسوية/الاسترداد/النزاع/التكرار). **كل ما عداه يُسقَط** —
 * بطاقة/توكن/PAN/CVV/انتهاء/اسم حامل/بريد/جوّال/IP/IBAN/حساب بنكي
 * لا تُخزَّن. denylist احتياطي دفاعي فوق ذلك. تُطبَّق على: حمولة
 * الويبهوك، GetPaymentStatus، GetWebhooks، GetDepositedInvoices،
 * وأي JSON يدخل التدقيق/السجل.
 */

/** يقرأ dot-path (يشمل مصفوفات بفهرس عددي) بلا تطبيع */
function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.');
  let cur = target;
  for (let i = 0; i < segs.length - 1; i++) {
    cur[segs[i]] ??= {};
    cur = cur[segs[i]] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

/** قوائم الحقول البيضاء لكل نوع (dot-paths داخل الكائن الأعلى) */
const EVENT_ALLOW: Record<string, readonly string[]> = {
  PAYMENT_STATUS_CHANGED: [
    'Event.Code', 'Event.Name', 'Event.Reference', 'Event.CreationDate', 'Event.CountryIsoCode',
    'Data.Invoice.Id', 'Data.Invoice.Status', 'Data.Invoice.ExternalIdentifier',
    'Data.Transaction.Status', 'Data.Transaction.PaymentId',
    'Data.Transaction.ValueInBaseCurrency', 'Data.BaseCurrency',
  ],
  REFUND_STATUS_CHANGED: [
    'Event.Code', 'Event.Name', 'Event.Reference', 'Event.CreationDate',
    'Data.Refund.Id', 'Data.Refund.Status', 'Data.Amount.ValueInBaseCurrency',
    'Data.ReferencedInvoice.Id', 'Data.BaseCurrency',
  ],
  BALANCE_TRANSFERRED: [
    'Event.Code', 'Event.Name', 'Event.Reference', 'Event.CreationDate',
    'Data.Deposit.Reference', 'Data.Deposit.ValueInBaseCurrency',
    'Data.Deposit.NumberOfTransactions', 'Data.BaseCurrency',
  ],
  DISPUTE_STATUS_CHANGED: [
    'Event.Code', 'Event.Name', 'Event.Reference', 'Event.CreationDate',
    'Data.Dispute.DisputeTransactionId', 'Data.Dispute.Status',
    'Data.Invoice.Id', 'Data.Invoice.Status', 'Data.Invoice.ExternalIdentifier',
    'Data.Transaction.Status', 'Data.Transaction.PaymentId',
  ],
  RECURRING_UPDATES: [
    'Event.Code', 'Event.Name', 'Event.Reference', 'Event.CreationDate',
    'Data.Recurring.Id', 'Data.Recurring.Status', 'Data.Recurring.InitialInvoiceId',
    'Data.Transaction.PaymentId', 'Data.Transaction.Status',
  ],
  SUPPLIER_STATUS_CHANGED: ['Event.Code', 'Event.Name', 'Event.Reference'],
  SUPPLIER_UPDATE_REQUEST_CHANGED: ['Event.Code', 'Event.Name', 'Event.Reference'],
};

const CONFIRMATION_ALLOW = {
  GET_PAYMENT_STATUS: [
    'Invoice.Id', 'Invoice.Status', 'Transaction.Id', 'Transaction.Status',
    'Transaction.PaymentId', 'Transaction.ReferenceId',
    'BaseCurrency', 'ValueInBaseCurrency', 'ServiceCharge', 'ReceivableAmount',
    'DisplayCurrency', 'PayCurrency',
  ],
  GET_DEPOSITED_INVOICES: [
    'DepositReference', 'InvoiceValue', 'TotalServiceCharge', 'DueDeposit',
    'InvoiceId', 'BaseCurrency', 'PaidCurrency',
  ],
} as const;

/** إسقاط الكائن إلى قائمته البيضاء فقط — الغائب يُهمَل، الموجود يُنسخ */
function project(src: unknown, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of allow) {
    const v = get(src, p);
    if (v !== undefined) setPath(out, p, v);
  }
  return out;
}

export function sanitizeEvent(eventName: string, payload: unknown): Record<string, unknown> {
  return project(payload, EVENT_ALLOW[eventName] ?? ['Event.Code', 'Event.Name', 'Event.Reference']);
}

export function sanitizeConfirmation(
  kind: keyof typeof CONFIRMATION_ALLOW, response: unknown
): Record<string, unknown> {
  return project(response, CONFIRMATION_ALLOW[kind]);
}

/** إسقاط سطر مودَع من GetDepositedInvoices */
export function sanitizeDepositLine(line: unknown): Record<string, unknown> {
  return project(line, CONFIRMATION_ALLOW.GET_DEPOSITED_INVOICES);
}

/** SHA-256 للبايتات الأصلية للنزاهة التشخيصية — دون تخزين الجسد الحسّاس */
export async function rawBodySha256(raw: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex');
}
