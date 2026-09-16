'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
type Student = { id: string; class_id: string; name: string; sid_no: string | null; note: string | null; archived: boolean; sort: number };
type Subject = { id: string; name: string; department_id: string | null; sort: number };
type Teaching = { id: string; member_id: string; subject_id: string; class_id: string; weekly_hours: number };
type Period = { id: string; name: string; kind: string; start_time: string | null; end_time: string | null; sort: number };
type Entry = { id: string; day: number; period_id: string; class_id: string; member_id: string; subject_id: string };
type AttRow = { id: string; student_id: string; date: string; status: string; arrived_at: string | null };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ATT_STATES: { k: string; l: string; cls: string }[] = [
  { k: 'present', l: 'حاضرة', cls: 'bg-sage-deep text-white' },
  { k: 'absent', l: 'غائبة', cls: 'bg-red-500 text-white' },
  { k: 'late', l: 'متأخرة', cls: 'bg-gold text-white' },
  { k: 'excused', l: 'استئذان', cls: 'bg-sage text-white' },
];

type StaffRow = { id: string; member_id: string; date: string; status: string; at_time: string | null };
const STAFF_STATES: { k: string; l: string }[] = [
  { k: 'present', l: 'حاضرة' },
  { k: 'sick', l: 'مرضي' },
  { k: 'casual', l: 'عرضي' },
  { k: 'late', l: 'تأخير' },
  { k: 'permit_start', l: 'استئذان بداية' },
  { k: 'permit_end', l: 'استئذان نهاية' },
  { k: 'reduction_start', l: 'تخفيف بداية' },
  { k: 'reduction_end', l: 'تخفيف نهاية' },
];
const staffLabel = (k: string) => STAFF_STATES.find((x) => x.k === k)?.l || k;
const STAFF_NEEDS_TIME = new Set(['late', 'permit_start', 'permit_end']);
const STAFF_ABSENT = new Set(['sick', 'casual']); // غياب يوم كامل يحتاج تغطية

type Sub = { id: string; date: string; period_id: string; class_id: string; subject_id: string | null; absent_member_id: string | null; sub_member_id: string | null };
type DutyLoc = { id: string; name: string; sort: number };
type Duty = { id: string; day: number; period_id: string; location_id: string; member_id: string };

const PERIOD_KINDS: { k: string; l: string }[] = [
  { k: 'lesson', l: 'حصة' },
  { k: 'break', l: 'فسحة' },
  { k: 'assembly', l: 'تجمّع' },
  { k: 'other', l: 'غير تدريسي' },
];
const kindLabel = (k: string) => PERIOD_KINDS.find((x) => x.k === k)?.l || k;

const ROLE_LABEL: Record<string, string> = {
  admin: 'مسؤولة المدرسة',
  principal: 'مديرة المدرسة',
  deputy: 'مديرة مساعدة',
  coordinator: 'رئيسة شعبة',
  supervisor: 'مشرفة',
  student_affairs: 'شؤون الطلبة',
  teacher: 'معلمة',
};

const SECTIONS: { key: string; label: string; emoji: string; soon?: boolean }[] = [
  { key: 'structure', label: 'الهيكل المدرسي', emoji: '🏫' },
  { key: 'departments', label: 'الشُّعب والمعلمات', emoji: '👩🏻‍🏫' },
  { key: 'students', label: 'الصفوف والمتعلمات', emoji: '👧🏻' },
  { key: 'teaching', label: 'المواد والتوزيع', emoji: '📚' },
  { key: 'timetable', label: 'الجدول المدرسي', emoji: '📅' },
  { key: 'smart', label: 'إنشاء الجدول الذكي', emoji: '✨', soon: true },
  { key: 'substitution', label: 'الاحتياط', emoji: '🔄' },
  { key: 'duty', label: 'المناوبات', emoji: '📍' },
  { key: 'supervision', label: 'الإشراف الإداري', emoji: '👩🏻‍💼', soon: true },
  { key: 'attendance', label: 'حضور المتعلمات', emoji: '✅' },
  { key: 'staff', label: 'دوام الهيئة التعليمية', emoji: '🗓️' },
  { key: 'permissions', label: 'المستخدمون والصلاحيات', emoji: '🔐', soon: true },
];

type SchoolRow = { id: string; name: string; subscription_until: string | null; role: string };

const subActive = (until: string | null) => !!until && new Date(until) > new Date();

/**
 * محرّك جدولة قائم على القيود (Constraint-based) — يوزّع الحصص المطلوبة على
 * (يوم × حصة) بحيث: لا معلمة في مكانين، ولا فصل بحصتين، وكل نصاب يُوضع.
 * تفضيل مرن: توزيع حصص المادة الواحدة على أيام مختلفة. جشِع + إعادات عشوائية،
 * ويعيد ما تعذّر وضعه ليُعرض في تقرير الفحص.
 */
type SolveTask = { member_id: string; subject_id: string; class_id: string };
type SolveCons = { offDay: Set<string>; noSlot: Set<string>; avoidLast: Set<string>; lastPid: string | null };
function solveTimetable(
  teaching: { member_id: string; subject_id: string; class_id: string; weekly_hours: number }[],
  lessonPeriodIds: string[],
  workDays: number[],
  cons?: SolveCons
): { placements: (SolveTask & { day: number; period_id: string })[]; unplaced: SolveTask[] } {
  const c = cons || { offDay: new Set<string>(), noSlot: new Set<string>(), avoidLast: new Set<string>(), lastPid: null };
  const slots: { day: number; pid: string }[] = [];
  for (const d of workDays) for (const pid of lessonPeriodIds) slots.push({ day: d, pid });

  const tasks: SolveTask[] = [];
  for (const t of teaching) for (let i = 0; i < Math.max(0, t.weekly_hours); i++) tasks.push({ member_id: t.member_id, subject_id: t.subject_id, class_id: t.class_id });

  const load: Record<string, number> = {};
  for (const t of tasks) load[t.member_id] = (load[t.member_id] || 0) + 1;
  const baseOrder = tasks.map((_, i) => i).sort((a, b) => (load[tasks[b].member_id] || 0) - (load[tasks[a].member_id] || 0));

  const key = (d: number, p: string) => `${d}|${p}`;
  const attempt = (order: number[]) => {
    const tBusy = new Map<string, Set<string>>();
    const cBusy = new Map<string, Set<string>>();
    const csDays = new Map<string, Set<number>>();
    const placements: (SolveTask & { day: number; period_id: string })[] = [];
    const unplaced: SolveTask[] = [];
    for (const idx of order) {
      const t = tasks[idx];
      const tb = tBusy.get(t.member_id) || new Set<string>();
      const cb = cBusy.get(t.class_id) || new Set<string>();
      const csKey = `${t.class_id}|${t.subject_id}`;
      const usedDays = csDays.get(csKey) || new Set<number>();
      // قيود إلزامية: يوم غير متاح للمعلمة، وحصة ممنوعة عليها
      const cands = slots.filter(
        (s) =>
          !tb.has(key(s.day, s.pid)) &&
          !cb.has(key(s.day, s.pid)) &&
          !c.offDay.has(`${t.member_id}|${s.day}`) &&
          !c.noSlot.has(`${t.member_id}|${s.pid}`)
      );
      // تفضيلات (مرنة): يومٌ لا يحمل هذه المادة بعد، وتجنّب آخر حصة لمواد مطلوبة
      const avoidLast = c.avoidLast.has(t.subject_id) && c.lastPid;
      cands.sort((a, b) => {
        const pa = (usedDays.has(a.day) ? 1 : 0) + (avoidLast && a.pid === c.lastPid ? 2 : 0);
        const pb = (usedDays.has(b.day) ? 1 : 0) + (avoidLast && b.pid === c.lastPid ? 2 : 0);
        return pa - pb;
      });
      if (cands.length) {
        const s = cands[0];
        tb.add(key(s.day, s.pid));
        tBusy.set(t.member_id, tb);
        cb.add(key(s.day, s.pid));
        cBusy.set(t.class_id, cb);
        usedDays.add(s.day);
        csDays.set(csKey, usedDays);
        placements.push({ ...t, day: s.day, period_id: s.pid });
      } else {
        unplaced.push(t);
      }
    }
    return { placements, unplaced };
  };

  let best = attempt(baseOrder);
  for (let r = 0; r < 60 && best.unplaced.length; r++) {
    const ord = baseOrder.slice();
    for (let i = ord.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ord[i], ord[j]] = [ord[j], ord[i]];
    }
    const res = attempt(ord);
    if (res.unplaced.length < best.unplaced.length) best = res;
  }
  return best;
}

/* ── فهم القيود المكتوبة بالعربي (تحويلها إلى قواعد منظّمة قبل التوليد) ── */
type Rule =
  | { kind: 'off_day'; member_id: string; day: number; text: string }
  | { kind: 'no_period'; member_id: string; periodIndex: number; text: string }
  | { kind: 'avoid_last'; subject_id: string; text: string };

const DAY_WORDS: [RegExp, number][] = [
  [/الأحد|الاحد/, 0],
  [/الإثنين|الاثنين/, 1],
  [/الثلاثاء|الثلاثا/, 2],
  [/الأربعاء|الاربعاء/, 3],
  [/الخميس/, 4],
  [/الجمعة/, 5],
  [/السبت/, 6],
];
const ORD_WORDS: [RegExp, number][] = [
  [/الأولى|الاولى/, 0],
  [/الثانية/, 1],
  [/الثالثة/, 2],
  [/الرابعة/, 3],
  [/الخامسة/, 4],
  [/السادسة/, 5],
  [/السابعة/, 6],
];
const firstWord = (n: string | null) => (n || '').trim().split(/\s+/)[0];

function parseRules(
  text: string,
  members: { id: string; name: string | null }[],
  subjects: { id: string; name: string }[]
): { rules: Rule[]; unknown: string[] } {
  const lines = text.split(/\n|\.|؛|،/).map((s) => s.trim()).filter(Boolean);
  const rules: Rule[] = [];
  const unknown: string[] = [];
  for (const line of lines) {
    const mem = members.find((m) => m.name && (line.includes(m.name) || (firstWord(m.name).length > 1 && line.includes(firstWord(m.name)))));
    const subj = subjects.find((s) => s.name && line.includes(s.name));
    const day = DAY_WORDS.find(([re]) => re.test(line));
    const ord = ORD_WORDS.find(([re]) => re.test(line));
    const neg = /(^|\s)(لا|ما|بدون|ممنوع)(\s|$)|غير|تجنّب|تجنب|إجازة|اجازة|غايب|غائب/.test(line);
    const last = /آخر|الأخيرة|الاخيرة/.test(line);
    const offDayHint = /غير متاح|ما تدو|ما تدر|لا تدو|لا تدر|إجازة|اجازة|غايب|غائب|مو موجود|غير موجود|ما عندها دوام|ما تحضر/.test(line);

    if (mem && day && offDayHint) {
      rules.push({ kind: 'off_day', member_id: mem.id, day: day[1], text: line });
    } else if (mem && ord && neg) {
      rules.push({ kind: 'no_period', member_id: mem.id, periodIndex: ord[1], text: line });
    } else if (subj && last) {
      rules.push({ kind: 'avoid_last', subject_id: subj.id, text: line });
    } else {
      unknown.push(line);
    }
  }
  return { rules, unknown };
}

/* ── استيراد الأسماء من صورة/PDF عبر OCR (Claude vision، بوابة معزولة) ── */
const fileToDataURL = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

async function compressImg(file: File): Promise<{ mime: string; b64: string }> {
  const dataUrl = await fileToDataURL(file);
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  const scale = Math.min(1, 1700 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return { mime: 'image/jpeg', b64: dataUrl.split(',')[1] };
  ctx.drawImage(img, 0, 0, w, h);
  return { mime: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

async function extractNames(file: File): Promise<string[]> {
  let contentBlock: unknown;
  if (file.type === 'application/pdf') {
    const dataUrl = await fileToDataURL(file);
    contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dataUrl.split(',')[1] } };
  } else {
    const { mime, b64 } = await compressImg(file);
    contentBlock = { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  }
  const prompt =
    'هذه قائمة أسماء أشخاص (معلمات أو طالبات). استخرج الأسماء فقط، اسمًا واحدًا في كل سطر، بالترتيب، ' +
    'بدون أرقام تسلسل أو رموز أو عناوين أو تواريخ أو أي كلام إضافي. لا تكتب أي شيء غير الأسماء.';
  const messages = [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }];
  const res = await fetch('/api/school/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: 1500 }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || 'تعذّرت القراءة');
  const text: string = json?.content?.[0]?.text || '';
  return text
    .split('\n')
    .map((s) => s.replace(/^[\s\d\-.،_)(]+/, '').trim())
    .filter((s) => s && s.length <= 60);
}

function ImportNames({ what, onAdd }: { what: string; onAdd: (names: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const names = await extractNames(f);
      if (!names.length) window.alert('ما قدرت أطلّع أسماء واضحة من الصورة. جرّبي صورة أوضح.');
      setDraft(names.join('\n'));
    } catch (e) {
      window.alert((e as Error).message || 'تعذّرت القراءة');
    }
    setBusy(false);
    if (ref.current) ref.current.value = '';
  };
  return (
    <div className="mt-2">
      <button onClick={() => ref.current?.click()} disabled={busy} className="rounded-lg border border-sage/30 text-sage-deep font-bold text-[12px] px-3 py-1.5 disabled:opacity-50">
        {busy ? '…جارٍ القراءة' : `📷 استيراد ${what} من صورة/PDF`}
      </button>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files)} />
      {draft !== null ? (
        <div className="mt-2 rounded-xl border border-sage/20 p-2">
          <div className="text-[11.5px] text-ink/60 mb-1">راجعي الأسماء (اسم لكل سطر) — عدّلي أو احذفي الغلط ثم أضيفي:</div>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(12, Math.max(4, draft.split('\n').length))} className="w-full rounded-lg border border-sage/25 bg-white text-[13px] p-2 focus:outline-none focus:border-sage" />
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={() => {
                const names = draft.split('\n').map((s) => s.trim()).filter(Boolean);
                if (names.length) onAdd(names);
                setDraft(null);
              }}
              className="rounded-lg bg-sage-deep text-white font-bold text-[12px] px-4 py-1.5"
            >
              ＋ أضيفي الكل ({draft.split('\n').map((s) => s.trim()).filter(Boolean).length})
            </button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-sage/25 text-sage-deep font-bold text-[12px] px-3 py-1.5">إلغاء</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  const [students, setStudents] = useState<Student[]>([]);
  const [openClass, setOpenClass] = useState<Klass | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teaching, setTeaching] = useState<Teaching[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [attClass, setAttClass] = useState<Klass | null>(null);
  const [attDate, setAttDate] = useState<string>(todayISO());
  const [attStudents, setAttStudents] = useState<Student[]>([]);
  const [attRecords, setAttRecords] = useState<AttRow[]>([]);
  const [staffDate, setStaffDate] = useState<string>(todayISO());
  const [staffRecords, setStaffRecords] = useState<StaffRow[]>([]);
  const [subDate, setSubDate] = useState<string>(todayISO());
  const [subStaff, setSubStaff] = useState<{ member_id: string; status: string }[]>([]);
  const [subsMonth, setSubsMonth] = useState<Sub[]>([]);
  const [dutyLocs, setDutyLocs] = useState<DutyLoc[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [genReport, setGenReport] = useState<{ placed: number; unplaced: SolveTask[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'dash' | 'structure' | 'departments' | 'students' | 'teaching' | 'timetable' | 'attendance' | 'staff' | 'substitution' | 'duty'>('dash');
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
      const [dp, mb, su, tc, pd, en, dl, du] = await Promise.all([
        supabase.from('school_departments').select('id,name,head_member_id,sort').eq('school_id', sid).order('sort'),
        supabase.rpc('school_members_of', { p_school: sid }),
        supabase.from('school_subjects').select('id,name,department_id,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_teaching').select('id,member_id,subject_id,class_id,weekly_hours').eq('school_id', sid),
        supabase.from('school_periods').select('id,name,kind,start_time,end_time,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_timetable_entries').select('id,day,period_id,class_id,member_id,subject_id').eq('school_id', sid),
        supabase.from('school_duty_locations').select('id,name,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_duties').select('id,day,period_id,location_id,member_id').eq('school_id', sid),
      ]);
      setDepts((dp.data as Dept[]) || []);
      setMembers((mb.data as Member[]) || []);
      setSubjects((su.data as Subject[]) || []);
      setTeaching((tc.data as Teaching[]) || []);
      setPeriods((pd.data as Period[]) || []);
      setEntries((en.data as Entry[]) || []);
      setDutyLocs((dl.data as DutyLoc[]) || []);
      setDuties((du.data as Duty[]) || []);
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
  const addMember = async (name: string, role: string, deptId: string | null) => {
    // إضافة بالاسم مباشرة (بلا حساب). الربط بحساب اختياري لاحقًا.
    const { error } = await supabase
      .from('school_members')
      .insert({ school_id: schoolId, member_name: name.trim(), role, department_id: deptId });
    if (error) return showToast('تعذّرت الإضافة');
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
  const importMembers = async (names: string[], deptId: string | null) => {
    const rows = names.map((n) => ({ school_id: schoolId, member_name: n, role: 'teacher', department_id: deptId }));
    const { error } = await supabase.from('school_members').insert(rows);
    if (error) return showToast('تعذّر الاستيراد');
    showToast(`تمت إضافة ${rows.length} معلمة ✅`);
    if (schoolId) loadMembersDepts(schoolId);
  };

  // ── المتعلمات ─────────────────────────────────────────────────
  const openClassStudents = async (cls: Klass) => {
    setOpenClass(cls);
    const { data } = await supabase.from('school_students').select('id,class_id,name,sid_no,note,archived,sort').eq('class_id', cls.id).order('sort');
    setStudents((data as Student[]) || []);
  };
  const addStudent = async (name: string, sidNo: string) => {
    if (!openClass) return;
    const { data, error } = await supabase
      .from('school_students')
      .insert({ school_id: schoolId, class_id: openClass.id, name, sid_no: sidNo || null, sort: nextSort(students) })
      .select('id,class_id,name,sid_no,note,archived,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setStudents((s) => [...s, data as Student]);
  };
  const updateStudent = async (id: string, patch: Partial<Student>) => {
    const { error } = await supabase.from('school_students').update(patch).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setStudents((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const moveStudent = async (id: string, toClassId: string) => {
    const { error } = await supabase.from('school_students').update({ class_id: toClassId }).eq('id', id);
    if (error) return showToast('تعذّر النقل');
    setStudents((s) => s.filter((x) => x.id !== id)); // خرجت من الفصل الحالي
    showToast('تم النقل ✅');
  };
  const delStudent = async (id: string) => {
    if (!window.confirm('حذف المتعلمة نهائيًا؟')) return;
    const { error } = await supabase.from('school_students').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setStudents((s) => s.filter((x) => x.id !== id));
  };
  const importStudents = async (names: string[]) => {
    if (!openClass) return;
    const base = students.length;
    const rows = names.map((n, i) => ({ school_id: schoolId, class_id: openClass.id, name: n, sort: base + i + 1 }));
    const { data, error } = await supabase.from('school_students').insert(rows).select('id,class_id,name,sid_no,note,archived,sort');
    if (error || !data) return showToast('تعذّر الاستيراد');
    setStudents((s) => [...s, ...(data as Student[])]);
    showToast(`تمت إضافة ${data.length} متعلمة ✅`);
  };

  // ── المواد والتوزيع ───────────────────────────────────────────
  const addSubject = async (name: string) => {
    const { data, error } = await supabase
      .from('school_subjects')
      .insert({ school_id: schoolId, name, sort: nextSort(subjects) })
      .select('id,name,department_id,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setSubjects((s) => [...s, data as Subject]);
  };
  const renameSubject = async (id: string, name: string) => {
    const { error } = await supabase.from('school_subjects').update({ name }).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setSubjects((s) => s.map((x) => (x.id === id ? { ...x, name } : x)));
  };
  const delSubject = async (id: string) => {
    if (!window.confirm('حذف المادة؟ (يُحذف توزيعها)')) return;
    const { error } = await supabase.from('school_subjects').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setSubjects((s) => s.filter((x) => x.id !== id));
    setTeaching((t) => t.filter((x) => x.subject_id !== id));
  };
  const addTeaching = async (memberId: string, subjectId: string, classId: string, hours: number) => {
    const { data, error } = await supabase
      .from('school_teaching')
      .insert({ school_id: schoolId, member_id: memberId, subject_id: subjectId, class_id: classId, weekly_hours: hours })
      .select('id,member_id,subject_id,class_id,weekly_hours')
      .single();
    if (error || !data) return showToast(/duplicate|unique/i.test(error?.message || '') ? 'هذا التوزيع موجود مسبقًا' : 'تعذّرت الإضافة');
    setTeaching((t) => [...t, data as Teaching]);
  };
  const updateHours = async (id: string, hours: number) => {
    const { error } = await supabase.from('school_teaching').update({ weekly_hours: hours }).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setTeaching((t) => t.map((x) => (x.id === id ? { ...x, weekly_hours: hours } : x)));
  };
  const delTeaching = async (id: string) => {
    const { error } = await supabase.from('school_teaching').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setTeaching((t) => t.filter((x) => x.id !== id));
  };

  // ── أوقات اليوم (الحصص) ───────────────────────────────────────
  const addPeriod = async (name: string, kind: string, start: string, end: string) => {
    const { data, error } = await supabase
      .from('school_periods')
      .insert({ school_id: schoolId, name, kind, start_time: start || null, end_time: end || null, sort: nextSort(periods) })
      .select('id,name,kind,start_time,end_time,sort')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setPeriods((p) => [...p, data as Period]);
  };
  const updatePeriod = async (id: string, patch: Partial<Period>) => {
    const { error } = await supabase.from('school_periods').update(patch).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setPeriods((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const delPeriod = async (id: string) => {
    if (!window.confirm('حذف هذا الوقت؟')) return;
    const { error } = await supabase.from('school_periods').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setPeriods((p) => p.filter((x) => x.id !== id));
  };

  // ── شبكة الجدول ───────────────────────────────────────────────
  const addEntry = async (day: number, periodId: string, classId: string, memberId: string, subjectId: string) => {
    const { data, error } = await supabase
      .from('school_timetable_entries')
      .insert({ school_id: schoolId, day, period_id: periodId, class_id: classId, member_id: memberId, subject_id: subjectId })
      .select('id,day,period_id,class_id,member_id,subject_id')
      .single();
    if (error || !data) {
      // قيد unique في القاعدة يمنع التعارض → رسالة واضحة
      const busy = /tt_member_slot/.test(error?.message || '');
      const dup = /tt_class_slot/.test(error?.message || '');
      return showToast(busy ? '⚠️ المعلمة مشغولة في هذا الوقت بفصل آخر' : dup ? 'الخانة مشغولة' : 'تعذّرت الإضافة');
    }
    setEntries((e) => [...e, data as Entry]);
  };
  const delEntry = async (id: string) => {
    const { error } = await supabase.from('school_timetable_entries').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setEntries((e) => e.filter((x) => x.id !== id));
  };

  // ── التوليد التلقائي (محرّك القيود) ───────────────────────────
  const generateTimetable = async (rules: Rule[] = []) => {
    if (!schoolId) return;
    const lessonPids = periods.filter((p) => p.kind === 'lesson').sort((a, b) => a.sort - b.sort).map((p) => p.id);
    const wd = school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4];
    if (!teaching.length || !lessonPids.length) return showToast('أضيفي توزيعًا وحصصًا أولًا');
    if (!window.confirm('توليد الجدول تلقائيًا؟ سيستبدل الجدول الحالي (مسودة).')) return;
    setGenerating(true);
    // بناء القيود للمحرّك
    const offDay = new Set<string>();
    const noSlot = new Set<string>();
    const avoidLast = new Set<string>();
    for (const r of rules) {
      if (r.kind === 'off_day') offDay.add(`${r.member_id}|${r.day}`);
      else if (r.kind === 'no_period') {
        const pid = lessonPids[r.periodIndex];
        if (pid) noSlot.add(`${r.member_id}|${pid}`);
      } else if (r.kind === 'avoid_last') avoidLast.add(r.subject_id);
    }
    const cons: SolveCons = { offDay, noSlot, avoidLast, lastPid: lessonPids[lessonPids.length - 1] || null };
    const res = solveTimetable(teaching, lessonPids, wd, cons);
    const { error: delErr } = await supabase.from('school_timetable_entries').delete().eq('school_id', schoolId);
    if (delErr) {
      setGenerating(false);
      return showToast('تعذّر مسح الجدول القديم');
    }
    if (res.placements.length) {
      const rows = res.placements.map((p) => ({ school_id: schoolId, day: p.day, period_id: p.period_id, class_id: p.class_id, member_id: p.member_id, subject_id: p.subject_id }));
      const { error } = await supabase.from('school_timetable_entries').insert(rows);
      if (error) {
        setGenerating(false);
        return showToast('تعذّر حفظ الجدول');
      }
    }
    await loadMembersDepts(schoolId);
    setGenReport({ placed: res.placements.length, unplaced: res.unplaced });
    setGenerating(false);
    showToast(res.unplaced.length ? `⚠️ تعذّر وضع ${res.unplaced.length} حصة` : '✅ جدول بلا تعارضات');
  };

  // ── حضور المتعلمات ────────────────────────────────────────────
  const monthBounds = (iso: string) => {
    const [y, m] = iso.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const nm = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { start, next: nm };
  };
  const loadAtt = useCallback(
    async (cls: Klass, date: string) => {
      const { start, next } = monthBounds(date);
      const [st, rec] = await Promise.all([
        supabase.from('school_students').select('id,class_id,name,sid_no,note,archived,sort').eq('class_id', cls.id).eq('archived', false).order('sort'),
        supabase.from('school_attendance').select('id,student_id,date,status,arrived_at').eq('class_id', cls.id).gte('date', start).lt('date', next),
      ]);
      setAttStudents((st.data as Student[]) || []);
      setAttRecords((rec.data as AttRow[]) || []);
    },
    [supabase]
  );
  const openAttClass = (cls: Klass) => {
    setAttClass(cls);
    loadAtt(cls, attDate);
  };
  const changeAttDate = (date: string) => {
    setAttDate(date);
    if (attClass) loadAtt(attClass, date);
  };
  const setAttStatus = async (studentId: string, status: string, arrivedAt: string | null = null) => {
    if (!attClass) return;
    const existing = attRecords.find((r) => r.student_id === studentId && r.date === attDate);
    if (status === 'present') {
      if (existing) {
        await supabase.from('school_attendance').delete().eq('id', existing.id);
        setAttRecords((r) => r.filter((x) => x.id !== existing.id));
      }
      return;
    }
    const { data, error } = await supabase
      .from('school_attendance')
      .upsert({ school_id: schoolId, student_id: studentId, class_id: attClass.id, date: attDate, status, arrived_at: arrivedAt }, { onConflict: 'student_id,date' })
      .select('id,student_id,date,status,arrived_at')
      .single();
    if (error || !data) return showToast('تعذّر الحفظ');
    setAttRecords((r) => [...r.filter((x) => !(x.student_id === studentId && x.date === attDate)), data as AttRow]);
  };

  // ── دوام الهيئة (الإدارة فقط) ──────────────────────────────────
  const loadStaffAtt = useCallback(
    async (date: string) => {
      if (!schoolId) return;
      const { start, next } = monthBounds(date);
      const { data } = await supabase.from('school_staff_attendance').select('id,member_id,date,status,at_time').eq('school_id', schoolId).gte('date', start).lt('date', next);
      setStaffRecords((data as StaffRow[]) || []);
    },
    [supabase, schoolId]
  );
  const changeStaffDate = (date: string) => {
    setStaffDate(date);
    loadStaffAtt(date);
  };
  const setStaffStatus = async (memberId: string, status: string, atTime: string | null = null) => {
    const existing = staffRecords.find((r) => r.member_id === memberId && r.date === staffDate);
    if (status === 'present') {
      if (existing) {
        await supabase.from('school_staff_attendance').delete().eq('id', existing.id);
        setStaffRecords((r) => r.filter((x) => x.id !== existing.id));
      }
      return;
    }
    const { data, error } = await supabase
      .from('school_staff_attendance')
      .upsert({ school_id: schoolId, member_id: memberId, date: staffDate, status, at_time: atTime }, { onConflict: 'member_id,date' })
      .select('id,member_id,date,status,at_time')
      .single();
    if (error || !data) return showToast('تعذّر الحفظ');
    setStaffRecords((r) => [...r.filter((x) => !(x.member_id === memberId && x.date === staffDate)), data as StaffRow]);
  };

  // ── الاحتياط ──────────────────────────────────────────────────
  const loadSub = useCallback(
    async (date: string) => {
      if (!schoolId) return;
      const { start, next } = monthBounds(date);
      const [sa, sb] = await Promise.all([
        supabase.from('school_staff_attendance').select('member_id,status').eq('school_id', schoolId).eq('date', date),
        supabase.from('school_substitutions').select('id,date,period_id,class_id,subject_id,absent_member_id,sub_member_id').eq('school_id', schoolId).gte('date', start).lt('date', next),
      ]);
      setSubStaff((sa.data as { member_id: string; status: string }[]) || []);
      setSubsMonth((sb.data as Sub[]) || []);
    },
    [supabase, schoolId]
  );
  const changeSubDate = (date: string) => {
    setSubDate(date);
    loadSub(date);
  };
  const assignSub = async (periodId: string, classId: string, subjectId: string | null, absentId: string | null, subMemberId: string) => {
    const { data, error } = await supabase
      .from('school_substitutions')
      .upsert({ school_id: schoolId, date: subDate, period_id: periodId, class_id: classId, subject_id: subjectId, absent_member_id: absentId, sub_member_id: subMemberId }, { onConflict: 'school_id,date,period_id,class_id' })
      .select('id,date,period_id,class_id,subject_id,absent_member_id,sub_member_id')
      .single();
    if (error || !data) return showToast('تعذّر الاعتماد');
    setSubsMonth((s) => [...s.filter((x) => !(x.date === subDate && x.period_id === periodId && x.class_id === classId)), data as Sub]);
    showToast('تم اعتماد البديلة ✅');
  };
  const clearSub = async (id: string) => {
    await supabase.from('school_substitutions').delete().eq('id', id);
    setSubsMonth((s) => s.filter((x) => x.id !== id));
  };

  // ── المناوبات ─────────────────────────────────────────────────
  const addDutyLoc = async (name: string) => {
    const { data, error } = await supabase.from('school_duty_locations').insert({ school_id: schoolId, name, sort: nextSort(dutyLocs) }).select('id,name,sort').single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setDutyLocs((l) => [...l, data as DutyLoc]);
  };
  const renameDutyLoc = async (id: string, name: string) => {
    const { error } = await supabase.from('school_duty_locations').update({ name }).eq('id', id);
    if (error) return showToast('تعذّر التعديل');
    setDutyLocs((l) => l.map((x) => (x.id === id ? { ...x, name } : x)));
  };
  const delDutyLoc = async (id: string) => {
    if (!window.confirm('حذف المكان؟ (تُحذف مناوباته)')) return;
    const { error } = await supabase.from('school_duty_locations').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setDutyLocs((l) => l.filter((x) => x.id !== id));
    setDuties((d) => d.filter((x) => x.location_id !== id));
  };
  const addDuty = async (day: number, periodId: string, locationId: string, memberId: string) => {
    // فحص تعارض: هل عندها حصة في هذا (اليوم، الفترة)؟
    if (entries.some((e) => e.member_id === memberId && e.day === day && e.period_id === periodId)) {
      return showToast('⚠️ المعلمة عندها حصة في هذا الوقت');
    }
    const { data, error } = await supabase.from('school_duties').insert({ school_id: schoolId, day, period_id: periodId, location_id: locationId, member_id: memberId }).select('id,day,period_id,location_id,member_id').single();
    if (error || !data) return showToast(/duplicate|unique/i.test(error?.message || '') ? '⚠️ المعلمة مكلّفة مناوبة أخرى بنفس الوقت' : 'تعذّرت الإضافة');
    setDuties((d) => [...d, data as Duty]);
  };
  const delDuty = async (id: string) => {
    const { error } = await supabase.from('school_duties').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setDuties((d) => d.filter((x) => x.id !== id));
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
          importMembers={importMembers}
        />
      ) : view === 'students' ? (
        <StudentsView
          stages={stages}
          grades={grades}
          classes={classes}
          openClass={openClass}
          students={students}
          canManage={canManage}
          onBack={() => (openClass ? setOpenClass(null) : setView('dash'))}
          onOpenClass={openClassStudents}
          addStudent={addStudent}
          updateStudent={updateStudent}
          moveStudent={moveStudent}
          delStudent={delStudent}
          importStudents={importStudents}
        />
      ) : view === 'teaching' ? (
        <TeachingView
          subjects={subjects}
          teaching={teaching}
          members={members}
          grades={grades}
          classes={classes}
          canManage={canManage}
          onBack={() => setView('dash')}
          addSubject={addSubject}
          renameSubject={renameSubject}
          delSubject={delSubject}
          addTeaching={addTeaching}
          updateHours={updateHours}
          delTeaching={delTeaching}
        />
      ) : view === 'timetable' ? (
        <TimetableView
          school={school}
          periods={periods}
          classes={classes}
          grades={grades}
          teaching={teaching}
          members={members}
          subjects={subjects}
          entries={entries}
          canManage={canManage}
          onBack={() => setView('dash')}
          addPeriod={addPeriod}
          updatePeriod={updatePeriod}
          delPeriod={delPeriod}
          addEntry={addEntry}
          delEntry={delEntry}
          generateTimetable={generateTimetable}
          generating={generating}
          genReport={genReport}
        />
      ) : view === 'attendance' ? (
        <AttendanceView
          stages={stages}
          grades={grades}
          classes={classes}
          attClass={attClass}
          attDate={attDate}
          attStudents={attStudents}
          attRecords={attRecords}
          canManage={canManage}
          onBack={() => (attClass ? setAttClass(null) : setView('dash'))}
          onOpenClass={openAttClass}
          onChangeDate={changeAttDate}
          setAttStatus={setAttStatus}
        />
      ) : view === 'staff' ? (
        <StaffView
          members={members}
          staffDate={staffDate}
          staffRecords={staffRecords}
          canManage={canManage}
          onBack={() => setView('dash')}
          onChangeDate={changeStaffDate}
          setStaffStatus={setStaffStatus}
        />
      ) : view === 'substitution' ? (
        <SubstitutionView
          entries={entries}
          periods={periods}
          members={members}
          subjects={subjects}
          classes={classes}
          grades={grades}
          subDate={subDate}
          subStaff={subStaff}
          subsMonth={subsMonth}
          canManage={canManage}
          onBack={() => setView('dash')}
          onChangeDate={changeSubDate}
          assignSub={assignSub}
          clearSub={clearSub}
        />
      ) : view === 'duty' ? (
        <DutyView
          dutyLocs={dutyLocs}
          duties={duties}
          periods={periods}
          members={members}
          entries={entries}
          workDays={school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4]}
          canManage={canManage}
          onBack={() => setView('dash')}
          addDutyLoc={addDutyLoc}
          renameDutyLoc={renameDutyLoc}
          delDutyLoc={delDutyLoc}
          addDuty={addDuty}
          delDuty={delDuty}
        />
      ) : (
        <Dashboard
          school={school}
          counts={{ stages: stages.length, grades: grades.length, classes: classes.length, depts: depts.length, members: members.length }}
          onOpen={(k) => {
            if (k === 'structure') setView('structure');
            else if (k === 'departments') setView('departments');
            else if (k === 'students') {
              setOpenClass(null);
              setView('students');
            } else if (k === 'teaching') setView('teaching');
            else if (k === 'timetable') setView('timetable');
            else if (k === 'attendance') {
              setAttClass(null);
              setView('attendance');
            } else if (k === 'staff') {
              loadStaffAtt(staffDate);
              setView('staff');
            } else if (k === 'substitution') {
              loadSub(subDate);
              setView('substitution');
            } else if (k === 'duty') setView('duty');
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
  importMembers,
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
  importMembers: (names: string[], deptId: string | null) => void;
}) {
  const [newDept, setNewDept] = useState('');
  const noDept = members.filter((m) => !m.department_id).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

  const MemberRow = ({ m, roleText }: { m: Member; roleText?: string }) => (
    <div className="flex items-center gap-2 py-1">
      <span className="w-6 text-center text-sage/40">•</span>
      <div className="flex-1 text-[13px] text-ink">
        {m.name || '—'} <span className="text-[11px] text-ink/45">({roleText || ROLE_LABEL[m.role] || m.role})</span>
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
          const mm = members
            .filter((m) => m.department_id === d.id)
            .slice()
            .sort((a, b) => {
              if (a.id === d.head_member_id) return -1; // رئيسة الشعبة أولًا
              if (b.id === d.head_member_id) return 1;
              return (a.name || '').localeCompare(b.name || '', 'ar'); // ثم أبجديًا
            });
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
                  {mm.length ? mm.map((m) => <MemberRow key={m.id} m={m} roleText={m.id === d.head_member_id ? 'رئيسة الشعبة' : undefined} />) : <div className="text-[12px] text-ink/35">— لا معلمات —</div>}
                </div>
                {canManage ? <AddInline placeholder="اسم المعلمة لإضافتها" onAdd={(v) => addMember(v, 'teacher', d.id)} /> : null}
                {canManage ? <ImportNames what="معلمات" onAdd={(names) => importMembers(names, d.id)} /> : null}
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

/** إضافة عضو إداري (بدور محدّد) بلا شعبة — بالاسم. */
function AddPerson({ onAdd }: { onAdd: (name: string, role: string) => void }) {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState('principal');
  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      <input
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="اسم العضو"
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

/* ───────────────────────── الجدول: أوقات اليوم + الشبكة ───────────────────────── */
function TimetableView({
  school,
  periods,
  classes,
  grades,
  teaching,
  members,
  subjects,
  entries,
  canManage,
  onBack,
  addPeriod,
  updatePeriod,
  delPeriod,
  addEntry,
  delEntry,
  generateTimetable,
  generating,
  genReport,
}: {
  school: School | null;
  periods: Period[];
  classes: Klass[];
  grades: Grade[];
  teaching: Teaching[];
  members: Member[];
  subjects: Subject[];
  entries: Entry[];
  canManage: boolean;
  onBack: () => void;
  addPeriod: (name: string, kind: string, start: string, end: string) => void;
  updatePeriod: (id: string, patch: Partial<Period>) => void;
  delPeriod: (id: string) => void;
  addEntry: (day: number, periodId: string, classId: string, memberId: string, subjectId: string) => void;
  delEntry: (id: string) => void;
  generateTimetable: (rules?: Rule[]) => void;
  generating: boolean;
  genReport: { placed: number; unplaced: SolveTask[] } | null;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('lesson');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [gridClass, setGridClass] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [parsed, setParsed] = useState<{ rules: Rule[]; unknown: string[] } | null>(null);
  const ORD_LABELS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة'];
  const ruleLabel = (r: Rule) =>
    r.kind === 'off_day'
      ? `🔴 ${memberName(r.member_id)} غير متاحة يوم ${WEEKDAYS[r.day]}`
      : r.kind === 'no_period'
      ? `🔴 ${memberName(r.member_id)} لا تأخذ الحصة ${ORD_LABELS[r.periodIndex] || r.periodIndex + 1}`
      : `🟡 تجنّب ${subjectName(r.subject_id)} في آخر حصة`;

  const lessonPeriods = periods.filter((p) => p.kind === 'lesson');
  const workDays = (school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4]).slice().sort((a, b) => a - b);
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || '—';
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || '—';
  const classLabel = (c: Klass) => {
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };
  const classNameById = (id: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? classLabel(c) : '—';
  };
  const entryAt = (day: number, pid: string, cid: string) => entries.find((e) => e.day === day && e.period_id === pid && e.class_id === cid);
  const classTeaching = teaching.filter((t) => t.class_id === gridClass);

  const badge = (k: string) => {
    const map: Record<string, string> = { lesson: 'bg-sage-light text-sage-deep', break: 'bg-gold/15 text-gold-deep', assembly: 'bg-sage-light text-sage-deep', other: 'bg-ink/5 text-ink/60' };
    return map[k] || 'bg-ink/5 text-ink/60';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">الجدول المدرسي</div>
      </div>

      <div className="rounded-2xl bg-sage-light/40 border border-sage/15 p-3 text-[12.5px] text-ink/70">
        الخطوة الأولى: حدّدي <b>أوقات اليوم الدراسي</b> (الحصص والفسح والتجمّع). بعد ضبطها، نبني <b>شبكة الجدول</b> ثم <b>الجدول الذكي</b>.
      </div>

      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">أوقات اليوم</div>
        {periods.length === 0 ? (
          <div className="text-[12px] text-ink/35 mb-2">— لم تُحدَّد أوقات بعد —</div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {periods.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[13px]">
                {canManage ? (
                  <select
                    value={p.kind}
                    onChange={(e) => updatePeriod(p.id, { kind: e.target.value })}
                    className={`text-[10.5px] rounded-full px-2 py-0.5 border-0 ${badge(p.kind)}`}
                  >
                    {PERIOD_KINDS.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
                  </select>
                ) : (
                  <span className={`text-[10.5px] rounded-full px-2 py-0.5 ${badge(p.kind)}`}>{kindLabel(p.kind)}</span>
                )}
                <div className="flex-1 font-bold text-ink">{p.name}</div>
                <div className="text-ink/55 text-[12px] tabular-nums" dir="ltr">
                  {p.start_time || '—'}{p.end_time ? ` – ${p.end_time}` : ''}
                </div>
                {canManage ? (
                  <>
                    <button
                      onClick={() => {
                        const nn = window.prompt('الاسم', p.name);
                        if (nn === null) return;
                        const st = window.prompt('من (HH:MM)', p.start_time || '') ?? '';
                        const en = window.prompt('إلى (HH:MM)', p.end_time || '') ?? '';
                        updatePeriod(p.id, { name: nn.trim() || p.name, start_time: st.trim() || null, end_time: en.trim() || null });
                      }}
                      aria-label="تعديل"
                      className="text-ink/40 hover:text-sage-deep text-sm px-1"
                    >
                      ✏️
                    </button>
                    <button onClick={() => delPeriod(p.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canManage ? (
          <div className="grid grid-cols-2 gap-1.5 border-t border-sage/10 pt-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم (مثال: الحصة الأولى)" className="rounded-lg border border-sage/25 bg-white text-[12px] p-2 col-span-2" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
              {PERIOD_KINDS.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
            </select>
            <div className="flex gap-1 items-center" dir="ltr">
              <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="7:30" inputMode="numeric" className="flex-1 rounded-lg border border-sage/25 bg-white text-[12px] p-2 text-center" />
              <span className="text-ink/40 text-xs">–</span>
              <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="8:15" inputMode="numeric" className="flex-1 rounded-lg border border-sage/25 bg-white text-[12px] p-2 text-center" />
            </div>
            <button
              onClick={() => {
                if (name.trim()) {
                  addPeriod(name.trim(), kind, start, end);
                  setName('');
                  setStart('');
                  setEnd('');
                }
              }}
              className="col-span-2 rounded-lg bg-sage-deep text-white font-bold text-[12px] py-2"
            >
              ＋ إضافة وقت
            </button>
          </div>
        ) : null}
      </div>

      {/* التوليد الذكي + القواعد بالعربي */}
      {canManage ? (
        <div className="card-3d bg-white rounded-2xl p-3">
          <div className="font-extrabold text-sage-deep mb-1">✨ إنشاء الجدول الذكي</div>
          <div className="text-[11.5px] text-ink/55 mb-2">اكتبي قيودك بالعربي (اختياري)، والنظام يفهمها ويعرضها لك للتأكيد قبل التوليد.</div>

          <textarea
            value={rulesText}
            onChange={(e) => {
              setRulesText(e.target.value);
              setParsed(null);
            }}
            rows={4}
            placeholder={'مثال:\nسارة غير متاحة يوم الخميس\nمنى لا تأخذ الحصة الأولى\nتجنّب الرياضيات في آخر حصة'}
            className="w-full rounded-xl border border-sage/25 bg-white text-[13px] p-2.5 leading-relaxed focus:outline-none focus:border-sage"
          />

          <div className="flex gap-2 mt-2 flex-wrap">
            <button
              onClick={() => setParsed(parseRules(rulesText, members, subjects))}
              disabled={!rulesText.trim()}
              className="rounded-xl border border-sage/30 text-sage-deep font-bold text-[12.5px] px-4 py-2 disabled:opacity-40"
            >
              فهم القواعد
            </button>
            <button
              onClick={() => generateTimetable(parsed?.rules || [])}
              disabled={generating}
              className="rounded-xl bg-gold text-white font-extrabold text-[13px] px-4 py-2 shadow-soft disabled:opacity-50"
            >
              {generating ? '…جارٍ الحساب' : parsed?.rules.length ? '✨ إنشاء الجدول بهذه القواعد' : '✨ توليد الجدول'}
            </button>
          </div>

          {parsed ? (
            <div className="mt-2 rounded-xl bg-sage-light/40 p-2.5 text-[12.5px]">
              {parsed.rules.length ? (
                <>
                  <div className="font-bold text-sage-deep mb-1">فهمت القواعد التالية:</div>
                  <div className="space-y-0.5 text-ink/80">
                    {parsed.rules.map((r, i) => <div key={i}>{ruleLabel(r)}</div>)}
                  </div>
                  <div className="text-[11px] text-ink/50 mt-1">🔴 إلزامي (لا يُخالَف) · 🟡 تفضيل (يُحاوَل قدر الإمكان)</div>
                </>
              ) : (
                <div className="text-ink/60">ما فهمت أي قاعدة. جرّبي صياغة أوضح (اسم المعلمة + اليوم/الحصة).</div>
              )}
              {parsed.unknown.length ? (
                <div className="mt-1 text-[11.5px] text-gold-deep">لم أفهم: {parsed.unknown.slice(0, 4).join(' · ')}</div>
              ) : null}
            </div>
          ) : null}

          {genReport ? (
            <div className={`mt-2 rounded-xl p-2.5 text-[12.5px] ${genReport.unplaced.length ? 'bg-gold/10' : 'bg-sage-light/50'}`}>
              <div className="font-bold text-sage-deep">نتيجة الفحص</div>
              <div className="text-ink/75 mt-0.5">✓ وُضعت {genReport.placed} حصة</div>
              {genReport.unplaced.length ? (
                <div className="mt-1">
                  <div className="font-bold text-gold-deep">⚠️ تعذّر وضع {genReport.unplaced.length} حصة (ازدحام أو قلّة أوقات):</div>
                  <div className="text-ink/70 mt-0.5 space-y-0.5">
                    {genReport.unplaced.slice(0, 12).map((u, i) => (
                      <div key={i}>• {subjectName(u.subject_id)} — {memberName(u.member_id)} — {classNameById(u.class_id)}</div>
                    ))}
                    {genReport.unplaced.length > 12 ? <div>…و{genReport.unplaced.length - 12} غيرها</div> : null}
                  </div>
                  <div className="text-[11.5px] text-ink/50 mt-1">جرّبي: زيادة الحصص في اليوم، أو تقليل نصاب المعلمة، أو إعادة التوليد.</div>
                </div>
              ) : (
                <div className="text-sage-deep mt-0.5">كل النُّصُب مكتملة بلا تعارضات ✅</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* شبكة الجدول */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">الجدول (حسب الفصل)</div>
        {lessonPeriods.length === 0 || classes.length === 0 ? (
          <div className="text-[12px] text-ink/45">أضيفي حصصًا (نوع «حصة») وفصولًا أولًا.</div>
        ) : (
          <>
            <select value={gridClass} onChange={(e) => setGridClass(e.target.value)} className="w-full rounded-lg border border-sage/25 bg-white text-[13px] p-2 mb-3">
              <option value="">اختاري الفصل…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>

            {gridClass ? (
              <div className="overflow-x-auto">
                <table className="border-collapse text-center text-[11px] min-w-full">
                  <thead>
                    <tr>
                      <th className="border border-sage/20 bg-sage-light/40 p-1.5 sticky right-0">الحصة</th>
                      {workDays.map((d) => (
                        <th key={d} className="border border-sage/20 bg-sage-light/40 p-1.5 font-bold text-sage-deep whitespace-nowrap">{WEEKDAYS[d]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lessonPeriods.map((p) => (
                      <tr key={p.id}>
                        <td className="border border-sage/20 bg-sage-light/20 p-1.5 font-bold text-ink whitespace-nowrap sticky right-0">{p.name}</td>
                        {workDays.map((d) => {
                          const en = entryAt(d, p.id, gridClass);
                          return (
                            <td key={d} className="border border-sage/15 p-1 align-top" style={{ minWidth: 92 }}>
                              {en ? (
                                <div className="rounded-md bg-sage-light/50 p-1 leading-tight">
                                  <div className="font-bold text-sage-deep">{subjectName(en.subject_id)}</div>
                                  <div className="text-ink/60 text-[10px]">{memberName(en.member_id)}</div>
                                  {canManage ? (
                                    <button onClick={() => delEntry(en.id)} className="text-red-400 hover:text-red-600 text-[10px] mt-0.5">✕ إزالة</button>
                                  ) : null}
                                </div>
                              ) : canManage && classTeaching.length ? (
                                <select
                                  value=""
                                  onChange={(e) => {
                                    const t = classTeaching.find((x) => x.id === e.target.value);
                                    if (t) addEntry(d, p.id, gridClass, t.member_id, t.subject_id);
                                  }}
                                  className="w-full rounded border border-sage/20 bg-white text-[10px] p-0.5 text-ink/60"
                                >
                                  <option value="">＋</option>
                                  {classTeaching.map((t) => (
                                    <option key={t.id} value={t.id}>{subjectName(t.subject_id)} - {memberName(t.member_id)}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-ink/20">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {canManage && classTeaching.length === 0 ? (
                  <div className="text-[12px] text-gold-deep mt-2">وزّعي معلمات على هذا الفصل من «المواد والتوزيع» عشان تظهر خيارات الحصص.</div>
                ) : null}
              </div>
            ) : (
              <div className="text-[12px] text-ink/40">اختاري فصلًا لعرض جدوله.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── المواد والتوزيع ───────────────────────── */
function TeachingView({
  subjects,
  teaching,
  members,
  grades,
  classes,
  canManage,
  onBack,
  addSubject,
  renameSubject,
  delSubject,
  addTeaching,
  updateHours,
  delTeaching,
}: {
  subjects: Subject[];
  teaching: Teaching[];
  members: Member[];
  grades: Grade[];
  classes: Klass[];
  canManage: boolean;
  onBack: () => void;
  addSubject: (name: string) => void;
  renameSubject: (id: string, name: string) => void;
  delSubject: (id: string) => void;
  addTeaching: (memberId: string, subjectId: string, classId: string, hours: number) => void;
  updateHours: (id: string, hours: number) => void;
  delTeaching: (id: string) => void;
}) {
  const [mSel, setMSel] = useState('');
  const [sSel, setSSel] = useState('');
  const [cSel, setCSel] = useState('');
  const [hSel, setHSel] = useState('3');

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || '—';
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || '—';
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };

  const teachers = members.filter((m) => teaching.some((t) => t.member_id === m.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">المواد والتوزيع</div>
      </div>

      {/* المواد */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">المواد</div>
        {subjects.length ? (
          <div className="space-y-1 mb-2">
            {subjects.map((s) => (
              <Row
                key={s.id}
                label={s.name}
                small
                canManage={canManage}
                onRename={() => {
                  const n = window.prompt('اسم المادة', s.name);
                  if (n && n.trim()) renameSubject(s.id, n.trim());
                }}
                onDelete={() => delSubject(s.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-ink/35 mb-2">— لا مواد بعد —</div>
        )}
        {canManage ? <AddInline placeholder="مادة جديدة (مثال: اللغة العربية)" onAdd={addSubject} /> : null}
      </div>

      {/* التوزيع */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">التوزيع</div>

        {canManage ? (
          subjects.length && members.length && classes.length ? (
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <select value={mSel} onChange={(e) => setMSel(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">المعلمة</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={sSel} onChange={(e) => setSSel(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">المادة</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={cSel} onChange={(e) => setCSel(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">الفصل</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c.id)}</option>)}
              </select>
              <div className="flex gap-1.5">
                <input type="number" min={1} value={hSel} onChange={(e) => setHSel(e.target.value)} className="w-16 rounded-lg border border-sage/25 bg-white text-[12px] p-2" title="حصص أسبوعية" />
                <button
                  onClick={() => {
                    if (mSel && sSel && cSel) {
                      addTeaching(mSel, sSel, cSel, Math.max(1, +hSel || 1));
                      setSSel('');
                      setCSel('');
                    }
                  }}
                  className="flex-1 rounded-lg bg-sage-deep text-white font-bold text-[12px] px-2"
                >
                  ＋ توزيع
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-ink/45 mb-2">أضيفي مواد ومعلمات وفصولًا أولًا.</div>
          )
        ) : null}

        {teachers.length === 0 ? (
          <div className="text-[12px] text-ink/35">— لا توزيع بعد —</div>
        ) : (
          teachers.map((m) => {
            const rows = teaching.filter((t) => t.member_id === m.id);
            const total = rows.reduce((a, t) => a + t.weekly_hours, 0);
            return (
              <div key={m.id} className="mb-3">
                <div className="font-bold text-ink text-[13.5px] mb-1">
                  {m.name} <span className="text-[11px] text-ink/45">({total} حصة أسبوعيًا)</span>
                </div>
                <div className="pr-3 border-r-2 border-sage/10 space-y-1">
                  {rows.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[12.5px]">
                      <div className="flex-1 text-ink">{subjectName(t.subject_id)} · {classLabel(t.class_id)}</div>
                      {canManage ? (
                        <input
                          type="number"
                          min={1}
                          defaultValue={t.weekly_hours}
                          onBlur={(e) => { const v = Math.max(1, +e.target.value || 1); if (v !== t.weekly_hours) updateHours(t.id, v); }}
                          className="w-14 rounded border border-sage/25 bg-white text-[12px] p-1 text-center"
                          title="حصص"
                        />
                      ) : (
                        <span className="text-ink/60">{t.weekly_hours} حصة</span>
                      )}
                      {canManage ? (
                        <button onClick={() => delTeaching(t.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── المناوبات ───────────────────────── */
function DutyView({
  dutyLocs,
  duties,
  periods,
  members,
  entries,
  workDays,
  canManage,
  onBack,
  addDutyLoc,
  renameDutyLoc,
  delDutyLoc,
  addDuty,
  delDuty,
}: {
  dutyLocs: DutyLoc[];
  duties: Duty[];
  periods: Period[];
  members: Member[];
  entries: Entry[];
  workDays: number[];
  canManage: boolean;
  onBack: () => void;
  addDutyLoc: (name: string) => void;
  renameDutyLoc: (id: string, name: string) => void;
  delDutyLoc: (id: string) => void;
  addDuty: (day: number, periodId: string, locationId: string, memberId: string) => void;
  delDuty: (id: string) => void;
}) {
  const [day, setDay] = useState(String(workDays[0] ?? 0));
  const [pid, setPid] = useState('');
  const [loc, setLoc] = useState('');
  const [mem, setMem] = useState('');

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || '—';
  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || '—';
  const locName = (id: string) => dutyLocs.find((l) => l.id === id)?.name || '—';
  const wd = workDays.slice().sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">المناوبات</div>
      </div>

      {/* أماكن المناوبة */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">أماكن المناوبة</div>
        {dutyLocs.length ? (
          <div className="space-y-1 mb-2">
            {dutyLocs.map((l) => (
              <Row
                key={l.id}
                label={l.name}
                small
                canManage={canManage}
                onRename={() => {
                  const n = window.prompt('اسم المكان', l.name);
                  if (n && n.trim()) renameDutyLoc(l.id, n.trim());
                }}
                onDelete={() => delDutyLoc(l.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-ink/35 mb-2">— لا أماكن بعد —</div>
        )}
        {canManage ? <AddInline placeholder="مكان جديد (مثال: الساحة)" onAdd={addDutyLoc} /> : null}
      </div>

      {/* توزيع المناوبات */}
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">توزيع المناوبات</div>
        {canManage ? (
          dutyLocs.length && periods.length && members.length ? (
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                {wd.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </select>
              <select value={pid} onChange={(e) => setPid(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">الفترة</option>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">المكان</option>
                {dutyLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <div className="flex gap-1.5">
                <select value={mem} onChange={(e) => setMem(e.target.value)} className="flex-1 rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                  <option value="">المعلمة</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button
                  onClick={() => {
                    if (pid && loc && mem) {
                      addDuty(Number(day), pid, loc, mem);
                      setMem('');
                    }
                  }}
                  className="rounded-lg bg-sage-deep text-white font-bold text-[12px] px-2"
                >
                  ＋
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-ink/45 mb-2">أضيفي أماكن ومعلمات وحدّدي أوقات اليوم أولًا.</div>
          )
        ) : null}

        {duties.length === 0 ? (
          <div className="text-[12px] text-ink/35">— لا مناوبات بعد —</div>
        ) : (
          wd.map((d) => {
            const dd = duties.filter((x) => x.day === d);
            if (!dd.length) return null;
            return (
              <div key={d} className="mb-2">
                <div className="font-bold text-sage-deep text-[13px] mb-1">{WEEKDAYS[d]}</div>
                <div className="pr-3 border-r-2 border-sage/10 space-y-1">
                  {dd.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 text-[12.5px]">
                      <div className="flex-1 text-ink">{periodName(x.period_id)} · {locName(x.location_id)} · <b>{memberName(x.member_id)}</b></div>
                      {canManage ? <button onClick={() => delDuty(x.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── الاحتياط ───────────────────────── */
function SubstitutionView({
  entries,
  periods,
  members,
  subjects,
  classes,
  grades,
  subDate,
  subStaff,
  subsMonth,
  canManage,
  onBack,
  onChangeDate,
  assignSub,
  clearSub,
}: {
  entries: Entry[];
  periods: Period[];
  members: Member[];
  subjects: Subject[];
  classes: Klass[];
  grades: Grade[];
  subDate: string;
  subStaff: { member_id: string; status: string }[];
  subsMonth: Sub[];
  canManage: boolean;
  onBack: () => void;
  onChangeDate: (d: string) => void;
  assignSub: (periodId: string, classId: string, subjectId: string | null, absentId: string | null, subMemberId: string) => void;
  clearSub: (id: string) => void;
}) {
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name || '—';
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name || '—';
  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || '—';
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };

  const weekday = new Date(subDate + 'T00:00:00').getDay(); // 0=الأحد
  const absentIds = new Set(subStaff.filter((r) => STAFF_ABSENT.has(r.status)).map((r) => r.member_id));
  const monthCount = (mid: string) => subsMonth.filter((s) => s.sub_member_id === mid).length;

  const availableSubs = (periodId: string) => {
    const busyTeach = new Set(entries.filter((e) => e.day === weekday && e.period_id === periodId).map((e) => e.member_id));
    const busySub = new Set(subsMonth.filter((s) => s.date === subDate && s.period_id === periodId && s.sub_member_id).map((s) => s.sub_member_id as string));
    return members
      .filter((m) => !absentIds.has(m.id) && !busyTeach.has(m.id) && !busySub.has(m.id))
      .sort((a, b) => monthCount(a.id) - monthCount(b.id));
  };

  const absentList = members.filter((m) => absentIds.has(m.id)).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">الاحتياط</div>
      </div>

      <div className="rounded-2xl bg-white border border-sage/15 p-3 flex items-center gap-3 flex-wrap">
        <input type="date" value={subDate} onChange={(e) => onChangeDate(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[13px] p-1.5" />
        <div className="text-[12px] text-ink/60">الغائبات اليوم: {absentList.length}</div>
      </div>

      {absentList.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60">
          لا غياب (مرضي/عرضي) مسجّل لهذا اليوم. سجّلي الغياب من «دوام الهيئة» أولًا.
        </div>
      ) : (
        absentList.map((am) => {
          const lessons = entries.filter((e) => e.member_id === am.id && e.day === weekday);
          return (
            <div key={am.id} className="card-3d bg-white rounded-2xl p-3">
              <div className="font-extrabold text-sage-deep mb-2">{am.name} — غائبة</div>
              {lessons.length === 0 ? (
                <div className="text-[12px] text-ink/40">ما عندها حصص هذا اليوم في الجدول.</div>
              ) : (
                <div className="space-y-2">
                  {lessons.map((L) => {
                    const existing = subsMonth.find((s) => s.date === subDate && s.period_id === L.period_id && s.class_id === L.class_id && s.sub_member_id);
                    const opts = availableSubs(L.period_id);
                    return (
                      <div key={L.id} className="rounded-xl border border-sage/15 p-2">
                        <div className="text-[12.5px] font-bold text-ink">
                          {periodName(L.period_id)} · {classLabel(L.class_id)} · {subjectName(L.subject_id)}
                        </div>
                        {existing ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[12px] text-sage-deep font-bold">↦ البديلة: {memberName(existing.sub_member_id)}</span>
                            {canManage ? <button onClick={() => clearSub(existing.id)} className="text-red-400 hover:text-red-600 text-[11px]">✕ إلغاء</button> : null}
                          </div>
                        ) : canManage ? (
                          opts.length ? (
                            <select
                              value=""
                              onChange={(e) => e.target.value && assignSub(L.period_id, L.class_id, L.subject_id, am.id, e.target.value)}
                              className="mt-1 w-full rounded-lg border border-sage/25 bg-white text-[12px] p-1.5"
                            >
                              <option value="">اختاري بديلة متاحة…</option>
                              {opts.map((o) => (
                                <option key={o.id} value={o.id}>{o.name} — احتياطها هذا الشهر: {monthCount(o.id)}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-[11.5px] text-gold-deep mt-1">⚠️ لا توجد معلمة متاحة لهذه الحصة.</div>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ───────────────────────── دوام الهيئة (الإدارة فقط) ───────────────────────── */
function StaffView({
  members,
  staffDate,
  staffRecords,
  canManage,
  onBack,
  onChangeDate,
  setStaffStatus,
}: {
  members: Member[];
  staffDate: string;
  staffRecords: StaffRow[];
  canManage: boolean;
  onBack: () => void;
  onChangeDate: (d: string) => void;
  setStaffStatus: (memberId: string, status: string, atTime?: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const sortedMembers = members.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const recOf = (mid: string) => staffRecords.find((r) => r.member_id === mid && r.date === staffDate);
  const monthSummary = (mid: string) => {
    const rows = staffRecords.filter((r) => r.member_id === mid && r.status !== 'present');
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = (by[r.status] || 0) + 1;
    return Object.entries(by).map(([k, n]) => `${staffLabel(k)} ${n}`).join(' · ');
  };
  const shown = sortedMembers.filter((m) => !q.trim() || (m.name || '').includes(q.trim()));
  const present = members.length - staffRecords.filter((r) => r.date === staffDate && r.status !== 'present').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">دوام الهيئة التعليمية</div>
      </div>

      <div className="rounded-2xl bg-gold/10 border border-gold/20 p-2.5 text-[11.5px] text-ink/70">
        🔒 بيانات إدارية خاصة — تظهر للإدارة فقط، ولا يراها بقية المعلمات.
      </div>

      <div className="rounded-2xl bg-white border border-sage/15 p-3 flex items-center gap-3 flex-wrap">
        <input type="date" value={staffDate} onChange={(e) => onChangeDate(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[13px] p-1.5" />
        <div className="text-[12px] text-ink/60">حاضرات اليوم: {present} من {members.length}</div>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ابحثي باسم المعلمة" className="w-full rounded-xl border border-sage/25 p-2.5 text-sm bg-white focus:outline-none focus:border-sage" />

      {shown.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/50">{q ? 'لا نتائج' : 'لا معلمات بعد.'}</div>
      ) : (
        shown.map((m) => {
          const rec = recOf(m.id);
          const cur = rec?.status || 'present';
          const sum = monthSummary(m.id);
          return (
            <div key={m.id} className="card-3d bg-white rounded-xl p-2.5 flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <div className="font-bold text-ink text-[14px]">{m.name || '—'}</div>
                {sum ? <div className="text-[10.5px] text-ink/45">الشهر: {sum}</div> : null}
              </div>
              <select
                value={cur}
                onChange={(e) => canManage && setStaffStatus(m.id, e.target.value, STAFF_NEEDS_TIME.has(e.target.value) ? rec?.at_time || null : null)}
                disabled={!canManage}
                className={`rounded-lg border text-[12.5px] p-1.5 ${cur === 'present' ? 'bg-white text-ink/70 border-sage/25' : 'bg-gold/10 text-gold-deep border-gold/30 font-bold'}`}
              >
                {STAFF_STATES.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
              </select>
              {STAFF_NEEDS_TIME.has(cur) ? (
                <input
                  defaultValue={rec?.at_time || ''}
                  onBlur={(e) => setStaffStatus(m.id, cur, e.target.value.trim() || null)}
                  placeholder="8:12"
                  dir="ltr"
                  className="w-16 rounded-lg border border-gold/40 text-[12px] p-1 text-center"
                  title="الوقت"
                />
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ───────────────────────── حضور المتعلمات ───────────────────────── */
function AttendanceView({
  stages,
  grades,
  classes,
  attClass,
  attDate,
  attStudents,
  attRecords,
  canManage,
  onBack,
  onOpenClass,
  onChangeDate,
  setAttStatus,
}: {
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  attClass: Klass | null;
  attDate: string;
  attStudents: Student[];
  attRecords: AttRow[];
  canManage: boolean;
  onBack: () => void;
  onOpenClass: (c: Klass) => void;
  onChangeDate: (d: string) => void;
  setAttStatus: (studentId: string, status: string, arrivedAt?: string | null) => void;
}) {
  if (!attClass) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
          <div className="font-extrabold text-sage-deep flex-1">حضور المتعلمات</div>
        </div>
        {classes.length === 0 ? (
          <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60">أضيفي الهيكل (فصول) والمتعلمات أولًا.</div>
        ) : (
          stages.map((st) => (
            <div key={st.id} className="card-3d bg-white rounded-2xl p-3">
              <div className="font-extrabold text-sage-deep mb-2">{st.name}</div>
              {grades.filter((g) => g.stage_id === st.id).map((g) => (
                <div key={g.id} className="mb-2">
                  <div className="text-[12px] font-bold text-ink/70 mb-1">{g.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {classes.filter((c) => c.grade_id === g.id).map((c) => (
                      <button key={c.id} onClick={() => onOpenClass(c)} className="rounded-lg bg-sage-light text-sage-deep text-[13px] font-bold px-3 py-1.5">{c.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    );
  }

  const recOf = (sid: string) => attRecords.find((r) => r.student_id === sid && r.date === attDate);
  const monthCount = (sid: string, status: string) => attRecords.filter((r) => r.student_id === sid && r.status === status).length;
  const todayCount = (status: string) => attRecords.filter((r) => r.date === attDate && r.status === status).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ الفصول</button>
        <div className="font-extrabold text-sage-deep flex-1">الفصل {attClass.name}</div>
      </div>

      <div className="rounded-2xl bg-white border border-sage/15 p-3 flex items-center gap-3 flex-wrap">
        <input type="date" value={attDate} onChange={(e) => onChangeDate(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[13px] p-1.5" />
        <div className="flex gap-2 text-[12px] flex-wrap">
          <span className="text-ink/60">حاضرات: {attStudents.length - todayCount('absent') - todayCount('late') - todayCount('excused')}</span>
          <span className="text-red-500">غائبات: {todayCount('absent')}</span>
          <span className="text-gold-deep">متأخرات: {todayCount('late')}</span>
          <span className="text-sage-deep">استئذان: {todayCount('excused')}</span>
        </div>
      </div>

      {attStudents.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/50">لا متعلمات في هذا الفصل.</div>
      ) : (
        attStudents.map((s) => {
          const rec = recOf(s.id);
          const cur = rec?.status || 'present';
          const g = monthCount(s.id, 'absent');
          const t = monthCount(s.id, 'late');
          return (
            <div key={s.id} className="card-3d bg-white rounded-xl p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1">
                  <div className="font-bold text-ink text-[14px]">{s.name}</div>
                  {g || t ? <div className="text-[10.5px] text-ink/45">الشهر: غياب {g} · تأخير {t}</div> : null}
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {ATT_STATES.map((a) => (
                  <button
                    key={a.k}
                    onClick={() => canManage && setAttStatus(s.id, a.k)}
                    disabled={!canManage}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-bold border ${cur === a.k ? a.cls + ' border-transparent' : 'bg-white text-ink/60 border-sage/20'}`}
                  >
                    {a.l}
                  </button>
                ))}
                {cur === 'late' ? (
                  <input
                    defaultValue={rec?.arrived_at || ''}
                    onBlur={(e) => setAttStatus(s.id, 'late', e.target.value.trim() || null)}
                    placeholder="8:12"
                    className="w-16 rounded-lg border border-gold/40 text-[12px] p-1 text-center"
                    dir="ltr"
                    title="وقت الوصول"
                  />
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ───────────────────────── الصفوف والمتعلمات ───────────────────────── */
function StudentsView({
  stages,
  grades,
  classes,
  openClass,
  students,
  canManage,
  onBack,
  onOpenClass,
  addStudent,
  updateStudent,
  moveStudent,
  delStudent,
  importStudents,
}: {
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  openClass: Klass | null;
  students: Student[];
  canManage: boolean;
  onBack: () => void;
  onOpenClass: (c: Klass) => void;
  addStudent: (name: string, sidNo: string) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  moveStudent: (id: string, toClassId: string) => void;
  delStudent: (id: string) => void;
  importStudents: (names: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [nm, setNm] = useState('');
  const [sid, setSid] = useState('');

  // اختيار فصل
  if (!openClass) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
          <div className="font-extrabold text-sage-deep flex-1">الصفوف والمتعلمات</div>
        </div>
        {classes.length === 0 ? (
          <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60">أضيفي الهيكل (مراحل/صفوف/فصول) أولًا من «الهيكل المدرسي».</div>
        ) : (
          stages.map((st) => (
            <div key={st.id} className="card-3d bg-white rounded-2xl p-3">
              <div className="font-extrabold text-sage-deep mb-2">{st.name}</div>
              {grades.filter((g) => g.stage_id === st.id).map((g) => (
                <div key={g.id} className="mb-2">
                  <div className="text-[12px] font-bold text-ink/70 mb-1">{g.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {classes.filter((c) => c.grade_id === g.id).map((c) => (
                      <button key={c.id} onClick={() => onOpenClass(c)} className="rounded-lg bg-sage-light text-sage-deep text-[13px] font-bold px-3 py-1.5">
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    );
  }

  // قائمة متعلمات فصل
  const moveTargets = classes.filter((c) => c.id !== openClass.id);
  const shown = students.filter((s) => {
    const t = q.trim();
    return !t || s.name.includes(t) || (s.sid_no || '').includes(t);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ الفصول</button>
        <div className="font-extrabold text-sage-deep flex-1">الفصل {openClass.name} · {students.length} متعلمة</div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 ابحثي باسم أو رقم"
        className="w-full rounded-xl border border-sage/25 p-2.5 text-sm bg-white focus:outline-none focus:border-sage"
      />

      {canManage ? (
        <div className="flex gap-1.5">
          <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="اسم المتعلمة" className="flex-1 rounded-lg border border-sage/25 p-2 text-[13px] bg-white focus:outline-none focus:border-sage" />
          <input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="رقم (اختياري)" className="w-24 rounded-lg border border-sage/25 p-2 text-[13px] bg-white focus:outline-none focus:border-sage" />
          <button
            onClick={() => {
              if (nm.trim()) {
                addStudent(nm.trim(), sid.trim());
                setNm('');
                setSid('');
              }
            }}
            className="rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3"
          >
            ＋
          </button>
        </div>
      ) : null}

      {canManage ? <ImportNames what="طالبات" onAdd={importStudents} /> : null}

      {shown.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/50">{q ? 'لا نتائج' : 'لا متعلمات بعد.'}</div>
      ) : (
        shown.map((s) => (
          <div key={s.id} className={`card-3d bg-white rounded-xl p-3 flex items-center gap-2 ${s.archived ? 'opacity-60' : ''}`}>
            <div className="flex-1">
              <div className={`font-bold text-ink text-[14px] ${s.archived ? 'line-through' : ''}`}>{s.name}</div>
              <div className="text-[11.5px] text-ink/50">
                {s.sid_no ? `رقم ${s.sid_no}` : ''}
                {s.note ? ` · ${s.note}` : ''}
                {s.archived ? ' · موقوفة' : ''}
              </div>
            </div>
            {canManage ? (
              <>
                <button
                  onClick={() => {
                    const name = window.prompt('اسم المتعلمة', s.name);
                    if (name === null) return;
                    const sidNo = window.prompt('الرقم (اختياري)', s.sid_no || '') ?? '';
                    const note = window.prompt('ملاحظة إدارية (اختياري)', s.note || '') ?? '';
                    updateStudent(s.id, { name: name.trim() || s.name, sid_no: sidNo.trim() || null, note: note.trim() || null });
                  }}
                  aria-label="تعديل"
                  className="text-ink/40 hover:text-sage-deep text-sm px-1"
                >
                  ✏️
                </button>
                {moveTargets.length ? (
                  <select
                    value=""
                    onChange={(e) => e.target.value && moveStudent(s.id, e.target.value)}
                    className="rounded-lg border border-sage/25 bg-white text-[11px] p-1"
                    title="نقل لفصل آخر"
                  >
                    <option value="">نقل ↦</option>
                    {moveTargets.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : null}
                <button onClick={() => updateStudent(s.id, { archived: !s.archived })} aria-label="أرشفة" className="text-ink/40 hover:text-gold-deep text-sm px-1">
                  {s.archived ? '↩️' : '⏸'}
                </button>
                <button onClick={() => delStudent(s.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
              </>
            ) : null}
          </div>
        ))
      )}
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
