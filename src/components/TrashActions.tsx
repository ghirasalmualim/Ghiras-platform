'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * أزرار عنصر السلة: «استعادة» (بلا تأكيد — آمنة وقابلة للعكس) و«حذف نهائي»
 * (بتأكيد — لا رجعة). كلاهما مقيَّدٌ بالمالك في الـAPI.
 */
export default function TrashActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saved-games?id=${encodeURIComponent(id)}&action=restore`, {
        method: 'PATCH',
      });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const permanent = async () => {
    if (busy) return;
    if (!confirm('حذفٌ نهائيّ؟ لا يمكن التراجع.')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/saved-games?id=${encodeURIComponent(id)}&permanent=1`, {
        method: 'DELETE',
      });
      if (r.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        className="text-xs font-bold text-sage-dark hover:text-sage-deep transition-colors disabled:opacity-50"
      >
        استعادة
      </button>
      <button
        type="button"
        onClick={permanent}
        disabled={busy}
        className="text-xs font-bold text-red-600/80 hover:text-red-700 transition-colors disabled:opacity-50"
      >
        حذف نهائي
      </button>
    </div>
  );
}
