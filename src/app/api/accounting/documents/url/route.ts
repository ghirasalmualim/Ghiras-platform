/**
 * غراس للمحاسبة — Stage 8: مسار تنزيل موقَّع قصير العمر.
 *
 * سلسلة التخويل الكاملة: جلسة كوكيز → صف المستند عبر عميل المستخدم
 * (RLS تفرض الشركة والدور — READ_ONLY لا ترى دليل المصدر افتراضًا،
 * وEMPLOYEE ترى ما رفعت فقط) → عندها فقط يُنشئ service key رابطًا
 * موقَّعًا قصير العمر. مسار الكائن ليس أمنًا ولا يوجد URL عام أبدًا.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'acc-documents';
const SIGNED_URL_TTL_SECONDS = 120;

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get('document');
  const pageNo = Number(req.nextUrl.searchParams.get('page') ?? '1');
  if (!documentId) return NextResponse.json({ error: 'document is required' }, { status: 400 });

  // التخويل عبر RLS بعميل المستخدم نفسه — لا فحص يدوي يُلتف عليه
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'authentication required' }, { status: 401 });

  const { data: doc } = await userClient
    .from('acc_documents').select('id, company_id, state').eq('id', documentId).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: page } = await userClient
    .from('acc_document_pages').select('object_key')
    .eq('document_id', documentId).eq('page_no', pageNo).maybeSingle();
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  );
  const { data: signed, error } = await svc.storage.from(BUCKET)
    .createSignedUrl(page.object_key, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'signing failed' }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
