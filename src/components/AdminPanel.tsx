'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { createClient } from '@/lib/supabase/client';

type Row = {
  id: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  status: string;
  sub_end: string | null;
  gradebook_until: string | null;
  last_active: string | null;
  created_at: string | null;
  access: string | null;
};

type Cat = {
  stage_id: string;
  stage_name: string;
  grade_id: string | null;
  grade_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
};

export default function AdminPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cat, setCat] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, { target?: string; subject?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) {
      setMsg('تعذّر تحميل القائمة: ' + error.message);
      setRows([]);
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  }, []);

  const loadCatalog = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc('admin_catalog');
    setCat((data as Cat[]) || []);
  }, []);

  useEffect(() => {
    load();
    loadCatalog();
  }, [load, loadCatalog]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function act(id: string, run: () => any, ok: string) {
    setBusy(id);
    setMsg(null);
    const { error } = await run();
    setBusy(null);
    if (error) setMsg('تعذّر: ' + error.message);
    else {
      setMsg(ok);
      load();
    }
  }

  const grantAll = (id: string) => {
    if (!confirm('منح هذا الحساب وصولاً كاملاً لكل المواد + الدفتر لمدة ٦ أشهر مجاناً؟')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_grant', { p_user: id, p_kind: 'all', p_months: 6 }), 'تم منح وصول كامل ٦ أشهر ✅');
  };
  const grantGb = (id: string) => {
    if (!confirm('منح هذا الحساب وصول دفتر الدرجات لمدة ٦ أشهر مجاناً؟')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_grant', { p_user: id, p_kind: 'gradebook', p_months: 6 }), 'تم منح الدفتر ٦ أشهر ✅');
  };
  const grantSpecific = (id: string) => {
    const sv = sel[id];
    if (!sv || !sv.target) {
      setMsg('اختاري المرحلة أو الصف أولاً');
      return;
    }
    const supabase = createClient();
    if (sv.target.startsWith('stage:')) {
      const sid = sv.target.slice(6);
      act(id, () => supabase.rpc('admin_grant', { p_user: id, p_kind: 'stage', p_stage: sid, p_months: 6 }), 'تم منح المرحلة ٦ أشهر ✅');
    } else if (sv.target.startsWith('grade:')) {
      const gid = sv.target.slice(6);
      if (sv.subject) {
        act(id, () => supabase.rpc('admin_grant', { p_user: id, p_kind: 'subject', p_subject: sv.subject, p_months: 6 }), 'تم منح المادة ٦ أشهر ✅');
      } else {
        act(id, () => supabase.rpc('admin_grant', { p_user: id, p_kind: 'grade', p_grade: gid, p_months: 6 }), 'تم منح الصف ٦ أشهر ✅');
      }
    }
  };
  const suspend = (id: string) => {
    if (!confirm('إيقاف هذا الحساب؟ لن يتمكن من الدخول للمحتوى.')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_set_status', { p_user: id, p_status: 'suspended' }), 'تم إيقاف الحساب');
  };
  const reactivate = (id: string) => {
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_set_status', { p_user: id, p_status: 'active' }), 'تم إعادة تفعيل الحساب');
  };

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ar-KW') : '—');
  const stillValid = (s: string | null) => !!s && new Date(s) > new Date();

  const stages = Array.from(new Map(cat.map((c) => [c.stage_id, c.stage_name])).entries()).map(([id, name]) => ({ id, name }));
  const gradesByStage: Record<string, { id: string; name: string }[]> = {};
  const subjectsByGrade: Record<string, { id: string; name: string }[]> = {};
  for (const c of cat) {
    if (c.grade_id) {
      const list = (gradesByStage[c.stage_id] = gradesByStage[c.stage_id] || []);
      if (!list.some((g) => g.id === c.grade_id)) list.push({ id: c.grade_id, name: c.grade_name || '' });
    }
    if (c.subject_id && c.grade_id) {
      const list = (subjectsByGrade[c.grade_id] = subjectsByGrade[c.grade_id] || []);
      if (!list.some((s) => s.id === c.subject_id)) list.push({ id: c.subject_id, name: c.subject_name || '' });
    }
  }

  const filtered = rows.filter(
    (r) =>
      !q ||
      (r.full_name || '').includes(q) ||
      (r.username || '').includes(q) ||
      (r.phone || '').includes(q) ||
      (r.email || '').includes(q)
  );
  const teachers = filtered.filter((r) => r.role !== 'admin');

  const selCls = 'rounded-lg border border-sage/30 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sage';

  return (
    <main className="min-h-dvh px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <header className="flex items-center gap-3 flex-wrap">
        <Logo size={44} />
        <div>
          <h1 className="text-2xl font-black text-sage-deep">لوحة التحكم</h1>
          <p className="text-sm text-ink/55">إدارة المشتركين والتفعيل المجاني</p>
        </div>
        <div className="flex-1" />
        <Link href="/" className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-bold text-sm px-4 py-2 transition">
          ← الرئيسية
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو الجوال أو الإيميل…"
          className="flex-1 min-w-[200px] rounded-xl border border-sage/30 bg-white px-4 py-2.5 outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition"
        />
        <button onClick={load} className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-bold text-sm px-4 py-2.5 transition">
          ↻ تحديث
        </button>
        <span className="text-sm text-ink/55 font-bold">{loading ? 'جارٍ التحميل…' : `${teachers.length} حساب`}</span>
      </div>

      {msg && <p className="mt-4 rounded-xl bg-gold-light/70 text-gold-dark text-sm font-bold px-4 py-3 text-center">{msg}</p>}

      <div className="mt-5 space-y-3">
        {teachers.map((r) => {
          const contentOk = r.status === 'active' && stillValid(r.sub_end) && (r.access || '').length > 0;
          const gbOk = r.status !== 'suspended' && stillValid(r.gradebook_until);
          const isBusy = busy === r.id;
          const sv = sel[r.id] || {};
          const gid = sv.target && sv.target.startsWith('grade:') ? sv.target.slice(6) : '';
          return (
            <div key={r.id} className="card-3d p-5">
              <div className="flex-1 min-w-[220px]">
                <div className="font-extrabold text-ink text-lg">{r.full_name || '—'}</div>
                <div className="text-sm text-ink/60 mt-0.5" dir="ltr" style={{ textAlign: 'right' }}>
                  📱 {r.phone || r.username || '—'}
                  {r.email ? ` · ✉️ ${r.email}` : ''}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 text-xs font-bold">
                  <span className={`px-2 py-0.5 rounded-full ${r.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-sage-light text-sage-deep'}`}>
                    {r.status === 'suspended' ? 'موقوف' : r.status === 'expired' ? 'منتهٍ' : 'فعّال'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${contentOk ? 'bg-sage-light text-sage-deep' : 'bg-gray-50 text-ink/50 border border-gray-200'}`}>
                    المحتوى: {contentOk ? 'مفتوح حتى ' + fmt(r.sub_end) : 'مقفول'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${gbOk ? 'bg-gold-light text-gold-dark' : 'bg-gray-50 text-ink/50 border border-gray-200'}`}>
                    الدفتر: {gbOk ? 'حتى ' + fmt(r.gradebook_until) : 'مقفول'}
                  </span>
                  {r.access ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">صلاحيات: {r.access}</span> : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  className={selCls}
                  value={sv.target || ''}
                  onChange={(e) => setSel({ ...sel, [r.id]: { target: e.target.value, subject: '' } })}
                >
                  <option value="">اختاري المرحلة / الصف…</option>
                  {stages.map((st) => (
                    <optgroup key={st.id} label={st.name}>
                      <option value={`stage:${st.id}`}>كل {st.name}</option>
                      {(gradesByStage[st.id] || []).map((g) => (
                        <option key={g.id} value={`grade:${g.id}`}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {gid && (
                  <select
                    className={selCls}
                    value={sv.subject || ''}
                    onChange={(e) => setSel({ ...sel, [r.id]: { ...sv, subject: e.target.value } })}
                  >
                    <option value="">كل مواد الصف</option>
                    {(subjectsByGrade[gid] || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                <button disabled={isBusy} onClick={() => grantSpecific(r.id)}
                  className="rounded-lg bg-sage-dark hover:bg-sage-deep text-white font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  منح المحدَّد ٦ أشهر
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                <button disabled={isBusy} onClick={() => grantAll(r.id)}
                  className="rounded-lg bg-sage hover:bg-sage-dark text-white font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  ＋ وصول كامل ٦ أشهر
                </button>
                <button disabled={isBusy} onClick={() => grantGb(r.id)}
                  className="rounded-lg bg-gold hover:bg-gold-dark text-white font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  ＋ الدفتر ٦ أشهر
                </button>
                {r.status === 'suspended' ? (
                  <button disabled={isBusy} onClick={() => reactivate(r.id)}
                    className="rounded-lg border border-sage/40 bg-white hover:border-sage text-sage-deep font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                    إعادة تفعيل
                  </button>
                ) : (
                  <button disabled={isBusy} onClick={() => suspend(r.id)}
                    className="rounded-lg border border-gray-200 bg-white hover:border-red-400 text-red-600 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                    إيقاف
                  </button>
                )}
                {isBusy && <span className="text-sm text-ink/50 self-center">جارٍ…</span>}
              </div>
            </div>
          );
        })}

        {!loading && teachers.length === 0 && (
          <div className="card-3d p-10 text-center text-ink/55">لا توجد حسابات مطابقة.</div>
        )}
      </div>
    </main>
  );
}
