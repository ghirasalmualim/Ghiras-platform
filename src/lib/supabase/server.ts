import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookieDomainOption } from './cookie-domain';
import { cookies } from 'next/headers';

/**
 * عميل Supabase لمكوّنات الخادم — يقرأ جلسة المستخدم من الكوكيز.
 * من خلاله تُطبَّق سياسات الأمان (RLS): روابط الألعاب لا تصل
 * للمتصفح إلا إذا سمحت قاعدة البيانات نفسها بذلك.
 */

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: 'sb-ghiras-auth' },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // مشاركة الجلسة مع الاستوديو عبر النطاق الأب — بحسب البيئة
                ...cookieDomainOption,
              })
            );
          } catch {
            // تُستدعى من مكوّن خادم — الوسيط (middleware) يتكفل بالتحديث
          }
        },
      },
    }
  );
}
