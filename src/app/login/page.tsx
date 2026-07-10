'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * بوابة تسجيل الدخول
 * الواجهة جاهزة بالكامل — يُربط التحقق الفعلي مع Supabase Auth
 * في المرحلة الثانية (نظام الدخول والصلاحيات).
 *
 * ملاحظات مهمة لتجربة الآيفون والآيباد:
 * - autoCapitalize/autoCorrect معطّلة لتجنب مشكلة التصحيح التلقائي
 *   التي واجهناها سابقاً في لعبة «عالم القلوب».
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const subject = searchParams.get('subject');
  const grade = searchParams.get('grade');
  const stage = searchParams.get('stage');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit() {
    if (!username.trim() || !password) {
      setMessage('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    // ── المرحلة 2: هنا يتم الاتصال بـ Supabase Auth والتحقق من الصلاحيات ──
    setMessage('نظام الدخول سيُفعَّل في المرحلة الثانية من البناء 🌱');
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
            className="w-full rounded-xl bg-sage hover:bg-sage-dark active:scale-[0.98] text-white font-extrabold text-lg py-3.5 shadow-soft transition-all"
          >
            دخول
          </button>
        </div>

        {stage && grade && (
          <p className="mt-5 text-center text-xs text-ink/45">
            الوجهة بعد الدخول: {stage === 'primary' ? 'الابتدائية' : 'المتوسطة'} ·{' '}
            {grade.replace('grade-', 'الصف ')} · {subject}
          </p>
        )}
      </div>

      <Link
        href={stage && grade ? `/stage/${stage}/${grade}` : '/'}
        className="mt-6 text-sm text-ink/55 hover:text-sage-dark transition-colors animate-float-in"
        style={{ animationDelay: '0.2s' }}
      >
        ← الرجوع للمواد
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
