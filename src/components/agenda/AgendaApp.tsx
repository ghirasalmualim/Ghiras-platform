'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ICON, ICONS, BG_LIST, BG_URL } from './assets';
import { PASTELS, pastel, type Canvas } from './creative-shared';
import CreativePlanner from './CreativePlanner';

/** أيقونة ثلاثية الأبعاد */
function Icon({ k, size = 22, className = '' }: { k: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ICON(k)} alt="" width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} />;
}

/* ============================ الأنواع ============================ */
type Priority = 'normal' | 'important';
type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export interface Task {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  priority: Priority;
  note?: string;
  done: boolean;
  doneAt?: number;
  star?: boolean;
  repeat: Repeat;
  createdAt: number;
  color?: string; // مفتاح باستيل (الوضع الهادئ)
}
export interface AgendaEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: string; // مفتاح من ETYPES
  title: string;
  note?: string;
  createdAt: number;
}
export interface AchImage {
  id: string;
  path?: string; // مسار Storage (الوضع الحقيقي)
  url?: string; // dataURL في وضع demo فقط
}
export interface Achievement {
  id: string;
  title: string;
  date: string;
  desc?: string;
  place?: string; // مكان الفعالية (للنموذج الرسمي)
  audience?: string; // الفئة المستهدفة
  images: AchImage[];
  createdAt: number;
}
/* بيانات ترويسة/تذييل ملف الإنجاز الرسمي (تُحفظ وتُعاد) */
export interface PortfolioMeta {
  region?: string; // المنطقة التعليمية
  school?: string; // المدرسة
  dept?: string; // القسم
  teacher?: string; // اسم المعلم/ة
  head?: string; // رئيسة القسم
  principal?: string; // مديرة المدرسة
  logo?: string; // شعار المدرسة (dataURL اختياري)
}
export interface AgendaData {
  _v: number;
  tasks: Task[];
  events: AgendaEvent[];
  weekly: Record<string, { priorities?: string[] }>;
  notes: Record<string, string>;
  achievements: Achievement[];
  harvest: Record<string, unknown>;
  bg?: string; // معرّف خلفية ورقية (اختياري)
  mode?: 'simple' | 'creative';
  canvas?: Canvas;
  portfolioMeta?: PortfolioMeta;
}

/* ضغط الصورة في المتصفّح قبل الرفع — جودة عالية بحجم صغير */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  let { width: w, height: h } = img;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
type Tab = 'today' | 'week' | 'month' | 'ach' | 'harvest';

/** أنواع الأحداث/المواعيد — لون لكل نوع للمؤشّرات في التقويم */
const ETYPES: { k: string; l: string; color: string; icon: string }[] = [
  { k: 'appt', l: 'موعد', color: '#7A9E7E', icon: 'meet' },
  { k: 'meeting', l: 'اجتماع', color: '#41603F', icon: 'meet' },
  { k: 'exam', l: 'اختبار', color: '#C1121F', icon: 'exams' },
  { k: 'grades', l: 'تسليم درجات', color: '#8A5CC9', icon: 'exams' },
  { k: 'visit', l: 'زيارة إشرافية', color: '#2E86AB', icon: 'visit' },
  { k: 'event', l: 'فعالية', color: '#C9A84C', icon: 'act' },
  { k: 'contest', l: 'مسابقة', color: '#E4572E', icon: 'act' },
  { k: 'note', l: 'ملاحظة', color: '#8A8F8A', icon: 'circulars' },
  { k: 'other', l: 'حدث آخر', color: '#8A8F8A', icon: 'circulars' },
];
const etype = (k: string) => ETYPES.find((t) => t.k === k) || ETYPES[0];

/* ============================ أدوات ============================ */
const AR = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const DISP = { fontFamily: "var(--font-cairo), 'Tajawal', sans-serif" } as const;
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MO = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const longDate = (s: string) => {
  const d = parseISO(s);
  return `${WD[d.getDay()]}، ${AR(d.getDate())} ${MO[d.getMonth()]} ${AR(d.getFullYear())}`;
};
const shortDate = (s: string) => {
  const d = parseISO(s);
  return `${WD[d.getDay()]} ${AR(d.getDate())} ${MO[d.getMonth()]}`;
};
const uid = () => 'k' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const addMonths = (s: string, n: number) => {
  const d = parseISO(s);
  d.setMonth(d.getMonth() + n);
  return iso(d);
};
const nextOccurrence = (s: string, r: Repeat) =>
  r === 'daily' ? addDays(s, 1) : r === 'weekly' ? addDays(s, 7) : r === 'monthly' ? addMonths(s, 1) : s;
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : h < 17 ? 'طاب يومك' : 'مساء الخير';
};

/* ============================ المكوّن ============================ */
export default function AgendaApp({
  initial,
  demo = false,
  firstName = '',
}: {
  initial: AgendaData;
  demo?: boolean;
  firstName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [data, setData] = useState<AgendaData>(() => normalize(initial));
  const [tab, setTab] = useState<Tab>('today');
  const [sync, setSync] = useState<'ok' | 'saving' | 'local'>('ok');
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  /* حفظ سحابي مؤجّل */
  const persist = useCallback(
    (next: AgendaData) => {
      if (demo) return;
      if (saveT.current) clearTimeout(saveT.current);
      setSync('saving');
      saveT.current = setTimeout(async () => {
        try {
          const r = await fetch('/api/my-agenda', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: next }),
          });
          setSync(r.ok ? 'ok' : 'local');
        } catch {
          setSync('local');
        }
      }, 700);
    },
    [demo]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    persist(data);
  }, [data, persist]);

  useEffect(() => {
    const flush = () => {
      if (demo || document.visibilityState !== 'hidden') return;
      try {
        navigator.sendBeacon('/api/my-agenda', new Blob([JSON.stringify({ data })], { type: 'application/json' }));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [data, demo]);

  const mutate = (fn: (d: AgendaData) => AgendaData) => setData((d) => fn(structuredCloneSafe(d)));

  /* ============================ عمليات المهام ============================ */
  const addTask = (t: Omit<Task, 'id' | 'done' | 'createdAt'>) =>
    mutate((d) => {
      d.tasks.push({ ...t, id: uid(), done: false, createdAt: Date.now() });
      return d;
    });
  const updateTask = (id: string, patch: Partial<Task>) =>
    mutate((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
      return d;
    });
  const delTask = (id: string) =>
    mutate((d) => {
      d.tasks = d.tasks.filter((x) => x.id !== id);
      return d;
    });
  const toggleDone = (id: string) =>
    mutate((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return d;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : undefined;
      // مهمة متكررة: عند إنجازها نولّد النسخة القادمة
      if (t.done && t.repeat !== 'none') {
        d.tasks.push({
          ...t,
          id: uid(),
          date: nextOccurrence(t.date, t.repeat),
          done: false,
          doneAt: undefined,
          createdAt: Date.now(),
        });
      }
      return d;
    });

  /* أحداث/مواعيد */
  const addEvent = (e: Omit<AgendaEvent, 'id' | 'createdAt'>) =>
    mutate((d) => {
      d.events.push({ ...e, id: uid(), createdAt: Date.now() });
      return d;
    });
  const updateEvent = (id: string, patch: Partial<AgendaEvent>) =>
    mutate((d) => {
      const e = d.events.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
      return d;
    });
  const delEvent = (id: string) =>
    mutate((d) => {
      d.events = d.events.filter((x) => x.id !== id);
      return d;
    });

  const [editing, setEditing] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [presetDate, setPresetDate] = useState<string | undefined>(undefined);
  const openAdd = (date?: string) => {
    setEditing(null);
    setPresetDate(date);
    setShowForm(true);
  };
  const setMode = (m: 'simple' | 'creative') =>
    mutate((d) => {
      d.mode = m;
      return d;
    });
  const updateCanvas = (c: Canvas) =>
    mutate((d) => {
      d.canvas = c;
      return d;
    });
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [eventEditing, setEventEditing] = useState<AgendaEvent | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventPreset, setEventPreset] = useState<string | undefined>(undefined);
  const openEvent = (date?: string, ev?: AgendaEvent) => {
    setEventEditing(ev || null);
    setEventPreset(date);
    setShowEventForm(true);
  };

  /* ===== الإنجازات + الصور ===== */
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const resolvedRef = useRef<Set<string>>(new Set());
  const uploadImage = useCallback(
    async (dataUrl: string): Promise<AchImage> => {
      if (demo) return { id: uid(), url: dataUrl };
      const r = await fetch('/api/my-agenda/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
      if (!r.ok) throw new Error('upload_failed');
      const j = await r.json();
      if (j.path && j.url) {
        resolvedRef.current.add(j.path);
        setUrlMap((m) => ({ ...m, [j.path]: j.url }));
      }
      return { id: uid(), path: j.path };
    },
    [demo]
  );
  const removeImage = useCallback(
    async (img: AchImage) => {
      if (!demo && img.path) {
        try {
          await fetch('/api/my-agenda/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: img.path }) });
        } catch {
          /* تجاهل */
        }
      }
    },
    [demo]
  );
  const imgUrl = useCallback((img: AchImage) => img.url || (img.path ? urlMap[img.path] : undefined), [urlMap]);

  useEffect(() => {
    if (demo) return;
    const need = Array.from(new Set(data.achievements.flatMap((a) => a.images.map((i) => i.path)).filter((p): p is string => !!p && !resolvedRef.current.has(p))));
    if (!need.length) return;
    need.forEach((p) => resolvedRef.current.add(p));
    fetch('/api/my-agenda/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: need }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.urls) setUrlMap((m) => ({ ...m, ...j.urls }));
      })
      .catch(() => {});
  }, [data.achievements, demo]);

  const addAch = (a: Omit<Achievement, 'id' | 'createdAt'>) =>
    mutate((d) => {
      d.achievements.unshift({ ...a, id: uid(), createdAt: Date.now() });
      return d;
    });
  const updateAch = (id: string, patch: Partial<Achievement>) =>
    mutate((d) => {
      const a = d.achievements.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
      return d;
    });
  const delAch = async (a: Achievement) => {
    for (const img of a.images) await removeImage(img);
    mutate((d) => {
      d.achievements = d.achievements.filter((x) => x.id !== a.id);
      return d;
    });
  };
  const [achEditing, setAchEditing] = useState<Achievement | null>(null);
  const [showAchForm, setShowAchForm] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);

  const setHarvest = (mk: string, patch: Record<string, unknown>) =>
    mutate((d) => {
      d.harvest[mk] = { ...((d.harvest[mk] as Record<string, unknown>) || {}), ...patch };
      return d;
    });
  const [showBg, setShowBg] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const setBg = (id: string | null) =>
    mutate((d) => {
      if (id) d.bg = id;
      else delete d.bg;
      return d;
    });

  if (!mounted) return <div className="min-h-[100dvh] bg-cream" />;

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8 relative" dir="rtl">
      {/* خلفية ورقية اختيارية خلف كل الشاشة */}
      {data.bg && (
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{ backgroundImage: `url(${BG_URL(data.bg)})` }}
          />
          <div className="absolute inset-0 bg-cream/82" />
        </div>
      )}
      {/* الشريط العلوي */}
      <header className="sticky top-0 z-20 bg-cream/85 backdrop-blur-md border-b border-sage/15">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <a
            href="/"
            className="shrink-0 rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-4 py-2 transition-colors"
          >
            → غراس
          </a>
          <div className="flex-1 text-center">
            <div className="font-extrabold text-sage-deep text-lg leading-tight" style={DISP}>أجندتي</div>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            aria-label="بحث"
            className="shrink-0 w-9 h-9 rounded-xl border border-sage/30 bg-white hover:border-sage text-base transition-colors"
          >
            🔍
          </button>
          <button
            onClick={() => setShowBg(true)}
            aria-label="الخلفية"
            className="shrink-0 w-9 h-9 rounded-xl border border-sage/30 bg-white hover:border-sage text-base transition-colors"
          >
            🎨
          </button>
          <span
            className={`shrink-0 text-[11px] font-bold rounded-full px-3 py-1.5 ${
              sync === 'saving' ? 'bg-gold-light text-gold-dark' : sync === 'local' ? 'bg-red-50 text-red-500' : 'bg-sage-light text-sage-deep'
            }`}
          >
            {sync === 'saving' ? 'جارٍ الحفظ…' : sync === 'local' ? 'محلي ⚠︎' : 'محفوظ ☁︎'}
          </span>
        </div>
        {/* تبويبات (كمبيوتر/آيباد) */}
        <nav className="hidden md:flex mx-auto max-w-3xl px-4 pb-2 gap-1">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                tab === t.k ? 'bg-sage-deep text-white shadow-soft' : 'text-sage-deep hover:bg-sage-light'
              }`}
            >
              <Icon k={t.icon} size={20} />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {tab === 'today' && (
          <>
            <ModeToggle mode={data.mode || 'simple'} onSet={setMode} />
            {data.mode === 'creative' ? (
              <CreativePlanner canvas={data.canvas || { els: [] }} onCommit={updateCanvas} />
            ) : (
              <TodayView
                data={data}
                firstName={firstName}
                onToggle={toggleDone}
                onDelete={delTask}
                onEdit={(t) => {
                  setEditing(t);
                  setShowForm(true);
                }}
                onStar={(id, v) => updateTask(id, { star: v })}
                onColor={(id, c) => updateTask(id, { color: c })}
                onDate={(id, dt) => updateTask(id, { date: dt })}
                onMoveToday={(id) => updateTask(id, { date: todayISO() })}
                onSetNote={(day, text) =>
                  mutate((d) => {
                    if (text.trim()) d.notes[day] = text;
                    else delete d.notes[day];
                    return d;
                  })
                }
                onAdd={() => openAdd()}
                onOpenDay={(d) => setDayOpen(d)}
              />
            )}
          </>
        )}
        {tab === 'week' && (
          <WeekView
            data={data}
            onEdit={(t) => {
              setEditing(t);
              setShowForm(true);
            }}
            onAddDay={(date) => openAdd(date)}
            onSetPriorities={(wk, arr) =>
              mutate((d) => {
                d.weekly[wk] = { ...(d.weekly[wk] || {}), priorities: arr };
                return d;
              })
            }
          />
        )}
        {tab === 'month' && <MonthView data={data} onOpenDay={(d) => setDayOpen(d)} />}
        {tab === 'ach' && (
          <AchView
            data={data}
            imgUrl={imgUrl}
            onAdd={() => {
              setAchEditing(null);
              setShowAchForm(true);
            }}
            onEdit={(a) => {
              setAchEditing(a);
              setShowAchForm(true);
            }}
            onDelete={delAch}
            onPortfolio={() => setShowPortfolio(true)}
          />
        )}
        {tab === 'harvest' && <HarvestView data={data} imgUrl={imgUrl} onSetHarvest={setHarvest} />}
      </main>

      {/* تنقّل سفلي (هاتف) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-sage/15 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl flex">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition-colors ${
                tab === t.k ? 'text-sage-deep' : 'text-sage/60'
              }`}
            >
              <Icon k={t.icon} size={26} className={`transition-transform ${tab === t.k ? 'scale-110' : 'opacity-70'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {showBg && <BgPicker current={data.bg} onPick={setBg} onClose={() => setShowBg(false)} />}

      {showSearch && (
        <SearchSheet
          data={data}
          onClose={() => setShowSearch(false)}
          onGoDay={(d) => {
            setShowSearch(false);
            setDayOpen(d);
          }}
          onGoTask={(t) => {
            setShowSearch(false);
            setEditing(t);
            setShowForm(true);
          }}
          onGoEvent={(e) => {
            setShowSearch(false);
            openEvent(undefined, e);
          }}
          onGoAch={() => {
            setShowSearch(false);
            setTab('ach');
          }}
        />
      )}

      {showForm && (
        <TaskForm
          task={editing}
          presetDate={presetDate}
          onClose={() => setShowForm(false)}
          onSave={(t) => {
            if (editing) updateTask(editing.id, t);
            else addTask(t);
            setShowForm(false);
          }}
          onDelete={
            editing
              ? () => {
                  delTask(editing.id);
                  setShowForm(false);
                }
              : undefined
          }
        />
      )}

      {dayOpen && (
        <DaySheet
          day={dayOpen}
          data={data}
          onClose={() => setDayOpen(null)}
          onToggleTask={toggleDone}
          onEditTask={(t) => {
            setEditing(t);
            setShowForm(true);
          }}
          onAddTask={(d) => openAdd(d)}
          onAddEvent={(d) => openEvent(d)}
          onEditEvent={(e) => openEvent(undefined, e)}
        />
      )}

      {showPortfolio && (
        <PortfolioBuilder
          data={data}
          imgUrl={imgUrl}
          firstName={firstName}
          onSaveMeta={(m) =>
            mutate((d) => {
              d.portfolioMeta = m;
              return d;
            })
          }
          onClose={() => setShowPortfolio(false)}
        />
      )}

      {showAchForm && (
        <AchForm
          ach={achEditing}
          imgUrl={imgUrl}
          uploadImage={uploadImage}
          removeImage={removeImage}
          onClose={() => setShowAchForm(false)}
          onSave={(a) => {
            if (achEditing) updateAch(achEditing.id, a);
            else addAch(a);
            setShowAchForm(false);
          }}
          onDelete={
            achEditing
              ? async () => {
                  await delAch(achEditing);
                  setShowAchForm(false);
                }
              : undefined
          }
        />
      )}

      {showEventForm && (
        <EventForm
          event={eventEditing}
          presetDate={eventPreset}
          onClose={() => setShowEventForm(false)}
          onSave={(e) => {
            if (eventEditing) updateEvent(eventEditing.id, e);
            else addEvent(e);
            setShowEventForm(false);
          }}
          onDelete={
            eventEditing
              ? () => {
                  delEvent(eventEditing.id);
                  setShowEventForm(false);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'today', label: 'اليوم', icon: ICONS.today },
  { k: 'week', label: 'أسبوعي', icon: ICONS.week },
  { k: 'month', label: 'شهري', icon: ICONS.month },
  { k: 'ach', label: 'إنجازاتي', icon: ICONS.ach },
  { k: 'harvest', label: 'حصاد الشهر', icon: ICONS.harvest },
];

/* ============================ مبدّل الوضعين ============================ */
function ModeToggle({ mode, onSet }: { mode: 'simple' | 'creative'; onSet: (m: 'simple' | 'creative') => void }) {
  return (
    <div className="flex bg-sage-light rounded-full p-1 mb-4">
      {(
        [
          ['simple', '🌿 الهادئ'],
          ['creative', '✨ الإبداعي'],
        ] as const
      ).map(([k, l]) => (
        <button
          key={k}
          onClick={() => onSet(k)}
          className={`flex-1 rounded-full py-2 text-sm font-extrabold transition-colors ${mode === k ? 'bg-white text-sage-deep shadow-soft' : 'text-sage-deep/60'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* ============================ صفحة اليوم ============================ */
function TodayView({
  data,
  firstName,
  onToggle,
  onDelete,
  onEdit,
  onStar,
  onColor,
  onDate,
  onMoveToday,
  onSetNote,
  onAdd,
  onOpenDay,
}: {
  data: AgendaData;
  firstName: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Task) => void;
  onStar: (id: string, v: boolean) => void;
  onColor: (id: string, c: string) => void;
  onDate: (id: string, d: string) => void;
  onMoveToday: (id: string) => void;
  onSetNote: (day: string, text: string) => void;
  onAdd: () => void;
  onOpenDay: (day: string) => void;
}) {
  const today = todayISO();
  const [filter, setFilter] = useState<'all' | 'today' | 'up' | 'done'>('today');
  const [selId, setSelId] = useState<string | null>(null);

  const todayTasks = data.tasks.filter((t) => t.date === today);
  const overdue = data.tasks.filter((t) => t.date < today && !t.done);
  const doneToday = todayTasks.filter((t) => t.done).length;
  const upcoming = useMemo(
    () =>
      [...data.events]
        .filter((e) => e.date >= today)
        .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || '')))
        .slice(0, 5),
    [data.events, today]
  );

  const filtered = useMemo(() => {
    let list = data.tasks;
    if (filter === 'today') list = list.filter((t) => t.date === today);
    else if (filter === 'up') list = list.filter((t) => t.date > today && !t.done);
    else if (filter === 'done') list = list.filter((t) => t.done);
    return [...list].sort((a, b) =>
      a.done !== b.done ? (a.done ? 1 : -1) : a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || '')
    );
  }, [data.tasks, filter, today]);

  const note = data.notes[today] || '';

  return (
    <div className="space-y-5">
      {/* الترحيب */}
      <div>
        <h1 className="text-2xl font-extrabold text-sage-deep" style={DISP}>
          {greeting()} <span className="align-middle">🌿</span>
          {firstName ? <span className="text-sage"> {firstName}</span> : null}
        </h1>
        <p className="text-sage font-bold mt-0.5">{longDate(today)}</p>
        <div className="gold-thread mt-3" />
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-3 gap-3">
        <Stat n={todayTasks.length} label="مهام اليوم" icon={ICONS.tasks} />
        <Stat n={upcoming.length} label="مواعيد قريبة" icon={ICONS.eventsUpcoming} />
        <Stat n={doneToday} label="أنجزت اليوم" icon={ICONS.doneToday} />
      </div>

      {/* قريبًا */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Icon k={ICONS.eventsUpcoming} size={24} />
            <h2 className="font-extrabold text-sage-deep text-lg">قريبًا</h2>
          </div>
          <div className="space-y-2">
            {upcoming.map((e) => {
              const ty = etype(e.type);
              return (
                <button
                  key={e.id}
                  onClick={() => onOpenDay(e.date)}
                  className="card-3d w-full text-right p-3 flex items-center gap-3"
                >
                  <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: ty.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink text-[15px] truncate">{e.title}</div>
                    <div className="text-[11.5px] text-sage/80 font-bold mt-0.5">
                      {ty.l} · {shortDate(e.date)}
                      {e.time ? ` — ${AR(e.time)}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0 text-sage/40">‹</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* مهام متأخرة */}
      {overdue.length > 0 && (
        <section className="card-3d p-4 border-r-4 !border-r-gold">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⏳</span>
            <h2 className="font-extrabold text-sage-deep">مهام متأخّرة ({AR(overdue.length)})</h2>
          </div>
          <div className="space-y-2">
            {overdue.map((t) => (
              <div key={t.id} className="flex items-center gap-2 flex-wrap bg-cream/70 rounded-soft p-2.5">
                <span className="flex-1 font-bold text-ink text-sm min-w-0">
                  {t.star ? '⭐ ' : ''}
                  {t.title}
                  <span className="text-sage/70 font-normal"> · {shortDate(t.date)}</span>
                </span>
                <button onClick={() => onToggle(t.id)} className="text-[12px] font-bold text-white bg-sage-deep rounded-lg px-2.5 py-1.5">
                  إنجاز الآن
                </button>
                <button onClick={() => onMoveToday(t.id)} className="text-[12px] font-bold text-sage-deep bg-sage-light rounded-lg px-2.5 py-1.5">
                  نقل لليوم
                </button>
                <button onClick={() => onEdit(t)} className="text-[12px] font-bold text-sage-deep bg-white border border-sage/30 rounded-lg px-2.5 py-1.5">
                  تاريخ جديد
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* المهام + الفلترة */}
      <section>
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="font-extrabold text-sage-deep text-lg">مهامي</h2>
          <div className="flex bg-sage-light rounded-full p-0.5 text-[12px] font-bold">
            {(
              [
                ['today', 'اليوم'],
                ['all', 'الكل'],
                ['up', 'القادمة'],
                ['done', 'المكتملة'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-2.5 py-1 transition-colors ${filter === k ? 'bg-white text-sage-deep shadow-soft' : 'text-sage-deep/70'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyTasks onAdd={onAdd} filter={filter} />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                selected={selId === t.id}
                onSelect={() => setSelId(selId === t.id ? null : t.id)}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onStar={onStar}
                onColor={onColor}
                onDate={onDate}
              />
            ))}
          </div>
        )}

        <button
          onClick={onAdd}
          className="mt-3 w-full rounded-card bg-sage-deep text-white font-extrabold py-3.5 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all active:translate-y-0"
        >
          ＋ إضافة مهمة
        </button>
      </section>

      {/* ملاحظة اليوم */}
      <section className="card-3d p-4">
        <div className="flex items-center gap-2 mb-2">
          <span>📝</span>
          <h2 className="font-extrabold text-sage-deep">ملاحظة اليوم</h2>
        </div>
        <textarea
          defaultValue={note}
          onBlur={(e) => onSetNote(today, e.target.value)}
          placeholder="سطر سريع تحبّين تتذكّرينه اليوم…"
          rows={2}
          className="w-full resize-none rounded-soft border border-sage/20 bg-cream/60 p-3 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:border-sage"
        />
      </section>
    </div>
  );
}

function Stat({ n, label, icon }: { n: number; label: string; icon: string }) {
  return (
    <div className="card-3d p-3 text-center">
      <Icon k={icon} size={34} className="mx-auto mb-1" />
      <div className="text-2xl font-extrabold text-sage-deep leading-none">{AR(n)}</div>
      <div className="text-[11px] font-bold text-sage mt-1">{label}</div>
    </div>
  );
}

function TaskRow({
  t,
  selected,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onStar,
  onColor,
  onDate,
}: {
  t: Task;
  selected: boolean;
  onSelect: () => void;
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStar: (id: string, v: boolean) => void;
  onColor: (id: string, c: string) => void;
  onDate: (id: string, d: string) => void;
}) {
  const tint = pastel(t.color);
  return (
    <div
      className={`card-3d overflow-hidden ${t.done ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-sage/40' : ''}`}
      style={tint && t.color !== 'none' ? { background: tint } : undefined}
    >
      <div className="p-3 flex items-center gap-3">
        <button
          onClick={() => onToggle(t.id)}
          aria-label="تبديل الإنجاز"
          className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
            t.done ? 'bg-sage-deep border-sage-deep text-white' : 'border-sage/50 text-transparent hover:border-sage bg-white/60'
          }`}
        >
          <span className={`transition-transform duration-200 ${t.done ? 'scale-100' : 'scale-0'}`}>✓</span>
        </button>
        <button onClick={onSelect} className="flex-1 min-w-0 text-right">
          <div className={`font-bold text-ink text-[15px] leading-snug ${t.done ? 'line-through' : ''}`}>
            {t.priority === 'important' && !t.done ? <span className="text-gold-dark">‼ </span> : null}
            {t.star ? '⭐ ' : ''}
            {t.title}
          </div>
          <div className="text-[11.5px] text-sage/80 font-bold mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{shortDate(t.date)}</span>
            {t.time ? <span>· {AR(t.time)}</span> : null}
            {t.repeat !== 'none' ? <span className="text-sage-deep">· 🔁 {t.repeat === 'daily' ? 'يومي' : t.repeat === 'weekly' ? 'أسبوعي' : 'شهري'}</span> : null}
            {t.note ? <span className="text-sage/60 font-normal">· {t.note}</span> : null}
          </div>
        </button>
        <button onClick={onSelect} className="shrink-0 text-sage-deep/50 hover:text-sage-deep px-1 text-lg leading-none" aria-label="أدوات">
          ⋯
        </button>
      </div>
      {/* شريط أدوات المهمة */}
      {selected && (
        <div className="px-3 pb-3 pt-1 border-t border-black/5 bg-white/40 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {PASTELS.map((p) => (
              <button
                key={p.k}
                onClick={() => onColor(t.id, p.k)}
                title={p.n}
                className={`w-6 h-6 rounded-full border ${t.color === p.k || (!t.color && p.k === 'none') ? 'ring-2 ring-sage-deep border-white' : 'border-black/10'}`}
                style={{ background: p.c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onStar(t.id, !t.star)} className="rounded-lg bg-white border border-sage/20 px-3 py-1.5 text-[13px] font-bold text-sage-deep">
              {t.star ? '⭐ مميّزة' : '☆ تمييز'}
            </button>
            <button onClick={() => onEdit(t)} className="rounded-lg bg-white border border-sage/20 px-3 py-1.5 text-[13px] font-bold text-sage-deep">
              ✏️ تعديل
            </button>
            <label className="rounded-lg bg-white border border-sage/20 px-3 py-1.5 text-[13px] font-bold text-sage-deep cursor-pointer relative">
              📅 التاريخ
              <input type="date" value={t.date} onChange={(e) => e.target.value && onDate(t.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <button onClick={() => onDelete(t.id)} className="rounded-lg bg-white border border-red-200 px-3 py-1.5 text-[13px] font-bold text-red-500 mr-auto">
              🗑 حذف
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyTasks({ onAdd, filter }: { onAdd: () => void; filter: string }) {
  const msg =
    filter === 'done' ? 'ما فيه مهام مكتملة بعد.' : filter === 'up' ? 'ما فيه مهام قادمة.' : 'يومك صافٍ — أضيفي أول مهمة.';
  return (
    <div className="card-3d p-6 text-center">
      <div className="text-3xl mb-2">🌿</div>
      <p className="text-sage-deep font-bold">{msg}</p>
    </div>
  );
}

/* ============================ نموذج المهمة ============================ */
function TaskForm({
  task,
  presetDate,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  presetDate?: string;
  onClose: () => void;
  onSave: (t: Omit<Task, 'id' | 'done' | 'createdAt'>) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [date, setDate] = useState(task?.date || presetDate || todayISO());
  const [time, setTime] = useState(task?.time || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'normal');
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat || 'none');
  const [note, setNote] = useState(task?.note || '');

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      date,
      time: time || undefined,
      priority,
      repeat,
      note: note.trim() || undefined,
      star: task?.star,
      doneAt: task?.doneAt,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full md:max-w-md bg-cream rounded-t-card md:rounded-card shadow-lift p-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sage-deep text-lg">{task ? 'تعديل المهمة' : 'مهمة جديدة'}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white text-sage-deep font-bold">✕</button>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">اسم المهمة</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="مثال: تجهيز نشاط الصف الخامس"
          className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-3"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">الوقت (اختياري)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">الأولوية</label>
        <div className="flex gap-2 mb-3">
          {(
            [
              ['normal', 'عادية'],
              ['important', 'مهمة ‼'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPriority(k)}
              className={`flex-1 rounded-soft py-2.5 font-bold text-sm transition-colors ${priority === k ? 'bg-sage-deep text-white' : 'bg-white text-sage-deep border border-sage/25'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">التكرار</label>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {(
            [
              ['none', 'بدون'],
              ['daily', 'يومي'],
              ['weekly', 'أسبوعي'],
              ['monthly', 'شهري'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setRepeat(k)}
              className={`rounded-soft py-2 font-bold text-[13px] transition-colors ${repeat === k ? 'bg-gold text-white' : 'bg-white text-sage-deep border border-sage/25'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">ملاحظة قصيرة (اختياري)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-4" />

        <button onClick={save} className="w-full rounded-card bg-sage-deep text-white font-extrabold py-3.5 shadow-soft">
          {task ? 'حفظ' : '＋ إضافة'}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="w-full mt-2 rounded-card bg-white text-red-500 border border-red-200 font-bold py-3">
            🗑️ حذف المهمة
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================ العرض الأسبوعي ============================ */
const weekStartOf = (s: string) => {
  const d = parseISO(s);
  d.setDate(d.getDate() - d.getDay()); // الأحد بداية الأسبوع
  return iso(d);
};

function WeekView({
  data,
  onEdit,
  onAddDay,
  onSetPriorities,
}: {
  data: AgendaData;
  onEdit: (t: Task) => void;
  onAddDay: (date: string) => void;
  onSetPriorities: (weekKey: string, arr: string[]) => void;
}) {
  const [anchor, setAnchor] = useState(todayISO());
  const start = weekStartOf(anchor);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const priorities = data.weekly[start]?.priorities || ['', '', ''];
  const today = todayISO();
  const range = `${AR(parseISO(days[0]).getDate())} ${MO[parseISO(days[0]).getMonth()]} — ${AR(parseISO(days[6]).getDate())} ${MO[parseISO(days[6]).getMonth()]}`;

  const savePr = (i: number, v: string) => {
    const arr = [...priorities];
    arr[i] = v;
    onSetPriorities(start, arr);
  };

  return (
    <div className="space-y-5">
      {/* التنقّل بين الأسابيع */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setAnchor(addDays(anchor, -7))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          ‹ السابق
        </button>
        <div className="text-center">
          <div className="font-extrabold text-sage-deep flex items-center justify-center gap-1.5">
            <Icon k={ICONS.week} size={22} /> {range}
          </div>
          <button onClick={() => setAnchor(todayISO())} className="text-[11px] font-bold text-sage hover:text-sage-deep mt-0.5">
            هذا الأسبوع
          </button>
        </div>
        <button onClick={() => setAnchor(addDays(anchor, 7))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          التالي ›
        </button>
      </div>

      {/* أهم ٣ أولويات */}
      <section className="card-3d p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon k={ICONS.students} size={24} />
          <h2 className="font-extrabold text-sage-deep">أهم ٣ أولويات هذا الأسبوع</h2>
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0 w-7 h-7 rounded-lg bg-gold-light text-gold-dark font-extrabold flex items-center justify-center text-sm">
                {AR(i + 1)}
              </span>
              <input
                defaultValue={priorities[i] || ''}
                key={start + i}
                onBlur={(e) => savePr(i, e.target.value)}
                placeholder="اكتبي أولوية…"
                className="flex-1 rounded-soft border border-sage/20 bg-cream/60 px-3 py-2 text-sm text-ink placeholder:text-sage/45 focus:outline-none focus:border-sage"
              />
            </div>
          ))}
        </div>
      </section>

      {/* الأيام */}
      <div className="space-y-2.5">
        {days.map((d) => {
          const dayTasks = data.tasks
            .filter((t) => t.date === d)
            .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : (a.time || '').localeCompare(b.time || '')));
          const isToday = d === today;
          return (
            <section key={d} className={`card-3d p-3 ${isToday ? '!border-r-4 !border-r-gold' : ''}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="font-extrabold text-sage-deep flex items-center gap-2">
                  {WD[parseISO(d).getDay()]}
                  <span className="text-sage/70 font-bold text-sm">{AR(parseISO(d).getDate())}</span>
                  {isToday ? <span className="text-[10px] bg-gold text-white rounded-full px-2 py-0.5">اليوم</span> : null}
                </div>
                <button onClick={() => onAddDay(d)} className="text-sage-deep/70 hover:text-sage-deep text-lg leading-none w-7 h-7" aria-label="إضافة">
                  ＋
                </button>
              </div>
              {dayTasks.length === 0 ? (
                <div className="text-[12.5px] text-sage/45 font-bold py-1">— لا مهام</div>
              ) : (
                <div className="space-y-1">
                  {dayTasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onEdit(t)}
                      className={`w-full text-right flex items-center gap-2 text-[13.5px] rounded-lg px-2 py-1.5 hover:bg-sage-light/60 ${t.done ? 'opacity-55 line-through' : ''}`}
                    >
                      <span className={`shrink-0 w-2 h-2 rounded-full ${t.done ? 'bg-sage' : t.priority === 'important' ? 'bg-gold' : 'bg-sage/40'}`} />
                      <span className="flex-1 font-bold text-ink truncate">
                        {t.star ? '⭐ ' : ''}
                        {t.title}
                      </span>
                      {t.time ? <span className="text-sage/70 text-[11px] font-bold">{AR(t.time)}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ التقويم الشهري ============================ */
function MonthView({ data, onOpenDay }: { data: AgendaData; onOpenDay: (d: string) => void }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const startWD = first.getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const today = todayISO();

  const evByDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    data.events.forEach((e) => {
      (map[e.date] = map[e.date] || []).push(e);
    });
    return map;
  }, [data.events]);
  const taskByDay = useMemo(() => {
    const map: Record<string, number> = {};
    data.tasks.forEach((t) => {
      if (!t.done) map[t.date] = (map[t.date] || 0) + 1;
    });
    return map;
  }, [data.tasks]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWD; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(iso(new Date(y, m, d)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setAnchor(new Date(y, m - 1, 1))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          ‹ السابق
        </button>
        <div className="text-center">
          <div className="font-extrabold text-sage-deep text-lg flex items-center justify-center gap-1.5">
            <Icon k={ICONS.month} size={22} /> {MO[m]} {AR(y)}
          </div>
          <button onClick={() => setAnchor(new Date())} className="text-[11px] font-bold text-sage hover:text-sage-deep">
            هذا الشهر
          </button>
        </div>
        <button onClick={() => setAnchor(new Date(y, m + 1, 1))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          التالي ›
        </button>
      </div>

      <div className="card-3d p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WD.map((w) => (
            <div key={w} className="text-center text-[11px] font-extrabold text-sage/70 py-1">
              {w.replace('ال', '')}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) =>
            c === null ? (
              <div key={'e' + i} />
            ) : (
              (() => {
                const evs = evByDay[c] || [];
                const nT = taskByDay[c] || 0;
                const isToday = c === today;
                const dn = parseISO(c).getDate();
                return (
                  <button
                    key={c}
                    onClick={() => onOpenDay(c)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                      isToday ? 'bg-sage-deep text-white' : 'hover:bg-sage-light text-ink'
                    }`}
                  >
                    <span className={`text-[13px] font-bold ${isToday ? 'text-white' : 'text-ink'}`}>{AR(dn)}</span>
                    <span className="flex items-center gap-0.5 h-1.5">
                      {evs.slice(0, 3).map((e, k) => (
                        <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: isToday ? '#fff' : etype(e.type).color }} />
                      ))}
                      {nT > 0 && evs.length < 3 ? <span className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white/70' : 'bg-sage/40'}`} /> : null}
                    </span>
                  </button>
                );
              })()
            )
          )}
        </div>
      </div>
      <p className="text-center text-[12px] text-sage/70 font-bold">اضغطي أي يوم لعرض تفاصيله أو إضافة موعد وحدث 🌿</p>
    </div>
  );
}

/* ============================ شيت اليوم (تفاصيل + إضافة) ============================ */
function DaySheet({
  day,
  data,
  onClose,
  onToggleTask,
  onEditTask,
  onAddTask,
  onAddEvent,
  onEditEvent,
}: {
  day: string;
  data: AgendaData;
  onClose: () => void;
  onToggleTask: (id: string) => void;
  onEditTask: (t: Task) => void;
  onAddTask: (d: string) => void;
  onAddEvent: (d: string) => void;
  onEditEvent: (e: AgendaEvent) => void;
}) {
  const evs = data.events.filter((e) => e.date === day).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const tasks = data.tasks.filter((t) => t.date === day);
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full md:max-w-md bg-cream rounded-t-card md:rounded-card shadow-lift p-5 max-h-[88dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sage-deep text-lg">{longDate(day)}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white text-sage-deep font-bold">✕</button>
        </div>

        {evs.length === 0 && tasks.length === 0 && <p className="text-sage/60 font-bold text-center py-3">لا شيء في هذا اليوم بعد.</p>}

        {evs.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="text-[13px] font-extrabold text-sage-deep">المواعيد والأحداث</div>
            {evs.map((e) => {
              const ty = etype(e.type);
              return (
                <button key={e.id} onClick={() => onEditEvent(e)} className="w-full text-right flex items-center gap-2.5 rounded-soft bg-white p-3 border border-sage/15">
                  <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: ty.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink text-[14px] truncate">{e.title}</div>
                    <div className="text-[11px] text-sage/80 font-bold">
                      {ty.l}
                      {e.time ? ` · ${AR(e.time)}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </div>
                  </div>
                  <span className="text-sage-deep/50">✏️</span>
                </button>
              );
            })}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-2 mb-3">
            <div className="text-[13px] font-extrabold text-sage-deep">المهام</div>
            {tasks.map((t) => (
              <div key={t.id} className={`flex items-center gap-2.5 rounded-soft bg-white p-2.5 border border-sage/15 ${t.done ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => onToggleTask(t.id)}
                  className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${t.done ? 'bg-sage-deep border-sage-deep text-white' : 'border-sage/50 text-transparent'}`}
                >
                  ✓
                </button>
                <span className={`flex-1 font-bold text-ink text-[14px] ${t.done ? 'line-through' : ''}`}>{t.title}</span>
                <button onClick={() => onEditTask(t)} className="text-sage-deep/60">✏️</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => onAddTask(day)} className="rounded-card bg-white border border-sage/30 text-sage-deep font-extrabold py-3">
            ＋ مهمة
          </button>
          <button onClick={() => onAddEvent(day)} className="rounded-card bg-sage-deep text-white font-extrabold py-3">
            ＋ موعد / حدث
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ نموذج الحدث ============================ */
function EventForm({
  event,
  presetDate,
  onClose,
  onSave,
  onDelete,
}: {
  event: AgendaEvent | null;
  presetDate?: string;
  onClose: () => void;
  onSave: (e: Omit<AgendaEvent, 'id' | 'createdAt'>) => void;
  onDelete?: () => void;
}) {
  const [type, setType] = useState(event?.type || 'appt');
  const [title, setTitle] = useState(event?.title || '');
  const [date, setDate] = useState(event?.date || presetDate || todayISO());
  const [time, setTime] = useState(event?.time || '');
  const [note, setNote] = useState(event?.note || '');

  const save = () => {
    if (!title.trim()) return;
    onSave({ type, title: title.trim(), date, time: time || undefined, note: note.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full md:max-w-md bg-cream rounded-t-card md:rounded-card shadow-lift p-5 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sage-deep text-lg">{event ? 'تعديل الحدث' : 'موعد / حدث جديد'}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white text-sage-deep font-bold">✕</button>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">النوع</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {ETYPES.map((ty) => (
            <button
              key={ty.k}
              onClick={() => setType(ty.k)}
              className={`rounded-soft py-2 font-bold text-[12.5px] border transition-colors ${type === ty.k ? 'text-white border-transparent' : 'bg-white text-sage-deep border-sage/25'}`}
              style={type === ty.k ? { background: ty.color } : undefined}
            >
              {ty.l}
            </button>
          ))}
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">العنوان</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="مثال: اجتماع القسم" className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-3" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">الوقت (اختياري)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">ملاحظة (اختياري)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-4" />

        <button onClick={save} className="w-full rounded-card bg-sage-deep text-white font-extrabold py-3.5 shadow-soft">
          {event ? 'حفظ' : '＋ إضافة'}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="w-full mt-2 rounded-card bg-white text-red-500 border border-red-200 font-bold py-3">
            🗑️ حذف الحدث
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================ إنجازاتي ============================ */
const monthKey = (s: string) => s.slice(0, 7);

function AchView({
  data,
  imgUrl,
  onAdd,
  onEdit,
  onDelete,
  onPortfolio,
}: {
  data: AgendaData;
  imgUrl: (img: AchImage) => string | undefined;
  onAdd: () => void;
  onEdit: (a: Achievement) => void;
  onDelete: (a: Achievement) => void;
  onPortfolio: () => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'thisM' | 'lastM' | 'thisY'>('all');
  const [lightbox, setLightbox] = useState<{ ach: Achievement; i: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Achievement | null>(null);

  const now = new Date();
  const thisM = iso(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7);
  const lastM = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const thisY = String(now.getFullYear());

  const list = useMemo(() => {
    let l = [...data.achievements];
    if (filter === 'thisM') l = l.filter((a) => monthKey(a.date) === thisM);
    else if (filter === 'lastM') l = l.filter((a) => monthKey(a.date) === lastM);
    else if (filter === 'thisY') l = l.filter((a) => a.date.slice(0, 4) === thisY);
    const s = q.trim();
    if (s) l = l.filter((a) => (a.title + ' ' + (a.desc || '')).includes(s));
    return l.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt));
  }, [data.achievements, filter, q, thisM, lastM, thisY]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon k={ICONS.ach} size={28} />
        <h1 className="text-xl font-extrabold text-sage-deep flex-1">إنجازاتي</h1>
        <button onClick={onAdd} className="rounded-xl bg-sage-deep text-white font-extrabold text-sm px-4 py-2.5 shadow-soft">
          ＋ أضف إنجازًا
        </button>
      </div>
      {data.achievements.length > 0 && (
        <button onClick={onPortfolio} className="w-full rounded-card border border-gold/50 bg-gold-light/40 text-sage-deep font-extrabold py-3 hover:bg-gold-light/70 transition-colors">
          📄 إنشاء ملف إنجاز (PDF)
        </button>
      )}

      {data.achievements.length > 0 && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 ابحثي في إنجازاتك…"
            className="w-full rounded-card border border-sage/20 bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-sage/50 focus:outline-none focus:border-sage"
          />
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                ['all', 'الكل'],
                ['thisM', 'هذا الشهر'],
                ['lastM', 'الشهر السابق'],
                ['thisY', 'هذا العام'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${filter === k ? 'bg-sage-deep text-white' : 'bg-white text-sage-deep border border-sage/25'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </>
      )}

      {data.achievements.length === 0 ? (
        <div className="card-3d p-8 text-center mt-4">
          <div className="text-4xl mb-3">🌿</div>
          <h2 className="text-lg font-extrabold text-sage-deep">ابدئي بتوثيق أول إنجاز لك</h2>
          <p className="text-sage font-bold mt-1.5 leading-relaxed">احتفظي بلحظات نجاحك وجهودك في مكان واحد.</p>
          <button onClick={onAdd} className="mt-5 rounded-card bg-sage-deep text-white font-extrabold px-7 py-3 shadow-soft">
            ＋ أضف إنجازًا
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="card-3d p-6 text-center">
          <p className="text-sage-deep font-bold">لا نتائج مطابقة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {list.map((a) => {
            const cover = a.images[0] ? imgUrl(a.images[0]) : undefined;
            return (
              <article key={a.id} className="card-3d overflow-hidden flex flex-col">
                <button onClick={() => a.images.length && setLightbox({ ach: a, i: 0 })} className="relative block aspect-[16/10] bg-sage-light w-full">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={a.title} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-40">🖼️</span>
                  )}
                  {a.images.length > 1 && <span className="absolute top-2 left-2 bg-ink/55 text-white text-[11px] font-bold rounded-full px-2 py-0.5">＋{AR(a.images.length - 1)}</span>}
                </button>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="font-extrabold text-sage-deep leading-snug">{a.title}</h3>
                  <div className="text-[11.5px] text-sage/80 font-bold mt-0.5">{longDate(a.date)}</div>
                  {a.desc ? <p className="text-[13px] text-ink/70 mt-1.5 line-clamp-2">{a.desc}</p> : null}
                  <div className="flex gap-2 mt-2.5 pt-2 border-t border-sage/10">
                    <button onClick={() => onEdit(a)} className="text-[12.5px] font-bold text-sage-deep">✏️ تعديل</button>
                    <button onClick={() => setConfirmDel(a)} className="text-[12.5px] font-bold text-red-500 mr-auto">🗑️ حذف</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {lightbox && <Lightbox ach={lightbox.ach} i={lightbox.i} imgUrl={imgUrl} onClose={() => setLightbox(null)} />}
      {confirmDel && (
        <ConfirmDelete
          title="حذف هذا الإنجاز؟"
          body="سيُحذف الإنجاز وكل صوره نهائيًّا."
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            onDelete(confirmDel);
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}

function Lightbox({ ach, i, imgUrl, onClose }: { ach: Achievement; i: number; imgUrl: (img: AchImage) => string | undefined; onClose: () => void }) {
  const [idx, setIdx] = useState(i);
  const img = ach.images[idx];
  const url = img ? imgUrl(img) : undefined;
  return (
    <div className="fixed inset-0 z-[60] bg-ink/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="font-bold">{ach.title}</span>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 font-bold">✕</button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[75vh] max-w-full object-contain rounded-lg" />
        ) : (
          <span className="text-white/60">…</span>
        )}
      </div>
      {ach.images.length > 1 && (
        <div className="flex items-center justify-center gap-4 p-4 text-white" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setIdx((idx + 1) % ach.images.length)} className="rounded-full bg-white/15 px-4 py-2 font-bold">‹</button>
          <span className="font-bold">{AR(idx + 1)} / {AR(ach.images.length)}</span>
          <button onClick={() => setIdx((idx - 1 + ach.images.length) % ach.images.length)} className="rounded-full bg-white/15 px-4 py-2 font-bold">›</button>
        </div>
      )}
    </div>
  );
}

function ConfirmDelete({ title, body, onCancel, onConfirm }: { title: string; body: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 backdrop-blur-sm p-5" onClick={onCancel}>
      <div className="w-full max-w-sm bg-cream rounded-card shadow-lift p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl mb-2">🗑️</div>
        <h3 className="font-extrabold text-sage-deep text-lg">{title}</h3>
        <p className="text-ink/60 text-sm mt-1.5 leading-relaxed">{body}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 rounded-card bg-white border border-sage/30 text-sage-deep font-bold py-3">إلغاء</button>
          <button onClick={onConfirm} className="flex-1 rounded-card bg-red-500 text-white font-extrabold py-3">حذف</button>
        </div>
      </div>
    </div>
  );
}

function AchForm({
  ach,
  imgUrl,
  uploadImage,
  removeImage,
  onClose,
  onSave,
  onDelete,
}: {
  ach: Achievement | null;
  imgUrl: (img: AchImage) => string | undefined;
  uploadImage: (dataUrl: string) => Promise<AchImage>;
  removeImage: (img: AchImage) => Promise<void>;
  onClose: () => void;
  onSave: (a: Omit<Achievement, 'id' | 'createdAt'>) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(ach?.title || '');
  const [date, setDate] = useState(ach?.date || todayISO());
  const [desc, setDesc] = useState(ach?.desc || '');
  const [place, setPlace] = useState(ach?.place || '');
  const [audience, setAudience] = useState(ach?.audience || '');
  const [images, setImages] = useState<AchImage[]>(ach?.images || []);
  const [busy, setBusy] = useState(false);
  const addedRef = useRef<AchImage[]>([]); // مرفوعة هذه الجلسة
  const removedRef = useRef<AchImage[]>([]); // موجودة أُزيلت
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue;
        try {
          const dataUrl = await compressImage(f);
          const img = await uploadImage(dataUrl);
          addedRef.current.push(img);
          setImages((cur) => [...cur, img]);
        } catch {
          /* تخطّي صورة فشلت */
        }
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeOne = (img: AchImage) => {
    setImages((cur) => cur.filter((x) => x.id !== img.id));
    const wasAdded = addedRef.current.some((x) => x.id === img.id);
    if (wasAdded) {
      addedRef.current = addedRef.current.filter((x) => x.id !== img.id);
      removeImage(img); // جديدة → احذفيها فورًا من التخزين
    } else {
      removedRef.current.push(img); // موجودة → تُحذف عند الحفظ
    }
  };

  const close = async () => {
    // إلغاء: احذفي ما رُفع هذه الجلسة ولم يُحفظ
    for (const img of addedRef.current) await removeImage(img);
    onClose();
  };
  const save = async () => {
    if (!title.trim()) return;
    for (const img of removedRef.current) await removeImage(img);
    onSave({ title: title.trim(), date, desc: desc.trim() || undefined, place: place.trim() || undefined, audience: audience.trim() || undefined, images });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={close}>
      <div className="w-full md:max-w-lg bg-cream rounded-t-card md:rounded-card shadow-lift p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sage-deep text-lg">{ach ? 'تعديل الإنجاز' : 'إنجاز جديد'}</h3>
          <button onClick={close} className="w-9 h-9 rounded-full bg-white text-sage-deep font-bold">✕</button>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">عنوان الإنجاز</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تنفيذ استراتيجية التعلم باللعب" className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-3" />

        <label className="block text-[13px] font-bold text-sage-deep mb-1">التاريخ</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-3" />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">مكان الفعالية (اختياري)</label>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="مثال: قاعة الأنشطة" className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-sage-deep mb-1">الفئة المستهدفة (اختياري)</label>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="مثال: طالبات الصف الخامس" className="w-full rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage" />
          </div>
        </div>

        <label className="block text-[13px] font-bold text-sage-deep mb-1">وصف مختصر (اختياري)</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="مثال: تم تطبيق النشاط مع طلاب الصف الخامس." className="w-full resize-none rounded-soft border border-sage/25 bg-white p-3 text-ink focus:outline-none focus:border-sage mb-3" />

        <label className="block text-[13px] font-bold text-sage-deep mb-1">الصور</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((img) => {
            const u = imgUrl(img);
            return (
              <div key={img.id} className="relative aspect-square rounded-soft overflow-hidden bg-sage-light border border-sage/15">
                {u ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-sage/50">…</span>
                )}
                <button onClick={() => removeOne(img)} className="absolute top-1 left-1 w-6 h-6 rounded-full bg-ink/60 text-white text-xs font-bold flex items-center justify-center">✕</button>
              </div>
            );
          })}
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="aspect-square rounded-soft border-2 border-dashed border-sage/40 text-sage-deep flex flex-col items-center justify-center gap-1 disabled:opacity-50">
            <span className="text-2xl">{busy ? '⏳' : '＋'}</span>
            <span className="text-[11px] font-bold">{busy ? 'جارٍ…' : 'صورة'}</span>
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />

        <button onClick={save} disabled={busy || !title.trim()} className="w-full rounded-card bg-sage-deep text-white font-extrabold py-3.5 shadow-soft mt-3 disabled:opacity-50">
          {ach ? 'حفظ' : '＋ حفظ الإنجاز'}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="w-full mt-2 rounded-card bg-white text-red-500 border border-red-200 font-bold py-3">
            🗑️ حذف الإنجاز
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================ حصاد الشهر ============================ */
function HarvestView({
  data,
  imgUrl,
  onSetHarvest,
}: {
  data: AgendaData;
  imgUrl: (img: AchImage) => string | undefined;
  onSetHarvest: (mk: string, patch: Record<string, unknown>) => void;
}) {
  const [anchor, setAnchor] = useState(() => new Date());
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const mk = `${y}-${pad(m + 1)}`;

  const doneTasks = data.tasks.filter((t) => t.done && monthKey(t.date) === mk).length;
  const achs = useMemo(() => data.achievements.filter((a) => monthKey(a.date) === mk), [data.achievements, mk]);
  const imgs = achs.reduce((n, a) => n + a.images.length, 0);
  const events = data.events.filter((e) => monthKey(e.date) === mk).length;

  const h = (data.harvest[mk] as { topAchievementId?: string; proud?: string; improve?: string }) || {};
  const featured = achs.find((a) => a.id === h.topAchievementId) || null;
  const cover = featured?.images[0] ? imgUrl(featured.images[0]) : undefined;

  const stats = [
    { n: doneTasks, l: 'مهمة مكتملة', icon: ICONS.tasks },
    { n: achs.length, l: 'إنجاز موثّق', icon: ICONS.ach },
    { n: imgs, l: 'صورة إنجاز', icon: 'circulars' },
    { n: events, l: 'فعالية وموعد', icon: ICONS.eventsUpcoming },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setAnchor(new Date(y, m - 1, 1))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          ‹ السابق
        </button>
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-sage-deep flex items-center justify-center gap-1.5">
            <Icon k={ICONS.harvest} size={26} /> حصاد {MO[m]} {AR(y)}
          </h1>
          <button onClick={() => setAnchor(new Date())} className="text-[11px] font-bold text-sage hover:text-sage-deep">
            هذا الشهر
          </button>
        </div>
        <button onClick={() => setAnchor(new Date(y, m + 1, 1))} className="rounded-xl border border-sage/30 bg-white text-sage-deep font-bold px-3 py-2 text-sm hover:border-sage">
          التالي ›
        </button>
      </div>
      <div className="gold-thread" />

      {/* إحصاءات الشهر */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="card-3d p-4 flex items-center gap-3">
            <Icon k={s.icon} size={38} />
            <div>
              <div className="text-3xl font-extrabold text-sage-deep leading-none">{AR(s.n)}</div>
              <div className="text-[12px] font-bold text-sage mt-1">{s.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* أبرز إنجاز */}
      <section className="card-3d p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🏅</span>
          <h2 className="font-extrabold text-sage-deep">أبرز إنجاز هذا الشهر</h2>
        </div>
        {achs.length === 0 ? (
          <p className="text-sage/60 font-bold text-sm text-center py-2">لا إنجازات موثّقة هذا الشهر بعد.</p>
        ) : (
          <>
            {featured && (
              <div className="rounded-card overflow-hidden border border-gold/40 mb-3">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="w-full aspect-[16/9] object-cover" />
                ) : null}
                <div className="p-3 bg-gold-light/40">
                  <div className="font-extrabold text-sage-deep">🏅 {featured.title}</div>
                  <div className="text-[11.5px] text-sage/80 font-bold">{longDate(featured.date)}</div>
                </div>
              </div>
            )}
            <div className="text-[12px] font-bold text-sage-deep mb-1.5">اختاري الأبرز:</div>
            <div className="flex gap-2 flex-wrap">
              {achs.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSetHarvest(mk, { topAchievementId: a.id })}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold border transition-colors ${h.topAchievementId === a.id ? 'bg-gold text-white border-transparent' : 'bg-white text-sage-deep border-sage/25'}`}
                >
                  {a.title.length > 22 ? a.title.slice(0, 22) + '…' : a.title}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* سؤالان اختياريان */}
      <section className="card-3d p-4 space-y-3">
        <div>
          <label className="block text-[13px] font-bold text-sage-deep mb-1.5">أكثر شيء أفتخر بإنجازه هذا الشهر</label>
          <textarea
            defaultValue={h.proud || ''}
            key={mk + '-p'}
            onBlur={(e) => onSetHarvest(mk, { proud: e.target.value })}
            rows={2}
            placeholder="اكتبي هنا…"
            className="w-full resize-none rounded-soft border border-sage/20 bg-cream/60 p-3 text-sm text-ink placeholder:text-sage/45 focus:outline-none focus:border-sage"
          />
        </div>
        <div>
          <label className="block text-[13px] font-bold text-sage-deep mb-1.5">شيء أريد تطويره الشهر القادم</label>
          <textarea
            defaultValue={h.improve || ''}
            key={mk + '-i'}
            onBlur={(e) => onSetHarvest(mk, { improve: e.target.value })}
            rows={2}
            placeholder="اكتبي هنا…"
            className="w-full resize-none rounded-soft border border-sage/20 bg-cream/60 p-3 text-sm text-ink placeholder:text-sage/45 focus:outline-none focus:border-sage"
          />
        </div>
      </section>
    </div>
  );
}

/* ============================ ملف الإنجاز الرسمي (PDF) ============================ */
function PortfolioBuilder({
  data,
  imgUrl,
  firstName,
  onSaveMeta,
  onClose,
}: {
  data: AgendaData;
  imgUrl: (img: AchImage) => string | undefined;
  firstName: string;
  onSaveMeta: (m: PortfolioMeta) => void;
  onClose: () => void;
}) {
  const init = data.portfolioMeta || {};
  const [meta, setMeta] = useState<PortfolioMeta>({ teacher: init.teacher || firstName, ...init });
  const [period, setPeriod] = useState<'all' | 'thisM' | 'lastM' | 'thisY'>('all');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const logoRef = useRef<HTMLInputElement>(null);

  const setField = (k: keyof PortfolioMeta, v: string) => {
    const m = { ...meta, [k]: v };
    setMeta(m);
  };
  const commitMeta = (m = meta) => onSaveMeta(m);

  const pickLogo = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    try {
      const dataUrl = await compressImage(files[0], 400, 0.9);
      const m = { ...meta, logo: dataUrl };
      setMeta(m);
      commitMeta(m);
    } catch {
      /* ignore */
    }
    if (logoRef.current) logoRef.current.value = '';
  };

  const now = new Date();
  const thisM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const lastM = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const thisY = String(now.getFullYear());
  const inPeriod = useCallback(
    (d: string) => (period === 'all' ? true : period === 'thisM' ? monthKey(d) === thisM : period === 'lastM' ? monthKey(d) === lastM : d.slice(0, 4) === thisY),
    [period, thisM, lastM, thisY]
  );
  const list = useMemo(() => data.achievements.filter((a) => inPeriod(a.date)).sort((a, b) => a.date.localeCompare(b.date)), [data.achievements, inPeriod]);
  const included = list.filter((a) => !excluded.has(a.id));

  const field = (k: keyof PortfolioMeta, label: string, ph: string) => (
    <div>
      <label className="block text-[12px] font-bold text-sage-deep mb-1">{label}</label>
      <input
        value={(meta[k] as string) || ''}
        onChange={(e) => setField(k, e.target.value)}
        onBlur={() => commitMeta()}
        placeholder={ph}
        className="w-full rounded-soft border border-sage/25 bg-white p-2.5 text-sm text-ink focus:outline-none focus:border-sage"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-cream overflow-y-auto agenda-report">
      <style>{`@media print { html,body{height:auto!important;overflow:visible!important;background:#fff!important} body *{visibility:hidden!important} .agenda-report,.agenda-report *{visibility:visible!important} .agenda-report{position:static!important;inset:auto!important;height:auto!important;max-height:none!important;overflow:visible!important;background:#fff!important} .agenda-noprint{display:none!important} .port-page{break-after:page;page-break-after:always;box-shadow:none!important;border:1.5px solid #222!important;margin:0 auto!important} .port-page:last-child{break-after:auto;page-break-after:auto} }`}</style>

      {/* شريط الخيارات (لا يُطبع) */}
      <div className="agenda-noprint bg-white border-b border-sage/15 p-4">
        <div className="mx-auto max-w-3xl flex items-center gap-2 mb-3">
          <h2 className="font-extrabold text-sage-deep text-lg flex-1">📄 ملف الإنجاز — النموذج الرسمي</h2>
          <button onClick={() => window.print()} className="rounded-xl bg-sage-deep text-white font-extrabold text-sm px-4 py-2.5 shadow-soft">🖨 حفظ الملف كامل PDF</button>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-sage/25 text-sage-deep font-bold">✕</button>
        </div>
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {field('region', 'المنطقة التعليمية', 'مثال: حولي')}
            {field('school', 'المدرسة', 'مثال: مشرف الابتدائية')}
            {field('dept', 'القسم', 'مثال: التربية الإسلامية')}
            {field('teacher', 'اسم المعلم/ة', 'الاسم')}
            {field('head', 'رئيسة القسم (اختياري)', 'الاسم')}
            {field('principal', 'مديرة المدرسة (اختياري)', 'الاسم')}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => logoRef.current?.click()} className="rounded-xl bg-sage-light text-sage-deep font-bold text-sm px-4 py-2.5">🏫 {meta.logo ? 'تغيير شعار المدرسة' : 'رفع شعار المدرسة (اختياري)'}</button>
            {meta.logo && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.logo} alt="" className="h-10 w-10 object-contain rounded border border-sage/20" />
                <button onClick={() => { const m = { ...meta, logo: undefined }; setMeta(m); commitMeta(m); }} className="text-red-500 font-bold text-[13px]">إزالة الشعار</button>
              </>
            )}
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files)} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {([['all', 'الكل'], ['thisM', 'هذا الشهر'], ['lastM', 'الشهر السابق'], ['thisY', 'هذا العام']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} className={`rounded-full px-3 py-1.5 text-[12px] font-bold border ${period === k ? 'bg-sage-deep text-white border-transparent' : 'bg-white text-sage-deep border-sage/25'}`}>{l}</button>
            ))}
          </div>
          {list.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {list.map((a) => (
                <button key={a.id} onClick={() => setExcluded((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} className={`rounded-full px-3 py-1 text-[11.5px] font-bold border ${excluded.has(a.id) ? 'bg-white text-sage/50 border-sage/20 line-through' : 'bg-sage-light text-sage-deep border-transparent'}`}>{a.title.length > 20 ? a.title.slice(0, 20) + '…' : a.title}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* الصفحات الرسمية — صفحة لكل إنجاز */}
      <div className="p-3 md:p-6 space-y-6" style={{ fontFamily: "var(--font-cairo),'Tajawal',sans-serif" }}>
        {included.length === 0 ? (
          <p className="text-center text-sage/60 font-bold py-10">لا إنجازات ضمن الاختيار.</p>
        ) : (
          included.map((a) => (
            <div key={a.id} className="port-page bg-white mx-auto p-6" style={{ maxWidth: 760, border: '1.5px solid #222', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
              {/* الترويسة */}
              <div className="flex items-start justify-between gap-3">
                <div className="w-24 flex items-center justify-center">
                  {meta.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.logo} alt="" className="max-h-20 max-w-full object-contain" />
                  ) : null}
                </div>
                <div className="text-center flex-1 pt-1 text-[11px] text-ink/50 leading-relaxed">
                  <div>دولة الكويت</div>
                </div>
                <div className="text-right text-[12px] text-ink/80 leading-relaxed min-w-[38%]">
                  <div className="font-bold">وزارة التربية</div>
                  {meta.region ? <div>الإدارة العامة لمنطقة {meta.region} التعليمية</div> : <div>الإدارة العامة لمنطقة ……… التعليمية</div>}
                  {meta.school ? <div>مدرسة {meta.school}</div> : <div>مدرسة …………</div>}
                  {meta.dept ? <div>قسم {meta.dept}</div> : null}
                </div>
              </div>

              {/* عنوان القسم */}
              <div className="flex justify-center my-4">
                <div className="rounded-2xl px-8 py-2 font-extrabold text-sage-deep text-lg" style={{ background: '#F3F1DC', border: '1px solid #D8D3A8' }}>
                  {meta.dept ? `قسم ${meta.dept}` : 'القسم'}
                </div>
              </div>

              {/* الجدول */}
              <table className="w-full border-collapse text-center text-[12.5px]" dir="rtl">
                <thead>
                  <tr style={{ background: '#FAFAF4' }}>
                    {['اسم المعلم', 'عنوان الفعالية', 'اليوم والتاريخ', 'مكان الفعالية', 'الفئة المستهدفة'].map((h) => (
                      <th key={h} className="border border-ink/40 p-2 font-bold text-ink">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-ink/40 p-2.5">{meta.teacher || ''}</td>
                    <td className="border border-ink/40 p-2.5 font-bold">{a.title}</td>
                    <td className="border border-ink/40 p-2.5">{longDate(a.date)}</td>
                    <td className="border border-ink/40 p-2.5">{a.place || ''}</td>
                    <td className="border border-ink/40 p-2.5">{a.audience || ''}</td>
                  </tr>
                </tbody>
              </table>

              {a.desc ? <p className="text-[12.5px] text-ink/75 mt-2 leading-relaxed text-center">{a.desc}</p> : null}

              {/* صندوق الصور */}
              <div className="mt-4 rounded-xl p-3 relative" style={{ border: '2px solid #222', minHeight: 300 }}>
                <div className="absolute -top-3 right-6 px-4 py-0.5 font-bold text-ink text-[13px]" style={{ background: '#F3F1DC', border: '1px solid #D8D3A8', borderRadius: 8 }}>الصُّور</div>
                {a.images.length ? (
                  <div className={`grid gap-2 mt-2 ${a.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {a.images.map((img) => {
                      const u = imgUrl(img);
                      return u ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={img.id} src={u} alt="" className="w-full object-cover rounded-lg" style={{ maxHeight: a.images.length === 1 ? 340 : 200 }} />
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-ink/30 text-sm">— لا صور —</div>
                )}
              </div>

              {/* التذييل */}
              <div className="flex items-end justify-between mt-6 text-[12.5px]">
                <div className="text-center rounded-xl px-5 py-2" style={{ background: '#F3F1DC', border: '1px solid #D8D3A8' }}>
                  <div className="font-bold text-ink">مديرة المدرسة</div>
                  <div className="text-ink/80 mt-0.5">{meta.principal || '…………'}</div>
                </div>
                <div className="text-center rounded-xl px-5 py-2" style={{ background: '#F3F1DC', border: '1px solid #D8D3A8' }}>
                  <div className="font-bold text-ink">رئيسة القسم</div>
                  <div className="text-ink/80 mt-0.5">{meta.head || '…………'}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================ البحث الموحّد ============================ */
function SearchSheet({
  data,
  onClose,
  onGoDay,
  onGoTask,
  onGoEvent,
  onGoAch,
}: {
  data: AgendaData;
  onClose: () => void;
  onGoDay: (d: string) => void;
  onGoTask: (t: Task) => void;
  onGoEvent: (e: AgendaEvent) => void;
  onGoAch: () => void;
}) {
  const [q, setQ] = useState('');
  const s = q.trim();
  const res = useMemo(() => {
    if (!s) return null;
    const has = (x?: string) => (x || '').includes(s);
    return {
      tasks: data.tasks.filter((t) => has(t.title) || has(t.note)).slice(0, 20),
      events: data.events.filter((e) => has(e.title) || has(e.note)).slice(0, 20),
      achs: data.achievements.filter((a) => has(a.title) || has(a.desc)).slice(0, 20),
      notes: Object.entries(data.notes).filter(([, v]) => has(v)).slice(0, 20),
    };
  }, [data, s]);
  const total = res ? res.tasks.length + res.events.length + res.achs.length + res.notes.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 backdrop-blur-sm p-3 md:p-6" onClick={onClose}>
      <div className="w-full md:max-w-lg bg-cream rounded-card shadow-lift p-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 ابحثي في مهامك ومواعيدك وإنجازاتك…"
            className="flex-1 rounded-card border border-sage/25 bg-white px-4 py-3 text-ink placeholder:text-sage/50 focus:outline-none focus:border-sage"
          />
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-sage/25 text-sage-deep font-bold">✕</button>
        </div>

        {!s ? (
          <p className="text-sage/60 font-bold text-center py-6">اكتبي كلمة للبحث — مثال: «مسابقة القرآن»</p>
        ) : total === 0 ? (
          <p className="text-sage-deep font-bold text-center py-6">لا نتائج لـ «{s}».</p>
        ) : (
          <div className="space-y-4">
            {res!.tasks.length > 0 && (
              <SearchGroup icon={ICONS.tasks} label="مهام">
                {res!.tasks.map((t) => (
                  <SearchRow key={t.id} title={t.title} sub={`${shortDate(t.date)}${t.done ? ' · مكتملة' : ''}`} onClick={() => onGoTask(t)} />
                ))}
              </SearchGroup>
            )}
            {res!.events.length > 0 && (
              <SearchGroup icon={ICONS.eventsUpcoming} label="مواعيد وأحداث">
                {res!.events.map((e) => (
                  <SearchRow key={e.id} title={e.title} sub={`${etype(e.type).l} · ${shortDate(e.date)}`} dot={etype(e.type).color} onClick={() => onGoEvent(e)} />
                ))}
              </SearchGroup>
            )}
            {res!.achs.length > 0 && (
              <SearchGroup icon={ICONS.ach} label="إنجازات">
                {res!.achs.map((a) => (
                  <SearchRow key={a.id} title={a.title} sub={longDate(a.date)} onClick={onGoAch} />
                ))}
              </SearchGroup>
            )}
            {res!.notes.length > 0 && (
              <SearchGroup icon={ICONS.note} label="ملاحظات">
                {res!.notes.map(([day, v]) => (
                  <SearchRow key={day} title={v} sub={shortDate(day)} onClick={() => onGoDay(day)} />
                ))}
              </SearchGroup>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function SearchGroup({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon k={icon} size={20} />
        <h3 className="font-extrabold text-sage-deep text-sm">{label}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function SearchRow({ title, sub, dot, onClick }: { title: string; sub: string; dot?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-right flex items-center gap-2.5 rounded-soft bg-white p-2.5 border border-sage/15 hover:border-sage/40">
      {dot ? <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: dot }} /> : null}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-ink text-[14px] truncate">{title}</div>
        <div className="text-[11px] text-sage/70 font-bold">{sub}</div>
      </div>
      <span className="text-sage/40">‹</span>
    </button>
  );
}

/* ============================ منتقي الخلفية ============================ */
function BgPicker({ current, onPick, onClose }: { current?: string; onPick: (id: string | null) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full md:max-w-lg bg-cream rounded-t-card md:rounded-card shadow-lift p-5 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sage-deep text-lg">🎨 خلفية الأجندة</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white text-sage-deep font-bold">✕</button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => {
              onPick(null);
              onClose();
            }}
            className={`aspect-[3/4] rounded-soft border-2 flex flex-col items-center justify-center bg-white ${!current ? 'border-sage-deep' : 'border-sage/20'}`}
          >
            <span className="text-2xl">🌿</span>
            <span className="text-[11px] font-bold text-sage-deep mt-1">بدون</span>
          </button>
          {BG_LIST.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                onPick(b.id);
                onClose();
              }}
              className={`aspect-[3/4] rounded-soft border-2 overflow-hidden relative ${current === b.id ? 'border-sage-deep' : 'border-white/60'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BG_URL(b.id)} alt={b.name} className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/35 text-white text-[10px] font-bold py-0.5 text-center">{b.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ مساعدات ============================ */
function normalize(d: AgendaData): AgendaData {
  return {
    _v: 1,
    tasks: Array.isArray(d?.tasks) ? d.tasks : [],
    events: Array.isArray(d?.events) ? d.events : [],
    weekly: d?.weekly && typeof d.weekly === 'object' ? d.weekly : {},
    notes: d?.notes && typeof d.notes === 'object' ? d.notes : {},
    achievements: Array.isArray(d?.achievements)
      ? d.achievements.map((a) => ({ ...a, images: Array.isArray(a?.images) ? a.images : [] }))
      : [],
    harvest: d?.harvest && typeof d.harvest === 'object' ? d.harvest : {},
    bg: typeof d?.bg === 'string' ? d.bg : undefined,
    mode: d?.mode === 'creative' ? 'creative' : 'simple',
    canvas: d?.canvas && Array.isArray(d.canvas.els) ? d.canvas : { els: [] },
    portfolioMeta: d?.portfolioMeta && typeof d.portfolioMeta === 'object' ? d.portfolioMeta : undefined,
  };
}
function structuredCloneSafe<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}
