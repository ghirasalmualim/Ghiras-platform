/**
 * القرّاء المعتمدون وتراخيصهم.
 *
 * مكانها المستودع لا قاعدة البيانات، لنفس سبب نص المصحف: هذه بيانات
 * مرجعية لا تتغيّر بفعل مستخدم، ووضعها في Git يجعل كل تغيير في مصدر
 * صوت أو ترخيصه يمرّ بمراجعة مكتوبة ومؤرّخة. سطرٌ في جدول يمكن أن
 * يتبدّل بلا أثر يُراجَع.
 *
 * ⚠️ القاعدة: لا يُضاف قارئ ولا يُفعَّل (`is_active`) قبل التأكد من
 * مصدره وشروط استخدامه، ويُكتب ما تحقّقنا منه في `source_note` بنصّه
 * لا بخلاصته. وجود الملف على الإنترنت ليس إذنًا باستعماله.
 */

import type { Reciter } from '../types';

export const RECITERS: Reciter[] = [
  {
    id: 'ar.husary',
    name_ar: 'محمود خليل الحصري',
    style: 'مرتّل',
    base_url: 'https://cdn.islamic.network/quran/audio/128/ar.husary',
    licence:
      'يجيز المصدر تضمين التلاوات في منتج تجاري، وتبقى حقوق التلاوة للقارئ',
    source_note: [
      'المصدر: AlQuran Cloud / Islamic Network CDN — https://alquran.cloud/terms-and-conditions',
      'نصّ الشرط حرفيًا: "Recitations are licensed to us by the reciters or their',
      'estates for free, non-commercial redistribution at the bitrates we publish."',
      'و: "You may bundle them into a commercial product, but please note that',
      'copyrights lie with the reciters and they may ask you to remove the content."',
      'راجعناه في ٢٠٢٦-٠٨-١٩، وتحققنا من عمله فعليًا: HTTP 200، audio/mpeg،',
      'cache-control max-age=6048000.',
      'المخاطرة المتبقية معلومة ومقبولة بقرار صاحبة المنصة: قد يطلب صاحب الحق',
      'الإزالة يومًا، وعندها يُطفأ هذا القارئ من هنا ويُستبدل بلا إعادة بناء.',
    ].join('\n'),
    is_active: true,
  },
];

/** الحصري مرتّلًا: بطيء وواضح ومفصّل الحروف، وهو المعيار في تعليم الأطفال. */
export const DEFAULT_RECITER_ID = 'ar.husary';

export function activeReciters(): Reciter[] {
  return RECITERS.filter((r) => r.is_active);
}

export function getReciter(id: string = DEFAULT_RECITER_ID): Reciter {
  const found = RECITERS.find((r) => r.id === id && r.is_active);
  if (found) return found;
  const fallback = activeReciters()[0];
  if (!fallback) throw new Error('لا يوجد قارئ مفعَّل.');
  return fallback;
}
