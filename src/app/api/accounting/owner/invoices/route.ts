/**
 * غراس للمحاسبة — Stage 11: فواتيري — عمليات المالكة الحقيقية عبر
 * دوال Stages 4/6 القائمة بعميل **جلسة المستخدم** (القاعدة تفرض
 * الدور). «الإرسال» صادق (C11): acc_send_invoice انتقال حالة تجاري
 * لا تسليم — الواجهة تقول «مسجلة كمرسلة»، والمشاركة الفعلية يفعلها
 * الجهاز (Web Share) ثم تُسجَّل الحالة؛ التسليم/التذكير الآلي
 * PENDING_INFRA ولا يُدّعى.
 */
import { NextRequest, NextResponse } from 'next/server';
import { invoiceStatusKey } from '@/lib/accounting/owner/queries';
import {
  TaxPostureUnresolvedError, buildDraftLines, resolveInvoiceTaxPosture,
} from '@/lib/accounting/owner/tax';
import type { DbRuleRow } from '@/lib/accounting/owner/tax';
import { resolveVatStatus } from '@/lib/accounting/resolvers';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

const need = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
};

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { db } = gated.gate;
  try {
    const invoices = need<any[]>(await db.from('acc_invoices')
      .select('id, invoice_number, status, total_minor, currency, customer_snapshot, customer_id, issue_date, due_date, created_at')
      .eq('company_id', companyId).neq('status', 'DELETED')
      .order('created_at', { ascending: false }).limit(100), 'invoices');
    const payments = invoices.length
      ? need<any[]>(await db.from('acc_payments')
          .select('invoice_id, amount_minor').eq('company_id', companyId)
          .in('status', ['SUCCESS', 'SETTLED', 'RECONCILED'])
          .in('invoice_id', invoices.map((i) => i.id)), 'payments')
      : [];
    const paid = new Map<string, bigint>();
    for (const p of payments) {
      paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0n) + BigInt(String(p.amount_minor)));
    }
    const customers = need<any[]>(await db.from('acc_customers')
      .select('id, name, active, currency').eq('company_id', companyId).eq('active', true)
      .limit(500), 'customers');
    const products = need<any[]>(await db.from('acc_products')
      .select('id, name, price_minor, currency, active').eq('company_id', companyId)
      .eq('active', true).limit(500), 'products');
    return NextResponse.json({
      invoices: invoices.map((i) => {
        const total = BigInt(String(i.total_minor ?? 0));
        const p = paid.get(i.id) ?? 0n;
        return {
          id: i.id,
          number: i.invoice_number === null ? null : String(i.invoice_number),
          statusKey: invoiceStatusKey(i.status),
          rawStatus: i.status,
          customerName: String(i.customer_snapshot?.name ?? ''),
          customerId: i.customer_id,
          totalMinor: total.toString(),
          paidMinor: p.toString(),
          outstandingMinor: (total - p).toString(),
          currency: i.currency,
          issueDate: i.issue_date, dueDate: i.due_date,
        };
      }),
      customers: customers.map((c) => ({ id: c.id, name: c.name, currency: c.currency ?? null })),
      products: products.map((p) => ({
        id: p.id, name: p.name, priceMinor: String(p.price_minor), currency: p.currency,
      })),
      viewerRole: gated.gate.role,
    });
  } catch {
    return NextResponse.json({ error: 'invoices failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    company_id?: string; action?: string;
    name?: string; price_minor?: string; currency?: string;
    customer_id?: string; lines?: { product_id: string; quantity: string; unit_price_minor: string; currency: string }[];
    invoice_id?: string; issue_date?: string; due_date?: string;
    amount_minor?: string;
  } | null;
  if (!body?.company_id || !body.action) {
    return NextResponse.json({ error: 'company_id and action are required' }, { status: 400 });
  }
  const gated = await ownerGate(body.company_id);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { userClient, baseCurrency } = gated.gate;
  try {
    switch (body.action) {
      case 'create_customer': {
        if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        const r = await userClient.rpc('acc_create_customer', {
          p_company: body.company_id, p_name: body.name,
        });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'created', customer_id: r.data });
      }
      case 'create_product': {
        if (!body.name?.trim() || !body.price_minor) {
          return NextResponse.json({ error: 'name and price_minor are required' }, { status: 400 });
        }
        const r = await userClient.rpc('acc_create_product', {
          p_company: body.company_id, p_name: body.name,
          p_price_minor: body.price_minor, p_currency: body.currency ?? baseCurrency,
        });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'created', product_id: r.data });
      }
      case 'create_draft': {
        if (!body.customer_id || !body.lines?.length) {
          return NextResponse.json({ error: 'customer_id and lines are required' }, { status: 400 });
        }
        // الوضع الضريبي سلطة الخادم عبر سجل Stage 2 — لا يقرره
        // المتصفح ولا يُرمَّز في الكود: انتقال مستقبلي = تحديث سجل.
        // الغياب = فشل مغلق **قبل** إنشاء أي مسودة (لا رأس فاتورة
        // بلا أسطر صالحة) — برسالة مالكة آمنة بلا تفاصيل تقنية.
        const ruleRows = await userClient.from('acc_regulatory_rules')
          .select('*').eq('rule_id', 'REG-KW-008');
        if (ruleRows.error) {
          return NextResponse.json({
            error: 'invoice not ready', ownerMessageKey: 'INVOICE_TAX_UNRESOLVED',
          }, { status: 409 });
        }
        let lines: Record<string, string>[];
        try {
          const posture = resolveInvoiceTaxPosture(
            (ruleRows.data ?? []) as DbRuleRow[],
            new Date().toISOString().slice(0, 10),
            resolveVatStatus);  // سلطة Stage 2 القائمة — تُحقن لا تُعاد كتابتها
          lines = buildDraftLines(body.lines, posture);
        } catch (e) {
          if (e instanceof TaxPostureUnresolvedError) {
            return NextResponse.json({
              error: 'invoice not ready', ownerMessageKey: 'INVOICE_TAX_UNRESOLVED',
            }, { status: 409 });
          }
          return NextResponse.json({ error: 'invalid invoice lines' }, { status: 400 });
        }
        const r = await userClient.rpc('acc_create_invoice_draft', {
          p_company: body.company_id, p_customer: body.customer_id,
          p_currency: body.currency ?? baseCurrency,
          p_due_date: body.due_date ?? null,
          p_lines: lines,
        });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'created', invoice_id: r.data });
      }
      case 'issue': {
        if (!body.invoice_id) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });
        const r = await userClient.rpc('acc_issue_invoice', {
          p_invoice: body.invoice_id,
          p_issue_date: body.issue_date ?? new Date().toISOString().slice(0, 10),
        });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'issued', invoice_number: String(r.data) });
      }
      case 'mark_sent': {
        // الصدق: هذا تسجيل «مرسلة» تجاريًا — التسليم الفعلي فعله
        // المستخدم بنفسه (مشاركة الجهاز)؛ لا ادعاء بريد آلي
        if (!body.invoice_id) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 });
        const r = await userClient.rpc('acc_send_invoice', { p_invoice: body.invoice_id });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'marked_sent', delivered_by_platform: false });
      }
      case 'record_payment': {
        if (!body.invoice_id || !body.amount_minor) {
          return NextResponse.json({ error: 'invoice_id and amount_minor are required' }, { status: 400 });
        }
        const r = await userClient.rpc('acc_record_payment', {
          p_company: body.company_id, p_invoice: body.invoice_id,
          p_amount_minor: body.amount_minor,
          p_currency: body.currency ?? baseCurrency,
        });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'recorded', payment_id: r.data });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'invoice action failed' }, { status: 500 });
  }
}
