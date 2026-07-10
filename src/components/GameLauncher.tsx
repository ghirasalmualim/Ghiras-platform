'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * زر تشغيل اللعبة — يسجّل الزيارة في الإحصائيات ثم يفتح اللعبة
 * في تبويب جديد.
 */
export default function GameLauncher({
  gameId,
  url,
  accent,
}: {
  gameId: string;
  url: string;
  accent: string;
}) {
  function launch() {
    // تسجيل الزيارة (دون انتظار — لا يؤخر فتح اللعبة)
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase
          .from('game_visits')
          .insert({ game_id: gameId, user_id: data.user.id });
      }
    });

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={launch}
      className="mt-4 w-full rounded-xl text-white font-extrabold py-2.5 shadow-soft active:scale-[0.98] transition-all hover:brightness-110"
      style={{ backgroundColor: accent }}
    >
      ابدأ اللعبة ←
    </button>
  );
}
