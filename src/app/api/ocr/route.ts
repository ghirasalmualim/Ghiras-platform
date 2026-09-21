import { NextResponse } from 'next/server';

/**
 * ⛔ مُعطَّلٌ عمدًا — المرحلة الأولى من «بيانات الطلبة على جهاز المعلمة».
 *
 * كان هذا المسارُ يستقبلُ صورةَ كشفِ الأسماءِ من سجل الحضور ويرسلها كاملةً إلى
 * Anthropic (Claude) لاستخراجِ الأسماء. صارت القراءةُ داخلَ جهازِ المعلمة
 * (public/ocr/ghiras-ocr.js — Tesseract محليًّا)، فلا صورةَ ولا اسمَ يمرُّ بالخادم.
 *
 * يبقى المسارُ موجودًا ويرفضُ كلَّ طلب (410) بدل حذفه، كي لا تُرسِلَ نسخةٌ قديمةٌ
 * مخزّنةٌ في متصفّحِ معلمةٍ صورةً إلى أيِّ مكان: الطلبُ يُرفَضُ قبل قراءةِ جسمه.
 * والكودُ السابقُ محفوظٌ في تاريخِ git لمن أراد مراجعته.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function gone() {
  return NextResponse.json(
    {
      error: {
        message:
          'قراءة الكشوف صارت داخل جهازك ولا تُرسل للخادم. حدّثي الصفحة (اسحبيها للأسفل أو أعيدي فتحها) ثم أعيدي التصوير.',
      },
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = gone;
export const GET = gone;
