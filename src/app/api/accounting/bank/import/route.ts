/**
 * غراس للمحاسبة — Stage 9: تنسيق خط استيراد الكشف.
 *
 * UPLOAD (مستند Stage 8 مُقفَل) → PARSE → NORMALIZE → VALIDATE →
 * DEDUPLICATE — ويقف هنا: القبول فعل بشري منفصل (RPC مباشر)، ولا قيد
 * دفتري في أي خطوة (المطابقة مرحلة 10، الذكاء مرحلة 13).
 *
 * service_role للآلية فقط، وهوية الفاعل من جلسة الكوكيز تُمرَّر
 * وتتحقق القاعدة من دوره (p_actor — لا ثقة بجسد الطلب).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { parseStatement } from '@/lib/accounting/bank/parsers';
import { ParserError, ParsedStatement } from '@/lib/accounting/bank/connector';
import { buildAssertion, coverageFromRows, verifyIntegrity } from '@/lib/accounting/bank/integrity';
import { FormatFamily, LayoutSpec } from '@/lib/accounting/bank/layout-spec';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  );
}
const sha256hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export async function POST(req: NextRequest) {
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });

  const body = await req.json().catch(() => null) as
    { company_id?: string; bank_account_id?: string; document_id?: string;
      layout_id?: string; supersedes_import_id?: string } | null;
  if (!body?.company_id || !body.bank_account_id || !body.document_id || !body.layout_id)
    return NextResponse.json({ error: 'company_id, bank_account_id, document_id, layout_id are required' }, { status: 400 });

  const db = svc();
  // ١ · إنشاء/استئناف الجولة (idempotent على بصمة محتوى المستند الخادمية)
  const { data: impRows, error: impErr } = await db.rpc('acc_create_bank_import', {
    p_company: body.company_id, p_actor: auth.user.id,
    p_bank_account: body.bank_account_id, p_document: body.document_id,
    p_layout: body.layout_id, p_supersedes: body.supersedes_import_id ?? null,
  });
  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 403 });
  const imp = Array.isArray(impRows) ? impRows[0] : impRows;
  const importId = imp!.import_id as string;
  const { data: impState } = await db.from('acc_bank_imports')
    .select('state, currency, bank_account_id, layout_id').eq('id', importId).single();
  if (['ACCEPTED', 'REJECTED', 'DEDUPLICATED'].includes(impState!.state)) {
    return NextResponse.json({ import: importId, outcome: imp!.outcome, state: impState!.state });
  }

  // ٢ · مدخلات الـparse: التخطيط، دقة العملة، بايتات المستند
  const { data: layout } = await db.from('acc_bank_layouts')
    .select('format_family, spec').eq('id', body.layout_id).single();
  const { data: cur } = await db.from('acc_currencies')
    .select('minor_unit').eq('code', impState!.currency).single();
  const { data: pages } = await db.from('acc_document_pages')
    .select('object_key, page_no').eq('document_id', body.document_id).order('page_no');
  if (!layout || !cur || !pages?.length)
    return NextResponse.json({ error: 'import inputs incomplete' }, { status: 500 });

  await db.rpc('acc_begin_bank_parse', { p_import: importId, p_actor: auth.user.id });

  const fail = async (condition: string, detail: Record<string, unknown>) => {
    await db.rpc('acc_fail_bank_parse', { p_import: importId, p_condition: condition, p_detail: detail });
    return NextResponse.json({ import: importId, state: 'PARSE_FAILED', condition, detail }, { status: 422 });
  };

  let parsed: ParsedStatement;
  try {
    const chunks: Uint8Array[] = [];
    for (const p of pages) {
      const { data: blob, error: dlErr } = await db.storage.from('acc-documents').download(p.object_key);
      if (dlErr || !blob) return NextResponse.json({ error: 'source download failed', retryable: true }, { status: 502 });
      chunks.push(new Uint8Array(await blob.arrayBuffer()));
    }
    const bytes = chunks.length === 1 ? chunks[0]
      : chunks.reduce((acc, c) => { const out = new Uint8Array(acc.length + c.length); out.set(acc); out.set(c, acc.length); return out; }, new Uint8Array(0));
    parsed = await parseStatement(
      layout.format_family as FormatFamily, bytes, layout.spec as LayoutSpec, cur.minor_unit);
  } catch (e) {
    if (e instanceof ParserError) return fail(e.condition, { message: e.message, ...e.detail });
    return fail('PARSE_FAILED', { message: e instanceof Error ? e.message : String(e) });
  }

  // ٣ · تسجيل الصفوف الموحَّدة (البصمة الصارمة تُحسب في القاعدة)
  const rowsJson = parsed.rows.map((r) => ({
    row_no: r.rowNo, txn_date: r.txnDate, value_date: r.valueDate ?? '',
    description_raw: r.descriptionRaw, description_canon: r.descriptionCanon,
    amount_minor: r.amountMinor.toString(),
    running_balance_minor: r.runningBalanceMinor?.toString() ?? '',
    reference: r.reference ?? '', raw: r.raw,
  }));
  for (let i = 0; i < rowsJson.length; i += 500) {
    const { error: rowErr } = await db.rpc('acc_record_bank_rows', {
      p_import: importId, p_rows: rowsJson.slice(i, i + 500),
    });
    if (rowErr) return fail('PARSE_FAILED', { message: rowErr.message, batch: i });
  }

  // ٤ · توكيد الرصيد (صريح أو مشتق حتميًا — وإلا فشل مغلق في القاعدة)
  const assertion = buildAssertion(parsed);
  const coverage = coverageFromRows(parsed.rows)
    ?? (parsed.statementDate ? { start: parsed.statementDate, end: parsed.statementDate } : null);
  const preflight = assertion ? verifyIntegrity(assertion, parsed.rows) : null;

  const { data: normRows, error: normErr } = await db.rpc('acc_normalize_bank_import', {
    p_import: importId,
    p_period_start: coverage?.start ?? null, p_period_end: coverage?.end ?? null,
    p_opening_minor: assertion?.openingMinor.toString() ?? null,
    p_closing_minor: assertion?.closingMinor.toString() ?? null,
    p_assertion_source: assertion?.source ?? null,
    p_assertion_derivation: assertion?.derivation ?? null,
    p_freshness: parsed.statementDate ?? coverage?.end ?? null,
    p_detected_currency: parsed.detectedCurrency,
    p_detected_account_fp: parsed.detectedAccountRaw
      ? sha256hex(parsed.detectedAccountRaw.toUpperCase().replace(/\s/g, ''))
      : null,
  });
  if (normErr) return NextResponse.json({ error: normErr.message }, { status: 500 });
  const norm = Array.isArray(normRows) ? normRows[0] : normRows;
  if (norm!.outcome !== 'NORMALIZED') {
    return NextResponse.json({
      import: importId, state: 'INTEGRITY_FAILED', outcome: norm!.outcome,
      preflight: preflight && !preflight.ok ? preflight : undefined,
    }, { status: 422 });
  }

  // ٥ · التكرار — ثم يقف الخط: القبول فعل بشري منفصل (لا قيود، لا مطابقة)
  const { data: dedupRows, error: dedupErr } = await db.rpc('acc_dedup_bank_import', { p_import: importId });
  if (dedupErr) return NextResponse.json({ error: dedupErr.message }, { status: 500 });
  const dd = Array.isArray(dedupRows) ? dedupRows[0] : dedupRows;
  return NextResponse.json({ import: importId, state: dd!.outcome, rows: parsed.rows.length });
}
