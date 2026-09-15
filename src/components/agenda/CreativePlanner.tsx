'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CANVAS_W, CANVAS_H, PASTELS, pastel, type Canvas, type CanvasEl } from './creative-shared';

const uid = () => 'c' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ================= مكتبة الملصقات (SVG حقيقي، لونٌ عبر fill/stroke) ================= */
type Sticker = { k: string; name: string; render: (color: string) => ReactNode };
const S = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ display: 'block' }}>
    {children}
  </svg>
);
export const STICKERS: Sticker[] = [
  { k: 'heart', name: 'قلب', render: (c) => S(<path fill={c} d="M12 21s-7.5-4.6-10-9C.5 8.6 2.4 4.5 6.2 4.5c2.2 0 3.6 1.4 4.3 2.5.7-1.1 2.1-2.5 4.3-2.5 3.8 0 5.7 4.1 4.2 7.5-2.5 4.4-9 9-9 9z" />) },
  { k: 'star', name: 'نجمة', render: (c) => S(<path fill={c} d="M12 2.5l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.8 6.4 19.7l1.3-6.3L2.9 9.1l6.4-.7z" />) },
  { k: 'cloud', name: 'سحابة', render: (c) => S(<path fill={c} d="M7 18h10.5a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-9.9-1.4A4 4 0 0 0 7 18z" />) },
  { k: 'sparkle', name: 'لمعة', render: (c) => S(<path fill={c} d="M12 2l1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8z" />) },
  { k: 'sun', name: 'شمس', render: (c) => S(<g stroke={c} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" fill={c} /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" /></g>) },
  { k: 'moon', name: 'هلال', render: (c) => S(<path fill={c} d="M16 3a9 9 0 1 0 5.5 15.5A7.2 7.2 0 0 1 16 3z" />) },
  { k: 'flower', name: 'وردة', render: (c) => S(<g fill={c}><circle cx="12" cy="6.5" r="3" /><circle cx="17" cy="10" r="3" /><circle cx="15" cy="16" r="3" /><circle cx="9" cy="16" r="3" /><circle cx="7" cy="10" r="3" /><circle cx="12" cy="12" r="2.4" fill="#fff" /></g>) },
  { k: 'leaf', name: 'ورقة', render: (c) => S(<g><path fill={c} d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" /><path d="M6 18C10 14 14 10 18 6" stroke="#ffffff" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".7" /></g>) },
  { k: 'check', name: 'صح', render: (c) => S(<path d="M4.5 12.5l4.5 4.5L19.5 6.5" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />) },
  { k: 'arrow', name: 'سهم', render: (c) => S(<path d="M4 12h14M12.5 6l6 6-6 6" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />) },
  { k: 'ring', name: 'دائرة', render: (c) => S(<g><circle cx="12" cy="12" r="8.5" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.4 2.6" /><circle cx="12" cy="12" r="2" fill={c} /></g>) },
  { k: 'rainbow', name: 'قوس قزح', render: (c) => S(<g fill="none" strokeLinecap="round" strokeWidth="2.2"><path d="M4 17a8 8 0 0 1 16 0" stroke={c} opacity="1" /><path d="M7 17a5 5 0 0 1 10 0" stroke={c} opacity=".55" /><path d="M10 17a2 2 0 0 1 4 0" stroke={c} opacity=".3" /></g>) },
];
const sticker = (k?: string) => STICKERS.find((s) => s.k === k) || STICKERS[0];

/* ================= أشكال القصاصات الورقية ================= */
type NoteShape = { k: string; name: string; radius: string; clip?: string; tape?: boolean; pin?: boolean };
export const NOTE_SHAPES: NoteShape[] = [
  { k: 'square', name: 'مربّعة', radius: '6px' },
  { k: 'rect', name: 'مستطيلة', radius: '10px' },
  { k: 'round', name: 'دائرية', radius: '50%' },
  { k: 'card', name: 'بطاقة', radius: '16px' },
  { k: 'tape', name: 'بشريط', radius: '4px', tape: true },
  { k: 'organic', name: 'عضوية', radius: '48% 52% 44% 56% / 56% 44% 56% 44%' },
];
const noteShape = (k?: string) => NOTE_SHAPES.find((n) => n.k === k) || NOTE_SHAPES[0];

/* ================= الخلفيات ================= */
export const BGS: { k: string; name: string }[] = [
  { k: 'ivory', name: 'Ivory' },
  { k: 'white', name: 'أبيض' },
  { k: 'lined', name: 'مسطّر' },
  { k: 'grid', name: 'مربّعات' },
  { k: 'dots', name: 'نقاط' },
];
function bgStyle(bg?: string, bgColor?: string): CSSProperties {
  const base = bgColor || (bg === 'white' ? '#FFFFFF' : '#FBF8F1');
  if (bg === 'lined')
    return { background: `repeating-linear-gradient(${base}, ${base} 33px, rgba(65,96,63,.10) 34px, ${base} 35px)` };
  if (bg === 'grid')
    return { backgroundColor: base, backgroundImage: 'linear-gradient(rgba(65,96,63,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(65,96,63,.08) 1px,transparent 1px)', backgroundSize: '34px 34px' };
  if (bg === 'dots')
    return { backgroundColor: base, backgroundImage: 'radial-gradient(rgba(65,96,63,.16) 1.6px, transparent 1.6px)', backgroundSize: '30px 30px' };
  return { background: base };
}

/* ================= اللوحة ================= */
type Gesture = { mode: 'move' | 'resize' | 'rotate'; id: string; sx: number; sy: number; orig: CanvasEl; cx: number; cy: number; moved: boolean } | null;

export default function CreativePlanner({ canvas, onCommit }: { canvas: Canvas; onCommit: (c: Canvas) => void }) {
  const [els, setEls] = useState<CanvasEl[]>(() => canvas.els || []);
  const [bg, setBg] = useState<string>(canvas.bg || 'ivory');
  const [bgColor, setBgColor] = useState<string | undefined>(canvas.bgColor);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | 'add' | 'sticker' | 'bg'>(null);
  const [scale, setScale] = useState(0.5);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);
  const elsRef = useRef<CanvasEl[]>(els);
  elsRef.current = els;

  const commit = useCallback(
    (nextEls: CanvasEl[], nb = bg, nbc = bgColor) => onCommit({ bg: nb, bgColor: nbc, els: nextEls }),
    [bg, bgColor, onCommit]
  );

  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) setScale(wrapRef.current.clientWidth / CANVAS_W);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const topZ = () => (els.length ? Math.max(...els.map((e) => e.z)) : 0);
  const addEl = (partial: Partial<CanvasEl> & { type: CanvasEl['type'] }) => {
    const el: CanvasEl = {
      id: uid(),
      x: CANVAS_W / 2 - 90,
      y: 180,
      w: 180,
      h: partial.type === 'sticker' ? 90 : partial.type === 'text' ? 150 : 150,
      rotation: 0,
      z: topZ() + 1,
      color: partial.type === 'sticker' ? '#E48AA6' : partial.type === 'text' ? undefined : 'butter',
      content: partial.type === 'text' ? 'نص' : partial.type === 'task' ? 'مهمة جديدة' : '',
      ...partial,
    };
    const next = [...els, el];
    setEls(next);
    commit(next);
    setSel(el.id);
    setDrawer(null);
  };
  const updateEl = (id: string, patch: Partial<CanvasEl>, doCommit = true) => {
    const next = els.map((e) => (e.id === id ? { ...e, ...patch } : e));
    setEls(next);
    if (doCommit) commit(next);
  };
  const removeEl = (id: string) => {
    const next = els.filter((e) => e.id !== id);
    setEls(next);
    commit(next);
    setSel(null);
    setEditing(null);
  };
  const dupEl = (id: string) => {
    const e = els.find((x) => x.id === id);
    if (!e) return;
    const copy = { ...e, id: uid(), x: e.x + 24, y: e.y + 24, z: topZ() + 1 };
    const next = [...els, copy];
    setEls(next);
    commit(next);
    setSel(copy.id);
  };
  const setZ = (id: string, front: boolean) => {
    const z = front ? topZ() + 1 : Math.min(...els.map((e) => e.z)) - 1;
    updateEl(id, { z });
  };

  /* ===== الإيماءات: سحب / تكبير / تدوير ===== */
  const onElDown = (e: React.PointerEvent, el: CanvasEl, mode: 'move' | 'resize' | 'rotate') => {
    if (editing === el.id && mode === 'move') return; // أثناء الكتابة لا نسحب
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = wrapRef.current!.getBoundingClientRect();
    gesture.current = {
      mode,
      id: el.id,
      sx: e.clientX,
      sy: e.clientY,
      orig: { ...el },
      cx: rect.left + (el.x + el.w / 2) * scale,
      cy: rect.top + (el.y + el.h / 2) * scale,
      moved: false,
    };
    if (mode === 'move') setSel(el.id);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / scale;
    const dy = (e.clientY - g.sy) / scale;
    if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 4) g.moved = true;
    if (g.mode === 'move') {
      updateEl(g.id, { x: clamp(g.orig.x + dx, -g.orig.w + 40, CANVAS_W - 40), y: clamp(g.orig.y + dy, -g.orig.h + 40, CANVAS_H - 40) }, false);
    } else if (g.mode === 'resize') {
      const r = (-g.orig.rotation * Math.PI) / 180;
      const ldx = dx * Math.cos(r) - dy * Math.sin(r);
      const ldy = dx * Math.sin(r) + dy * Math.cos(r);
      updateEl(g.id, { w: clamp(g.orig.w + ldx, 44, 640), h: clamp(g.orig.h + ldy, 40, 900) }, false);
    } else if (g.mode === 'rotate') {
      const a0 = Math.atan2(g.sy - g.cy, g.sx - g.cx);
      const a1 = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      updateEl(g.id, { rotation: g.orig.rotation + ((a1 - a0) * 180) / Math.PI }, false);
    }
  };
  const onUp = () => {
    const g = gesture.current;
    if (g) {
      if (!g.moved && g.mode === 'move') {
        if (sel === g.id) {
          const el = elsRef.current.find((x) => x.id === g.id);
          if (el && (el.type === 'note' || el.type === 'text' || el.type === 'task')) {
            setEditing(g.id);
          }
        }
      } else {
        commit(elsRef.current);
      }
    }
    gesture.current = null;
  };

  const selEl = els.find((e) => e.id === sel) || null;
  const canvasStyle: CSSProperties = { position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'top left', ...bgStyle(bg, bgColor) };

  return (
    <div className="space-y-3">
      {/* شريط أدوات اللوحة */}
      <div className="flex items-center gap-1.5 flex-wrap bg-white/85 backdrop-blur rounded-2xl p-1.5 border border-sage/15 shadow-soft">
        <TB onClick={() => addEl({ type: 'task' })} label="مهمة">＋</TB>
        <TB onClick={() => addEl({ type: 'note', shape: 'square' })} label="قصاصة">🗒</TB>
        <TB onClick={() => addEl({ type: 'text' })} label="نص">T</TB>
        <TB onClick={() => setDrawer(drawer === 'sticker' ? null : 'sticker')} label="ملصقات" active={drawer === 'sticker'}>♡</TB>
        <TB onClick={() => setDrawer(drawer === 'bg' ? null : 'bg')} label="الخلفية" active={drawer === 'bg'}>🎨</TB>
      </div>

      {/* أدراج */}
      {drawer === 'sticker' && (
        <div className="bg-white rounded-2xl p-3 border border-sage/15 shadow-soft">
          <div className="text-[12px] font-bold text-sage-deep mb-2">اختاري ملصقًا:</div>
          <div className="grid grid-cols-6 gap-2">
            {STICKERS.map((s) => (
              <button key={s.k} onClick={() => addEl({ type: 'sticker', shape: s.k, w: 84, h: 84 })} title={s.name} className="aspect-square rounded-xl bg-sage-light/50 hover:bg-sage-light p-2">
                {s.render('#5C7F60')}
              </button>
            ))}
          </div>
        </div>
      )}
      {drawer === 'bg' && (
        <div className="bg-white rounded-2xl p-3 border border-sage/15 shadow-soft space-y-3">
          <div>
            <div className="text-[12px] font-bold text-sage-deep mb-1.5">نمط الخلفية:</div>
            <div className="flex gap-1.5 flex-wrap">
              {BGS.map((b) => (
                <button
                  key={b.k}
                  onClick={() => {
                    setBg(b.k);
                    commit(els, b.k, bgColor);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold border ${bg === b.k ? 'bg-sage-deep text-white border-transparent' : 'bg-white text-sage-deep border-sage/25'}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[12px] font-bold text-sage-deep mb-1.5">لون الخلفية:</div>
            <div className="flex gap-1.5 flex-wrap">
              {PASTELS.map((p) => (
                <button
                  key={p.k}
                  onClick={() => {
                    const c = p.k === 'none' ? undefined : p.c;
                    setBgColor(c);
                    commit(els, bg, c);
                  }}
                  className={`w-7 h-7 rounded-full border ${(!bgColor && p.k === 'none') || bgColor === p.c ? 'ring-2 ring-sage-deep border-white' : 'border-black/10'}`}
                  style={{ background: p.c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* منطقة اللوحة */}
      <div
        ref={wrapRef}
        className="relative w-full rounded-2xl overflow-hidden border border-sage/20 shadow-soft select-none"
        style={{ height: CANVAS_H * scale, touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => {
          if (editing) setEditing(null);
          setSel(null);
        }}
      >
        <div style={canvasStyle} dir="ltr">
          {[...els]
            .sort((a, b) => a.z - b.z)
            .map((el) => (
              <ElementView
                key={el.id}
                el={el}
                selected={sel === el.id}
                editing={editing === el.id}
                onDown={onElDown}
                onText={(v) => updateEl(el.id, { content: v })}
                onToggleDone={() => updateEl(el.id, { done: !el.done })}
              />
            ))}
        </div>

        {els.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
            <div className="text-3xl mb-2">✨</div>
            <p className="text-sage-deep font-bold">صفحتك الإبداعية — أضيفي قصاصات ونصوصًا وملصقات ورتّبيها كما تحبّين.</p>
          </div>
        )}
      </div>

      {/* شريط أدوات العنصر المحدّد — عائم ثابت أسفل الشاشة (فوق شريط التنقّل) */}
      {selEl && (
        <div className="fixed inset-x-0 bottom-[70px] md:bottom-4 z-40 px-3">
          <div className="mx-auto max-w-3xl bg-white/95 backdrop-blur rounded-2xl p-2.5 border border-sage/25 shadow-lift">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12.5px] font-extrabold text-sage-deep">🎨 أدوات العنصر</span>
              <button onClick={() => setSel(null)} className="mr-auto w-7 h-7 rounded-full bg-sage-light text-sage-deep font-bold">✕</button>
            </div>
            {/* لون */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {selEl.type === 'sticker'
                ? ['#E48AA6', '#5C7F60', '#5E8FB5', '#8E7BC0', '#D9B24C', '#E08A5B', '#41603F', '#9A9A94'].map((c) => (
                    <button key={c} onClick={() => updateEl(selEl.id, { color: c })} className={`w-7 h-7 rounded-full border ${selEl.color === c ? 'ring-2 ring-sage-deep border-white' : 'border-black/10'}`} style={{ background: c }} />
                  ))
                : PASTELS.map((p) => (
                    <button key={p.k} onClick={() => updateEl(selEl.id, { color: p.k })} title={p.n} className={`w-7 h-7 rounded-full border ${selEl.color === p.k || (!selEl.color && p.k === 'none') ? 'ring-2 ring-sage-deep border-white' : 'border-black/10'}`} style={{ background: p.c }} />
                  ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => dupEl(selEl.id)} className="rounded-lg bg-sage-light px-3 py-1.5 text-[13px] font-bold text-sage-deep">⧉ نسخ</button>
              <button onClick={() => setZ(selEl.id, true)} className="rounded-lg bg-sage-light px-3 py-1.5 text-[13px] font-bold text-sage-deep">▲ أمام</button>
              <button onClick={() => setZ(selEl.id, false)} className="rounded-lg bg-sage-light px-3 py-1.5 text-[13px] font-bold text-sage-deep">▼ خلف</button>
              {(selEl.type === 'note' || selEl.type === 'task') && (
                <select value={selEl.shape || 'square'} onChange={(e) => updateEl(selEl.id, { shape: e.target.value })} className="rounded-lg bg-white border border-sage/25 px-2 py-1.5 text-[13px] font-bold text-sage-deep">
                  {NOTE_SHAPES.map((n) => (
                    <option key={n.k} value={n.k}>{n.name}</option>
                  ))}
                </select>
              )}
              <button onClick={() => removeEl(selEl.id)} className="rounded-lg bg-red-500 text-white px-4 py-1.5 text-[13px] font-extrabold mr-auto">🗑 حذف</button>
            </div>
          </div>
        </div>
      )}
      <p className="text-center text-[11.5px] text-sage/60 font-bold">اسحبي العنصر لتحريكه · اضغطيه ثم اكتبي فوقه · المقبض السفلي للتكبير والعلوي للتدوير 🌿</p>
    </div>
  );
}

function TB({ children, label, onClick, active }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex-1 min-w-[58px] rounded-xl py-2 flex flex-col items-center gap-0.5 transition-colors ${active ? 'bg-sage-deep text-white' : 'text-sage-deep hover:bg-sage-light'}`}>
      <span className="text-base leading-none font-extrabold">{children}</span>
      <span className="text-[10.5px] font-bold">{label}</span>
    </button>
  );
}

function ElementView({
  el,
  selected,
  editing,
  onDown,
  onText,
  onToggleDone,
}: {
  el: CanvasEl;
  selected: boolean;
  editing: boolean;
  onDown: (e: React.PointerEvent, el: CanvasEl, mode: 'move' | 'resize' | 'rotate') => void;
  onText: (v: string) => void;
  onToggleDone: () => void;
}) {
  const box: CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: `rotate(${el.rotation}deg)`,
    zIndex: el.z,
    touchAction: 'none',
  };
  const fill = el.type === 'sticker' ? el.color || '#5C7F60' : pastel(el.color) || '#FFFFFF';
  const shp = noteShape(el.shape);

  const editRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      const r = document.createRange();
      r.selectNodeContents(editRef.current);
      r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }, [editing]);

  return (
    <div style={box} onPointerDown={(e) => onDown(e, el, 'move')}>
      {/* المحتوى */}
      {el.type === 'sticker' ? (
        <div className="w-full h-full" style={{ pointerEvents: 'none' }}>{sticker(el.shape).render(fill)}</div>
      ) : (
        <div
          className="w-full h-full flex items-center justify-center relative"
          style={{
            background: el.type === 'text' ? 'transparent' : fill,
            borderRadius: shp.radius,
            boxShadow: el.type === 'text' ? 'none' : '0 2px 8px rgba(47,59,51,.10)',
          }}
        >
          {shp.tape && el.type !== 'text' && (
            <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%) rotate(-4deg)', width: 46, height: 16, background: 'rgba(210,200,170,.6)', borderRadius: 2 }} />
          )}
          {el.type === 'task' && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleDone}
              style={{ position: 'absolute', top: 8, right: 8 }}
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${el.done ? 'bg-sage-deep border-sage-deep text-white' : 'border-sage/50 text-transparent bg-white/70'}`}
            >
              ✓
            </button>
          )}
          <div
            ref={editRef}
            contentEditable={editing}
            suppressContentEditableWarning
            dir="rtl"
            onPointerDown={(e) => {
              if (editing) e.stopPropagation();
            }}
            onBlur={(e) => onText(e.currentTarget.textContent || '')}
            className={`px-3 text-center font-bold text-ink outline-none ${el.done ? 'line-through opacity-60' : ''}`}
            style={{ width: '100%', fontSize: el.type === 'text' ? 20 : 15, lineHeight: 1.4, cursor: editing ? 'text' : 'inherit', fontFamily: "var(--font-cairo),'Tajawal',sans-serif" }}
          >
            {el.content}
          </div>
        </div>
      )}

      {/* التحديد + المقابض */}
      {selected && (
        <>
          <div style={{ position: 'absolute', inset: -3, border: '2px dashed #41603F', borderRadius: 8, pointerEvents: 'none' }} />
          {/* تدوير (أعلى) */}
          <div
            onPointerDown={(e) => onDown(e, el, 'rotate')}
            style={{ position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)', width: 30, height: 30, borderRadius: '50%', background: '#41603F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' }}
          >
            ↻
          </div>
          {/* تكبير (أسفل يمين منطقيًا = زاوية) */}
          <div
            onPointerDown={(e) => onDown(e, el, 'resize')}
            style={{ position: 'absolute', bottom: -14, right: -14, width: 28, height: 28, borderRadius: '50%', background: '#C9A84C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'nwse-resize', touchAction: 'none', fontSize: 12 }}
          >
            ⤡
          </div>
        </>
      )}
    </div>
  );
}
