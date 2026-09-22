'use client';

import { useEffect, useMemo, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';
import { academicRanges } from './AttRecords';

/**
 * «إدارة الحضور المدرسية» — المرحلة ٥: التقارير والطباعة.
 * ١) يومي: أعداد كل فصل + أسماء الغياب/التأخر/الاستئذان + حالة الاعتماد.
 * ٢) أسبوعي (الأحد–الخميس): غياب كل فصل بكل يوم + الطالبات الغائبات وأيامهن.
 * ٣) سجل كامل: فصل (لكل طالبة) أو صف/مدرسة (لكل فصل + الأكثر غيابًا) لشهر/فصل دراسي/عام/مخصص.
 * ٤) ملخص الغياب: لكل صف مع المجموع ليوم/أسبوع/شهر.
 * اليوم «مسجّل» للفصل = له صف في school_att_days أو فيه استثناء. الحضور هو الافتراض.
 */

type SB = ReturnType<typeof createClient>;
type Status = 'present' | 'absent' | 'late' | 'excused_out' | 'excused_abs';
type Grade = { id: string; stage_id: string; name: string; sort: number };
type Klass = { id: string; grade_id: string; name: string; sort: number };
type Student = { id: string; class_id: string; name: string; sort: number };
type OrgLite = { school_id: string; name: string; gender: 'girls' | 'boys' };
type Kind = 'daily' | 'weekly' | 'full' | 'summary';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const DOWS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const kwToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date());
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDay = (s: string) => { const d = new Date(s + 'T12:00'); return `${DOWS[d.getDay()]} ${toAr(d.getDate())} ${MONTHS[d.getMonth()]} ${toAr(d.getFullYear())}`; };
const fmtShort = (s: string) => { const d = new Date(s + 'T12:00'); return `${toAr(d.getDate())}/${toAr(d.getMonth() + 1)}`; };
const sundayOf = (s: string) => addDays(s, -new Date(s + 'T12:00').getDay());
const monthRange = (ym: string) => { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${toAr(y)}` }; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
const BTN = 'rounded-xl px-3 py-2 font-extrabold text-sm transition-all disabled:opacity-50';
const CARD = 'rounded-2xl bg-white border border-sage/15 shadow-sm';
const IPT = 'rounded-xl border border-sage/25 px-2 py-2 font-bold bg-white';

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error || !data) break;
    const rows = data as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const chunks = <T,>(a: T[], n = 60) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

type Data = {
  students: Student[];
  exc: Record<string, Record<string, Status>>; // student → date → status
  days: Record<string, Set<string>>; // class → recorded dates
  approved: Record<string, { name: string | null } | undefined>; // class|date → اعتماد
};

async function loadData(sb: SB, classIds: string[], from: string, to: string): Promise<Data> {
  const students: Student[] = [];
  const att: { class_id: string; student_id: string; date: string; status: Status }[] = [];
  const dayRows: { class_id: string; date: string; approved: boolean; approved_name: string | null }[] = [];
  for (const ids of chunks(classIds)) {
    const [s, a, d] = await Promise.all([
      fetchAll<Student>((f, t) => sb.from('school_students').select('id,class_id,name,sort').in('class_id', ids).eq('archived', false).order('sort').order('created_at').range(f, t)),
      fetchAll<(typeof att)[number]>((f, t) => sb.from('school_attendance').select('class_id,student_id,date,status').in('class_id', ids).gte('date', from).lte('date', to).order('date').range(f, t)),
      fetchAll<(typeof dayRows)[number]>((f, t) => sb.from('school_att_days').select('class_id,date,approved,approved_name').in('class_id', ids).gte('date', from).lte('date', to).range(f, t)),
    ]);
    students.push(...s); att.push(...a); dayRows.push(...d);
  }
  const exc: Data['exc'] = {};
  const days: Data['days'] = {};
  const approved: Data['approved'] = {};
  const add = (c: string, dt: string) => { (days[c] ||= new Set()).add(dt); };
  dayRows.forEach((r) => { add(r.class_id, r.date); if (r.approved) approved[`${r.class_id}|${r.date}`] = { name: r.approved_name }; });
  att.forEach((r) => { (exc[r.student_id] ||= {})[r.date] = r.status; add(r.class_id, r.date); });
  return { students, exc, days, approved };
}

type Tally = { days: number; present: number; absent: number; late: number; excused_out: number; excused_abs: number };
const zero = (): Tally => ({ days: 0, present: 0, absent: 0, late: 0, excused_out: 0, excused_abs: 0 });
function tallyStudent(d: Data, s: Student, from: string, to: string): Tally {
  const t = zero();
  (d.days[s.class_id] || new Set()).forEach((dt) => {
    if (dt < from || dt > to) return;
    t.days++;
    t[d.exc[s.id]?.[dt] || 'present']++;
  });
  return t;
}
const sum = (a: Tally, b: Tally): Tally => ({ days: a.days + b.days, present: a.present + b.present, absent: a.absent + b.absent, late: a.late + b.late, excused_out: a.excused_out + b.excused_out, excused_abs: a.excused_abs + b.excused_abs });
const rateOf = (t: Tally) => pct(t.present + t.late + t.excused_out, t.days);

/* =================================================================== الجذر */
export default function AttReports({ sb, org, grades, classes }: {
  sb: SB; org: OrgLite; grades: Grade[]; classes: Klass[]; // classes = نطاق المستخدمة
}) {
  const girls = org.gender !== 'boys';
  const W = {
    st: girls ? 'طالبة' : 'طالب', sts: girls ? 'الطالبات' : 'الطلاب',
    absentP: girls ? 'الغائبات' : 'الغائبون', lateP: girls ? 'المتأخرات' : 'المتأخرون', outP: girls ? 'المستأذنات' : 'المستأذنون',
  };
  const today = kwToday();
  const R = useMemo(() => academicRanges(today), [today]);
  const visibleGrades = grades.filter((g) => classes.some((c) => c.grade_id === g.id));
  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name || '';

  const [kind, setKind] = useState<Kind>('daily');
  const [scope, setScope] = useState<string>(''); // '' = الكل، 'g:<id>' صف، 'c:<id>' فصل
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState<'month' | 't1' | 't2' | 'year' | 'custom'>('month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [cFrom, setCFrom] = useState(today.slice(0, 8) + '01');
  const [cTo, setCTo] = useState(today);
  const [sumPeriod, setSumPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  // فصل واحد متاح فقط في «السجل الكامل»
  useEffect(() => { if (kind !== 'full' && scope.startsWith('c:')) setScope(''); }, [kind, scope]);

  const range = useMemo(() => {
    if (kind === 'daily') return { from: date, to: date, label: fmtDay(date) };
    if (kind === 'weekly') { const s = sundayOf(date); return { from: s, to: addDays(s, 4), label: `الأسبوع من ${fmtDay(s)} إلى ${fmtDay(addDays(s, 4))}` }; }
    if (kind === 'summary') {
      if (sumPeriod === 'day') return { from: date, to: date, label: fmtDay(date) };
      if (sumPeriod === 'week') { const s = sundayOf(date); return { from: s, to: addDays(s, 4), label: `أسبوع ${fmtShort(s)} – ${fmtShort(addDays(s, 4))}` }; }
      return monthRange(date.slice(0, 7));
    }
    if (period === 'month') return monthRange(month);
    if (period === 'custom') return { from: cFrom <= cTo ? cFrom : cTo, to: cFrom <= cTo ? cTo : cFrom, label: `من ${fmtDay(cFrom <= cTo ? cFrom : cTo)} إلى ${fmtDay(cFrom <= cTo ? cTo : cFrom)}` };
    return R[period];
  }, [kind, date, sumPeriod, period, month, cFrom, cTo, R]);

  const scopeClasses = useMemo(() => {
    const list = scope.startsWith('g:') ? classes.filter((c) => c.grade_id === scope.slice(2))
      : scope.startsWith('c:') ? classes.filter((c) => c.id === scope.slice(2)) : classes;
    const gs = (id: string) => grades.find((g) => g.id === id)?.sort ?? 0;
    return [...list].sort((a, b) => gs(a.grade_id) - gs(b.grade_id) || a.sort - b.sort);
  }, [scope, classes, grades]);
  const scopeLabel = scope.startsWith('g:') ? `الصف ${gradeName(scope.slice(2))}` : scope.startsWith('c:') ? `الفصل ${scopeClasses[0]?.name || ''}` : 'المدرسة كاملة';

  const key = `${scopeClasses.map((c) => c.id).join(',')}|${range.from}|${range.to}`;
  useEffect(() => {
    let dead = false;
    setData(null); setErr('');
    if (!scopeClasses.length) { setData({ students: [], exc: {}, days: {}, approved: {} }); return; }
    loadData(sb, scopeClasses.map((c) => c.id), range.from, range.to)
      .then((d) => { if (!dead) setData(d); })
      .catch(() => { if (!dead) setErr('تعذّر تحميل البيانات — تحقّقي من الاتصال'); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, key]);

  const TITLES: Record<Kind, string> = { daily: '🖨️ التقرير اليومي', weekly: '📅 التقرير الأسبوعي', full: '📚 السجل الكامل', summary: '📊 ملخص الغياب' };

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          #att-print, #att-print * { visibility: visible !important; }
          #att-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          #att-print table { page-break-inside: auto; }
          #att-print tr { page-break-inside: avoid; }
          #att-print .no-print { display: none !important; }
          #att-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        #att-print table { width: 100%; border-collapse: collapse; font-size: 13px; }
        #att-print th, #att-print td { border: 1px solid #d5ddd6; padding: 5px 6px; text-align: center; vertical-align: top; }
        #att-print th { background: #eef3ee; font-weight: 800; }
        #att-print td.nm { text-align: right; }
        #att-print tr.tot td { background: #f6f1e2; font-weight: 800; }
      `}</style>

      {/* الأدوات */}
      <div className={`${CARD} p-3 space-y-3`}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TITLES) as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`${BTN} ${kind === k ? 'bg-sage-deep text-white' : 'bg-white border border-sage/25 text-sage-deep'}`}>{TITLES[k]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={IPT}>
            <option value="">{visibleGrades.length === grades.length ? 'المدرسة كاملة' : 'كل صفوفي'}</option>
            {visibleGrades.map((g) => <option key={g.id} value={`g:${g.id}`}>الصف {g.name}</option>)}
            {kind === 'full' && classes.map((c) => <option key={c.id} value={`c:${c.id}`}>الفصل {c.name}</option>)}
          </select>

          {(kind === 'daily' || kind === 'weekly' || kind === 'summary') && (
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={IPT} />
          )}
          {kind === 'summary' && (['day', 'week', 'month'] as const).map((p) => (
            <button key={p} onClick={() => setSumPeriod(p)} className={`${BTN} ${sumPeriod === p ? 'bg-gold text-white' : 'bg-white border border-sage/25'}`}>{p === 'day' ? 'يوم' : p === 'week' ? 'أسبوع' : 'شهر'}</button>
          ))}
          {kind === 'full' && (
            <>
              {(['month', 't1', 't2', 'year', 'custom'] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={`${BTN} ${period === p ? 'bg-gold text-white' : 'bg-white border border-sage/25'}`}>
                  {p === 'month' ? 'شهر' : p === 'custom' ? 'فترة مخصصة' : R[p].label}
                </button>
              ))}
              {period === 'month' && <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={IPT} />}
              {period === 'custom' && (
                <>
                  <input type="date" value={cFrom} onChange={(e) => e.target.value && setCFrom(e.target.value)} className={IPT} />
                  <span className="font-bold">إلى</span>
                  <input type="date" value={cTo} onChange={(e) => e.target.value && setCTo(e.target.value)} className={IPT} />
                </>
              )}
            </>
          )}
          <button className={`${BTN} bg-sage-deep text-white mr-auto`} disabled={!data} onClick={() => window.print()}>🖨️ طباعة</button>
        </div>
      </div>

      {/* التقرير */}
      <div id="att-print" className={`${CARD} p-4 mt-4`}>
        <div className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-sage/30 pb-2 mb-3">
          <h2 className="text-lg font-extrabold">{org.name}</h2>
          <span className="font-extrabold text-sage-deep">{TITLES[kind].replace(/^\S+\s/, '')}</span>
          <span className="text-sm text-ink/70">{scopeLabel}، {range.label}</span>
          <span className="text-xs text-ink/50 mr-auto">طُبع {fmtDay(today)}</span>
        </div>
        {err ? <p className="text-center text-red-600 py-10">{err}</p> : !data ? <p className="text-center text-ink/55 py-16">⏳ جاري إعداد التقرير…</p> : (
          <>
            {kind === 'daily' && <Daily d={data} classes={scopeClasses} date={date} W={W} gradeName={gradeName} />}
            {kind === 'weekly' && <Weekly d={data} classes={scopeClasses} from={range.from} W={W} />}
            {kind === 'full' && <Full d={data} classes={scopeClasses} from={range.from} to={range.to} single={scope.startsWith('c:')} W={W} />}
            {kind === 'summary' && <Summary d={data} classes={scopeClasses} grades={grades} from={range.from} to={range.to} W={W} />}
          </>
        )}
      </div>
    </div>
  );
}

type Words = { st: string; sts: string; absentP: string; lateP: string; outP: string };
const byClass = (d: Data) => { const m: Record<string, Student[]> = {}; d.students.forEach((s) => { (m[s.class_id] ||= []).push(s); }); return m; };

/* ------------------------------------------------------------------ ١) يومي */
function Daily({ d, classes, date, W, gradeName }: { d: Data; classes: Klass[]; date: string; W: Words; gradeName: (id: string) => string }) {
  const bc = byClass(d);
  const tot = { n: 0, p: 0, a: 0, ea: 0, l: 0, o: 0, done: 0 };
  const rows = classes.map((c) => {
    const list = bc[c.id] || [];
    const recorded = d.days[c.id]?.has(date);
    const names: Record<Status, string[]> = { present: [], absent: [], late: [], excused_out: [], excused_abs: [] };
    list.forEach((s) => { names[d.exc[s.id]?.[date] || 'present'].push(s.name); });
    const ap = d.approved[`${c.id}|${date}`];
    tot.n += list.length;
    if (!recorded) return { c, list, recorded, names, ap };
    tot.p += names.present.length; tot.a += names.absent.length; tot.ea += names.excused_abs.length;
    tot.l += names.late.length; tot.o += names.excused_out.length; if (ap) tot.done++;
    return { c, list, recorded, names, ap };
  });
  return (
    <>
      <table>
        <thead><tr><th>الصف</th><th>الفصل</th><th>العدد</th><th>حضور</th><th>غياب</th><th>بعذر</th><th>تأخر</th><th>استئذان</th><th>الحالة</th></tr></thead>
        <tbody>
          {rows.map(({ c, list, recorded, names, ap }) => (
            <tr key={c.id}>
              <td>{gradeName(c.grade_id)}</td><td>{c.name}</td><td>{toAr(list.length)}</td>
              {recorded ? (
                <>
                  <td>{toAr(names.present.length + names.late.length + names.excused_out.length)}</td>
                  <td style={{ color: '#D64545', fontWeight: 800 }}>{toAr(names.absent.length)}</td>
                  <td>{toAr(names.excused_abs.length)}</td><td>{toAr(names.late.length)}</td><td>{toAr(names.excused_out.length)}</td>
                </>
              ) : <td colSpan={5}>—</td>}
              <td>{ap ? `✅ معتمد${ap.name ? ` (${ap.name})` : ''}` : recorded ? '✏️ غير معتمد' : '⏳ لم يُسجَّل'}</td>
            </tr>
          ))}
          <tr className="tot">
            <td colSpan={2}>المجموع</td><td>{toAr(tot.n)}</td><td>{toAr(tot.p + tot.l + tot.o)}</td><td>{toAr(tot.a)}</td><td>{toAr(tot.ea)}</td>
            <td>{toAr(tot.l)}</td><td>{toAr(tot.o)}</td><td>{toAr(tot.done)} من {toAr(classes.length)}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="font-extrabold mt-5 mb-2">الأسماء</h3>
      <table>
        <thead><tr><th>الفصل</th><th>{W.absentP}</th><th>غياب بعذر</th><th>{W.lateP}</th><th>{W.outP}</th></tr></thead>
        <tbody>
          {rows.filter((r) => r.names.absent.length + r.names.excused_abs.length + r.names.late.length + r.names.excused_out.length > 0).map(({ c, names }) => (
            <tr key={c.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{c.name}</td>
              <td className="nm">{names.absent.join('، ') || '—'}</td>
              <td className="nm">{names.excused_abs.join('، ') || '—'}</td>
              <td className="nm">{names.late.join('، ') || '—'}</td>
              <td className="nm">{names.excused_out.join('، ') || '—'}</td>
            </tr>
          ))}
          {rows.every((r) => r.names.absent.length + r.names.excused_abs.length + r.names.late.length + r.names.excused_out.length === 0) && (
            <tr><td colSpan={5}>لا يوجد غياب ولا تأخر ولا استئذان 🌟</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ------------------------------------------------------------------ ٢) أسبوعي */
function Weekly({ d, classes, from, W }: { d: Data; classes: Klass[]; from: string; W: Words }) {
  const bc = byClass(d);
  const week = Array.from({ length: 5 }, (_, i) => addDays(from, i));
  const colTot = week.map(() => 0);
  let all = 0;
  const people: { s: Student; cls: string; dates: string[]; ex: number }[] = [];
  const rows = classes.map((c) => {
    const list = bc[c.id] || [];
    const cells = week.map((dt, i) => {
      if (!d.days[c.id]?.has(dt)) return null;
      const n = list.filter((s) => { const st = d.exc[s.id]?.[dt]; return st === 'absent' || st === 'excused_abs'; }).length;
      colTot[i] += n; all += n;
      return n;
    });
    list.forEach((s) => {
      const dates = week.filter((dt) => { const st = d.exc[s.id]?.[dt]; return st === 'absent' || st === 'excused_abs'; });
      const ex = dates.filter((dt) => d.exc[s.id]?.[dt] === 'excused_abs').length;
      if (dates.length) people.push({ s, cls: c.name, dates, ex });
    });
    return { c, n: list.length, cells, tot: cells.reduce<number>((a, b) => a + (b || 0), 0) };
  });
  people.sort((a, b) => b.dates.length - a.dates.length);
  return (
    <>
      <table>
        <thead><tr><th>الفصل</th><th>العدد</th>{week.map((dt) => <th key={dt}>{DOWS[new Date(dt + 'T12:00').getDay()]}<br /><span style={{ fontWeight: 600, fontSize: 11 }}>{fmtShort(dt)}</span></th>)}<th>مجموع الغياب</th></tr></thead>
        <tbody>
          {rows.map(({ c, n, cells, tot }) => (
            <tr key={c.id}><td>{c.name}</td><td>{toAr(n)}</td>{cells.map((v, i) => <td key={i} style={{ color: v ? '#D64545' : undefined, fontWeight: v ? 800 : 400 }}>{v === null ? '—' : toAr(v)}</td>)}<td style={{ fontWeight: 800 }}>{toAr(tot)}</td></tr>
          ))}
          <tr className="tot"><td colSpan={2}>المجموع</td>{colTot.map((v, i) => <td key={i}>{toAr(v)}</td>)}<td>{toAr(all)}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-ink/55 mt-1">«—» يوم لم يُسجَّل فيه الحضور للفصل. الغياب يشمل الغياب بعذر.</p>

      <h3 className="font-extrabold mt-5 mb-2">{W.absentP} هذا الأسبوع ({toAr(people.length)})</h3>
      <table>
        <thead><tr><th>م</th><th>{W.st === 'طالبة' ? 'الطالبة' : 'الطالب'}</th><th>الفصل</th><th>أيام الغياب</th><th>العدد</th><th>منها بعذر</th></tr></thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={p.s.id}><td>{toAr(i + 1)}</td><td className="nm">{p.s.name}</td><td style={{ whiteSpace: 'nowrap' }}>{p.cls}</td>
              <td className="nm">{p.dates.map((dt) => DOWS[new Date(dt + 'T12:00').getDay()]).join('، ')}</td><td>{toAr(p.dates.length)}</td><td>{toAr(p.ex)}</td></tr>
          ))}
          {!people.length && <tr><td colSpan={6}>لا يوجد غياب هذا الأسبوع 🌟</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/* ------------------------------------------------------------------ ٣) السجل الكامل */
function Full({ d, classes, from, to, single, W }: { d: Data; classes: Klass[]; from: string; to: string; single: boolean; W: Words }) {
  const bc = byClass(d);
  const head = <><th>أيام</th><th>حضور</th><th>غياب</th><th>بعذر</th><th>تأخر</th><th>استئذان</th><th>النسبة</th></>;
  const cells = (t: Tally) => <><td>{toAr(t.days)}</td><td>{toAr(t.present)}</td><td style={{ color: '#D64545', fontWeight: 800 }}>{toAr(t.absent)}</td><td>{toAr(t.excused_abs)}</td><td>{toAr(t.late)}</td><td>{toAr(t.excused_out)}</td><td style={{ fontWeight: 800 }}>{toAr(rateOf(t))}٪</td></>;

  if (single) {
    const c = classes[0];
    const list = (c && bc[c.id]) || [];
    let tot = zero();
    const rows = list.map((s) => { const t = tallyStudent(d, s, from, to); tot = sum(tot, t); return { s, t }; });
    return (
      <>
        <p className="text-sm mb-2">أيام الحضور المسجّلة للفصل: <b>{toAr(c ? Array.from(d.days[c.id] || []).filter((x) => x >= from && x <= to).length : 0)}</b></p>
        <table>
          <thead><tr><th>م</th><th>الاسم</th>{head}</tr></thead>
          <tbody>
            {rows.map(({ s, t }, i) => <tr key={s.id}><td>{toAr(i + 1)}</td><td className="nm">{s.name}</td>{cells(t)}</tr>)}
            <tr className="tot"><td colSpan={2}>المجموع</td>{cells(tot)}</tr>
          </tbody>
        </table>
      </>
    );
  }

  let tot = zero();
  const top: { s: Student; cls: string; t: Tally }[] = [];
  const rows = classes.map((c) => {
    let ct = zero();
    (bc[c.id] || []).forEach((s) => { const t = tallyStudent(d, s, from, to); ct = sum(ct, t); if (t.absent + t.excused_abs > 0) top.push({ s, cls: c.name, t }); });
    tot = sum(tot, ct);
    return { c, n: (bc[c.id] || []).length, ct };
  });
  top.sort((a, b) => (b.t.absent + b.t.excused_abs) - (a.t.absent + a.t.excused_abs) || b.t.absent - a.t.absent);
  return (
    <>
      <table>
        <thead><tr><th>الفصل</th><th>العدد</th><th>أيام {W.sts}</th><th>حضور</th><th>غياب</th><th>بعذر</th><th>تأخر</th><th>استئذان</th><th>النسبة</th></tr></thead>
        <tbody>
          {rows.map(({ c, n, ct }) => <tr key={c.id}><td>{c.name}</td><td>{toAr(n)}</td>{cells(ct)}</tr>)}
          <tr className="tot"><td>المجموع</td><td>{toAr(d.students.length)}</td>{cells(tot)}</tr>
        </tbody>
      </table>
      <p className="text-xs text-ink/55 mt-1">الأعداد هنا مجموع أيام {W.sts} (مثلًا ٣ غياب = ٣ أيام غياب موزّعة على {W.sts}).</p>

      <h3 className="font-extrabold mt-5 mb-2">الأكثر غيابًا</h3>
      <table>
        <thead><tr><th>م</th><th>الاسم</th><th>الفصل</th>{head}</tr></thead>
        <tbody>
          {top.slice(0, 20).map(({ s, cls, t }, i) => <tr key={s.id}><td>{toAr(i + 1)}</td><td className="nm">{s.name}</td><td style={{ whiteSpace: 'nowrap' }}>{cls}</td>{cells(t)}</tr>)}
          {!top.length && <tr><td colSpan={10}>لا يوجد غياب في هذه الفترة 🌟</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/* ------------------------------------------------------------------ ٤) ملخص الغياب */
function Summary({ d, classes, grades, from, to, W }: { d: Data; classes: Klass[]; grades: Grade[]; from: string; to: string; W: Words }) {
  const bc = byClass(d);
  const gs = grades.filter((g) => classes.some((c) => c.grade_id === g.id)).sort((a, b) => a.sort - b.sort);
  let tot = zero(); let totN = 0;
  const rows = gs.map((g) => {
    let t = zero(); let n = 0;
    classes.filter((c) => c.grade_id === g.id).forEach((c) => (bc[c.id] || []).forEach((s) => { n++; t = sum(t, tallyStudent(d, s, from, to)); }));
    tot = sum(tot, t); totN += n;
    return { g, n, t };
  });
  const oneDay = from === to;
  return (
    <>
      <table>
        <thead><tr><th>الصف</th><th>عدد {W.sts}</th><th>غياب</th><th>غياب بعذر</th><th>مجموع الغياب</th><th>نسبة الغياب</th></tr></thead>
        <tbody>
          {rows.map(({ g, n, t }) => (
            <tr key={g.id}><td>{g.name}</td><td>{toAr(n)}</td><td>{toAr(t.absent)}</td><td>{toAr(t.excused_abs)}</td>
              <td style={{ color: '#D64545', fontWeight: 800 }}>{toAr(t.absent + t.excused_abs)}</td><td>{toAr(pct(t.absent + t.excused_abs, t.days))}٪</td></tr>
          ))}
          <tr className="tot"><td>المجموع</td><td>{toAr(totN)}</td><td>{toAr(tot.absent)}</td><td>{toAr(tot.excused_abs)}</td><td>{toAr(tot.absent + tot.excused_abs)}</td><td>{toAr(pct(tot.absent + tot.excused_abs, tot.days))}٪</td></tr>
        </tbody>
      </table>
      {!oneDay && <p className="text-xs text-ink/55 mt-1">في الأسبوع والشهر: الغياب = مجموع أيام الغياب، والنسبة من الأيام المسجّلة.</p>}
    </>
  );
}
