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

type School = { id: string; name: string; academic_year: string | null; term: string | null; work_days: number[]; timetable_status?: string | null };
type Stage = { id: string; name: string; sort: number };
type Grade = { id: string; stage_id: string; name: string; sort: number };
type Klass = { id: string; grade_id: string; name: string; sort: number; archived: boolean };
type Dept = { id: string; name: string; head_member_id: string | null; sort: number; block?: boolean; lab_weekly?: number; lab_capacity?: number };
type Member = { id: string; user_id: string | null; name: string | null; role: string; department_id: string | null; note?: string | null; block_off?: boolean };
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
type Supervision = { id: string; member_id: string; scope_type: 'stage' | 'grade' | 'class'; scope_id: string; note: string | null };
type Note = { id: string; author_id: string | null; target_type: 'student' | 'member'; target_id: string; target_name: string | null; category: string | null; body: string; created_at: string };
type Perm = { id: string; user_id: string; module: string; action: string; scope_type: string; scope_id: string | null };
type GItem = { id: string; member_id: string; subject_id: string; class_id: string; name: string; max_score: number; sort: number };
type GScore = { id: string; item_id: string; student_id: string; score: number | null };
type PAtt = { id: string; date: string; period_id: string; class_id: string; student_id: string; status: string };

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
  { key: 'smart', label: 'إنشاء الجدول الذكي', emoji: '✨' },
  { key: 'substitution', label: 'الاحتياط', emoji: '🔄' },
  { key: 'duty', label: 'المناوبات', emoji: '📍' },
  { key: 'attendance', label: 'حضور المتعلمات', emoji: '✅' },
  { key: 'staff', label: 'دوام الهيئة التعليمية', emoji: '🗓️' },
  { key: 'reports', label: 'التقارير', emoji: '📄' },
  { key: 'supervision', label: 'الإشراف الإداري', emoji: '👩🏻‍💼' },
  { key: 'notes', label: 'رصد الملاحظات', emoji: '📝' },
  { key: 'grades', label: 'سجل الدرجات', emoji: '📊' },
  { key: 'smartatt', label: 'الحضور الذكي', emoji: '📋' },
  { key: 'permissions', label: 'المستخدمون والصلاحيات', emoji: '🔐' },
];

type SchoolRow = { id: string; name: string; subscription_until: string | null; role: string };

const subActive = (until: string | null) => !!until && new Date(until) > new Date();

/**
 * محرّك جدولة قائم على القيود (Constraint-based) — يوزّع الحصص المطلوبة على
 * (يوم × حصة) بحيث: لا معلمة في مكانين، ولا فصل بحصتين، وكل نصاب يُوضع.
 * تفضيل مرن: توزيع حصص المادة الواحدة على أيام مختلفة. جشِع + إعادات عشوائية،
 * ويعيد ما تعذّر وضعه ليُعرض في تقرير الفحص.
 */
type SolveTask = { member_id: string; subject_id: string; class_id: string; isLab?: boolean; group?: string };
type SolveCons = {
  offDay: Set<string>;
  noSlot: Set<string>;
  avoidLast: Set<string>;
  lastPid: string | null;
  subjectDept?: Map<string, string>;   // subject_id → dept_id
  labWeekly?: Map<string, number>;     // dept_id → حصص مختبر/أسبوع لكل توزيع
  labCapacity?: Map<string, number>;   // dept_id → عدد المختبرات (سقف متزامن)
  blockDepts?: Set<string>;            // أقسام مفعّل فيها البلوك
  blockOff?: Set<string>;              // معلمات مستثناة من البلوك
};
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function solveTimetable(
  teaching: { member_id: string; subject_id: string; class_id: string; weekly_hours: number }[],
  lessonPeriodIds: string[],
  workDays: number[],
  cons?: SolveCons
): { placements: (SolveTask & { day: number; period_id: string })[]; unplaced: SolveTask[] } {
  const c = cons || { offDay: new Set<string>(), noSlot: new Set<string>(), avoidLast: new Set<string>(), lastPid: null };
  const subjectDept = c.subjectDept || new Map<string, string>();
  const labWeekly = c.labWeekly || new Map<string, number>();
  const labCapacity = c.labCapacity || new Map<string, number>();
  const blockDepts = c.blockDepts || new Set<string>();
  const blockOff = c.blockOff || new Set<string>();
  const slots: { day: number; pid: string }[] = [];
  for (const d of workDays) for (const pid of lessonPeriodIds) slots.push({ day: d, pid });
  const deptOf = (t: SolveTask) => subjectDept.get(t.subject_id) || null;
  const key = (d: number, p: string) => `${d}|${p}`;

  // بناء المهام مع وسم حصص المختبر ومجموعات البلوك
  const rawTasks: SolveTask[] = [];
  for (const t of teaching) {
    const dept = subjectDept.get(t.subject_id) || null;
    const labW = dept ? labWeekly.get(dept) || 0 : 0;
    const useBlock = dept ? blockDepts.has(dept) && !blockOff.has(t.member_id) : false;
    const hrs = Math.max(0, t.weekly_hours);
    const grp = useBlock && hrs >= 2 ? `${t.member_id}|${t.subject_id}|${t.class_id}` : undefined;
    for (let i = 0; i < hrs; i++) rawTasks.push({ member_id: t.member_id, subject_id: t.subject_id, class_id: t.class_id, isLab: i < labW, group: grp });
  }
  const groupMap = new Map<string, SolveTask[]>();
  const singles: SolveTask[] = [];
  for (const t of rawTasks) {
    if (t.group) { const a = groupMap.get(t.group) || []; a.push(t); groupMap.set(t.group, a); }
    else singles.push(t);
  }
  const groups = Array.from(groupMap.values());
  const load: Record<string, number> = {};
  for (const t of singles) load[t.member_id] = (load[t.member_id] || 0) + 1;
  const baseSingles = singles.slice().sort((a, b) => (load[b.member_id] || 0) - (load[a.member_id] || 0));

  const attempt = (grpOrder: SolveTask[][], singleOrder: SolveTask[]) => {
    const tBusy = new Map<string, Set<string>>();
    const cBusy = new Map<string, Set<string>>();
    const csDays = new Map<string, Set<number>>();
    const labCount = new Map<string, number>();
    const placements: (SolveTask & { day: number; period_id: string })[] = [];
    const unplaced: SolveTask[] = [];
    const free = (t: SolveTask, d: number, pid: string) => {
      if (tBusy.get(t.member_id)?.has(key(d, pid))) return false;
      if (cBusy.get(t.class_id)?.has(key(d, pid))) return false;
      if (c.offDay.has(`${t.member_id}|${d}`)) return false;
      if (c.noSlot.has(`${t.member_id}|${pid}`)) return false;
      if (t.isLab) { const dp = deptOf(t); const cap = dp ? labCapacity.get(dp) || 0 : 0; if (cap > 0 && (labCount.get(`${dp}|${key(d, pid)}`) || 0) >= cap) return false; }
      return true;
    };
    const place = (t: SolveTask, d: number, pid: string) => {
      let tb = tBusy.get(t.member_id); if (!tb) { tb = new Set(); tBusy.set(t.member_id, tb); } tb.add(key(d, pid));
      let cb = cBusy.get(t.class_id); if (!cb) { cb = new Set(); cBusy.set(t.class_id, cb); } cb.add(key(d, pid));
      const csKey = `${t.class_id}|${t.subject_id}`; let ud = csDays.get(csKey); if (!ud) { ud = new Set(); csDays.set(csKey, ud); } ud.add(d);
      if (t.isLab) { const dp = deptOf(t); if (dp && (labCapacity.get(dp) || 0) > 0) { const k = `${dp}|${key(d, pid)}`; labCount.set(k, (labCount.get(k) || 0) + 1); } }
      placements.push({ member_id: t.member_id, subject_id: t.subject_id, class_id: t.class_id, day: d, period_id: pid });
    };

    // 1) مجموعات البلوك: حصص متلاصقة على نفس اليوم
    const leftover: SolveTask[] = [];
    for (const g of grpOrder) {
      const n = g.length;
      let placed = false;
      for (const d of shuffle(workDays.slice())) {
        for (let start = 0; start + n <= lessonPeriodIds.length; start++) {
          let ok = true;
          for (let i = 0; i < n; i++) if (!free(g[i], d, lessonPeriodIds[start + i])) { ok = false; break; }
          if (ok) { for (let i = 0; i < n; i++) place(g[i], d, lessonPeriodIds[start + i]); placed = true; break; }
        }
        if (placed) break;
      }
      if (!placed) leftover.push(...g); // تعذّر التلاصق → توضع فرادى
    }

    // 2) الحصص الفردية + بقايا البلوك
    for (const t of [...leftover, ...singleOrder]) {
      const usedDays = csDays.get(`${t.class_id}|${t.subject_id}`) || new Set<number>();
      const avoidLast = c.avoidLast.has(t.subject_id) && c.lastPid;
      const cands = slots.filter((s) => free(t, s.day, s.pid));
      cands.sort((a, b) => {
        const pa = (usedDays.has(a.day) ? 1 : 0) + (avoidLast && a.pid === c.lastPid ? 2 : 0);
        const pb = (usedDays.has(b.day) ? 1 : 0) + (avoidLast && b.pid === c.lastPid ? 2 : 0);
        return pa - pb;
      });
      if (cands.length) place(t, cands[0].day, cands[0].pid);
      else unplaced.push(t);
    }
    return { placements, unplaced };
  };

  let best = attempt(groups, baseSingles);
  for (let r = 0; r < 80 && best.unplaced.length; r++) {
    const res = attempt(shuffle(groups.slice()), shuffle(baseSingles.slice()));
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

/** تطبيع الاسم لكشف التكرار: مسافات، وحروف عربية متشابهة، وتشكيل. */
const normName = (s: string | null | undefined): string =>
  (s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[ً-ْ]/g, '');

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
    im.onerror = () => rej(new Error('تعذّر فتح الصورة. لو الصورة من الآيفون (صيغة HEIC)، حوّليها إلى JPG أو خذي لها لقطة شاشة ثم ارفعيها.'));
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
  let res: Response;
  try {
    res = await fetch('/api/school/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: 1500 }) });
  } catch {
    throw new Error('تعذّر الاتصال بالخدمة (تحقّقي من الإنترنت).');
  }
  const raw = await res.text();
  let json: { error?: { message?: string }; content?: { type?: string; text?: string }[] } = {};
  try { json = JSON.parse(raw); } catch { /* غير JSON */ }
  if (!res.ok) throw new Error(`(${res.status}) ${json?.error?.message || raw.slice(0, 160) || 'خطأ من الخدمة'}`);
  // نلتقط مقاطع النص فقط (نتجاهل مقطع «التفكير» thinking الذي يأتي أولًا)
  const text: string = (json?.content || []).filter((b) => b?.type === 'text' && b?.text).map((b) => b.text).join('\n') || '';
  const names = text
    .split('\n')
    .map((s) => s.replace(/^[\s\d\-.،_)(]+/, '').trim())
    .filter((s) => s && s.length <= 60);
  if (!names.length) throw new Error(`لم تُقرأ أسماء. رد الخدمة: «${(text || raw).slice(0, 180) || 'فارغ'}»`);
  return names;
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

export default function SchoolApp({ firstName, isAdmin, uid }: { firstName: string; isAdmin: boolean; uid: string }) {
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
  const [supervisions, setSupervisions] = useState<Supervision[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [permissions, setPermissions] = useState<Perm[]>([]);
  const [gradeItems, setGradeItems] = useState<GItem[]>([]);
  const [gradeScores, setGradeScores] = useState<GScore[]>([]);
  const [periodAtt, setPeriodAtt] = useState<PAtt[]>([]);
  const [genReport, setGenReport] = useState<{ placed: number; unplaced: SolveTask[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'dash' | 'structure' | 'departments' | 'students' | 'teaching' | 'timetable' | 'attendance' | 'staff' | 'substitution' | 'duty' | 'supervision' | 'notes' | 'grades' | 'smartatt' | 'permissions' | 'reports'>('dash');
  const [toast, setToast] = useState('');

  const canManage = isAdmin || myRole === 'admin' || myRole === 'principal' || myRole === 'deputy';
  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2600);
  };

  // ── وضع المشرفة: نطاق إشراف المستخدمة الحالية (غير الإدارة) ────
  const myMember = members.find((m) => m.user_id === uid) || null;
  const myScope = myMember ? supervisions.filter((s) => s.member_id === myMember.id) : [];
  const isSupervisor = !canManage && myScope.length > 0;
  const scopeClassIds = new Set<string>();
  if (isSupervisor) {
    for (const sv of myScope) {
      if (sv.scope_type === 'class') scopeClassIds.add(sv.scope_id);
      else if (sv.scope_type === 'grade') classes.filter((c) => c.grade_id === sv.scope_id).forEach((c) => scopeClassIds.add(c.id));
      else if (sv.scope_type === 'stage') {
        const gids = new Set(grades.filter((g) => g.stage_id === sv.scope_id).map((g) => g.id));
        classes.filter((c) => gids.has(c.grade_id)).forEach((c) => scopeClassIds.add(c.id));
      }
    }
  }
  const scClasses = isSupervisor ? classes.filter((c) => scopeClassIds.has(c.id)) : classes;
  const scGradeIds = new Set(scClasses.map((c) => c.grade_id));
  const scGrades = isSupervisor ? grades.filter((g) => scGradeIds.has(g.id)) : grades;
  // معلمات نطاق المشرفة = من يُدرِّسن في فصولها (للمتابعة)
  const scopeMemberIds = new Set<string>();
  if (isSupervisor) teaching.filter((t) => scopeClassIds.has(t.class_id)).forEach((t) => scopeMemberIds.add(t.member_id));
  const scopeMembers = isSupervisor ? members.filter((m) => scopeMemberIds.has(m.id)) : members;

  // ── وضع صاحبة الصلاحيات (غير الإدارة وغير المشرفة، لها صلاحيات ممنوحة) ──
  const myPerms = permissions.filter((p) => p.user_id === uid);
  const permManage = (mod: string) => canManage || myPerms.some((p) => p.module === mod && ['add', 'edit', 'delete', 'approve'].includes(p.action));

  // ── وضع منسقة المادة (رئيسة شعبة): تدير توزيع مواد شعبتها ──────
  const myHeadDepts = myMember ? depts.filter((d) => d.head_member_id === myMember.id) : [];
  const isCoordinator = !canManage && !isSupervisor && !!myMember?.user_id && myHeadDepts.length > 0;
  const coordDeptIds = new Set(myHeadDepts.map((d) => d.id));
  const coordSubjects = subjects.filter((s) => s.department_id && coordDeptIds.has(s.department_id));
  const coordSubjectIds = new Set(coordSubjects.map((s) => s.id));
  const coordTeaching = teaching.filter((t) => coordSubjectIds.has(t.subject_id));
  // خريطة الوحدة ← بطاقة القسم (الوحدات المدعومة بصلاحية دقيقة: الهيكل/الطالبات/الحضور)
  const MOD_KEY: Record<string, string> = { structure: 'structure', students: 'students', attendance: 'attendance', grades: 'grades' };
  const teachesAny = !!myMember && teaching.some((t) => t.member_id === myMember.id);
  let allowedKeys = canManage ? null : Array.from(new Set(myPerms.map((p) => MOD_KEY[p.module]).filter(Boolean)));
  if (allowedKeys && teachesAny) {
    if (!allowedKeys.includes('grades')) allowedKeys = [...allowedKeys, 'grades'];
    if (!allowedKeys.includes('smartatt')) allowedKeys = [...allowedKeys, 'smartatt'];
  }
  // نطاق الحضور للعارضة: مشرفة=نطاقها · معلمة=فصولها · غيرها=الكل
  const taughtClassIds = new Set(teachesAny ? teaching.filter((t) => t.member_id === myMember!.id).map((t) => t.class_id) : []);
  const teacherOnly = !canManage && !isSupervisor && teachesAny;
  const attClasses = isSupervisor ? scClasses : teacherOnly ? classes.filter((c) => taughtClassIds.has(c.id)) : classes;
  const attGradeIds = new Set(attClasses.map((c) => c.grade_id));
  const attGrades = isSupervisor || teacherOnly ? grades.filter((g) => attGradeIds.has(g.id)) : grades;
  const attStageIds = new Set(attGrades.map((g) => g.stage_id));
  const attStages = isSupervisor || teacherOnly ? stages.filter((s) => attStageIds.has(s.id)) : stages;

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
      const [dp, mb, su, tc, pd, en, dl, du, sv, nt, pm, gi, gs] = await Promise.all([
        supabase.from('school_departments').select('id,name,head_member_id,sort,block,lab_weekly,lab_capacity').eq('school_id', sid).order('sort'),
        supabase.rpc('school_members_of', { p_school: sid }),
        supabase.from('school_subjects').select('id,name,department_id,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_teaching').select('id,member_id,subject_id,class_id,weekly_hours').eq('school_id', sid),
        supabase.from('school_periods').select('id,name,kind,start_time,end_time,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_timetable_entries').select('id,day,period_id,class_id,member_id,subject_id').eq('school_id', sid),
        supabase.from('school_duty_locations').select('id,name,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_duties').select('id,day,period_id,location_id,member_id').eq('school_id', sid),
        supabase.from('school_supervisions').select('id,member_id,scope_type,scope_id,note').eq('school_id', sid).order('created_at'),
        supabase.from('school_notes').select('id,author_id,target_type,target_id,target_name,category,body,created_at').eq('school_id', sid).order('created_at', { ascending: false }),
        supabase.from('school_permissions').select('id,user_id,module,action,scope_type,scope_id').eq('school_id', sid),
        supabase.from('school_grade_items').select('id,member_id,subject_id,class_id,name,max_score,sort').eq('school_id', sid).order('sort'),
        supabase.from('school_grade_scores').select('id,item_id,student_id,score').eq('school_id', sid),
      ]);
      // احتياط: لو أعمدة قيود الجدولة غير موجودة بعد (لم يُشغَّل ملف SQL) نُعيد الجلب بالأعمدة الأساسية حتى لا تختفي الشُّعب
      let deptData = dp.data as Dept[] | null;
      if (dp.error) {
        const base = await supabase.from('school_departments').select('id,name,head_member_id,sort').eq('school_id', sid).order('sort');
        deptData = base.data as Dept[] | null;
      }
      setDepts(deptData || []);
      setMembers((mb.data as Member[]) || []);
      setSubjects((su.data as Subject[]) || []);
      setTeaching((tc.data as Teaching[]) || []);
      setPeriods((pd.data as Period[]) || []);
      setEntries((en.data as Entry[]) || []);
      setDutyLocs((dl.data as DutyLoc[]) || []);
      setDuties((du.data as Duty[]) || []);
      setSupervisions((sv.data as Supervision[]) || []);
      setNotes((nt.data as Note[]) || []);
      setPermissions((pm.data as Perm[]) || []);
      setGradeItems((gi.data as GItem[]) || []);
      setGradeScores((gs.data as GScore[]) || []);
    },
    [supabase]
  );

  const load = useCallback(
    async (sid: string) => {
      setLoading(true);
      const [s, st, gr, cl] = await Promise.all([
        supabase.from('schools').select('id,name,academic_year,term,work_days,timetable_status').eq('id', sid).maybeSingle(),
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
    if (sib.some((c) => normName(c.name) === normName(name))) return showToast(`«${name.trim()}» موجود مسبقًا في هذا الصف`);
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
  const updateDept = async (deptId: string, patch: Partial<Dept>) => {
    const { error } = await supabase.from('school_departments').update(patch).eq('id', deptId);
    if (error) return showToast('تعذّر الحفظ');
    setDepts((d) => d.map((x) => (x.id === deptId ? { ...x, ...patch } : x)));
  };
  const setMemberBlockOff = async (memberId: string, val: boolean) => {
    const { error } = await supabase.from('school_members').update({ block_off: val }).eq('id', memberId);
    if (error) return showToast('تعذّر الحفظ');
    setMembers((m) => m.map((x) => (x.id === memberId ? { ...x, block_off: val } : x)));
  };
  const addMember = async (name: string, role: string, deptId: string | null) => {
    if (members.some((m) => normName(m.name) === normName(name))) return showToast(`«${name.trim()}» موجودة مسبقًا`);
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
    const existing = new Set(members.map((m) => normName(m.name)));
    const seen = new Set<string>();
    const fresh = names.filter((n) => { const k = normName(n); if (!k || existing.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    const skipped = names.length - fresh.length;
    if (!fresh.length) return showToast(skipped ? `الكل موجود مسبقًا (${skipped}) — لم يُضَف شيء` : 'لا أسماء');
    const rows = fresh.map((n) => ({ school_id: schoolId, member_name: n, role: 'teacher', department_id: deptId }));
    const { error } = await supabase.from('school_members').insert(rows);
    if (error) return showToast('تعذّر الاستيراد');
    showToast(`أُضيفت ${fresh.length} معلمة ✅${skipped ? ` · تجاهلت ${skipped} مكرّرة` : ''}`);
    if (schoolId) loadMembersDepts(schoolId);
  };
  // ── ربط عضو بحساب (ليدخل بنفسه) ───────────────────────────────
  const linkMember = async (memberId: string, identifier: string) => {
    const { data, error } = await supabase.rpc('school_link_member', { p_member: memberId, p_identifier: identifier });
    const res = Array.isArray(data) ? data[0] : data;
    if (error || !res) return showToast('تعذّرت العملية');
    if (!res.ok) return showToast(res.msg || 'تعذّر الربط');
    showToast(`تم ربط الحساب: ${res.linked_name} 🔗`);
    if (schoolId) loadMembersDepts(schoolId);
  };
  const unlinkMember = async (memberId: string) => {
    if (!window.confirm('فكّ ربط الحساب؟ (يبقى العضو بالاسم فقط)')) return;
    const { data, error } = await supabase.rpc('school_unlink_member', { p_member: memberId });
    if (error || !data) return showToast('تعذّرت العملية');
    showToast('تم فكّ الربط');
    if (schoolId) loadMembersDepts(schoolId);
  };
  const updateMemberNote = async (memberId: string, note: string) => {
    const { error } = await supabase.from('school_members').update({ note: note.trim() || null }).eq('id', memberId);
    if (error) return showToast('تعذّر حفظ الملاحظة');
    setMembers((m) => m.map((x) => (x.id === memberId ? { ...x, note: note.trim() || null } : x)));
    showToast('تم حفظ الملاحظة ✅');
  };

  // ── الأدوار والصلاحيات ────────────────────────────────────────
  const PRESET_PERMS: Record<string, [string, string][]> = {
    student_affairs: [
      ['students', 'view'], ['students', 'add'], ['students', 'edit'],
      ['attendance', 'view'], ['attendance', 'add'], ['attendance', 'edit'],
    ],
  };
  const applyPreset = async (member: Member, preset: 'deputy' | 'student_affairs' | 'teacher') => {
    if (!member.user_id) return showToast('اربطي حساب المعلمة أولًا 🔗');
    const role = preset === 'deputy' ? 'deputy' : preset === 'student_affairs' ? 'student_affairs' : 'teacher';
    const { error: re } = await supabase.from('school_members').update({ role }).eq('id', member.id);
    if (re) return showToast('تعذّر تطبيق الدور');
    await supabase.from('school_permissions').delete().eq('school_id', schoolId).eq('user_id', member.user_id);
    const set = PRESET_PERMS[preset] || [];
    if (set.length) {
      const rows = set.map(([m, a]) => ({ school_id: schoolId, user_id: member.user_id, module: m, action: a, scope_type: 'school', scope_id: null }));
      const { error } = await supabase.from('school_permissions').insert(rows);
      if (error) return showToast('تعذّر تطبيق الصلاحيات');
    }
    showToast('تم تطبيق الدور ✅');
    if (schoolId) loadMembersDepts(schoolId);
  };
  const addPerm = async (userId: string, module: string, action: string, scopeType: string, scopeId: string | null) => {
    const { data, error } = await supabase
      .from('school_permissions')
      .insert({ school_id: schoolId, user_id: userId, module, action, scope_type: scopeType, scope_id: scopeType === 'school' ? null : scopeId })
      .select('id,user_id,module,action,scope_type,scope_id')
      .single();
    if (error || !data) return showToast('تعذّرت الإضافة');
    setPermissions((p) => [...p, data as Perm]);
    showToast('تمت الإضافة ✅');
  };
  const delPerm = async (id: string) => {
    const { error } = await supabase.from('school_permissions').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setPermissions((p) => p.filter((x) => x.id !== id));
  };

  // ── سجل الدرجات ───────────────────────────────────────────────
  const addGradeItem = async (memberId: string, subjectId: string, classId: string, name: string, maxScore: number) => {
    const sort = gradeItems.filter((x) => x.member_id === memberId && x.subject_id === subjectId && x.class_id === classId).length + 1;
    const { data, error } = await supabase
      .from('school_grade_items')
      .insert({ school_id: schoolId, member_id: memberId, subject_id: subjectId, class_id: classId, name, max_score: maxScore, sort })
      .select('id,member_id,subject_id,class_id,name,max_score,sort')
      .single();
    if (error || !data) return showToast('تعذّرت إضافة التقييم');
    setGradeItems((g) => [...g, data as GItem]);
    showToast('تمت الإضافة ✅');
  };
  const delGradeItem = async (id: string) => {
    if (!window.confirm('حذف التقييم ودرجاته؟')) return;
    const { error } = await supabase.from('school_grade_items').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setGradeItems((g) => g.filter((x) => x.id !== id));
    setGradeScores((s) => s.filter((x) => x.item_id !== id));
  };
  const setScore = async (itemId: string, studentId: string, score: number | null) => {
    const { data, error } = await supabase
      .from('school_grade_scores')
      .upsert({ school_id: schoolId, item_id: itemId, student_id: studentId, score }, { onConflict: 'item_id,student_id' })
      .select('id,item_id,student_id,score')
      .single();
    if (error || !data) return showToast('تعذّر حفظ الدرجة');
    setGradeScores((s) => {
      const rest = s.filter((x) => !(x.item_id === itemId && x.student_id === studentId));
      return [...rest, data as GScore];
    });
  };

  // ── الحضور الذكي بالحصص (تحميل عند الطلب) ─────────────────────
  const loadPeriodByClassDate = async (classId: string, date: string) => {
    const { data } = await supabase.from('school_period_attendance').select('id,date,period_id,class_id,student_id,status').eq('school_id', schoolId).eq('class_id', classId).eq('date', date);
    setPeriodAtt((data as PAtt[]) || []);
  };
  const loadPeriodByStudent = async (studentId: string) => {
    const { data } = await supabase.from('school_period_attendance').select('id,date,period_id,class_id,student_id,status').eq('school_id', schoolId).eq('student_id', studentId).order('date', { ascending: false });
    setPeriodAtt((data as PAtt[]) || []);
  };
  const loadPeriodByClassRange = async (classId: string, from: string, to: string) => {
    const { data } = await supabase.from('school_period_attendance').select('id,date,period_id,class_id,student_id,status').eq('school_id', schoolId).eq('class_id', classId).gte('date', from).lte('date', to);
    setPeriodAtt((data as PAtt[]) || []);
  };
  const setPeriodStatus = async (date: string, periodId: string, classId: string, studentId: string, status: string | null) => {
    if (!status) {
      const { error } = await supabase.from('school_period_attendance').delete().eq('school_id', schoolId).eq('date', date).eq('period_id', periodId).eq('student_id', studentId);
      if (error) return showToast('تعذّر الحذف');
      setPeriodAtt((a) => a.filter((x) => !(x.date === date && x.period_id === periodId && x.student_id === studentId)));
      return;
    }
    const { data, error } = await supabase
      .from('school_period_attendance')
      .upsert({ school_id: schoolId, date, period_id: periodId, class_id: classId, student_id: studentId, status, recorded_by: myMember?.id ?? null }, { onConflict: 'student_id,date,period_id' })
      .select('id,date,period_id,class_id,student_id,status')
      .single();
    if (error || !data) return showToast('تعذّر الحفظ');
    setPeriodAtt((a) => { const rest = a.filter((x) => !(x.date === date && x.period_id === periodId && x.student_id === studentId)); return [...rest, data as PAtt]; });
  };

  // ── المتعلمات ─────────────────────────────────────────────────
  const openClassStudents = async (cls: Klass) => {
    setOpenClass(cls);
    const { data } = await supabase.from('school_students').select('id,class_id,name,sid_no,note,archived,sort').eq('class_id', cls.id).order('sort');
    setStudents((data as Student[]) || []);
  };
  const addStudent = async (name: string, sidNo: string) => {
    if (!openClass) return;
    if (students.some((s) => normName(s.name) === normName(name))) return showToast(`«${name.trim()}» موجودة مسبقًا في هذا الفصل`);
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
    const existing = new Set(students.map((s) => normName(s.name)));
    const seen = new Set<string>();
    const fresh = names.filter((n) => { const k = normName(n); if (!k || existing.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    const skipped = names.length - fresh.length;
    if (!fresh.length) return showToast(skipped ? `الكل موجود مسبقًا (${skipped}) — لم يُضَف شيء` : 'لا أسماء');
    const base = students.length;
    const rows = fresh.map((n, i) => ({ school_id: schoolId, class_id: openClass.id, name: n, sort: base + i + 1 }));
    const { data, error } = await supabase.from('school_students').insert(rows).select('id,class_id,name,sid_no,note,archived,sort');
    if (error || !data) return showToast('تعذّر الاستيراد');
    setStudents((s) => [...s, ...(data as Student[])]);
    showToast(`أُضيفت ${data.length} متعلمة ✅${skipped ? ` · تجاهلت ${skipped} مكرّرة` : ''}`);
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
  const setTimetableStatus = async (status: string) => {
    const { error } = await supabase.from('schools').update({ timetable_status: status }).eq('id', schoolId);
    if (error) return showToast('تعذّر التحديث');
    setSchool((s) => (s ? { ...s, timetable_status: status } : s));
    showToast(status === 'approved' ? 'تم اعتماد الجدول ✅' : 'رجع مسودة');
  };

  // ── التوليد التلقائي (محرّك القيود) ───────────────────────────
  const generateTimetable = async (rules: Rule[] = []) => {
    if (!schoolId) return;
    const lessonPids = periods.filter((p) => p.kind === 'lesson').sort((a, b) => a.sort - b.sort).map((p) => p.id);
    const wd = school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4];
    if (!teaching.length || !lessonPids.length) return showToast('أضيفي توزيعًا وحصصًا أولًا');
    if (!window.confirm('توليد الجدول تلقائيًا؟ سيستبدل الجدول الحالي (مسودة).')) return;
    setGenerating(true);
    // ضمّ ملاحظات المعلمات كقيود (تُقرأ بنفس محلّل العربي)
    const noteText = members.filter((m) => m.note && m.note.trim()).map((m) => `${m.name} ${m.note}`).join('\n');
    const noteRules = noteText ? parseRules(noteText, members, subjects).rules : [];
    const allRules = [...rules, ...noteRules];
    // بناء القيود للمحرّك
    const offDay = new Set<string>();
    const noSlot = new Set<string>();
    const avoidLast = new Set<string>();
    for (const r of allRules) {
      if (r.kind === 'off_day') offDay.add(`${r.member_id}|${r.day}`);
      else if (r.kind === 'no_period') {
        const pid = lessonPids[r.periodIndex];
        if (pid) noSlot.add(`${r.member_id}|${pid}`);
      } else if (r.kind === 'avoid_last') avoidLast.add(r.subject_id);
    }
    // قيود القسم المنظّمة: البلوك + المختبرات
    const subjectDept = new Map<string, string>();
    for (const s of subjects) if (s.department_id) subjectDept.set(s.id, s.department_id);
    const labWeekly = new Map<string, number>();
    const labCapacity = new Map<string, number>();
    const blockDepts = new Set<string>();
    for (const d of depts) {
      if (d.block) blockDepts.add(d.id);
      if (d.lab_weekly && d.lab_weekly > 0) labWeekly.set(d.id, d.lab_weekly);
      if (d.lab_capacity && d.lab_capacity > 0) labCapacity.set(d.id, d.lab_capacity);
    }
    const blockOff = new Set(members.filter((m) => m.block_off).map((m) => m.id));
    const cons: SolveCons = { offDay, noSlot, avoidLast, lastPid: lessonPids[lessonPids.length - 1] || null, subjectDept, labWeekly, labCapacity, blockDepts, blockOff };
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

  // ── الإشراف الإداري ───────────────────────────────────────────
  const addSupervision = async (memberId: string, scopeType: 'stage' | 'grade' | 'class', scopeId: string) => {
    const { data, error } = await supabase
      .from('school_supervisions')
      .insert({ school_id: schoolId, member_id: memberId, scope_type: scopeType, scope_id: scopeId })
      .select('id,member_id,scope_type,scope_id,note')
      .single();
    if (error || !data) return showToast(/duplicate|unique/i.test(error?.message || '') ? '⚠️ هذا الإشراف مسجّل مسبقًا' : 'تعذّرت الإضافة');
    setSupervisions((s) => [...s, data as Supervision]);
    showToast('تم تعيين الإشراف ✅');
  };
  const delSupervision = async (id: string) => {
    const { error } = await supabase.from('school_supervisions').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setSupervisions((s) => s.filter((x) => x.id !== id));
  };

  // ── رصد الملاحظات ─────────────────────────────────────────────
  const addNote = async (targetType: 'student' | 'member', targetId: string, targetName: string, category: string, body: string) => {
    const { data, error } = await supabase
      .from('school_notes')
      .insert({ school_id: schoolId, author_id: uid, target_type: targetType, target_id: targetId, target_name: targetName || null, category: category || null, body })
      .select('id,author_id,target_type,target_id,target_name,category,body,created_at')
      .single();
    if (error || !data) return showToast('تعذّر حفظ الملاحظة');
    setNotes((n) => [data as Note, ...n]);
    showToast('تم حفظ الملاحظة ✅');
  };
  const delNote = async (id: string) => {
    if (!window.confirm('حذف الملاحظة؟')) return;
    const { error } = await supabase.from('school_notes').delete().eq('id', id);
    if (error) return showToast('تعذّر الحذف');
    setNotes((n) => n.filter((x) => x.id !== id));
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
          canManage={permManage('structure')}
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
          linkMember={linkMember}
          unlinkMember={unlinkMember}
          updateMemberNote={updateMemberNote}
          updateDept={updateDept}
          setMemberBlockOff={setMemberBlockOff}
        />
      ) : view === 'students' ? (
        <StudentsView
          stages={stages}
          grades={grades}
          classes={classes}
          openClass={openClass}
          students={students}
          canManage={permManage('students')}
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
          subjects={isCoordinator ? coordSubjects : subjects}
          teaching={isCoordinator ? coordTeaching : teaching}
          members={members}
          grades={grades}
          classes={classes}
          canManage={isCoordinator ? true : canManage}
          subjectsManage={isCoordinator ? false : canManage}
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
          timetableStatus={school?.timetable_status || 'draft'}
          setTimetableStatus={setTimetableStatus}
        />
      ) : view === 'attendance' ? (
        <AttendanceView
          stages={attStages}
          grades={attGrades}
          classes={attClasses}
          attClass={attClass}
          attDate={attDate}
          attStudents={attStudents}
          attRecords={attRecords}
          canManage={isSupervisor || teacherOnly ? true : permManage('attendance')}
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
      ) : view === 'supervision' ? (
        <SupervisionView
          supervisions={supervisions}
          members={members}
          stages={stages}
          grades={grades}
          classes={classes}
          canManage={canManage}
          onBack={() => setView('dash')}
          addSupervision={addSupervision}
          delSupervision={delSupervision}
        />
      ) : view === 'notes' ? (
        <NotesView
          notes={notes}
          members={members}
          students={students}
          classes={scClasses}
          grades={scGrades}
          openClass={openClass}
          canManage={isSupervisor ? true : canManage}
          memberOptions={scopeMembers}
          onBack={() => setView('dash')}
          loadClassStudents={openClassStudents}
          addNote={addNote}
          delNote={delNote}
        />
      ) : view === 'grades' ? (
        <GradebookView
          teaching={teaching}
          members={members}
          subjects={subjects}
          classes={classes}
          grades={grades}
          students={students}
          openClass={openClass}
          gradeItems={gradeItems}
          gradeScores={gradeScores}
          myMemberId={myMember?.id || null}
          canManage={canManage}
          onBack={() => setView('dash')}
          onOpenClass={openClassStudents}
          addGradeItem={addGradeItem}
          delGradeItem={delGradeItem}
          setScore={setScore}
        />
      ) : view === 'smartatt' ? (
        <SmartAttendanceView
          entries={entries}
          periods={periods}
          classes={classes}
          grades={grades}
          members={members}
          subjects={subjects}
          students={students}
          openClass={openClass}
          periodAtt={periodAtt}
          myMemberId={myMember?.id || null}
          canManage={canManage}
          workDays={school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4]}
          onBack={() => setView('dash')}
          onOpenClass={openClassStudents}
          loadByClassDate={loadPeriodByClassDate}
          loadByStudent={loadPeriodByStudent}
          loadByClassRange={loadPeriodByClassRange}
          setPeriodStatus={setPeriodStatus}
        />
      ) : view === 'permissions' ? (
        <PermissionsView
          members={members}
          permissions={permissions}
          stages={stages}
          grades={grades}
          classes={classes}
          canManage={canManage}
          onBack={() => setView('dash')}
          applyPreset={applyPreset}
          addPerm={addPerm}
          delPerm={delPerm}
        />
      ) : view === 'reports' ? (
        <ReportsView
          school={school}
          entries={entries}
          periods={periods}
          members={members}
          subjects={subjects}
          classes={classes}
          grades={grades}
          duties={duties}
          dutyLocs={dutyLocs}
          onBack={() => setView('dash')}
        />
      ) : isSupervisor ? (
        <SupervisorHome
          name={myMember?.name || firstName}
          scope={myScope}
          stages={stages}
          grades={grades}
          classes={classes}
          onOpen={(k) => {
            if (k === 'attendance') {
              setAttClass(null);
              setView('attendance');
            } else if (k === 'notes') setView('notes');
            else if (k === 'duty') setView('duty');
          }}
        />
      ) : isCoordinator ? (
        <CoordinatorHome
          name={myMember?.name || firstName}
          depts={myHeadDepts}
          onOpen={() => setView('teaching')}
        />
      ) : (
        <Dashboard
          school={school}
          allowedKeys={allowedKeys}
          counts={{ stages: stages.length, grades: grades.length, classes: classes.length, depts: depts.length, members: members.length }}
          onOpen={(k) => {
            if (k === 'structure') setView('structure');
            else if (k === 'departments') setView('departments');
            else if (k === 'students') {
              setOpenClass(null);
              setView('students');
            } else if (k === 'teaching') setView('teaching');
            else if (k === 'timetable' || k === 'smart') setView('timetable');
            else if (k === 'supervision') setView('supervision');
            else if (k === 'notes') setView('notes');
            else if (k === 'grades') setView('grades');
            else if (k === 'smartatt') setView('smartatt');
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
            else if (k === 'reports') setView('reports');
            else if (k === 'permissions') setView('permissions');
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
  linkMember,
  unlinkMember,
  updateMemberNote,
  updateDept,
  setMemberBlockOff,
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
  linkMember: (memberId: string, identifier: string) => void;
  unlinkMember: (memberId: string) => void;
  updateMemberNote: (memberId: string, note: string) => void;
  updateDept: (deptId: string, patch: Partial<Dept>) => void;
  setMemberBlockOff: (memberId: string, val: boolean) => void;
}) {
  const [newDept, setNewDept] = useState('');
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const toggleDept = (id: string) => setOpenDepts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const noDept = members.filter((m) => !m.department_id).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

  const MemberRow = ({ m, roleText }: { m: Member; roleText?: string }) => (
    <div className="flex flex-col gap-0.5 py-1">
     <div className="flex items-center gap-2">
      <span className="w-6 text-center text-sage/40">•</span>
      <div className="flex-1 text-[13px] text-ink">
        {m.name || '—'} <span className="text-[11px] text-ink/45">({roleText || ROLE_LABEL[m.role] || m.role})</span>
        {m.user_id ? <span className="text-[10px] bg-sage/10 text-sage-deep rounded-full px-1.5 py-0.5 mr-1">🔗 حساب مربوط</span> : null}
      </div>
      {canManage ? (
        <>
          {depts.find((x) => x.id === m.department_id)?.block ? (
            <button
              onClick={() => setMemberBlockOff(m.id, !m.block_off)}
              title={m.block_off ? 'البلوك متوقف لهذه المعلمة — اضغطي لتفعيله' : 'البلوك مفعّل — اضغطي لإيقافه لهذه المعلمة'}
              className={`text-[10px] rounded-full px-1.5 py-0.5 border ${m.block_off ? 'bg-white text-ink/45 border-ink/20' : 'bg-sage/10 text-sage-deep border-transparent'}`}
            >
              {m.block_off ? 'بلوك ⛔' : 'بلوك ✓'}
            </button>
          ) : null}
          <button
            onClick={() => {
              const n = window.prompt(`ملاحظة/قيد جدول لـ«${m.name || 'المعلمة'}» (مثال: ما تأخذ الحصة الأولى):`, m.note || '');
              if (n !== null) updateMemberNote(m.id, n);
            }}
            aria-label="ملاحظة"
            title="ملاحظة/قيد جدول"
            className={`text-sm px-1 ${m.note ? 'text-gold-deep' : 'text-ink/35 hover:text-sage-deep'}`}
          >
            📝
          </button>
          {m.user_id ? (
            <button onClick={() => unlinkMember(m.id)} aria-label="فكّ الربط" title="فكّ ربط الحساب" className="text-ink/40 hover:text-ink/70 text-xs px-1">⛓️‍💥</button>
          ) : (
            <button
              onClick={() => {
                const id = window.prompt(`ربط «${m.name || 'العضو'}» بحساب — أدخلي اسم المستخدم أو رقم الهاتف:`);
                if (id && id.trim()) linkMember(m.id, id.trim());
              }}
              aria-label="ربط بحساب"
              title="ربط بحساب ليدخل بنفسه"
              className="text-sage-deep hover:text-sage text-xs px-1"
            >
              🔗
            </button>
          )}
          <button onClick={() => removeMember(m.id)} aria-label="إزالة" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
        </>
      ) : null}
     </div>
     {m.note ? <div className="text-[11px] text-gold-deep pr-8">📝 {m.note}</div> : null}
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
          const open = openDepts.has(d.id);
          return (
            <div key={d.id} className="card-3d bg-white rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleDept(d.id)} className="flex-1 flex items-center gap-2 text-right">
                  <span className="text-ink/40 text-[11px] w-3">{open ? '▼' : '▶'}</span>
                  <span className="font-extrabold text-sage-deep text-[14px]">{d.name}</span>
                  <span className="text-[10px] bg-sage/10 text-sage-deep rounded-full px-2 py-0.5">{mm.length} معلمة</span>
                </button>
                {canManage ? (
                  <>
                    <button onClick={() => { const n = window.prompt('اسم الشعبة', d.name); if (n && n.trim()) renameDept(d.id, n.trim()); }} aria-label="تعديل" className="text-sage-deep/60 hover:text-sage-deep text-sm px-1">✎</button>
                    <button onClick={() => delDept(d.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button>
                  </>
                ) : null}
              </div>
              {open ? (
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
                {canManage ? (
                  <div className="rounded-xl bg-sage/5 p-2.5 space-y-1.5">
                    <div className="text-[11px] font-bold text-sage-deep">إعدادات جدولة القسم</div>
                    <label className="flex items-center gap-1.5 text-[12px] text-ink cursor-pointer">
                      <input type="checkbox" checked={!!d.block} onChange={(e) => updateDept(d.id, { block: e.target.checked })} />
                      حصص المعلمة لنفس الصف متتالية (بلوك)
                    </label>
                    <div className="flex flex-wrap gap-3 text-[12px] text-ink">
                      <label className="flex items-center gap-1">حصص مختبر/أسبوع
                        <input type="number" min={0} value={d.lab_weekly || 0} onChange={(e) => updateDept(d.id, { lab_weekly: Math.max(0, +e.target.value || 0) })} className="w-14 rounded border border-sage/25 bg-white p-1 text-center" />
                      </label>
                      <label className="flex items-center gap-1">عدد المختبرات
                        <input type="number" min={0} value={d.lab_capacity || 0} onChange={(e) => updateDept(d.id, { lab_capacity: Math.max(0, +e.target.value || 0) })} className="w-14 rounded border border-sage/25 bg-white p-1 text-center" />
                      </label>
                    </div>
                    <div className="text-[10px] text-ink/45">المختبرات = ٠ يعني لا قيد. تُطبَّق عند توليد الجدول الذكي.</div>
                  </div>
                ) : null}
                <div>
                  <div className="text-[12px] font-bold text-sage-deep mb-1">المعلمات ({mm.length})</div>
                  {mm.length ? mm.map((m) => <MemberRow key={m.id} m={m} roleText={m.id === d.head_member_id ? 'رئيسة الشعبة' : undefined} />) : <div className="text-[12px] text-ink/35">— لا معلمات —</div>}
                </div>
                {canManage ? <AddInline placeholder="اسم المعلمة لإضافتها" onAdd={(v) => addMember(v, 'teacher', d.id)} /> : null}
                {canManage ? <ImportNames what="معلمات" onAdd={(names) => importMembers(names, d.id)} /> : null}
              </div>
              ) : null}
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
  timetableStatus,
  setTimetableStatus,
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
  timetableStatus: string;
  setTimetableStatus: (s: string) => void;
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
        <span className={`text-[11px] rounded-full px-2.5 py-1 font-bold ${timetableStatus === 'approved' ? 'bg-sage-deep text-white' : 'bg-gold/15 text-gold-deep'}`}>
          {timetableStatus === 'approved' ? '✓ معتمد' : 'مسودة'}
        </span>
        {canManage ? (
          <button
            onClick={() => setTimetableStatus(timetableStatus === 'approved' ? 'draft' : 'approved')}
            className={`rounded-lg text-[11.5px] font-bold px-3 py-1.5 ${timetableStatus === 'approved' ? 'border border-sage/25 text-sage-deep' : 'bg-sage-deep text-white'}`}
          >
            {timetableStatus === 'approved' ? 'إرجاع لمسودة' : 'اعتماد الجدول'}
          </button>
        ) : null}
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
  subjectsManage,
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
  subjectsManage?: boolean;
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
  const sm = subjectsManage ?? canManage;

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
                canManage={sm}
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
        {sm ? <AddInline placeholder="مادة جديدة (مثال: اللغة العربية)" onAdd={addSubject} /> : null}
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

/* ───────────────────────── التقارير (قابلة للطباعة) ───────────────────────── */
function ReportsView({
  school,
  entries,
  periods,
  members,
  subjects,
  classes,
  grades,
  duties,
  dutyLocs,
  onBack,
}: {
  school: School | null;
  entries: Entry[];
  periods: Period[];
  members: Member[];
  subjects: Subject[];
  classes: Klass[];
  grades: Grade[];
  duties: Duty[];
  dutyLocs: DutyLoc[];
  onBack: () => void;
}) {
  const [type, setType] = useState<'class' | 'teacher' | 'duties'>('class');
  const [pick, setPick] = useState('');

  const lessonPeriods = periods.filter((p) => p.kind === 'lesson').sort((a, b) => a.sort - b.sort);
  const wd = (school?.work_days && school.work_days.length ? school.work_days : [0, 1, 2, 3, 4]).slice().sort((a, b) => a - b);
  const memberName = (id: string) => members.find((m) => m.id === id)?.name || '—';
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name || '—';
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };
  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || '—';
  const locName = (id: string) => dutyLocs.find((l) => l.id === id)?.name || '—';

  const cellClass = (day: number, pid: string, cid: string) => entries.find((e) => e.day === day && e.period_id === pid && e.class_id === cid);
  const cellTeacher = (day: number, pid: string, mid: string) => entries.find((e) => e.day === day && e.period_id === pid && e.member_id === mid);

  const title =
    type === 'class' ? `جدول الفصل ${pick ? classLabel(pick) : ''}` : type === 'teacher' ? `جدول المعلمة ${pick ? memberName(pick) : ''}` : 'جدول المناوبات';

  return (
    <div className="space-y-3">
      <style>{`@media print { body * { visibility: hidden } .school-report, .school-report * { visibility: visible } .school-report { position: absolute; top: 0; right: 0; left: 0; width: 100% } .no-print { display: none !important } @page { size: A4 landscape; margin: 10mm } }`}</style>

      <div className="flex items-center gap-2 no-print">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">التقارير</div>
        <button onClick={() => window.print()} className="rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3 py-1.5">🖨 طباعة</button>
      </div>

      <div className="card-3d bg-white rounded-2xl p-3 no-print flex gap-2 flex-wrap">
        <select value={type} onChange={(e) => { setType(e.target.value as 'class' | 'teacher' | 'duties'); setPick(''); }} className="rounded-lg border border-sage/25 bg-white text-[13px] p-2">
          <option value="class">جدول فصل</option>
          <option value="teacher">جدول معلمة</option>
          <option value="duties">المناوبات</option>
        </select>
        {type === 'class' ? (
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[13px] p-2">
            <option value="">اختاري الفصل…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c.id)}</option>)}
          </select>
        ) : type === 'teacher' ? (
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[13px] p-2">
            <option value="">اختاري المعلمة…</option>
            {members.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : null}
      </div>

      {/* المحتوى القابل للطباعة */}
      <div className="school-report card-3d bg-white rounded-2xl p-4">
        <div className="text-center mb-3">
          <div className="font-extrabold text-sage-deep text-lg">{school?.name || 'المدرسة'}</div>
          <div className="font-bold text-ink">{title}</div>
          {school?.academic_year ? <div className="text-[12px] text-ink/55">العام {school.academic_year}{school.term ? ` · الفصل ${school.term}` : ''}</div> : null}
        </div>

        {type === 'duties' ? (
          duties.length === 0 ? (
            <div className="text-center text-ink/40 py-6">لا مناوبات.</div>
          ) : (
            wd.map((d) => {
              const dd = duties.filter((x) => x.day === d);
              if (!dd.length) return null;
              return (
                <div key={d} className="mb-2">
                  <div className="font-bold text-sage-deep">{WEEKDAYS[d]}</div>
                  <div className="pr-3">{dd.map((x) => <div key={x.id} className="text-[12.5px]">{periodName(x.period_id)} · {locName(x.location_id)} · {memberName(x.member_id)}</div>)}</div>
                </div>
              );
            })
          )
        ) : !pick ? (
          <div className="text-center text-ink/40 py-6">اختاري {type === 'class' ? 'فصلًا' : 'معلمة'} من الأعلى.</div>
        ) : lessonPeriods.length === 0 ? (
          <div className="text-center text-ink/40 py-6">لا حصص محدّدة في «أوقات اليوم».</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-center text-[11px] w-full">
              <thead>
                <tr>
                  <th className="border border-ink/30 bg-sage-light/40 p-1.5">الحصة</th>
                  {wd.map((d) => <th key={d} className="border border-ink/30 bg-sage-light/40 p-1.5 whitespace-nowrap">{WEEKDAYS[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {lessonPeriods.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-ink/30 bg-sage-light/20 p-1.5 font-bold whitespace-nowrap">{p.name}</td>
                    {wd.map((d) => {
                      const e = type === 'class' ? cellClass(d, p.id, pick) : cellTeacher(d, p.id, pick);
                      return (
                        <td key={d} className="border border-ink/20 p-1.5" style={{ minWidth: 80 }}>
                          {e ? (
                            <div className="leading-tight">
                              <div className="font-bold">{subjectName(e.subject_id)}</div>
                              <div className="text-[10px] text-ink/60">{type === 'class' ? memberName(e.member_id) : classLabel(e.class_id)}</div>
                            </div>
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
          </div>
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

/* ───────────────────────── الإشراف الإداري ───────────────────────── */
function SupervisionView({
  supervisions,
  members,
  stages,
  grades,
  classes,
  canManage,
  onBack,
  addSupervision,
  delSupervision,
}: {
  supervisions: Supervision[];
  members: Member[];
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  canManage: boolean;
  onBack: () => void;
  addSupervision: (memberId: string, scopeType: 'stage' | 'grade' | 'class', scopeId: string) => void;
  delSupervision: (id: string) => void;
}) {
  const [mem, setMem] = useState('');
  const [scopeType, setScopeType] = useState<'stage' | 'grade' | 'class'>('stage');
  const [scopeId, setScopeId] = useState('');

  const sortedMembers = members.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name || '—';
  const gradeLabel = (id: string) => {
    const g = grades.find((x) => x.id === id);
    return g ? `${stageName(g.stage_id)} › ${g.name}` : '—';
  };
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    return `${gradeLabel(c.grade_id)} › ${c.name}`;
  };
  const scopeLabel = (t: string, id: string) => (t === 'stage' ? stageName(id) : t === 'grade' ? gradeLabel(id) : classLabel(id));
  const scopeOptions =
    scopeType === 'stage'
      ? stages.map((s) => ({ id: s.id, label: s.name }))
      : scopeType === 'grade'
      ? grades.map((g) => ({ id: g.id, label: gradeLabel(g.id) }))
      : classes.filter((c) => !c.archived).map((c) => ({ id: c.id, label: classLabel(c.id) }));

  // تجميع حسب المعلمة
  const byMember = sortedMembers
    .map((m) => ({ m, rows: supervisions.filter((s) => s.member_id === m.id) }))
    .filter((x) => x.rows.length);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">الإشراف الإداري</div>
      </div>

      <div className="text-[11.5px] text-ink/55 bg-sage/5 rounded-xl p-2.5 leading-relaxed">
        عيّني معلمةً مشرفةً على مرحلة أو صف أو فصل. يُسجَّل نطاق إشرافها هنا؛ وعند ربط حسابها لتسجيل الدخول يُطبَّق النطاق تلقائيًا فترى بيانات ما تُشرف عليه فقط.
      </div>

      {canManage ? (
        <div className="card-3d bg-white rounded-2xl p-3">
          <div className="font-extrabold text-sage-deep mb-2">تعيين إشراف</div>
          {stages.length && members.length ? (
            <div className="space-y-1.5">
              <select value={mem} onChange={(e) => setMem(e.target.value)} className="w-full rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                <option value="">المعلمة المشرفة</option>
                {sortedMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value as 'stage' | 'grade' | 'class');
                    setScopeId('');
                  }}
                  className="rounded-lg border border-sage/25 bg-white text-[12px] p-2"
                >
                  <option value="stage">مرحلة</option>
                  <option value="grade">صف</option>
                  <option value="class">فصل</option>
                </select>
                <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
                  <option value="">اختاري النطاق</option>
                  {scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <button
                onClick={() => {
                  if (mem && scopeId) {
                    addSupervision(mem, scopeType, scopeId);
                    setScopeId('');
                  }
                }}
                disabled={!mem || !scopeId}
                className="w-full rounded-lg bg-sage-deep text-white font-bold text-[12px] py-2 disabled:opacity-40"
              >
                ＋ تعيين
              </button>
            </div>
          ) : (
            <div className="text-[12px] text-ink/45">أضيفي مراحل ومعلمات أولًا.</div>
          )}
        </div>
      ) : null}

      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">المشرفات ونطاقاتهن</div>
        {byMember.length === 0 ? (
          <div className="text-[12px] text-ink/35">— لا إشراف معيَّن بعد —</div>
        ) : (
          <div className="space-y-2.5">
            {byMember.map(({ m, rows }) => (
              <div key={m.id}>
                <div className="font-bold text-sage-deep text-[13px] mb-1">👩🏻‍💼 {m.name}</div>
                <div className="pr-3 border-r-2 border-sage/10 space-y-1">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className="text-[10px] bg-sage/10 text-sage-deep rounded-full px-2 py-0.5">
                        {r.scope_type === 'stage' ? 'مرحلة' : r.scope_type === 'grade' ? 'صف' : 'فصل'}
                      </span>
                      <div className="flex-1 text-ink">{scopeLabel(r.scope_type, r.scope_id)}</div>
                      {canManage ? <button onClick={() => delSupervision(r.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── رصد الملاحظات ───────────────────────── */
function NotesView({
  notes,
  members,
  students,
  classes,
  grades,
  openClass,
  canManage,
  memberOptions,
  onBack,
  loadClassStudents,
  addNote,
  delNote,
}: {
  notes: Note[];
  members: Member[];
  students: Student[];
  classes: Klass[];
  grades: Grade[];
  openClass: Klass | null;
  canManage: boolean;
  memberOptions?: Member[];
  onBack: () => void;
  loadClassStudents: (cls: Klass) => void;
  addNote: (targetType: 'student' | 'member', targetId: string, targetName: string, category: string, body: string) => void;
  delNote: (id: string) => void;
}) {
  const [tt, setTt] = useState<'student' | 'member'>('student');
  const [clsId, setClsId] = useState('');
  const [stuId, setStuId] = useState('');
  const [memId, setMemId] = useState('');
  const [cat, setCat] = useState('');
  const [body, setBody] = useState('');

  const sortedMembers = (memberOptions ?? members).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name || '';
  const classLabel = (c: Klass) => `${gradeName(c.grade_id)} › ${c.name}`.replace(/^ › /, '');
  const openClasses = classes.filter((c) => !c.archived);

  const reset = () => {
    setStuId('');
    setMemId('');
    setCat('');
    setBody('');
  };
  const submit = () => {
    if (!body.trim()) return;
    if (tt === 'member') {
      if (!memId) return;
      const nm = members.find((m) => m.id === memId)?.name || '';
      addNote('member', memId, nm, cat.trim(), body.trim());
    } else {
      if (!stuId) return;
      const nm = students.find((s) => s.id === stuId)?.name || '';
      addNote('student', stuId, nm, cat.trim(), body.trim());
    }
    reset();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">رصد الملاحظات</div>
      </div>

      <div className="text-[11.5px] text-ink/55 bg-sage/5 rounded-xl p-2.5 leading-relaxed">
        سجّلي ملاحظة على طالبة (سلوك/متابعة) أو على معلمة (متابعة أداء). الملاحظات خاصة — تظهر للإدارة فقط، وللمشرفة ضمن نطاقها لاحقًا.
      </div>

      {canManage ? (
        <div className="card-3d bg-white rounded-2xl p-3 space-y-1.5">
          <div className="font-extrabold text-sage-deep mb-1">ملاحظة جديدة</div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setTt('student'); reset(); }}
              className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${tt === 'student' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}
            >
              👧 طالبة
            </button>
            <button
              onClick={() => { setTt('member'); reset(); }}
              className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${tt === 'member' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}
            >
              👩‍🏫 معلمة
            </button>
          </div>

          {tt === 'member' ? (
            <select value={memId} onChange={(e) => setMemId(e.target.value)} className="w-full rounded-lg border border-sage/25 bg-white text-[12px] p-2">
              <option value="">اختاري المعلمة</option>
              {sortedMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={clsId}
                onChange={(e) => {
                  const id = e.target.value;
                  setClsId(id);
                  setStuId('');
                  const c = classes.find((x) => x.id === id);
                  if (c) loadClassStudents(c);
                }}
                className="rounded-lg border border-sage/25 bg-white text-[12px] p-2"
              >
                <option value="">الفصل</option>
                {openClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
              </select>
              <select value={stuId} onChange={(e) => setStuId(e.target.value)} disabled={!clsId || !openClass || openClass.id !== clsId} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2 disabled:opacity-50">
                <option value="">الطالبة</option>
                {openClass && openClass.id === clsId
                  ? students.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                  : null}
              </select>
            </div>
          )}

          <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="التصنيف (اختياري): سلوك / متابعة / تميّز…" className="w-full rounded-lg border border-sage/25 bg-white text-[12px] p-2" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="نص الملاحظة…" className="w-full rounded-lg border border-sage/25 bg-white text-[12px] p-2" />
          <button
            onClick={submit}
            disabled={!body.trim() || (tt === 'member' ? !memId : !stuId)}
            className="w-full rounded-lg bg-sage-deep text-white font-bold text-[12px] py-2 disabled:opacity-40"
          >
            ＋ حفظ الملاحظة
          </button>
        </div>
      ) : null}

      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep mb-2">الملاحظات المسجّلة</div>
        {notes.length === 0 ? (
          <div className="text-[12px] text-ink/35">— لا ملاحظات بعد —</div>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="border-b border-sage/10 pb-2 last:border-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ background: n.target_type === 'member' ? 'rgba(120,140,90,.12)' : 'rgba(210,170,90,.15)' }}>
                    {n.target_type === 'member' ? '👩‍🏫 معلمة' : '👧 طالبة'}
                  </span>
                  <span className="font-bold text-sage-deep text-[13px]">{n.target_name || '—'}</span>
                  {n.category ? <span className="text-[10px] bg-sage/10 text-sage-deep rounded-full px-1.5 py-0.5">{n.category}</span> : null}
                  <span className="text-[10px] text-ink/40 flex-1 text-left">{new Date(n.created_at).toLocaleDateString('ar')}</span>
                  {canManage ? <button onClick={() => delNote(n.id)} aria-label="حذف" className="text-red-400 hover:text-red-600 text-sm px-1">🗑</button> : null}
                </div>
                <div className="text-[12.5px] text-ink leading-relaxed whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
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

/* ───────────────────────── المستخدمون والصلاحيات ───────────────────────── */
const PERM_MODULES: { key: string; label: string }[] = [
  { key: 'students', label: 'الطالبات' },
  { key: 'attendance', label: 'الحضور' },
  { key: 'grades', label: 'الدرجات' },
  { key: 'structure', label: 'الهيكل' },
];
const PERM_ACTIONS: { key: string; label: string }[] = [
  { key: 'view', label: 'عرض' },
  { key: 'add', label: 'إضافة' },
  { key: 'edit', label: 'تعديل' },
  { key: 'delete', label: 'حذف' },
];
function PermissionsView({
  members,
  permissions,
  stages,
  grades,
  classes,
  canManage,
  onBack,
  applyPreset,
  addPerm,
  delPerm,
}: {
  members: Member[];
  permissions: Perm[];
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  canManage: boolean;
  onBack: () => void;
  applyPreset: (member: Member, preset: 'deputy' | 'student_affairs' | 'teacher') => void;
  addPerm: (userId: string, module: string, action: string, scopeType: string, scopeId: string | null) => void;
  delPerm: (id: string) => void;
}) {
  const [openId, setOpenId] = useState('');
  const [cm, setCm] = useState('students');
  const [ca, setCa] = useState('view');
  const [cscope, setCscope] = useState('school');
  const [cscopeId, setCscopeId] = useState('');
  const modLabel = (k: string) => PERM_MODULES.find((m) => m.key === k)?.label || k;
  const actLabel = (k: string) => PERM_ACTIONS.find((a) => a.key === k)?.label || k;
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name || '—';
  const gradeLabel = (id: string) => {
    const g = grades.find((x) => x.id === id);
    return g ? `${stageName(g.stage_id)} › ${g.name}` : '—';
  };
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? `${gradeLabel(c.grade_id)} › ${c.name}` : '—';
  };
  const scopeLabel = (t: string, id: string | null) =>
    t === 'school' ? 'كل المدرسة' : !id ? '—' : t === 'stage' ? stageName(id) : t === 'grade' ? gradeLabel(id) : classLabel(id);
  const scopeOptions =
    cscope === 'stage' ? stages.map((s) => ({ id: s.id, label: s.name }))
    : cscope === 'grade' ? grades.map((g) => ({ id: g.id, label: gradeLabel(g.id) }))
    : cscope === 'class' ? classes.filter((c) => !c.archived).map((c) => ({ id: c.id, label: classLabel(c.id) }))
    : [];
  const sorted = members
    .slice()
    .sort((a, b) => Number(!!b.user_id) - Number(!!a.user_id) || (a.name || '').localeCompare(b.name || '', 'ar'));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">المستخدمون والصلاحيات</div>
      </div>

      <div className="text-[11.5px] text-ink/55 bg-sage/5 rounded-xl p-2.5 leading-relaxed">
        امنحي كل معلمة دورها. الأدوار الجاهزة: <b>الوكيلة</b> (كل شيء عدا الاشتراك) و<b>شؤون الطالبات</b> (الطالبات والحضور). أو أضيفي صلاحيات مفصّلة يدويًا. الصلاحيات تعمل فقط بعد <b>ربط حساب المعلمة</b> 🔗 من «الشُّعب».
      </div>

      {sorted.map((m) => {
        const mp = m.user_id ? permissions.filter((p) => p.user_id === m.user_id) : [];
        const open = openId === m.id;
        return (
          <div key={m.id} className="card-3d bg-white rounded-2xl p-3">
            <button onClick={() => setOpenId(open ? '' : m.id)} className="w-full flex items-center gap-2 text-right">
              <div className="flex-1">
                <div className="font-bold text-sage-deep text-[13.5px]">{m.name || '—'}</div>
                <div className="text-[11px] text-ink/50 mt-0.5">
                  {ROLE_LABEL[m.role] || m.role}
                  {!m.user_id ? <span className="text-gold-deep"> · غير مربوطة بحساب</span> : mp.length ? <span> · {mp.length} صلاحية</span> : null}
                </div>
              </div>
              <span className="text-ink/30 text-xs">{open ? '▲' : '▼'}</span>
            </button>

            {open ? (
              !m.user_id ? (
                <div className="text-[12px] text-ink/50 mt-2 border-t border-sage/10 pt-2">اربطي حسابها أولًا من «الشُّعب» (زر 🔗) لتُفعَّل الصلاحيات.</div>
              ) : (
                <div className="mt-2 border-t border-sage/10 pt-2 space-y-2">
                  {canManage ? (
                    <div>
                      <div className="text-[11px] text-ink/55 mb-1">أدوار جاهزة:</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => applyPreset(m, 'deputy')} className="rounded-lg bg-sage-deep text-white text-[11.5px] font-bold px-2.5 py-1.5">وكيلة</button>
                        <button onClick={() => applyPreset(m, 'student_affairs')} className="rounded-lg bg-sage-light text-sage-deep text-[11.5px] font-bold px-2.5 py-1.5">شؤون الطالبات</button>
                        <button onClick={() => applyPreset(m, 'teacher')} className="rounded-lg border border-red-200 text-red-500 text-[11.5px] font-bold px-2.5 py-1.5">إزالة الدور</button>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-[11px] text-ink/55 mb-1">الصلاحيات الحالية:</div>
                    {m.role === 'deputy' ? (
                      <div className="text-[12px] text-sage-deep">✓ وكيلة — كل الصلاحيات عدا الاشتراك</div>
                    ) : mp.length === 0 ? (
                      <div className="text-[12px] text-ink/35">— لا صلاحيات —</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {mp.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 text-[11px] bg-sage/10 text-sage-deep rounded-full px-2 py-0.5">
                            {modLabel(p.module)}: {actLabel(p.action)}
                            <span className="text-ink/45">· {scopeLabel(p.scope_type, p.scope_id)}</span>
                            {canManage ? <button onClick={() => delPerm(p.id)} aria-label="حذف" className="text-red-400 hover:text-red-600">×</button> : null}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {canManage && m.role !== 'deputy' ? (
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-ink/55">منح صلاحية مفصّلة:</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <select value={cm} onChange={(e) => setCm(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-1.5">
                          {PERM_MODULES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                        <select value={ca} onChange={(e) => setCa(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-1.5">
                          {PERM_ACTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                        <select
                          value={cscope}
                          onChange={(e) => { setCscope(e.target.value); setCscopeId(''); }}
                          className="rounded-lg border border-sage/25 bg-white text-[12px] p-1.5"
                        >
                          <option value="school">كل المدرسة</option>
                          <option value="stage">مرحلة</option>
                          <option value="grade">صف</option>
                          <option value="class">فصل</option>
                        </select>
                        {cscope === 'school' ? (
                          <button onClick={() => m.user_id && addPerm(m.user_id, cm, ca, 'school', null)} className="rounded-lg bg-sage-deep text-white text-[12px] font-bold px-3 py-1.5">＋ منح</button>
                        ) : (
                          <div className="flex gap-1.5">
                            <select value={cscopeId} onChange={(e) => setCscopeId(e.target.value)} className="flex-1 rounded-lg border border-sage/25 bg-white text-[12px] p-1.5">
                              <option value="">النطاق</option>
                              {scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                            <button
                              onClick={() => m.user_id && cscopeId && addPerm(m.user_id, cm, ca, cscope, cscopeId)}
                              disabled={!cscopeId}
                              className="rounded-lg bg-sage-deep text-white text-[12px] font-bold px-3 py-1.5 disabled:opacity-40"
                            >
                              ＋
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── الحضور الذكي (بالحصص) ───────────────────────── */
const ATT_STAT: Record<string, { l: string; c: string }> = {
  absent: { l: 'غياب', c: '#e05a5a' },
  late: { l: 'تأخير', c: '#e0a13a' },
  permission: { l: 'استئذان', c: '#4f86d6' },
};
function SmartAttendanceView({
  entries,
  periods,
  classes,
  grades,
  members,
  subjects,
  students,
  openClass,
  periodAtt,
  myMemberId,
  canManage,
  workDays,
  onBack,
  onOpenClass,
  loadByClassDate,
  loadByStudent,
  loadByClassRange,
  setPeriodStatus,
}: {
  entries: Entry[];
  periods: Period[];
  classes: Klass[];
  grades: Grade[];
  members: Member[];
  subjects: Subject[];
  students: Student[];
  openClass: Klass | null;
  periodAtt: PAtt[];
  myMemberId: string | null;
  canManage: boolean;
  workDays: number[];
  onBack: () => void;
  onOpenClass: (cls: Klass) => void;
  loadByClassDate: (classId: string, date: string) => void;
  loadByStudent: (studentId: string) => void;
  loadByClassRange: (classId: string, from: string, to: string) => void;
  setPeriodStatus: (date: string, periodId: string, classId: string, studentId: string, status: string | null) => void;
}) {
  const iTeach = entries.some((e) => e.member_id === myMemberId);
  const [mode, setMode] = useState<'mark' | 'daily' | 'sheet' | 'stats'>(iTeach ? 'mark' : 'daily');
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [selEntry, setSelEntry] = useState('');
  const [selClass, setSelClass] = useState('');
  const [selStudent, setSelStudent] = useState('');

  const periodName = (id: string) => periods.find((p) => p.id === id)?.name || '—';
  const periodSort = (id: string) => periods.find((p) => p.id === id)?.sort ?? 99;
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || '';
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };
  const wd = (() => { try { return new Date(`${date}T00:00:00`).getDay(); } catch { return 0; } })();
  const statusOf = (periodId: string, studentId: string, d: string) => periodAtt.find((x) => x.period_id === periodId && x.student_id === studentId && x.date === d)?.status || null;

  // إدخالات جدول المستخدمة اليوم (أو كل الإدخالات للإدارة)
  const dayEntries = entries
    .filter((e) => e.day === wd && (myMemberId ? e.member_id === myMemberId : true))
    .sort((a, b) => periodSort(a.period_id) - periodSort(b.period_id));
  const entry = dayEntries.find((e) => e.id === selEntry) || null;
  const markRows = entry && openClass && openClass.id === entry.class_id ? students.filter((s) => !s.archived) : [];

  const pickEntry = (e: Entry) => {
    setSelEntry(e.id);
    const cls = classes.find((c) => c.id === e.class_id);
    if (cls) onOpenClass(cls);
    loadByClassDate(e.class_id, date);
  };
  const pickDailyClass = (cid: string) => {
    setSelClass(cid);
    const cls = classes.find((c) => c.id === cid);
    if (cls) onOpenClass(cls);
    if (cid) loadByClassDate(cid, date);
  };
  const openClasses = classes.filter((c) => !c.archived);

  const clsName = (cid: string) => classLabel(cid);
  const studentName = (sid: string) => students.find((s) => s.id === sid)?.name || '';

  return (
    <div className="space-y-3">
      <style>{`@media print { body * { visibility: hidden } .school-report, .school-report * { visibility: visible } .school-report { position: absolute; top: 0; right: 0; left: 0; width: 100% } .no-print { display: none !important } @page { size: A4 portrait; margin: 12mm } }`}</style>
      <div className="flex items-center gap-2 no-print">
        <button onClick={onBack} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ اللوحة</button>
        <div className="font-extrabold text-sage-deep flex-1">الحضور الذكي</div>
      </div>

      {/* أوضاع */}
      <div className="flex gap-1.5 no-print">
        {iTeach ? (
          <button onClick={() => { setMode('mark'); setSelEntry(''); }} className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${mode === 'mark' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}>تسجيل حصتي</button>
        ) : null}
        <button onClick={() => setMode('daily')} className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${mode === 'daily' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}>كشف اليوم</button>
        <button onClick={() => setMode('sheet')} className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${mode === 'sheet' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}>كشف طالبة</button>
        <button onClick={() => setMode('stats')} className={`flex-1 rounded-lg text-[12px] font-bold py-1.5 border ${mode === 'stats' ? 'bg-sage-deep text-white border-sage-deep' : 'bg-white text-sage-deep border-sage/25'}`}>إحصائية الفصل</button>
      </div>

      {mode === 'mark' ? (
        <div className="space-y-2">
          <div className="card-3d bg-white rounded-2xl p-3">
            <label className="text-[12px] text-ink/60">التاريخ ({WEEKDAYS[wd]})</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelEntry(''); }} className="w-full mt-1 rounded-lg border border-sage/25 bg-white text-[13px] p-2" />
          </div>
          {!entry ? (
            dayEntries.length === 0 ? (
              <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/55 text-[13px]">لا حصص لك في {WEEKDAYS[wd]} — تأكدي أن الجدول مبني.</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[12px] text-ink/55">اختاري الحصة لتسجيل حضورها:</div>
                {dayEntries.map((e) => (
                  <button key={e.id} onClick={() => pickEntry(e)} className="card-3d bg-white rounded-xl p-3 w-full text-right flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-bold text-sage-deep text-[13.5px]">{periodName(e.period_id)} · {classLabel(e.class_id)}</div>
                      {subjectName(e.subject_id) ? <div className="text-[11px] text-ink/50">{subjectName(e.subject_id)}</div> : null}
                    </div>
                    <span className="text-ink/30 text-xs">›</span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2">
              <button onClick={() => setSelEntry('')} className="text-[12px] text-sage-deep font-bold">‹ كل الحصص</button>
              <div className="card-3d bg-white rounded-2xl p-2">
                <div className="font-bold text-sage-deep text-[13px] px-1 mb-1">{periodName(entry.period_id)} · {classLabel(entry.class_id)}</div>
                {markRows.length === 0 ? (
                  <div className="text-[12px] text-ink/40 text-center py-3">— لا طالبات —</div>
                ) : (
                  <div className="space-y-1">
                    {markRows.map((st) => {
                      const cur = statusOf(entry.period_id, st.id, date);
                      return (
                        <div key={st.id} className="flex items-center gap-1.5 border-t border-sage/10 pt-1 first:border-0">
                          <div className="flex-1 text-[13px] text-ink">{st.name}</div>
                          <div className="flex gap-1">
                            <StatBtn active={!cur} label="حاضرة" color="#4a8c5a" onClick={() => setPeriodStatus(date, entry.period_id, entry.class_id, st.id, null)} />
                            {(['absent', 'late', 'permission'] as const).map((s) => (
                              <StatBtn key={s} active={cur === s} label={ATT_STAT[s].l} color={ATT_STAT[s].c} onClick={() => setPeriodStatus(date, entry.period_id, entry.class_id, st.id, s)} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : mode === 'daily' ? (
        <div className="space-y-2">
          <div className="card-3d bg-white rounded-2xl p-3 grid grid-cols-2 gap-1.5">
            <select value={selClass} onChange={(e) => pickDailyClass(e.target.value)} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
              <option value="">اختاري الفصل</option>
              {openClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c.id)}</option>)}
            </select>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (selClass) loadByClassDate(selClass, e.target.value); }} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2" />
          </div>
          {!selClass ? (
            <div className="text-[12px] text-ink/40 text-center py-4">اختاري الفصل والتاريخ لعرض استثناءات اليوم.</div>
          ) : (() => {
            const withEx = (openClass && openClass.id === selClass ? students.filter((s) => !s.archived) : [])
              .map((st) => ({ st, ex: periodAtt.filter((x) => x.student_id === st.id && x.date === date).sort((a, b) => periodSort(a.period_id) - periodSort(b.period_id)) }))
              .filter((x) => x.ex.length);
            return withEx.length === 0 ? (
              <div className="card-3d bg-white rounded-2xl p-6 text-center text-sage-deep text-[13px]">✓ لا استثناءات هذا اليوم — الكل حاضرات.</div>
            ) : (
              <>
                <button onClick={() => window.print()} className="no-print rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3 py-1.5">🖨 طباعة الكشف</button>
                <div className="school-report card-3d bg-white rounded-2xl p-3 space-y-2">
                <div className="mb-1 pb-1 border-b border-sage/15">
                  <div className="font-extrabold text-sage-deep text-[14px]">كشف الاستثناءات اليومي</div>
                  <div className="text-[11px] text-ink/55">{clsName(selClass)} · {date} ({WEEKDAYS[wd]})</div>
                </div>
                {withEx.map(({ st, ex }) => (
                  <div key={st.id} className="border-b border-sage/10 pb-2 last:border-0">
                    <div className="font-bold text-sage-deep text-[13px] mb-1">{st.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.map((e) => (
                        <span key={e.id} className="text-[11px] rounded-full px-2 py-0.5 text-white" style={{ background: ATT_STAT[e.status]?.c || '#888' }}>
                          {periodName(e.period_id)}: {ATT_STAT[e.status]?.l || e.status}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : mode === 'sheet' ? (
        <div className="space-y-2">
          <div className="card-3d bg-white rounded-2xl p-3 grid grid-cols-2 gap-1.5">
            <select value={selClass} onChange={(e) => { setSelClass(e.target.value); setSelStudent(''); const cls = classes.find((c) => c.id === e.target.value); if (cls) onOpenClass(cls); }} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2">
              <option value="">الفصل</option>
              {openClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c.id)}</option>)}
            </select>
            <select value={selStudent} onChange={(e) => { setSelStudent(e.target.value); if (e.target.value) loadByStudent(e.target.value); }} disabled={!selClass || !openClass || openClass.id !== selClass} className="rounded-lg border border-sage/25 bg-white text-[12px] p-2 disabled:opacity-50">
              <option value="">الطالبة</option>
              {openClass && openClass.id === selClass ? students.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
            </select>
          </div>
          {!selStudent ? (
            <div className="text-[12px] text-ink/40 text-center py-4">اختاري الفصل ثم الطالبة لعرض كشفها الكامل.</div>
          ) : (() => {
            const rows = periodAtt.filter((x) => x.student_id === selStudent).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : periodSort(a.period_id) - periodSort(b.period_id)));
            const cnt = (s: string) => rows.filter((r) => r.status === s).length;
            return (
              <div className="school-report space-y-2">
                <button onClick={() => window.print()} className="no-print rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3 py-1.5">🖨 طباعة الكشف</button>
                <div className="pb-1 border-b border-sage/15">
                  <div className="font-extrabold text-sage-deep text-[14px]">كشف الطالبة</div>
                  <div className="text-[11px] text-ink/55">{studentName(selStudent)} · {clsName(selClass)}</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['absent', 'late', 'permission'] as const).map((s) => (
                    <div key={s} className="card-3d bg-white rounded-xl py-2 text-center">
                      <div className="text-xl font-black tabular-nums" style={{ color: ATT_STAT[s].c }}>{cnt(s)}</div>
                      <div className="text-[11px] text-ink/55">{ATT_STAT[s].l}</div>
                    </div>
                  ))}
                </div>
                {rows.length === 0 ? (
                  <div className="card-3d bg-white rounded-2xl p-6 text-center text-sage-deep text-[13px]">✓ لا استثناءات — سجلّها نظيف.</div>
                ) : (
                  <div className="card-3d bg-white rounded-2xl p-3 space-y-1">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-[12.5px] border-t border-sage/10 pt-1 first:border-0">
                        <span className="text-ink/60 tabular-nums">{r.date}</span>
                        <span className="text-ink/45">·</span>
                        <span className="flex-1 text-ink">{periodName(r.period_id)}</span>
                        <span className="text-[11px] rounded-full px-2 py-0.5 text-white" style={{ background: ATT_STAT[r.status]?.c || '#888' }}>{ATT_STAT[r.status]?.l || r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="card-3d bg-white rounded-2xl p-3 space-y-1.5">
            <select value={selClass} onChange={(e) => { const cid = e.target.value; setSelClass(cid); const cls = classes.find((c) => c.id === cid); if (cls) onOpenClass(cls); if (cid) loadByClassRange(cid, from, to); }} className="w-full rounded-lg border border-sage/25 bg-white text-[12px] p-2">
              <option value="">اختاري الفصل</option>
              {openClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c.id)}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[11px] text-ink/55">من<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (selClass) loadByClassRange(selClass, e.target.value, to); }} className="w-full mt-0.5 rounded-lg border border-sage/25 bg-white text-[12px] p-1.5" /></label>
              <label className="text-[11px] text-ink/55">إلى<input type="date" value={to} onChange={(e) => { setTo(e.target.value); if (selClass) loadByClassRange(selClass, from, e.target.value); }} className="w-full mt-0.5 rounded-lg border border-sage/25 bg-white text-[12px] p-1.5" /></label>
            </div>
          </div>
          {!selClass ? (
            <div className="text-[12px] text-ink/40 text-center py-4">اختاري الفصل والمدة لعرض إحصائية الطالبات.</div>
          ) : (() => {
            const list = (openClass && openClass.id === selClass ? students.filter((s) => !s.archived) : [])
              .map((st) => {
                const r = periodAtt.filter((x) => x.student_id === st.id);
                return { st, absent: r.filter((x) => x.status === 'absent').length, late: r.filter((x) => x.status === 'late').length, permission: r.filter((x) => x.status === 'permission').length };
              })
              .sort((a, b) => b.absent + b.late + b.permission - (a.absent + a.late + a.permission));
            return list.length === 0 ? (
              <div className="text-[12px] text-ink/40 text-center py-4">— لا طالبات —</div>
            ) : (
              <>
                <button onClick={() => window.print()} className="no-print rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3 py-1.5 mb-2">🖨 طباعة الإحصائية</button>
                <div className="school-report card-3d bg-white rounded-2xl p-3 overflow-x-auto">
                <div className="mb-2 pb-1 border-b border-sage/15">
                  <div className="font-extrabold text-sage-deep text-[14px]">إحصائية حضور الفصل</div>
                  <div className="text-[11px] text-ink/55">{clsName(selClass)} · من {from} إلى {to}</div>
                </div>
                <table className="text-[12px] w-full border-collapse">
                  <thead>
                    <tr className="text-ink/55">
                      <th className="text-right p-1.5">الطالبة</th>
                      <th className="p-1.5" style={{ color: ATT_STAT.absent.c }}>غياب</th>
                      <th className="p-1.5" style={{ color: ATT_STAT.late.c }}>تأخير</th>
                      <th className="p-1.5" style={{ color: ATT_STAT.permission.c }}>استئذان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(({ st, absent, late, permission }) => (
                      <tr key={st.id} className="border-t border-sage/10">
                        <td className="p-1.5 text-right text-ink font-medium">{st.name}</td>
                        <td className="p-1.5 text-center tabular-nums font-bold">{absent || '—'}</td>
                        <td className="p-1.5 text-center tabular-nums font-bold">{late || '—'}</td>
                        <td className="p-1.5 text-center tabular-nums font-bold">{permission || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function StatBtn({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-bold rounded-lg px-2 py-1 border"
      style={active ? { background: color, color: '#fff', borderColor: color } : { background: '#fff', color: '#555', borderColor: '#ddd' }}
    >
      {label}
    </button>
  );
}

/* ───────────────────────── سجل الدرجات ───────────────────────── */
function GradebookView({
  teaching,
  members,
  subjects,
  classes,
  grades,
  students,
  openClass,
  gradeItems,
  gradeScores,
  myMemberId,
  canManage,
  onBack,
  onOpenClass,
  addGradeItem,
  delGradeItem,
  setScore,
}: {
  teaching: Teaching[];
  members: Member[];
  subjects: Subject[];
  classes: Klass[];
  grades: Grade[];
  students: Student[];
  openClass: Klass | null;
  gradeItems: GItem[];
  gradeScores: GScore[];
  myMemberId: string | null;
  canManage: boolean;
  onBack: () => void;
  onOpenClass: (cls: Klass) => void;
  addGradeItem: (memberId: string, subjectId: string, classId: string, name: string, maxScore: number) => void;
  delGradeItem: (id: string) => void;
  setScore: (itemId: string, studentId: string, score: number | null) => void;
}) {
  const [sel, setSel] = useState('');
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState('10');

  const memberName = (id: string) => members.find((m) => m.id === id)?.name || '—';
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || '—';
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    if (!c) return '—';
    const g = grades.find((x) => x.id === c.grade_id);
    return g ? `${g.name} · ${c.name}` : c.name;
  };

  // مجموعات (معلمة×مادة×فصل): تدريسي + أي مجموعة لها تقييمات (للمتابعة)
  const key = (m: string, s: string, c: string) => `${m}|${s}|${c}`;
  const map = new Map<string, { member_id: string; subject_id: string; class_id: string; canEdit: boolean }>();
  const consider = (m: string, s: string, c: string) => {
    const k = key(m, s, c);
    if (!map.has(k)) map.set(k, { member_id: m, subject_id: s, class_id: c, canEdit: canManage || m === myMemberId });
  };
  teaching.forEach((t) => {
    if (canManage || t.member_id === myMemberId) consider(t.member_id, t.subject_id, t.class_id);
  });
  gradeItems.forEach((g) => consider(g.member_id, g.subject_id, g.class_id)); // مجموعات مرئية (متابعة)
  const groups = Array.from(map.values());

  const selGroup = groups.find((g) => key(g.member_id, g.subject_id, g.class_id) === sel) || null;
  const selCls = selGroup ? classes.find((c) => c.id === selGroup.class_id) || null : null;
  const cols = selGroup
    ? gradeItems.filter((i) => i.member_id === selGroup.member_id && i.subject_id === selGroup.subject_id && i.class_id === selGroup.class_id).sort((a, b) => a.sort - b.sort)
    : [];
  const rows = selGroup && openClass && openClass.id === selGroup.class_id ? students.filter((s) => !s.archived) : [];
  const scoreOf = (itemId: string, studentId: string) => gradeScores.find((x) => x.item_id === itemId && x.student_id === studentId)?.score ?? null;

  const openGroup = (g: { member_id: string; subject_id: string; class_id: string }) => {
    setSel(key(g.member_id, g.subject_id, g.class_id));
    const cls = classes.find((c) => c.id === g.class_id);
    if (cls) onOpenClass(cls);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => (sel ? setSel('') : onBack())} className="rounded-lg border border-sage/25 text-sage-deep text-[12px] font-bold px-3 py-1.5">‹ {sel ? 'السجلات' : 'اللوحة'}</button>
        <div className="font-extrabold text-sage-deep flex-1">سجل الدرجات</div>
      </div>

      {!selGroup ? (
        groups.length === 0 ? (
          <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60 text-[13px]">لا يوجد توزيع دراسي لك بعد — تُسند لكِ المواد من «المواد والتوزيع».</div>
        ) : (
          <div className="space-y-1.5">
            {groups.map((g) => (
              <button key={key(g.member_id, g.subject_id, g.class_id)} onClick={() => openGroup(g)} className="card-3d bg-white rounded-xl p-3 w-full text-right flex items-center gap-2">
                <div className="flex-1">
                  <div className="font-bold text-sage-deep text-[13.5px]">{subjectName(g.subject_id)} · {classLabel(g.class_id)}</div>
                  {g.member_id !== myMemberId ? <div className="text-[11px] text-ink/50 mt-0.5">{memberName(g.member_id)}</div> : null}
                </div>
                {!g.canEdit ? <span className="text-[10px] bg-sage/10 text-ink/50 rounded-full px-2 py-0.5">عرض</span> : null}
                <span className="text-ink/30 text-xs">›</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="card-3d bg-white rounded-2xl p-3">
            <div className="font-extrabold text-sage-deep">{subjectName(selGroup.subject_id)} · {classLabel(selGroup.class_id)}</div>
            {selGroup.member_id !== myMemberId ? <div className="text-[11px] text-ink/50">{memberName(selGroup.member_id)}</div> : null}
          </div>

          {selGroup.canEdit ? (
            <div className="card-3d bg-white rounded-2xl p-3 flex gap-1.5 items-center">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="تقييم جديد (اختبار ١)" className="flex-1 rounded-lg border border-sage/25 bg-white text-[12px] p-2" />
              <input type="number" min={1} value={newMax} onChange={(e) => setNewMax(e.target.value)} title="الدرجة العظمى" className="w-16 rounded-lg border border-sage/25 bg-white text-[12px] p-2 text-center" />
              <button
                onClick={() => { if (newName.trim()) { addGradeItem(selGroup.member_id, selGroup.subject_id, selGroup.class_id, newName.trim(), Math.max(1, +newMax || 10)); setNewName(''); } }}
                className="rounded-lg bg-sage-deep text-white font-bold text-[12px] px-3 py-2"
              >
                ＋ عمود
              </button>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <div className="text-[12px] text-ink/40 text-center py-4">— لا طالبات في هذا الفصل —</div>
          ) : cols.length === 0 ? (
            <div className="text-[12px] text-ink/40 text-center py-4">أضيفي عمود تقييم لتبدئي التسجيل.</div>
          ) : (
            <div className="card-3d bg-white rounded-2xl p-2 overflow-x-auto">
              <table className="text-[12px] w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-right p-1.5 sticky right-0 bg-white">الطالبة</th>
                    {cols.map((c) => (
                      <th key={c.id} className="p-1.5 text-center whitespace-nowrap">
                        <div className="font-bold text-sage-deep">{c.name}</div>
                        <div className="text-[10px] text-ink/45 font-normal">/{c.max_score}</div>
                        {selGroup.canEdit ? <button onClick={() => delGradeItem(c.id)} aria-label="حذف العمود" className="text-red-300 hover:text-red-500 text-[10px]">حذف</button> : null}
                      </th>
                    ))}
                    <th className="p-1.5 text-center">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((st) => {
                    const total = cols.reduce((a, c) => a + (Number(scoreOf(c.id, st.id)) || 0), 0);
                    const max = cols.reduce((a, c) => a + Number(c.max_score), 0);
                    return (
                      <tr key={st.id} className="border-t border-sage/10">
                        <td className="p-1.5 text-right sticky right-0 bg-white font-medium text-ink">{st.name}</td>
                        {cols.map((c) => {
                          const v = scoreOf(c.id, st.id);
                          return (
                            <td key={c.id} className="p-1 text-center">
                              {selGroup.canEdit ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={c.max_score}
                                  defaultValue={v ?? ''}
                                  onBlur={(e) => {
                                    const raw = e.target.value.trim();
                                    const val = raw === '' ? null : Math.max(0, Math.min(c.max_score, +raw || 0));
                                    if (val !== v) setScore(c.id, st.id, val);
                                  }}
                                  className="w-14 rounded border border-sage/25 bg-white text-[12px] p-1 text-center"
                                />
                              ) : (
                                <span className="text-ink">{v ?? '—'}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center font-bold text-sage-deep tabular-nums">{total}<span className="text-[10px] text-ink/40">/{max}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── لوحة منسقة المادة (رئيسة الشعبة) ───────────────────────── */
function CoordinatorHome({ name, depts, onOpen }: { name: string; depts: Dept[]; onOpen: () => void }) {
  return (
    <div className="space-y-3">
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep">📚 لوحة رئيسة الشعبة — {name}</div>
        <div className="text-[12px] text-ink/60 mt-1">شُعبك:</div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {depts.map((d) => (
            <span key={d.id} className="text-[11px] bg-sage/10 text-sage-deep rounded-full px-2 py-0.5">{d.name}</span>
          ))}
        </div>
      </div>
      <button onClick={onOpen} className="card-3d bg-white border border-sage/15 hover:border-sage/40 rounded-2xl p-3 text-right w-full">
        <div className="text-2xl mb-1">📊</div>
        <div className="font-extrabold text-sage-deep text-[14px]">توزيع المواد</div>
        <div className="text-[11px] text-ink/55 mt-0.5 leading-snug">وزّعي مواد شعبتك على المعلمات وحدّدي الحصص الأسبوعية</div>
      </button>
    </div>
  );
}

/* ───────────────────────── لوحة المشرفة (نطاق محصور) ───────────────────────── */
function SupervisorHome({
  name,
  scope,
  stages,
  grades,
  classes,
  onOpen,
}: {
  name: string;
  scope: Supervision[];
  stages: Stage[];
  grades: Grade[];
  classes: Klass[];
  onOpen: (k: 'attendance' | 'notes' | 'duty') => void;
}) {
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name || '—';
  const gradeLabel = (id: string) => {
    const g = grades.find((x) => x.id === id);
    return g ? `${stageName(g.stage_id)} › ${g.name}` : '—';
  };
  const classLabel = (id: string) => {
    const c = classes.find((x) => x.id === id);
    return c ? `${gradeLabel(c.grade_id)} › ${c.name}` : '—';
  };
  const scopeText = (s: Supervision) => (s.scope_type === 'stage' ? stageName(s.scope_id) : s.scope_type === 'grade' ? gradeLabel(s.scope_id) : classLabel(s.scope_id));

  const cards: { key: 'attendance' | 'notes' | 'duty'; label: string; emoji: string; desc: string }[] = [
    { key: 'attendance', label: 'حضور الطالبات', emoji: '👧', desc: 'متابعة وتسجيل الحضور في نطاقك' },
    { key: 'notes', label: 'رصد الملاحظات', emoji: '📝', desc: 'ملاحظات على طالبات ومعلمات نطاقك' },
    { key: 'duty', label: 'المناوبات', emoji: '🔄', desc: 'عرض جدول المناوبات' },
  ];

  return (
    <div className="space-y-3">
      <div className="card-3d bg-white rounded-2xl p-3">
        <div className="font-extrabold text-sage-deep">👩🏻‍💼 لوحة الإشراف — {name}</div>
        <div className="text-[12px] text-ink/60 mt-1">نطاق إشرافك:</div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {scope.length ? (
            scope.map((s) => (
              <span key={s.id} className="text-[11px] bg-sage/10 text-sage-deep rounded-full px-2 py-0.5">
                {s.scope_type === 'stage' ? 'مرحلة' : s.scope_type === 'grade' ? 'صف' : 'فصل'}: {scopeText(s)}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-ink/40">— لم يُسنَد لك نطاق بعد —</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <button key={c.key} onClick={() => onOpen(c.key)} className="card-3d bg-white border border-sage/15 hover:border-sage/40 rounded-2xl p-3 text-right">
            <div className="text-2xl mb-1">{c.emoji}</div>
            <div className="font-extrabold text-sage-deep text-[14px]">{c.label}</div>
            <div className="text-[11px] text-ink/55 mt-0.5 leading-snug">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Dashboard({
  school,
  counts,
  onOpen,
  allowedKeys,
}: {
  school: School | null;
  counts: { stages: number; grades: number; classes: number; depts: number; members: number };
  onOpen: (key: string) => void;
  allowedKeys?: string[] | null;
}) {
  const today = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  // allowedKeys=null ⇒ الكل (إدارة)؛ قائمة ⇒ صاحبة صلاحيات محدودة
  const visible = allowedKeys ? SECTIONS.filter((s) => allowedKeys.includes(s.key)) : SECTIONS;
  const limited = Array.isArray(allowedKeys);
  return (
    <div className="space-y-4">
      {/* ملخص اليوم */}
      <div className="rounded-2xl bg-white border border-sage/15 p-4">
        <div className="text-[13px] font-bold text-sage-deep">{today}</div>
        <div className="text-[12px] text-ink/50 mt-1">
          {school?.academic_year ? `العام ${school.academic_year} · ` : ''}
          {school?.term ? `الفصل ${school.term}` : ''}
        </div>
        {limited ? null : (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat n={counts.classes} l="فصول" />
            <Stat n={counts.depts} l="شُعب" />
            <Stat n={counts.members} l="معلمات" />
          </div>
        )}
        <div className="text-[11.5px] text-ink/45 mt-3">
          {limited ? 'تظهر لك الأقسام المصرَّح لك بها فقط.' : 'الملخص اليومي للحضور والاحتياط والمناوبات يظهر بعد تفعيل تلك الأقسام.'}
        </div>
      </div>

      {limited && visible.length === 0 ? (
        <div className="card-3d bg-white rounded-2xl p-6 text-center text-ink/60 text-[13px]">لم تُمنح لك صلاحيات بعد — تواصلي مع إدارة المدرسة.</div>
      ) : null}

      {/* الأقسام */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((s) => (
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
