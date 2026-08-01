import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * مكتبة «ألعابي المحفوظة» لكل معلمة.
 * GET    ?type=millionaire        → قائمة ألعاب المعلمة من هذا النوع
 * POST   {id?, game_type, title, data} → حفظ لعبة (إنشاء أو تحديث) وإرجاع id
 * DELETE ?id=...                  → حذف لعبة تخصّ المعلمة
 * محكوم بجلسة المستخدم فقط (كل معلمة ترى ألعابها).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['millionaire', 'snake', 'xo', 'sinjim'];
const MAX_PER_TYPE = 60; // سقف آمن لكل نوع

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

  const type = req.nextUrl.searchParams.get('type') || '';
  let q = supabase
    .from('saved_games')
    .select('id, game_type, title, data, updated_at')
    .eq('user_id', user.id)
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

  // تحديث لعبة قائمة (تخصّ المعلمة) إن وُجد id
  if (body.id) {
    const { data, error } = await supabase
      .from('saved_games')
      .update({ title, data: body.data, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.id) return NextResponse.json({ ok: true, id: data.id });
    // لو ما لقينا الصف (id غير صالح) نكمل لإنشاء جديد
  }

  // سقف: احذف الأقدم إن تجاوزت العدد
  const { count } = await supabase
    .from('saved_games')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('game_type', game_type);
  if ((count ?? 0) >= MAX_PER_TYPE) {
    const { data: old } = await supabase
      .from('saved_games')
      .select('id')
      .eq('user_id', user.id)
      .eq('game_type', game_type)
      .order('updated_at', { ascending: true })
      .limit(1);
    if (old && old[0]) await supabase.from('saved_games').delete().eq('id', old[0].id).eq('user_id', user.id);
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

  const { error } = await supabase
    .from('saved_games')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
