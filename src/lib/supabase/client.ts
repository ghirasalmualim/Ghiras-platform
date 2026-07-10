'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * عميل Supabase للمتصفح — يُستخدم في تسجيل الدخول والخروج
 * وتسجيل زيارات الألعاب.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
