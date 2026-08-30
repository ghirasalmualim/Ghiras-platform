import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حفظ نتيجة لعبةٍ خادميًا — تخصّ المعلّمة صاحبة الجلسة وحدها.
 * POST {game_type, student_name, score, total, client_key, saved_game_id?}
 *   → يحفظ صفًّا واحدًا؛ إعادة نفس client_key لا تُنشئ نتيجةً مكرّرة.
 * GET  ?limit=... → نتائج المعلّمة (لإثبات القراءة؛ لا واجهة الآن).
 * teacher_user_id يُشتق من الجلسة دائمًا — لا يُقبل من العميل.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['millionaire', 'snake', 'xo', 'sinjim', 'balloons'];

async function auth() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 100), 1), 500);
  const { data, error } = await supabase
    .from('game_results')
    .select('id, game_type, student_name, score, total, percentage, completed, client_key, created_at')
    .eq('teacher_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  let body: {
    game_type?: string; student_name?: string; score?: unknown;
    total?: unknown; client_key?: string; saved_game_id?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }

  const game_type = String(body.game_type || '');
  if (!TYPES.includes(game_type))
    return NextResponse.json({ error: 'bad_type' }, { status: 400 });

  const student_name = String(body.student_name || '').trim().slice(0, 120);
  if (!student_name) return NextResponse.json({ error: 'no_student' }, { status: 400 });

  const score = Number(body.score);
  const total = Number(body.total);
  if (!Number.isInteger(score) || !Number.isInteger(total)
      || total <= 0 || score < 0 || score > total)
    return NextResponse.json({ error: 'bad_score' }, { status: 400 });

  const client_key = String(body.client_key || '').trim().slice(0, 100);
  if (!client_key) return NextResponse.json({ error: 'no_key' }, { status: 400 });

  const percentage = Math.round((score / total) * 100);

  const row: Record<string, unknown> = {
    teacher_user_id: user.id, game_type, student_name,
    score, total, percentage, completed: true, client_key,
  };
  if (typeof body.saved_game_id === 'string' && body.saved_game_id)
    row.saved_game_id = body.saved_game_id;

  // idempotent: re-submitting the same (teacher, client_key) is a no-op success.
  const { data, error } = await supabase
    .from('game_results')
    .upsert(row, { onConflict: 'teacher_user_id,client_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id ?? null, deduped: !data });
}
