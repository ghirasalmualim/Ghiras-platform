'use client';

/**
 * تقدّم الطالبة — آخر موضع وحالة المقاطع.
 *
 * مستويان عن قصد:
 *   • الزائرة (بلا حساب) → المتصفح وحده. تفتح المصحف وتقرأ وتستمع
 *     وتُستأنف من مكانها، بلا تسجيل ولا باب. لا نضع حاجزًا قبل القرآن.
 *   • المسجَّلة → Supabase، فيتبعها تقدّمها بين الجوال والآيباد.
 *
 * الترقية بلا فقد: عند تسجيل الدخول يُرفع ما في المتصفح إلى الحساب إن
 * لم يكن هناك تقدّم أحدث، فلا يضيع عمل الزائرة لأنها سجّلت متأخرة.
 *
 * ⚠️ ما ليس هنا: لا صوت، ولا تفريغ، ولا أي أثر لتسجيل الطفل. عندما
 * يأتي التسميع الذكي، يُحلَّل الصوت ويُحذف فورًا، ولا يُخزَّن إلا النتيجة.
 */

import { createClient } from '@/lib/supabase/client';
import { newerResume, shouldSaveResume, type ResumePos } from '../engine/resume';
import type { LastPosition, SegmentProgress, SegmentStatus } from '../types';

const LAST_KEY = 'ghiras.quran.last';
const SEG_KEY = 'ghiras.quran.segments';
const RECITER_KEY = 'ghiras.quran.reciter';

// ── المتصفح ────────────────────────────────────────────────

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // التخزين قد يكون ممنوعًا (تصفّح خاص في Safari) — لا نُسقط الصفحة لأجله
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ممتلئ أو ممنوع — التقدّم ميزة مساعدة لا تستحق تعطيل القراءة */
  }
}

const segKey = (s: number, f: number, t: number) => `${s}:${f}-${t}`;

// ── آخر موضع ───────────────────────────────────────────────

/** ذاكرة الوحدة — تُجنّب قراءة القاعدة قبل كل حفظٍ محروس. */
let cachedPos: ResumePos | null | undefined;

export async function getLastPosition(): Promise<LastPosition | null> {
  const local = readLocal<LastPosition | null>(LAST_KEY, null);

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    cachedPos = local;
    return local;
  }

  const { data: db } = await sb
    .from('quran_last_position')
    .select('surah, ayah, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  /**
   * ⚠️ الأحدث يفوز — بقاعدة `newerResume` المحافظة الموثقة هناك:
   * سجلُّ متصفحٍ قديم بلا طابعٍ لا يُخمَّن عمرُه، والقاعدة تغلبه.
   * والوعد القديم «يُرفع ما في المتصفح عند الدخول» صار منفَّذًا:
   * محليٌّ أحدث يُرفع، وقاعدةٌ أحدث تُنزل — فيتبع الموضعُ صاحبته
   * بين أجهزتها.
   */
  const { pos, source } = newerResume(local, (db as ResumePos | null) ?? null);
  cachedPos = pos;
  if (pos && source === 'local')
    void sb
      .from('quran_last_position')
      .upsert(
        { user_id: user.id, surah: pos.surah, ayah: pos.ayah, updated_at: pos.updated_at ?? new Date().toISOString() },
        { onConflict: 'user_id' }
      );
  if (pos && source === 'db') writeLocal(LAST_KEY, pos);
  return (pos as LastPosition | null) ?? null;
}

/**
 * ⚠️ **عقد الاستدعاء**: لا يُنادى إلا من تفاعل قراءةٍ صريح
 * («استمع من هنا») أو بـ`force` («انتهيت هنا») — **وليس من mount
 * ولا فتح رابطٍ ولا خطة اليوم أبدًا**. PAGE OPEN ≠ READING PROGRESS.
 *
 * والحارس `shouldSaveResume` يمنع الرجوع للخلف داخل نفس السورة
 * بغير force — فمن بلغت ٢٢ لا يدوسها لمسُ العاشرة عرضًا.
 */
export async function saveLastPosition(
  surah: number,
  ayah: number,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (cachedPos === undefined)
    cachedPos = readLocal<LastPosition | null>(LAST_KEY, null);

  if (!shouldSaveResume(cachedPos ?? null, { surah, ayah }, opts.force === true)) return;

  const now = new Date().toISOString();
  const next: ResumePos = { surah, ayah, updated_at: now };
  cachedPos = next;
  writeLocal(LAST_KEY, next);

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb
    .from('quran_last_position')
    .upsert(
      { user_id: user.id, surah, ayah, updated_at: now },
      { onConflict: 'user_id' }
    );
}

// ── حالة المقاطع ───────────────────────────────────────────

export async function getSegmentProgress(
  surah: number,
  from: number,
  to: number
): Promise<SegmentProgress | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (user) {
    const { data } = await sb
      .from('quran_segment_progress')
      .select('surah, from_ayah, to_ayah, status, hide_level, updated_at')
      .eq('user_id', user.id)
      .eq('surah', surah)
      .eq('from_ayah', from)
      .eq('to_ayah', to)
      .maybeSingle();
    if (data) return data as SegmentProgress;
  }

  const all = readLocal<Record<string, SegmentProgress>>(SEG_KEY, {});
  return all[segKey(surah, from, to)] ?? null;
}

export async function saveSegmentProgress(
  surah: number,
  from: number,
  to: number,
  patch: { status?: SegmentStatus; hide_level?: number }
): Promise<void> {
  const now = new Date().toISOString();

  const all = readLocal<Record<string, SegmentProgress>>(SEG_KEY, {});
  const key = segKey(surah, from, to);
  const merged: SegmentProgress = {
    surah,
    from_ayah: from,
    to_ayah: to,
    status: patch.status ?? all[key]?.status ?? 'learning',
    hide_level: patch.hide_level ?? all[key]?.hide_level ?? 0,
    updated_at: now,
  };
  all[key] = merged;
  writeLocal(SEG_KEY, all);

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb.from('quran_segment_progress').upsert(
    { user_id: user.id, ...merged },
    { onConflict: 'user_id,surah,from_ayah,to_ayah' }
  );
}

// ── القارئ المختار ──────────────────────────────────────────

/**
 * اختيار القارئ إعدادٌ بسيط لا يستحق جدولًا خاصًا به، فيسكن عمودًا في
 * `quran_last_position` — وهو أصلًا سطر واحد لكل طالبة يحمل حالتها في
 * القسم.
 *
 * والمتصفح هو المصدر الأول دائمًا: يعمل للزائرة وللمسجَّلة، وفورًا بلا
 * انتظار شبكة. والقاعدة تتبعه لتلحق الاختيار بالطالبة بين أجهزتها.
 *
 * ⚠️ الكتابة في القاعدة **متساهلة عن قصد**: لو لم يكن العمود موجودًا
 * بعد (لم يُشغَّل تحديث SQL)، يُتجاهل الخطأ بصمت. اختيار القارئ ميزة
 * مساعدة، ولا يجوز أن يُسقط حفظَ التقدّم أو يمنع التلاوة لأجلها.
 */
/**
 * مسح موضع القراءة المحفوظ.
 *
 * ⚠️ يُمسح من المتصفح ومن قاعدة البيانات معًا. ولو مسحناه من أحدهما
 * فقط لعاد في الجلسة القادمة من الآخر، فتظنّ الطالبة أن الزر لا يعمل.
 *
 * والزائرة موضعها في متصفحها وحده، فيكفيها الأول.
 */
export async function clearLastPosition(): Promise<void> {
  cachedPos = null;
  try {
    window.localStorage.removeItem(LAST_KEY);
  } catch {
    /* التخزين المحلي قد يكون مقفلًا — لا يمنع مسح الخادم */
  }

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb.from('quran_last_position').delete().eq('user_id', user.id);
}

export async function getReciterId(): Promise<string | null> {
  const local = readLocal<string | null>(RECITER_KEY, null);
  if (local) return local;

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  try {
    const { data } = await sb
      .from('quran_last_position')
      .select('reciter_id')
      .eq('user_id', user.id)
      .maybeSingle();
    return (data as { reciter_id?: string | null } | null)?.reciter_id ?? null;
  } catch {
    return null;
  }
}

export async function saveReciterId(id: string): Promise<void> {
  writeLocal(RECITER_KEY, id);

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  try {
    // تحديث لا إدراج: سطر الموضع يُنشأ عند فتح أول مقطع، ولا نريد
    // إنشاء سطر بسورة وهمية لمجرد حفظ تفضيل صوتي.
    await sb
      .from('quran_last_position')
      .update({ reciter_id: id })
      .eq('user_id', user.id);
  } catch {
    /* العمود غير موجود بعد — المتصفح كافٍ */
  }
}

/**
 * هل هذه زائرة بلا حساب؟
 * تستعمله الواجهة لتوضّح — بلطف ومرة واحدة — أن تسجيل الدخول يحفظ
 * التقدّم على كل الأجهزة. ليس بابًا ولا إجبارًا.
 */
export async function isGuest(): Promise<boolean> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return !user;
}
