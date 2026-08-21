import { createClient } from '@supabase/supabase-js';
import { applyCaps, dropsForReasons } from './growth';
import type { DropReason } from './types';

/**
 * منح قطرات الماء — **الفعل الوحيد في النظام كلّه الذي يخلق تقدّمًا**.
 *
 * ═══ لماذا هو وحده يحتاج مفتاحًا ═══
 * جداول الحديقة لا تقبل كتابةً من العميل البتّة. والزراعة والسقي
 * يمرّان بدالتين آمنتين لأنهما لا يخلقان شيئًا: الأولى تضع بذرة،
 * والثانية تصرف قطرةً موجودة. أما هذه فتُنشئ القطرة من العدم — ولو
 * فُتح بابها للمتصفح لسقط نظام المكافأة كلّه في سطرٍ واحد من وحدة
 * التطوير.
 *
 * فتُنفَّذ بمفتاح الخدمة، بعد أن يكون الخادمُ **هو** من حكم على
 * التلاوة. والمتصفح لا يخبرنا بشيء؛ هو يقرأ ما قرّرناه.
 *
 * ⚠️ ولا تُعطَّل نتيجةُ الطالبة لأجل الحديقة أبدًا. إن غاب المفتاح أو
 * تعثّرت القاعدة، رجعنا بصفرٍ وصمتنا: التسميع يُعرض كاملًا، وتنتظر
 * القطرةُ لا العكس. الحديقةُ زينةُ الرحلة لا الرحلة.
 */

export type GrantInput = {
  userId: string;
  reasons: readonly DropReason[];
  /** «سورة:من-إلى» — مفتاح قاعدة منع الطحن في القاعدة. */
  segmentKey: string;
  sourceKind: 'recitation' | 'review';
  sourceId?: number | null;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** بداية اليوم بتوقيت UTC — نفس ما تحسبه القاعدة في `day_key`. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * لماذا لم تُمنح قطرة — لتقوله الشاشةُ لصاحبها.
 *
 * ⚠️ أُضيف بعد أن ظنّت صاحبة المنصة أن النظام معطّل: سمّعت فلم تجد
 * قطرة، والشاشة تَعِدها بواحدة بلا شرط. وكان الحارس قد رفض بحقّ —
 * فالمقطع نفسه في اليوم نفسه يُكافأ مرّة. **والرفض الصامت يُقرأ
 * عطلًا**، وهو ثامن ما وقع من هذه العائلة في هذا المشروع.
 */
export type GrantOutcome = {
  granted: number;
  reason:
    | 'GRANTED'
    /** سمّع هذا المقطع اليوم وأخذ قطرته. */
    | 'ALREADY_TODAY'
    /** بلغ سقف اليوم. */
    | 'DAY_CAP'
    /** يده ممتلئة — يسقي أولًا. */
    | 'HOLD_FULL'
    /** جلسة غير صالحة أو لم يُحكم عليها — لا تُكافأ. */
    | 'NOT_ELIGIBLE'
    /** المفتاح غائب أو القاعدة تعثّرت — لا يُقال للطالبة شيء. */
    | 'UNAVAILABLE';
};

/**
 * ⚠️ لا يرمي أبدًا. فشلُه صامت بقصد — راجع رأس الملف.
 */
export async function grantDrops(input: GrantInput): Promise<GrantOutcome> {
  if (!input.reasons.length) return { granted: 0, reason: 'NOT_ELIGIBLE' };

  const sb = serviceClient();
  if (!sb) return { granted: 0, reason: 'UNAVAILABLE' };

  try {
    const day = todayKey();

    const [{ count: today }, { count: held }] = await Promise.all([
      sb
        .from('quran_garden_drop')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', input.userId)
        .eq('day_key', day),
      sb
        .from('quran_garden_drop')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', input.userId)
        .is('used_at', null),
    ]);

    const caps = applyCaps({
      grantedToday: today ?? 0,
      held: held ?? 0,
      earned: dropsForReasons(input.reasons),
    });
    if (caps.granted <= 0)
      return {
        granted: 0,
        reason: caps.cappedByDay > 0 ? 'DAY_CAP' : 'HOLD_FULL',
      };

    /**
     * ⚠️ تُقتطع الأسباب بترتيبها لا عشوائيًا، والترتيب في
     * `awardsForRecitation` يبدأ بالالتزام. فمن بلغ سقف يومه أخذ
     * أعمّ أسبابه لا أندرها — وهذا أعدل وأثبت.
     */
    const take = input.reasons.slice(0, caps.granted);

    /**
     * ⚠️ تُدرَج **واحدةً واحدة** لا دفعةً واحدة.
     *
     * وهذا ليس إسرافًا: الإدراج الدفعيّ يسقط كلّه إذا صادم صفٌّ واحد
     * الفهرسَ الفريد. فمن سمّع المقطع مرّتين في يوم يستحقّ قطرةَ
     * «الإتقان» في الثانية وقد أخذ «الالتزام» في الأولى — ولو أدرجنا
     * دفعةً لضاعت الاثنتان معًا بسبب واحدة مكرّرة.
     */
    let granted = 0;
    for (const reason of take) {
      const { error } = await sb.from('quran_garden_drop').insert({
        user_id: input.userId,
        reason,
        source_kind: input.sourceKind,
        source_id: input.sourceId ?? null,
        segment_key: input.segmentKey,
        day_key: day,
      });
      // ‏23505 = تكرار، وهو القاعدة تعمل لا خللًا: نفس المقطع في نفس
      // اليوم لنفس السبب يُكافأ مرّة. يُتجاوز بصمت.
      if (!error) granted++;
    }

    /**
     * ⚠️ صفرٌ بعد محاولةٍ صحيحة معناه أن الفهرس الفريد ردّها كلها:
     * سمّع هذا المقطع اليوم وأخذ قطرته. وهذا الفرق — بين «رُفضت
     * للتكرار» و«تعذّر المنح» — هو ما يُقال للطالبة.
     */
    if (granted === 0) return { granted: 0, reason: 'ALREADY_TODAY' };
    return { granted, reason: 'GRANTED' };
  } catch {
    return { granted: 0, reason: 'UNAVAILABLE' };
  }
}
