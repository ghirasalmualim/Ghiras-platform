import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * مكتبة «ألعابي المحفوظة» + سلة المحذوفات لكل معلمة.
 * GET    ?type=millionaire   → قائمة ألعاب المعلمة النشِطة من هذا النوع (deleted_at IS NULL)
 * GET    ?trash=1            → قائمة المحذوفات (deleted_at IS NOT NULL)، الأحدث حذفًا أولًا
 * POST   {id?, game_type, title, data} → حفظ لعبة (إنشاء/تحديث)؛ السقف يَعُدّ النشِطة فقط
 * DELETE ?id=...             → حذفٌ ناعم (نقلٌ للسلة): deleted_at = now() — للنشِطة فقط
 * DELETE ?id=...&permanent=1 → حذفٌ نهائيّ صلب — من السلة فقط (deleted_at IS NOT NULL)
 * PATCH  ?id=...&action=restore → استعادة: deleted_at = null
 * محكوم بجلسة المستخدم فقط (كل معلمة ترى/تحذف/تستعيد ألعابها وحدها).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['millionaire', 'snake', 'xo', 'sinjim', 'balloons'];
const MAX_PER_TYPE = 60; // سقف آمن لكل نوع — يَعُدّ النشِطة فقط

async function auth() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  // قائمة السلة
  if (req.nextUrl.searchParams.get('trash') === '1') {
    const { data, error } = await supabase
      .from('saved_games')
      .select('id, game_type, title, deleted_at')
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ games: data ?? [] });
  }

  const type = req.nextUrl.searchParams.get('type') || '';
  let q = supabase
    .from('saved_games')
    .select('id, game_type, title, data, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null) // النشِطة فقط — المحذوفة تختفي من المكتبات وأعمالي
    .order('updated_at', { ascending: false })
    .limit(200);
  if (TYPES.includes(type)) q = q.eq('game_type', type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ games: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  let body: { id?: string; game_type?: string; title?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const game_type = String(body.game_type || '');
  if (!TYPES.includes(game_type))
    return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  if (!body.data || typeof body.data !== 'object')
    return NextResponse.json({ error: 'bad_data' }, { status: 400 });

  const title = (String(body.title || 'لعبة').trim() || 'لعبة').slice(0, 120);

  // تحديث لعبة نشِطة قائمة (تخصّ المعلمة) إن وُجد id — لا تُحدَّث لعبةٌ في السلة
  if (body.id) {
    const { data, error } = await supabase
      .from('saved_games')
      .update({ title, data: body.data, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.id) return NextResponse.json({ ok: true, id: data.id });
    // لو ما لقينا الصف (id غير صالح/محذوف) نكمل لإنشاء جديد
  }

  // السقف: يَعُدّ النشِطة فقط؛ وعند التجاوز يُحذف الأقدم النشِط حذفًا **صلبًا**
  // (تنظيفُ حصّةٍ آليّ، لا «حذف عملٍ» للمعلمة — فلا يُغرِق السلة). المحذوفة لا تُحسب.
  const { count } = await supabase
    .from('saved_games')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('game_type', game_type)
    .is('deleted_at', null);
  if ((count ?? 0) >= MAX_PER_TYPE) {
    const { data: old } = await supabase
      .from('saved_games')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_type', game_type)
      .is('deleted_at', null)
      .order('updated_at', { ascending: true })
      .limit(1);
    if (old && old[0])
      await supabase.from('saved_games').delete().eq('id', old[0].id).eq('user_id', user.id);
  }

  const { data, error } = await supabase
    .from('saved_games')
    .insert({ user_id: user.id, game_type, title, data: body.data })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'no_id' }, { status: 400 });

  const permanent = req.nextUrl.searchParams.get('permanent') === '1';

  if (permanent) {
    // حذفٌ نهائيّ صلب — من السلة فقط (deleted_at IS NOT NULL)، مقيَّدٌ بالمالك.
    // FK: game_results.saved_game_id → ON DELETE SET NULL (النتائج تبقى، يُفرَّغ المرجع).
    const { error } = await supabase
      .from('saved_games')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // حذفٌ ناعم (نقلٌ للسلة) — للنشِطة فقط، مقيَّدٌ بالمالك.
  const { error } = await supabase
    .from('saved_games')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') || '';
  const action = req.nextUrl.searchParams.get('action') || '';
  if (!id) return NextResponse.json({ error: 'no_id' }, { status: 400 });
  if (action !== 'restore')
    return NextResponse.json({ error: 'bad_action' }, { status: 400 });

  // استعادة من السلة — مقيَّدٌ بالمالك، للمحذوفة فقط.
  const { error } = await supabase
    .from('saved_games')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
