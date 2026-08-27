/**
 * غراس للمحاسبة — Stage 11: مستنداتي — كل مستند يعرض «وش قرينا منه»
 * (حقول الاستخلاص اليدوية — لا AI قبل Stage 13) و«وش صار عليه»
 * (روابط Stage 8 ثنائية الاتجاه). الرفع نفسه عبر مسار Stage 8 القائم.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ownerGate } from '../_lib/auth';

export const dynamic = 'force-dynamic';

const need = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
};

const LINK_LABEL: Record<string, string> = {
  EXPENSE: 'DOCS_LINKED_EXPENSE',
  INVOICE: 'DOCS_LINKED_INVOICE',
  BANK_IMPORT: 'DOCS_LINKED_BANK',
  JOURNAL_ENTRY: 'DOCS_LINKED_OTHER',
  PAYMENT: 'DOCS_LINKED_OTHER',
};

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  const gated = await ownerGate(companyId);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  const { db } = gated.gate;
  try {
    const docs = need<any[]>(await db.from('acc_documents')
      .select('id, doc_type, source, original_filename, state, page_count, captured_at, extracted_fields, extraction_source')
      .eq('company_id', companyId)
      .order('captured_at', { ascending: false }).limit(100), 'documents');
    const links = docs.length
      ? need<any[]>(await db.from('acc_document_links')
          .select('document_id, target_kind, link_role')
          .in('document_id', docs.map((d) => d.id)), 'links')
      : [];
    const linksByDoc = new Map<string, { kindLabelKey: string; role: string }[]>();
    for (const l of links) {
      const arr = linksByDoc.get(l.document_id) ?? [];
      arr.push({ kindLabelKey: LINK_LABEL[l.target_kind] ?? 'DOCS_LINKED_OTHER', role: l.link_role });
      linksByDoc.set(l.document_id, arr);
    }
    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d.id,
        docType: d.doc_type,
        filename: d.original_filename ?? '',
        state: d.state,
        pageCount: d.page_count,
        capturedAt: d.captured_at,
        // «وش قرينا منه» — يدوي/تجهيز اختبار فقط اليوم؛ لا ادعاء AI
        extracted: d.extracted_fields ?? null,
        extractionSource: d.extraction_source ?? null,
        links: linksByDoc.get(d.id) ?? [],
      })),
    });
  } catch {
    return NextResponse.json({ error: 'documents failed' }, { status: 500 });
  }
}
