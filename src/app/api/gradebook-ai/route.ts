// جسر الذكاء الاصطناعي لأدوات غراس (دفتر التقييم + التحضير الكتابي)
// يحمل المفتاح على الخادم بأمان. المفتاح يُضبط من إعدادات Vercel كمتغيّر ANTHROPIC_API_KEY.

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// حاجز الفاتورة: سقف يومي لكل مستخدم قبل نداء الذكاء.
const GRADEBOOK_DAILY = parseInt(process.env.GRADEBOOK_DAILY || "40", 10) || 40;

const ALLOWED_ORIGINS = [
  "https://ghiras-edu.com",
  "https://www.ghiras-edu.com",
  "https://games.ghiras-edu.com",
  "https://ghiras-games.vercel.app",
  "https://ghiras-platform.vercel.app",
];
const MODEL = process.env.GRADEBOOK_MODEL || "claude-sonnet-5";
const MAX_TOKENS_CAP = 8192;
const MAX_TOKENS_DEFAULT = 1500;

// ===== تحقّق التوكن الموقّع (SEC-001) =====
// التوكن يصدر من /api/tool-access للمشترِكات فقط بصيغة: `${exp}.${uid}.${sig}`
// التوقيع على `k|${uid}|${exp}` بمفتاح GAME_GATE_SECRET. يمنع الاستدعاء المفتوح للعالم.
const _enc = new TextEncoder();
function _b64url(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function _hmac(msg: string) {
  const secret = process.env.GAME_GATE_SECRET;
  if (!secret) throw new Error("GAME_GATE_SECRET غير مضبوط — رفض آمن");
  const key = await crypto.subtle.importKey(
    "raw",
    _enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, _enc.encode(msg));
  return _b64url(new Uint8Array(sig));
}
function _eq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verifyKey(value: string | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [exp, uid, sig] = parts;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return null;
  const expected = await _hmac(`k|${uid}|${exp}`);
  return _eq(sig, expected) ? uid : null;
}

function corsHeaders(origin: string | null) {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-ghiras-key",
    Vary: "Origin",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders(origin),
  };

  // تحقّق التوكن الموقّع (SEC-001) — لا استدعاء بلا تصريح صادر من المنصّة
  const uid = await verifyKey(req.headers.get("x-ghiras-key"));
  if (!uid) {
    return new Response(
      JSON.stringify({ error: { message: "تصريح غير صالح — افتح الدفتر من منصّة غراس" } }),
      { status: 401, headers }
    );
  }

  // ── حاجز الفاتورة: حجز ذرّي يومي بمعرّف صريح عبر service-role (fail-closed) ──
  // لا جلسة هنا؛ الـuid مستخرج من التوكن الموقّع فقط. أي خطأ = رفضٌ آمن.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: { message: "الخادم غير مُعدّ بالكامل" } }),
      { status: 500, headers }
    );
  }
  try {
    const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
    const { data: reserve, error: reserveErr } = await admin.rpc("ai_reserve_daily_for", {
      p_user: uid,
      p_kind: "gradebook",
      p_limit: GRADEBOOK_DAILY,
    });
    if (reserveErr || !reserve) {
      return new Response(
        JSON.stringify({ error: { message: "تعذّر التحقق من حدّ الاستخدام اليومي — حاولي بعد قليل." } }),
        { status: 503, headers }
      );
    }
    if (!(reserve as { allowed?: boolean }).allowed) {
      return new Response(
        JSON.stringify({ error: { message: "وصلتِ الحدّ اليومي لاستخدام الدفتر. جرّبي غدًا أو تواصلي مع إدارة غراس." } }),
        { status: 429, headers }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "تعذّر التحقق من حدّ الاستخدام اليومي — حاولي بعد قليل." } }),
      { status: 503, headers }
    );
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: { message: "المفتاح غير مُعدّ على الخادم" } }),
      { status: 500, headers }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "طلب غير صالح" } }),
      { status: 400, headers }
    );
  }

  const messages = body?.messages;
  if (!Array.isArray(messages)) {
    return new Response(
      JSON.stringify({ error: { message: "messages مفقودة" } }),
      { status: 400, headers }
    );
  }

  const reqTokens = parseInt(body?.max_tokens, 10);
  const maxTokens = Math.min(
    MAX_TOKENS_CAP,
    Math.max(256, isFinite(reqTokens) ? reqTokens : MAX_TOKENS_DEFAULT)
  );

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
    });
    const data = await res.text();
    return new Response(data, { status: res.status, headers });
  } catch {
    return new Response(
      JSON.stringify({
        error: { message: "تعذّر الاتصال بخدمة الذكاء الاصطناعي" },
      }),
      { status: 502, headers }
    );
  }
}
