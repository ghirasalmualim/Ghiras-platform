"use client";
// صور كاميرا الآيفون/الآيباد (HEIC) — تحويلها إلى JPEG قبل الرفع.
//
// WebKit يفكّ HEIC أصلًا، فنرسم الصورة على canvas ونصدّرها JPEG داخل المتصفّح.
// هذا يحلّ الحالة الواقعية (المعلمة ترفع من جوّالها)، ويصغّر الحجم فيسرع الرفع.
// لو فشل الفكّ (كروم/فايرفوكس على الكمبيوتر) نرسل الملف كما هو والخادم يتكفّل.

const HEIC_RE = /\.(heic|heif)$/i;
/** أطول ضلع بعد التصغير — يكفي تمامًا لقراءة صفحة كتاب. */
const MAX_EDGE = 2400;

export function isHeic(file: File): boolean {
  return HEIC_RE.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
}

/** فكّ الصورة: createImageBitmap أولًا، وإلا عبر <img> (أوسع دعمًا في سفاري). */
async function decode(file: File): Promise<{ draw: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    // from-image: يحترم دوران الصورة المسجَّل في EXIF — صفحة الكتاب تصل معتدلة
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { draw: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close?.() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      return {
        draw: img,
        w: img.naturalWidth,
        h: img.naturalHeight,
        done: () => URL.revokeObjectURL(url),
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}

async function toJpeg(file: File): Promise<File> {
  const { draw, w, h, done } = await decode(file);
  try {
    if (!w || !h) throw new Error("empty");
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) throw new Error("blob");
    return new File([blob], file.name.replace(HEIC_RE, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    done();
  }
}

/** يُرجع الملف نفسه إن لم يكن HEIC أو تعذّر التحويل — فلا يمنع الرفع أبدًا. */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    return await toJpeg(file);
  } catch {
    return file;
  }
}

export async function normalizeImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(normalizeImageFile));
}
