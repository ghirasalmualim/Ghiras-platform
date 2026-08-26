import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { SUPPORT_KNOWLEDGE, ESCALATE_HINTS } from '@/lib/supportKnowledge';

/**
 * إرسال رسالة دعم — رسالة المستخدمة تُحفظ أولًا مهما حدث بعدها.
 *
 * العقد الحاكم:
 *   handling_mode = 'ai' والحالة ليست human_handling/closed → الذكاء يرد
 *   من المعرفة المعتمدة فقط، وإن لم يجد أو تعثر ← needs_human برسالة
 *   نظامية مهذبة. وبعد استلام الإدارة لا يرد الذكاء آليًا أبدًا.
 * تعطل الذكاء لا يُسقط الدعم: الرسالة محفوظة والتحويل يتم.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.SUPPORT_MODEL || 'claude-sonnet-5';
const MAX_LEN = 2000;
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 8;

const HANDOFF_MSG =
  'تم تحويل محادثتك إلى فريق الدعم في إدارة غراس، وسنرد عليك هنا في أقرب وقت 🌿';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** رد الذكاء من المعرفة المعتمدة — { answer, escalate } أو null عند التعطل. */
async function aiAnswer(
  history: { sender_type: string; content: string }[],
  userCtx: string
): Promise<{ answer: string; escalate: boolean } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const system = `أنت موظفة دعم أولي في «منصة غراس المعلم» التعليمية الكويتية.
قواعدك الصارمة:
- تجيبين فقط مما في «المعرفة المعتمدة» أدناه. أي سؤال خارجها أو لست متأكدة منه: escalate.
- لا تخترعين أسعارًا أو مددًا أو صلاحيات أو وعودًا إطلاقًا.
- لا تنفذين أي إجراء إداري (تغيير كلمة مرور، إضافة رصيد، تفعيل اشتراك، استرجاع مبلغ...) — تشرحين فقط، وأي طلب إجراء: escalate.
- مشاكل الدفع والمبالغ والشكاوى والحسابات الموقوفة والبيانات الحساسة: escalate دائمًا.
- ردك قصير وودود بالعربية، وبصيغة المؤنث لمخاطبة المعلمة.
- أجيبي بـJSON فقط: {"answer":"...","escalate":true|false} — عند escalate اجعلي answer جملة لطيفة تخبرها أن المحادثة تحولت لفريق الدعم.

«المعرفة المعتمدة»:
${SUPPORT_KNOWLEDGE}

${userCtx ? `«سياق المستخدمة الحالية (للقراءة فقط)»:\n${userCtx}` : ''}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system,
        messages: history.slice(-12).map((m) => ({
          role: m.sender_type === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');
    const slice = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(slice) as { answer?: string; escalate?: boolean };
    if (!parsed.answer) return null;
    return { answer: String(parsed.answer).slice(0, MAX_LEN), escalate: !!parsed.escalate };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  let body: { conversation_id?: string; content?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const content = String(body.content || '').trim();
  if (!content) return NextResponse.json({ error: 'EMPTY_MESSAGE' }, { status: 400 });
  if (content.length > MAX_LEN)
    return NextResponse.json({ error: 'MESSAGE_TOO_LONG' }, { status: 400 });

  // كابح خفيف: لا أكثر من BURST_MAX رسائل في الدقيقة (يُقاس من رسائلها الفعلية)
  const since = new Date(Date.now() - BURST_WINDOW_MS).toISOString();
  const { count: recent } = await supabase
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_user_id', user.id)
    .gte('created_at', since);
  if ((recent ?? 0) >= BURST_MAX)
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'رسائل كثيرة متتالية — لحظات ونكمل 🌿' },
      { status: 429 }
    );

  // المحادثة: قائمة أو جديدة (RLS تضمن الملكية)
  let convoId = body.conversation_id || null;
  type ConvoRow = { id: string; status: string; handling_mode: string };
  let convo: ConvoRow | null = null;

  if (convoId) {
    const { data } = await supabase
      .from('support_conversations')
      .select('id, status, handling_mode')
      .eq('id', convoId)
      .single();
    convo = data as ConvoRow | null;
    if (!convo) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (convo.status === 'closed')
      return NextResponse.json({ error: 'CONVERSATION_CLOSED' }, { status: 409 });
  } else {
    const title = String(body.title || content).slice(0, 60) || 'محادثة دعم';
    const { data, error } = await supabase
      .from('support_conversations')
      .insert({ user_id: user.id, title })
      .select('id, status, handling_mode')
      .single();
    if (error || !data)
      return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 });
    convo = data as unknown as ConvoRow;
    convoId = convo.id;
  }

  // ١) رسالة المستخدمة تُحفظ أولًا — قبل أي ذكاء
  const { error: msgErr } = await supabase.from('support_messages').insert({
    conversation_id: convoId,
    sender_type: 'user',
    sender_user_id: user.id,
    content,
  });
  if (msgErr) return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500 });

  const now = new Date().toISOString();
  {
    // الحقول الإدارية تُكتب بمفتاح الخدمة — صلاحية المتصفح user_seen_at فقط
    const svc0 = serviceClient();
    if (svc0) {
      await svc0
        .from('support_conversations')
        .update({ last_message_at: now, last_sender: 'user', user_seen_at: now })
        .eq('id', convoId);
    }
  }

  // ٢) هل يرد الذكاء؟ — بعد استلام الإدارة لا يرد أبدًا
  const aiAllowed = convo!.handling_mode === 'ai' && convo!.status !== 'human_handling';
  if (!aiAllowed) return NextResponse.json({ ok: true, conversation_id: convoId });

  const svc = serviceClient();
  const escalate = async () => {
    if (svc) {
      await svc.from('support_messages').insert({
        conversation_id: convoId,
        sender_type: 'system',
        content: HANDOFF_MSG,
      });
      await svc
        .from('support_conversations')
        .update({ status: 'needs_human', last_message_at: new Date().toISOString(), last_sender: 'system' })
        .eq('id', convoId);
    }
    // بلا مفتاح خدمة: الرسالة محفوظة والأدمِن يراها — التحويل الصريح يتعذر فقط
    return NextResponse.json({ ok: true, conversation_id: convoId, escalated: true });
  };

  // تحويل مباشر بلا اجتهاد للكلمات الحساسة
  const lc = content.toLowerCase();
  if (ESCALATE_HINTS.some((h) => lc.includes(h))) return escalate();

  // سياق قراءة فقط للمستخدمة نفسها — أعمدة محدودة بلا كائن خام للعميل
  let userCtx = '';
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, status, game_credits, sub_end, gharas_bank_until, clock_until, multiplication_until, studio_until')
      .eq('id', user.id)
      .single();
    if (prof) {
      const p = prof as Record<string, unknown>;
      const act = (k: string, n: string) =>
        p[k] && new Date(String(p[k])) > new Date() ? n : null;
      const subs = [
        act('sub_end', 'الألعاب التعليمية والمواد'),
        act('gharas_bank_until', 'بنك غراس'),
        act('clock_until', 'الساعة التفاعلية'),
        act('multiplication_until', 'جدول الضرب'),
        act('studio_until', 'الاستوديو'),
      ].filter(Boolean);
      userCtx = `الاسم: ${p.full_name ?? '—'} · حالة الحساب: ${p.status} · رصيد الألعاب: ${p.game_credits ?? 0} · الاشتراكات السارية: ${subs.join('، ') || 'لا شيء'}`;
    }
  } catch {
    /* السياق كماليّ — غيابه لا يمنع الرد */
  }

  const { data: history } = await supabase
    .from('support_messages')
    .select('sender_type, content')
    .eq('conversation_id', convoId)
    .order('created_at', { ascending: true })
    .limit(30);

  const ai = await aiAnswer(history || [{ sender_type: 'user', content }], userCtx);
  if (!ai) return escalate(); // تعطل الذكاء ≠ تعطل الدعم

  if (ai.escalate) {
    if (svc) {
      await svc.from('support_messages').insert({
        conversation_id: convoId,
        sender_type: 'ai',
        content: ai.answer || HANDOFF_MSG,
      });
    }
    return escalate();
  }

  if (svc) {
    await svc.from('support_messages').insert({
      conversation_id: convoId,
      sender_type: 'ai',
      content: ai.answer,
    });
    await svc
      .from('support_conversations')
      .update({ last_message_at: new Date().toISOString(), last_sender: 'ai' })
      .eq('id', convoId);
  }
  return NextResponse.json({ ok: true, conversation_id: convoId });
}
