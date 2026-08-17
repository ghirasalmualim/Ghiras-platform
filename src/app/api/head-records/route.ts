import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * حارس «سجلات رئيس القسم».
 *
 * التطبيق ملف HTML مكتفٍ بذاته يعيش في private/ خارج مجلد public — أي أنه
 * لا يُخدَم إطلاقًا كملف ثابت، ولا سبيل لفتحه إلا من هنا بعد التحقق من:
 *   ١) تسجيل الدخول
 *   ٢) اشتراك سارٍ في العمود head_records_until (أو دور admin)
 *   ٣) ألّا يكون الحساب موقوفًا
 *
 * الرفض آمن (fail-closed): أي خطأ في قراءة الملف الشخصي أو غياب العمود
 * يعني «لا اشتراك» فتُعرض صفحة القفل، ولا يُسرَّب المحتوى أبدًا.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNTIL = 'head_records_until';
const APP_FILE = path.join(process.cwd(), 'private', 'rais-qism.html');

// الملف ٣ ميجا — يُقرأ مرة واحدة لكل نسخة تشغيل ثم يبقى في الذاكرة
let cachedApp: string | null = null;

type ProfileRow = {
  role?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`role, status, ${UNTIL}`)
    .eq('id', user.id)
    .single();

  const p = profile as ProfileRow | null;
  const isAdmin = p?.role === 'admin';
  const until = p ? (p[UNTIL] as string | null) : null;
  const active =
    isAdmin ||
    Boolean(p && p.status !== 'suspended' && until && new Date(until) > new Date());

  if (!active) {
    return NextResponse.redirect(new URL('/head-records-locked', req.url));
  }

  try {
    if (cachedApp === null) cachedApp = await readFile(APP_FILE, 'utf8');
  } catch {
    // الملف غير موجود في حزمة النشر — رفض آمن بدل صفحة بيضاء
    return NextResponse.redirect(new URL('/head-records-locked', req.url));
  }

  return new NextResponse(cachedApp, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // خاص بالمتصفح وحده — لا تخزين على أي وسيط مشترك، فالمحتوى مدفوع
      'Cache-Control': 'private, max-age=3600, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
