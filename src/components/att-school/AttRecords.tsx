'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

/**
 * «إدارة الحضور المدرسية» — المرحلة ٤: سجل الطالبة + سجل التعديلات.
 * - سجل الطالبة: أيام الحضور/الغياب/التأخر/الاستئذان، النسبة (نفس معادلة سجل الحضور الذكي:
 *   حاضرة + متأخرة + مستأذنة ÷ الأيام المسجّلة)، تواريخ الغياب، تقويم شهري، وفترات
 *   (شهر / الفصل الأول / الفصل الثاني / العام).
 * - سجل التعديلات: للرئيسيات فقط (RLS على school_audit_log) — مَن ومتى وأي فصل وماذا تغيّر.
 */

type SB = ReturnType<typeof createClient>;
type Status = 'present' | 'absent' | 'late' | 'excused_out' | 'excused_abs';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const META: Record<Status, { ic: string; girls: string; boys: string; color: string; bg: string }> = {
  present: { ic: '✅', girls: 'حاضرة', boys: 'حاضر', color: '#3E9B5F', bg: '#E7F5EC' },
  absent: { ic: '🔴', girls: 'غائبة', boys: 'غائب', color: '#D64545', bg: '#FBE9E9' },
  late: { ic: '🟡', girls: 'متأخرة', boys: 'متأخر', color: '#B98B12', bg: '#FBF3DA' },
  excused_out: { ic: '🟠', girls: 'مستأذنة', boys: 'مستأذن', color: '#E07B39', bg: '#FCEBDD' },
  excused_abs: { ic: '🟣', girls: 'غياب بعذر', boys: 'غياب بعذر', color: '#8E5EA8', bg: '#F2E9F6' },
};
const DOWS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fmtDay = (s: string) => {
  const d = new Date(s + 'T12:00');
  return `${DOWS[d.getDay()]} ${toAr(d.getDate())} ${MONTHS[d.getMonth()]} ${toAr(d.getFullYear())}`;
};
const kwToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date());
const CARD = 'rounded-2xl bg-white border border-sage/15 shadow-sm';
const BTN = 'rounded-xl px-3 py-2 font-extrabold text-sm transition-all disabled:opacity-50';

/** العام الدراسي الحالي: يبدأ سبتمبر. الفصل الأول سبتمبر–يناير، الثاني فبراير–يونيو. */
function academicRanges(today: string) {
  const [y, m] = today.split('-').map(Number);
  const startY = m >= 8 ? y : y - 1;
  return {
    t1: { from: `${startY}-08-15`, to: `${startY + 1}-01-31`, label: 'الفصل الأول' },
    t2: { from: `${startY + 1}-02-01`, to: `${startY + 1}-07-15`, label: 'الفصل الثاني' },
    year: { from: `${startY}-08-15`, to: `${startY + 1}-07-15`, label: `العام ${toAr(startY)}/${toAr(startY + 1)}` },
  };
}

/* =================================================================== سجل الطالبة */
export function StudentRecord({ sb, student, klass, gender, onClose }: {
  sb: SB; student: { id: string; name: string }; klass: { id: string; name: string }; gender: 'girls' | 'boys'; onClose: () => void;
}) {
  const girls = gender !== 'boys';
  const word = (s: Status) => (girls ? META[s].girls : META[s].boys);
  const today = kwToday();
  const R = useMemo(() => academicRanges(today), [today]);
  const [period, setPeriod] = useState<'month' | 't1' | 't2' | 'year'>('month');
  const [ym, setYm] = useState<[number, number]>(() => { const [y, m] = today.split('-').map(Number); return [y, m - 1]; });
  const [exc, setExc] = useState<Record<string, Status>>({});
  const [days, setDays] = useState<string[] | null>(null);

  const range = useMemo(() => {
    if (period === 'month') {
      const [y, m] = ym;
      return { from: iso(y, m, 1), to: iso(y, m, new Date(y, m + 1, 0).getDate()), label: `${MONTHS[m]} ${toAr(y)}` };
    }
    return R[period];
  }, [period, ym, R]);

  const load = useCallback(async () => {
    setDays(null);
    const [a, d] = await Promise.all([
      sb.from('school_attendance').select('date,status').eq('student_id', student.id).gte('date', range.from).lte('date', range.to),
      sb.from('school_att_days').select('date').eq('class_id', klass.id).gte('date', range.from).lte('date', range.to),
    ]);
    const m: Record<string, Status> = {};
    ((a.data as { date: string; status: Status }[]) || []).forEach((r) => { m[r.date] = r.status; });
    setExc(m);
    const set = new Set(((d.data as { date: string }[]) || []).map((r) => r.date));
    Object.keys(m).forEach((k) => set.add(k)); // يوم له استثناء يُحسب مسجّلًا
    setDays(Array.from(set).sort());
  }, [sb, student.id, klass.id, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const t = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, excused_out: 0, excused_abs: 0 };
    (days || []).forEach((d) => { c[exc[d] || 'present']++; });
    const n = (days || []).length;
    const rate = n ? Math.round(((c.present + c.late + c.excused_out) / n) * 100) : 100;
    return { ...c, n, rate };
  }, [days, exc]);
  const absDates = (days || []).filter((d) => exc[d] === 'absent' || exc[d] === 'excused_abs').reverse();
  const otherDates = (days || []).filter((d) => exc[d] === 'late' || exc[d] === 'excused_out').reverse();
  const ringColor = t.rate >= 90 ? '#3E9B5F' : t.rate >= 75 ? '#D9A821' : '#D64545';
  const circ = 2 * Math.PI * 46;

  // التقويم الشهري
  const [cy, cm] = ym;
  const first = new Date(cy, cm, 1).getDay();
  const nDays = new Date(cy, cm + 1, 0).getDate();
  const daySet = new Set(days || []);
  const shiftMonth = (n: number) => { let [y, m] = ym; m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } setYm([y, m]); };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-sage-deep text-white flex items-center justify-center text-2xl font-extrabold">{student.name.trim()[0] || '👤'}</div>
          <div className="flex-1">
            <h3 className="text-lg font-extrabold">{student.name}</h3>
            <div className="text-sm text-ink/60">{klass.name}</div>
          </div>
          <div className="relative w-[104px] h-[104px]">
            <svg width="104" height="104"><circle cx="52" cy="52" r="46" fill="none" stroke="#EDF1ED" strokeWidth="10" />
              <circle cx="52" cy="52" r="46" fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - t.rate / 100)} transform="rotate(-90 52 52)" /></svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <b className="text-xl" style={{ color: ringColor }}>{toAr(t.rate)}٪</b>
              <span className="text-[10px] text-ink/55 font-bold">نسبة الحضور</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {(['month', 't1', 't2', 'year'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`${BTN} ${period === p ? 'bg-sage-deep text-white' : 'bg-white border border-sage/25 text-sage-deep'}`}>
              {p === 'month' ? 'شهري' : R[p].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
          <Box n={t.n} l="أيام مسجّلة" c="#41603F" />
          <Box n={t.present} l="حضور" c={META.present.color} />
          <Box n={t.absent} l="غياب" c={META.absent.color} />
          <Box n={t.late} l="تأخر" c={META.late.color} />
          <Box n={t.excused_out} l="استئذان" c={META.excused_out.color} />
          <Box n={t.excused_abs} l="بعذر" c={META.excused_abs.color} />
        </div>

        {period === 'month' && (
          <div className={`${CARD} p-3 mt-4`}>
            <div className="flex items-center justify-between mb-2">
              <button className={`${BTN} bg-sage-mist text-sage-deep`} onClick={() => shiftMonth(-1)}>› السابق</button>
              <b>{range.label}</b>
              <button className={`${BTN} bg-sage-mist text-sage-deep`} onClick={() => shiftMonth(1)}>التالي ‹</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => <div key={d} className="text-[10px] sm:text-[11px] font-extrabold text-ink/50 truncate">{d}</div>)}
              {Array.from({ length: first }).map((_, i) => <div key={'b' + i} />)}
              {Array.from({ length: nDays }).map((_, i) => {
                const d = iso(cy, cm, i + 1);
                const st = exc[d];
                const rec = daySet.has(d);
                const bg = st ? META[st].bg : rec ? '#E7F5EC' : 'transparent';
                return (
                  <div key={d} className={`rounded-lg py-1.5 text-sm font-bold ${d === today ? 'ring-2 ring-gold' : ''}`} style={{ background: bg, color: st ? META[st].color : rec ? '#3E9B5F' : '#9aa59c' }} title={st ? word(st) : rec ? word('present') : ''}>
                    {toAr(i + 1)}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] font-bold text-ink/55 mt-2">
              {(Object.keys(META) as Status[]).map((k) => <span key={k}><span className="inline-block w-2.5 h-2.5 rounded-full ml-1" style={{ background: META[k].color }} />{word(k)}</span>)}
            </div>
          </div>
        )}

        <div className={`${CARD} p-3 mt-4`}>
          <h4 className="font-extrabold mb-2">🔴 تواريخ الغياب ({toAr(absDates.length)}) — {range.label}</h4>
          {days === null ? <p className="text-sm text-ink/55">⏳</p> : absDates.length ? (
            <ul className="divide-y divide-sage/10">
              {absDates.map((d) => (
                <li key={d} className="py-1.5 flex justify-between text-sm"><span>{fmtDay(d)}</span><b style={{ color: META[exc[d]].color }}>{META[exc[d]].ic} {word(exc[d])}</b></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink/55">لا يوجد غياب في هذه الفترة 🌟</p>}
          {otherDates.length > 0 && (
            <>
              <h4 className="font-extrabold mt-3 mb-2">🟡 التأخر والاستئذان ({toAr(otherDates.length)})</h4>
              <ul className="divide-y divide-sage/10">
                {otherDates.map((d) => (
                  <li key={d} className="py-1.5 flex justify-between text-sm"><span>{fmtDay(d)}</span><b style={{ color: META[exc[d]].color }}>{META[exc[d]].ic} {word(exc[d])}</b></li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button className={`${BTN} w-full mt-4 py-3 bg-white border border-sage/30 text-sage-deep`} onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

function Box({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <div className="rounded-xl bg-white border border-sage/15 py-2 text-center">
      <div className="text-xl font-extrabold" style={{ color: c }}>{toAr(n)}</div>
      <div className="text-[11px] font-bold text-ink/60">{l}</div>
    </div>
  );
}

/* =================================================================== سجل التعديلات */
type Log = { id: string; actor_id: string | null; action: string; entity_type: string | null; detail: Record<string, unknown>; created_at: string };

export function AuditLog({ sb, schoolId, gender, classes }: {
  sb: SB; schoolId: string; gender: 'girls' | 'boys'; classes: { id: string; name: string }[];
}) {
  const girls = gender !== 'boys';
  const word = (s: string) => (META[s as Status] ? (girls ? META[s as Status].girls : META[s as Status].boys) : s);
  const [rows, setRows] = useState<Log[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [date, setDate] = useState(kwToday());
  const [classId, setClassId] = useState('');
  const [onlyMarks, setOnlyMarks] = useState(false);

  useEffect(() => {
    sb.rpc('att_members', { p_school: schoolId }).then(({ data }) => {
      const m: Record<string, string> = {};
      ((data as { user_id: string | null; name: string | null }[]) || []).forEach((r) => { if (r.user_id) m[r.user_id] = r.name || ''; });
      setNames(m);
    });
  }, [sb, schoolId]);

  const load = useCallback(async () => {
    setRows(null);
    // اليوم المختار بتوقيت الكويت (+03:00)
    const from = new Date(`${date}T00:00:00+03:00`).toISOString();
    const to = new Date(`${date}T23:59:59+03:00`).toISOString();
    let q = sb.from('school_audit_log').select('id,actor_id,action,entity_type,detail,created_at')
      .eq('school_id', schoolId).gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: false }).limit(500);
    if (onlyMarks) q = q.like('action', 'att.%');
    const { data } = await q;
    // صفوف member.* الخام يغطيها att.member بصياغة أوضح
    let list = ((data as Log[]) || []).filter((r) => !r.action.startsWith('member.'));
    if (classId) {
      const cname = classes.find((c) => c.id === classId)?.name;
      list = list.filter((r) =>
        r.detail?.class_id === classId ||
        (r.entity_type === 'class' && r.detail?.id === classId) ||
        (r.action.startsWith('att.') && r.detail?.class === cname));
    }
    setRows(list);
  }, [sb, schoolId, date, classId, onlyMarks, classes]);

  useEffect(() => { load(); }, [load]);

  const time = (ts: string) => new Intl.DateTimeFormat('ar-KW-u-nu-arab', { timeZone: 'Asia/Kuwait', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  const who = (r: Log) => (r.detail?.by as string) || (r.actor_id ? names[r.actor_id] : '') || 'مستخدمة';
  const sentence = (r: Log): { cls?: string; text: string } => {
    const d = r.detail || {};
    const s = (k: string) => (d[k] == null ? '' : String(d[k]));
    switch (r.action) {
      case 'att.mark': return { cls: s('class'), text: `غيّرت حالة «${s('student')}» من ${word(s('from'))} إلى ${word(s('to'))}${s('date') && s('date') !== date ? ` (ليوم ${fmtDay(s('date'))})` : ''}` };
      case 'att.mark_all': return { cls: s('class'), text: `${s('to') === 'present' ? `سجّلت الكل ${girls ? 'حاضرات' : 'حاضرين'}` : 'سجّلت الكل غياب'} (${toAr(s('count'))})` };
      case 'att.reset': return { cls: s('class'), text: 'أعادت تعيين حضور اليوم' };
      case 'att.approve': return { cls: s('class'), text: `اعتمدت حضور اليوم${s('date') && s('date') !== date ? ` (${fmtDay(s('date'))})` : ''} — غياب وتأخر واستئذان: ${toAr(s('exceptions') || '0')}` };
      case 'att.member': return { text: `${s('kind') === 'main' ? 'عيّنت مسؤولة رئيسية' : 'عيّنت/عدّلت مسؤولة صف'}: ${s('name')}` };
      case 'att.member_remove': return { text: 'أزالت مسؤولة من الإدارة' };
      default: {
        const [ent, op] = r.action.split('.');
        const ENT: Record<string, string> = { class: 'فصل', grade: 'صف', stage: 'مرحلة', member: 'عضوية', school: 'بيانات المدرسة' };
        const OP: Record<string, string> = { insert: 'أضافت', update: 'عدّلت', delete: 'حذفت' };
        const nm = s('name') || s('member_name');
        return { text: `${OP[op] || op} ${ENT[ent] || ent}${nm ? ` «${nm}»` : ''}` };
      }
    }
  };

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="font-extrabold flex-1">🧾 سجل التعديلات</h3>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-xl border border-sage/25 px-2 py-2 font-bold" />
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-xl border border-sage/25 px-2 py-2 font-bold bg-white">
          <option value="">كل الفصول</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm font-bold">
          <input type="checkbox" checked={onlyMarks} onChange={(e) => setOnlyMarks(e.target.checked)} /> الحضور فقط
        </label>
      </div>
      <p className="text-xs text-ink/55 mb-2">يظهر للمسؤولات الرئيسيات فقط — {fmtDay(date)}{rows && rows.length ? ` — ${toAr(rows.length)} تعديل` : ''}</p>
      {rows === null ? <p className="text-center text-ink/55 py-10">⏳</p> : rows.length === 0 ? (
        <p className="text-center text-ink/55 py-10">لا توجد تعديلات في هذا اليوم</p>
      ) : (
        <ul className="divide-y divide-sage/10">
          {rows.map((r) => {
            const s = sentence(r);
            return (
              <li key={r.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b>{who(r)}</b>
                  <span className="text-xs text-ink/55">{time(r.created_at)}</span>
                  {s.cls && <span className="text-xs font-extrabold rounded-lg bg-sage-light text-sage-deep px-2 py-0.5">الفصل: {s.cls}</span>}
                </div>
                <div className="text-sm mt-0.5">{s.text}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
