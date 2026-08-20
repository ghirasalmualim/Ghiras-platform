import type { SupabaseClient } from '@supabase/supabase-js';
import { GARDEN_TUNING } from './tuning';
import {
  careDays as countCareDays,
  progressWithinStage,
  stageForDrops,
  unlockedRewards,
} from './growth';
import type { DropReason, GrowthStage, PlantTypeKey, RewardKey } from './types';

/**
 * قراءة حالة الحديقة — بجلسة صاحبها لا بمفتاح خدمة.
 *
 * ⚠️ القراءة تمرّ بسياسات القاعدة عمدًا: لو أخطأنا يومًا في تمرير
 * المعرّف، ردّت القاعدةُ صفرًا ولم تكشف حديقة غيرها. والكتابة وحدها
 * هي التي تحتاج مفتاحًا، ولها بابها.
 *
 * ⚠️ والزينة **تُحسب هنا ولا تُقرأ من جدول**: هي دالةٌ في عدد النباتات
 * المكتملة وأيام العناية. فما من صفٍّ يُزوَّر، ولا عتبةٍ تفترق بين
 * الكود والقاعدة.
 */

export type GardenPlantView = {
  id: number;
  type: PlantTypeKey;
  slot: number;
  /** رقمٌ للرسم لا للعرض. */
  stage: GrowthStage;
  /** ٠..١ داخل المرحلة — لتتحرّك النبتة مع كل قطرة. */
  progress: number;
};

export type GardenState = {
  /** لم يزرع بعد؟ عندها تُعرض شاشة «ابدأ رحلتك». */
  started: boolean;
  current: GardenPlantView | null;
  completed: GardenPlantView[];
  /** القطرات التي بيده الآن، بأسبابها. */
  held: { id: number; reason: DropReason }[];
  careDays: number;
  rewards: RewardKey[];
  /** المساحات المشغولة — لا يُعرض عليه إلا الفارغ منها. */
  takenSlots: number[];
  slots: number;
};

type PlantRow = {
  id: number;
  plant_type: PlantTypeKey;
  slot: number;
  drops_used: number;
  completed_at: string | null;
};

function view(row: PlantRow): GardenPlantView {
  return {
    id: row.id,
    type: row.plant_type,
    slot: row.slot,
    stage: stageForDrops(row.drops_used),
    progress: progressWithinStage(row.drops_used),
  };
}

export async function readGardenState(
  supabase: SupabaseClient,
  userId: string
): Promise<GardenState> {
  const [{ data: plants }, { data: held }, { data: spent }] = await Promise.all([
    supabase
      .from('quran_garden_plant')
      .select('id, plant_type, slot, drops_used, completed_at')
      .eq('user_id', userId)
      .order('planted_at', { ascending: true }),
    supabase
      .from('quran_garden_drop')
      .select('id, reason')
      .eq('user_id', userId)
      .is('used_at', null)
      .order('earned_at', { ascending: true }),
    supabase
      .from('quran_garden_drop')
      .select('used_at')
      .eq('user_id', userId)
      .not('used_at', 'is', null),
  ]);

  const rows = (plants ?? []) as PlantRow[];
  const growing = rows.find((p) => !p.completed_at) ?? null;
  const done = rows.filter((p) => p.completed_at);

  const careDays = countCareDays(
    ((spent ?? []) as { used_at: string }[]).map((d) => d.used_at)
  );

  return {
    started: rows.length > 0,
    current: growing ? view(growing) : null,
    completed: done.map(view),
    held: ((held ?? []) as { id: number; reason: DropReason }[]).map((d) => ({
      id: d.id,
      reason: d.reason,
    })),
    careDays,
    rewards: unlockedRewards({ completedPlants: done.length, careDays }),
    takenSlots: rows.map((p) => p.slot),
    slots: GARDEN_TUNING.slots,
  };
}
