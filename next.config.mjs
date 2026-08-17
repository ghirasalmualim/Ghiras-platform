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
    },
  },
};

export default nextConfig;
