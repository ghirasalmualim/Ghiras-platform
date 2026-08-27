/**
 * غراس للمحاسبة — Stage 11: قبول الجوال وDOM لوضع المالكة.
 *
 * Chromium فقط (قرار التبعية الواحدة المعتمد)، وشاشة القبول 390×844.
 * الخادم يقلع ببيئة وهمية معزولة — **صفر لمس لـStaging**: طبقة
 * الواجهة تُثبت باعتراض مسارات /api/accounting/owner/* بحمولات DTO
 * مبنية بالبنّائين الحقيقيين؛ أما سلوك القاعدة فحزمته المستقلة
 * test-exceptions-db.mjs (مرحلة الفحص على Staging).
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3311',
    viewport: { width: 390, height: 844 },
    locale: 'ar',
  },
  webServer: {
    command: 'npx next start -p 3311',
    url: 'http://127.0.0.1:3311',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // بيئة وهمية مقفلة محليًا — منفذ مغلق يفشل فورًا؛ لا Staging
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key-for-ui-tests',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-key-for-ui-tests',
    },
  },
});
