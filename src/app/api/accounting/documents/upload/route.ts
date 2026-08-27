/**
 * غراس للمحاسبة — Stage 8: مسار رفع مستند (متعدد الصفحات، idempotent).
 *
 * البروتوكول القابل للاسترداد (CORRECTION 2): حجز صف/صفحة في القاعدة
 * بمفتاح كائن حتمي → رفع الكائن → **الخادم يحسب SHA-256 من البايتات
 * المستلمة** (سلطة الخادم — CORRECTION 3) → تأكيد الصفحة → إقفال.
 * فشل أي خطوة يعاد بنفس capture_id/document_id/object_key — الكائن
 * القائم المطابق يُستأنف idempotent؛ بايتات مختلفة = CONFLICT بلا
 * استبدال. لا كائن ثانٍ لإعادة محاولة أبدًا.
 *
 * التخزين خاص (acc-documents): لا سياسة عميل — service key حصرًا،
 * وهوية الفاعل المصادَق عليها تُمرَّر للقاعدة (acc_role_of تتحقق دورها).
 * الرفع لا يُنشئ مصروفًا آليًا. صفر AI (Stage 13).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { sha256Hex } from '@/lib/accounting/documents/hash';
import { sanitizeFilename, validateUpload } from '@/lib/accounting/documents/validation';

export const dynamic = 'force-dynamic';

const BUCKET = 'acc-documents';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // هوية الفاعل من جلسة الكوكيز — لا من جسد الطلب
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });

  const form = await req.formData();
  const companyId = String(form.get('company_id') ?? '');
  const captureId = String(form.get('capture_id') ?? '');
  const docType = String(form.get('doc_type') ?? 'RECEIPT');
  const source = String(form.get('source') ?? 'FILE_UPLOAD');
  const files = form.getAll('pages').filter((f): f is File => f instanceof File);
  if (!companyId || !captureId || files.length === 0) {
    return NextResponse.json({ error: 'company_id, capture_id and pages are required' }, { status: 400 });
  }

  const db = svc();
  // حدّ الحجم من ضبط الشركة إن وُجد (وإلا الاحتياطي المضبوط في validation)
  const { data: settings } = await db.from('acc_expense_settings')
    .select('max_file_bytes').eq('company_id', companyId).maybeSingle();
  for (const f of files) {
    const v = validateUpload(f.type, f.size, settings?.max_file_bytes ?? null);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });
  }

  // ١ · حجز المستند (idempotent على capture_id — نفس الالتقاط = مستند واحد)
  const { data: docRows, error: docErr } = await db.rpc('acc_create_document', {
    p_company: companyId, p_actor: auth.user.id, p_capture_id: captureId,
    p_doc_type: docType, p_source: source,
    p_original_filename: sanitizeFilename(files[0].name ?? ''),
    p_mime: files[0].type, p_expected_pages: files.length,
  });
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 403 });
  const doc = Array.isArray(docRows) ? docRows[0] : docRows;
  if (doc?.outcome === 'CONFLICT') {
    return NextResponse.json({ status: 'conflict', document: doc.document_id }, { status: 409 });
  }
  const documentId = doc!.document_id as string;

  // ٢ · لكل صفحة: حجز مفتاح حتمي → رفع → بصمة الخادم → تأكيد
  for (let i = 0; i < files.length; i++) {
    const pageNo = i + 1;
    const { data: pageRows, error: pageErr } = await db.rpc('acc_register_document_page', {
      p_document: documentId, p_page_no: pageNo, p_mime: files[i].type,
    });
    if (pageErr) return NextResponse.json({ error: pageErr.message, page: pageNo }, { status: 500 });
    const page = Array.isArray(pageRows) ? pageRows[0] : pageRows;
    const objectKey = page!.object_key as string;

    const bytes = new Uint8Array(await files[i].arrayBuffer());
    const serverHash = sha256Hex(bytes);

    // الكائن القائم: إن طابق فاستئناف؛ وإلا لا نكتب فوقه أبدًا
    const { data: existing } = await db.storage.from(BUCKET).download(objectKey);
    if (existing) {
      const existingHash = sha256Hex(new Uint8Array(await existing.arrayBuffer()));
      if (existingHash !== serverHash) {
        return NextResponse.json({ status: 'conflict', page: pageNo, reason: 'PAGE_BYTES_CONFLICT' }, { status: 409 });
      }
    } else {
      const { error: upErr } = await db.storage.from(BUCKET)
        .upload(objectKey, bytes, { contentType: files[i].type, upsert: false });
      if (upErr && !/already exists/i.test(upErr.message)) {
        return NextResponse.json({ error: upErr.message, page: pageNo, retryable: true }, { status: 502 });
      }
    }

    const { data: confRows, error: confErr } = await db.rpc('acc_confirm_document_page', {
      p_document: documentId, p_page_no: pageNo,
      p_byte_size: bytes.byteLength, p_server_sha256: serverHash,
    });
    if (confErr) return NextResponse.json({ error: confErr.message, page: pageNo, retryable: true }, { status: 500 });
    const conf = Array.isArray(confRows) ? confRows[0] : confRows;
    if (conf?.outcome === 'CONFLICT') {
      return NextResponse.json({ status: 'conflict', page: pageNo, reason: 'PAGE_BYTES_CONFLICT' }, { status: 409 });
    }
  }

  // ٣ · الإقفال: يتحقق من اكتمال الصفحات ويحسب بصمة الـmanifest في القاعدة
  const { data: finRows, error: finErr } = await db.rpc('acc_finalize_document', { p_document: documentId });
  if (finErr) return NextResponse.json({ error: finErr.message, retryable: true }, { status: 500 });
  const fin = Array.isArray(finRows) ? finRows[0] : finRows;

  // لا إنشاء مصروف آليًا — الهوية القانونية تعود للعميل فيصير SYNCED
  return NextResponse.json({ status: 'synced', document: documentId, outcome: fin?.outcome }, { status: 200 });
}
