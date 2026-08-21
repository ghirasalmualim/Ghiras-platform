'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * عميل Supabase للمتصفح — يُستخدم في تسجيل الدخول والخروج
 * وتسجيل زيارات الألعاب.
 */
/**
 * إزالة كوكي الجلسة **المحصورة بالمضيف** التي تُظلّل كوكي النطاق الأب.
 *
 * ⚠️ **عطبٌ أوقف مشتركةً يومين، وكان سيوقف كل مشتركة جديدة.**
 *
 * الجلسة تُكتب على النطاق الأب `.ghiras-edu.com` ليقرأها الاستوديو.
 * لكن من زار الموقع قبل ذلك بقيت على جهازه كوكي بالاسم نفسه محصورةٌ
 * بـ`www` وحده. فيجتمع في المتصفح كوكيّان باسمٍ واحد، ويُقرأ الأقدم
 * الفارغ — فتضيع الجلسة **بعد نجاح الدخول مباشرة**.
 *
 * والأثر الذي رأيناه: تدخل المشتركة بكلمة مرورٍ صحيحة، ثم يُرفض
 * الطلبُ التالي لأنه بلا هوية، فيُقال لها «الحساب غير مُهيأ» — وملفُّها
 * سليمٌ تمامًا. وثبت بالتجربة: تنجح في نافذةٍ خاصة وتفشل في العادية.
 *
 * ⚠️ والحذف بلا `domain` يصيب المحصورة بالمضيف وحدها: حذفُ كوكي
 * النطاق الأب يشترط ذكرَ نطاقه، فتبقى الصحيحة سالمة. ولذلك يُشغَّل
 * هذا في كل تحميل بلا خطر.
 *
 * ⚠️ وتُحذف الأجزاء المرقّمة أيضًا (`.0` `.1` …): الجلسة أكبر من حدّ
 * الكوكي فتُقسَّم، وتركُ جزءٍ قديمٍ واحد يُفسد التجميع كلّه.
 */
let shadowCleared = false;
function clearShadowingCookies() {
  if (typeof document === 'undefined' || shadowCleared) return;
  shadowCleared = true;
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === 'sb-ghiras-auth' || n.startsWith('sb-ghiras-auth.'));
  for (const n of names) document.cookie = `${n}=; Max-Age=0; path=/`;
}

export function createClient() {
  clearShadowingCookies();
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
