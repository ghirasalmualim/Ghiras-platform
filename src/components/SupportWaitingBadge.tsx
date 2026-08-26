'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * 🔴 شارة «محادثات تنتظر الإدارة» — عدّاد محادثات لا رسائل.
 *
 * التعريف: status = needs_human، أو human_handling وآخر رسالة من
 * المستخدمة (أي تنتظر رد الأدمِن). يتحدث فورًا عبر Realtime على جدول
 * المحادثات (RLS تسري على البث فلا يصل غير الأدمِن شيء)، مع فحص دوري
 * خفيف احتياطًا. صفر = لا شارة أصلًا.
 */
export function useSupportWaiting(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let alive = true;

    const recount = async () => {
      const { count: n } = await supabase
        .from('support_conversations')
        .select('id', { count: 'exact', head: true })
        .or('status.eq.needs_human,and(status.eq.human_handling,last_sender.eq.user)');
      if (alive) setCount(n ?? 0);
    };
    void recount();

    const channel = supabase
      .channel('support-waiting')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        () => void recount()
      )
      .subscribe();
    const poll = setInterval(() => void recount(), 60_000);

    return () => {
      alive = false;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  return count;
}

export default function SupportWaitingBadge({ enabled = true }: { enabled?: boolean }) {
  const count = useSupportWaiting(enabled);
  if (!count) return null;
  return (
    <span
      className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[11px] font-black px-1.5"
      aria-label={`${count} محادثة تنتظر الإدارة`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
