'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * دعوةُ الجمعة إلى سورة الكهف.
 *
 * ⚠️ **يوم الجمعة يُقرأ من ساعة الجهاز لا من ساعة الخادم.**
 * وصفحةُ القرآن مخزَّنة ساعةً كاملة (`revalidate = 3600`)، فلو حسبنا
 * اليوم على الخادم لثبت في النسخة المخزَّنة: يظهر الزرّ يوم السبت،
 * أو يغيب يوم الجمعة، بحسب لحظة التخزين. والقارئ في أي بلد يرى جمعتَه
 * هو، ولا نسأله عن موقعه ولا نخزّن منه شيئًا.
 *
 * ⚠️ ولا يُصيَّر شيءٌ قبل التركيب: الخادم لا يعرف يومَ القارئ، فلو
 * خمّن لاختلف ما رسمه عمّا يرسمه المتصفح — وذلك يكسر الصفحة صمتًا.
 * فيبدأ خفيًّا ويظهر بعد أن يُعرف اليوم.
 */

/** ٥ = الجمعة في `Date#getDay` (٠ الأحد). */
const FRIDAY = 5;

export default function KahfFriday() {
  const [isFriday, setIsFriday] = useState(false);

  useEffect(() => {
    setIsFriday(new Date().getDay() === FRIDAY);
  }, []);

  if (!isFriday) return null;

  return (
    <Link
      href="/quran/study/18/1/110"
      className="tap mb-6 flex flex-col items-center gap-1 rounded-[1.5rem] bg-[var(--q-accent)] px-6 py-5 text-center text-white shadow-sm transition hover:brightness-105"
    >
      <span className="font-[family-name:var(--font-cairo)] text-[1.15rem] font-extrabold">
        📖 سورة الكهف
      </span>
      <span className="text-[0.88rem] font-bold text-white/85">نور بين الجمعتين</span>
    </Link>
  );
}
