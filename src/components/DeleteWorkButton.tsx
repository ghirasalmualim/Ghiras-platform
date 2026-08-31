'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * زرّ «حذف العمل» للألعاب المحفوظة في «أعمالي».
 * حذفٌ ناعمٌ فقط (نقلٌ للسلة ٣٠ يومًا) — لا يحذف نهائيًّا. بتأكيد.
 */
export default function DeleteWorkButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (busy) return;
    if (!confirm('حذف هذا العمل؟ ينتقل إلى المحذوفات ٣٠ يومًا، ويمكنك استعادته.')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saved-games?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) router.refresh();
    } catch {
      /* لا شيء — لا حذف صلب هنا */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="text-xs font-bold text-red-600/80 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      حذف العمل
    </button>
  );
}
