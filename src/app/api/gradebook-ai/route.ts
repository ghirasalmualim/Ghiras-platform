const ALLOWED_ORIGINS = [
  "https://ghiras-games.vercel.app",
  "https://ghiras-platform.vercel.app",
];
const MODEL = process.env.GRADEBOOK_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = 1500;

function corsHeaders(origin: string | null) {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages }),
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
