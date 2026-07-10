import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * عميل Supabase لمكوّنات الخادم — يقرأ جلسة المستخدم من الكوكيز.
 * من خلاله تُطبَّق سياسات الأمان (RLS): روابط الألعاب لا تصل
 * للمتصفح إلا إذا سمحت قاعدة البيانات نفسها بذلك.
 */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // تُستدعى من مكوّن خادم — الوسيط (middleware) يتكفل بالتحديث
          }
        },
      },
    }
  );
}
