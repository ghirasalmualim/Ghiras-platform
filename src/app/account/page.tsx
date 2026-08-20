'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, usernameToEmail } from '@/lib/supabase/client';

/**
 * حسابي — تغيير كلمة المرور.
 *
 * ── لماذا ──
 * لم يكن للمشترك سبيلٌ إلى تغيير كلمته: يدخل برقم جواله لا ببريدٍ
 * حقيقي، فلا رسالةَ استعادة تصله. وكان كلُّ نسيانٍ يمرّ بصاحبة
 * المنصة تولّد له كلمةً مؤقتة — وذلك يوقفه حتى تردّ عليه.
 *
 * ⚠️ وتُطلب الكلمة الحالية قبل التغيير، ولو كانت الجلسة قائمة:
 * جهازٌ يُترك مفتوحًا في غرفة المعلّمات يكفي غيرَ صاحبه لتبديل
 * كلمته وإخراجه من حسابه. فالجلسة تُثبت أنه دخل، ولا تُثبت أنه هو
 * الجالس الآن.
 */

const MIN_LEN = 8;

export default function AccountPage() {
  const router = useRouter();

  const [username, setUsername] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/login?next=/account');
        return;
      }
      // البريد داخليّ مبنيّ من رقم الجوال — نعرضه رقمًا كما يعرفه صاحبه
      setUsername((data.user.email || '').split('@')[0] || null);
      const { data: p } = await sb
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .single();
      setName(p?.full_name ?? null);
    });
  }, [router]);

  async function submit() {
    if (busy) return;
    setMsg(null);

    if (!current || !next) return setMsg({ ok: false, text: 'اكتب كلمة المرور الحالية والجديدة' });
    if (next.length < MIN_LEN)
      return setMsg({ ok: false, text: `كلمة المرور الجديدة ${MIN_LEN} أحرف على الأقل` });
    if (next !== again) return setMsg({ ok: false, text: 'الكلمتان غير متطابقتين' });
    if (next === current) return setMsg({ ok: false, text: 'الكلمة الجديدة مثل الحالية' });

    setBusy(true);
    const sb = createClient();

    // ١) إثبات أن الجالس الآن هو صاحب الحساب
    const { data: me } = await sb.auth.getUser();
    const email = me.user?.email || (username ? usernameToEmail(username) : '');
    const { error: wrong } = await sb.auth.signInWithPassword({ email, password: current });
    if (wrong) {
      setBusy(false);
      return setMsg({ ok: false, text: 'كلمة المرور الحالية غير صحيحة' });
    }

    // ٢) التغيير
    const { error } = await sb.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'ما تغيّرت — جرّب مرة ثانية' });

    setCurrent('');
    setNext('');
    setAgain('');
    setMsg({ ok: true, text: '✅ تغيّرت كلمة المرور. استعملها في الدخول القادم.' });
  }

  return (
    <main className="min-h-dvh px-5 py-10" dir="rtl">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="text-sm font-bold text-ink/55 hover:text-sage-deep">
          <span aria-hidden>→</span> الرئيسية
        </Link>

        <h1 className="mt-5 text-2xl font-black text-sage-deep">حسابي</h1>
        {(name || username) && (
          <p className="mt-1 text-sm text-ink/60">
            {name ? <b className="text-ink">{name}</b> : null}
            {name && username ? ' · ' : null}
            {username}
          </p>
        )}

        <div className="card-3d mt-6 p-6">
          <h2 className="text-lg font-extrabold text-ink">تغيير كلمة المرور</h2>
          <p className="mt-1 text-[0.82rem] text-ink/55">
            {MIN_LEN} أحرف على الأقل. اكتبها في مكان تتذكّره.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <Field label="كلمة المرور الحالية" value={current} onChange={setCurrent} autoComplete="current-password" />
            <Field label="كلمة المرور الجديدة" value={next} onChange={setNext} autoComplete="new-password" />
            <Field label="أعِد كتابة الجديدة" value={again} onChange={setAgain} autoComplete="new-password" />
          </div>

          {msg && (
            <p
              className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${
                msg.ok ? 'bg-sage/10 text-sage-deep' : 'bg-red-50 text-red-700'
              }`}
            >
              {msg.text}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-sage px-5 py-3 font-extrabold text-white transition-colors hover:bg-sage-dark disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ…' : 'احفظ كلمة المرور'}
          </button>
        </div>

        <p className="mt-4 text-center text-[0.78rem] text-ink/45">
          نسيت كلمتك الحالية؟ تواصل مع إدارة المنصة لتوليد كلمة مؤقتة.
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink/80">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 outline-none focus:border-sage"
      />
    </label>
  );
}
