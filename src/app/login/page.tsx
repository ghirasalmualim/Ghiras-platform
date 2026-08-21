'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient, usernameToEmail, toEnglishDigits } from '@/lib/supabase/client';

/**
 * بوابة تسجيل الدخول — الدخول برقم الجوال (يُستخدم كاسم مستخدم).
 * 1) التحقق من رقم الجوال وكلمة المرور عبر Supabase Auth
 * 2) التحقق من حالة الحساب (فعال / منتهٍ / موقوف)
 * 3) تسجيل عملية الدخول وتحديث آخر نشاط
 * 4) التوجيه للصفحة المطلوبة
 */
function phoneToUsername(phone: string) {
  // ⚠️ الأرقام العربية أولًا: `\D` تحذفها كأنها حروف فيخرج الرقم فارغًا
  let d = toEnglishDigits(phone).replace(/\D/g, '');
  if (d.length > 8 && d.startsWith('965')) d = d.slice(3);
  return d;
}
/** الأدمِن يدخل باسم مستخدم نصي (ghiras)، والمعلمات برقم الجوال. */
function toUsername(input: string) {
  // ⚠️ تُوحَّد الأرقام قبل الفحص: بدونها يفشل الاختبار نفسه مع
  // «٩٩٨٨٧٧٦٦» فيُعامَل الرقمُ اسمَ مستخدم ولا يُطبَّع أصلًا.
  const raw = toEnglishDigits(input).trim();
  return /^[\d+\s()\-]+$/.test(raw) ? phoneToUsername(raw) : raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (loading) return;
    if (!username.trim() || !password) {
      setMessage('يرجى إدخال رقم الجوال وكلمة المرور');
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const uname = toUsername(username);

    // 1) محاولة الدخول
    const { data: auth, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(uname),
      password,
    });

    /**
     * ⚠️ **لا تُترجَم كلُّ الأخطاء إلى «كلمة المرور غير صحيحة».**
     *
     * كانت كذلك، فبقيت مشتركةٌ يومين تُعطى كلمات مرورٍ جديدة ولا تدخل،
     * ونحن نظنّ المشكلة في كلمتها — وقد يكون السبب تجاوزَ عددِ
     * المحاولات أو غيرَه. والرسالة التي تصف سببًا واحدًا لكل الأسباب
     * تُضلّل من يقرؤها ومن يُصلحها معًا.
     *
     * ⚠️ ويُعرض رمزُ الخطأ حين لا نعرفه: حرفان في زاوية الشاشة يوفّران
     * يومين من التخمين.
     */
    if (error || !auth.user) {
      const code = (error as { code?: string } | null)?.code ?? '';
      const status = (error as { status?: number } | null)?.status ?? 0;

      if (code === 'invalid_credentials' || status === 400)
        setMessage('رقم الجوال أو كلمة المرور غير صحيحة');
      else if (code === 'over_request_rate_limit' || status === 429)
        setMessage('حاولت كثيرًا في وقت قصير — انتظري دقائق ثم أعيدي المحاولة');
      else if (code === 'email_not_confirmed')
        setMessage('الحساب لم يُفعَّل بعد — تواصلي مع إدارة المنصة');
      else if (code === 'user_banned')
        setMessage('هذا الحساب موقوف — تواصلي مع إدارة المنصة');
      else
        setMessage(
          `تعذّر الدخول — تواصلي مع إدارة المنصة${code || status ? ` (رمز: ${code || status})` : ''}`
        );

      setLoading(false);
      return;
    }

    // 2) قراءة الملف الشخصي والتحقق من الحالة والاشتراك
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, status, sub_end')
      .eq('id', auth.user.id)
      .single();

    /**
     * ⚠️ **خطأُ قراءة الملف كان مُهمَلًا تمامًا.**
     *
     * كُتب `const { data: profile } = ...` بلا التقاط الخطأ، فصار كلُّ
     * سببٍ يُترجَم «الحساب غير مُهيأ بعد»: رفضُ حماية، أو انقطاعُ
     * شبكة، أو جلسةٌ لم تصل مع الطلب.
     *
     * ووقع بمشتركةٍ ملفُّها سليمٌ تمامًا — اسمٌ ودورٌ واشتراكٌ فعّال
     * إلى ٢٠٢٧ — فقيل لها إن حسابها «غير مُهيأ»، وبقيت يومين تُعطى
     * كلماتِ مرورٍ جديدة والعلّةُ في مكانٍ آخر.
     *
     * ⚠️ والرمز يُعرض لأن جملةً واحدة لكل الأسباب هي ما أعمانا.
     */
    if (!profile) {
      const code = profileError?.code ?? '';
      await supabase.auth.signOut();
      setMessage(
        code === 'PGRST116'
          ? 'الحساب غير مُهيأ بعد — يرجى التواصل مع إدارة المنصة'
          : `تعذّر قراءة بيانات حسابك — تواصلي مع إدارة المنصة${code ? ` (رمز: ${code})` : ''}`
      );
      setLoading(false);
      return;
    }

    const expired =
      profile.sub_end && new Date(profile.sub_end) < new Date(new Date().toDateString());

    if (profile.status === 'suspended') {
      await supabase.auth.signOut();
      setMessage('هذا الحساب موقوف — يرجى التواصل مع إدارة المنصة');
      setLoading(false);
      return;
    }

    if (profile.status === 'expired' || expired) {
      await supabase.auth.signOut();
      setMessage('انتهى الاشتراك — يرجى التجديد للاستمرار في استخدام المنصة');
      setLoading(false);
      return;
    }

    // 3) تسجيل الدخول الناجح وتحديث آخر نشاط (دون تعطيل المستخدم)
    void supabase.from('login_logs').insert({
      user_id: auth.user.id,
      username: uname,
      success: true,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    void supabase.rpc('touch_last_active');

    // 4) التوجيه
    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      <div
        className="card-3d w-full max-w-md p-8 mt-6 animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <div className="gold-thread w-24 mx-auto mb-6" aria-hidden="true" />

        <h1 className="text-2xl font-black text-sage-deep text-center">
          تسجيل الدخول
        </h1>
        <p className="mt-2 text-center text-ink/60 text-sm leading-relaxed">
          هذا المحتوى مخصص للمشتركين في غراس المعلم
        </p>

        <div className="mt-7 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-bold text-ink/80 mb-1.5"
            >
              رقم الجوال
            </label>
            <input
              id="username"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck={false}
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-left focus:border-sage focus:ring-2 focus:ring-sage/25 outline-none transition"
              placeholder="٩٩١٢٣٤٥٦"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-ink/80 mb-1.5"
            >
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-left focus:border-sage focus:ring-2 focus:ring-sage/25 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          {message && (
            <p
              role="status"
              className="rounded-xl bg-gold-light/70 text-gold-dark text-sm font-bold px-4 py-3 text-center"
            >
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-sage hover:bg-sage-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait text-white font-extrabold text-lg py-3.5 shadow-soft transition-all"
          >
            {loading ? 'جارٍ التحقق…' : 'دخول'}
          </button>

          <p className="text-center text-sm text-ink/60">
            ليس لديك حساب؟{' '}
            <Link href="/register" className="font-bold text-sage-dark hover:underline">
              إنشاء حساب
            </Link>
          </p>
          <p className="text-center text-xs text-ink/45">
            نسيت كلمة السر؟ تواصلي مع إدارة غراس المعلم
          </p>
        </div>
      </div>

      <Link
        href="/"
        className="mt-6 text-sm text-ink/55 hover:text-sage-dark transition-colors animate-float-in"
        style={{ animationDelay: '0.2s' }}
      >
        ← العودة للرئيسية
      </Link>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
