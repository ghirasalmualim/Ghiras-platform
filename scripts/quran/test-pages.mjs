#!/usr/bin/env node
/**
 * اختبارات صفحات المصحف.
 *
 * حدود الصفحات بيانات مرجعية: لا تُصلحها الشاشة إن أخطأت، ولا يظهر
 * خطؤها إلا لمن يحفظ بالورقة فيجد آية ناقصة. فتُفحص كلها لا عيّنة
 * منها — ٦٠٤ صفحة رقمٌ يُفحص كاملًا في أجزاء من الثانية.
 *
 * ⚠️ الفحص الأهم هو التغطية: كل آية في المصحف تقع في صفحة واحدة لا
 * أكثر ولا أقل. فلو سقطت آية بين صفحتين لضاعت من كل من يحفظ بالصفحات
 * ولم ينتبه أحد.
 */

import { readFileSync } from "node:fs";
import {
  TOTAL_PAGES,
  getPage,
  pageOf,
  pagesOfSurah,
  surahsOfPage,
  ayahCountOfPage,
  juzOfPage,
} from "../../.quran-test/engine/pages.js";

let failed = 0;
const ok = (cond, label, extra = "") => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ""}`);
    failed++;
  }
};

console.log("\n  ═══ صفحات المصحف ═══\n");

// ── المصحف المرجعي: نبني منه الحقيقة التي نقيس عليها ──────────
const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
/** `${surah}:${ayah}` لكل آية في المصحف، بترتيبها. */
const allAyahs = [];
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const a = t.indexOf("|");
  const b = t.indexOf("|", a + 1);
  if (a === -1 || b === -1) continue;
  allAyahs.push(`${t.slice(0, a)}:${t.slice(a + 1, b)}`);
}
console.log(`  آيات المصحف المرجعي: ${allAyahs.length}\n`);

// ── ١) كل صفحة موجودة وسليمة الشكل ────────────────────────────
let shapeOk = true;
let shapeWhy = "";
for (let p = 1; p <= TOTAL_PAGES; p++) {
  const page = getPage(p);
  if (!page || !page.segments.length) {
    shapeOk = false;
    shapeWhy = `الصفحة ${p} فارغة`;
    break;
  }
  for (const s of page.segments) {
    if (s.from_ayah < 1 || s.to_ayah < s.from_ayah || s.surah < 1 || s.surah > 114) {
      shapeOk = false;
      shapeWhy = `مقطع غير سليم في الصفحة ${p}: ${JSON.stringify(s)}`;
      break;
    }
  }
  if (!shapeOk) break;
}
ok(shapeOk, `الصفحات ${TOTAL_PAGES} كلها موجودة وحدودها سليمة`, shapeWhy);

// ── ٢) خارج الحدود يرجع null لا صفحة ملفّقة ───────────────────
ok(
  getPage(0) === null &&
    getPage(TOTAL_PAGES + 1) === null &&
    getPage(1.5) === null &&
    getPage(NaN) === null,
  "خارج الحدود والكسور يرجع null — لا تُلفَّق صفحة"
);

// ── ٣) التغطية: كل آية في صفحة واحدة بالضبط ───────────────────
const seen = new Map();
const order = [];
for (let p = 1; p <= TOTAL_PAGES; p++) {
  for (const s of getPage(p).segments) {
    for (let a = s.from_ayah; a <= s.to_ayah; a++) {
      const key = `${s.surah}:${a}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      order.push(key);
    }
  }
}
ok(
  order.length === allAyahs.length,
  `مجموع آيات الصفحات = آيات المصحف (${allAyahs.length})`,
  `وُجد ${order.length}`
);
const dup = [...seen.entries()].filter(([, n]) => n > 1);
ok(dup.length === 0, "لا آية مكرّرة في صفحتين", dup.slice(0, 5).join(", "));
const missing = allAyahs.filter((k) => !seen.has(k));
ok(missing.length === 0, "لا آية ساقطة بين الصفحات", missing.slice(0, 5).join(", "));

// ── ٤) الترتيب: الصفحات تتبع ترتيب المصحف حرفًا بحرف ──────────
let orderOk = true;
let orderWhy = "";
for (let i = 0; i < Math.min(order.length, allAyahs.length); i++) {
  if (order[i] !== allAyahs[i]) {
    orderOk = false;
    orderWhy = `عند الموضع ${i + 1}: الصفحات تقول ${order[i]} والمصحف يقول ${allAyahs[i]}`;
    break;
  }
}
ok(orderOk, "ترتيب آيات الصفحات مطابق لترتيب المصحف", orderWhy);

// ── ٥) الصفحة العابرة تُعرض كما هي لا مقسَّمة ─────────────────
const crossing = [];
for (let p = 1; p <= TOTAL_PAGES; p++) {
  if (surahsOfPage(getPage(p)).length > 1) crossing.push(p);
}
ok(
  crossing.length > 0 && crossing.length < TOTAL_PAGES * 0.2,
  `الصفحات العابرة ${crossing.length} من ${TOTAL_PAGES} — تُعرض بسورها معًا`
);
// الصفحة الأولى من الأخيرات: نتأكد أن مقاطعها متتابعة لا متداخلة
{
  const page = getPage(crossing[0]);
  let seqOk = true;
  for (let i = 1; i < page.segments.length; i++) {
    if (page.segments[i].surah <= page.segments[i - 1].surah) seqOk = false;
  }
  ok(seqOk, `مقاطع الصفحة العابرة ${crossing[0]} متتابعة بترتيب السور`);
}

// ── ٦) pageOf عكس getPage تمامًا ──────────────────────────────
{
  let inverseOk = true;
  let why = "";
  // عيّنة موزّعة: الفحص الكامل هنا ٦٢٣٦ × ٦٠٤ وهو بطيء بلا فائدة
  for (const p of [1, 2, 50, 255, 300, 445, 590, 603, 604]) {
    const page = getPage(p);
    for (const s of page.segments) {
      for (const a of [s.from_ayah, s.to_ayah]) {
        const back = pageOf(s.surah, a);
        if (back !== p) {
          inverseOk = false;
          why = `${s.surah}:${a} في الصفحة ${p} لكن pageOf يقول ${back}`;
        }
      }
    }
  }
  ok(inverseOk, "pageOf يرجع نفس الصفحة التي جاءت منها الآية", why);
}
ok(pageOf(115, 1) === null && pageOf(1, 99) === null, "آية غير موجودة ← null");

// ── ٧) معالم معروفة يمكن التحقق منها بفتح المصحف ──────────────
ok(pageOf(1, 1) === 1, "الفاتحة في الصفحة ١");
ok(pageOf(2, 1) === 2, "أول البقرة في الصفحة ٢");
ok(pageOf(2, 255) === 42, "آية الكرسي في الصفحة ٤٢", `وُجد ${pageOf(2, 255)}`);
ok(pageOf(18, 1) === 293, "أول الكهف في الصفحة ٢٩٣", `وُجد ${pageOf(18, 1)}`);
ok(pageOf(36, 1) === 440, "أول يس في الصفحة ٤٤٠", `وُجد ${pageOf(36, 1)}`);
ok(pageOf(67, 1) === 562, "أول الملك في الصفحة ٥٦٢", `وُجد ${pageOf(67, 1)}`);
ok(pageOf(114, 6) === 604, "آخر الناس في الصفحة ٦٠٤");

// ── ٨) pagesOfSurah ───────────────────────────────────────────
{
  const fatiha = pagesOfSurah(1);
  ok(fatiha.length === 1 && fatiha[0] === 1, "الفاتحة صفحة واحدة");
  const baqarah = pagesOfSurah(2);
  ok(
    baqarah[0] === 2 && baqarah.length > 40,
    `البقرة تمتدّ على ${baqarah.length} صفحة تبدأ من ٢`
  );
  // كل سورة لها صفحة واحدة على الأقل، ولا سورة بلا صفحات
  let everySurah = true;
  for (let s = 1; s <= 114; s++) if (!pagesOfSurah(s).length) everySurah = false;
  ok(everySurah, "كل سور المصحف الـ١١٤ لها صفحات");
}

// ── ٩) العدّ والجزء ───────────────────────────────────────────
ok(ayahCountOfPage(getPage(1)) === 7, "صفحة الفاتحة سبع آيات");
{
  let sum = 0;
  for (let p = 1; p <= TOTAL_PAGES; p++) sum += ayahCountOfPage(getPage(p));
  ok(sum === allAyahs.length, `مجموع العدّ عبر الصفحات = ${allAyahs.length}`);
}
ok(
  juzOfPage(1) === 1 && juzOfPage(2) === 1 && juzOfPage(604) === 30,
  "الجزء يبدأ من ١ وينتهي عند ٣٠"
);
{
  let monotonic = true;
  for (let p = 2; p <= TOTAL_PAGES; p++) {
    const a = juzOfPage(p - 1);
    const b = juzOfPage(p);
    if (b < a || b > a + 1) monotonic = false;
  }
  ok(monotonic, "رقم الجزء يتصاعد صفحةً صفحة بلا قفز");
}

if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص.\n`);
  process.exit(1);
}
console.log(`\n  ✅ اجتازت صفحات المصحف كل الفحوص.\n`);
