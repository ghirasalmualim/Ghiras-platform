'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient, usernameToEmail, toEnglishDigits } from '@/lib/supabase/client';

/**
 * صفحة إنشاء حساب المعلمة (تسجيل ذاتي).
 * • الدخول يتم برقم الجوال (يُستخدم كاسم مستخدم داخلي).
 * • الإيميل اختياري (للإيصالات واستعادة كلمة السر لاحقاً).
 * • الحساب يُنشأ فوراً (بلا صلاحيات) وينتظر الدفع للتفعيل.
 */
function phoneToUsername(phone: string) {
  // ⚠️ الأرقام العربية أولًا: `\D` تحذفها كأنها حروف فيخرج الرقم فارغًا
  let d = toEnglishDigits(phone).replace(/\D/g, '');
  if (d.length > 8 && d.startsWith('965')) d = d.slice(3);
  return d;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /**
   * تمّ الإنشاء — يُعرض تأكيدٌ صريح ولا يُنقل المستخدم بلا خبر.
   *
   * ⚠️ كان النجاح يرمي المستخدمة إلى الصفحة الرئيسية مباشرةً بلا كلمة.
   * وليس لها اشتراكٌ بعدُ فلا ينفتح لها شيء، فترى شاشةً عادية وتظنّ أن
   * التسجيل أخفق، فتعيده — فيُقال لها «رقم الجوال مسجّل مسبقًا».
   *
   * وقع هذا مع مشتركةٍ حقيقية: أنشأت حسابها الساعة ٢٠:٣٨ ودخلت في
   * اللحظة نفسها، ثم أعادت المحاولة لأن أحدًا لم يخبرها أنها نجحت.
   *
   * ⚠️ **ونجاحٌ يبدو فشلًا أسوأ من فشلٍ معلن**: الفشلُ المعلن يُعالَج،
   * وهذا يدفع صاحبه إلى تكرارٍ يوقعه في رسالةِ خطأٍ لا ذنب له فيها.
   */
  const [createdFor, setCreatedFor] = useState<string | null>(null);

  async function handleSubmit() {
    if (loading) return;
    const name = fullName.trim();
    const uname = phoneToUsername(phone);
    const mail = email.trim();

    if (!name) {
      setMessage('يرجى إدخال الاسم الكامل');
      return;
    }
    if (uname.length < 8) {
      setMessage('يرجى إدخال رقم جوال صحيح (٨ أرقام)');
      return;
    }
    if (password.length < 6) {
      setMessage('كلمة المرور يجب ألا تقل عن ٦ خانات');
      return;
    }
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setMessage('صيغة الإيميل غير صحيحة');
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(uname),
      password,
      options: {
        data: {
          full_name: name,
          username: uname,
          phone: uname,
          email: mail || null,
        },
      },
    });

    if (error) {
      const m = (error.message || '').toLowerCase();
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
        setMessage('رقم الجوال مسجّل مسبقاً. سجّل الدخول، أو استخدم رقماً آخر.');
      } else {
        setMessage('تعذّر إنشاء الحساب — حاول مرة أخرى.');
      }
      setLoading(false);
      return;
    }

    // نجح الإنشاء (تُنشأ الجلسة مباشرة عند تعطيل تأكيد الإيميل)
    // ⚠️ ولا نُبدّل الصفحة بلا كلمة: يُقال لها إنها نجحت، وتنتقل بيدها
    setCreatedFor(name);
    setLoading(false);
    router.refresh();
  }

  const inputCls =
    'w-full rounded-xl border border-sage/30 bg-white px-4 py-3 focus:border-sage focus:ring-2 focus:ring-sage/25 outline-none transition';

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      {/*
        ⚠️ شاشة التأكيد تحلّ محلّ النموذج ولا تُضاف تحته: من نجح لا
        يُترك أمام حقولٍ فارغة يظنّ أنها تنتظره، فيملؤها من جديد —
        وهو عين ما وقع.
      */}
      {createdFor ? (
        <div
          className="card-3d w-full max-w-md p-8 mt-6 animate-float-in text-center"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="gold-thread w-24 mx-auto mb-6" aria-hidden="true" />
          <p className="text-4xl" aria-hidden>🌿</p>
          <h1 className="mt-3 text-2xl font-black text-sage-deep">
            تمّ إنشاء حسابك
          </h1>
          <p className="mt-2 text-ink/70 leading-relaxed">
            أهلًا <b className="text-ink">{createdFor}</b> — حسابك جاهز ودخلتِ فعلًا.
          </p>

          {/* ⚠️ ويُقال ما ينقص: بلا هذا تظنّ أن المنصة معطّلة */}
          <p className="mt-5 rounded-xl bg-sage/10 px-4 py-3 text-[0.88rem] leading-relaxed text-sage-deep">
            الاشتراك <b>يُفعَّل بعد الدفع</b>. وحتى يُفعَّل، ما راح تنفتح لك
            الأدوات المدفوعة — وهذا طبيعي ولا يعني أن حسابك فيه خلل.
          </p>

          <button
            type="button"
            onClick={() => {
              router.push('/');
              router.refresh();
            }}
            className="mt-6 w-full rounded-xl bg-sage px-5 py-3 font-extrabold text-white transition-colors hover:bg-sage-dark"
          >
            ابدأ من الصفحة الرئيسية
          </button>

          <p className="mt-4 text-[0.78rem] text-ink/45">
            ⚠️ لا تُعيدي التسجيل — حسابك موجود. وإن خرجتِ، ادخلي من
            «تسجيل الدخول» بنفس الرقم وكلمة المرور.
          </p>
        </div>
      ) : (
      <div
        className="card-3d w-full max-w-md p-8 mt-6 animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <div className="gold-thread w-24 mx-auto mb-6" aria-hidden="true" />

        <h1 className="text-2xl font-black text-sage-deep text-center">
          إنشاء حساب جديد
        </h1>
        <p className="mt-2 text-center text-ink/60 text-sm leading-relaxed">
          سجّل حسابك في غراس المعلم — الاشتراك يُفعَّل بعد الدفع
        </p>

        <div className="mt-7 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-bold text-ink/80 mb-1.5">
              الاسم الكامل
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
              placeholder="مثال: نورة أحمد"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-bold text-ink/80 mb-1.5">
              رقم الجوال <span className="text-ink/45 font-medium">(للدخول)</span>
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`${inputCls} text-left`}
              placeholder="٩٩١٢٣٤٥٦"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-bold text-ink/80 mb-1.5">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} text-left`}
              placeholder="•••••••• (٦ خانات على الأقل)"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-bold text-ink/80 mb-1.5">
              الإيميل{' '}
              <span className="text-ink/45 font-medium">(اختياري — للإيصالات واستعادة كلمة السر)</span>
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} text-left`}
              placeholder="name@example.com"
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
            {loading ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
          </button>

          <p className="text-center text-sm text-ink/60">
            لديك حساب؟{' '}
            <Link href="/login" className="font-bold text-sage-dark hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>
      )}

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
