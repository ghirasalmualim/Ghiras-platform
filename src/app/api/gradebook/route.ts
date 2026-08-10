import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * تخزين سحابي لسجل الدرجات الذكي (REL-002).
 * يُنادى من نطاق الألعاب (الدفتر) عبر النطاقات، ويُوثّق بتوكن موقّع صادر من
 * /api/tool-access (نفس توكن k: `${exp}.${uid}.${sig}` موقّع على `k|uid|exp`).
 * يحفظ/يقرأ صفوف المعلّمة عبر مفتاح الخدمة (service role) مقيّدًا بهويتها من التوكن.
 *
 * يتطلب متغيّر بيئة على Vercel: SUPABASE_SERVICE_ROLE_KEY
 * وجدول: gradebook_data(user_id uuid, key text, value text, updated_at timestamptz)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGINS = [
  'https://ghiras-edu.com',
  'https://www.ghiras-edu.com',
  'https://games.ghiras-edu.com',
  'https://ghiras-games.vercel.app',
  'https://ghiras-platform.vercel.app',
];

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-ghiras-key',
    Vary: 'Origin',
  };
}

const enc = new TextEncoder();
function b64url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(msg: string) {
  const secret = process.env.GAME_GATE_SECRET;
  if (!secret) throw new Error('GAME_GATE_SECRET غير مضبوط — رفض آمن');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}
function eq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// يعيد هوية المعلّمة (uid) إن كان التوكن صالحًا، وإلا null
async function verifyKey(value: string | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [exp, uid, sig] = parts;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return null;
  const expected = await hmac(`k|${uid}|${exp}`);
  return eq(sig, expected) ? uid : null;
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) { console.error('GRADEBOOK_MISSING_ENV', {hasUrl:!!url, hasServiceKey:!!serviceKey}); throw new Error('إعداد الخادم ناقص (SERVICE_ROLE)'); }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

export async function GET(req: NextRequest) {
  const headers = { 'Content-Type': 'application/json', ...cors(req.headers.get('origin')) };
  const uid = await verifyKey(req.headers.get('x-ghiras-key'));
  if (!uid) return new NextResponse(JSON.stringify({ error: 'تصريح غير صالح' }), { status: 401, headers });

  const key = req.nextUrl.searchParams.get('key') || '';
  if (!key) return new NextResponse(JSON.stringify({ error: 'key مفقود' }), { status: 400, headers });

  try {
    const { data, error } = await svc()
      .from('gradebook_data')
      .select('value')
      .eq('user_id', uid)
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    return new NextResponse(JSON.stringify({ value: data?.value ?? null }), { status: 200, headers });
  } catch (e) {
    console.error('GRADEBOOK_GET_ERROR', e);
    return new NextResponse(JSON.stringify({ error: 'تعذّر القراءة' }), { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = { 'Content-Type': 'application/json', ...cors(req.headers.get('origin')) };
  const uid = await verifyKey(req.headers.get('x-ghiras-key'));
  if (!uid) return new NextResponse(JSON.stringify({ error: 'تصريح غير صالح' }), { status: 401, headers });

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(JSON.stringify({ error: 'طلب غير صالح' }), { status: 400, headers });
  }
  const key = typeof body.key === 'string' ? body.key : '';
  const value = typeof body.value === 'string' ? body.value : null;
  if (!key || value === null) {
    return new NextResponse(JSON.stringify({ error: 'key/value مفقود' }), { status: 400, headers });
  }
  // حدّ حجم معقول لحماية الخادم
  if (value.length > 2_000_000) {
    return new NextResponse(JSON.stringify({ error: 'الحجم كبير' }), { status: 413, headers });
  }

  try {
    const { error } = await svc()
      .from('gradebook_data')
      .upsert(
        { user_id: uid, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
    if (error) throw error;
    return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    console.error('GRADEBOOK_POST_ERROR', e);
    return new NextResponse(JSON.stringify({ error: 'تعذّر الحفظ' }), { status: 500, headers });
  }
}
