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
    // اسم كوكي مخصص: القديمة (sb-<ref>-auth-token) كانت تبقى host-only على
    // أجهزة المستخدمين وتُظلّل الجديدة فتُسقط الجلسة — الاسم الجديد يتجاهلها.
    // والنطاق الأب (إنتاج فقط) ليقرأها الاستوديو (دخول موحد).
    {
      cookieOptions: {
        name: 'sb-ghiras-auth',
        path: '/',
        ...(process.env.NODE_ENV === 'production'
          ? { domain: '.ghiras-edu.com' }
          : {}),
      },
    }
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

/**
 * توحيد الأرقام العربية والفارسية إلى الإنجليزية.
 *
 * ⚠️ عطبٌ أوقف اشتراكًا: `\d` في JavaScript لا تطابق إلا الأرقام
 * الإنجليزية. فمن كتبت رقمها «٩٩٨٨٧٧٦٦» — وهو الطبيعي على لوحة
 * عربية — لم يرَ النظام فيه رقمًا واحدًا، فأرسل بريدًا لا وجود له
 * وردّ «رقم الجوال أو كلمة المرور غير صحيحة».
 *
 * فبقيت تُعطى كلمات مرور جديدة ولا تدخل، والخلل ليس في كلمة السرّ.
 *
 * وتُنادى **قبل** كل معالجة للرقم: في الدخول والتسجيل معًا، وإلا
 * سجّلت بصيغة ودخلت بأخرى.
 */
export function toEnglishDigits(input: string): string {
  return (input || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
