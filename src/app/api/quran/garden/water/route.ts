import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { readGardenState } from '@/features/quran/garden/state';
import { newlyUnlocked } from '@/features/quran/garden/growth';

/**
 * سقي النبتة.
 *
 * ⚠️ **يصرف ولا يخلق.** القطرة لا بدّ أن تكون موجودةً في القاعدة، وقد
 * وضعها هناك الخادمُ بعد أن حكم بنفسه على التلاوة. فلو نادى المتصفح
 * هذا المسار ألف مرة بلا قطرة، ردّت القاعدة `NO_WATER` ولم يتحرّك شيء.
 *
 * ⚠️ ولا يُقال «فتحت زينة جديدة» إلا إذا فُتحت فعلًا: نقيس ما كان قبل
 * السقي وما صار بعده، فالبشرى تأتي مرّة واحدة في وقتها.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  const before = await readGardenState(supabase, user.id);

  const { data, error } = await supabase.rpc('garden_water');
  if (error) {
    const code = error.message.includes('NO_WATER')
      ? 'NO_WATER'
      : error.message.includes('NO_PLANT')
        ? 'NO_PLANT'
        : 'NOT_WATERED';
    return NextResponse.json({ error: code }, { status: code === 'NOT_WATERED' ? 500 : 409 });
  }

  const after = await readGardenState(supabase, user.id);
  const completed = Boolean((data as { completed?: boolean } | null)?.completed);

  return NextResponse.json({
    state: after,
    completed,
    /** أول غرسة اكتملت — لحظةٌ لها شاشتها. */
    firstEver: completed && before.completed.length === 0,
    unlocked: newlyUnlocked(
      { completedPlants: before.completed.length, careDays: before.careDays },
      { completedPlants: after.completed.length, careDays: after.careDays }
    ),
  });
}
