'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import LogoutButton from './LogoutButton';

/**
 * شريط الحساب في الصفحة الرئيسية.
 *
 * ⚠️ **الرئيسية مخزَّنة مؤقتًا (`revalidate = 300`)** — نسخةٌ واحدة تُقدَّم
 * للجميع، فلا يستطيع الخادم أن يقرّر ما يُعرض حسب المستخدم. لذلك تُحسم
 * الهوية في المتصفح، كما كان يفعل `AdminLink`.
 *
 * ⚠️ **ولا يُعتمد على `router.refresh()` لتحديث هذا الشريط.** توثيق Next
 * صريح: التحديث يدمج حمولة الخادم *«بلا فقدان حالة العميل مثل
 * `useState`»* — فلا تُصفَّر الحالة ولا يُعاد تشغيل `useEffect`. وكان
 * الأثر أن الخارجَ يُقال له إنه داخل حتى يُعيد تحميل الصفحة كاملة.
 * فالمصدر الآن `onAuthStateChange` من Supabase نفسه.
 *
 * ⚠️ **وحسابٌ بلا اشتراك ليس حسابًا معطوبًا.** في غراس من يُنشئ حسابًا
 * ليقرأ القرآن ويستمع إليه، ولا يشتري شيئًا. فيُعرض داخلًا باسمه ورقمه،
 * ويُقال إن لا اشتراكَ ساريًا — **ولا يُعرض زائرًا ولا يُطرد.**
 *
 * ⚠️ **والسجلّ في وحدة المتصفح لا على الخادم** — هذا مكوّن عميل.
 * فلا يُطبع فيه بريدٌ ولا معرّفٌ ولا اسمٌ ولا جلسة: رمزٌ عامّ لا غير.
 */

type Fault = 'PROFILE_ERROR' | 'PROFILE_MISSING' | 'UNKNOWN_STATUS';

type State =
  | { k: 'loading' }
  | { k: 'guest' }
  | { k: 'fault'; why: Fault }
  | { k: 'suspended' }
  | {
      k: 'user';
      name: string;
      username: string | null;
      isAdmin: boolean;
      /** تاريخ انتهاء الاشتراك — `null` لمن لا اشتراك له، ولا يُعرض للأدمِن */
      subEnd: string | null;
    };

/** DD/MM/YYYY */
function fmt(d: string) {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}`;
}

function isFuture(d: string | null): boolean {
  if (!d) return false;
  const t = new Date(d);
  return !Number.isNaN(t.getTime()) && t >= new Date(new Date().toDateString());
}

export default function AccountBar() {
  const [s, setS] = useState<State>({ k: 'loading' });
  const alive = useRef(true);
  /** آخر مستخدمٍ حُمِّل ملفُّه — يمنع استعلامًا مكرّرًا مع كل تجديد رمز */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    const supabase = createClient();

    async function load(uid: string) {
      const { data: p, error } = await supabase
        .from('profiles')
        .select('full_name, username, role, status, sub_end')
        .eq('id', uid)
        .maybeSingle();
      if (!alive.current) return;

      if (error || !p) {
        const why: Fault = error ? 'PROFILE_ERROR' : 'PROFILE_MISSING';
        console.error('[ACCOUNT_BAR_FAULT]', why);
        return setS({ k: 'fault', why });
      }

      if (p.status === 'suspended') return setS({ k: 'suspended' });

      // ⚠️ رفضُ عرضٍ آمن لما لا نعرفه: حالةٌ غير معروفة لا تُعرض اشتراكًا
      //    ساريًا ولا لوحةَ إدارة — الـenum اليوم ثلاثٌ، وقد يزيد غدًا.
      if (p.status !== 'active' && p.status !== 'expired') {
        console.error('[ACCOUNT_BAR_FAULT]', 'UNKNOWN_STATUS');
        return setS({ k: 'fault', why: 'UNKNOWN_STATUS' });
      }

      const isAdmin = p.role === 'admin';
      // ⚠️ `status = 'expired'` قرارٌ مسجَّل — يُعامَل كغياب اشتراك في العرض
      const valid = p.status === 'active' && isFuture(p.sub_end ?? null);

      setS({
        k: 'user',
        name: p.full_name || '',
        username: p.username ?? null,
        isAdmin,
        // ⚠️ لا تاريخَ للأدمِن: وصولُه لا ينقضي به، وعرضُه يوهم بانقضاءٍ لا يقع
        subEnd: isAdmin || !valid ? null : (p.sub_end ?? null),
      });
    }

    // ⚠️ `INITIAL_SESSION` يُطلَق عند الاشتراك بجلسةٍ أو بـ`null`
    //    (auth-js 2.112.3) — فلا حاجة لنداءٍ أوّليّ منفصل، ولا استعلامَ مزدوج.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive.current) return;
      const user = session?.user;

      if (!user) {
        loadedFor.current = null;
        return setS({ k: 'guest' });
      }
      // تجديدُ الرمز يُطلق الحدث دوريًّا — ولا داعي لإعادة قراءة الملف
      if (loadedFor.current === user.id) return;
      loadedFor.current = user.id;
      void load(user.id);
    });

    return () => {
      alive.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // مساحةٌ محجوزة بالارتفاع نفسه — تمنع القفز
  const shell =
    'w-full flex flex-wrap items-center justify-start gap-x-2.5 gap-y-2 px-5 pt-5 min-h-[62px]';

  if (s.k === 'loading') return <header className={shell} aria-busy="true" />;

  if (s.k === 'guest')
    return (
      <header className={shell}>
        <Link
          href="/register"
          className="rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold text-sm px-5 py-2.5 shadow-soft transition-all"
        >
          إنشاء حساب
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-5 py-2.5 transition-all"
        >
          دخول
        </Link>
      </header>
    );

  if (s.k === 'suspended')
    return (
      <header className={shell}>
        <span className="text-sm font-bold text-ink/70">الحساب موقوف</span>
        <LogoutButton />
      </header>
    );

  if (s.k === 'fault')
    return (
      <header className={shell}>
        <span className="text-sm font-bold text-ink/60">
          {s.why === 'UNKNOWN_STATUS'
            ? 'تعذّر قراءة حالة الحساب'
            : 'تعذّر قراءة بيانات الحساب'}
        </span>
        <LogoutButton />
      </header>
    );

  const date = s.subEnd ? fmt(s.subEnd) : null;

  return (
    <header className={shell}>
      <span className="text-sm font-bold text-sage-deep">
        مرحبًا، {s.name || s.username || 'بك'}
      </span>

      {s.username && (
        <span className="text-xs text-ink/45" dir="ltr">
          {s.username}
        </span>
      )}

      {s.isAdmin ? (
        <>
          <span className="rounded-lg bg-gold-light/70 px-2.5 py-1 text-xs font-bold text-gold-dark">
            وصول الإدارة
          </span>
          <Link
            href="/admin"
            className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-4 py-2 transition-all"
          >
            لوحة التحكم
          </Link>
        </>
      ) : date ? (
        <span className="text-xs text-ink/55">
          الاشتراك حتى <b className="text-ink/75">{date}</b>
        </span>
      ) : (
        <span className="text-xs text-ink/55">لا يوجد اشتراك ساري حاليًا</span>
      )}

      <LogoutButton />
    </header>
  );
}
