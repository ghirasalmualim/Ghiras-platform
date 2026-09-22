'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import AttDaily from './AttDaily';
import { StudentRecord, AuditLog } from './AttRecords';
import AttReports from './AttReports';

/**
 * «إدارة الحضور المدرسية» 🏫 — المرحلة ٢: الإنشاء + الهيكل + الطالبات + المسؤولات + الإعدادات
 * + لوحة التفعيل للأدمِن. التسجيل اليومي ولوحة الإدارة في المرحلة ٣.
 * كل الكتابة عبر عميل Supabase: دوال att_* أو الجداول مباشرةً والقاعدة (RLS) هي الحكم.
 */

/* ------------------------------------------------------------------ أدوات */
const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const PRICE_PER_CLASS = 4; // د.ك
const MIN_CLASSES = 10;
const MONTHS = 4;
const price = (classes: number) => Math.max(MIN_CLASSES, classes) * PRICE_PER_CLASS;
const GRADE_NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return toAr(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`);
};
const ERR: Record<string, string> = {
  att_quota: 'وصلتِ عدد الفصول المشترك فيه — لإضافة فصول تواصلي مع غراس المعلم.',
  inactive: 'الإدارة غير مفعّلة بعد.',
  forbidden: 'غير مصرّح لكِ بهذه العملية.',
  too_many_orgs: 'وصلتِ الحدّ الأقصى لعدد الإدارات.',
  name_required: 'اكتبي اسم المدرسة.',
  bad_structure: 'راجعي الصفوف وعدد الفصول.',
  cannot_remove_owner: 'لا يمكن حذف المنشئة.',
};
const errMsg = (e: { message?: string } | null | undefined) => {
  const m = e?.message || '';
  const k = Object.keys(ERR).find((x) => m.includes(x));
  return k ? ERR[k] : m || 'حدث خطأ — حاولي مرة أخرى.';
};
const parseNames = (txt: string) =>
  txt
    .split(/[\n،,]+/)
    .map((s) => s.replace(/^\s*\d+[\s.\-)]*/, '').trim())
    .filter((s) => s.length > 1);

const BTN = 'rounded-xl px-4 py-2.5 font-extrabold text-sm transition-all disabled:opacity-50';
const B_SAGE = `${BTN} bg-sage hover:bg-sage-dark text-white`;
const B_GOLD = `${BTN} bg-gold hover:bg-gold-dark text-white`;
const B_GHOST = `${BTN} bg-white border border-sage/30 text-sage-deep hover:bg-sage-mist`;
const B_DANGER = `${BTN} bg-white border border-red-200 text-red-600 hover:bg-red-50`;
const IPT = 'w-full rounded-xl border border-sage/25 px-3 py-2.5 text-base bg-white focus:outline-none focus:border-sage';
const CARD = 'rounded-2xl bg-white border border-sage/15 shadow-sm';

/* ------------------------------------------------------------------ أنواع */
type Org = {
  school_id: string; name: string; gender: 'girls' | 'boys'; active: boolean; att_until: string | null;
  att_classes: number; cutoff: string; kind: 'main' | 'grade'; grade_ids: string[]; class_ids: string[];
};
type Stage = { id: string; name: string; sort: number };
type Grade = { id: string; stage_id: string; name: string; sort: number };
type Klass = { id: string; grade_id: string; name: string; sort: number; archived: boolean };
type Student = { id: string; class_id: string; name: string; sort: number };
type Member = {
  member_id: string; user_id: string | null; name: string | null; phone: string | null; kind: 'main' | 'grade';
  is_owner: boolean; grade_ids: string[]; class_ids: string[];
};
type AdminOrg = { id: string; name: string; owner_id: string; att_until: string | null; att_classes: number; created_at: string; classes: number; owner?: string };

/* ================================================================== الجذر */
export default function AttSchoolApp({ uid, isAdmin, fullName }: { uid: string; isAdmin: boolean; fullName: string }) {
  const sb = useMemo(() => createClient(), []);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [view, setView] = useState<'home' | 'create' | 'org'>('home');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const say = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const loadOrgs = useCallback(async () => {
    const { data, error } = await sb.rpc('att_my_orgs');
    if (error) {
      say(errMsg(error));
      setOrgs([]);
      return [];
    }
    setOrgs((data as Org[]) || []);
    return (data as Org[]) || [];
  }, [sb, say]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const org = orgs?.find((o) => o.school_id === orgId) || null;

  return (
    <main dir="rtl" className="min-h-dvh bg-cream text-ink pb-16">
      <header className="sticky top-0 z-20 bg-sage-deep text-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🏫</span>
          <div className="flex-1">
            <h1 className="font-extrabold text-lg leading-tight">إدارة الحضور المدرسية</h1>
            <p className="text-xs text-white/75">غراس المعلم{fullName ? `، ${fullName}` : ''}</p>
          </div>
          {view !== 'home' && (
            <button className="rounded-xl bg-white/15 hover:bg-white/25 px-3 py-2 text-sm font-bold" onClick={() => { setView('home'); setOrgId(null); }}>
              → إداراتي
            </button>
          )}
          <Link href="/attendance" className="rounded-xl bg-white/15 hover:bg-white/25 px-3 py-2 text-sm font-bold">
            سجل الحضور
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-5">
        {view === 'home' && (
          <Home
            orgs={orgs}
            onOpen={(id) => { setOrgId(id); setView('org'); }}
            onCreate={() => setView('create')}
          />
        )}
        {view === 'create' && (
          <CreateWizard
            sb={sb}
            say={say}
            onDone={async (id) => { await loadOrgs(); setOrgId(id); setView('org'); }}
            onCancel={() => setView('home')}
          />
        )}
        {view === 'org' && org && <OrgView sb={sb} org={org} uid={uid} fullName={fullName} say={say} reloadOrgs={loadOrgs} />}
        {view === 'home' && isAdmin && <AdminBoard sb={sb} say={say} />}
      </div>

      {toast && (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="rounded-2xl bg-ink text-white px-5 py-3 font-bold shadow-lg">{toast}</div>
        </div>
      )}
    </main>
  );
}

/* ================================================================== إداراتي */
function Home({ orgs, onOpen, onCreate }: { orgs: Org[] | null; onOpen: (id: string) => void; onCreate: () => void }) {
  if (!orgs) return <p className="text-center text-ink/60 py-16">⏳ جاري التحميل…</p>;
  return (
    <section>
      <h2 className="text-xl font-extrabold mb-1">إداراتي</h2>
      <p className="text-ink/60 text-sm mb-4">إدارة حضور مدرسة كاملة — صفوف وفصول ومسؤولات بصلاحيات.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((o) => (
          <button key={o.school_id} onClick={() => onOpen(o.school_id)} className={`${CARD} p-5 text-right hover:shadow-md hover:border-sage/40 transition-all`}>
            <div className="text-3xl">{o.gender === 'boys' ? '📗' : '📘'}</div>
            <h3 className="mt-2 font-extrabold text-lg">{o.name}</h3>
            <p className="text-sm text-ink/60 mt-1">{o.kind === 'main' ? '👑 مسؤولة رئيسية' : '🧭 مسؤولة صف'}</p>
            <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-extrabold ${o.active ? 'bg-sage-light text-sage-deep' : 'bg-gold-light text-gold-dark'}`}>
              {o.active ? `✅ مفعّلة حتى ${fmtDate(o.att_until)}` : '⏳ بانتظار التفعيل'}
            </span>
          </button>
        ))}
        <button onClick={onCreate} className="rounded-2xl border-2 border-dashed border-gold bg-gold-light/40 hover:bg-gold-light p-5 text-center transition-all min-h-[160px]">
          <div className="text-4xl">🏫</div>
          <div className="mt-2 font-extrabold text-lg text-gold-dark">إدارة جديدة</div>
          <div className="text-xs text-ink/60 mt-1">لمسؤولة الحضور — سجلات المدرسة كاملة</div>
        </button>
      </div>
    </section>
  );
}

/* ================================================================== معالج الإنشاء */
function CreateWizard({ sb, say, onDone, onCancel }: {
  sb: ReturnType<typeof createClient>; say: (m: string) => void; onDone: (id: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'girls' | 'boys'>('girls');
  const [year, setYear] = useState('٢٠٢٦ - ٢٠٢٧');
  const [stage, setStage] = useState('المرحلة الابتدائية');
  const [grades, setGrades] = useState<{ name: string; n: number }[]>(GRADE_NAMES.slice(0, 5).map((g) => ({ name: g, n: 6 })));
  const [busy, setBusy] = useState(false);
  const total = grades.reduce((s, g) => s + (g.n || 0), 0);

  const submit = async () => {
    if (!name.trim()) return say('اكتبي اسم المدرسة');
    const clean = grades.filter((g) => g.name.trim() && g.n > 0);
    if (!clean.length) return say('أضيفي صفًّا واحدًا على الأقل');
    setBusy(true);
    const { data, error } = await sb.rpc('att_org_create', {
      p_name: name.trim(), p_gender: gender, p_year: year.trim(), p_stage: stage.trim(),
      p_grades: clean.map((g) => g.name.trim()), p_per_grade: clean.map((g) => Math.min(20, g.n)),
    });
    setBusy(false);
    if (error) return say(errMsg(error));
    say('✅ تم إنشاء الإدارة');
    onDone(data as string);
  };

  return (
    <section className={`${CARD} p-5 sm:p-7`}>
      <h2 className="text-xl font-extrabold">🏫 إنشاء إدارة جديدة</h2>
      <p className="text-sm text-ink/60 mt-1">كل شيء قابل للتعديل لاحقًا: الصفوف وعدد الفصول وأسماؤها.</p>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <label className="block">
          <span className="text-sm font-bold">اسم المدرسة</span>
          <input className={IPT} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مدرسة ... الابتدائية للبنات" />
        </label>
        <label className="block">
          <span className="text-sm font-bold">العام الدراسي</span>
          <input className={IPT} value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <div>
          <span className="text-sm font-bold">المدرسة</span>
          <div className="flex gap-2 mt-1">
            {(['girls', 'boys'] as const).map((g) => (
              <button key={g} onClick={() => setGender(g)} className={`${BTN} flex-1 ${gender === g ? 'bg-sage text-white' : 'bg-sage-mist text-sage-deep'}`}>
                {g === 'girls' ? '👧 بنات' : '👦 بنين'}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-bold">المرحلة</span>
          <input className={IPT} value={stage} onChange={(e) => setStage(e.target.value)} />
        </label>
      </div>

      <h3 className="font-extrabold mt-6 mb-2">الصفوف وعدد الفصول</h3>
      <div className="space-y-2">
        {grades.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm text-ink/50 w-6">{toAr(i + 1)}</span>
            <input className={`${IPT} flex-1`} value={g.name} onChange={(e) => setGrades(grades.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <div className="flex items-center gap-1">
              <button className={B_GHOST} onClick={() => setGrades(grades.map((x, j) => (j === i ? { ...x, n: Math.max(1, x.n - 1) } : x)))}>−</button>
              <span className="w-16 text-center font-extrabold">{toAr(g.n)} فصول</span>
              <button className={B_GHOST} onClick={() => setGrades(grades.map((x, j) => (j === i ? { ...x, n: Math.min(20, x.n + 1) } : x)))}>+</button>
            </div>
            <button className={B_DANGER} onClick={() => setGrades(grades.filter((_, j) => j !== i))} aria-label="حذف الصف">🗑️</button>
          </div>
        ))}
      </div>
      <button className={`${B_GHOST} mt-3`} onClick={() => setGrades([...grades, { name: GRADE_NAMES[grades.length] || `صف ${toAr(grades.length + 1)}`, n: 6 }])}>
        ➕ صف
      </button>

      <div className="mt-6 rounded-2xl bg-gold-light/60 border border-gold/40 p-4">
        <div className="font-extrabold">المجموع: {toAr(total)} فصلًا</div>
        <div className="text-sm text-ink/70 mt-1">
          الاشتراك: {toAr(PRICE_PER_CLASS)} د.ك لكل فصل (أقلّ اشتراك {toAr(MIN_CLASSES)} فصول) لمدة {toAr(MONTHS)} شهور —{' '}
          <b>{toAr(price(total))} د.ك</b>. تجهيز الإدارة مجاني، والتسجيل اليومي يبدأ بعد التفعيل.
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button className={`${B_GOLD} flex-1 py-3 text-base`} disabled={busy} onClick={submit}>{busy ? '⏳ جاري الإنشاء…' : '✅ إنشاء الإدارة'}</button>
        <button className={B_GHOST} onClick={onCancel}>إلغاء</button>
      </div>
    </section>
  );
}

/* ================================================================== الإدارة */
type Tab = 'today' | 'reports' | 'structure' | 'students' | 'log' | 'staff' | 'settings';

function OrgView({ sb, org, uid, fullName, say, reloadOrgs }: {
  sb: ReturnType<typeof createClient>; org: Org; uid: string; fullName: string; say: (m: string) => void; reloadOrgs: () => Promise<Org[]>;
}) {
  const isMain = org.kind === 'main';
  const [tab, setTab] = useState<Tab>('today');
  const [stages, setStages] = useState<Stage[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const sid = org.school_id;

  const loadStructure = useCallback(async () => {
    const [s, g, c] = await Promise.all([
      sb.from('school_stages').select('id,name,sort').eq('school_id', sid).order('sort'),
      sb.from('school_grades').select('id,stage_id,name,sort').eq('school_id', sid).order('sort'),
      sb.from('school_classes').select('id,grade_id,name,sort,archived').eq('school_id', sid).eq('archived', false).order('sort'),
    ]);
    setStages((s.data as Stage[]) || []);
    setGrades((g.data as Grade[]) || []);
    setClasses((c.data as Klass[]) || []);
  }, [sb, sid]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  // نطاق مسؤولة الصف: صفوفها + فصولها الإضافية
  const scopeClasses = useMemo(() => {
    if (isMain) return classes;
    return classes.filter((c) => org.grade_ids.includes(c.grade_id) || org.class_ids.includes(c.id));
  }, [isMain, classes, org.grade_ids, org.class_ids]);

  const tabs: { k: Tab; l: string; main?: boolean }[] = [
    { k: 'today', l: '📋 الحضور اليومي' },
    { k: 'reports', l: '🖨️ التقارير' },
    { k: 'structure', l: '🏗️ الصفوف والفصول', main: true },
    { k: 'students', l: '👩‍🎓 الطالبات' },
    { k: 'log', l: '🧾 سجل التعديلات', main: true },
    { k: 'staff', l: '👥 المسؤولات', main: true },
    { k: 'settings', l: '⚙️ الإعدادات', main: true },
  ];

  return (
    <section>
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-extrabold">{org.gender === 'boys' ? '📗' : '📘'} {org.name}</h2>
            <p className="text-sm text-ink/60 mt-1">
              {toAr(classes.length)} فصلًا، {toAr(grades.length)} صفوف، {isMain ? '👑 مسؤولة رئيسية' : '🧭 مسؤولة صف'}
            </p>
          </div>
          {org.active ? (
            <div className="rounded-2xl bg-sage-light text-sage-deep px-4 py-2 text-sm font-bold">
              ✅ مفعّلة حتى {fmtDate(org.att_until)}، مشتركة بـ{toAr(org.att_classes)} فصلًا
            </div>
          ) : (
            <div className="rounded-2xl bg-gold-light text-ink px-4 py-3 text-sm max-w-md">
              <div className="font-extrabold text-gold-dark">⏳ بانتظار التفعيل</div>
              <div className="mt-1">
                جهّزي الصفوف والطالبات والمسؤولات الآن. الاشتراك لـ{toAr(classes.length)} فصلًا:{' '}
                <b>{toAr(price(classes.length))} د.ك</b> لمدة {toAr(MONTHS)} شهور.
              </div>
              <Link href="/support" className="inline-block mt-2 font-extrabold text-sage-deep underline">💬 التفعيل عبر التواصل مع غراس</Link>
            </div>
          )}
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto mt-4 pb-1">
        {tabs.filter((t) => isMain || !t.main).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`${BTN} whitespace-nowrap ${tab === t.k ? 'bg-sage-deep text-white' : 'bg-white border border-sage/25 text-sage-deep'}`}>
            {t.l}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === 'today' && (
          <AttDaily
            sb={sb} org={org} grades={grades} classes={classes}
            scopeClassIds={isMain ? null : scopeClasses.map((c) => c.id)}
            fullName={fullName} say={say}
          />
        )}
        {tab === 'reports' && <AttReports sb={sb} org={org} grades={grades} classes={scopeClasses} />}
        {tab === 'structure' && isMain && (
          <StructureTab sb={sb} sid={sid} stages={stages} grades={grades} classes={classes} say={say} reload={loadStructure} />
        )}
        {tab === 'students' && (
          <StudentsTab sb={sb} sid={sid} grades={grades} classes={scopeClasses} gender={org.gender} say={say} />
        )}
        {tab === 'log' && isMain && <AuditLog sb={sb} schoolId={sid} gender={org.gender} classes={classes} />}
        {tab === 'staff' && isMain && <StaffTab sb={sb} sid={sid} uid={uid} grades={grades} classes={classes} say={say} />}
        {tab === 'settings' && isMain && <SettingsTab sb={sb} org={org} say={say} reloadOrgs={reloadOrgs} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ الهيكل */
function StructureTab({ sb, sid, stages, grades, classes, say, reload }: {
  sb: ReturnType<typeof createClient>; sid: string; stages: Stage[]; grades: Grade[]; classes: Klass[];
  say: (m: string) => void; reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [newStage, setNewStage] = useState('');

  const run = async (fn: () => PromiseLike<{ error: { message?: string } | null }>, ok?: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return say(errMsg(error));
    if (ok) say(ok);
    await reload();
  };

  const nextClassName = (g: Grade) => {
    const inGrade = classes.filter((c) => c.grade_id === g.id);
    return `${g.name} / ${toAr(inGrade.length + 1)}`;
  };

  const addClass = (g: Grade) =>
    run(() => sb.from('school_classes').insert({ school_id: sid, grade_id: g.id, name: nextClassName(g), sort: classes.filter((c) => c.grade_id === g.id).length + 1 }), '➕ أُضيف فصل');

  const renameClass = (c: Klass) => {
    const n = window.prompt('اسم الفصل', c.name);
    if (n && n.trim() && n.trim() !== c.name) run(() => sb.from('school_classes').update({ name: n.trim() }).eq('id', c.id), '✏️ تم التعديل');
  };
  const deleteClass = (c: Klass) => {
    if (window.confirm(`حذف فصل «${c.name}» مع طالباته وسجلاته نهائيًا؟`)) run(() => sb.from('school_classes').delete().eq('id', c.id), '🗑️ تم الحذف');
  };
  const renameGrade = (g: Grade) => {
    const n = window.prompt('اسم الصف', g.name);
    if (n && n.trim() && n.trim() !== g.name) run(() => sb.from('school_grades').update({ name: n.trim() }).eq('id', g.id), '✏️ تم التعديل');
  };
  const deleteGrade = (g: Grade) => {
    const n = classes.filter((c) => c.grade_id === g.id).length;
    if (window.confirm(`حذف «${g.name}» مع ${toAr(n)} فصول وكل طالباتها وسجلاتها نهائيًا؟`)) run(() => sb.from('school_grades').delete().eq('id', g.id), '🗑️ تم الحذف');
  };
  const addGrade = (st: Stage) => {
    const inStage = grades.filter((g) => g.stage_id === st.id);
    const n = window.prompt('اسم الصف الجديد', GRADE_NAMES[inStage.length] || '');
    if (n && n.trim()) run(() => sb.from('school_grades').insert({ school_id: sid, stage_id: st.id, name: n.trim(), sort: inStage.length + 1 }), '➕ أُضيف صف — أضيفي فصوله');
  };
  const renameStage = (st: Stage) => {
    const n = window.prompt('اسم المرحلة', st.name);
    if (n && n.trim() && n.trim() !== st.name) run(() => sb.from('school_stages').update({ name: n.trim() }).eq('id', st.id), '✏️ تم التعديل');
  };
  const addStage = () => {
    if (!newStage.trim()) return;
    run(() => sb.from('school_stages').insert({ school_id: sid, name: newStage.trim(), sort: stages.length + 1 }), '➕ أُضيفت مرحلة').then(() => setNewStage(''));
  };

  return (
    <div className="space-y-4">
      {stages.map((st) => (
        <div key={st.id} className={`${CARD} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-extrabold text-lg flex-1">🏛️ {st.name}</h3>
            <button className={B_GHOST} onClick={() => renameStage(st)}>✏️</button>
            <button className={B_GHOST} disabled={busy} onClick={() => addGrade(st)}>➕ صف</button>
          </div>
          <div className="space-y-3">
            {grades.filter((g) => g.stage_id === st.id).map((g) => {
              const cs = classes.filter((c) => c.grade_id === g.id);
              return (
                <div key={g.id} className="rounded-xl bg-sage-mist/60 border border-sage/15 p-3">
                  <div className="flex items-center gap-2">
                    <b className="flex-1">الصف {g.name} <span className="text-ink/50 font-bold text-sm">· {toAr(cs.length)} فصول</span></b>
                    <button className={B_GHOST} onClick={() => renameGrade(g)}>✏️</button>
                    <button className={B_DANGER} onClick={() => deleteGrade(g)}>🗑️</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {cs.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-xl bg-white border border-sage/25 pr-3 pl-1 py-1 font-bold">
                        {c.name}
                        <button className="px-2 text-sage-dark" onClick={() => renameClass(c)} aria-label="تعديل">✏️</button>
                        <button className="px-2 text-red-500" onClick={() => deleteClass(c)} aria-label="حذف">✕</button>
                      </span>
                    ))}
                    <button className={B_GHOST} disabled={busy} onClick={() => addClass(g)}>➕ فصل</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className={`${CARD} p-4 flex gap-2 items-center`}>
        <input className={`${IPT} flex-1`} value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="إضافة مرحلة جديدة (مثال: المرحلة المتوسطة)" />
        <button className={B_SAGE} disabled={busy || !newStage.trim()} onClick={addStage}>➕ مرحلة</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ الطالبات */
function StudentsTab({ sb, sid, grades, classes, gender, say }: {
  sb: ReturnType<typeof createClient>; sid: string; grades: Grade[]; classes: Klass[]; gender: 'girls' | 'boys'; say: (m: string) => void;
}) {
  const [classId, setClassId] = useState<string>('');
  const [profile, setProfile] = useState<Student | null>(null);
  const [list, setList] = useState<Student[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState('');

  const visibleGrades = grades.filter((g) => classes.some((c) => c.grade_id === g.id));
  const current = classes.find((c) => c.id === classId) || null;

  const load = useCallback(async (cid: string) => {
    if (!cid) return setList([]);
    const { data, error } = await sb.from('school_students').select('id,class_id,name,sort').eq('class_id', cid).eq('archived', false).order('sort').order('created_at');
    if (error) say(errMsg(error));
    setList((data as Student[]) || []);
  }, [sb, say]);

  useEffect(() => {
    load(classId);
  }, [classId, load]);

  const addNames = async (names: string[]) => {
    if (!current || !names.length) return;
    const have = new Set(list.map((s) => s.name.replace(/\s+/g, ' ').trim()));
    const fresh = names.filter((n) => !have.has(n.replace(/\s+/g, ' ').trim()));
    if (!fresh.length) return say('كل الأسماء موجودة مسبقًا');
    setBusy(true);
    const base = list.length;
    const { error } = await sb.from('school_students').insert(fresh.map((n, i) => ({ school_id: sid, class_id: current.id, name: n, sort: base + i + 1 })));
    setBusy(false);
    if (error) return say(errMsg(error));
    say(`✅ أُضيفت ${toAr(fresh.length)} ${fresh.length > 2 ? 'طالبات' : 'طالبة'}${fresh.length < names.length ? ' (تُجوهل المكرّر)' : ''}`);
    setPaste('');
    load(current.id);
  };

  const rename = async (s: Student) => {
    const n = window.prompt('اسم الطالبة', s.name);
    if (!n || !n.trim() || n.trim() === s.name) return;
    const { error } = await sb.from('school_students').update({ name: n.trim() }).eq('id', s.id);
    if (error) return say(errMsg(error));
    load(classId);
  };
  const remove = async (s: Student) => {
    if (!window.confirm(`إزالة «${s.name}» من الفصل؟ (يبقى سجلها السابق محفوظًا)`)) return;
    const { error } = await sb.from('school_students').update({ archived: true }).eq('id', s.id);
    if (error) return say(errMsg(error));
    load(classId);
  };

  const readImage = async (file: File | undefined) => {
    if (!file || !current) return;
    setOcr('⏳ جاري قراءة الكشف…');
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = () => rej(0);
        r.readAsDataURL(file);
      });
      const isPdf = file.type === 'application/pdf';
      const src = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
        : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: b64 } };
      const resp = await fetch('/api/school/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 2000,
          messages: [{ role: 'user', content: [src, { type: 'text', text: 'هذا كشف أسماء طالبات/طلاب مدرسي. استخرج جميع الأسماء الكاملة بالترتيب الوارد من الأعلى للأسفل. أجب فقط بالأسماء، اسم واحد في كل سطر، بدون أرقام وبدون أي نص إضافي.' }] }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || 'api');
      const text = ((data.content || []) as { type: string; text?: string }[]).filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
      const names = parseNames(text);
      if (!names.length) throw new Error('empty');
      setPaste((p) => (p.trim() ? p.trim() + '\n' : '') + names.join('\n'));
      setOcr(`✅ استُخرج ${toAr(names.length)} اسمًا — راجعيها ثم اضغطي «إضافة»`);
    } catch (e) {
      setOcr(`⚠️ تعذّرت القراءة${e instanceof Error && e.message !== 'api' && e.message !== 'empty' ? ` — ${e.message}` : ''}. جرّبي صورة أوضح أو الصقي الأسماء.`);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className={`${CARD} p-3 max-h-[70vh] overflow-y-auto`}>
        {visibleGrades.length === 0 && <p className="text-sm text-ink/60 p-2">لا توجد فصول ضمن نطاقك.</p>}
        {visibleGrades.map((g) => (
          <div key={g.id} className="mb-3">
            <div className="text-xs font-extrabold text-ink/50 px-2 mb-1">الصف {g.name}</div>
            <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
              {classes.filter((c) => c.grade_id === g.id).map((c) => (
                <button key={c.id} onClick={() => setClassId(c.id)} className={`rounded-xl px-2 py-2.5 text-sm font-extrabold ${c.id === classId ? 'bg-sage-deep text-white' : 'bg-sage-mist text-sage-deep hover:bg-sage-light'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <div className={`${CARD} p-4`}>
        {!current ? (
          <p className="text-center text-ink/60 py-16">اختاري فصلًا من القائمة لإدارة طالباته</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-lg flex-1">{current.name} <span className="text-ink/50 text-sm">— {toAr(list.length)} طالبة</span></h3>
            </div>
            <ol className="mt-3 divide-y divide-sage/10">
              {list.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="w-8 text-center text-ink/45 font-bold">{toAr(i + 1)}</span>
                  <span className="flex-1 font-bold">{s.name}</span>
                  <button className="px-2" onClick={() => setProfile(s)} aria-label="سجل الطالبة" title="سجل الطالبة">👤</button>
                  <button className="px-2 text-sage-dark" onClick={() => rename(s)} aria-label="تعديل">✏️</button>
                  <button className="px-2 text-red-500" onClick={() => remove(s)} aria-label="إزالة">✕</button>
                </li>
              ))}
              {!list.length && <li className="py-6 text-center text-ink/55">لا توجد طالبات بعد — أضيفيهن من الأسفل</li>}
            </ol>

            <div className="mt-4 rounded-2xl bg-sage-mist/60 border border-sage/15 p-3">
              <div className="font-extrabold text-sm mb-2">➕ إضافة طالبات</div>
              <textarea className={`${IPT} min-h-[120px]`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="الصقي الأسماء — اسم في كل سطر" />
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <button className={B_SAGE} disabled={busy || !parseNames(paste).length} onClick={() => addNames(parseNames(paste))}>
                  إضافة {parseNames(paste).length ? toAr(parseNames(paste).length) : ''}
                </button>
                <label className={`${B_GHOST} cursor-pointer`}>
                  📸 تصوير كشف
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { readImage(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {ocr && <span className="text-sm text-ink/70">{ocr}</span>}
              </div>
            </div>
          </>
        )}
      </div>
      {profile && current && <StudentRecord sb={sb} student={profile} klass={current} gender={gender} onClose={() => setProfile(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ المسؤولات */
function StaffTab({ sb, sid, uid, grades, classes, say }: {
  sb: ReturnType<typeof createClient>; sid: string; uid: string; grades: Grade[]; classes: Klass[]; say: (m: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<'main' | 'grade'>('grade');
  const [selGrades, setSelGrades] = useState<string[]>([]);
  const [selClasses, setSelClasses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('att_members', { p_school: sid });
    if (error) say(errMsg(error));
    setMembers((data as Member[]) || []);
  }, [sb, sid, say]);
  useEffect(() => {
    load();
  }, [load]);

  const mainsBesideOwner = members.filter((m) => m.kind === 'main' && !m.is_owner).length;
  const gName = (id: string) => grades.find((g) => g.id === id)?.name || '—';
  const cName = (id: string) => classes.find((c) => c.id === id)?.name || '—';
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const save = async () => {
    if (!phone.trim()) return say('اكتبي رقم هاتف المسؤولة');
    if (kind === 'grade' && !selGrades.length && !selClasses.length) return say('اختاري صفًّا أو فصلًا على الأقل');
    setBusy(true);
    const { data, error } = await sb.rpc('att_add_member', {
      p_school: sid, p_identifier: phone.trim(), p_kind: kind, p_grades: kind === 'grade' ? selGrades : [], p_classes: kind === 'grade' ? selClasses : [],
    });
    setBusy(false);
    if (error) return say(errMsg(error));
    const row = ((data as { ok: boolean; msg: string; member_name: string | null }[]) || [])[0];
    if (!row?.ok) return say(row?.msg || 'تعذّرت الإضافة');
    say(`✅ ${row.member_name || ''} — ${editing ? 'تم التعديل' : 'تمت الإضافة'}`);
    setPhone(''); setSelGrades([]); setSelClasses([]); setEditing(null); setKind('grade');
    load();
  };

  const edit = (m: Member) => {
    setEditing(m.member_id);
    setPhone(m.phone || '');
    setKind(m.kind);
    setSelGrades(m.grade_ids || []);
    setSelClasses(m.class_ids || []);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
  const remove = async (m: Member) => {
    if (!window.confirm(`إزالة ${m.name || 'المسؤولة'} من الإدارة؟`)) return;
    const { error } = await sb.rpc('att_remove_member', { p_member: m.member_id });
    if (error) return say(errMsg(error));
    say('🗑️ تمت الإزالة');
    load();
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="font-extrabold mb-3">المسؤولات ({toAr(members.length)})</h3>
        <div className="divide-y divide-sage/10">
          {members.map((m) => (
            <div key={m.member_id} className="py-3 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[180px]">
                <div className="font-extrabold">{m.name || 'بدون اسم'} {m.user_id === uid && <span className="text-xs text-ink/50">(أنتِ)</span>}</div>
                <div className="text-sm text-ink/60">
                  {m.is_owner ? '👑 المنشئة' : m.kind === 'main' ? '👑 مسؤولة رئيسية' : '🧭 مسؤولة صف'}
                  {m.phone ? `، ${toAr(m.phone)}` : ''}
                </div>
                {m.kind === 'grade' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.grade_ids.map((g) => <span key={g} className="rounded-lg bg-sage-light text-sage-deep text-xs font-bold px-2 py-0.5">الصف {gName(g)}</span>)}
                    {m.class_ids.map((c) => <span key={c} className="rounded-lg bg-gold-light text-gold-dark text-xs font-bold px-2 py-0.5">{cName(c)}</span>)}
                  </div>
                )}
              </div>
              {!m.is_owner && (
                <>
                  <button className={B_GHOST} onClick={() => edit(m)}>✏️ الصلاحيات</button>
                  <button className={B_DANGER} onClick={() => remove(m)}>إزالة</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-4`}>
        <h3 className="font-extrabold mb-1">{editing ? '✏️ تعديل صلاحيات مسؤولة' : '➕ إضافة مسؤولة'}</h3>
        <p className="text-sm text-ink/60 mb-3">تدخل المسؤولة بحسابها برقم هاتفها (مجانًا تحت المدرسة). إن لم يكن لها حساب، تسجّل في غراس أولًا.</p>
        <label className="block">
          <span className="text-sm font-bold">رقم الهاتف</span>
          <input className={IPT} inputMode="tel" value={phone} disabled={!!editing} onChange={(e) => setPhone(e.target.value)} placeholder="مثال: 9xxxxxxx" />
        </label>
        <div className="flex gap-2 mt-3">
          <button className={`${BTN} flex-1 ${kind === 'grade' ? 'bg-sage text-white' : 'bg-sage-mist text-sage-deep'}`} onClick={() => setKind('grade')}>🧭 مسؤولة صف</button>
          <button
            className={`${BTN} flex-1 ${kind === 'main' ? 'bg-sage text-white' : 'bg-sage-mist text-sage-deep'}`}
            disabled={!editing && mainsBesideOwner >= 2}
            onClick={() => setKind('main')}
          >
            👑 رئيسية {mainsBesideOwner >= 2 && !editing ? '(اكتمل العدد)' : `(${toAr(mainsBesideOwner)}/${toAr(2)})`}
          </button>
        </div>
        {kind === 'grade' && (
          <div className="mt-3">
            <div className="text-sm font-bold mb-1">الصفوف</div>
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button key={g.id} onClick={() => setSelGrades(toggle(selGrades, g.id))} className={`${BTN} ${selGrades.includes(g.id) ? 'bg-sage-deep text-white' : 'bg-white border border-sage/25 text-sage-deep'}`}>
                  {selGrades.includes(g.id) ? '✓ ' : ''}الصف {g.name}
                </button>
              ))}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-bold text-sage-deep">صلاحية إضافية على فصول محدّدة (اختياري)</summary>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {classes.filter((c) => !selGrades.includes(c.grade_id)).map((c) => (
                  <button key={c.id} onClick={() => setSelClasses(toggle(selClasses, c.id))} className={`rounded-lg px-2.5 py-1.5 text-sm font-bold ${selClasses.includes(c.id) ? 'bg-gold text-white' : 'bg-gold-light/60 text-gold-dark'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button className={`${B_GOLD} flex-1`} disabled={busy} onClick={save}>{busy ? '⏳' : editing ? '💾 حفظ الصلاحيات' : '➕ إضافة'}</button>
          {editing && <button className={B_GHOST} onClick={() => { setEditing(null); setPhone(''); setSelGrades([]); setSelClasses([]); setKind('grade'); }}>إلغاء</button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ الإعدادات */
function SettingsTab({ sb, org, say, reloadOrgs }: {
  sb: ReturnType<typeof createClient>; org: Org; say: (m: string) => void; reloadOrgs: () => Promise<Org[]>;
}) {
  const [name, setName] = useState(org.name);
  const [gender, setGender] = useState(org.gender);
  const [cutoff, setCutoff] = useState((org.cutoff || '07:45').slice(0, 5));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await sb.rpc('att_org_update', { p_school: org.school_id, p_name: name.trim(), p_gender: gender, p_cutoff: cutoff });
    setBusy(false);
    if (error) return say(errMsg(error));
    await reloadOrgs();
    say('💾 تم الحفظ');
  };

  return (
    <div className={`${CARD} p-5 space-y-4 max-w-xl`}>
      <label className="block">
        <span className="text-sm font-bold">اسم المدرسة</span>
        <input className={IPT} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <span className="text-sm font-bold">المدرسة</span>
        <div className="flex gap-2 mt-1">
          {(['girls', 'boys'] as const).map((g) => (
            <button key={g} onClick={() => setGender(g)} className={`${BTN} flex-1 ${gender === g ? 'bg-sage text-white' : 'bg-sage-mist text-sage-deep'}`}>
              {g === 'girls' ? '👧 بنات' : '👦 بنين'}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-bold">وقت التنبيه بالفصول غير المسجّلة</span>
        <input type="time" className={IPT} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        <span className="text-xs text-ink/55">بعد هذا الوقت يظهر للمسؤولات الرئيسيات تنبيه بالفصول التي لم يُعتمد حضورها.</span>
      </label>
      <button className={B_SAGE} disabled={busy} onClick={save}>{busy ? '⏳' : '💾 حفظ'}</button>
    </div>
  );
}

/* ================================================================== لوحة التفعيل (الأدمِن) */
function AdminBoard({ sb, say }: { sb: ReturnType<typeof createClient>; say: (m: string) => void }) {
  const [rows, setRows] = useState<AdminOrg[]>([]);
  const [draft, setDraft] = useState<Record<string, { classes: number; months: number }>>({});

  const load = useCallback(async () => {
    const { data: schools, error } = await sb
      .from('schools')
      .select('id,name,owner_id,att_until,att_classes,created_at')
      .eq('att_org', true)
      .order('created_at', { ascending: false });
    if (error) return say(errMsg(error));
    const list = (schools as AdminOrg[]) || [];
    const ids = list.map((s) => s.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: cls } = await sb.from('school_classes').select('school_id').in('school_id', ids).eq('archived', false);
      ((cls as { school_id: string }[]) || []).forEach((c) => { counts[c.school_id] = (counts[c.school_id] || 0) + 1; });
      const { data: owners } = await sb.from('profiles').select('id,full_name,phone').in('id', list.map((s) => s.owner_id));
      const om: Record<string, string> = {};
      ((owners as { id: string; full_name: string | null; phone: string | null }[]) || []).forEach((o) => { om[o.id] = `${o.full_name || ''}${o.phone ? '، ' + o.phone : ''}`; });
      list.forEach((s) => { s.classes = counts[s.id] || 0; s.owner = om[s.owner_id]; });
    }
    setRows(list);
    setDraft(Object.fromEntries(list.map((s) => [s.id, { classes: Math.max(MIN_CLASSES, s.classes, s.att_classes || 0), months: MONTHS }])));
  }, [sb, say]);
  useEffect(() => {
    load();
  }, [load]);

  const activate = async (s: AdminOrg) => {
    const d = draft[s.id];
    if (!window.confirm(`تفعيل «${s.name}» بـ${toAr(d.classes)} فصلًا لمدة ${toAr(d.months)} شهور = ${toAr(price(d.classes))} د.ك؟`)) return;
    const { error } = await sb.rpc('att_org_set_subscription', { p_school: s.id, p_classes: d.classes, p_months: d.months });
    if (error) return say(errMsg(error));
    say('✅ تم التفعيل');
    load();
  };
  const stop = async (s: AdminOrg) => {
    if (!window.confirm(`إيقاف «${s.name}» الآن؟`)) return;
    const { error } = await sb.rpc('att_org_stop', { p_school: s.id });
    if (error) return say(errMsg(error));
    say('⏸️ تم الإيقاف');
    load();
  };

  return (
    <section className="mt-10">
      <h2 className="text-lg font-extrabold mb-1">🔐 لوحة التفعيل (للإدارة فقط)</h2>
      <p className="text-sm text-ink/60 mb-3">{toAr(PRICE_PER_CLASS)} د.ك للفصل، أقلّ اشتراك {toAr(MIN_CLASSES)} فصول، {toAr(MONTHS)} شهور. التجديد يُكمل من تاريخ الانتهاء.</p>
      {!rows.length && <p className="text-ink/55 text-sm">لا توجد إدارات بعد.</p>}
      <div className="space-y-3">
        {rows.map((s) => {
          const active = s.att_until && new Date(s.att_until) > new Date();
          const d = draft[s.id] || { classes: MIN_CLASSES, months: MONTHS };
          return (
            <div key={s.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-extrabold">{s.name}</div>
                  <div className="text-sm text-ink/60">
                    {s.owner || '—'}، {toAr(s.classes)} فصلًا فعليًا ·{' '}
                    {active ? `✅ حتى ${fmtDate(s.att_until)} (${toAr(s.att_classes)} فصلًا)` : s.att_until ? '⏸️ منتهية' : '⏳ لم تُفعَّل'}
                  </div>
                </div>
                <label className="text-sm font-bold flex items-center gap-1">
                  فصول
                  <input type="number" min={MIN_CLASSES} className="w-20 rounded-lg border border-sage/25 px-2 py-1.5" value={d.classes}
                    onChange={(e) => setDraft({ ...draft, [s.id]: { ...d, classes: Math.max(MIN_CLASSES, parseInt(e.target.value || '0', 10) || MIN_CLASSES) } })} />
                </label>
                <label className="text-sm font-bold flex items-center gap-1">
                  شهور
                  <input type="number" min={1} className="w-16 rounded-lg border border-sage/25 px-2 py-1.5" value={d.months}
                    onChange={(e) => setDraft({ ...draft, [s.id]: { ...d, months: Math.max(1, parseInt(e.target.value || '4', 10) || MONTHS) } })} />
                </label>
                <button className={B_GOLD} onClick={() => activate(s)}>{active ? '🔁 تجديد' : '✅ تفعيل'}، {toAr(price(d.classes))} د.ك</button>
                {active && <button className={B_DANGER} onClick={() => stop(s)}>⏸️ إيقاف</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
