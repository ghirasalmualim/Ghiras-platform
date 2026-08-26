'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient } from '@/lib/supabase/client';

/**
 * 💬 تواصل معنا — دعم داخل المنصة.
 * القراءة عبر جلسة المستخدمة (RLS تعزلها بمحادثاتها)، والإرسال عبر
 * /api/support/send حيث يرد الذكاء أو تُحوَّل للإدارة. تحديث دوري
 * خفيف بدل بنية realtime — يكفي للدعم.
 */

type Convo = {
  id: string;
  title: string;
  status: string;
  last_sender: string;
  user_seen_at: string;
  last_message_at: string;
};
type Msg = { id: string; sender_type: string; content: string; created_at: string };

const STATUS_AR: Record<string, string> = {
  open: 'مفتوحة',
  needs_human: 'لدى فريق الدعم',
  human_handling: 'تتابعها الإدارة',
  closed: 'مغلقة',
};
const SENDER_AR: Record<string, string> = {
  user: 'أنت',
  ai: 'مساعد غراس',
  admin: 'إدارة غراس',
  system: 'النظام',
};

export default function SupportPage() {
  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [open, setOpen] = useState<Convo | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAuthed(false); return; }
    setAuthed(true);
    const { data } = await supabase
      .from('support_conversations')
      .select('id, title, status, last_sender, user_seen_at, last_message_at')
      .order('last_message_at', { ascending: false })
      .limit(50);
    setConvos((data as Convo[]) || []);
  }, []);

  const loadMsgs = useCallback(async (id: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('support_messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    setMsgs((data as Msg[]) || []);
  }, []);

  useEffect(() => { void loadConvos(); }, [loadConvos]);

  // تحديث دوري خفيف للمحادثة المفتوحة
  useEffect(() => {
    if (!open || !open.id) return;
    void loadMsgs(open.id);
    void fetch('/api/support/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, action: 'seen' }),
    });
    const t = setInterval(() => { void loadMsgs(open.id); }, 8000);
    return () => clearInterval(t);
  }, [open, loadMsgs]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/support/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: open?.id, content }),
      });
      const j = await res.json();
      if (res.ok && j.conversation_id) {
        setText('');
        if (!open || !open.id) {
          await loadConvos();
          setOpen({ id: j.conversation_id, title: content.slice(0, 60), status: 'open', last_sender: 'user', user_seen_at: '', last_message_at: '' });
        } else {
          await loadMsgs(open.id);
        }
      } else if (j.message) {
        alert(j.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const closeConvo = async () => {
    if (!open) return;
    if (!confirm('إغلاق المحادثة؟ تقدرين تفتحين محادثة جديدة متى شئت.')) return;
    await fetch('/api/support/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: open.id, action: 'close' }),
    });
    setOpen(null);
    await loadConvos();
  };

  const unread = (c: Convo) =>
    c.last_sender !== 'user' && c.user_seen_at < c.last_message_at;

  if (authed === false) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
        <Logo size={72} />
        <p className="mt-4 font-bold text-ink/70">سجّلي دخولك أولًا لفتح الدعم</p>
        <Link href="/login?next=/support" className="mt-4 rounded-xl bg-sage text-white font-extrabold px-6 py-3">تسجيل الدخول</Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh max-w-2xl mx-auto px-4 py-6 flex flex-col">
      <header className="flex items-center justify-between">
        <Link href="/" className="rounded-xl border border-sage/40 bg-white text-sage-deep font-extrabold text-sm px-4 py-2">← منصة غراس</Link>
        <h1 className="text-xl font-black text-sage-deep">💬 تواصل معنا</h1>
      </header>

      {!open ? (
        <section className="mt-5 flex-1">
          <button
            onClick={() => { setMsgs([]); setText(''); setOpen({ id: '', title: 'محادثة جديدة', status: 'open', last_sender: 'user', user_seen_at: '', last_message_at: '' }); }}
            className="w-full rounded-2xl bg-sage hover:bg-sage-dark text-white font-extrabold px-6 py-4 shadow-soft transition-all"
          >
            ＋ محادثة جديدة
          </button>

          <div className="mt-5 space-y-3">
            {convos === null && <p className="text-center text-ink/50 font-bold">جارِ التحميل…</p>}
            {convos?.length === 0 && (
              <p className="text-center text-ink/50 font-bold mt-8">ما عندك محادثات بعد — اكتبي سؤالك ونساعدك 🌿</p>
            )}
            {convos?.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpen(c)}
                className="w-full text-right rounded-2xl border border-sage/25 bg-white hover:border-sage px-5 py-4 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <b className="text-ink truncate">{c.title}</b>
                  <span className="flex items-center gap-2 shrink-0">
                    {unread(c) && <i className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" aria-label="رد جديد" />}
                    <span className={`text-xs font-extrabold rounded-full px-2.5 py-1 ${c.status === 'closed' ? 'bg-ink/10 text-ink/50' : c.status === 'open' ? 'bg-sage/15 text-sage-deep' : 'bg-amber-100 text-amber-800'}`}>
                      {STATUS_AR[c.status] || c.status}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink/45 font-semibold">
                  آخر رد: {SENDER_AR[c.last_sender] || c.last_sender} · {new Date(c.last_message_at).toLocaleString('ar-KW')}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => { setOpen(null); void loadConvos(); }} className="text-sage-deep font-extrabold text-sm">→ محادثاتي</button>
            {open.id && open.status !== 'closed' && (
              <button onClick={closeConvo} className="text-red-600 font-extrabold text-sm">إغلاق المحادثة</button>
            )}
          </div>

          <div className="mt-3 flex-1 rounded-2xl border border-sage/25 bg-white p-4 overflow-y-auto min-h-[45dvh] max-h-[62dvh] space-y-3">
            {msgs.length === 0 && open.id === '' && (
              <p className="text-ink/50 font-bold text-sm leading-relaxed">
                اكتبي سؤالك أو مشكلتك وبنساعدك فورًا — وإذا احتاج الموضوع الإدارة نحوّله لهم مباشرة 🌿
              </p>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.sender_type === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-semibold leading-relaxed whitespace-pre-wrap ${
                  m.sender_type === 'user' ? 'bg-sage text-white'
                  : m.sender_type === 'admin' ? 'bg-amber-50 border border-amber-200 text-ink'
                  : m.sender_type === 'system' ? 'bg-ink/5 text-ink/60'
                  : 'bg-sage/10 text-ink'
                }`}>
                  <div className="text-[10px] font-extrabold opacity-60 mb-0.5">{SENDER_AR[m.sender_type]}</div>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {open.status !== 'closed' ? (
            <div className="mt-3 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
                maxLength={2000}
                placeholder="اكتبي رسالتك…"
                className="flex-1 rounded-xl border border-sage/30 px-4 py-3 font-semibold focus:outline-none focus:border-sage"
              />
              <button onClick={() => void send()} disabled={busy || !text.trim()}
                className="rounded-xl bg-sage hover:bg-sage-dark disabled:opacity-40 text-white font-extrabold px-5">
                {busy ? '…' : 'إرسال'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-center text-ink/50 font-bold text-sm">محادثة مغلقة — افتحي محادثة جديدة إذا احتجتِ</p>
          )}
        </section>
      )}
    </main>
  );
}
