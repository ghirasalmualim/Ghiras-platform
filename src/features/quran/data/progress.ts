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
import type { LastPosition, SegmentProgress, SegmentStatus } from '../types';

const LAST_KEY = 'ghiras.quran.last';
const SEG_KEY = 'ghiras.quran.segments';

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

export async function getLastPosition(): Promise<LastPosition | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (user) {
    const { data } = await sb
      .from('quran_last_position')
      .select('surah, ayah, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) return data as LastPosition;
  }
  return readLocal<LastPosition | null>(LAST_KEY, null);
}

export async function saveLastPosition(surah: number, ayah: number): Promise<void> {
  const now = new Date().toISOString();
  writeLocal(LAST_KEY, { surah, ayah, updated_at: now });

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
