'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * لوحة رئيسة الشعبة لإدارة «مشاركة الملفات»: تضيف معلمة (بالاسم المستخدم/الإيميل)،
 * تشوف مرفوعات كل معلمة، وتُلغي المشاركة. القاعدة هي الحكم (RLS + head_share_add).
 */

const DISP = { fontFamily: "var(--font-cairo), 'Tajawal', sans-serif" } as const;

type ShareFile = {
  id: string;
  title: string | null;
  file_name: string | null;
  mime: string | null;
  created_at: string;
  url: string | null;
};
type Share = {
  id: string;
  teacherLabel: string | null;
  headLabel: string | null;
  requested: string[];
  files: ShareFile[];
};

export default function HeadSharesApp({ firstName }: { firstName: string }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [login, setLogin] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2600);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/head-shares?as=head', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setShares(json.shares || []);
    } catch {
      setErr(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submitAdd = async () => {
    setMsg('');
    if (!login.trim()) {
      setMsg('اكتبي اسم المستخدم أو الإيميل');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/head-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', login: login.trim(), label: label.trim() }),
      });
      const json = await res.json();
      if (json.result === 'added') {
        setLogin('');
        setLabel('');
        setAdding(false);
        showToast('تمت المشاركة ✅');
        load();
      } else if (json.result === 'not_found') {
        setMsg('ما لقينا حساب بهذا الاسم/الإيميل. لازم المعلمة تسجّل في غراس أول.');
      } else if (json.result === 'self') {
        setMsg('هذا حسابك انتِ 🙂');
      } else if (json.error === 'forbidden') {
        setMsg('اشتراك «سجلات رئيس الشعبة» غير سارٍ.');
      } else {
        setMsg('تعذّرت المشاركة، حاولي مرة ثانية.');
      }
    } catch {
      setMsg('تعذّرت المشاركة، حاولي مرة ثانية.');
    }
    setBusy(false);
  };

  const revoke = async (share: Share) => {
    if (!window.confirm(`إلغاء المشاركة مع «${share.teacherLabel || 'المعلمة'}»؟ سيُحذف ما رفعته.`)) return;
    setShares((s) => (s || []).filter((x) => x.id !== share.id));
    try {
      await fetch('/api/head-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', shareId: share.id }),
      });
    } catch {
      showToast('تعذّر الإلغاء');
      load();
    }
  };

  const copyLink = async () => {
    const link = `${window.location.origin}/my-file`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('تم نسخ الرابط ✅ أرسليه للمعلمة');
    } catch {
      // متصفّحات قديمة / سياق غير آمن — طريقة بديلة
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('تم نسخ الرابط ✅ أرسليه للمعلمة');
      } catch {
        window.prompt('انسخي هذا الرابط وأرسليه للمعلمة:', link);
      }
      document.body.removeChild(ta);
    }
  };

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <main dir="rtl" className="min-h-dvh bg-cream" style={DISP}>
      <header className="bg-white border-b border-sage/15 px-4 py-3 flex items-center gap-3">
        <Link href="/teacher" className="rounded-xl border border-sage/30 text-sage-deep font-bold text-sm px-3 py-2">
          → رجوع
        </Link>
        <div className="flex-1">
          <div className="font-extrabold text-sage-deep leading-tight">مشاركة الملفات</div>
          <div className="text-[12px] text-ink/55">شاركي كل معلمة صفحتها لترفع صورها وأوراقها</div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4 space-y-4">
        {/* رابط صفحة المعلمة — واحد لكل المعلمات */}
        <div className="rounded-2xl bg-sage-light/40 border border-sage/15 p-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[12.5px] font-bold text-sage-deep">رابط صفحة المعلمة</div>
            <div className="text-[11.5px] text-ink/55 leading-relaxed">أرسليه لأي معلمة شاركتِها — كل وحدة تدخل بحسابها وتشوف صفحتها فقط.</div>
          </div>
          <button onClick={copyLink} className="shrink-0 rounded-xl bg-sage-deep text-white font-bold text-[12.5px] px-4 py-2.5 shadow-soft">
            📋 نسخ الرابط
          </button>
        </div>

        {/* إضافة معلمة */}
        {adding ? (
          <div className="card-3d bg-white rounded-2xl p-4 space-y-3">
            <div className="font-bold text-sage-deep">مشاركة مع معلمة</div>
            <div>
              <label className="block text-[12px] font-bold text-sage-deep mb-1">اسم المستخدم أو الإيميل</label>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="اسم المستخدم أو name@example.com"
                className="w-full rounded-soft border border-sage/25 bg-white p-2.5 text-sm focus:outline-none focus:border-sage"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-sage-deep mb-1">اسم المعلمة (كما يظهر لك)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="مثال: أسماء"
                className="w-full rounded-soft border border-sage/25 bg-white p-2.5 text-sm focus:outline-none focus:border-sage"
              />
            </div>
            {msg ? <div className="text-[12.5px] text-red-600 font-bold">{msg}</div> : null}
            <div className="flex gap-2">
              <button
                onClick={submitAdd}
                disabled={busy}
                className="rounded-xl bg-sage-deep text-white font-bold text-sm px-4 py-2.5 disabled:opacity-50"
              >
                {busy ? '…' : 'مشاركة'}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setMsg('');
                }}
                className="rounded-xl border border-sage/25 text-sage-deep font-bold text-sm px-4 py-2.5"
              >
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-2xl bg-sage-deep text-white font-extrabold text-sm py-3 shadow-soft"
          >
            ＋ مشاركة مع معلمة
          </button>
        )}

        {/* القائمة */}
        {err ? (
          <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/70">تعذّر التحميل. جرّبي إعادة التحميل.</div>
        ) : shares === null ? (
          <div className="text-center text-ink/50 py-12">…جارٍ التحميل</div>
        ) : shares.length === 0 ? (
          <div className="card-3d bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">🤝</div>
            <div className="font-extrabold text-sage-deep mb-1">ما شاركتِ أي معلمة بعد</div>
            <div className="text-[13px] text-ink/60">اضغطي «مشاركة مع معلمة» وابدئي.</div>
          </div>
        ) : (
          shares.map((sh) => (
            <section key={sh.id} className="card-3d bg-white rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-sage-deep font-bold">
                  {(sh.teacherLabel || '؟').slice(0, 1)}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-ink">{sh.teacherLabel || 'معلمة'}</div>
                  <div className="text-[12px] text-ink/55">{sh.files.length ? `${sh.files.length} ملف مرفوع` : 'بانتظار الرفع'}</div>
                </div>
                <button onClick={() => toggle(sh.id)} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">
                  {open.has(sh.id) ? 'إخفاء' : 'عرض'}
                </button>
                <button onClick={() => revoke(sh)} className="rounded-lg border border-red-200 text-red-500 text-[12px] font-bold px-3 py-1.5">
                  إلغاء
                </button>
              </div>

              {open.has(sh.id) ? (
                <div className="mt-3 pt-3 border-t border-sage/10">
                  {sh.files.length === 0 ? (
                    <div className="text-[12.5px] text-ink/40 py-2">ما رفعت المعلمة أي شيء بعد.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sh.files.map((f) => (
                        <a
                          key={f.id}
                          href={f.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                          title={`${f.title || ''}${f.file_name ? ' — ' + f.file_name : ''}`}
                        >
                          {f.mime === 'application/pdf' ? (
                            <div className="w-24 h-24 rounded-lg bg-sage-light/40 border border-sage/20 flex flex-col items-center justify-center text-[10px] text-sage-deep font-bold p-1 text-center">
                              <span className="text-lg" aria-hidden="true">📄</span>
                              <span className="truncate w-full">{f.title || f.file_name || 'ملف'}</span>
                            </div>
                          ) : (
                            <div className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={f.url || ''}
                                alt={f.title || ''}
                                className="w-24 h-24 object-cover rounded-lg border border-sage/20 bg-sage-light/20"
                              />
                              {f.title ? (
                                <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9.5px] px-1 py-0.5 rounded-b-lg truncate">
                                  {f.title}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>

      {toast ? (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-50 px-4">
          <div className="bg-sage-deep text-white text-[13px] font-bold rounded-full px-5 py-2.5 shadow-soft">{toast}</div>
        </div>
      ) : null}
    </main>
  );
}
