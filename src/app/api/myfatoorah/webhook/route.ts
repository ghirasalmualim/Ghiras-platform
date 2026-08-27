/**
 * غراس للمحاسبة — Stage 7: مستقبِل MyFatoorah Webhook V2.
 *
 * التسلسل: استلام البايتات → استخراج الحدث → التحقق من التوقيع (سر
 * بيئي) → إسقاط بقائمة بيضاء → تسجيل دليل + idempotency التسليم عبر
 * service key → للمدفوعات: تأكيد GetPaymentStatus قبل أي أثر → تطبيق
 * الحالة. توقيع باطل = REJECTED_SIGNATURE، صفر أثر تجاري.
 *
 * ⚠️ الشركة تُحلّ من سياق **الخادم المملوك** (MYFATOORAH_COMPANY_ID)
 * — لا من جسد/استعلام/رأس الطلب: الحمولة لا تختار مستأجرها المحاسبي.
 * السر لا يدخل قاعدة/سجل/استجابة. لا ترحيل آلي (BLK-004).
 *
 * الحد المستقبلي متعدد المستأجرين: يُستبدل الربط البيئي بجدول ربط
 * موصّل مملوك للخادم (سرّ+مفتاح+company لكل موصّل) — لا خزنة اعتماد
 * SaaS الآن (MVP مزوّد واحد).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySignature, extractSignatureHeader, type MfEventName } from '@/lib/accounting/myfatoorah/signature';
import { getPaymentStatus } from '@/lib/accounting/myfatoorah/client';
import { sanitizeEvent, sanitizeConfirmation } from '@/lib/accounting/myfatoorah/sanitize';

export const dynamic = 'force-dynamic';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.MYFATOORAH_WEBHOOK_SECRET;
  // الشركة من سياق الخادم المملوك حصرًا — لا من الطلب (ضد اختيار المستأجر)
  const companyId = process.env.MYFATOORAH_COMPANY_ID;
  if (!secret || !companyId) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });

  const raw = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const ev = body.Event as Record<string, unknown> | undefined;
  const eventName = ev?.Name as MfEventName | undefined;
  const eventCode = Number(ev?.Code ?? 0);
  const eventRef = String(ev?.Reference ?? '');
  const data = body.Data;
  if (!eventName || !eventRef) return NextResponse.json({ error: 'malformed event' }, { status: 400 });

  const headerSig = extractSignatureHeader(req.headers);
  const valid = verifySignature(eventName, data, secret, headerSig);
  const businessKey = extractBusinessKey(eventName, data);

  const db = svc();
  // تُخزَّن الحمولة **بعد الإسقاط بقائمة بيضاء** — لا حقول حسّاسة
  const { data: eventId, error } = await db.rpc('acc_mf_record_event', {
    p_company: companyId, p_event_code: eventCode, p_event_name: eventName,
    p_event_reference: eventRef, p_source: 'WEBHOOK', p_signature_valid: valid,
    p_payload: sanitizeEvent(eventName, body), p_business_key: businessKey,
  });
  if (error) return NextResponse.json({ status: 'conflict', detail: error.message }, { status: 409 });
  if (!valid) return NextResponse.json({ status: 'rejected_signature' }, { status: 202 });

  // المدفوعات: تأكيد المزوّد قبل أي أثر (MF-013)؛ الموردون بلا أثر
  if (eventName === 'PAYMENT_STATUS_CHANGED' || eventName === 'RECURRING_UPDATES') {
    const paymentId = businessKey;
    if (paymentId) {
      const conf = await getPaymentStatus(paymentId);
      await db.rpc('acc_mf_record_confirmation', {
        p_company: companyId, p_kind: 'GET_PAYMENT_STATUS', p_provider_ref: paymentId,
        p_event: eventId, p_result_state: conf.ok ? 'OK' : 'UNAVAILABLE',
        p_raw: conf.ok ? sanitizeConfirmation('GET_PAYMENT_STATUS', conf.raw) : null,
        p_extracted: { invoiceStatus: conf.invoiceStatus, transactionStatus: conf.transactionStatus, baseCurrency: conf.baseCurrency },
      });
      if (conf.ok && conf.transactionStatus) {
        await db.rpc('acc_mf_apply_payment_status', {
          p_event: eventId, p_payment_id: paymentId, p_confirmed_status: conf.transactionStatus,
        });
      }
    }
  }
  // REFUND/BALANCE/DISPUTE: الابتلاع في مساراتها المخصّصة اللاحقة تعيد
  // استخدام كيانات Stage 6؛ الدليل المُسقَط محفوظ الآن.

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

function extractBusinessKey(eventName: MfEventName, data: unknown): string | null {
  const read = (path: string): string | null => {
    let cur: unknown = data;
    for (const s of path.split('.')) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = (cur as Record<string, unknown>)[s];
    }
    return cur == null ? null : String(cur);
  };
  switch (eventName) {
    case 'PAYMENT_STATUS_CHANGED': return read('Transaction.PaymentId');
    case 'REFUND_STATUS_CHANGED': return read('Refund.Id');
    case 'BALANCE_TRANSFERRED': return read('Deposit.Reference');
    case 'DISPUTE_STATUS_CHANGED': return read('Dispute.DisputeTransactionId');
    case 'RECURRING_UPDATES': return read('Recurring.Id');
    default: return null;
  }
}
