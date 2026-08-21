'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isFridayBeforeMaghrib, isMulkNight } from '../engine/daytime';

/**
 * دعوتان تظهران في وقتهما وتغيبان بعده.
 *
 * ⚠️ **الوقت يُقاس بتوقيت الكويت لا بساعة الجهاز**، لأن «مغرب الجمعة»
 * موقوتٌ بمكان، والمكان هو الكويت. ولمستعملي المنصة — وكلّهم في
 * الكويت — الساعتان واحدة، فلا يفترق شيء. ومن كان خارجها رأى مواقيت
 * الكويت، وذلك أصدق من أن نُريه مغربًا لا يخصّه ولا يخصّنا.
 *
 * ⚠️ **ولا يُصيَّر شيءٌ على الخادم**: صفحة القرآن مخزَّنة ساعةً كاملة
 * (`revalidate = 3600`)، فلو حُسب الوقت هناك لتجمّد في النسخة
 * المخزَّنة — يبقى زرّ الكهف بعد المغرب، أو يغيب قبله، بحسب لحظة
 * التخزين وحدها.
 *
 * ⚠️ **وتُراجَع كل دقيقة**: من ترك الصفحة مفتوحة قبل المغرب يجب أن
 * يراها تنطفئ عنده، لا أن يظلّ الزرّ حتى يحدّث الصفحة. والدعوة التي
 * تبقى بعد وقتها تكذب على صاحبها.
 */

const MINUTE = 60_000;

function useTimed(check: () => boolean): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const tick = () => setOn(check());
    tick();
    const id = setInterval(tick, MINUTE);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return on;
}

function Call({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="tap mb-6 flex flex-col items-center gap-1 rounded-[1.5rem] bg-[var(--q-accent)] px-6 py-5 text-center text-white shadow-sm transition hover:brightness-105"
    >
      <span className="font-[family-name:var(--font-cairo)] text-[1.15rem] font-extrabold">
        {title}
      </span>
      <span className="text-[0.88rem] font-bold text-white/85">{subtitle}</span>
    </Link>
  );
}

/** الجمعة، من فجرها إلى مغربها. */
export function KahfFriday() {
  const show = useTimed(isFridayBeforeMaghrib);
  if (!show) return null;
  return (
    <Call
      href="/quran/study/18/1/110"
      title="📖 سورة الكهف"
      subtitle="نور بين الجمعتين"
    />
  );
}

/** كل ليلة، من الثامنة مساءً إلى الشروق. */
export function MulkNight() {
  const show = useTimed(isMulkNight);
  if (!show) return null;
  return (
    <Call
      href="/quran/study/67/1/30"
      title="🌙 سورة الملك"
      subtitle="شفاعة لصاحبها يوم القيامة"
    />
  );
}
