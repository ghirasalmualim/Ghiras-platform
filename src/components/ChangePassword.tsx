'use client';

import { useState } from 'react';
import { createClient, usernameToEmail } from '@/lib/supabase/client';
import PasswordField from './PasswordField';

/**
 * تغيير كلمة المرور — الجزء الوحيد من «حسابي» الذي يكتب شيئًا.
 *
 * ── لماذا ──
 * لم يكن للمشترك سبيلٌ إلى تغيير كلمته: يدخل برقم جواله لا ببريدٍ حقيقي،
 * فلا رسالةَ استعادة تصله. وكان كلُّ نسيانٍ يمرّ بصاحبة المنصة تولّد له
 * كلمةً مؤقتة — وذلك يوقفه حتى تردّ عليه.
 *
 * ⚠️ وتُطلب الكلمة الحالية قبل التغيير، ولو كانت الجلسة قائمة: جهازٌ
 * يُترك مفتوحًا في غرفة المعلّمات يكفي غيرَ صاحبه لتبديل كلمته وإخراجه
 * من حسابه. فالجلسة تُثبت أنه دخل، ولا تُثبت أنه هو الجالس الآن.
 *
 * ⚠️ والمنطق منقولٌ حرفًا من `/account` السابقة ولم يُضعَّف: تحقّقٌ
 * بـ`signInWithPassword` ثم `updateUser`. ولا تُطبع كلمةٌ في أي سجلّ.
 */

const MIN_LEN = 8;

export default function ChangePassword({ username }: { username: string | null }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    <div className="card-3d mt-5 p-6">
      <h2 className="text-lg font-extrabold text-ink">الأمان — تغيير كلمة المرور</h2>
      <p className="mt-1 text-[0.82rem] text-ink/55">
        {MIN_LEN} أحرف على الأقل. اكتبها في مكان يسهل تذكّره.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <PasswordField
          label="كلمة المرور الحالية"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 outline-none focus:border-sage"
          labelClassName="mb-1.5 block text-sm font-bold text-ink/80"
        />
        <PasswordField
          label="كلمة المرور الجديدة"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 outline-none focus:border-sage"
          labelClassName="mb-1.5 block text-sm font-bold text-ink/80"
        />
        <PasswordField
          label="أعِد كتابة الجديدة"
          value={again}
          onChange={setAgain}
          autoComplete="new-password"
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 outline-none focus:border-sage"
          labelClassName="mb-1.5 block text-sm font-bold text-ink/80"
        />
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${
            msg.ok ? 'bg-sage/10 text-sage-deep' : 'bg-gold-light/70 text-gold-dark'
          }`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-sage px-5 py-3 font-extrabold text-white shadow-soft transition-colors hover:bg-sage-dark disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
      </button>
    </div>
  );
}
