'use client';

/**
 * زر تشغيل اللعبة — يفتح اللعبة عبر مُصدِّر التصاريح على المنصة،
 * الذي يتحقق من الاشتراك والصلاحية ثم يوجّه للعبة بتوكن موقّع.
 * لا تُفتح أي لعبة إلا من هنا (الرابط المباشر محميّ بالحارس).
 */
export default function GameLauncher({
  gameId,
  accent,
}: {
  gameId: string;
  url?: string; // لم يعد يُفتح مباشرة — يُمرَّر عبر مُصدِّر التصاريح
  accent: string;
}) {
  function launch() {
    // يمرّ الفتح عبر مُصدِّر التصاريح (يسجّل الزيارة ويصدر التوكن على الخادم)
    window.open(
      `/api/game-access?g=${encodeURIComponent(gameId)}`,
      '_blank',
      'noopener,noreferrer'
    );
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
