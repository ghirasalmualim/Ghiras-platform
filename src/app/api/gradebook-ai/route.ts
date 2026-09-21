/**
 * ⛔ مُعطَّلٌ عمدًا — المرحلة الأولى من «بيانات الطلبة على جهاز المعلمة».
 *
 * كان هذا الجسرُ يستقبلُ من سجل الدرجات صورةَ كشفِ الأسماءِ وصورةَ نموذجِ التقييم
 * ويرسلهما كاملتَيْن إلى Anthropic — وتعليماتُ النموذجِ نفسُها كانت تتوقّعُ فيه
 * «اسم الطالب ورقمه». صار سجلُّ الدرجاتِ يقرأُ الأسماءَ داخلَ الجهاز (GhirasOCR)،
 * ويبني بنودَ التقييمِ من قوالبَ جاهزةٍ أو يدويًّا، فلا مستدعيَ لهذا المسار.
 *
 * يبقى المسارُ ويرفضُ كلَّ طلب (410) قبل قراءةِ جسمه، كي لا تُرسِلَ نسخةٌ قديمةٌ
 * مخزّنةٌ في متصفّحِ معلمةٍ صورةً إلى أيِّ مكان. والكودُ السابقُ في تاريخِ git.
 *
 * ⚠️ تعليقُ النسخةِ السابقةِ ذكرَ «التحضير الكتابي» مستدعيًا ثانيًا؛ لم يُعثَرْ له على
 *    أيِّ كودٍ في مستودعاتِ المنصّةِ والألعابِ والاستوديو.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [
  "https://ghiras-edu.com",
  "https://www.ghiras-edu.com",
  "https://games.ghiras-edu.com",
  "https://ghiras-games.vercel.app",
  "https://ghiras-platform.vercel.app",
];

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-ghiras-key",
    Vary: "Origin",
  };
}

// يُجابُ طلبُ CORS التمهيديُّ كي تصلَ رسالةُ الرفضِ الواضحةُ للصفحةِ القديمة بدل خطأِ شبكةٍ مبهم
export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: headers(req) });
}

export async function POST(req: Request) {
  return new Response(
    JSON.stringify({
      error: {
        message:
          "قراءة الصور بالذكاء الاصطناعي متوقفة لحماية بيانات الطلبة — حدّثي الصفحة، ثم اختاري قالباً جاهزاً أو أدخلي البنود يدوياً.",
      },
    }),
    { status: 410, headers: headers(req) },
  );
}
