'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * 📥 صندوق دعم الإدارة — RLS تتيح للأدمِن رؤية الكل، والأفعال عبر
 * /api/support/state. «استلام المحادثة» يسكت الذكاء عنها نهائيًا حتى
 * تعاد للوضع الآلي بزر صريح.
 */

type Convo = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  handling_mode: string;
  last_sender: string;
  last_message_at: string;
};
type Msg = { id: string; sender_type: string; content: string; created_at: string };

const FILTERS = [
  { key: 'attention', label: 'تحتاج الإدارة' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'human', label: 'تحت المتابعة' },
  { key: 'closed', label: 'مغلقة' },
  { key: 'all', label: 'الكل' },
] as const;

const SENDER_AR: Record<string, string> = {
  user: 'المستخدمة', ai: 'الذكاء', admin: 'الإدارة', system: 'النظام',
};

export default function AdminSupportInbox() {
  const [filter, setFilter] = useState<string>('attention');
  const [convos, setConvos] = useState<Convo[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Convo | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let q = supabase
      .from('support_conversations')
      .select('id, user_id, title, status, handling_mode, last_sender, last_message_at')
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (filter === 'attention') q = q.in('status', ['needs_human']).neq('status', 'closed');
    if (filter === 'open') q = q.eq('status', 'open');
    if (filter === 'human') q = q.eq('status', 'human_handling');
    if (filter === 'closed') q = q.eq('status', 'closed');
    const { data } = await q;
    const list = (data as Convo[]) || [];
    setConvos(list);
    const ids = Array.from(new Set(list.map((c) => c.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      const map: Record<string, string> = {};
      (profs as { id: string; full_name?: string }[] | null)?.forEach((p) => {
        map[p.id] = p.full_name || '—';
      });
      setNames(map);
    }
  }, [filter]);

  const loadMsgs = useCallback(async (id: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('support_messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(300);
    setMsgs((data as Msg[]) || []);
  }, []);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const ch = supabase
      .channel('support-admin-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    void loadMsgs(open.id);
    const supabase = createClient();
    const channel = supabase
      .channel(`support-admin-${open.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${open.id}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();
    const t = setInterval(() => { void loadMsgs(open.id); }, 20000);
    return () => { clearInterval(t); void supabase.removeChannel(channel); };
  }, [open, loadMsgs]);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [msgs]);

  const act = async (action: string, content?: string) => {
    if (!open || busy) return;
    setBusy(true);
    try {
      await fetch('/api/support/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: open.id, action, content }),
      });
      await loadMsgs(open.id);
      await load();
      const fresh = (await createClient()
        .from('support_conversations')
        .select('id, user_id, title, status, handling_mode, last_sender, last_message_at')
        .eq('id', open.id)
        .single()).data as Convo | null;
      if (fresh) setOpen(fresh);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh max-w-3xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/admin" className="rounded-xl border border-sage/40 bg-white text-sage-deep font-extrabold text-sm px-4 py-2">← لوحة الإدارة</Link>
        <h1 className="text-xl font-black text-sage-deep">📥 رسائل الدعم</h1>
      </header>

      {!open ? (
        <>
          <div className="mt-4 flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-extrabold border transition ${filter === f.key ? 'bg-sage text-white border-sage' : 'bg-white text-ink/60 border-sage/25'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {convos.length === 0 && <p className="text-center text-ink/50 font-bold mt-8">لا محادثات هنا 🌿</p>}
            {convos.map((c) => (
              <button key={c.id} onClick={() => setOpen(c)}
                className="w-full text-right rounded-2xl border border-sage/25 bg-white hover:border-sage px-5 py-4 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-ink truncate">{names[c.user_id] || '…'} — {c.title}</b>
                  <span className="flex items-center gap-2 shrink-0 text-xs font-extrabold">
                    {c.last_sender === 'user' && c.status !== 'closed' && (
                      <span className="text-red-600">بانتظار رد</span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 ${c.status === 'closed' ? 'bg-ink/10 text-ink/50' : c.status === 'needs_human' ? 'bg-red-100 text-red-700' : c.status === 'human_handling' ? 'bg-amber-100 text-amber-800' : 'bg-sage/15 text-sage-deep'}`}>
                      {c.status === 'needs_human' ? 'تحتاج الإدارة' : c.status === 'human_handling' ? 'تحت المتابعة' : c.status === 'closed' ? 'مغلقة' : 'مفتوحة'}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink/45 font-semibold">
                  آخر رد: {SENDER_AR[c.last_sender]} · {new Date(c.last_message_at).toLocaleString('ar-KW')} · الوضع: {c.handling_mode === 'ai' ? 'ذكاء' : 'إدارة'}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <section className="mt-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={() => { setOpen(null); void load(); }} className="text-sage-deep font-extrabold text-sm">→ الصندوق</button>
            <div className="flex gap-2 flex-wrap">
              {open.handling_mode === 'ai' ? (
                <button disabled={busy} onClick={() => act('takeover')} className="rounded-xl bg-amber-500 text-white font-extrabold text-sm px-4 py-2">استلام المحادثة</button>
              ) : (
                <button disabled={busy} onClick={() => act('reactivate_ai')} className="rounded-xl border border-sage text-sage-deep font-extrabold text-sm px-4 py-2">إعادة الرد الآلي</button>
              )}
              {open.status !== 'closed' && (
                <button disabled={busy} onClick={() => act('close')} className="rounded-xl border border-red-300 text-red-600 font-extrabold text-sm px-4 py-2">إغلاق</button>
              )}
            </div>
          </div>

          <p className="mt-2 text-xs text-ink/50 font-bold">
            {names[open.user_id] || '—'} · الوضع الحالي: {open.handling_mode === 'ai' ? '🤖 الذكاء يرد' : '🧑‍💼 الإدارة تتابع — الذكاء صامت'}
          </p>

          <div className="mt-3 rounded-2xl border border-sage/25 bg-white p-4 overflow-y-auto min-h-[45dvh] max-h-[60dvh] space-y-3">
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.sender_type === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-semibold leading-relaxed whitespace-pre-wrap ${
                  m.sender_type === 'user' ? 'bg-ink/5 text-ink'
                  : m.sender_type === 'admin' ? 'bg-sage text-white'
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

          {open.status !== 'closed' && (
            <div className="mt-3 flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { void act('reply', text.trim()); setText(''); } }}
                maxLength={2000} placeholder="ردّ الإدارة…"
                className="flex-1 rounded-xl border border-sage/30 px-4 py-3 font-semibold focus:outline-none focus:border-sage" />
              <button disabled={busy || !text.trim()}
                onClick={() => { const t = text.trim(); setText(''); void act('reply', t); }}
                className="rounded-xl bg-sage hover:bg-sage-dark disabled:opacity-40 text-white font-extrabold px-5">
                إرسال
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
