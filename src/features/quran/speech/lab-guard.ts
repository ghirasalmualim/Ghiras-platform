import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حارس مختبر التسميع.
 *
 * ── لماذا حارس أصلًا ──
 * المختبر يفتح ميكروفونًا ويرسل صوتًا إلى مزوّد **مدفوع**. ولو تُرك
 * مفتوحًا على الإنتاج، فأي أحد يعرف الرابط يقدر أن يسجّل ما شاء
 * ويستهلك رصيد المنصة — وهو رصيد بفاتورة على صاحبة المنصة.
 *
 * ── شرطان معًا ──
 * ١) `QURAN_LAB=1` في بيئة الخادم — مفتاح يُطفأ بسطر واحد بعد القياس.
 * ٢) صاحبة الطلب أدمِن **بجلستها هي** لا بما ترسله.
 *
 * والاثنان لازمان: العلَم وحده يفتح للجميع، والدور وحده يترك المختبر
 * قائمًا بعد انتهاء الحاجة إليه.
 *
 * ⚠️ ويُستعمل نفس تحقّق الأدوار المستعمل في بقية غراس — لا نظام
 * صلاحيات ثانٍ يُراجَع وحده ويُنسى وحده.
 *
 * ⚠️ والفشل يكون بـ404 لا 403: من لا يملك الحق لا يعرف أن هنا شيئًا.
 */
export async function isLabOwner(): Promise<boolean> {
  if (process.env.QURAN_LAB !== '1') return false;

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return data?.role === 'admin';
}
