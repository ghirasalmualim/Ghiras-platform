import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isValidItemShape } from '@/lib/workspace-items';

/**
 * مساحتي — اختصارات المعلّم المنسّقة.
 * GET     → اختصارات المعلّمة الحالية، الأحدث أولًا.
 * POST    {item_type, item_key, label?, context?} → إضافة اختصار (idempotent).
 * DELETE  ?item_type=&item_key= → إزالة الاختصار فقط (لا يمسّ أي محتوى/اشتراك).
 *
 * محكومٌ بجلسة المعلّمة فقط: teacher_user_id يُشتقّ من auth.uid()، لا من العميل.
 * لا يمنح صلاحية ولا يخوّل وصولًا — مجرّد قائمة مفضّلات فوق نظام الصلاحيات.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function auth() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const { data, error } = await supabase
    .from('workspace_items')
    .select('id, item_type, item_key, label_cache, context_cache, created_at')
    .eq('teacher_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  let body: { item_type?: string; item_key?: string; label?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const item_type = String(body.item_type ?? '');
  const item_key = String(body.item_key ?? '');
  if (!isValidItemShape(item_type, item_key)) {
    return NextResponse.json({ error: 'invalid_item' }, { status: 400 });
  }

  // label/context عرضٌ فقط — تُقصّ ولا تُستخدم قط في أي قرار وصول.
  const label_cache = body.label ? String(body.label).slice(0, 200) : null;
  const context_cache = body.context ? String(body.context).slice(0, 200) : null;

  // idempotent: إعادة إضافة نفس الاختصار لا تُنشئ صفًّا مكرّرًا.
  const { error } = await supabase.from('workspace_items').upsert(
    { teacher_user_id: user.id, item_type, item_key, label_cache, context_cache },
    { onConflict: 'teacher_user_id,item_type,item_key', ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const item_type = req.nextUrl.searchParams.get('item_type') ?? '';
  const item_key = req.nextUrl.searchParams.get('item_key') ?? '';
  if (!item_type || !item_key) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  // يحذف الاختصار فقط (RLS تقصره على صاحبته). لا يمسّ المصدر ولا الاشتراك.
  const { error } = await supabase
    .from('workspace_items')
    .delete()
    .eq('teacher_user_id', user.id)
    .eq('item_type', item_type)
    .eq('item_key', item_key);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
