import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * رصيد الألعاب — **قراءة فقط منذ 2026-09-27**.
 *
 * كان هذا المسار يخصم رصيدًا عند تشغيل اللعبة النهائية، وصار الخصم عند توليد
 * الأسئلة بالذكاء (في /api/game-ai) لأنّ التوليد وحده هو ما يكلّف. والتشغيل
 * بعد التوليد مجانيٌّ بلا حدّ — اللعبة التي دفعت مقابلها مملوكةٌ لها.
 *
 * أبقينا المسار وشكل ردّه كما هو لأنّ الألعاب الخمس تناديه لتحديث شارة الرصيد،
 * فحذفه كان سيكسرها جميعًا. يردّ الآن الرصيد الحالي بلا أي خصم.
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

  /**
   * **لا رفض عند الرصيد صفر.** المعلمة التي أنفقت أرصدتها في التوليد يجب أن
   * تشغّل ألعابها التي ولّدتها — فما دُفع مقابله مملوكٌ لها. والتوليد وحده هو
   * الحارس المدفوع (يردّ /api/game-ai رفضًا بلا رصيد).
   */
  const remaining = Number(profile?.game_credits ?? 0);
  return NextResponse.json({ ok: true, remaining, unlimited: false });
}
