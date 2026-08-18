#!/usr/bin/env node
/**
 * اختبار المطبِّع — المرحلة ٠.
 *
 * المطبِّع يمسّ نصًا لا يُحتمل فيه الخطأ، فلا يكفي أن «يبدو» صحيحًا.
 * هذا الملف يثبت ثلاث خصائص على المصحف كاملًا لا على عيّنة:
 *
 *   ١) لا يُسقط حرفًا هجائيًا واحدًا من أي آية (٦٢٣٦ آية)
 *   ٢) يعطي النتيجة المتوقعة في حالات مرجعية مكتوبة بخط اليد
 *   ٣) مستقر: تطبيع المطبَّع لا يغيّره (idempotent)
 *
 * الخاصية الأولى هي الحارس الحقيقي: أي توسيع مستقبلي لقواعد التطبيع
 * يبتلع حرفًا أصليًا سيسقط هنا قبل أن يصل إلى طالب يُحاسَب على تلاوته.
 *
 * الاستخدام:
 *   node scripts/quran/test-normalize.mjs
 */

import { normalizeForComparison } from "../../src/features/quran/engine/normalize.mjs";

const SOURCE =
  "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true";

/**
 * الحروف الهجائية الحقيقية فقط.
 * التطويل (U+0640) مستثنى عمدًا: زخرفة خطية تُستعمل حاملًا للهمزة
 * في مثل «يَٰٓـَٔادَمُ»، وإزالته ليست فقدان حرف.
 */
function isLetter(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x0640) return false;
  return (c >= 0x0621 && c <= 0x064a) || (c >= 0x0671 && c <= 0x06d3);
}
const letters = (s) => [...s].filter(isLetter).length;

/** حالات مرجعية: يمين السهم هو ما يجب أن يخرج، مكتوبًا بخط اليد لا مولَّدًا. */
const CASES = [
  ["بِسْمِ", "بسم"],
  ["ٱللَّهِ", "الله"],
  ["ٱلرَّحْمَٰنِ", "الرحمن"],
  ["إِلَٰهَ", "اله"],
  ["ٱلْحَىُّ", "الحي"],
  ["شَآءَ", "شاء"],
  ["يَٰٓـَٔادَمُ", "يادم"],
  ["ٱعْبُدُوا۟", "اعبدوا"],
  ["رَحْمَةً", "رحمه"],
  ["بِشَىْءٍ", "بشيء"],
];

let failures = 0;
const fail = (m) => {
  console.error(`  ❌ ${m}`);
  failures++;
};

console.log("\n  ═══ اختبار المطبِّع ═══\n");

// ── ١) حالات مرجعية ───────────────────────────────────────────
let passed = 0;
for (const [input, expected] of CASES) {
  const got = normalizeForComparison(input);
  if (got === expected) passed++;
  else fail(`${input} → ${got}  (المتوقع ${expected})`);
}
console.log(`  ${passed === CASES.length ? "✅" : "⚠️"} الحالات المرجعية  ${passed}/${CASES.length}`);

// ── ٢) و ٣) على المصحف كاملًا ─────────────────────────────────
const raw = await (await fetch(SOURCE, { redirect: "follow" })).text();
const ayahs = [];
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const a = t.indexOf("|");
  const b = t.indexOf("|", a + 1);
  if (a === -1 || b === -1) continue;
  ayahs.push({ key: `${t.slice(0, a)}:${t.slice(a + 1, b)}`, text: t.slice(b + 1) });
}
if (ayahs.length !== 6236) fail(`عدد الآيات ${ayahs.length} بدل 6236`);

let lost = 0;
let unstable = 0;
let firstLost = null;
for (const { key, text } of ayahs) {
  const n = normalizeForComparison(text);
  if (letters(text) !== letters(n)) {
    lost++;
    firstLost ??= key;
  }
  if (normalizeForComparison(n) !== n) unstable++;
}

if (lost) fail(`${lost} آية فقدت حرفًا — أولها ${firstLost}`);
else console.log(`  ✅ لا حرف مفقود      ${ayahs.length}/${ayahs.length} آية`);

if (unstable) fail(`${unstable} آية غير مستقرة تحت التطبيع المتكرر`);
else console.log(`  ✅ التطبيع مستقر     ${ayahs.length}/${ayahs.length} آية`);

if (failures) {
  console.error(`\n  ⛔️ سقط ${failures} فحص — لا يُعتمد المطبِّع.\n`);
  process.exit(1);
}
console.log("\n  ✅ المطبِّع سليم.\n");
