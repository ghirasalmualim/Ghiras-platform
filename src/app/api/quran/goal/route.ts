import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSurah } from '@/features/quran/data/corpus';
import { withinLessonRange } from '@/features/quran/engine/memory';
import { checkPolicySafe, RATE_MESSAGES } from '@/features/quran/engine/rate-policies';

/**
 * هدف الحفظ — الكتابة من هنا وحدها.
 *
 * ═══ لماذا مسار خادم والجدول أصلًا بسياسة «صفوفي» ═══
 * RLS تضمن أن الطالبة لا تكتب إلا صفوفها — ولا تضمن أن الصفّ نفسه
 * صحيح: القاعدة لا تعرف أن للفاتحة سبع آيات، ولا أن درس المنهج
 * حدودُه ١–٤. فالنطاق القرآني وحدودُ الدرس يُتحقَّقان هنا حيث
 * المصحفُ ملفٌّ في المستودع والدرسُ صفٌّ يُقرأ.
 *
 * ⚠️ ولا يُقبل من المتصفح «تقدّم»: `user_marked_up_to` قولُ راحةٍ
 * يُصرَّح به هنا ويُقصّ إلى مدى الهدف — أما التقدّم الموثوق فيُشتق
 * من جداول المرحلة ٦ عند القراءة ولا يُخزَّن أصلًا، فلا شيء يُزوَّر.
 *
 * ═══ الإلغاء لا يمحو أثرًا ═══
 * إلغاء الهدف يطفئه (`CANCELLED` + `is_active=false`) ولا يلمس
 * المراجعة ولا المواضع ولا الأحداث — التاريخ ملكُ صاحبته.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  action?: 'create' | 'update' | 'cancel' | 'mark';
  surah?: number;
  from?: number;
  to?: number;
  startDate?: string;
  targetDate?: string | null;
  daysOfWeek?: number[];
  intensity?: string;
  lessonId?: string;
  /** action=mark: «بلغتُ الآية كذا» — قول راحة لا شهادة. */
  markedUpTo?: number;
  /** action=update/cancel/mark: الهدف المقصود. */
  goalId?: string;
};

const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });

function cleanDays(raw: unknown): number[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 7) return null;
  const out: number[] = [];
  for (const d of raw) {
    if (!Number.isInteger(d) || d < 0 || d > 6) return null;
    if (!out.includes(d)) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });
  // حدّ الاستدعاء — سياسة WRITE المركزية (fail-open عند عطل العدّاد نفسه)
  {
    const rl = checkPolicySafe('WRITE', user.id);
    if (!rl.ok)
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: RATE_MESSAGES.shortWait, retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
  }


  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad('BAD_BODY');
  }

  const action = body.action ?? 'create';

  /* ── إلغاء ──────────────────────────────────────────────── */
  if (action === 'cancel') {
    if (!body.goalId) return bad('GOAL_ID_REQUIRED');
    const { error } = await supabase
      .from('quran_goal')
      .update({ is_active: false, status: 'CANCELLED' })
      .eq('id', body.goalId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'DB' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  /* ── «بلغت الآية كذا» ───────────────────────────────────── */
  if (action === 'mark') {
    if (!body.goalId) return bad('GOAL_ID_REQUIRED');
    const { data: g } = await supabase
      .from('quran_goal')
      .select('from_ayah, to_ayah')
      .eq('id', body.goalId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!g) return bad('GOAL_NOT_FOUND');
    const m = Number(body.markedUpTo);
    if (!Number.isInteger(m)) return bad('BAD_MARK');
    // يُقصّ إلى مدى الهدف — لا «بلغت» خارج ما يُحفظ
    const clamped = Math.max(0, Math.min(Number(g.to_ayah), m));
    const { error } = await supabase
      .from('quran_goal')
      .update({ user_marked_up_to: clamped })
      .eq('id', body.goalId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'DB' }, { status: 500 });
    return NextResponse.json({ ok: true, markedUpTo: clamped });
  }

  /* ── إنشاء / تعديل ─────────────────────────────────────── */
  const surahNo = Number(body.surah);
  const from = Number(body.from);
  const to = Number(body.to);
  if (!Number.isInteger(surahNo) || !Number.isInteger(from) || !Number.isInteger(to))
    return bad('BAD_RANGE');
  const surah = getSurah(surahNo);
  // النطاق يُصدَّق على المصحف نفسه — لا على قول المتصفح
  if (!surah || from < 1 || to < from || to > surah.ayah_count) return bad('BAD_RANGE');

  const startDate = body.startDate;
  if (!startDate || !DAY_RE.test(startDate)) return bad('BAD_START');
  const targetDate = body.targetDate ?? null;
  if (targetDate !== null && (!DAY_RE.test(targetDate) || targetDate < startDate))
    return bad('BAD_TARGET');

  const daysOfWeek = cleanDays(body.daysOfWeek);
  if (daysOfWeek === null) return bad('BAD_DAYS');
  const intensity = ['light', 'balanced', 'intense'].includes(body.intensity ?? '')
    ? (body.intensity as string)
    : 'balanced';

  // درس المنهج: الهدف لا يفيض عن حدود الدرس بآية
  let lessonId: string | null = null;
  let source: 'personal' | 'curriculum' = 'personal';
  if (body.lessonId) {
    const { data: lesson } = await supabase
      .from('quran_curriculum_lesson')
      .select('id, surah, from_ayah, to_ayah, is_visible')
      .eq('id', body.lessonId)
      .maybeSingle();
    if (!lesson || !lesson.is_visible) return bad('LESSON_NOT_FOUND');
    if (
      !withinLessonRange(
        { surah: surahNo, from_ayah: from, to_ayah: to },
        { surah: Number(lesson.surah), from_ayah: Number(lesson.from_ayah), to_ayah: Number(lesson.to_ayah) }
      )
    )
      return bad('OUTSIDE_LESSON');
    lessonId = String(lesson.id);
    source = 'curriculum';
  }

  if (action === 'update') {
    if (!body.goalId) return bad('GOAL_ID_REQUIRED');
    /**
     * ⚠️ التعديل لا يحذف تقدّمًا: تُحدَّث إعدادات الجدولة وحدها،
     * و`user_marked_up_to` والمراجعات والمواضع تبقى كما هي —
     * الأيام القادمة تُعاد وحدها لأن الخطة تُحسب لا تُخزَّن.
     */
    const { error } = await supabase
      .from('quran_goal')
      .update({ target_date: targetDate, start_date: startDate, days_of_week: daysOfWeek, intensity })
      .eq('id', body.goalId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'DB' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // إنشاء: هدف نشط واحد — نفس قرار المرحلة ٢ («خطة واحدة أوضح»)
  await supabase.from('quran_goal').update({ is_active: false }).eq('user_id', user.id);
  const { data: created, error } = await supabase
    .from('quran_goal')
    .insert({
      user_id: user.id,
      surah: surahNo,
      from_ayah: from,
      to_ayah: to,
      target_date: targetDate,
      start_date: startDate,
      days_of_week: daysOfWeek,
      intensity,
      source,
      lesson_id: lessonId,
      status: 'MEMORIZING',
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !created) return NextResponse.json({ error: 'DB' }, { status: 500 });
  return NextResponse.json({ ok: true, goalId: created.id });
}
