import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * تطهير سلة المحذوفات — حذفٌ نهائيّ صلب لألعابٍ مضى على حذفها الناعم ٣٠ يومًا.
 * يُستدعى يوميًّا عبر Vercel Cron (vercel.json). محميٌّ خادميًّا بسرّ CRON_SECRET:
 * Vercel يرسل ترويسة Authorization: Bearer <CRON_SECRET>، وبدونها يُرفض (fail-closed)
 * — فلا يستطيع أحدٌ من الخارج تشغيله. يستخدم service-role خادميًّا فقط (لا يُكشف للعميل).
 * محدودٌ بدفعةٍ لكل تشغيل؛ idempotent (حذف المحذوف = لا شيء)؛ وفشلُ يومٍ يُعوَّض غدًا
 * ضمن نافذة الاحتفاظ.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;
const BATCH = 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'config' }, { status: 500 });
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // اختيارٌ محدودٌ ثم حذفٌ بالمعرّفات — يتجنّب معاملةً طويلة.
  const { data: rows, error: selErr } = await admin
    .from('saved_games')
    .select('id')
    .not('deleted_at', 'is', null)
    .lte('deleted_at', cutoff)
    .limit(BATCH);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.id as string);
  let purged = 0;
  if (ids.length) {
    const { error: delErr } = await admin.from('saved_games').delete().in('id', ids);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    purged = ids.length;
  }

  console.log(`[purge-trash] purged=${purged} cutoff=${cutoff} at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true, purged });
}
