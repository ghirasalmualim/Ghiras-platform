import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * رصيد الألعاب عند **تشغيل** اللعبة النهائية.
 *
 * التقسيم (قرار حصة 2026-09-27):
 *   • معلمةٌ تولّد بالذكاء → رصيدُها يُخصم لحظةَ التوليد في /api/game-ai،
 *     والتشغيلُ بعده مجانيٌّ بلا حدّ — وتُعاد اللعبة متى شاءت، فما دُفع مملوكٌ لها.
 *   • معلمةٌ تكتب أسئلتها يدويًا بلا ذكاء → تُخصم رصيدًا عند التشغيل، وإلا
 *     صارت الأداة مجانيةً بالكامل لمن يكتب بنفسه.
 *
 * **القرار من سجلّ الخادم لا من المتصفّح**: وجودُ أيِّ استخدامٍ لذكاء الألعاب
 * (ai_daily_usage kind='game') يعني أنها دفعت عند التوليد. لا نسأل الصفحةَ عن
 * نوع اللعبة لأن الجواب حينها بيد المتصفّح — وهو ما لا يُوثق به في الفوترة.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, game_credits')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin') {
    return NextResponse.json({ ok: true, remaining: 999999, unlimited: true });
  }

  // هل سبق أن ولّدت بالذكاء؟ إذن دفعت عند التوليد — التشغيل مجاني.
  const { data: used } = await supabase
    .from('ai_daily_usage')
    .select('request_count')
    .eq('user_id', user.id)
    .eq('kind', 'game')
    .limit(1);
  if (used && used.length > 0) {
    return NextResponse.json({
      ok: true,
      remaining: Number(profile?.game_credits ?? 0),
      unlimited: false,
    });
  }

  // لعبةٌ يدويةٌ بحتة — تُخصم عند التشغيل كما كان الحال قبل 2026-09-27.
  const { data, error } = await supabase.rpc('consume_game_credit');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const remaining = data as number;
  if (remaining === -1) {
    return NextResponse.json({ ok: false, error: 'no_credit', remaining: 0 }, { status: 402 });
  }

  return NextResponse.json({
    ok: true,
    remaining,
    unlimited: remaining === 999999,
  });
}
