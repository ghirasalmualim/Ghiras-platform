import { NextResponse } from 'next/server';

/**
 * ⛔ مُعطَّلٌ عمدًا — المرحلة الأولى من «بيانات الطلبة على جهاز المعلمة».
 *
 * كان هذا المسارُ (وحدةُ «إدارة المدرسة») يرسلُ صورَ/PDF قوائمِ الطلبةِ كاملةً إلى
 * Anthropic. الوحدةُ غيرُ مفعّلةٍ ولا رابطَ لها في واجهةِ المنصّة؛ فلم تُنقَلْ إلى
 * القراءةِ المحليّة الآن، واكتُفِيَ بإغلاقِ الطريقِ الذي قد يُخرِجُ بياناتِ طلبة.
 * عند تفعيلِ الوحدةِ لاحقًا تُربَطُ بـ public/ocr/ghiras-ocr.js كما في سجل الحضور.
 *
 * الطلبُ يُرفَضُ (410) قبل قراءةِ جسمه. والكودُ السابقُ محفوظٌ في تاريخِ git.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function gone() {
  return NextResponse.json(
    { error: { message: 'قراءة القوائم عبر الخادم متوقفة لحماية بيانات الطلبة.' } },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = gone;
export const GET = gone;
