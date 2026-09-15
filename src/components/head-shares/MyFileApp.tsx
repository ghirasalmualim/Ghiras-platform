'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * «ملفّي» — صفحة المعلمة المُشارَكة. تعرض مشاركاتها هي فقط (RLS في القاعدة يضمن ذلك)،
 * وترفع صورًا/ملفات (PDF) بمسمّيات حرة، وتحذف ما ترفعه. لا اشتراك مطلوب.
 */

const DISP = { fontFamily: "var(--font-cairo), 'Tajawal', sans-serif" } as const;

type ShareFile = {
  id: string;
  title: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
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

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  let { width: w, height: h } = img;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
const toDataURL = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

/** ترتيب البنود: المطلوبة أولًا، ثم أي عناوين ملفات إضافية، ثم «بدون عنوان». */
function groupsOf(share: Share, extra: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string) => {
    const k = t.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  share.requested.forEach(add);
  extra.forEach(add);
  share.files.forEach((f) => add(f.title || ''));
  if (share.files.some((f) => !(f.title || '').trim())) out.push('');
  return out;
}

export default function MyFileApp({ firstName }: { firstName: string }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [extraTitles, setExtraTitles] = useState<Record<string, string[]>>({}); // بنود أضافتها المعلمة محليًّا
  const fileRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<{ shareId: string; title: string } | null>(null);

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2600);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/head-shares?as=teacher', { cache: 'no-store' });
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

  const pick = (shareId: string, title: string) => {
    ctxRef.current = { shareId, title };
    fileRef.current?.click();
  };

  const onFiles = async (files: FileList | null) => {
    const ctx = ctxRef.current;
    if (!files || !files.length || !ctx) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        let dataUrl: string;
        if (file.type.startsWith('image/')) dataUrl = await compressImage(file);
        else if (file.type === 'application/pdf') dataUrl = await toDataURL(file);
        else {
          showToast('يُقبل الصور و PDF فقط');
          continue;
        }
        const res = await fetch('/api/head-shares', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload', shareId: ctx.shareId, title: ctx.title, dataUrl, fileName: file.name }),
        });
        const json = await res.json();
        if (json.file) {
          setShares((s) =>
            (s || []).map((sh) => (sh.id === ctx.shareId ? { ...sh, files: [...sh.files, json.file] } : sh))
          );
        } else if (json.error === 'too_large') {
          showToast('الملف كبير — أقصى ٨ ميجا');
        } else {
          showToast('تعذّر الرفع، حاولي مرة ثانية');
        }
      } catch {
        showToast('تعذّر الرفع، حاولي مرة ثانية');
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const del = async (shareId: string, fileId: string) => {
    setShares((s) => (s || []).map((sh) => (sh.id === shareId ? { ...sh, files: sh.files.filter((f) => f.id !== fileId) } : sh)));
    try {
      await fetch('/api/head-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteFile', fileId }),
      });
    } catch {
      showToast('تعذّر الحذف');
      load();
    }
  };

  const addItem = (shareId: string) => {
    const t = window.prompt('اسم البند (مثلاً: ورقة المتفوقين والضعاف)');
    if (!t || !t.trim()) return;
    setExtraTitles((m) => ({ ...m, [shareId]: [...(m[shareId] || []), t.trim()] }));
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-cream" style={DISP}>
      {/* الترويسة */}
      <header className="bg-white border-b border-sage/15 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center text-sage-deep font-black">
          <span aria-hidden="true">🌿</span>
        </div>
        <div className="flex-1">
          <div className="font-extrabold text-sage-deep leading-tight">ملفّي</div>
          <div className="text-[12px] text-ink/55">
            {firstName ? <span>مرحبًا {firstName} — </span> : null}صفحتك الخاصة لرفع صورك وأوراقك
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4 space-y-4">
        {err ? (
          <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/70">
            تعذّر تحميل صفحتك. جرّبي إعادة التحميل.
          </div>
        ) : shares === null ? (
          <div className="text-center text-ink/50 py-16">…جارٍ التحميل</div>
        ) : shares.length === 0 ? (
          <div className="card-3d bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">📄</div>
            <div className="font-extrabold text-sage-deep mb-1">ما فيه صفحة مشاركة معك بعد</div>
            <div className="text-[13px] text-ink/60 leading-relaxed">
              لما تشاركك رئيسة الشعبة، بتلقين هنا اسمك والبنود المطلوبة منك لترفعي صورك وأوراقك.
            </div>
          </div>
        ) : (
          shares.map((sh) => {
            const groups = groupsOf(sh, extraTitles[sh.id] || []);
            return (
              <section key={sh.id} className="card-3d bg-white rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-sage/10">
                  <div className="w-8 h-8 rounded-full bg-sage-light flex items-center justify-center text-sage-deep font-bold text-sm">
                    {(sh.teacherLabel || firstName || '؟').slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-ink">{sh.teacherLabel || firstName || 'صفحتي'}</div>
                    {sh.headLabel ? <div className="text-[11.5px] text-ink/50">مشاركة من: {sh.headLabel}</div> : null}
                  </div>
                </div>

                <div className="space-y-3">
                  {groups.map((title) => {
                    const gfiles = sh.files.filter((f) => (f.title || '').trim() === title);
                    return (
                      <div key={title || '__none'} className="rounded-xl border border-sage/15 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-[13.5px] text-sage-deep">{title || 'ملفات أخرى'}</div>
                          <button
                            onClick={() => pick(sh.id, title)}
                            disabled={busy}
                            className="rounded-lg bg-sage-deep text-white text-[12px] font-bold px-3 py-1.5 disabled:opacity-50"
                          >
                            ＋ رفع
                          </button>
                        </div>
                        {gfiles.length ? (
                          <div className="flex flex-wrap gap-2">
                            {gfiles.map((f) => (
                              <div key={f.id} className="relative">
                                {f.mime === 'application/pdf' ? (
                                  <a
                                    href={f.url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-20 h-20 rounded-lg bg-sage-light/40 border border-sage/20 flex flex-col items-center justify-center text-[10px] text-sage-deep font-bold p-1 text-center"
                                  >
                                    <span className="text-lg" aria-hidden="true">📄</span>
                                    <span className="truncate w-full">{f.file_name || 'ملف'}</span>
                                  </a>
                                ) : (
                                  <a href={f.url || '#'} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={f.url || ''}
                                      alt={f.title || ''}
                                      className="w-20 h-20 object-cover rounded-lg border border-sage/20 bg-sage-light/20"
                                    />
                                  </a>
                                )}
                                <button
                                  onClick={() => del(sh.id, f.id)}
                                  aria-label="حذف"
                                  className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white border border-red-200 text-red-500 text-xs font-bold shadow-sm flex items-center justify-center"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[12px] text-ink/35 py-2">— ما رفعتِ شيء بعد —</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => addItem(sh.id)}
                  className="mt-3 w-full rounded-xl border border-dashed border-sage/40 text-sage-deep font-bold text-[13px] py-2.5"
                >
                  ＋ إضافة بند جديد
                </button>
              </section>
            );
          })
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {busy ? (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-4 font-bold text-sage-deep shadow-soft">…جارٍ الرفع</div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-50 px-4">
          <div className="bg-sage-deep text-white text-[13px] font-bold rounded-full px-5 py-2.5 shadow-soft">{toast}</div>
        </div>
      ) : null}
    </main>
  );
}
