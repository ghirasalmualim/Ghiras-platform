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

/** صلاحية كل أداة مدفوعة — تُقرأ من profiles مباشرة (الأدمِن يقرأ الكل بحكم RLS) */
type ToolState = Record<string, string | null>;

/** صف صلاحية خام من جدول permissions */
type Perm = {
  id: string;
  user_id: string;
  scope: string;
  stage_id: string | null;
  grade_id: string | null;
  subject_id: string | null;
};

const TOOL_COLS = [
  'studio_until',
  'gradebook_until',
  'attendance_until',
  'head_records_until',
  'adventure_until',
  'multiplication_until',
  'workshops_until',
] as const;

type TabKey = 'all' | 'active' | 'soon' | 'expired' | 'suspended' | 'none';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'فعّالات' },
  { key: 'soon', label: 'تنتهي خلال ٣٠ يومًا' },
  { key: 'expired', label: 'منتهية' },
  { key: 'suspended', label: 'موقوفة' },
  { key: 'none', label: 'بلا اشتراك' },
];

export default function AdminPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tools, setTools] = useState<Record<string, ToolState>>({});
  const [perms, setPerms] = useState<Record<string, Perm[]>>({});
  const [cat, setCat] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, { target?: string; subject?: string }>>({});

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

    // حالة الأدوات المدفوعة — تُقرأ من profiles مباشرة.
    // سياسة «own profile read» تسمح للأدمِن بقراءة كل الملفات، فلا حاجة لدالة جديدة.
    // فشلها لا يعطّل اللوحة: تظهر الحسابات بلا شارات الأدوات فقط.
    const { data: tdata } = await supabase
      .from('profiles')
      .select(['id', ...TOOL_COLS].join(','));
    if (tdata) {
      const map: Record<string, ToolState> = {};
      for (const rec of tdata as unknown as (ToolState & { id: string })[]) {
        map[rec.id] = rec;
      }
      setTools(map);
    }

    // تفاصيل الصلاحيات — الملخّص القادم من admin_list_users يقول «subject»
    // بلا تحديد أي مادة أو صف. سياسة «own permissions read» تتيح للأدمِن قراءة
    // الجدول كاملًا، فنفكّ المعرّفات إلى أسماء عبر الكتالوج.
    const { data: pdata } = await supabase
      .from('permissions')
      .select('id, user_id, scope, stage_id, grade_id, subject_id');
    if (pdata) {
      const map: Record<string, Perm[]> = {};
      for (const p of pdata as unknown as Perm[]) {
        (map[p.user_id] = map[p.user_id] || []).push(p);
      }
      setPerms(map);
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
      setMsg('اختر المرحلة أو الصف أولاً');
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
  // ── سحب الصلاحيات ──
  // اللوحة كانت تمنح ولا تسحب، فالصلاحية الخطأ كان لا بد من حذفها بأمر SQL.
  // admin_revoke ترجع عدد الصفوف المحذوفة، فنعرض للمعلمة إن كان هناك ما يُحذف فعلاً.
  const revokeSpecific = (id: string) => {
    const sv = sel[id];
    if (!sv || !sv.target) {
      setMsg('اختر المرحلة أو الصف أولاً');
      return;
    }
    const supabase = createClient();

    if (sv.target.startsWith('stage:')) {
      const sid = sv.target.slice(6);
      if (!confirm('سحب صلاحية هذه المرحلة كاملة من الحساب؟')) return;
      act(id, () => supabase.rpc('admin_revoke', { p_user: id, p_kind: 'stage', p_stage: sid }), 'تم سحب المرحلة');
      return;
    }

    if (sv.target.startsWith('grade:')) {
      const gid = sv.target.slice(6);
      if (sv.subject) {
        if (!confirm('سحب صلاحية هذه المادة من الحساب؟')) return;
        act(id, () => supabase.rpc('admin_revoke', { p_user: id, p_kind: 'subject', p_subject: sv.subject }), 'تم سحب المادة');
      } else {
        if (!confirm('سحب صلاحية هذا الصف كاملاً من الحساب؟')) return;
        act(id, () => supabase.rpc('admin_revoke', { p_user: id, p_kind: 'grade', p_grade: gid }), 'تم سحب الصف');
      }
    }
  };

  const revokeAll = (id: string) => {
    if (!confirm('سحب كل صلاحيات هذا الحساب؟ سيُقفل عليه كل المحتوى، ويبقى الحساب فعّالاً ويمكن منحه من جديد.')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_revoke', { p_user: id, p_kind: 'all' }), 'تم سحب كل الصلاحيات');
  };

  const revokeGb = (id: string) => {
    if (!confirm('سحب اشتراك دفتر الدرجات من هذا الحساب؟')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_revoke', { p_user: id, p_kind: 'gradebook' }), 'تم سحب الدفتر');
  };

  // ── الأدوات المدفوعة ──
  // كل أداة لها عمود صلاحية مستقل في profiles. كانت اللوحة تدير الدفتر وحده،
  // فبقية الأدوات كانت تُفعَّل بأمر SQL يدوي. admin_set_tool تمنح وتسحب لأي منها.
  // الدفتر مستثنى عمدًا: له زرّاه القائمان أعلاه عبر admin_grant، وتُركا كما هما
  // حتى لا نغيّر مسارًا يعمل منذ شهور.
  const TOOLS: { key: string; label: string; emoji: string }[] = [
    { key: 'studio', label: 'ستوديو الحصة الذكية', emoji: '🎬' },
    { key: 'attendance', label: 'سجل الحضور', emoji: '🗓️' },
    { key: 'head_records', label: 'سجلات رئيس القسم', emoji: '🗂️' },
    { key: 'adventure', label: 'مغامرة المجموعات', emoji: '🚀' },
    { key: 'multiplication', label: 'جدول الضرب', emoji: '✖️' },
    { key: 'workshops', label: 'الورش التعليمية', emoji: '🎓' },
  ];

  const setTool = (id: string, tool: string, label: string, months: number) => {
    const q =
      months > 0
        ? `منح «${label}» لهذا الحساب ٦ أشهر؟`
        : `سحب «${label}» من هذا الحساب؟`;
    if (!confirm(q)) return;
    const supabase = createClient();
    act(
      id,
      () => supabase.rpc('admin_set_tool', { p_user: id, p_tool: tool, p_months: months }),
      months > 0 ? `تم منح ${label} ٦ أشهر ✅` : `تم سحب ${label}`
    );
  };

  // ── كلمة مرور مؤقتة ──
  // الدخول برقم الجوال ببريد داخلي وهمي، فلا استعادة ذاتية بالبريد.
  // تُعرض مرة واحدة هنا لتُرسل للمعلمة، ولا تُخزَّن في أي مكان.
  const [tempPw, setTempPw] = useState<{ name: string; password: string } | null>(null);

  const resetPassword = async (id: string, name: string) => {
    if (!confirm(`تعيين كلمة مرور مؤقتة لحساب «${name}»؟\nكلمة المرور الحالية لن تعمل بعدها.`))
      return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      const data = await res.json();
      if (!res.ok) setMsg('تعذّر: ' + (data?.error || 'خطأ غير معروف'));
      else setTempPw({ name: data.name || name, password: data.password });
    } catch {
      setMsg('تعذّر الاتصال بالخادم');
    }
    setBusy(null);
  };

  /**
   * حذف حساب نهائيًا.
   *
   * ⚠️ **لا رجعة فيه.** كل جداول المنصة مرتبطة بالحساب بحذفٍ متسلسل،
   * فيمضي معه: الفصول، وسجلّ الحضور، ودفتر الدرجات، وتقدّم القرآن،
   * والصلاحيات. ولا نسخة تُستعاد منها.
   *
   * ⚠️ ولهذا يُطلب كتابةُ رقم الحساب لا مجرّد تأكيد: الضغطُ بالخطأ
   * وارد، وكتابةُ رقمٍ بعينه لا تقع سهوًا. ويُقابَل المكتوب بالمخزَّن
   * **على الخادم** لا هنا، فلا يُتحايل عليه من المتصفح.
   */
  const deleteAccount = async (id: string, name: string, phone: string | null) => {
    const typed = prompt(
      `⚠️ حذف نهائي لحساب «${name}».\n\n` +
        'سيُحذف معه كل شيء: الفصول، وسجل الحضور، ودفتر الدرجات، وتقدّم القرآن.\n' +
        'ولا يمكن التراجع.\n\n' +
        'اكتب رقم جوال الحساب للتأكيد:'
    );
    if (typed === null) return;

    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, confirmPhone: typed.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setMsg('تعذّر: ' + (data?.error || 'خطأ غير معروف'));
      else {
        setMsg(`تم حذف حساب ${data.deleted} نهائيًا`);
        void load();
      }
    } catch {
      setMsg('تعذّر الاتصال بالخادم');
    }
    setBusy(null);
    void phone;
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
  const resetDevices = (id: string) => {
    if (!confirm('تصفير أجهزة هذا الحساب؟ ستُحذف الأجهزة المسجّلة ويقدر يفتح من جهازين جديدين.')) return;
    const supabase = createClient();
    act(id, () => supabase.rpc('admin_reset_devices', { p_user: id }), 'تم تصفير الأجهزة');
  };

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ar-KW') : '—');

  /** «قبل ٣ أيام» — أوضح من التاريخ وحده عند تصفّح قائمة طويلة */
  const sinceLabel = (s: string | null) => {
    if (!s) return '';
    const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
    if (days <= 0) return 'اليوم';
    if (days === 1) return 'أمس';
    if (days < 30) return `قبل ${days} يومًا`;
    const months = Math.floor(days / 30);
    return months === 1 ? 'قبل شهر' : `قبل ${months} أشهر`;
  };
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

  // خرائط الأسماء من الكتالوج — لتحويل معرّفات الصلاحيات إلى نص مفهوم
  const stageName: Record<string, string> = {};
  const gradeName: Record<string, string> = {};
  const subjectName: Record<string, string> = {};
  const subjectGrade: Record<string, string> = {};
  for (const c of cat) {
    stageName[c.stage_id] = c.stage_name;
    if (c.grade_id) gradeName[c.grade_id] = c.grade_name || '';
    if (c.subject_id) {
      subjectName[c.subject_id] = c.subject_name || '';
      if (c.grade_id) subjectGrade[c.subject_id] = c.grade_name || '';
    }
  }

  /** نص مقروء لصلاحية واحدة: «العلوم · الصف الخامس» بدل «subject» */
  const permLabel = (p: Perm): string => {
    if (p.scope === 'all') return 'وصول كامل — كل المواد';
    if (p.scope === 'stage') return `كل ${stageName[p.stage_id || ''] || 'المرحلة'}`;
    if (p.scope === 'grade') return `${gradeName[p.grade_id || ''] || 'صف'} — كل المواد`;
    if (p.scope === 'subject') {
      const s = subjectName[p.subject_id || ''] || 'مادة';
      const g = subjectGrade[p.subject_id || ''];
      return g ? `${s} · ${g}` : s;
    }
    return p.scope;
  };

  /** أقرب تاريخ انتهاء لهذا الحساب (المحتوى أو أي أداة) — أساس الترتيب والفلترة */
  const nearestEnd = (r: Row): number => {
    const dates = [r.sub_end, ...TOOL_COLS.map((c) => tools[r.id]?.[c] ?? null)]
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime())
      .filter((t) => !Number.isNaN(t) && t > Date.now());
    return dates.length ? Math.min(...dates) : Infinity;
  };

  const hasAnything = (r: Row): boolean =>
    Boolean(r.sub_end) || TOOL_COLS.some((c) => Boolean(tools[r.id]?.[c]));

  const DAY = 86400000;
  const matchesTab = (r: Row): boolean => {
    if (tab === 'all') return true;
    if (tab === 'suspended') return r.status === 'suspended';
    if (tab === 'none') return !hasAnything(r);
    const end = nearestEnd(r);
    const anyValid = end !== Infinity;
    if (tab === 'active') return r.status !== 'suspended' && anyValid;
    if (tab === 'soon') return r.status !== 'suspended' && anyValid && end - Date.now() <= 30 * DAY;
    if (tab === 'expired') return hasAnything(r) && !anyValid;
    return true;
  };

  const filtered = rows.filter(
    (r) =>
      !q ||
      (r.full_name || '').includes(q) ||
      (r.username || '').includes(q) ||
      (r.phone || '').includes(q) ||
      (r.email || '').includes(q)
  );
  const teachers = filtered
    .filter((r) => r.role !== 'admin')
    .filter(matchesTab)
    // الأقرب انتهاءً أولًا، فتطفو التجديدات المستحقّة إلى أعلى القائمة
    .sort((a, b) => nearestEnd(a) - nearestEnd(b));

  const tabCount = (k: TabKey) =>
    rows.filter((r) => r.role !== 'admin').filter((r) => {
      const save = tab;
      void save;
      if (k === 'all') return true;
      if (k === 'suspended') return r.status === 'suspended';
      if (k === 'none') return !hasAnything(r);
      const end = nearestEnd(r);
      const anyValid = end !== Infinity;
      if (k === 'active') return r.status !== 'suspended' && anyValid;
      if (k === 'soon') return r.status !== 'suspended' && anyValid && end - Date.now() <= 30 * DAY;
      if (k === 'expired') return hasAnything(r) && !anyValid;
      return true;
    }).length;

  const selCls = 'rounded-lg border border-sage/30 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sage';

  return (
    <main className="min-h-dvh px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* كلمة المرور المؤقتة — تظهر مرة واحدة ولا تُحفظ */}
      {tempPw && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="card-3d bg-white w-full max-w-md p-7 text-center">
            <span aria-hidden className="text-4xl">🔑</span>
            <h2 className="mt-3 text-lg font-extrabold text-ink">
              كلمة مرور مؤقتة لحساب «{tempPw.name}»
            </h2>
            <p className="mt-1.5 text-sm text-ink/55">
              أرسليها للمعلمة، واطلب منها تغييرها بعد الدخول.
            </p>

            <div
              dir="ltr"
              className="mt-5 rounded-xl border-2 border-dashed border-gold bg-gold-light/40 px-4 py-4 font-mono text-xl font-black text-ink tracking-wider select-all"
            >
              {tempPw.password}
            </div>

            <p className="mt-3 text-xs text-ink/50">
              ⚠️ لن تظهر مرة أخرى — انسخيها الآن. وكلمة المرور القديمة لم تعد تعمل.
            </p>

            <div className="mt-6 flex gap-2 justify-center">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(tempPw.password);
                  setMsg('نُسخت كلمة المرور ✅');
                }}
                className="rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-6 py-2.5 transition"
              >
                نسخ
              </button>
              <button
                onClick={() => setTempPw(null)}
                className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold px-6 py-2.5 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center gap-3 flex-wrap">
        <Logo size={44} />
        <div>
          <h1 className="text-2xl font-black text-sage-deep">لوحة التحكم</h1>
          <p className="text-sm text-ink/55">إدارة المشتركين والتفعيل المجاني</p>
        </div>
        <div className="flex-1" />
        <Link href="/admin/quran" className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-bold text-sm px-4 py-2 transition">
          🌿 منهج القرآن
        </Link>
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

      {/* تبويبات الفلترة — ضغطة واحدة توصل للمجموعة المطلوبة */}
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full text-sm font-bold px-3.5 py-1.5 border transition ${
                on
                  ? 'bg-sage-dark border-sage-dark text-white'
                  : 'bg-white border-sage/30 text-ink/70 hover:border-sage'
              }`}
            >
              {t.label}
              <span className={`ms-1.5 text-xs ${on ? 'text-white/80' : 'text-ink/45'}`}>
                {tabCount(t.key)}
              </span>
            </button>
          );
        })}
      </div>

      {msg && <p className="mt-4 rounded-xl bg-gold-light/70 text-gold-dark text-sm font-bold px-4 py-3 text-center">{msg}</p>}

      <div className="mt-5 space-y-3">
        {teachers.map((r) => {
          const contentOk = r.status === 'active' && stillValid(r.sub_end) && (r.access || '').length > 0;
          const gbOk = r.status !== 'suspended' && stillValid(r.gradebook_until);
          const isBusy = busy === r.id;
          const isOpen = openIds.has(r.id);
          const sv = sel[r.id] || {};
          const gid = sv.target && sv.target.startsWith('grade:') ? sv.target.slice(6) : '';
          const end = nearestEnd(r);
          const endLabel = end === Infinity ? null : fmt(new Date(end).toISOString());
          const endSoon = end !== Infinity && end - Date.now() <= 30 * DAY;
          const activeTools = TOOL_COLS.filter((c) => stillValid(tools[r.id]?.[c] ?? null));
          // نشطة خلال آخر ٧ أيام — مؤشّر سريع لمن يستفيد من اشتراكه فعلًا
          const activeRecently =
            !!r.last_active && Date.now() - new Date(r.last_active).getTime() <= 7 * DAY;
          return (
            <div key={r.id} className="card-3d p-5">
              {/* السطر المضغوط: اسم وحالة وأقرب انتهاء — والتفاصيل تنفتح بالضغط */}
              <button
                onClick={() => toggleOpen(r.id)}
                className="w-full flex items-center gap-3 text-right"
                aria-expanded={isOpen}
              >
                <span className={`text-ink/40 text-lg transition-transform ${isOpen ? 'rotate-90' : ''}`}>‹</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold text-ink truncate">{r.full_name || '—'}</span>
                  <span className="block text-sm text-ink/55 truncate" dir="ltr" style={{ textAlign: 'right' }}>
                    {r.phone || r.username || '—'}
                  </span>
                  {/* يُحدَّث عند الدخول وعند استخدام المنصة (touch_activity، مخنوق بساعة) */}
                  <span className={`block text-xs mt-0.5 ${activeRecently ? 'text-sage-dark font-bold' : 'text-ink/40'}`}>
                    آخر نشاط: {r.last_active ? `${fmt(r.last_active)} (${sinceLabel(r.last_active)})` : 'لم تدخل بعد'}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 flex-wrap justify-end text-xs font-bold">
                  {r.status === 'suspended' ? (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">موقوف</span>
                  ) : endLabel ? (
                    <span className={`px-2 py-0.5 rounded-full ${endSoon ? 'bg-gold-light text-gold-dark' : 'bg-sage-light text-sage-deep'}`}>
                      حتى {endLabel}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-50 text-ink/45 border border-gray-200">بلا اشتراك</span>
                  )}
                  {activeTools.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {activeTools.length} أدوات
                    </span>
                  )}
                </span>
              </button>

              {!isOpen ? null : (
              <div className="mt-4 pt-4 border-t border-sage/15">
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
                </div>

                {/* الصلاحيات مفصّلة بالاسم — أي مادة وأي صف بالضبط */}
                <div className="mt-2.5">
                  <div className="text-xs font-bold text-ink/45 mb-1">الصلاحيات</div>
                  {(perms[r.id] || []).length === 0 ? (
                    <span className="text-sm text-ink/45">لا توجد صلاحيات على المحتوى</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(perms[r.id] || []).map((p) => (
                        <span key={p.id} className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold border border-blue-100">
                          {permLabel(p)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  className={selCls}
                  value={sv.target || ''}
                  onChange={(e) => setSel({ ...sel, [r.id]: { target: e.target.value, subject: '' } })}
                >
                  <option value="">اختر المرحلة / الصف…</option>
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

                <button disabled={isBusy} onClick={() => revokeSpecific(r.id)}
                  className="rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  − سحب المحدَّد
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
                <button disabled={isBusy} onClick={() => revokeGb(r.id)}
                  className="rounded-lg border border-gold/50 bg-white hover:bg-gold-light text-gold-dark font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  − سحب الدفتر
                </button>
                <button disabled={isBusy} onClick={() => revokeAll(r.id)}
                  className="rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  🧹 سحب كل الصلاحيات
                </button>
              </div>

              {/* الأدوات المدفوعة الأخرى — كل أداة باشتراكها المستقل */}
              <div className="mt-3 pt-3 border-t border-sage/15">
                <div className="text-xs font-bold text-ink/45 mb-2">الأدوات المدفوعة</div>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((t) => {
                    const until = tools[r.id]?.[`${t.key}_until`] ?? null;
                    const on = stillValid(until);
                    return (
                    <span key={t.key} className={`inline-flex items-center rounded-lg border overflow-hidden ${on ? 'border-sage/50 bg-sage-light/40' : 'border-sage/25 bg-white'}`}>
                      <span className="px-2.5 py-1.5 text-sm font-bold text-ink/75">
                        {t.emoji} {t.label}
                        <span className={`ms-1.5 text-xs font-extrabold ${on ? 'text-sage-deep' : 'text-ink/40'}`}>
                          {on ? `حتى ${fmt(until)}` : 'مقفل'}
                        </span>
                      </span>
                      <button disabled={isBusy} onClick={() => setTool(r.id, t.key, t.label, 6)}
                        title={`منح ${t.label} ٦ أشهر`}
                        className="px-2.5 py-1.5 text-sm font-black text-sage-deep hover:bg-sage-light border-r border-sage/20 disabled:opacity-40 transition">
                        ＋
                      </button>
                      <button disabled={isBusy} onClick={() => setTool(r.id, t.key, t.label, 0)}
                        title={`سحب ${t.label}`}
                        className="px-2.5 py-1.5 text-sm font-black text-red-600 hover:bg-red-50 border-r border-sage/20 disabled:opacity-40 transition">
                        −
                      </button>
                    </span>
                    );
                  })}
                </div>
              </div>

              {/* إدارة الحساب نفسه */}
              <div className="mt-3 flex flex-wrap gap-2">
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
                <button disabled={isBusy} onClick={() => resetDevices(r.id)}
                  className="rounded-lg border border-gray-200 bg-white hover:border-sage text-ink/70 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  📱 تصفير الأجهزة
                </button>
                <button disabled={isBusy} onClick={() => resetPassword(r.id, r.full_name || 'هذا الحساب')}
                  className="rounded-lg border border-gray-200 bg-white hover:border-gold text-ink/70 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  🔑 كلمة مرور مؤقتة
                </button>
                {/* ⚠️ منفصلٌ عن إخوته بفاصل وبلونٍ مختلف: الحذف لا
                    رجعة فيه، فلا يُصفّ مع ما يُتراجَع عنه. */}
                <span className="mx-1 self-center text-gray-200">|</span>
                <button disabled={isBusy} onClick={() => deleteAccount(r.id, r.full_name || 'هذا الحساب', r.phone)}
                  className="rounded-lg border border-red-200 bg-white hover:border-red-400 hover:bg-red-50 text-red-700 font-bold text-sm px-3.5 py-2 disabled:opacity-50 transition">
                  🗑️ حذف الحساب نهائيًا
                </button>
                {isBusy && <span className="text-sm text-ink/50 self-center">جارٍ…</span>}
              </div>
              </div>
              )}
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
