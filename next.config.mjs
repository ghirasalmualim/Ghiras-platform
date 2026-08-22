// ⚠️ تشخيصٌ مؤقّت — يُزال فور حسم سبب `NO_SUPABASE_CONFIG` في بناء الإنتاج.
//    يطبع أعلامًا فقط: لا قيمةً ولا طولًا ولا حرفًا من مفتاح أو رابط.
console.log(
  '[BUILD_ENV_PROBE:raw]',
  JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_COOKIE_DOMAIN_PRESENT: Boolean(process.env.NEXT_PUBLIC_COOKIE_DOMAIN),
    SUPABASE_SERVICE_ROLE_KEY_PRESENT: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NODE_ENV: process.env.NODE_ENV ?? null,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
  })
);

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
