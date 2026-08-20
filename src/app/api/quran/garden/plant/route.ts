import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { readGardenState } from '@/features/quran/garden/state';
import { GARDEN_TUNING } from '@/features/quran/garden/tuning';
import { isPlantType } from '@/features/quran/garden/types';

/**
 * زراعة بذرة.
 *
 * ⚠️ الزراعة لا تكسب شيئًا — لا قطرة ولا مرحلة. فلو ناداها أحد ألف
 * مرة لم يتقدّم خطوة، وأقصى ما يبلغه أن يزرع بذرةً هو مأذونٌ بزرعها.
 *
 * ⚠️ والقرار المعلن: **لا تُبدَّل البذرة بعد الزراعة حتى تكتمل.**
 * وهذا يقطع استغلالًا واضحًا — أن يبدّل عند كل قطرة فيبدأ من جديد
 * بلا كلفة — ويحفظ للاكتمال معناه. والقاعدة تفرضه بفهرسٍ فريد، لا
 * الواجهةُ وحدها.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  ALREADY_GROWING: 'عندك نبتة تنمو الحين — نكمّلها قبل ما نبدأ وحدة ثانية 🌿',
  SLOT_TAKEN: 'هذا المكان محجوز. اختر مكانًا ثانيًا.',
  AUTH_REQUIRED: 'سجّل دخولك أول.',
};

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  let type: unknown;
  let slot: unknown;
  try {
    const body = await req.json();
    type = body?.type;
    slot = body?.slot;
  } catch {
    return NextResponse.json({ error: 'BAD_BODY' }, { status: 400 });
  }

  if (!isPlantType(type)) return NextResponse.json({ error: 'BAD_TYPE' }, { status: 400 });
  if (
    typeof slot !== 'number' ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= GARDEN_TUNING.slots
  )
    return NextResponse.json({ error: 'BAD_SLOT' }, { status: 400 });

  const { error } = await supabase.rpc('garden_plant', { p_type: type, p_slot: slot });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return NextResponse.json(
      { error: code ?? 'NOT_PLANTED', message: code ? MESSAGES[code] : 'ما انزرعت — جرّب مرة ثانية.' },
      { status: code ? 409 : 500 }
    );
  }

  return NextResponse.json(await readGardenState(supabase, user.id));
}
