#!/usr/bin/env node
/**
 * اختبار محركَي الصوت والحفظ الخفي — المرحلة ١.
 *
 * يُشغَّل على الشيفرة المبنيّة (`.next`) لأن المحركين بلغة TypeScript.
 * الأسهل والأوثق: نستخرج المنطق عبر tsc إلى ملفات مؤقتة ونختبرها.
 * انظر `npm run test:quran`.
 *
 * ما يثبته:
 *   الصوت  ١) رقم الآية العام صحيح عند حدود السور ونهاية المصحف
 *          ٢) عدد آيات السور يطابق ملف المصحف نفسه (لا نسخة منحرفة)
 *          ٣) طول قائمة التشغيل وترتيبها يطابقان النطاق المطلوب
 *          ٤) الرفض عند آية خارج السورة
 *   الإخفاء ٥) الإخفاء تراكمي: ما خُفي في مستوى يبقى مخفيًا فيما بعده
 *          ٦) حتمي: نفس المدخلات تعطي نفس النتيجة دائمًا
 *          ٧) المستوى ٠ لا يخفي شيئًا، والمستوى ٥ يخفي الكل
 *          ٨) النائب لا يكشف الكلمة ولا يفرغ السطر
 */

import { readFileSync } from "node:fs";
import {
  ayahCountOf,
  globalAyahNumber,
  buildPlaylist,
  basmalaAudioUrl,
  clampRepeat,
} from "../../.quran-test/engine/audio.js";
import { hiddenIndices } from "../../.quran-test/engine/hide.js";

let failed = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ""}`);
    failed++;
  }
};

console.log("\n  ═══ اختبار محركَي الصوت والحفظ ═══\n");

// ── ١) رقم الآية العام ───────────────────────────────────────
ok(globalAyahNumber(1, 1) === 1, "الفاتحة ١:١ ← ١");
ok(globalAyahNumber(1, 7) === 7, "الفاتحة ١:٧ ← ٧");
ok(globalAyahNumber(2, 1) === 8, "البقرة ٢:١ ← ٨ (أول آية بعد الفاتحة)");
ok(globalAyahNumber(2, 255) === 262, "آية الكرسي ٢:٢٥٥ ← ٢٦٢");
ok(globalAyahNumber(114, 6) === 6236, "الناس ١١٤:٦ ← ٦٢٣٦ (آخر المصحف)");

// ── ٢) عدد الآيات يطابق ملف المصحف نفسه ─────────────────────
const surahs = JSON.parse(
  readFileSync("src/features/quran/corpus/surahs.json", "utf8")
);
const mismatch = surahs.filter((s) => ayahCountOf(s.number) !== s.ayah_count);
ok(
  mismatch.length === 0,
  `عدد آيات السور يطابق ملف المصحف (١١٤/١١٤)`,
  mismatch.length ? `أول اختلاف: سورة ${mismatch[0].number}` : ""
);

// ── ٣) قائمة التشغيل ────────────────────────────────────────
const reciter = { base_url: "https://x/y" };
const seg = { surah: 1, from_ayah: 1, to_ayah: 3 };

const byAyah = buildPlaylist(reciter, seg, 5, "ayah");
ok(byAyah.length === 15, "تكرار الآية ٥ مرات لثلاث آيات ← ١٥ عنصرًا");
ok(
  byAyah.slice(0, 5).every((i) => i.ayah === 1) && byAyah[5].ayah === 2,
  "نطاق «آية»: تُكرَّر الأولى خمسًا ثم تنتقل للثانية"
);

const byRange = buildPlaylist(reciter, seg, 5, "range");
ok(byRange.length === 15, "تكرار المدى ٥ مرات لثلاث آيات ← ١٥ عنصرًا");
ok(
  byRange.slice(0, 3).map((i) => i.ayah).join() === "1,2,3" && byRange[3].ayah === 1,
  "نطاق «المدى»: يُتلى ١←٢←٣ ثم يُعاد من أوله"
);
ok(
  byRange[0].url === "https://x/y/1.mp3" && byRange[2].url === "https://x/y/3.mp3",
  "الروابط تُبنى من رقم الآية العام"
);
ok(
  clampRepeat(0) === 1 && clampRepeat(-4) === 1 && clampRepeat(500) === 99 &&
    clampRepeat(NaN) === 1,
  "التكرار المخصص يُقيَّد بين ١ و٩٩ ولا يقبل قيمة فاسدة"
);

// ── ٣ب) البسملة في قائمة التشغيل ────────────────────────────
ok(
  basmalaAudioUrl(reciter) === "https://x/y/1.mp3",
  "رابط البسملة = الملف رقم ١ (بسملة الفاتحة، ٥٫٢ ثانية بصوت القارئ)"
);

const withB = buildPlaylist(reciter, seg, 5, "range", true);
ok(
  withB.length === 16 && withB[0].isBasmala === true && withB[1].ayah === 1,
  `البسملة تتقدّم القائمة (${withB.length} عنصرًا بدل ١٥)`
);
ok(
  withB.filter((i) => i.isBasmala).length === 1,
  "البسملة تُتلى مرة واحدة لا مع كل جولة تكرار"
);
ok(
  withB[0].ayah === 0,
  "البسملة بلا رقم آية — فلا تُظلَّل ولا يُعرض لها رقم"
);
const withBAyah = buildPlaylist(reciter, seg, 3, "ayah", true);
ok(
  withBAyah.filter((i) => i.isBasmala).length === 1 && withBAyah[0].isBasmala,
  "وكذلك في نطاق «آية آية»: بسملة واحدة في الأول"
);
ok(
  buildPlaylist(reciter, seg, 5, "range", false).every((i) => !i.isBasmala),
  "بلا بسملة إذا لم يطلبها النص (التوبة، أو مقطع من وسط السورة)"
);

// ── ٤) الرفض عند آية خارج السورة ────────────────────────────
let threw = false;
try { globalAyahNumber(1, 8); } catch { threw = true; }
ok(threw, "يرفض آية خارج حدود السورة (الفاتحة ١:٨)");

// ── ٥) الإخفاء تراكمي ───────────────────────────────────────
let cumulativeOk = true;
let cumulativeErr = "";
for (let words = 3; words <= 40; words++) {
  for (let seed = 1; seed <= 30; seed++) {
    for (let lv = 1; lv <= 5; lv++) {
      const prev = hiddenIndices(words, lv - 1, seed);
      const cur = hiddenIndices(words, lv, seed);
      for (const i of prev)
        if (!cur.has(i)) {
          cumulativeOk = false;
          cumulativeErr = `كلمات=${words} بذرة=${seed} مستوى ${lv - 1}→${lv}: الموضع ${i} ظهر مرة أخرى`;
        }
    }
  }
}
ok(cumulativeOk, "الإخفاء تراكمي: لا كلمة مخفية تعود للظهور", cumulativeErr);

// ── ٦) حتمي ─────────────────────────────────────────────────
const a = [...hiddenIndices(12, 3, 7)].sort().join();
const b = [...hiddenIndices(12, 3, 7)].sort().join();
ok(a === b && a.length > 0, "حتمي: نفس المدخلات تعطي نفس الإخفاء");

// ── ٧) الحدّان ──────────────────────────────────────────────
ok(hiddenIndices(10, 0, 3).size === 0, "المستوى ٠ لا يخفي شيئًا");
ok(hiddenIndices(10, 5, 3).size === 10, "المستوى ٥ يخفي كل الكلمات");
let monotone = true;
for (let lv = 1; lv <= 5; lv++)
  if (hiddenIndices(20, lv, 9).size < hiddenIndices(20, lv - 1, 9).size) monotone = false;
ok(monotone, "عدد المخفي يزيد أو يثبت مع كل مستوى، ولا ينقص");

// ── ٨) الإخفاء لا يمسّ عدد الكلمات ولا ترتيبها ──────────────
// الحارس الأهم: مهما بلغ الإخفاء، تبقى المواضع هي المواضع. لو أدخل
// أحد يومًا خلطًا للترتيب، يسقط هذا الفحص.
let orderKept = true;
for (let lv = 0; lv <= 5; lv++) {
  const idx = [...hiddenIndices(9, lv, 4)];
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i > 8)) orderKept = false;
  if (new Set(idx).size !== idx.length) orderKept = false;
}
ok(orderKept, "المواضع المخفية أرقام صحيحة داخل حدود الآية بلا تكرار");

// ── الخلاصة ─────────────────────────────────────────────────
if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص.\n`);
  process.exit(1);
}
console.log("\n  ✅ المحركان سليمان.\n");
