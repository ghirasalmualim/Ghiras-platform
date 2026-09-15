// ثوابت وأنواع مشتركة بين AgendaApp و CreativePlanner (لتفادي الاستيراد الدائري)

export interface CanvasEl {
  id: string;
  type: 'note' | 'text' | 'sticker' | 'task';
  x: number;
  y: number; // إحداثيات منطقية داخل CANVAS_W×CANVAS_H
  w: number;
  h: number;
  rotation: number;
  z: number;
  color?: string;
  content?: string;
  shape?: string; // مفتاح شكل القصاصة أو الملصق
  done?: boolean; // لعنصر المهمة
}
export interface Canvas {
  bg?: string;
  bgColor?: string;
  els: CanvasEl[];
}

/* قياس منطقي ثابت للّوحة (يُقاس ويُحفظ ثم يُحجَّم ليناسب الشاشة) */
export const CANVAS_W = 720;
export const CANVAS_H = 1040;

/* باستيل مشترك (الوضع الهادئ + القصاصات) */
export const PASTELS: { k: string; c: string; n: string }[] = [
  { k: 'none', c: '#FFFFFF', n: 'أبيض' },
  { k: 'pink', c: '#F7D6DE', n: 'وردي' },
  { k: 'sage', c: '#D9E6D9', n: 'أخضر' },
  { k: 'blue', c: '#D4E6F1', n: 'سماوي' },
  { k: 'lav', c: '#E4DCF2', n: 'لافندر' },
  { k: 'butter', c: '#F7EFCB', n: 'أصفر' },
  { k: 'peach', c: '#FADFC9', n: 'خوخي' },
  { k: 'cream', c: '#FBF3E4', n: 'كريمي' },
  { k: 'beige', c: '#ECE4D6', n: 'بيج' },
  { k: 'gray', c: '#E8E8E4', n: 'رمادي' },
];
export const pastel = (k?: string) => PASTELS.find((p) => p.k === k)?.c;
