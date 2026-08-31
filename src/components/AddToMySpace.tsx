'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WsItemType } from '@/lib/workspace-items';

/**
 * زرّ «أضف إلى مساحتي / إزالة من مساحتي» — مكوّنٌ واحدٌ يُعاد استخدامه.
 * idempotent، يعكس الحالة، ولا يغيّر أيّ اشتراكٍ أو وصولٍ ولا يحذف محتوى.
 * إن لم يُمرَّر initialPinned، يستعلم مرّةً ليعرف إن كان العنصر مثبّتًا.
 */
export default function AddToMySpace({
  itemType,
  itemKey,
  label,
  context,
  initialPinned,
  className = '',
}: {
  itemType: WsItemType;
  itemKey: string;
  label: string;
  context?: string;
  initialPinned?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pinned, setPinned] = useState<boolean | null>(
    initialPinned === undefined ? null : initialPinned
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialPinned !== undefined) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/workspace-items', { headers: { Accept: 'application/json' } });
        if (!r.ok) { if (alive) setPinned(false); return; }
        const j = await r.json();
        const found = Array.isArray(j.items)
          && j.items.some((it: { item_type: string; item_key: string }) =>
            it.item_type === itemType && it.item_key === itemKey);
        if (alive) setPinned(Boolean(found));
      } catch {
        if (alive) setPinned(false);
      }
    })();
    return () => { alive = false; };
  }, [initialPinned, itemType, itemKey]);

  const toggle = useCallback(async () => {
    if (busy || pinned === null) return;
    setBusy(true);
    try {
      if (pinned) {
        const r = await fetch(
          `/api/workspace-items?item_type=${encodeURIComponent(itemType)}&item_key=${encodeURIComponent(itemKey)}`,
          { method: 'DELETE' }
        );
        if (r.ok) { setPinned(false); router.refresh(); }
      } else {
        const r = await fetch('/api/workspace-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_type: itemType, item_key: itemKey, label, context }),
        });
        if (r.ok) { setPinned(true); router.refresh(); }
      }
    } catch {
      /* تجاهُلٌ صامت — لا يغيّر مصدرًا ولا اشتراكًا */
    } finally {
      setBusy(false);
    }
  }, [busy, pinned, itemType, itemKey, label, context, router]);

  const base =
    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50';
  const tone = pinned
    ? 'border-sage/40 bg-sage/10 text-sage-dark hover:border-sage'
    : 'border-ink/15 text-ink/60 hover:border-sage hover:text-sage-deep';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || pinned === null}
      aria-pressed={pinned === true}
      className={`${base} ${tone} ${className}`}
    >
      {pinned === null ? '…' : pinned ? 'إزالة من مساحتي' : '＋ أضف إلى مساحتي'}
    </button>
  );
}
