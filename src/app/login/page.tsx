'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient, usernameToEmail } from '@/lib/supabase/client';

/**
 * بوابة تسجيل الدخول — المرحلة الثانية (نظام حقيقي):
 * 1) التحقق من اسم المستخدم وكلمة المرور عبر Supabase Auth
 * 2) التحقق من حالة الحساب (فعال / منتهٍ / موقوف)
 * 3) تسجيل عملية الدخول وتحديث آخر نشاط
 * 4) التوجيه للصفحة المطلوبة
 */
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
      setMessage('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    // 1) محاولة الدخول
    const { data: auth, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (error || !auth.user) {
      setMessage('اسم المستخدم أو كلمة المرور غير صحيحة');
      setLoading(false);
      return;
    }

    // 2) قراءة الملف الشخصي والتحقق من الحالة والاشتراك
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, role, status, sub_end')
      .eq('id', auth.user.id)
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      setMessage('الحساب غير مُهيأ بعد — يرجى التواصل مع إدارة المنصة');
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
      username: username.trim().toLowerCase(),
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
              اسم المستخدم
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
              placeholder="username"
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
