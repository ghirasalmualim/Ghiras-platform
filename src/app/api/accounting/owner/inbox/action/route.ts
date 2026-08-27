/**
 * غراس للمحاسبة — Stage 11: أفعال الصندوق — لمسة واحدة بلا تجاوز حوكمة.
 *
 * كل فعل يمر بعميل **جلسة المستخدم** إلى الدوال المحكومة القائمة —
 * القاعدة تعيد فرض الدور بنفسها (لا توسيع صلاحية في الخادم):
 * - seen/acknowledge: أحداث علم — التصديق لا يغلق شيئًا أبدًا.
 * - answer_ambiguity: جواب المالكة يشفي عبر acc_resolve_expense_review
 *   (تسمح لها أصلًا) ثم يُغلق الاستثناء بإثبات الشفاء.
 * - attach_document: يربط مستندًا مقفلًا ثم يُغلق بإثبات الرابط.
 * - resolve: التمرير العام لدوال المحاسبة (القاعدة تحسم الدور/النوع).
 * لا اسم دالة من العميل — مفاتيح مغلقة تُترجم هنا حصرًا.
 */
import { NextRequest, NextResponse } from 'next/server';
import { primarySourceOf } from '@/lib/accounting/owner/queries';
import { ownerGate } from '../../_lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    company_id?: string; exception_id?: string; action?: string;
    answer?: string; reason?: string; document_id?: string;
    action_key?: string; kind?: string; domain_ref?: string;
    decision?: Record<string, unknown>;
  } | null;
  if (!body?.company_id || !body.exception_id || !body.action) {
    return NextResponse.json({ error: 'company_id, exception_id and action are required' }, { status: 400 });
  }
  const gated = await ownerGate(body.company_id);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { db, userClient } = gated.gate;

  // الاستثناء لا بد أن يخص الشركة المصرَّح بها — لا تنقّل عبر الشركات
  const primary = await primarySourceOf(db, body.exception_id);
  if (!primary || primary.companyId !== body.company_id) {
    return NextResponse.json({ error: 'unknown exception in this company' }, { status: 404 });
  }

  try {
    switch (body.action) {
      case 'seen': {
        const r = await userClient.rpc('acc_exception_mark_seen', { p_exception: body.exception_id });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        return NextResponse.json({ status: 'seen' });
      }
      case 'acknowledge': {
        const r = await userClient.rpc('acc_exception_acknowledge', { p_exception: body.exception_id });
        if (r.error) return NextResponse.json({ error: r.error.message }, { status: 403 });
        // ACK ≠ RESOLVE — القضية باقية مفتوحة، ونقولها صراحة
        return NextResponse.json({ status: 'acknowledged', resolved: false });
      }
      case 'answer_ambiguity': {
        if (primary.exceptionType !== 'PERSONAL_BUSINESS_AMBIGUITY' || primary.kind !== 'EXPENSE') {
          return NextResponse.json({ error: 'this exception is not an ambiguity question' }, { status: 400 });
        }
        if (!body.answer || !['BUSINESS', 'PERSONAL'].includes(body.answer) || !body.reason?.trim()) {
          return NextResponse.json({ error: 'answer (BUSINESS/PERSONAL) and reason are required' }, { status: 400 });
        }
        // ١ · الشفاء عبر الدالة المحكومة القائمة — القاعدة تتحقق الدور
        const cure = await userClient.rpc('acc_resolve_expense_review', {
          p_expense: primary.id,
          p_resolution: body.answer === 'BUSINESS' ? 'PROCEED' : 'VOID',
          p_reason: body.reason,
        });
        if (cure.error) return NextResponse.json({ error: cure.error.message }, { status: 403 });
        // ٢ · الإغلاق بإثبات الشفاء + حفظ الجواب المنظّم (غذاء Stage 13)
        const res = await userClient.rpc('acc_exception_resolve', {
          p_exception: body.exception_id, p_action_key: 'REVIEW_RESOLVED',
          p_kind: 'DOMAIN_ACTION', p_reason: body.reason,
          p_decision: { question: 'PERSONAL_OR_BUSINESS', answer: body.answer },
          p_domain_ref: primary.id,
        });
        if (res.error) return NextResponse.json({ error: res.error.message }, { status: 403 });
        return NextResponse.json({ status: 'resolved' });
      }
      case 'attach_document': {
        if (primary.exceptionType !== 'MISSING_DOCUMENT') {
          return NextResponse.json({ error: 'this exception does not take a document' }, { status: 400 });
        }
        if (!body.document_id) {
          return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
        }
        // ١ · الربط عبر الدالة المحكومة (FINALIZED فقط — القاعدة تتحقق)
        const link = await userClient.rpc('acc_link_document', {
          p_document: body.document_id, p_target_kind: 'EXPENSE',
          p_target: primary.id, p_link_role: 'ATTACHMENT',
        });
        if (link.error) return NextResponse.json({ error: link.error.message }, { status: 403 });
        // ٢ · الإغلاق بإثبات الرابط
        const res = await userClient.rpc('acc_exception_resolve', {
          p_exception: body.exception_id, p_action_key: 'DOCUMENT_ATTACHED',
          p_kind: 'DOMAIN_ACTION', p_reason: null, p_decision: {},
          p_domain_ref: body.document_id,
        });
        if (res.error) return NextResponse.json({ error: res.error.message }, { status: 403 });
        return NextResponse.json({ status: 'resolved' });
      }
      case 'resolve': {
        // مسار المحاسبة العام — المفاتيح المغلقة والدور تحسمهما القاعدة
        if (!body.action_key || !body.kind) {
          return NextResponse.json({ error: 'action_key and kind are required' }, { status: 400 });
        }
        const res = await userClient.rpc('acc_exception_resolve', {
          p_exception: body.exception_id, p_action_key: body.action_key,
          p_kind: body.kind, p_reason: body.reason ?? null,
          p_decision: body.decision ?? {}, p_domain_ref: body.domain_ref ?? null,
        });
        if (res.error) return NextResponse.json({ error: res.error.message }, { status: 403 });
        const row = Array.isArray(res.data) ? res.data[0] : res.data;
        return NextResponse.json({ status: 'resolved', outcome: row?.outcome ?? null });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'action failed' }, { status: 500 });
  }
}
