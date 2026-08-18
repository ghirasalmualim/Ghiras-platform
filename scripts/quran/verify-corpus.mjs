#!/usr/bin/env node
/**
 * التحقق من سلامة نص المصحف قبل استيراده — المرحلة ٠.
 *
 * لا يستورد شيئًا ولا يكتب في قاعدة البيانات. مهمته الوحيدة أن يجيب:
 * هل هذا الملف مصحف كامل سليم؟ فإن لم يكن، يتوقف بخطأ ولا يمر.
 *
 * الفحوصات:
 *   ١) عدد السور = ١١٤
 *   ٢) عدد الآيات = ٦٢٣٦
 *   ٣) عدد آيات كل سورة يطابق الجدول المرجعي المعروف
 *   ٤) لا آية مفقودة (الترقيم متصل ١..n في كل سورة)
 *   ٥) لا آية مكررة
 *   ٦) لا نص فارغ
 *   ٧) النسخة العثمانية ونسخة المقارنة متطابقتان في المفاتيح
 *   ٨) بصمة SHA-256 لكل ملف (تُسجَّل في quran_corpus_meta)
 *
 * الاستخدام:
 *   node scripts/quran/verify-corpus.mjs <uthmani.txt> <simple.txt>
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * عدد آيات كل سورة — ثابت متواتر، مرجع مستقل نقارن به ما ورد في الملف.
 * وجوده هنا يعني أن أي نقص أو زيادة في الملف يُكتشف حتى لو كان المجموع صحيحًا.
 */
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
  49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
  26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];

const TOTAL_SURAHS = 114;
const TOTAL_AYAHS = AYAH_COUNTS.reduce((a, b) => a + b, 0); // 6236

function fail(msg) {
  console.error(`\n  ⛔️ فشل التحقق: ${msg}\n`);
  process.exit(1);
}

/** يقرأ ملف تنزيل بصيغة  سورة|آية|نص  ويتجاهل كتلة الترخيص والأسطر الفارغة. */
function parse(path) {
  const raw = readFileSync(path, "utf8");
  const rows = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const first = t.indexOf("|");
    const second = t.indexOf("|", first + 1);
    if (first === -1 || second === -1) continue;
    const surah = Number(t.slice(0, first));
    const ayah = Number(t.slice(first + 1, second));
    const text = t.slice(second + 1);
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue;
    rows.push({ surah, ayah, text });
  }
  return { rows, sha256: createHash("sha256").update(raw, "utf8").digest("hex") };
}

function check(name, rows) {
  const surahs = new Set(rows.map((r) => r.surah));
  if (surahs.size !== TOTAL_SURAHS)
    fail(`${name}: عدد السور ${surahs.size} بدل ${TOTAL_SURAHS}`);
  if (rows.length !== TOTAL_AYAHS)
    fail(`${name}: عدد الآيات ${rows.length} بدل ${TOTAL_AYAHS}`);

  const seen = new Set();
  const perSurah = new Map();
  for (const r of rows) {
    const key = `${r.surah}:${r.ayah}`;
    if (seen.has(key)) fail(`${name}: آية مكررة ${key}`);
    seen.add(key);
    if (!r.text || !r.text.trim()) fail(`${name}: نص فارغ عند ${key}`);
    perSurah.set(r.surah, (perSurah.get(r.surah) ?? 0) + 1);
  }

  for (let s = 1; s <= TOTAL_SURAHS; s++) {
    const expected = AYAH_COUNTS[s - 1];
    const got = perSurah.get(s) ?? 0;
    if (got !== expected)
      fail(`${name}: السورة ${s} فيها ${got} آية والمتواتر ${expected}`);
    for (let a = 1; a <= expected; a++)
      if (!seen.has(`${s}:${a}`)) fail(`${name}: آية مفقودة ${s}:${a}`);
  }
  return { surahs: surahs.size, ayahs: rows.length };
}

const [uthmaniPath, simplePath] = process.argv.slice(2);
if (!uthmaniPath || !simplePath) {
  console.error("الاستخدام: node verify-corpus.mjs <uthmani.txt> <simple.txt>");
  process.exit(2);
}

console.log("\n  ═══ التحقق من سلامة المصحف ═══\n");

const u = parse(uthmaniPath);
const s = parse(simplePath);

const ur = check("العثماني", u.rows);
console.log(`  ✅ العثماني   ${ur.surahs} سورة · ${ur.ayahs} آية`);

const sr = check("المقارنة", s.rows);
console.log(`  ✅ المقارنة   ${sr.surahs} سورة · ${sr.ayahs} آية`);

// تطابق المفاتيح بين النسختين — كل آية عثمانية لها مقابل في نسخة المقارنة
for (let i = 0; i < u.rows.length; i++) {
  if (u.rows[i].surah !== s.rows[i].surah || u.rows[i].ayah !== s.rows[i].ayah)
    fail(`اختلاف مفاتيح عند السطر ${i + 1}`);
}
console.log(`  ✅ المفاتيح   متطابقة في النسختين`);

console.log(`\n  البصمات (تُسجَّل في quran_corpus_meta):`);
console.log(`    العثماني  sha256 = ${u.sha256}`);
console.log(`    المقارنة  sha256 = ${s.sha256}`);
console.log(`\n  ✅ المصحف سليم — يجوز الاستيراد.\n`);
