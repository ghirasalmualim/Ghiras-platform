/**
 * قراءة نص المصحف — المرحلة ١.
 *
 * النص يعيش **ملفًا في المستودع** لا سطورًا في قاعدة بيانات:
 * `corpus/quran-uthmani.txt` كما نزل من Tanzil حرفًا بحرف، بترويسة
 * ترخيصه كما هي. وبجانبه `manifest.json` يحمل مصدره وترخيصه وبصمته.
 *
 * لماذا ملف لا جدول:
 *   • النص لا يتغيّر أبدًا، فوضعه في جدول يُحدَّث نوع من الادّعاء.
 *   • في Git تُرى أي كلمة تتغيّر كسطر أحمر في المراجعة. لا يوجد جدول
 *     يعطي هذا الضمان.
 *   • البصمة المنشورة تُحسب على ملف موجود فعلًا، فيقدر أي أحد أن ينزّل
 *     من Tanzil ويقارن بنفسه.
 *   • الإسناد يسافر في نفس الالتزام مع النص، فلا ينفصل عنه أبدًا.
 *
 * ⚠️ للخادم فقط. النص كامل ١٫٣ ميغابايت ولا يُرسل إلى المتصفح إطلاقًا؛
 * الصفحات تُصيّر على الخادم ولا يصل المتصفح إلا الآيات المطلوبة.
 *
 * ⚠️ للقراءة فقط. لا توجد هنا — ولا يجوز أن توجد — أي دالة تكتب في النص.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Ayah, CorpusManifest, QuranWord, Surah } from "../types";
import { normalizeForComparison, splitWords } from "../engine/normalize.mjs";

if (typeof window !== "undefined") {
  throw new Error("corpus.ts للخادم فقط — لا يُستورد في مكوّن عميل.");
}

const DIR = path.join(process.cwd(), "src", "features", "quran", "corpus");

type Loaded = {
  manifest: CorpusManifest;
  surahs: Surah[];
  /** الآيات مفهرسة بالسورة: ayahsBySurah[3] = آيات سورة آل عمران مرتّبة. */
  ayahsBySurah: Map<number, Ayah[]>;
};

let cache: Loaded | null = null;

/**
 * يُحمَّل مرة واحدة لكل نسخة تشغيل ثم يبقى في الذاكرة.
 *
 * التحقق من البصمة يجري هنا في كل إقلاع، لا مرة واحدة عند الاستيراد.
 * فلو تغيّر الملف بأي سبب — تحرير بالغلط، أو ضرر في النقل — يتوقف
 * القسم كله بخطأ صريح بدل أن يعرض نصًا لا نعرف مصدره.
 */
function load(): Loaded {
  if (cache) return cache;

  const manifest = JSON.parse(
    readFileSync(path.join(DIR, "manifest.json"), "utf8")
  ) as CorpusManifest;

  const raw = readFileSync(path.join(DIR, manifest.text_file), "utf8");
  const sha = createHash("sha256").update(raw, "utf8").digest("hex");
  if (sha !== manifest.text_sha256) {
    throw new Error(
      `بصمة نص المصحف لا تطابق المُعلنة.\n` +
        `  المتوقع: ${manifest.text_sha256}\n` +
        `  الموجود: ${sha}\n` +
        `النص تغيّر عن المصدر الموثّق — القسم متوقف حتى يُراجَع.`
    );
  }

  const surahs = JSON.parse(
    readFileSync(path.join(DIR, "surahs.json"), "utf8")
  ) as Surah[];

  // صيغة Tanzil:  سورة|آية|نص   والأسطر التي تبدأ بـ # ترويسة الترخيص.
  const ayahsBySurah = new Map<number, Ayah[]>();
  let count = 0;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const a = t.indexOf("|");
    const b = t.indexOf("|", a + 1);
    if (a === -1 || b === -1) continue;
    const surah = Number(t.slice(0, a));
    const ayah = Number(t.slice(a + 1, b));
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue;
    const list = ayahsBySurah.get(surah) ?? [];
    list.push({ surah, ayah, text_uthmani: t.slice(b + 1) });
    ayahsBySurah.set(surah, list);
    count++;
  }

  if (count !== manifest.ayah_count)
    throw new Error(`عدد الآيات ${count} بدل ${manifest.ayah_count}`);
  if (surahs.length !== manifest.surah_count)
    throw new Error(`عدد السور ${surahs.length} بدل ${manifest.surah_count}`);
  for (const s of surahs) {
    const got = ayahsBySurah.get(s.number)?.length ?? 0;
    if (got !== s.ayah_count)
      throw new Error(`السورة ${s.number}: ${got} آية بدل ${s.ayah_count}`);
  }

  cache = { manifest, surahs, ayahsBySurah };
  return cache;
}

/**
 * بيانات الإسناد: المصدر والطبعة والرواية والترخيص والبصمة.
 * تُقرأ من نفس الملف الذي يحمل النص، فلا يمكن أن تنفصل عنه ولا أن تصف
 * نسخة غير النسخة المعروضة فعلًا.
 */
export function getManifest(): CorpusManifest {
  return load().manifest;
}

/** فهرس السور الـ١١٤ بترتيب المصحف. */
export function getSurahs(): Surah[] {
  return load().surahs;
}

export function getSurah(number: number): Surah | null {
  return load().surahs.find((s) => s.number === number) ?? null;
}

/**
 * آيات سورة، أو مقطعًا منها. المدى شامل للطرفين.
 * تُرجع نسخة جديدة حتى لا يعدّل مستهلكٌ الذاكرة المشتركة.
 */
export function getAyahs(surah: number, from?: number, to?: number): Ayah[] {
  const all = load().ayahsBySurah.get(surah);
  if (!all) return [];
  const start = from ?? 1;
  const end = to ?? all.length;
  return all.filter((a) => a.ayah >= start && a.ayah <= end).map((a) => ({ ...a }));
}

/**
 * كلمات مقطع، مرتّبة بالآية ثم الموضع.
 *
 * تُشتق من النص وقت الطلب لا تُخزَّن: مصدرها الوحيد `text_uthmani`،
 * والاشتقاق حتمي فلا فائدة من تخزينه، ولا خطر من انحرافه.
 *
 * `position` يبدأ من ١، والترتيب جزء أصيل من البيانات: لا يخلطه أي
 * مستهلك، ولا يوجد في المنصة نشاط يعيد ترتيب كلمات الآية.
 */
export function getWords(surah: number, from: number, to: number): QuranWord[] {
  const out: QuranWord[] = [];
  for (const a of getAyahs(surah, from, to)) {
    splitWords(a.text_uthmani).forEach((w, i) =>
      out.push({
        surah: a.surah,
        ayah: a.ayah,
        position: i + 1,
        text_uthmani: w,
        text_normalized: normalizeForComparison(w),
      })
    );
  }
  return out;
}
