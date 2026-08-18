#!/usr/bin/env node
/**
 * استيراد المصحف إلى قاعدة البيانات — المرحلة ٠.
 *
 * الترتيب مقصود: ينزّل، ثم يتحقق، ثم يستورد. أي فشل في التحقق يوقف
 * العملية قبل أن تُكتب سطرًا واحدًا في القاعدة.
 *
 * النص العثماني يُخزَّن كما ورد من المصدر حرفيًا. وعلى مستوى الآية،
 * نسخة المقارنة (بلا تشكيل) تأتي من المصدر نفسه أيضًا — لا نشتقّها
 * نحن، حتى لا يكون لنا يد في أي حرف من الاثنتين.
 *
 * أما على مستوى الكلمة فنشتقّ صورة مطبَّعة من العثماني بمطبِّع موثَّق
 * القواعد، لأن الطبعتين لا تتقاسمان نفس التقطيع (انظر التعليق أدناه).
 * هذه الصورة للمقارنة فقط ولا تُعرض ولا تُعتمد نصًا.
 *
 * البيئة المطلوبة:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY      (يتجاوز RLS — لا يُستخدم إلا هنا)
 *
 * الاستخدام:
 *   node scripts/quran/import-corpus.mjs            # ينزّل ثم يستورد
 *   node scripts/quran/import-corpus.mjs --dry-run  # يتحقق بلا كتابة
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
// نفس المطبِّع الذي يستخدمه التطبيق — نسخة واحدة لا نسختان.
import {
  normalizeForComparison,
  splitWords,
} from "../../src/features/quran/engine/normalize.mjs";

const TANZIL = "https://tanzil.net/pub/download/index.php";
const SOURCES = {
  uthmani: `${TANZIL}?quranType=uthmani&outType=txt-2&agree=true`,
  simple: `${TANZIL}?quranType=simple-clean&outType=txt-2&agree=true`,
  metadata: "https://tanzil.net/res/text/metadata/quran-data.xml",
};

const CORPUS = {
  source_name: "Tanzil Project",
  source_url: "https://tanzil.net",
  edition: "Tanzil Quran Text (Uthmani, Version 1.1)",
  riwayah: "hafs",
  licence: "Creative Commons Attribution 3.0",
};

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
const TOTAL_AYAHS = AYAH_COUNTS.reduce((a, b) => a + b, 0);

const dryRun = process.argv.includes("--dry-run");
const log = (m) => console.log(`  ${m}`);
function fail(m) {
  console.error(`\n  ⛔️ ${m}\n`);
  process.exit(1);
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`تعذّر التنزيل (${res.status}): ${url}`);
  return await res.text();
}

/** يقرأ صيغة  سورة|آية|نص  ويتجاهل كتلة الترخيص. */
function parseVerses(raw) {
  const rows = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const a = t.indexOf("|");
    const b = t.indexOf("|", a + 1);
    if (a === -1 || b === -1) continue;
    const surah = Number(t.slice(0, a));
    const ayah = Number(t.slice(a + 1, b));
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue;
    rows.push({ surah, ayah, text: t.slice(b + 1) });
  }
  return rows;
}

function parseSurahs(xml) {
  const out = [];
  const re =
    /<sura\s+index="(\d+)"\s+ayas="(\d+)"[^>]*?name="([^"]+)"\s+tname="([^"]+)"\s+ename="([^"]+)"\s+type="([^"]+)"\s+order="(\d+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({
      number: Number(m[1]),
      ayah_count: Number(m[2]),
      name_ar: m[3],
      name_translit: m[4],
      name_en: m[5],
      revelation_place: m[6].toLowerCase(),
      revelation_order: Number(m[7]),
    });
  }
  return out;
}

function verify(label, rows) {
  if (rows.length !== TOTAL_AYAHS)
    fail(`${label}: ${rows.length} آية بدل ${TOTAL_AYAHS}`);
  const seen = new Set();
  const per = new Map();
  for (const r of rows) {
    const k = `${r.surah}:${r.ayah}`;
    if (seen.has(k)) fail(`${label}: آية مكررة ${k}`);
    seen.add(k);
    if (!r.text.trim()) fail(`${label}: نص فارغ عند ${k}`);
    per.set(r.surah, (per.get(r.surah) ?? 0) + 1);
  }
  if (per.size !== TOTAL_SURAHS)
    fail(`${label}: ${per.size} سورة بدل ${TOTAL_SURAHS}`);
  for (let s = 1; s <= TOTAL_SURAHS; s++) {
    if ((per.get(s) ?? 0) !== AYAH_COUNTS[s - 1])
      fail(`${label}: السورة ${s} فيها ${per.get(s)} والمتواتر ${AYAH_COUNTS[s - 1]}`);
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++)
      if (!seen.has(`${s}:${a}`)) fail(`${label}: آية مفقودة ${s}:${a}`);
  }
}

async function main() {
  console.log("\n  ═══ استيراد المصحف — المرحلة ٠ ═══\n");
  log(`المصدر : ${CORPUS.edition}`);
  log(`الرواية: حفص عن عاصم`);
  log(`الترخيص: ${CORPUS.licence}\n`);

  log("تنزيل الملفات…");
  const [uRaw, sRaw, xml] = await Promise.all([
    fetchText(SOURCES.uthmani),
    fetchText(SOURCES.simple),
    fetchText(SOURCES.metadata),
  ]);

  const uthmaniSha = createHash("sha256").update(uRaw, "utf8").digest("hex");
  const simpleSha = createHash("sha256").update(sRaw, "utf8").digest("hex");

  const uRows = parseVerses(uRaw);
  const sRows = parseVerses(sRaw);
  const surahs = parseSurahs(xml);

  log("التحقق قبل أي كتابة…");
  verify("العثماني", uRows);
  verify("المقارنة", sRows);
  if (surahs.length !== TOTAL_SURAHS)
    fail(`بيانات السور: ${surahs.length} بدل ${TOTAL_SURAHS}`);
  for (const s of surahs)
    if (s.ayah_count !== AYAH_COUNTS[s.number - 1])
      fail(`بيانات السورة ${s.number}: ${s.ayah_count} بدل ${AYAH_COUNTS[s.number - 1]}`);
  for (let i = 0; i < uRows.length; i++)
    if (uRows[i].surah !== sRows[i].surah || uRows[i].ayah !== sRows[i].ayah)
      fail(`اختلاف مفاتيح عند الموضع ${i + 1}`);

  const ayahs = uRows.map((u, i) => ({
    surah: u.surah,
    ayah: u.ayah,
    text_uthmani: u.text,
    text_simple: sRows[i].text,
  }));

  // تقطيع الكلمات من العثماني وحده — الترتيب محفوظ بالموضع ولا يُغيَّر أبدًا.
  //
  // لا نحاذي كلمات الطبعتين: الرسم العثماني يصل ما يفصله الرسم الإملائي،
  // ففي ٣٦٣ آية من ٦٢٣٦ يختلف عدد الكلمات (2:21 «يَٰٓأَيُّهَا» كلمة واحدة
  // مقابل «يا أيها» كلمتين). محاذاتهما واحدة بواحدة اختلاق لتقابل لا وجود له.
  //
  // النسخة المطبَّعة مشتقّة عندنا من العثماني للمقارنة فقط، ولا تُعرض
  // للمستخدم ولا تُكتب فوق الأصل.
  const words = [];
  for (const a of ayahs) {
    splitWords(a.text_uthmani).forEach((w, i) =>
      words.push({
        surah: a.surah,
        ayah: a.ayah,
        position: i + 1,
        text_uthmani: w,
        text_normalized: normalizeForComparison(w),
      })
    );
  }
  const emptyNorm = words.filter((w) => !w.text_normalized);
  if (emptyNorm.length)
    fail(`التطبيع أنتج نصًا فارغًا في ${emptyNorm.length} كلمة — أولها ${emptyNorm[0].surah}:${emptyNorm[0].ayah}`);

  log(`✅ ${TOTAL_SURAHS} سورة · ${TOTAL_AYAHS} آية · ${words.length} كلمة`);
  log(`   عثماني sha256 = ${uthmaniSha}`);
  log(`   مقارنة sha256 = ${simpleSha}`);

  if (dryRun) {
    console.log("\n  (تجربة جافّة — لم يُكتب شيء في القاعدة)\n");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان");
  const db = createClient(url, key, { auth: { persistSession: false } });

  log("\nكتابة السور…");
  let r = await db.from("quran_surah").upsert(surahs, { onConflict: "number" });
  if (r.error) fail(`السور: ${r.error.message}`);

  log("كتابة الآيات…");
  for (let i = 0; i < ayahs.length; i += 500) {
    r = await db.from("quran_ayah").upsert(ayahs.slice(i, i + 500), {
      onConflict: "surah,ayah",
    });
    if (r.error) fail(`الآيات عند ${i}: ${r.error.message}`);
  }

  log("كتابة الكلمات…");
  for (let i = 0; i < words.length; i += 2000) {
    r = await db.from("quran_word").upsert(words.slice(i, i + 2000), {
      onConflict: "surah,ayah,position",
    });
    if (r.error) fail(`الكلمات عند ${i}: ${r.error.message}`);
  }

  log("تسجيل بصمة النزاهة…");
  await db.from("quran_corpus_meta").update({ is_current: false }).eq("is_current", true);
  r = await db.from("quran_corpus_meta").insert({
    ...CORPUS,
    uthmani_sha256: uthmaniSha,
    simple_sha256: simpleSha,
    surah_count: TOTAL_SURAHS,
    ayah_count: TOTAL_AYAHS,
    word_count: words.length,
    is_current: true,
  });
  if (r.error) fail(`السجل: ${r.error.message}`);

  console.log("\n  ✅ اكتمل الاستيراد.\n");
}

main().catch((e) => fail(String(e)));
