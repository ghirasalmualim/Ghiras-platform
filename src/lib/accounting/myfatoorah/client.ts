/**
 * غراس للمحاسبة — Stage 7: عميل MyFatoorah HTTP.
 * السر (MYFATOORAH_API_KEY) يُقرأ من بيئة الخادم لكل نداء ولا يُخزَّن
 * ولا يُسجَّل ولا يعود في أي استجابة. لا نداء حيّ في الاختبارات —
 * fetchImpl قابل للحقن لاختبار المحوّل بردود وهمية.
 *
 * BLK-004: لا دالة هنا ترحّل قيدًا. الترحيل خارج Stage 7 كليًا.
 */
type FetchImpl = typeof fetch;

function baseUrl(): string {
  const u = process.env.MYFATOORAH_BASE_URL;
  if (!u) throw new Error('MYFATOORAH_BASE_URL is not configured');
  return u.replace(/\/$/, '');
}
function authHeader(): Record<string, string> {
  const key = process.env.MYFATOORAH_API_KEY;
  if (!key) throw new Error('MYFATOORAH_API_KEY is not configured');
  // السر يبقى في الذاكرة للطلب فقط — لا يُعاد ولا يُخزَّن
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** GetPaymentStatus — التأكيد قبل أي أثر محاسبي (MF-013) */
export async function getPaymentStatus(
  paymentId: string, fetchImpl: FetchImpl = fetch
): Promise<{ ok: boolean; invoiceStatus?: string; transactionStatus?: string; baseCurrency?: string; raw: unknown }> {
  try {
    const res = await fetchImpl(`${baseUrl()}/v3/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET', headers: authHeader(),
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, raw };
    const inv = (raw as Record<string, unknown>)?.Invoice as Record<string, unknown> | undefined;
    const txn = (raw as Record<string, unknown>)?.Transaction as Record<string, unknown> | undefined;
    return {
      ok: true,
      invoiceStatus: inv?.Status as string | undefined,
      transactionStatus: txn?.Status as string | undefined,
      baseCurrency: (raw as Record<string, unknown>)?.BaseCurrency as string | undefined,
      raw,
    };
  } catch {
    return { ok: false, raw: null };  // غير متاح: لا تخمين حالة
  }
}

/** GetDepositedInvoices — Type يُمرَّر صراحةً دائمًا (MF-007) */
export async function getDepositedInvoices(
  depositReference: string, type: 'Vendor' | 'Supplier', fetchImpl: FetchImpl = fetch
): Promise<{ ok: boolean; lines: unknown[]; raw: unknown }> {
  try {
    const res = await fetchImpl(`${baseUrl()}/Reports_GetDepositedInvoices`, {
      method: 'POST', headers: authHeader(),
      body: JSON.stringify({ DepositReference: depositReference, Type: type }),  // Type صريح لا افتراضي
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, lines: [], raw };
    const data = (raw as Record<string, unknown>)?.Data as Record<string, unknown> | undefined;
    const lines = (data?.DepositedInvoices as unknown[]) ?? [];
    return { ok: true, lines, raw };
  } catch {
    return { ok: false, lines: [], raw: null };  // فشل الجلب: لا أثر تسوية (MF-006)
  }
}

/** GetWebhooks — استرداد بنوافذ UTC متداخلة، ٥٠٠/صفحة، 1-based (MF-009) */
export async function getWebhooks(
  startIso: string, endIso: string, page: number, eventType: string, fetchImpl: FetchImpl = fetch
): Promise<{ ok: boolean; items: unknown[]; pagesCount: number; raw: unknown }> {
  try {
    const res = await fetchImpl(`${baseUrl()}/Webhook_GetWebhooks`, {
      method: 'POST', headers: authHeader(),
      body: JSON.stringify({ Start: startIso, End: endIso, Page: page, EventType: eventType }),
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, items: [], pagesCount: 0, raw };
    const data = (raw as Record<string, unknown>)?.Data as Record<string, unknown> | undefined;
    const items = (data?.Items as unknown[]) ?? [];
    const pag = data?.Pagination as Record<string, unknown> | undefined;
    return { ok: true, items, pagesCount: (pag?.PagesCount as number) ?? 1, raw };
  } catch {
    return { ok: false, items: [], pagesCount: 0, raw: null };
  }
}
