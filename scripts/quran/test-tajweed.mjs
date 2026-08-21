#!/usr/bin/env node
/**
 * اختبارات محرّك أحكام التجويد.
 *
 * ⚠️ **كل نصّ هنا يُقرأ من `quran-uthmani.txt`، ولا تُكتب آية من
 * الذاكرة.** فإن أخطأنا في النقل ظهر الخطأ في المرجع لا في الحكم.
 *
 * ⚠️ **ولا يُعدّ نجاحُ هذه الاختبارات إجازةً شرعية.** هي تثبت أن
 * المحرّك يفعل ما قصدنا، ولا تثبت أن ما قصدناه صواب. وذاك لأهل
 * التجويد لا لنا.
 */
import { readFileSync } from "node:fs";
import { annotateAyah } from "../../.quran-test/tajweed/engine.js";

const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
const AYAH = new Map();
for (const line of raw.split("\n")) {
  if (line.startsWith("#") || line.split("|").length < 3) continue;
  const [s, a, t] = line.split("|");
  if (/^\d+$/.test(s)) AYAH.set(`${s}:${a}`, t);
}

let passed = 0, failed = 0;
const ok = (c, label, extra = "") => {
  if (c) passed++;
  else { failed++; console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ""}`); }
};

/** هل في هذه الآية حكمٌ من نوعٍ ما على كلمةٍ نصّها كذا؟ */
function ruleAt(ref, rule, word) {
  const [s, a] = ref.split(":").map(Number);
  const text = AYAH.get(ref);
  const anns = annotateAyah(text, s, a);
  const words = text.split(" ");
  return anns.some(
    (x) => x.rule === rule && (word === undefined || words[x.wordIndex] === word)
  );
}

console.log("\n  📖 اختبارات أحكام التجويد\n");

// ── النون الساكنة والتنوين ─────────────────────────────────
ok(ruleAt("13:33", "idhhar"), "إظهار: مِنْ هَادٍ");
ok(ruleAt("2:94", "ikhfa"), "إخفاء: عِندَ");
ok(ruleAt("2:27", "iqlab"), "إقلاب: مِنۢ بَعْدِ");
ok(ruleAt("2:5", "idgham_no_ghunnah"), "إدغام بغير غنّة: مِن رَّبِّ");
ok(ruleAt("2:8", "idgham_ghunnah"), "إدغام بغنّة: مَن يَقُولُ");

// ⚠️ الإدغام الناقص — لا شدّة في الرسم، وهو ما كاد يُفوّت
const naqis = AYAH.get("2:107");
ok(
  annotateAyah(naqis, 2, 107).some((x) => x.rule === "idgham_ghunnah" && x.next === "و"),
  "⚠️ إدغام ناقص بلا شدّة: مِن وَلِىٍّ"
);

// ⚠️ الإظهار المطلق — نفس الكلمة فلا إدغام
const dunya = [...AYAH.entries()].find(([, t]) => t.includes("ٱلدُّنْيَا"));
if (dunya) {
  const [ref, text] = dunya;
  const [s, a] = ref.split(":").map(Number);
  const anns = annotateAyah(text, s, a);
  const words = text.split(" ");
  const onDunya = anns.filter((x) => words[x.wordIndex].includes("ٱلدُّنْيَا"));
  ok(
    !onDunya.some((x) => x.rule === "idgham_ghunnah"),
    "⚠️ إظهار مطلق: ٱلدُّنْيَا لا إدغام فيها",
    ref
  );
  ok(onDunya.some((x) => x.rule === "idhhar"), "وتُعلَّم إظهارًا", ref);
}

// ── الميم الساكنة ──────────────────────────────────────────
ok(ruleAt("2:6", "idhhar_shafawi"), "إظهار شفوي: أَمْ لَمْ");
const shafawi = [...AYAH.entries()].find(([, t]) => / هُم بِ/.test(t));
ok(!!shafawi && ruleAt(shafawi[0], "ikhfa_shafawi"), "إخفاء شفوي: هُم بِـ");

// ── أحكام عامة ─────────────────────────────────────────────
ok(ruleAt("1:1", "hamzat_wasl"), "همزة وصل: ٱللَّهِ");
ok(ruleAt("1:1", "lam_shamsiyyah"), "لام شمسية: ٱلرَّحْمَٰنِ");
ok(!ruleAt("2:2", "lam_shamsiyyah", "ٱلْكِتَٰبُ"), "⚠️ ولا شمسية في القمرية: ٱلْكِتَٰبُ");
// ⚠️ نبحث عن الشاهد في المصحف بدل أن نكتب رقم آية من الذاكرة
const find = (re) => [...AYAH.entries()].find(([, t]) => re.test(t));
/**
 * ⚠️ نتحقّق من **الخاصيّة** لا من آيةٍ نكتبها بأيدينا.
 *
 * كتبتُ أوّلًا `إِنَّ` في الاختبار فلم يطابق شيئًا — لأن ترتيب الشدّة
 * والحركة في الرسم غيرُ ما كتبتُه. فسقط الاختبار والمحرّك سليم.
 * والقاعدة: **لا يُكتب نصٌّ عربيّ في اختبار**، بل يُستخرج ويُفحص.
 */
const SHADDA = "\u0651";
let ghunnahOk = 0, ghunnahBad = 0;
for (const [ref, text] of AYAH) {
  const [gs, ga] = ref.split(":").map(Number);
  for (const x of annotateAyah(text, gs, ga)) {
    if (x.rule !== "ghunnah") continue;
    const marks = text.slice(x.start + 1, x.end);
    if ((x.trigger === "\u0646" || x.trigger === "\u0645") && marks.includes(SHADDA))
      ghunnahOk++;
    else ghunnahBad++;
  }
}
ok(ghunnahOk > 5000 && ghunnahBad === 0,
   "غنّة: كل موضع نونٌ أو ميمٌ تحمل شدّةً فعلًا",
   `سليم ${ghunnahOk} · مخالف ${ghunnahBad}`);
const qal = find(/قَدْ أَ/);
ok(!!qal && ruleAt(qal[0], "qalqalah"), "قلقلة: دالٌ ساكنة (قَدْ)", qal?.[0]);

/**
 * ⚠️ ألفُ التنوين لا تُحسب حرفًا تاليًا.
 *
 * تنوين الفتح يُرسم ومعه ألفٌ صامتة (`كِتَٰبًا`)، وحسبناها أوّل مرّة
 * حرفًا فأنتجت ٢٬٩٧٩ حكمَ إخفاءٍ باطلًا — والألف ليست من حروفه أصلًا.
 * وكشفه سؤال «ما الحرف التالي؟» لا سؤال «كم حكمًا خرج؟».
 */
const alifTanween = find(/ًا /);
if (alifTanween) {
  const [ref, text] = alifTanween;
  const [s2, a2] = ref.split(":").map(Number);
  const bad = annotateAyah(text, s2, a2).filter((x) => x.next === "ا");
  ok(bad.length === 0, "⚠️ لا حكم حرفُه التالي ألفٌ صامتة", `${ref} · ${bad.length}`);
}

/**
 * ⚠️ الإقلاب عبر حدّ الآية لا يُجزَم به — وهذا قصدٌ لا نقص.
 *
 * `عَلِيمٌۢ` في آخر الآية وبعدها آيةٌ تبدأ بباء: الإقلاب يقع إن وصل
 * القارئ ويسقط إن وقف. ونحن لا نعلم اختياره، فلا نحكم عليه به.
 */
const crossAyah = [...AYAH.entries()].filter(([, t]) => /ۢ$/.test(t));
ok(crossAyah.length > 0, "توجد علاماتُ إقلابٍ في أواخر الآيات", String(crossAyah.length));
if (crossAyah.length) {
  const [ref, text] = crossAyah[0];
  const [s3, a3] = ref.split(":").map(Number);
  ok(
    !annotateAyah(text, s3, a3).some((x) => x.rule === "iqlab" && x.end >= text.length),
    "⚠️ ولا يُحكم بها — لأنها تتوقّف على وصلِ القارئ",
    ref
  );
}

// ── سلامة البنية على المصحف كلّه ───────────────────────────
let bad = 0, total = 0, words = 0, ayahs = 0;
const perRule = new Map();
for (const [ref, text] of AYAH) {
  const [s, a] = ref.split(":").map(Number);
  const anns = annotateAyah(text, s, a);
  ayahs++;
  const w = text.split(" ").length;
  words += w;
  for (const x of anns) {
    total++;
    perRule.set(x.rule, (perRule.get(x.rule) ?? 0) + 1);
    // ⚠️ كل موضع يجب أن يقع داخل الآية، وأن يبدأ بحرفه المسبِّب
    if (
      x.start < 0 || x.end > text.length || x.start >= x.end ||
      x.wordIndex < 0 || x.wordIndex >= w ||
      text[x.start] !== x.trigger
    ) bad++;
  }
}
ok(bad === 0, "⚠️ كل موضع داخل آيته ويبدأ بحرفه المسبِّب", `مخالف: ${bad}`);
ok(ayahs === 6236, "المصحف كامل", String(ayahs));

// ⚠️ لا حكم على حرفٍ لا يُنطق
let onSilent = 0;
for (const [ref, text] of AYAH) {
  const [s, a] = ref.split(":").map(Number);
  for (const x of annotateAyah(text, s, a)) {
    const after = text.slice(x.start + 1, x.end);
    if (/[۟۠]/.test(after) && x.rule !== "hamzat_wasl") onSilent++;
  }
}
ok(onSilent === 0, "⚠️ لا حكم منطوق على حرفٍ عليه صفرُ السكوت", String(onSilent));

console.log("\n  ── ما استُخرج من المصحف كاملًا ──");
console.log(`  الآيات: ${ayahs} · الكلمات: ${words} · المواضع: ${total}`);
for (const [r, n] of [...perRule].sort((a, b) => b[1] - a[1]))
  console.log(`    ${r.padEnd(20)} ${String(n).padStart(6)}`);

console.log(`\n  ${passed} نجحت · ${failed} فشلت\n`);
process.exit(failed ? 1 : 0);
