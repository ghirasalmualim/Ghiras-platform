'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * «إدارة المدرسة» — المرحلة ١: لوحة + معالج إعداد + إدارة الهيكل (مراحل/صفوف/فصول).
 * كل العمليات عبر عميل Supabase مباشرةً؛ القاعدة (RLS + school_create) هي الحكم.
 * الأقسام الأخرى تظهر كبطاقات «قريبًا» وتُفعَّل في المراحل التالية.
 */

const DISP = { fontFamily: "var(--font-cairo), 'Tajawal', sans-serif" } as const;

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const IPT = 'w-full rounded-xl border border-sage/25 p-2.5 text-sm bg-white focus:outline-none focus:border-sage';

type School = { id: string; name: string; academic_year: string | null; term: string | null; work_days: number[] };
type Stage = { id: string; name: string; sort: number };
type Grade = { id: string; stage_id: string; name: string; sort: number };
type Klass = { id: string; grade_id: string; name: string; sort: number; archived: boolean };
type Dept = { id: string; name: string; head_member_id: string | null; sort: number };
type Member = { id: string; user_id: string; name: string | null; role: string; department_id: string | null };

const ROLE_LABEL: Record<string, string> = {
  admin: 'مسؤولة المدرسة',
  principal: 'مديرة المدرسة',
  deputy: 'مديرة مساعدة',
  coordinator: 'رئيسة شعبة',
  supervisor: 'مشرفة',
  student_affairs: 'شؤون الطلبة',
  teacher: 'معلمة',
};

/** أرقام عربية → إنجليزية + نزع مفتاح 965 (الحسابات مبنية على التلفون). */
const normLogin = (raw: string) => {
  const t = (raw || '').trim();
  if (t.includes('@')) return t.toLowerCase();
  const en = t.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)));
  if (/^\+?\d[\d\s-]*$/.test(en)) {
    let d = en.replace(/\D/g, '');
    if (d.length > 8 && d.startsWith('965')) d = d.slice(3);
    return d;
  }
  return t;
};

const SECTIONS: { key: string; label: string; emoji: string; soon?: boolean }[] = [
  { key: 'structure', label: 'الهيكل المدرسي', emoji: '🏫' },
  { key: 'departments', label: 'الشُّعب والمعلمات', emoji: '👩🏻‍🏫' },
  { key: 'students', label: 'الصفوف والمتعلمات', emoji: '👧🏻', soon: true },
  { key: 'timetable', label: 'الجدول المدرسي', emoji: '📅', soon: true },
  { key: 'smart', label: 'إنشاء الجدول الذكي', emoji: '✨', soon: true },
  { key: 'substitution', label: 'الاحتياط', emoji: '🔄', soon: true },
  { key: 'duty', label: 'المناوبات', emoji: '📍', soon: true },
  { key: 'supervision', label: 'الإشراف الإداري', emoji: '👩🏻‍💼', soon: true },
  { key: 'attendance', label: 'الحضور والغياب والتأخير', emoji: '✅', soon: true },
  { key: 'staff', label: 'دوام الهيئة التعليمية', emoji: '🗓️', soon: true },
  { key: 'permissions', label: 'المستخدمون والصلاحيات', emoji: '🔐', soon: true },
];

type SchoolRow = { id: string; name: string; subscription_until: string | null; role: string };

const subActive = (until: string | null) => !!until && new Date(until) > new Date();

export default function SchoolApp({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [schoolsList, setSchoolsList] = useState<SchoolRow[] | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>('teacher');
  const [school, setSchool] = useState<School | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'dash' | 'structure' | 'departments'>('dash');
  const [toast, setToast] = useState('');

  const canManage = isAdmin || myRole === 'admin' || myRole === 'principal';
  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2600);
  };

  // ── قائمة المدارس (الأدمِن: الكل؛ العضو: مدارسه) ──────────────
  const loadSchools = useCallback(async () => {
    if (isAdmin) {
      const { data } = await supabase.from('schools').select('id,name,subscription_until').order('created_at');
      setSchoolsList((data || []).map((s) => ({ ...(s as { id: string; name: string; subscription_until: string | null }), role: 'admin' })));
    } else {
      const { data } = await supabase
        .from('school_members')
        .select('role, school:school_id(id,name,subscription_until)')
        .order('created_at');
      const rows = (data || [])
        .map((m) => {
          const s = m.school as unknown as { id: string; name: string; subscription_until: string | null } | null;
          return s ? { id: s.id, name: s.name, subscription_until: s.subscription_until, role: (m as { role: string }).role } : null;
        })
        .filter(Boolean) as SchoolRow[];
      setSchoolsList(rows);
    }
  }, [supabase, isAdmin]);
  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  // ── منح/إيقاف اشتراك مدرسة (أدمِن) ────────────────────────────
  const setSubscription = async (sid: string, months: number) => {
    const { error } = await supabase.rpc('school_set_subscription', { p_school: sid, p_months: months });
    if (error) return showToast('تعذّرت العملية');
    showToast(months > 0 ? 'تم منح اشتراك سنة ✅' : 'تم إيقاف الاشتراك');
    loadSchools();
  };

  // ── فتح مدرسة للإدارة ─────────────────────────────────────────
  const openSchool = (row: SchoolRow) => {
    if (!isAdmin && !subActive(row.subscription_until)) {
      showToast('اشتراك المدرسة منتهٍ — تواصلي مع الإدارة');
      return;
    }
    setMyRole(row.role);
    setView('dash');
    setSchoolId(row.id);
  };

  const loadMembersDepts = useCallback(
    async (sid: string) => {
      const [dp, mb] = await Promise.all([
        supabase.from('school_departments').select('id,name,head_member_id,sort').eq('school_id', sid).order('sort'),
        supabase.rpc('school_members_of', { p_school: sid }),
      ]);
      setDepts((dp.data as Dept[]) || []);
      setMembers((mb.data as Member[]) || []);
    },
    [supabase]
  );

  const load = useCallback(
    async (sid: string) => {
      setLoading(true);
      const [s, st, gr, cl] = await Promise.all([
        supabase.from('schools').select('id,name,academic_year,term,work_days').eq('id', sid).maybeSingle(),
        supabase.from('school_stages').select('id,name,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_grades').select('id,stage_id,name,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_classes').select('id,grade_id,name,sort,archived').eq('school_id', sid).order('sort'),
      ]);
      setSchool((s.data as School) || null);
      setStages((st.data as Stage[]) || []);
      setGrades((gr.data as Grade[]) || []);
      setClasses((cl.data as Klass[]) || []);
      await loadMembersDepts(sid);
      setLoading(false);
    },
    [supabase, loadMembersDepts]
  );

  useEffect(() => {
    if (schoolId) load(schoolId);
  }, [schoolId, load]);

  // ── إنشاء مدرسة (أدمِن فقط) ───────────────────────────────────
  const createSchool = async (name: string, year: string, term: string, days: number[]) => {
    const { data, error } = await supabase.rpc('school_create', {
      p_name: name,
      p_year: year || null,
      p_term: term || null,
      p_work_days: days,
    });
    if (error || !data) {
      showToast(/forbidden/i.test(error?.message || '') ? 'غير مصرّح — الأدمِن فقط' : 'تعذّر إنشاء المدرسة');
      return;
    }
    showToast('تم إنشاء المدرسة ✅');
    await loadSchools();
  };

  // ── عمليات الهيكل ─────────────────────────────────────────────
  const nextSort = (arr: { sort: number }[]) => (arr.length ? Math.max(...arr.map((a) => a.sort)) + 1 : 1);

  const addStage = async (name: string) => {
    const { data, error } = await supabase
      .from('school_stages')
      .insert({ school_id: schoolId, name, sort: nextSort(stages) })
      .select('id,name,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setStages((s) => [...s, data as Stage]);
  };
  const addGrade = async (stageId: string, name: string) => {
    const sib = grades.filter((g) => g.stage_id === stageId);
    const { data, error } = await supabase
      .from('school_grades')
      .insert({ school_id: schoolId, stage_id: stageId, name, sort: nextSort(sib) })
      .select('id,stage_id,name,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setGrades((g) => [...g, data as Grade]);
  };
  const addClass = async (gradeId: string, name: string) => {
    const sib = classes.filter((c) => c.grade_id === gradeId);
    const { data, error } = await supabase
      .from('school_classes')
      .insert({ school_id: schoolId, grade_id: gradeId, name, sort: nextSort(sib) })
      .select('id,grade_id,name,sort,archived')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setClasses((c) => [...c, data as Klass]);
  };
  const renameRow = async (table: string, id: string, name: string) => {
    const { error } = await supabase.from(table).update({ name }).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    if (table === 'school_stages') setStages((s) => s.map((x) => (x.id === id ? { ...x, name } : x)));
    if (table === 'school_grades') setGrades((g) => g.map((x) => (x.id === id ? { ...x, name } : x)));
    if (table === 'school_classes') setClasses((c) => c.map((x) => (x.id === id ? { ...x, name } : x)));
  };
  const delStage = async (id: string) => {
    const kids = grades.filter((g) => g.stage_id === id).length;
    if (!window.confirm(kids ? `هذه المرحلة فيها ${kids} صف. حذفها يحذف صفوفها وفصولها. متأكدة؟` : 'حذف المرحلة؟')) return;
    const { error } = await supabase.from('school_stages').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setStages((s) => s.filter((x) => x.id !== id));
    setGrades((g) => g.filter((x) => x.stage_id !== id));
  };
  const delGrade = async (id: string) => {
    const kids = classes.filter((c) => c.grade_id === id).length;
    if (!window.confirm(kids ? `هذا الصف فيه ${kids} فصل. حذفه يحذف فصوله. متأكدة؟` : 'حذف الصف؟')) return;
    const { error } = await supabase.from('school_grades').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setGrades((g) => g.filter((x) => x.id !== id));
    setClasses((c) => c.filter((x) => x.grade_id !== id));
  };
  const delClass = async (id: string) => {
    if (!window.confirm('حذف الفصل؟')) return;
    const { error } = await supabase.from('school_classes').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setClasses((c) => c.filter((x) => x.id !== id));
  };

  // ── عمليات الشُّعب والمعلمات ───────────────────────────────────
  const addDept = async (name: string) => {
    const { data, error } = await supabase
      .from('school_departments')
      .insert({ school_id: schoolId, name, sort: nextSort(depts) })
      .select('id,name,head_member_id,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setDepts((d) => [...d, data as Dept]);
  };
  const renameDept = async (id: string, name: string) => {
    const { error } = await supabase.from('school_departments').update({ name }).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setDepts((d) => d.map((x) => (x.id === id ? { ...x, name } : x)));
  };
  const delDept = async (id: string) => {
    if (!window.confirm('حذف الشعبة؟ (المعلمات يبقون بالمدرسة بلا شعبة)')) return;
    const { error } = await supabase.from('school_departments').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setDepts((d) => d.filter((x) => x.id !== id));
    setMembers((m) => m.map((x) => (x.department_id === id ? { ...x, department_id: null } : x)));
  };
  const setHead = async (deptId: string, memberId: string | null) => {
    const { error } = await supabase.from('school_departments').update({ head_member_id: memberId }).eq('id', deptId);
    if (error) return showToast('تعذّر التعيين');
    setDepts((d) => d.map((x) => (x.id === deptId ? { ...x, head_member_id: memberId } : x)));
  };
  const addMember = async (login: string, role: string, deptId: string | null) => {
    const { data, error } = await supabase.rpc('school_add_member', {
      p_school: schoolId,
      p_login: normLogin(login),
      p_role: role,
      p_dept: deptId,
    });
    if (error) return showToast('تعذّرت الإضافة');
    if (data === 'not_found') return showToast('ما لقينا حساب بهذا الرقم/الإيميل');
    showToast('تمت الإضافة ✅');
    if (schoolId) loadMembersDepts(schoolId);
  };
  const removeMember = async (id: string) => {
    if (!window.confirm('إزالة العضو من المدرسة؟')) return;
    const { error } = await supabase.from('school_members').delete().eq('id', id);
    if (error) return showToast('تعذّرت الإزالة');
    setMembers((m) => m.filter((x) => x.id !== id));
    setDepts((d) => d.map((x) => (x.head_member_id === id ? { ...x, head_member_id: null } : x)));
  };

  // ── العرض ─────────────────────────────────────────────────────
  if (!schoolId) {
    return (
      <Shell firstName={firstName} title="إدارة المدرسة">
        {schoolsList === null ? (
          <div className="text-center text-ink/50 py-16">…جارٍ التحميل</div>
        ) : (
          <SchoolsList
            schools={schoolsList}
            isAdmin={isAdmin}
            onOpen={openSchool}
            onCreate={createSchool}
            onGrant={(sid) => setSubscription(sid, 12)}
            onStop={(sid) => setSubscription(sid, 0)}
          />
        )}
        {toast ? <Toast text={toast} /> : null}
      </Shell>
    );
  }

  return (
    <Shell firstName={firstName} title={school?.name || 'إدارة المدرسة'}>
      <button onClick={() => setSchoolId(null)} className="mb-3 rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">
        ‹ كل المدارس
      </button>
      {loading ? (
        <div className="text-center text-ink/50 py-16">…جارٍ التحميل</div>
      ) : view === 'structure' ? (
        <StructureView
          stages={stages}
          grades={grades}
          classes={classes}
          canManage={canManage}
          onBack={() => setView('dash')}
          addStage={addStage}
          addGrade={addGrade}
          addClass={addClass}
          renameRow={renameRow}
          delStage={delStage}
          delGrade={delGrade}
          delClass={delClass}
        />
      ) : view === 'departments' ? (
        <DepartmentsView
          depts={depts}
          members={members}
          canManage={canManage}
          onBack={() => setView('dash')}
          addDept={addDept}
          renameDept={renameDept}
          delDept={delDept}
          setHead={setHead}
          addMember={addMember}
          removeMember={removeMember}
        />
      ) : (
        <Dashboard
          school={school}
          counts={{ stages: stages.length, grades: grades.length, classes: classes.length, depts: depts.length, members: members.length }}
          onOpen={(k) => {
            if (k === 'structure') setView('structure');
            else if (k === 'departments') setView('departments');
          }}
        />
      )}
      {toast ? <Toast text={toast} /> : null}
    </Shell>
  );
}

/* ───────────────────────── قائمة المدارس ───────────────────────── */
function SchoolsList({
  schools,
  isAdmin,
  onOpen,
  onCreate,
  onGrant,
  onStop,
}: {
  schools: SchoolRow[];
  isAdmin: boolean;
  onOpen: (s: SchoolRow) => void;
  onCreate: (name: string, year: string, term: string, days: number[]) => void;
  onGrant: (sid: string) => void;
  onStop: (sid: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const fmt = (u: string | null) => {
    if (!u) return null;
    const d = new Date(u);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <div className="space-y-3">
      {isAdmin ? (
        adding ? (
          <SetupWizard
            onCreate={(n, y, t, d) => {
              onCreate(n, y, t, d);
              setAdding(false);
            }}
          />
        ) : (
          <button onClick={() => setAdding(true)} className="w-full rounded-2xl bg-sage-deep text-white font-extrabold text-sm py-3 shadow-soft">
            ＋ إنشاء مدرسة
          </button>
        )
      ) : null}

      {schools.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-8 text-center text-ink/70">
          {isAdmin ? 'ما فيه مدارس بعد — أنشئي أول مدرسة.' : 'لا توجد مدرسة مرتبطة بحسابك بعد.'}
        </div>
      ) : (
        schools.map((s) => {
          const active = !!s.subscription_until && new Date(s.subscription_until) > new Date();
          return (
            <div key={s.id} className="card-3d bg-white rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center" aria-hidden="true">🏫</div>
                <div className="flex-1">
                  <div className="font-bold text-ink">{s.name}</div>
                  <div className="text-[12px] mt-0.5">
                    {active ? (
                      <span className="text-sage-deep">اشتراك سارٍ حتى {fmt(s.subscription_until)}</span>
                    ) : (
                      <span className="text-red-500">{s.subscription_until ? 'اشتراك منتهٍ' : 'بلا اشتراك'}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onOpen(s)}
                  className="rounded-lg bg-sage-deep text-white text-[12px] font-bold px-3 py-1.5 disabled:opacity-50"
                >
                  إدارة
                </button>
              </div>
              {isAdmin ? (
                <div className="flex gap-2 mt-3 pt-3 border-t border-sage/10">
                  <button onClick={() => onGrant(s.id)} className="rounded-lg bg-gold/15 text-gold-deep text-[12px] font-bold px-3 py-1.5">
                    ＋ منح سنة
                  </button>
                  {active ? (
                    <button onClick={() => onStop(s.id)} className="rounded-lg border border-red-200 text-red-500 text-[12px] font-bold px-3 py-1.5">
                      إيقاف الاشتراك
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ───────────────────────── قوالب مشتركة ───────────────────────── */
function Shell({ firstName, title, children }: { firstName: string; title: string; children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-dvh bg-cream" style={DISP}>
      <header className="bg-white border-b border-sage/15 px-4 py-3 flex items-center gap-3">
        <Link href="/teacher" className="rounded-xl border border-sage/30 text-sage-deep font-bold text-sm px-3 py-2">
          → رجوع
        </Link>
        <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center">
          <span aria-hidden="true">🏫</span>
        </div>
        <div className="flex-1">
          <div className="font-extrabold text-sage-deep leading-tight">{title}</div>
          {firstName ? <div className="text-[12px] text-ink/55">مرحبًا {firstName}</div> : null}
        </div>
      </header>
      <div className="mx-auto max-w-3xl p-4">{children}</div>
    </main>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-5 inset-x-0 flex justify-center z-50 px-4">
      <div className="bg-sage-deep text-white text-[13px] font-bold rounded-full px-5 py-2.5 shadow-soft">{text}</div>
    </div>
  );
}

/* ───────────────────────── معالج الإعداد ───────────────────────── */
function SetupWizard({ onCreate }: { onCreate: (name: string, year: string, term: string, days: number[]) => void }) {
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('الأول');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [busy, setBusy] = useState(false);
  const toggle = (d: number) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)));

  return (
    <div className="card-3d bg-white rounded-2xl p-6 space-y-4">
      <div>
        <div className="text-lg font-extrabold text-sage-deep">إعداد المدرسة</div>
        <div className="text-[13px] text-ink/55">عبّئي بيانات مدرستك مرة واحدة للبدء.</div>
      </div>
      <Field label="اسم المدرسة">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مشرف الابتدائية" className={IPT} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="العام الدراسي">
          <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/2027" className={IPT} />
        </Field>
        <Field label="الفصل الدراسي">
          <select value={term} onChange={(e) => setTerm(e.target.value)} className={IPT}>
            <option>الأول</option>
            <option>الثاني</option>
          </select>
        </Field>
      </div>
      <Field label="أيام الدراسة">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold border ${
                days.includes(i) ? 'bg-sage-deep text-white border-transparent' : 'bg-white text-sage-deep border-sage/25'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </Field>
      <button
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          await onCreate(name.trim(), year.trim(), term, days);
          setBusy(false);
        }}
        className="w-full rounded-xl bg-sage-deep text-white font-extrabold py-3 shadow-soft disabled:opacity-50"
      >
        {busy ? '…' : 'إنشاء المدرسة'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-bold text-sage-deep mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ───────────────────────── اللوحة ───────────────────────── */
/* ───────────────────────── الشُّعب والمعلمات ───────────────────────── */
function DepartmentsView({
  depts,
  members,
  canManage,
  onBack,
  addDept,
  renameDept,
  delDept,
  setHead,
  addMember,
  removeMember,
}: {
  depts: Dept[];
  members: Member[];
  canManage: boolean;
  onBack: () => void;
  addDept: (name: string) => void;
  renameDept: (id: string, name: string) => void;
  delDept: (id: string) => void;
  setHead: (deptId: string, memberId: string | null) => void;
  addMember: (login: string, role: string, deptId: string | null) => void;
  removeMember: (id: string) => void;
}) {
  const [newDept, setNewDept] = useState('');
  const noDept = members.filter((m) => !m.department_id);

  const MemberRow = ({ m }: { m: Member }) => (
    <div className="flex items-center gap-2 py-1">
      <span className="w-6 text-center text-sage/40">•</span>
      <div className="flex-1 text-[13px] text-ink">
        {m.name || '—'} <span className="text-[11px] text-ink/45">({ROLE_LABEL[m.role] || m.role})</span>
      </div>
      {canManage ? (
        <button onClick={() => removeMember(m.id)} aria-label="إزالة" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">الشُّعب والمعلمات</div>
      </div>

      {canManage ? (
        <div className="flex gap-2">
          <input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder="شعبة جديدة (مثال: التربية الإسلامية)"
            className="flex-1 rounded-xl border border-sage/25 p-2.5 text-sm focus:outline-none focus:border-sage bg-white"
          />
          <button
            onClick={() => {
              if (newDept.trim()) {
                addDept(newDept.trim());
                setNewDept('');
              }
            }}
            className="rounded-xl bg-sage-deep text-white font-bold text-sm px-4"
          >
            ＋ شعبة
          </button>
        </div>
      ) : null}

      {depts.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60">لا شُعب بعد.{canManage ? ' أضيفي أول شعبة.' : ''}</div>
      ) : (
        depts.map((d) => {
          const mm = members.filter((m) => m.department_id === d.id);
          const head = members.find((m) => m.id === d.head_member_id);
          return (
            <div key={d.id} className="card-3d bg-white rounded-2xl p-3">
              <Row
                label={d.name}
                bold
                canManage={canManage}
                onRename={() => {
                  const n = window.prompt('اسم الشعبة', d.name);
                  if (n && n.trim()) renameDept(d.id, n.trim());
                }}
                onDelete={() => delDept(d.id)}
              />
              <div className="mt-2 pr-3 border-r-2 border-sage/10 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-bold text-gold-deep">رئيسة الشعبة:</span>
                  <span className="text-[13px] text-ink">{head?.name || '— لم تُعيّن —'}</span>
                  {canManage ? (
                    <select
                      value={d.head_member_id || ''}
                      onChange={(e) => setHead(d.id, e.target.value || null)}
                      className="rounded-lg border border-sage/25 bg-white text-[12px] p-1.5"
                    >
                      <option value="">— تعيين رئيسة —</option>
                      {mm.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || '—'}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div>
                  <div className="text-[12px] font-bold text-sage-deep mb-1">المعلمات ({mm.length})</div>
                  {mm.length ? mm.map((m) => <MemberRow key={m.id} m={m} />) : <div className="text-[12px] text-ink/35">— لا معلمات —</div>}
                </div>
                {canManage ? <AddInline placeholder="رقم/إيميل المعلمة لإضافتها" onAdd={(v) => addMember(v, 'teacher', d.id)} /> : null}
              </div>
            </div>
          );
        })
      )}

      {/* الإدارة / أعضاء بلا شعبة */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">الإدارة وأعضاء بلا شعبة</div>
        {noDept.length ? noDept.map((m) => <MemberRow key={m.id} m={m} />) : <div className="text-[12px] text-ink/35 mb-2">— لا أحد —</div>}
        {canManage ? <AddPerson onAdd={(login, role) => addMember(login, role, null)} /> : null}
      </div>
    </div>
  );
}

/** إضافة عضو إداري (بدور محدّد) بلا شعبة. */
function AddPerson({ onAdd }: { onAdd: (login: string, role: string) => void }) {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState('principal');
  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="رقم/إيميل الحساب"
        className="flex-1 min-w-[140px] rounded-lg border border-sage/20 p-2 text-[13px] focus:outline-none focus:border-sage bg-white"
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
        <option value="principal">مديرة المدرسة</option>
        <option value="deputy">مديرة مساعدة</option>
        <option value="supervisor">مشرفة</option>
        <option value="student_affairs">شؤون الطلبة</option>
        <option value="teacher">معلمة</option>
      </select>
      <button
        onClick={() => {
          if (login.trim()) {
            onAdd(login.trim(), role);
            setLogin('');
          }
        }}
        className="rounded-lg bg-sage-light text-sage-deep font-bold text-[12px] px-3"
      >
        ＋ إضافة
      </button>
    </div>
  );
}

function Dashboard({
  school,
  counts,
  onOpen,
}: {
  school: School | null;
  counts: { stages: number; grades: number; classes: number; depts: number; members: number };
  onOpen: (key: string) => void;
}) {
  const today = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return (
    <div className="space-y-4">
      {/* ملخص اليوم */}
      <div className="rounded-2xl bg-white border border-sage/15 p-4">
        <div className="text-[13px] font-bold text-sage-deep">{today}</div>
        <div className="text-[12px] text-ink/50 mt-1">
          {school?.academic_year ? `العام ${school.academic_year} · ` : ''}
          {school?.term ? `الفصل ${school.term}` : ''}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat n={counts.classes} l="فصول" />
          <Stat n={counts.depts} l="شُعب" />
          <Stat n={counts.members} l="معلمات" />
        </div>
        <div className="text-[11.5px] text-ink/45 mt-3">الملخص اليومي للحضور والاحتياط والمناوبات يظهر بعد تفعيل تلك الأقسام.</div>
      </div>

      {/* الأقسام */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => !s.soon && onOpen(s.key)}
            disabled={s.soon}
            className={`rounded-2xl border p-4 text-right ${
              s.soon ? 'bg-white/60 border-sage/10 opacity-70' : 'card-3d bg-white border-sage/15 hover:border-sage/40'
            }`}
          >
            <div className="text-2xl mb-1" aria-hidden="true">{s.emoji}</div>
            <div className="font-bold text-ink text-[13.5px] flex items-center gap-1.5">
              {s.label}
              {s.soon ? <span className="text-[10px] bg-gold/15 text-gold-deep rounded-full px-2 py-0.5">قريبًا</span> : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-xl bg-sage-light/40 py-2">
      <div className="text-xl font-black text-sage-deep tabular-nums">{n}</div>
      <div className="text-[11px] text-ink/55">{l}</div>
    </div>
  );
}

/* ───────────────────────── إدارة الهيكل ───────────────────────── */
function StructureView({
  stages,
  grades,
  classes,
  canManage,
  onBack,
  addStage,
  addGrade,
  addClass,
  renameRow,
  delStage,
  delGrade,
  delClass,
}: {
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  canManage: boolean;
  onBack: () => void;
  addStage: (name: string) => void;
  addGrade: (stageId: string, name: string) => void;
  addClass: (gradeId: string, name: string) => void;
  renameRow: (table: string, id: string, name: string) => void;
  delStage: (id: string) => void;
  delGrade: (id: string) => void;
  delClass: (id: string) => void;
}) {
  const [newStage, setNewStage] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">
          ‹ اللوحة
        </button>
        <div className="font-extrabold text-sage-deep flex-1">الهيكل المدرسي</div>
      </div>

      {canManage ? (
        <div className="flex gap-2">
          <input
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            placeholder="مرحلة جديدة (مثال: الابتدائية)"
            className="flex-1 rounded-xl border border-sage/25 p-2.5 text-sm focus:outline-none focus:border-sage bg-white"
          />
          <button
            onClick={() => {
              if (newStage.trim()) {
                addStage(newStage.trim());
                setNewStage('');
              }
            }}
            className="rounded-xl bg-sage-deep text-white font-bold text-sm px-4"
          >
            ＋ مرحلة
          </button>
        </div>
      ) : null}

      {stages.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-8 text-center text-ink/60">
          لم تُضف مراحل بعد.{canManage ? ' أضيفي أول مرحلة من الأعلى.' : ''}
        </div>
      ) : (
        stages.map((st) => {
          const gs = grades.filter((g) => g.stage_id === st.id);
          return (
            <div key={st.id} className="card-3d bg-white rounded-2xl p-3">
              <Row
                label={st.name}
                bold
                open={open.has(st.id)}
                onToggle={() => toggle(st.id)}
                canManage={canManage}
                onRename={() => {
                  const n = window.prompt('اسم المرحلة', st.name);
                  if (n && n.trim()) renameRow('school_stages', st.id, n.trim());
                }}
                onDelete={() => delStage(st.id)}
              />
              {open.has(st.id) ? (
                <div className="mt-2 pr-3 border-r-2 border-sage/10 space-y-2">
                  {canManage ? <AddInline placeholder="صف جديد (مثال: الخامس)" onAdd={(v) => addGrade(st.id, v)} /> : null}
                  {gs.map((g) => {
                    const cs = classes.filter((c) => c.grade_id === g.id);
                    return (
                      <div key={g.id}>
                        <Row
                          label={g.name}
                          open={open.has(g.id)}
                          onToggle={() => toggle(g.id)}
                          canManage={canManage}
                          onRename={() => {
                            const n = window.prompt('اسم الصف', g.name);
                            if (n && n.trim()) renameRow('school_grades', g.id, n.trim());
                          }}
                          onDelete={() => delGrade(g.id)}
                        />
                        {open.has(g.id) ? (
                          <div className="mt-1.5 pr-3 border-r-2 border-sage/10 space-y-1.5">
                            {canManage ? <AddInline placeholder="فصل جديد (مثال: ٥/١)" onAdd={(v) => addClass(g.id, v)} /> : null}
                            {cs.map((c) => (
                              <Row
                                key={c.id}
                                label={c.name}
                                small
                                canManage={canManage}
                                onRename={() => {
                                  const n = window.prompt('اسم الفصل', c.name);
                                  if (n && n.trim()) renameRow('school_classes', c.id, n.trim());
                                }}
                                onDelete={() => delClass(c.id)}
                              />
                            ))}
                            {cs.length === 0 ? <div className="text-[12px] text-ink/35 py-1">— لا فصول —</div> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {gs.length === 0 ? <div className="text-[12px] text-ink/35 py-1">— لا صفوف —</div> : null}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function Row({
  label,
  bold,
  small,
  open,
  onToggle,
  canManage,
  onRename,
  onDelete,
}: {
  label: string;
  bold?: boolean;
  small?: boolean;
  open?: boolean;
  onToggle?: () => void;
  canManage: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {onToggle ? (
        <button onClick={onToggle} className="w-6 h-6 rounded-md bg-sage-light/50 text-sage-deep text-xs font-bold">
          {open ? '−' : '+'}
        </button>
      ) : (
        <span className="w-6 text-center text-sage/40">•</span>
      )}
      <div className={`flex-1 ${bold ? 'font-extrabold text-sage-deep' : small ? 'text-[13px] text-ink' : 'font-bold text-ink'}`}>{label}</div>
      {canManage ? (
        <>
          <button onClick={onRename} aria-label="تعديل" className="text-ink/40 hover:text-sage-deep text-sm px-1">
            ✏️
          </button>
          <button onClick={onDelete} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">
            🗑
          </button>
        </>
      ) : null}
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1.5">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
        className="flex-1 rounded-lg border border-sage/20 p-2 text-[13px] focus:outline-none focus:border-sage bg-white"
      />
      <button
        onClick={() => {
          if (v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
        className="rounded-lg bg-sage-light text-sage-deep font-bold text-[12px] px-3"
      >
        ＋
      </button>
    </div>
  );
}
