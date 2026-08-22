/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // تطبيق «سجلات رئيس القسم» يعيش خارج public ويُقرأ من القرص وقت الطلب،
    // فيجب تضمينه صراحةً في حزمة الدالة على Vercel وإلا لم يجده الحارس.
    outputFileTracingIncludes: {
      '/api/head-records': ['./private/rais-qism.html'],
      // نص المصحف ملف في المستودع يُقرأ من القرص وقت الطلب. بدون تضمينه
      // صراحةً يعمل القسم محليًا ثم يفشل بعد النشر. النمط يغطي كل صفحات
      // القسم الحالية والقادمة.
      '/quran/**': ['./src/features/quran/corpus/**'],
    },
  },
};

export default nextConfig;
