import type { Metadata } from 'next';
import { Amiri } from 'next/font/google';

/**
 * غلاف قسم القرآن.
 *
 * خط «أميري» معرَّف هنا لا في تخطيط الجذر عن قصد: لو عُرِّف في الجذر
 * لحُمِّل مع كل صفحة في غراس ولو لم تستعمله. تعريفه هنا يجعله يُحمَّل
 * في صفحات القرآن وحدها، فلا يدفع بقية المنصة ثمن ميزة لا تخصّها.
 *
 * ولماذا «أميري» أصلًا: Tajawal خط واجهات، ورسم المصحف يحمل علامات
 * ضبط تعلو الحرف (الألف الخنجرية، علامات الوقف، الصفر المستدير) لا
 * ترسمها خطوط الواجهات رسمًا صحيحًا. أميري نسخي مصمَّم لهذا.
 */

const amiri = Amiri({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'القرآن الكريم | غراس',
  description:
    'اقرأ واستمع واحفظ من القرآن الكريم — قسم مجاني في منصة غراس، بالنص العثماني برواية حفص عن عاصم.',
};

export default function QuranLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`quran ${amiri.variable} min-h-dvh bg-[var(--q-page)]`}>
      {children}
    </div>
  );
}
