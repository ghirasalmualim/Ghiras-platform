'use client';
/**
 * غراس للمحاسبة — Stage 11: مستنداتي — الالتقاط عبر مسار Stage 8
 * القائم (idempotent، الخادم سلطة البصمة)، وكل مستند يعرض «وش قرينا
 * منه» (يدوي فقط اليوم — لا AI قبل Stage 13) و«وش صار عليه».
 * ?attach_to=<exception> يكمل استثناء «بلا ورقة إثبات» بعد الرفع
 * عبر الربط المحكوم + إثبات الشفاء.
 */
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyNote, ownerFetch, ownerPost, t, useOwner } from '../owner-client';

interface DocRow {
  id: string; docType: string; filename: string; state: string;
  pageCount: number | null; capturedAt: string;
  extracted: Record<string, unknown> | null;
  extractionSource: string | null;
  links: { kindLabelKey: string; role: string }[];
}

function MustanadatiInner() {
  const { company } = useOwner();
  const router = useRouter();
  const attachTo = useSearchParams().get('attach_to');
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const res = await ownerFetch('documents', company.id);
      if (!res.ok) { setError(true); return; }
      setDocs((await res.json()).documents);
      setError(false);
    } catch { setError(true); }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const upload = useCallback(async (files: FileList) => {
    if (!company || files.length === 0) return;
    setBusy(true); setNote(null);
    try {
      const form = new FormData();
      form.set('company_id', company.id);
      form.set('capture_id', crypto.randomUUID());
      form.set('doc_type', 'RECEIPT');
      form.set('source', 'FILE_UPLOAD');
      for (const f of Array.from(files)) form.append('pages', f);
      const res = await fetch('/api/accounting/documents/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.status !== 'synced') {
        setNote(t('ERROR_GENERIC'));
        return;
      }
      // إن جينا من استثناء «بلا ورقة»: الربط المحكوم ثم الإغلاق بإثبات
      if (attachTo) {
        const act = await ownerPost('inbox/action', {
          company_id: company.id, exception_id: attachTo,
          action: 'attach_document', document_id: data.document,
        });
        if (act.ok) {
          router.replace('/owner');
          return;
        }
        setNote(t('ERROR_GENERIC'));
      }
      await load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [company, attachTo, router, load]);

  if (!company) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-cairo text-xl font-extrabold">{t('SECTION_DOCS')}</h1>
        <button disabled={busy} onClick={() => fileRef.current?.click()} data-action="capture"
          className="rounded-xl bg-sage px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {t('DOCS_CAPTURE')}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={(e) => e.target.files && upload(e.target.files)} />
      {attachTo && (
        <p className="mb-3 rounded-xl bg-gold-light px-3 py-2 text-xs text-gold-dark">
          {t('EXC_ATTACH_DOC')} — {t('EXC_MISSING_DOC_WHY')}
        </p>
      )}
      {note && <p className="mb-3 rounded-xl bg-sage-light px-3 py-2 text-xs">{note}</p>}
      {error && <EmptyNote vkey="ERROR_GENERIC" />}
      {docs === null && !error && <EmptyNote vkey="LOADING" />}
      {docs !== null && docs.length === 0 && <EmptyNote vkey="DOCS_EMPTY" />}
      <ul className="space-y-2">
        {(docs ?? []).map((d) => (
          <li key={d.id} className="card-3d p-3" data-document={d.id}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{d.filename || d.docType}</p>
              <p className="text-[11px] text-ink/50">{d.capturedAt?.slice(0, 10)}</p>
            </div>
            <div className="mt-1 text-[11px] text-ink/60">
              <span className="font-semibold">{t('DOCS_WHAT_READ')}: </span>
              {d.extracted
                ? Object.entries(d.extracted).slice(0, 4)
                    .map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-ink/60">
              <span className="font-semibold">{t('DOCS_WHAT_HAPPENED')}: </span>
              {d.links.length === 0
                ? t('DOCS_NOT_LINKED')
                : d.links.map((l, i) => (
                    <span key={i}>{i > 0 ? ' · ' : ''}{t(l.kindLabelKey as never)}</span>
                  ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MustanadatiPage() {
  return (
    <Suspense fallback={<EmptyNote vkey="LOADING" />}>
      <MustanadatiInner />
    </Suspense>
  );
}
