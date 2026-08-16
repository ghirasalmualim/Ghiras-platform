import type { Metadata, Viewport } from 'next';
import { Tajawal, Cairo } from 'next/font/google';
import './globals.css';

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '700', '800', '900'],
  variable: '--font-tajawal',
  display: 'swap',
});

// خط العناوين في تقسيمة الرئيسية الجديدة — مطابق للملف المرجعي
const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'غراس المعلم | منصة الألعاب التعليمية',
  description:
    'منصة غراس المعلم — مكتبة ألعاب تعليمية تفاعلية للمرحلتين الابتدائية والمتوسطة، للمعلمين والمعلمات في الخليج.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'غراس المعلم',
  },
  icons: {
    icon: '/icons/icon-192.png?v=2',
    apple: '/icons/apple-touch-icon.png?v=2',
  },
};

export const viewport: Viewport = {
  themeColor: '#7A9E7E',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${cairo.variable}`}>
      <body className="font-tajawal bg-cream text-ink antialiased min-h-dvh">
        {children}
      </body>
    </html>
  );
}
