'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { StudentRecord } from './AttRecords';

/**
 * «إدارة الحضور المدرسية» — المرحلة ٣: التسجيل اليومي + لوحة الإدارة + التنبيهات.
 * نفس تجربة سجل الحضور الذكي: الكل حاضرات افتراضيًا، والضغطة على البطاقة تبدّل
 * الحالة دائريًا (حاضرة ← غائبة ← متأخرة ← مستأذنة ← غياب بعذر ← حاضرة).
 * كل ضغطة = صف واحد عبر att_mark (لا تضارب بين مسؤولتين)، مع طابور عند انقطاع الاتصال.
 */

type SB = ReturnType<typeof createClient>;
type Status = 'present' | 'absent' | 'late' | 'excused_out' | 'excused_abs';
type Grade = { id: string; stage_id: string; name: string; sort: number };
type Klass = { id: string; grade_id: string; name: string; sort: number };
type Student = { id: string; class_id: string; name: string; sort: number };
type AttRow = { class_id: string; student_id: string; status: Status };
type DayRow = { class_id: string; approved: boolean; approved_name: string | null; approved_at: string | null; updated_name: string | null; updated_at: string };
type OrgLite = { school_id: string; name: string; gender: 'girls' | 'boys'; active: boolean; cutoff: string; kind: 'main' | 'grade' };

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const ORDER: Status[] = ['present', 'absent', 'late', 'excused_out', 'excused_abs'];
const META: Record<Status, { ic: string; girls: string; boys: string; color: string; bg: string }> = {
  present: { ic: '✅', girls: 'حاضرة', boys: 'حاضر', color: '#3E9B5F', bg: '#E7F5EC' },
  absent: { ic: '🔴', girls: 'غائبة', boys: 'غائب', color: '#D64545', bg: '#FBE9E9' },
  late: { ic: '🟡', girls: 'متأخرة', boys: 'متأخر', color: '#B98B12', bg: '#FBF3DA' },
  excused_out: { ic: '🟠', girls: 'مستأذنة', boys: 'مستأذن', color: '#E07B39', bg: '#FCEBDD' },
  excused_abs: { ic: '🟣', girls: 'غياب بعذر', boys: 'غياب بعذر', color: '#8E5EA8', bg: '#F2E9F6' },
};
const DOWS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** اليوم والوقت بتوقيت الكويت (لا بتوقيت الجهاز) */
function kuwaitNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
}
const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T12:00');
  return `${DOWS[d.getDay()]} ${toAr(d.getDate())} ${MONTHS[d.getMonth()]} ${toAr(d.getFullYear())}`;
};
const fmtTime = (ts: string | null) => {
  if (!ts) return '';
  const s = new Intl.DateTimeFormat('ar-KW-u-nu-arab', { timeZone: 'Asia/Kuwait', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  return s;
};
const shiftDate = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const isAbsent = (s: Status) => s === 'absent' || s === 'excused_abs';

const BTN = 'rounded-xl px-4 py-2.5 font-extrabold text-sm transition-all disabled:opacity-50';
const CARD = 'rounded-2xl bg-white border border-sage/15 shadow-sm';

/** يجلب كل الصفوف مع تجاوز حدّ ١٠٠٠ صف في Supabase */
async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error || !data) break;
    const rows = data as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/* =================================================================== الجذر */
export default function AttDaily({ sb, org, grades, classes, scopeClassIds, fullName, say }: {
  sb: SB; org: OrgLite; grades: Grade[]; classes: Klass[]; scopeClassIds: string[] | null; fullName: string; say: (m: string) => void;
}) {
  const girls = org.gender !== 'boys';
  const word = (s: Status) => (girls ? META[s].girls : META[s].boys);
  const [date, setDate] = useState(kuwaitNow().date);
  const [level, setLevel] = useState<'dash' | 'grade' | 'class'>('dash');
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  // «مَن تسجّل الآن؟» — يُحفظ على الجهاز لكل إدارة
  const nameKey = `att_byname_${org.school_id}`;
  const [byName, setByName] = useState<string>('');
  const [askName, setAskName] = useState(false);
  useEffect(() => {
    let v = '';
    try { v = localStorage.getItem(nameKey) || ''; } catch { /* خاص */ }
    setByName(v);
  }, [nameKey]);
  const saveName = (n: string) => {
    const v = n.trim();
    setByName(v);
    try { if (v) localStorage.setItem(nameKey, v); else localStorage.removeItem(nameKey); } catch { /* خاص */ }
    setAskName(false);
  };

  const myClasses = useMemo(
    () => (scopeClassIds ? classes.filter((c) => scopeClassIds.includes(c.id)) : classes),
    [classes, scopeClassIds],
  );
  const myGrades = useMemo(() => grades.filter((g) => myClasses.some((c) => c.grade_id === g.id)), [grades, myClasses]);

  // مسؤولة صف واحد ⇒ تفتح على صفها مباشرةً (أقل ضغطات)
  useEffect(() => {
    if (org.kind === 'grade' && myGrades.length === 1 && level === 'dash') {
      setGradeId(myGrades[0].id);
      setLevel('grade');
    }
  }, [org.kind, myGrades, level]);

  const openClass = (id: string) => {
    if (!byName) setAskName(true);
    setClassId(id);
    setLevel('class');
  };

  return (
    <div>
      {/* شريط التاريخ + المسجِّلة */}
      <div className={`${CARD} p-3 flex flex-wrap items-center gap-2`}>
        <div className="flex items-center gap-1">
          <button className={`${BTN} bg-sage-mist text-sage-deep`} onClick={() => setDate(shiftDate(date, -1))} aria-label="اليوم السابق">›</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-xl border border-sage/25 px-2 py-2 font-bold" />
          <button className={`${BTN} bg-sage-mist text-sage-deep`} onClick={() => setDate(shiftDate(date, 1))} aria-label="اليوم التالي">‹</button>
          {date !== kuwaitNow().date && (
            <button className={`${BTN} bg-gold-light text-gold-dark`} onClick={() => setDate(kuwaitNow().date)}>اليوم</button>
          )}
        </div>
        <div className="flex-1" />
        <button className="rounded-xl bg-sage-mist px-3 py-2 text-sm font-bold text-sage-deep" onClick={() => setAskName(true)}>
          ✍️ تسجّل الآن: {byName || fullName || 'اختاري اسمك'}
        </button>
      </div>

      {!org.active && (
        <div className="mt-3 rounded-2xl bg-gold-light border border-gold/40 px-4 py-3 font-bold text-ink">
          ⏳ التسجيل اليومي يبدأ بعد تفعيل الإدارة — يمكنكِ الاطّلاع على الفصول الآن.
        </div>
      )}

      <div className="mt-4">
        {level === 'dash' && (
          <Dashboard
            sb={sb} org={org} date={date} grades={myGrades} classes={myClasses} word={word}
            onGrade={(id) => { setGradeId(id); setLevel('grade'); }}
            onClass={openClass}
          />
        )}
        {level === 'grade' && gradeId && (
          <GradeView
            sb={sb} org={org} date={date} grade={grades.find((g) => g.id === gradeId)!}
            classes={myClasses.filter((c) => c.grade_id === gradeId)}
            canBack={org.kind === 'main' || myGrades.length > 1}
            onBack={() => setLevel('dash')} onClass={openClass}
          />
        )}
        {level === 'class' && classId && (
          <ClassRecorder
            sb={sb} org={org} date={date} klass={myClasses.find((c) => c.id === classId)!} byName={byName || fullName}
            word={word} say={say}
            onBack={() => setLevel(gradeId ? 'grade' : 'dash')}
            onApproved={() => setLevel(gradeId ? 'grade' : 'dash')}
          />
        )}
      </div>

      {askName && <NamePrompt initial={byName || fullName} onSave={saveName} onClose={() => setAskName(false)} />}
    </div>
  );
}

/* =================================================================== «مَن تسجّل الآن؟» */
function NamePrompt({ initial, onSave, onClose }: { initial: string; onSave: (n: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`${CARD} p-6 w-full max-w-sm`} onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl text-center">✍️</div>
        <h3 className="text-center font-extrabold text-lg mt-1">مَن تسجّل الآن؟</h3>
        <p className="text-center text-sm text-ink/60 mt-1">يظهر اسمكِ في «بواسطة» وسجل التعديلات. يُحفظ على هذا الجهاز.</p>
        <input autoFocus className="mt-4 w-full rounded-xl border border-sage/25 px-3 py-3 text-lg text-center" value={v} onChange={(e) => setV(e.target.value)} placeholder="مثال: أ. سارة" />
        <button className={`${BTN} bg-sage text-white w-full mt-3 py-3 text-base`} disabled={!v.trim()} onClick={() => onSave(v)}>تأكيد</button>
      </div>
    </div>
  );
}

/* =================================================================== بيانات اليوم */
function useDayData(sb: SB, schoolId: string, date: string, classIds: string[]) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [att, setAtt] = useState<AttRow[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const key = classIds.join(',');

  const load = useCallback(async () => {
    if (!classIds.length) { setStudents([]); setAtt([]); setDays([]); return; }
    const [st, at, dy] = await Promise.all([
      fetchAll<Student>((a, b) => sb.from('school_students').select('id,class_id,name,sort').eq('school_id', schoolId).eq('archived', false).in('class_id', classIds).order('id').range(a, b)),
      fetchAll<AttRow>((a, b) => sb.from('school_attendance').select('class_id,student_id,status').eq('school_id', schoolId).eq('date', date).in('class_id', classIds).order('student_id').range(a, b)),
      sb.from('school_att_days').select('class_id,approved,approved_name,approved_at,updated_name,updated_at').eq('school_id', schoolId).eq('date', date).in('class_id', classIds),
    ]);
    setStudents(st);
    setAtt(at);
    setDays((dy.data as DayRow[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, schoolId, date, key]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000); // تحديث دوري: ترى ما سجّلته زميلاتها
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const byClass = useMemo(() => {
    const m: Record<string, { total: number; absent: number; late: number; excused: number; approved: boolean; touched: boolean; day?: DayRow }> = {};
    classIds.forEach((id) => { m[id] = { total: 0, absent: 0, late: 0, excused: 0, approved: false, touched: false }; });
    (students || []).forEach((s) => { if (m[s.class_id]) m[s.class_id].total++; });
    att.forEach((a) => {
      const r = m[a.class_id];
      if (!r) return;
      if (isAbsent(a.status)) r.absent++;
      else if (a.status === 'late') r.late++;
      else if (a.status === 'excused_out') r.excused++;
    });
    days.forEach((d) => { const r = m[d.class_id]; if (r) { r.approved = d.approved; r.touched = true; r.day = d; } });
    return m;
  }, [students, att, days, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { students, byClass, reload: load };
}

/* =================================================================== لوحة الإدارة */
function Dashboard({ sb, org, date, grades, classes, word, onGrade, onClass }: {
  sb: SB; org: OrgLite; date: string; grades: Grade[]; classes: Klass[]; word: (s: Status) => string;
  onGrade: (id: string) => void; onClass: (id: string) => void;
}) {
  const ids = useMemo(() => classes.map((c) => c.id), [classes]);
  const { students, byClass } = useDayData(sb, org.school_id, date, ids);
  const now = kuwaitNow();
  const isToday = date === now.date;
  const pastCutoff = isToday && now.hm >= (org.cutoff || '07:45').slice(0, 5);

  const totals = useMemo(() => {
    let total = 0, absent = 0, late = 0, excused = 0, done = 0;
    ids.forEach((id) => {
      const r = byClass[id];
      if (!r) return;
      total += r.total; absent += r.absent; late += r.late; excused += r.excused;
      if (r.approved) done++;
    });
    return { total, absent, late, excused, present: total - absent, done };
  }, [byClass, ids]);
  const pending = classes.filter((c) => !byClass[c.id]?.approved);

  if (!students) return <p className="text-center text-ink/60 py-16">⏳ جاري التحميل…</p>;
  if (!classes.length) return <p className="text-center text-ink/60 py-16">لا توجد فصول ضمن نطاقك بعد.</p>;

  return (
    <div>
      <h2 className="text-xl font-extrabold">إدارة الحضور — {isToday ? 'اليوم' : ''} {fmtDay(date)}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
        <Stat n={totals.total} l={girls(org) ? 'إجمالي الطالبات' : 'إجمالي الطلاب'} c="#41603F" />
        <Stat n={totals.present} l={girls(org) ? 'الحاضرات اليوم' : 'الحاضرون اليوم'} c={META.present.color} />
        <Stat n={totals.absent} l={girls(org) ? 'الغائبات اليوم' : 'الغائبون اليوم'} c={META.absent.color} />
        <Stat n={totals.done} l="فصول سُجّلت" c="#C9A84C" />
        <Stat n={classes.length - totals.done} l="فصول لم تُسجّل" c={classes.length - totals.done ? '#D64545' : '#3E9B5F'} />
      </div>
      {(totals.late > 0 || totals.excused > 0) && (
        <p className="mt-2 text-sm text-ink/65 font-bold">🟡 {word('late')}: {toAr(totals.late)}، 🟠 {word('excused_out')}: {toAr(totals.excused)}</p>
      )}

      <div className={`mt-3 rounded-2xl px-4 py-3 font-extrabold ${pending.length ? 'bg-white border border-sage/20' : 'bg-sage-light text-sage-deep'}`}>
        تم تسجيل {toAr(totals.done)} من {toAr(classes.length)} فصلًا {pending.length ? '' : '— ✅ اكتمل تسجيل كل الفصول'}
      </div>

      {pending.length > 0 && (pastCutoff || !isToday) && (
        <div className="mt-3 rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="font-extrabold text-red-700">⚠️ {isToday ? `بعد ${toAr((org.cutoff || '07:45').slice(0, 5))} — ` : ''}لم يُعتمد حضور {toAr(pending.length)} {pending.length > 2 ? 'فصول' : 'فصل'} حتى الآن:</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {pending.map((c) => (
              <button key={c.id} onClick={() => onClass(c.id)} className="rounded-xl bg-white border border-red-200 text-red-700 px-3 py-2 font-extrabold text-sm">
                {c.name}{byClass[c.id]?.touched ? '، قيد التسجيل' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {grades.map((g) => {
          const cs = classes.filter((c) => c.grade_id === g.id);
          const tot = cs.reduce((s, c) => s + (byClass[c.id]?.total || 0), 0);
          const abs = cs.reduce((s, c) => s + (byClass[c.id]?.absent || 0), 0);
          const left = cs.filter((c) => !byClass[c.id]?.approved).length;
          return (
            <button key={g.id} onClick={() => onGrade(g.id)} className={`${CARD} p-5 text-right hover:shadow-md transition-all border-2 ${left ? 'border-gold/40' : 'border-sage/40'}`}>
              <div className="text-lg font-extrabold">الصف {g.name}</div>
              <div className="text-sm text-ink/65 mt-1">{toAr(cs.length)} فصول، {toAr(tot)} {girls(org) ? 'طالبة' : 'طالب'}</div>
              <div className="text-sm mt-1 font-bold" style={{ color: META.absent.color }}>الغياب اليوم: {toAr(abs)}</div>
              <div className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-extrabold ${left ? 'bg-gold-light text-gold-dark' : 'bg-sage-light text-sage-deep'}`}>
                {left ? `⚠️ باقي ${toAr(left)} ${left > 2 ? 'فصول' : left === 2 ? 'فصلان' : 'فصل'} لم ${left === 1 ? 'يُسجّل' : 'تُسجّل'}` : '✅ اكتمل تسجيل جميع الفصول'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
const girls = (o: OrgLite) => o.gender !== 'boys';

function Stat({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <div className={`${CARD} p-3 text-center border-b-4`} style={{ borderBottomColor: c }}>
      <div className="text-3xl font-extrabold" style={{ color: c }}>{toAr(n)}</div>
      <div className="text-xs font-bold text-ink/65 mt-1">{l}</div>
    </div>
  );
}

/* =================================================================== داخل الصف */
function GradeView({ sb, org, date, grade, classes, canBack, onBack, onClass }: {
  sb: SB; org: OrgLite; date: string; grade: Grade; classes: Klass[]; canBack: boolean; onBack: () => void; onClass: (id: string) => void;
}) {
  const ids = useMemo(() => classes.map((c) => c.id), [classes]);
  const { students, byClass } = useDayData(sb, org.school_id, date, ids);
  if (!students) return <p className="text-center text-ink/60 py-16">⏳ جاري التحميل…</p>;
  return (
    <div>
      <div className="flex items-center gap-2">
        {canBack && <button className={`${BTN} bg-white border border-sage/30 text-sage-deep`} onClick={onBack}>→ الصفوف</button>}
        <h2 className="text-xl font-extrabold flex-1">الصف {grade.name}</h2>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 mt-3">
        {classes.map((c) => {
          const r = byClass[c.id] || { total: 0, absent: 0, late: 0, excused: 0, approved: false, touched: false };
          const state = r.approved ? 'done' : r.touched ? 'doing' : 'none';
          const border = state === 'done' ? 'border-sage' : state === 'doing' ? 'border-gold' : 'border-red-200';
          return (
            <button key={c.id} onClick={() => onClass(c.id)} className={`${CARD} p-4 text-right border-2 ${border} hover:shadow-md transition-all active:scale-[.99]`}>
              <div className="text-xl font-extrabold">{c.name}</div>
              <div className="text-sm text-ink/65 mt-1">{toAr(r.total)} {girls(org) ? 'طالبة' : 'طالب'}</div>
              <div className="flex gap-3 text-sm font-extrabold mt-1">
                <span style={{ color: META.present.color }}>{toAr(r.total - r.absent)} {girls(org) ? 'حاضرة' : 'حاضر'}</span>
                <span style={{ color: META.absent.color }}>{toAr(r.absent)} {girls(org) ? 'غائبة' : 'غائب'}</span>
              </div>
              <div className={`mt-2 text-sm font-extrabold ${state === 'done' ? 'text-sage-deep' : state === 'doing' ? 'text-gold-dark' : 'text-red-600'}`}>
                {state === 'done' ? '✅ تم التسجيل' : state === 'doing' ? '✏️ قيد التسجيل — لم يُعتمد' : '⏳ لم يُسجّل بعد'}
              </div>
              {r.day && (
                <div className="text-xs text-ink/55 mt-1">
                  آخر تحديث: {fmtTime(r.day.updated_at)}{r.day.updated_name ? `، بواسطة: ${r.day.updated_name}` : ''}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =================================================================== تسجيل الفصل */
type Pending = { class_id: string; date: string; student_id: string; status: Status; by: string };
const QKEY = 'att_school_queue_v1';
const readQ = (): Pending[] => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q: Pending[]) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* خاص */ } };

function ClassRecorder({ sb, org, date, klass, byName, word, say, onBack, onApproved }: {
  sb: SB; org: OrgLite; date: string; klass: Klass; byName: string; word: (s: Status) => string; say: (m: string) => void;
  onBack: () => void; onApproved: () => void;
}) {
  const [list, setList] = useState<Student[] | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [day, setDay] = useState<DayRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'absent' | 'late'>('all');
  const [search, setSearch] = useState('');
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Student | null>(null);
  const inflight = useRef(0);
  const statusRef = useRef<Record<string, Status>>({});
  const chains = useRef<Record<string, Promise<void>>>({});
  useEffect(() => { statusRef.current = status; }, [status]);

  const load = useCallback(async () => {
    if (inflight.current > 0 || readQ().some((p) => p.class_id === klass.id)) return; // لا نمسح تغييرات لم تُرسل
    const [st, at, dy] = await Promise.all([
      sb.from('school_students').select('id,class_id,name,sort').eq('class_id', klass.id).eq('archived', false).order('sort').order('created_at'),
      sb.from('school_attendance').select('class_id,student_id,status').eq('class_id', klass.id).eq('date', date),
      sb.from('school_att_days').select('class_id,approved,approved_name,approved_at,updated_name,updated_at').eq('class_id', klass.id).eq('date', date).maybeSingle(),
    ]);
    setList((st.data as Student[]) || []);
    const m: Record<string, Status> = {};
    ((at.data as AttRow[]) || []).forEach((a) => { m[a.student_id] = a.status; });
    setStatus(m);
    setDay((dy.data as DayRow) || null);
  }, [sb, klass.id, date]);

  // إرسال الطابور (عند عودة الاتصال)
  const flush = useCallback(async () => {
    const q = readQ();
    if (!q.length) { setQueued(0); return; }
    const rest: Pending[] = [];
    for (const p of q) {
      const { error } = await sb.rpc('att_mark', { p_class: p.class_id, p_date: p.date, p_student: p.student_id, p_status: p.status, p_by_name: p.by });
      if (error && /fetch|network|Failed/i.test(error.message || '')) rest.push(p);
    }
    writeQ(rest);
    setQueued(rest.filter((p) => p.class_id === klass.id).length);
  }, [sb, klass.id]);

  useEffect(() => {
    flush().then(load);
    const t = window.setInterval(() => { flush().then(load); }, 20000);
    const on = () => { flush().then(load); };
    window.addEventListener('online', on);
    window.addEventListener('focus', on);
    return () => { window.clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('focus', on); };
  }, [flush, load]);

  const cur = (id: string): Status => status[id] || 'present';

  const cycle = (s: Student) => {
    if (!org.active) return say('⏳ الإدارة غير مفعّلة بعد');
    const prev = statusRef.current[s.id] || 'present';
    const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
    statusRef.current = { ...statusRef.current, [s.id]: next };
    setStatus((m) => ({ ...m, [s.id]: next }));
    inflight.current++;
    // ضغطات الطالبة الواحدة تُرسل بالترتيب (لا يسبق طلبٌ طلبًا قبله)
    const run = (chains.current[s.id] || Promise.resolve()).then(() => send(s, prev, next));
    chains.current[s.id] = run;
  };
  const send = async (s: Student, prev: Status, next: Status) => {
    const { error } = await sb.rpc('att_mark', { p_class: klass.id, p_date: date, p_student: s.id, p_status: next, p_by_name: byName });
    inflight.current--;
    if (error) {
      if (/fetch|network|Failed/i.test(error.message || '')) {
        // بلا اتصال: نحفظ على الجهاز ونرسل لاحقًا (آخر حالة لهذه الطالبة فقط)
        const q = readQ().filter((p) => !(p.student_id === s.id && p.date === date));
        q.push({ class_id: klass.id, date, student_id: s.id, status: next, by: byName });
        writeQ(q);
        setQueued(q.filter((p) => p.class_id === klass.id).length);
      } else {
        if (statusRef.current[s.id] === next) {
          statusRef.current = { ...statusRef.current, [s.id]: prev };
          setStatus((m) => ({ ...m, [s.id]: prev }));
        }
        say(error.message.includes('inactive') ? '⏳ الإدارة غير مفعّلة' : error.message.includes('forbidden') ? 'غير مصرّح لكِ بهذا الفصل' : 'تعذّر الحفظ — حاولي مرة أخرى');
      }
    }
  };

  const markAll = async (s: Status) => {
    if (!org.active) return say('⏳ الإدارة غير مفعّلة بعد');
    setBusy(true);
    const { error } = await sb.rpc('att_mark_all', { p_class: klass.id, p_date: date, p_status: s, p_by_name: byName });
    setBusy(false);
    if (error) return say('تعذّر الحفظ — تحقّقي من الاتصال');
    say(s === 'present' ? `✅ الكل ${girls(org) ? 'حاضرات' : 'حاضرون'}` : '🔴 الكل غياب');
    load();
  };
  const reset = async () => {
    if (!window.confirm('إعادة تعيين حضور هذا اليوم لهذا الفصل؟')) return;
    setBusy(true);
    const { error } = await sb.rpc('att_reset_day', { p_class: klass.id, p_date: date, p_by_name: byName });
    setBusy(false);
    if (error) return say('تعذّر — تحقّقي من الاتصال');
    say('↺ تمت إعادة التعيين');
    load();
  };
  const approve = async () => {
    if (!org.active) return say('⏳ الإدارة غير مفعّلة بعد');
    await flush();
    if (readQ().some((p) => p.class_id === klass.id)) return say('💾 بانتظار الاتصال لإرسال التغييرات أولًا');
    setBusy(true);
    const { error } = await sb.rpc('att_approve', { p_class: klass.id, p_date: date, p_by_name: byName });
    setBusy(false);
    if (error) return say('تعذّر الاعتماد — تحقّقي من الاتصال');
    say(`✅ اعتُمد حضور ${klass.name}`);
    onApproved();
  };

  if (!list) return <p className="text-center text-ink/60 py-16">⏳ جاري التحميل…</p>;

  const counts = ORDER.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<Status, number>);
  list.forEach((s) => { counts[cur(s.id)]++; });
  const absentN = counts.absent + counts.excused_abs;
  let shown = list;
  if (filter === 'absent') shown = shown.filter((s) => isAbsent(cur(s.id)));
  if (filter === 'late') shown = shown.filter((s) => cur(s.id) === 'late');
  if (search.trim()) shown = shown.filter((s) => s.name.includes(search.trim()));

  return (
    <div className="pb-28">
      {/* رأس ثابت بالأعداد */}
      <div className="sticky top-[60px] z-10 -mx-4 px-4 pt-2 pb-3 bg-cream/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <button className={`${BTN} bg-white border border-sage/30 text-sage-deep`} onClick={onBack}>→</button>
          <h2 className="text-xl font-extrabold flex-1">{klass.name}</h2>
          {queued > 0 && <span className="rounded-full bg-gold-light text-gold-dark px-3 py-1 text-xs font-extrabold">💾 {toAr(queued)} بانتظار الاتصال</span>}
          {day?.approved && <span className="rounded-full bg-sage-light text-sage-deep px-3 py-1 text-xs font-extrabold">✅ معتمد {fmtTime(day.approved_at)}</span>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">
          <Mini n={list.length} l={girls(org) ? 'طالبة' : 'طالب'} c="#41603F" />
          <Mini n={counts.present} l={word('present')} c={META.present.color} />
          <Mini n={absentN} l="غياب" c={META.absent.color} />
          <Mini n={counts.late} l={word('late')} c={META.late.color} />
          <Mini n={counts.excused_out} l={word('excused_out')} c={META.excused_out.color} />
          <Mini n={counts.excused_abs} l="بعذر" c={META.excused_abs.color} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-1">
        <button className={`${BTN} bg-white border border-sage/25`} disabled={busy} onClick={() => markAll('present')}>✅ الكل {girls(org) ? 'حاضرات' : 'حاضرون'}</button>
        <button className={`${BTN} bg-white border border-sage/25`} disabled={busy} onClick={() => markAll('absent')}>🔴 الكل غياب</button>
        <button className={`${BTN} bg-white border border-sage/25`} disabled={busy} onClick={reset}>↺ إعادة تعيين</button>
        <button className={`${BTN} ${filter === 'absent' ? 'bg-red-500 text-white' : 'bg-white border border-sage/25'}`} onClick={() => setFilter(filter === 'absent' ? 'all' : 'absent')}>الغياب فقط</button>
        <button className={`${BTN} ${filter === 'late' ? 'bg-gold text-white' : 'bg-white border border-sage/25'}`} onClick={() => setFilter(filter === 'late' ? 'all' : 'late')}>{girls(org) ? 'المتأخرات' : 'المتأخرون'} فقط</button>
        <input className="flex-1 min-w-[140px] rounded-xl border border-sage/25 px-3 py-2" placeholder="🔎 بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-bold text-ink/60 mt-3">
        {ORDER.map((k) => <span key={k}><span className="inline-block w-2.5 h-2.5 rounded-full ml-1" style={{ background: META[k].color }} />{word(k)}</span>)}
        <span>— اضغطي على البطاقة للتبديل</span>
      </div>

      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-3">
        {shown.map((s) => {
          const st = cur(s.id);
          const idx = list.indexOf(s) + 1;
          return (
            <div key={s.id} role="button" tabIndex={0} onClick={() => cycle(s)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(s); } }}
              className="rounded-2xl border-2 p-3 flex items-center gap-3 text-right select-none cursor-pointer active:scale-[.98] transition-transform min-h-[64px]"
              style={{ background: META[st].bg, borderColor: st === 'present' ? '#D7E6D9' : META[st].color }}>
              <span className="w-8 h-8 shrink-0 rounded-full bg-white/80 flex items-center justify-center font-extrabold text-sm text-ink/60">{toAr(idx)}</span>
              <span className="flex-1">
                <span className="block font-extrabold leading-snug">{s.name}</span>
                <span className="block text-xs font-extrabold" style={{ color: META[st].color }}>{word(st)}</span>
              </span>
              <span className="text-2xl">{META[st].ic}</span>
              <button type="button" title="سجل الطالبة" aria-label="سجل الطالبة" onClick={(e) => { e.stopPropagation(); setProfile(s); }}
                className="w-9 h-9 shrink-0 rounded-full bg-white/90 border border-sage/20 flex items-center justify-center text-base">👤</button>
            </div>
          );
        })}
        {!shown.length && <p className="col-span-full text-center text-ink/55 py-10">{list.length ? 'لا توجد نتائج' : 'لا توجد طالبات في هذا الفصل — أضيفيهن من تبويب «الطالبات»'}</p>}
      </div>

      {profile && <StudentRecord sb={sb} student={profile} klass={klass} gender={org.gender} onClose={() => setProfile(null)} />}

      {/* زر الاعتماد ثابت أسفل الشاشة */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 border-t border-sage/20 p-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="text-sm font-bold text-ink/70 flex-1">
            {toAr(list.length)} {girls(org) ? 'طالبة' : 'طالب'} — حضور {toAr(counts.present + counts.late + counts.excused_out)} — غياب {toAr(absentN)}
            {day?.updated_name && <span className="block text-xs text-ink/50">آخر تحديث {fmtTime(day.updated_at)}، بواسطة: {day.updated_name}</span>}
          </div>
          <button className={`${BTN} bg-sage-deep hover:bg-sage-dark text-white text-base px-6 py-3.5`} disabled={busy || !list.length || !org.active} onClick={approve}>
            ✅ {day?.approved ? 'إعادة الاعتماد' : 'اعتماد حضور اليوم'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Mini({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <div className="rounded-xl bg-white border border-sage/15 py-1.5 text-center">
      <div className="text-xl font-extrabold leading-tight" style={{ color: c }}>{toAr(n)}</div>
      <div className="text-[11px] font-bold text-ink/60">{l}</div>
    </div>
  );
}
