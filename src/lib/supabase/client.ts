'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * عميل Supabase للمتصفح — يُستخدم في تسجيل الدخول والخروج
 * وتسجيل زيارات الألعاب.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // كوكي الجلسة على النطاق الأب حتى تُقرأ في الاستوديو (إنتاج فقط) —
    // بدونها يكتب تسجيل الدخول كوكي host-only لا تصل إلى studio.*
    process.env.NODE_ENV === 'production'
      ? { cookieOptions: { domain: '.ghiras-edu.com', path: '/' } }
      : undefined
  );
}

/**
 * تسجيل الدخول يتم باسم مستخدم، بينما Supabase يتعامل بالبريد.
 * لذلك كل حساب يُنشأ ببريد داخلي بالشكل: username@هذا-النطاق
 * (النطاق داخلي فقط ولا يُستخدم لإرسال رسائل)
 */
export const USERNAME_DOMAIN = 'ghiras-users.com';

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}
