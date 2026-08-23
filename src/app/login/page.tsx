'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import PasswordField from '@/components/PasswordField';
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

  /**
   * ⚠️ **إعادةُ توجيهٍ مفتوحة — `next` يأتي من الرابط لا من مولِّداتنا.**
   *
   * كان يُدفع إلى `router.push` كما هو، فرابطٌ مصنوع يُخرج المشتركة من
   * غراس **بعد** أن تُدخل بياناتها — وهي أخطر لحظةٍ تُنقل فيها، لأنها
   * تظنّ أنها ما زالت عندنا.
   *
   * ⚠️ و`startsWith('/')` لا يكفي: `//x.com` و`/\x.com` و`\t//x.com`
   * كلها تبدأ بشرطةٍ مائلة وتُحلّ خارج غراس. ومثلها `%2F%2Fx.com` —
   * فـ`searchParams.get` يفكّ ترميزه إلى `//x.com` قبل أن نراه.
   *
   * فنسأل المُحلِّل نفسه: إن اختلف الأصل رفضنا، وإلا أخذنا المسار
   * والاستعلام والمرساة — لا القيمة الخام.
   */
  function safeNext(raw: string) {
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return '/';
      return u.pathname + u.search + u.hash;
    } catch {
      return '/';
    }
  }

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** ترحيبٌ بعد نجاح الدخول — تأكيدٌ كان غائبًا فكلّفنا يومين. */
  const [welcome, setWelcome] = useState<
    { name: string; subEnd: string | null; isAdmin: boolean } | null
  >(null);

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
        setMessage('محاولاتٌ كثيرة في وقتٍ قصير — يرجى الانتظار دقائق ثم إعادة المحاولة');
      else if (code === 'email_not_confirmed')
        setMessage('الحساب لم يُفعَّل بعد — يرجى التواصل مع إدارة المنصة');
      else if (code === 'user_banned')
        setMessage('هذا الحساب موقوف — يرجى التواصل مع إدارة المنصة');
      else
        setMessage(
          `تعذّر الدخول — يرجى التواصل مع إدارة المنصة${code || status ? ` (رمز: ${code || status})` : ''}`
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
          : `تعذّر قراءة بيانات حسابك — يرجى التواصل مع إدارة المنصة${code ? ` (رمز: ${code})` : ''}`
      );
      setLoading(false);
      return;
    }

    if (profile.status === 'suspended') {
      await supabase.auth.signOut();
      setMessage('هذا الحساب موقوف — يرجى التواصل مع إدارة المنصة');
      setLoading(false);
      return;
    }

    /**
     * ⚠️ **انقضاءُ `sub_end` لا يُقفل الحساب.**
     *
     * كان الدخول يُمنع لمجرّد انقضاء تاريخ المحتوى — فيُقفَل الحساب كلّه
     * لانقضاء منتجٍ واحد. ومن اشترى الاستوديو وحده كان يُمنع لأنه لم
     * يشترِ المواد، ومن انقضى محتواه لم يستطع أن يرى ماذا انقضى ولا أن
     * يجدّد، فلا يبقى له إلا الاتصال بالإدارة أو الانصراف.
     *
     * وبقيّة المنصّة تعمل بغير ذلك أصلًا: الأدوات يحرسها `*_until`،
     * والاستوديو `studio_until`، والألعاب رصيدُها، والمواد
     * `can_access_subject` التي تشترط `active` وتاريخًا وصلاحية. فكلٌّ
     * محروسٌ بنفسه — والحاجز هنا كان يقفل الباب الخارجي عليها جميعًا.
     *
     * فصار `status` حالةَ حسابٍ إدارية لا حالةَ اشتراك.
     *
     * ⚠️ و`'expired'` قيمةٌ لا يكتبها النظام في أي موضع — تُوضع يدويًّا
     * وحدها. فتُعامَل حالةً استثنائية تُمنع، ولا تُنسب إلى انقضاء تاريخ،
     * ورسالتُها عامّة لئلا تتّهم اشتراكًا قد يكون ساريًا.
     *
     * ⚠️ ويبقى «الموقوف» على حاله للجميع — الأدمِن معه: ذاك إيقافٌ
     * مقصودٌ بقرار.
     */
    if (profile.role !== 'admin' && profile.status !== 'active') {
      await supabase.auth.signOut();
      setMessage('هذا الحساب غير متاح حاليًا — يرجى التواصل مع إدارة غراس المعلم');
      setLoading(false);
      return;
    }

    /**
     * 3) السجلّ والنشاط — **بأفضل جهد، ومستقلَّين، ولا يحبسان الدخول.**
     *
     * ⚠️ مصادقةٌ نجحت لا ينقضها فشلُ سطرٍ إحصائي. ولا يُنتظَران:
     * شاشة الترحيب تُبقي الصفحة قائمة فيتمّان في خلفيتها.
     *
     * ⚠️ **ولا يُجمعان في نداءٍ واحد**: سقوطُ أحدهما شبكيًّا كان يُسقط
     * الآخر معه، وهما لا علاقة لأحدهما بالآخر.
     *
     * ⚠️ ولا يُبتلع الفشل: Supabase **يُرجع** الخطأ ولا يرميه
     * (`shouldThrowOnError = false`) — فـ`catch` وحده لا يراه.
     * ويُفحص `error` صراحةً، ويُسجَّل **رمزه وحده**: لا كائن خطأ،
     * ولا استجابة، ولا ترويسات، ولا جلسة، ولا بيانات مستخدم.
     *
     * ⚠️ وهذا رصدٌ في وحدة المتصفح فقط — الرصد المركزي يأتي لاحقًا.
     */
    void supabase
      .from('login_logs')
      .insert({
        user_id: auth.user.id,
        username: uname,
        success: true,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      .then(
        ({ error }) => {
          if (error) console.error('[LOGIN_LOG_FAILED]', error.code || 'unknown');
        },
        () => console.error('[LOGIN_LOG_NETWORK_FAILED]')
      );

    void supabase
      .rpc('touch_last_active')
      .then(
        ({ error }) => {
          if (error) console.error('[LAST_ACTIVE_FAILED]', error.code || 'unknown');
        },
        () => console.error('[LAST_ACTIVE_NETWORK_FAILED]')
      );

    /**
     * 4) ترحيبٌ ثم انتقال.
     *
     * ⚠️ **لا يُنقَل الداخلُ بلا كلمة.** كان الدخول الناجح يرميه إلى
     * الصفحة الرئيسية صامتًا، فلا يدري أدخل أم رُدَّ — وهذا ما عاشته
     * مشتركةٌ يومين: تُدخل بياناتها الصحيحة ولا ترى ما يؤكّد شيئًا.
     *
     * فيُقال له باسمه إنه دخل، ومتى ينتهي اشتراكه، ثم ينتقل بيده.
     */
    setWelcome({
      name: profile.full_name || 'بك',
      // ⚠️ لا يُقال للأدمِن «اشتراكك ينتهي»: وصولُه لا ينقضي بتاريخ
      subEnd: profile.role === 'admin' ? null : (profile.sub_end ?? null),
      isAdmin: profile.role === 'admin',
    });
    setLoading(false);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      {welcome ? (
        <div
          className="card-3d w-full max-w-md p-8 mt-6 animate-float-in text-center"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="gold-thread w-24 mx-auto mb-6" aria-hidden="true" />
          <p className="text-4xl" aria-hidden>🌿</p>
          <h1 className="mt-3 text-2xl font-black text-sage-deep">
            أهلًا {welcome.name}
          </h1>
          <p className="mt-2 text-ink/70">تم الدخول بنجاح إلى غراس المعلم.</p>

          {/* ⚠️ يُقال متى ينتهي الاشتراك: خبرٌ يخصّها ولا تجده في مكان آخر.
              وللأدمِن لا يُقال — وصولُه لا ينقضي بتاريخ. */}
          {welcome.isAdmin && (
            <p className="mt-5 rounded-xl bg-sage/10 px-4 py-3 text-[0.88rem] font-bold text-sage-deep">
              وصولك كإدارة للمنصة — بلا تاريخ انتهاء
            </p>
          )}
          {welcome.subEnd && (
            <p className="mt-5 rounded-xl bg-sage/10 px-4 py-3 text-[0.88rem] font-bold text-sage-deep">
              اشتراكك سارٍ حتى{' '}
              {new Date(welcome.subEnd).toLocaleDateString('ar-KW', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              router.push(safeNext(next));
              router.refresh();
            }}
            className="mt-6 w-full rounded-xl bg-sage px-5 py-3 font-extrabold text-white transition-colors hover:bg-sage-dark"
          >
            الدخول إلى المنصة
          </button>
        </div>
      ) : (
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

          <PasswordField
            id="password"
            label="كلمة المرور"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full rounded-xl border border-sage/30 bg-white px-4 py-3 text-left focus:border-sage focus:ring-2 focus:ring-sage/25 outline-none transition"
            placeholder="••••••••"
          />

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
            نسيت كلمة السر؟ يمكن التواصل مع إدارة غراس المعلم
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
