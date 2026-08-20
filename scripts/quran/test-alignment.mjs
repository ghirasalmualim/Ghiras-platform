#!/usr/bin/env node
/**
 * اختبارات محرّك المحاذاة القرآنية.
 *
 * ── لماذا بلا مزوّد ──
 * المحرّك يحكم على حفظ طفل، فيجب أن يكون قابلًا للاختبار وحده — بلا
 * مفتاح ولا إنترنت ولا فاتورة. نكتب هنا ما «سمعه» المزوّد نصًّا،
 * فنفحص المنطق كله في أجزاء من الثانية، ونعيد الفحص كلما غيّرنا عتبة.
 *
 * ⚠️ وكل نصّ قرآني هنا يُقرأ من `quran-uthmani.txt`، ولا تُكتب آية
 * واحدة من الذاكرة. والأخطاء تُصنع بتعديل ما قرأناه من الملف، فيبقى
 * المرجع مرجعًا حتى في الاختبار.
 */

import { readFileSync } from "node:fs";
import {
  buildExpected,
  tokensFromText,
  tokensFromProvider,
  alignRecitation,
  wordSimilarity,
  RITUAL_OPENING_PATTERNS,
} from "../../.quran-test/engine/alignment.js";
import { normalizeForComparison } from "../../.quran-test/engine/normalize.mjs";

let passed = 0;
let failed = 0;
const ok = (cond, label, extra = "") => {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ""}`);
  }
};

console.log("\n  ═══ محرّك المحاذاة القرآنية ═══\n");

// ── المصحف المرجعي ───────────────────────────────────────────
const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
const CORPUS = new Map();
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const a = t.indexOf("|");
  const b = t.indexOf("|", a + 1);
  if (a === -1 || b === -1) continue;
  CORPUS.set(`${t.slice(0, a)}:${t.slice(a + 1, b)}`, t.slice(b + 1));
}

/** آيات مقطع، من الملف مباشرة. */
function ayahs(surah, from, to) {
  const out = [];
  for (let n = from; n <= to; n++) {
    const text = CORPUS.get(`${surah}:${n}`);
    if (!text) throw new Error(`لا توجد الآية ${surah}:${n}`);
    out.push({ surah, ayah: n, text_uthmani: text });
  }
  return out;
}

/** ما «سمعه» المزوّد لو قرأت الطالبة المقطع كاملًا صحيحًا. */
function perfect(expected) {
  return expected.map((w) => w.uthmani);
}

/** بناء النتيجة من قائمة كلمات. */
function run(expected, words, opts = {}) {
  if (opts.confidence !== undefined || opts.times) {
    const toks = words.map((w, i) => {
      const t = { text: w };
      if (opts.confidence !== undefined) t.confidence = opts.confidence;
      if (opts.times) {
        t.startSec = opts.times[i]?.[0];
        t.endSec = opts.times[i]?.[1];
      }
      return t;
    });
    return alignRecitation(expected, tokensFromProvider(toks));
  }
  return alignRecitation(expected, tokensFromText(words.join(" ")));
}

const kinds = (r) => r.entries.map((e) => e.kind);
const countOf = (r, k) => r.entries.filter((e) => e.kind === k).length;
const reasons = (r) => r.entries.filter((e) => e.reason).map((e) => e.reason);

// ══════════════ ٠) سلامة المُدخل نفسه ══════════════
console.log("  ── سلامة المرجع ──");
{
  const fatiha = buildExpected(ayahs(1, 1, 7));
  // البسملة في الفاتحة آية معدودة فتبقى: أربع كلمات + بقية الآيات
  ok(fatiha.length === 29, `الفاتحة ٢٩ كلمة متوقَّعة (وُجد ${fatiha.length})`);
  ok(
    fatiha[0].ayah === 1 && fatiha[0].uthmani.indexOf("بِ") === 0,
    "بسملة الفاتحة محسوبة آيةً أولى — لا تُرفع"
  );

  const ikhlas = buildExpected(ayahs(112, 1, 4));
  ok(
    ikhlas[0].ayah === 1 && normalizeForComparison(ikhlas[0].uthmani) === "قل",
    `بسملة الإخلاص مرفوعة — أول كلمة «${ikhlas[0].uthmani}»`
  );

  // النص المرجعي لم يُمسّ: كل كلمة موجودة حرفيًا في ملف المصحف
  const line = CORPUS.get("112:1");
  let verbatim = true;
  for (const w of ikhlas.filter((x) => x.ayah === 1)) {
    if (line.indexOf(w.uthmani) === -1) verbatim = false;
  }
  ok(verbatim, "كل كلمة متوقَّعة موجودة حرفيًا في ملف المصحف — لا تعديل");

  // نمط البسملة المكتوب في المحرّك = الآية الأولى من الفاتحة فعلًا
  ok(
    RITUAL_OPENING_PATTERNS.indexOf(normalizeForComparison(CORPUS.get("1:1"))) !== -1,
    "نمط البسملة في المحرّك يطابق الفاتحة ١ حرفًا بحرف",
    `الأنماط: ${JSON.stringify(RITUAL_OPENING_PATTERNS)}`
  );
}

// ══════════════ ١) قراءة صحيحة ١٠٠٪ ══════════════
console.log("\n  ── ١) قراءة صحيحة ──");
{
  for (const [s, f, t, name] of [
    [112, 1, 4, "الإخلاص"],
    [1, 1, 7, "الفاتحة"],
    [67, 1, 5, "الملك ١–٥"],
  ]) {
    const exp = buildExpected(ayahs(s, f, t));
    const r = run(exp, perfect(exp));
    ok(
      r.summary.confirmedErrors === 0 &&
        r.summary.uncertain === 0 &&
        r.summary.coverage === 1 &&
        r.usable,
      `${name}: صفر أخطاء، تغطية ١٠٠٪`,
      `أخطاء ${r.summary.confirmedErrors} · غير مؤكد ${r.summary.uncertain} · تغطية ${r.summary.coverage.toFixed(2)}`
    );
  }
}

// ══════════════ ٢) حذف كلمة واحدة ══════════════
console.log("\n  ── ٢) حذف كلمة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const dropAt = 12; // كلمة داخل المقطع، بعيدة عن الطرفين
  const dropped = exp[dropAt].uthmani;
  const heard = words.slice(0, dropAt).concat(words.slice(dropAt + 1));
  const r = run(exp, heard);

  const om = r.entries.filter((e) => e.kind === "OMISSION");
  ok(
    om.length === 1 && om[0].expected.length === 1 && om[0].expected[0].position === dropAt,
    `كلمة واحدة محذوفة تُكتشف في موضعها بالضبط (${dropped})`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(r.summary.confirmedErrors === 1, `خطأ واحد لا أكثر (وُجد ${r.summary.confirmedErrors})`);
}

// ══════════════ ٣) حذف عدة كلمات ══════════════
console.log("\n  ── ٣) حذف عدة كلمات ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const heard = words.slice(0, 10).concat(words.slice(13)); // ثلاث كلمات متتالية
  const r = run(exp, heard);
  const om = r.entries.filter((e) => e.kind === "OMISSION");
  ok(
    om.length === 1 && om[0].expected.length === 3,
    "ثلاث كلمات متتالية = حذفٌ واحد لا ثلاثة",
    `وُجد ${om.length} موضعًا، أطولها ${om[0]?.expected.length ?? 0}`
  );
}

// ══════════════ ٤) إضافة كلمة ══════════════
console.log("\n  ── ٤) إضافة كلمة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  // كلمة من سورة أخرى تمامًا — إضافة حقيقية لا تشبه جوارها
  const alien = CORPUS.get("36:1").split(/\s+/)[0];
  const heard = words.slice(0, 8).concat([alien], words.slice(8));
  const r = run(exp, heard);
  ok(
    countOf(r, "INSERTION") === 1,
    `كلمة زائدة تُكتشف إضافةً (${alien})`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
}

// ══════════════ ٥) استبدال كلمة ══════════════
console.log("\n  ── ٥) استبدال كلمة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const alien = CORPUS.get("36:1").split(/\s+/)[0];
  const at = 11;
  const heard = words.slice();
  heard[at] = alien;
  const r = run(exp, heard);
  const sub = r.entries.filter((e) => e.kind === "SUBSTITUTION");
  ok(
    sub.length === 1 && sub[0].expected[0].position === at,
    "استبدال بكلمة بعيدة يُكتشف استبدالًا في موضعه",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
}

// ══════════════ ٦) تكرار كلمة ══════════════
console.log("\n  ── ٦) تكرار كلمة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const at = 9;
  const heard = words.slice(0, at + 1).concat([words[at]], words.slice(at + 1));
  const r = run(exp, heard);
  ok(
    countOf(r, "REPETITION") === 1 && countOf(r, "INSERTION") === 0,
    `إعادة الكلمة تُسمّى تكرارًا لا زيادة على القرآن (${words[at]})`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
}

// ══════════════ ٧) تكرار مقطع ══════════════
console.log("\n  ── ٧) تكرار مقطع ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const from = 6;
  const len = 3;
  const heard = words
    .slice(0, from + len)
    .concat(words.slice(from, from + len), words.slice(from + len));
  const r = run(exp, heard);
  const rep = r.entries.filter((e) => e.kind === "REPETITION");
  ok(
    rep.length === 1 && rep[0].heard.length === len,
    `إعادة ${len} كلمات = تكرار واحد`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
}

// ══════════════ ٨) تخطّي آية كاملة ══════════════
console.log("\n  ── ٨) تخطّي آية ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const heard = perfect(exp.filter((w) => w.ayah !== 3));
  const r = run(exp, heard);
  const skip = r.entries.filter((e) => e.kind === "SKIP");
  ok(
    skip.length === 1 && skip[0].expected.every((w) => w.ayah === 3),
    "الآية ٣ المتخطّاة = SKIP واحد يغطّيها كلها",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(
    r.weakSpots.some((s) => s.ayah === 3 && s.atTransition),
    "الآية المتخطّاة تُسجَّل موضعًا يحتاج تثبيتًا، ومعها أنه انتقال"
  );
  ok(r.summary.confirmedErrors === 1, "تخطّي آية خطأ واحد لا عشرة");
}

// ══════════════ ٩) خطأ في أول المقطع ══════════════
console.log("\n  ── ٩) خطأ في الأول ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const alien = CORPUS.get("36:1").split(/\s+/)[0];

  // استبدال أول كلمة — خطأ حقيقي لا قطع
  const subFirst = words.slice();
  subFirst[0] = alien;
  const r1 = run(exp, subFirst);
  ok(countOf(r1, "SUBSTITUTION") === 1, "استبدال أول كلمة يُكتشف");

  // حذف أول كلمتين — الأرجح تسجيل بدأ متأخرًا، لا نسيان
  const r2 = run(exp, words.slice(2));
  const first = r2.entries[0];
  ok(
    first.kind === "UNCERTAIN" && first.reason === "TRUNCATED_START",
    "حذف بداية المقطع = «لم أتأكد» لا اتهام — التسجيل بدأ متأخرًا",
    `وُجد ${first.kind} / ${first.reason}`
  );
}

// ══════════════ ١٠) خطأ في آخر المقطع ══════════════
console.log("\n  ── ١٠) خطأ في الآخر ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const r = run(exp, words.slice(0, words.length - 2));
  const last = r.entries[r.entries.length - 1];
  ok(
    last.kind === "UNCERTAIN" && last.reason === "TRUNCATED_END",
    "انقطاع آخر التسجيل = «لم أتأكد» لا اتهام",
    `وُجد ${last.kind} / ${last.reason}`
  );
  ok(r.summary.confirmedErrors === 0, "ولا خطأ مؤكَّد واحد في هذه الحالة");
}

// ══════════════ ١١) كلمات متكررة داخل المقطع ══════════════
console.log("\n  ── ١١) كلمات متكررة ──");
{
  // الفاتحة: «الرحمن الرحيم» في الآية ١ وفي الآية ٣ — نفس الكلمتين،
  // لكن سياقهما مختلف. المحرّك يجب أن يفرّق فلا يشلّ نفسه بلا سبب.
  const exp = buildExpected(ayahs(1, 1, 7));
  const words = perfect(exp);
  const norms = exp.map((w) => w.norm);
  const rahman = norms.filter((n) => n === normalizeForComparison("ٱلرَّحْمَٰنِ")).length;
  ok(rahman >= 2, `«الرحمن» تتكرر ${rahman} مرات في الفاتحة — الحالة قائمة فعلًا`);

  const r = run(exp, words);
  ok(
    r.summary.confirmedErrors === 0 && r.summary.uncertain === 0,
    "قراءة صحيحة لمقطع فيه كلمات مكررة تبقى نظيفة"
  );

  // حذف «الرحمن» الثانية: سياقها مختلف، فالموضع غير ملتبس ⇒ يُكتشف
  const idx = norms.lastIndexOf(normalizeForComparison("ٱلرَّحْمَٰنِ"));
  const heard = words.slice(0, idx).concat(words.slice(idx + 1));
  const r2 = run(exp, heard);
  ok(
    r2.summary.confirmedErrors === 1,
    "الكلمة المكررة بسياق مختلف تبقى قابلة للحكم — لا نشلّ المحرّك بلا داعٍ",
    `أخطاء ${r2.summary.confirmedErrors} · غير مؤكد ${r2.summary.uncertain}`
  );
}

// ══════════════ ١٢) الآيات المتشابهة — أخطر حالة ══════════════
console.log("\n  ── ١٢) الآيات المتشابهة ──");
{
  // الرحمن ٤٦–٥٣: «فبأي آلاء ربكما تكذبان» تتكرر بنصّها وسياقها
  const exp = buildExpected(ayahs(55, 46, 53));
  const words = perfect(exp);

  const refrain = normalizeForComparison(CORPUS.get("55:47"));
  const same = [47, 49, 51, 53].filter(
    (n) => normalizeForComparison(CORPUS.get(`55:${n}`)) === refrain
  );
  ok(same.length >= 3, `اللازمة تتكرر بنصّها في ${same.length} آيات — الحالة قائمة`);

  const r0 = run(exp, words);
  ok(
    r0.summary.confirmedErrors === 0,
    "قراءة المتشابهات صحيحةً لا تُنتج خطأً واحدًا",
    `أخطاء ${r0.summary.confirmedErrors}`
  );

  // حذف إحدى اللازمات: لا يمكن الجزم أيّها حُذفت ⇒ لا نتّهم
  const heard = perfect(exp.filter((w) => w.ayah !== 49));
  const r = run(exp, heard);
  ok(
    r.summary.confirmedErrors === 0 && r.summary.uncertain >= 1,
    "حذف لازمة متكررة ⇒ «لم أستطع التأكد» لا اتهام بموضع بعينه",
    `أخطاء ${r.summary.confirmedErrors} · غير مؤكد ${r.summary.uncertain} · الأسباب ${JSON.stringify(reasons(r))}`
  );
  ok(
    reasons(r).indexOf("AMBIGUOUS_CONTEXT") !== -1,
    "والسبب المسجَّل هو التباس السياق لا شيء آخر"
  );
  ok(r.weakSpots.length === 0, "ولا يُرسَل موضع ملتبس إلى المراجعة الذكية");
}

// ══════════════ ١٣) انتقال خاطئ بين آيتين ══════════════
console.log("\n  ── ١٣) انتقال خاطئ ──");
{
  // تُقرأ الفاتحة ١–٣ ثم يُقفَز إلى ٦ — انتقال إلى آية غير التالية
  const exp = buildExpected(ayahs(1, 1, 7));
  const heard = perfect(exp.filter((w) => w.ayah <= 3 || w.ayah >= 6));
  const r = run(exp, heard);
  const skip = r.entries.filter((e) => e.kind === "SKIP");
  ok(
    skip.length === 1 && skip[0].expected.some((w) => w.ayah === 4),
    "القفز من الآية ٣ إلى ٦ يُكتشف تخطّيًا لما بينهما",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  const spots = r.weakSpots.map((s) => s.ayah);
  ok(
    spots.indexOf(4) !== -1 && spots.indexOf(5) !== -1,
    `الآيتان المتخطَّاتان تُرسَلان للمراجعة (وُجد ${JSON.stringify(spots)})`
  );
}

// ══════════════ ١٤) ثقة منخفضة ══════════════
console.log("\n  ── ١٤) ثقة منخفضة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const alien = CORPUS.get("36:1").split(/\s+/)[0];
  const heard = words.slice();
  heard[11] = alien;

  const high = run(exp, heard, { confidence: 0.95 });
  ok(high.summary.confirmedErrors === 1, "بثقة عالية: الاستبدال خطأ مؤكَّد");

  const low = run(exp, heard, { confidence: 0.3 });
  ok(
    low.summary.confirmedErrors === 0 && low.summary.uncertain >= 1,
    "بثقة منخفضة: نفس المُدخل لا يُنتج اتهامًا",
    `أخطاء ${low.summary.confirmedErrors} · غير مؤكد ${low.summary.uncertain}`
  );
  ok(
    reasons(low).indexOf("LOW_CONFIDENCE") !== -1,
    "والسبب المسجَّل هو ضعف الثقة"
  );
  ok(low.weakSpots.length === 0, "ولا يُخصم من الإتقان ولا تُرسَل للمراجعة");
}

// ══════════════ ١٥) تفريغ ناقص ══════════════
console.log("\n  ── ١٥) تفريغ ناقص ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const r = run(exp, words.slice(0, Math.floor(words.length * 0.35)));
  ok(!r.usable, "سُمع ثلث المقطع ⇒ النتيجة غير صالحة للحكم");
  ok(r.unusableReason === "TRANSCRIPT_TOO_SHORT", "والسبب: التسجيل ناقص");
  ok(r.summary.confirmedErrors === 0, "ولا خطأ واحد يُسجَّل على الطالبة");
  ok(r.weakSpots.length === 0, "ولا موضع يُرسَل للمراجعة");
}

// ══════════════ ١٦) تفريغ فارغ ══════════════
console.log("\n  ── ١٦) تفريغ فارغ ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const r = alignRecitation(exp, []);
  ok(!r.usable && r.unusableReason === "EMPTY_TRANSCRIPT", "تفريغ فارغ ⇒ غير صالح");
  ok(r.entries.length === 0 && r.weakSpots.length === 0, "ولا يُنتج مواضع ولا أخطاء");

  const r2 = alignRecitation([], tokensFromText("قل هو الله أحد"));
  ok(!r2.usable, "بلا نصّ متوقَّع ⇒ غير صالح، ولا ينهار");
}

// ══════════════ ١٧) أكثر من خطأ في قراءة واحدة ══════════════
console.log("\n  ── ١٧) أخطاء متعددة ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const alien = CORPUS.get("36:1").split(/\s+/)[0];

  let heard = words.slice();
  heard[8] = alien; // استبدال
  heard = heard.slice(0, 14).concat(heard.slice(15)); // حذف
  heard = heard.slice(0, 20).concat([heard[19]], heard.slice(20)); // تكرار

  const r = run(exp, heard);
  const set = {};
  for (const k of kinds(r)) set[k] = (set[k] ?? 0) + 1;
  ok(
    (set.SUBSTITUTION ?? 0) >= 1 && (set.OMISSION ?? 0) >= 1 && (set.REPETITION ?? 0) >= 1,
    "ثلاثة أخطاء مختلفة في قراءة واحدة تُكتشف كلها",
    `التصنيفات: ${JSON.stringify(set)}`
  );
}

// ══════════════ ١٨) الوقفة الطويلة ══════════════
console.log("\n  ── ١٨) الوقفة الطويلة ──");
{
  const exp = buildExpected(ayahs(112, 1, 4));
  const words = perfect(exp);

  // توقيت متّصل ثم صمت خمس ثوانٍ قبل الكلمة الخامسة
  const times = words.map((_, i) => [i * 0.6, i * 0.6 + 0.5]);
  for (let i = 4; i < times.length; i++) {
    times[i] = [times[i][0] + 5, times[i][1] + 5];
  }
  const withTime = run(exp, words, { times });
  ok(countOf(withTime, "LONG_PAUSE") === 1, "صمت خمس ثوانٍ يُسجَّل وقفة طويلة");
  ok(
    withTime.summary.confirmedErrors === 0,
    "والوقفة ليست خطأً — لا تُحسب في الأخطاء المؤكَّدة"
  );

  const noTime = run(exp, words);
  ok(
    countOf(noTime, "LONG_PAUSE") === 0,
    "⚠️ بلا توقيت من المزوّد: لا وقفات إطلاقًا — لا نخترع ما لم نقسه"
  );
}

// ══════════════ ١٩) الاستعاذة والبسملة ══════════════
console.log("\n  ── ١٩) أدب التلاوة ──");
{
  const exp = buildExpected(ayahs(112, 1, 4));
  const words = perfect(exp);
  const isti = "أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَٰنِ ٱلرَّجِيمِ".split(/\s+/);
  const basmala = CORPUS.get("1:1").split(/\s+/);

  const r = run(exp, isti.concat(basmala, words));
  ok(
    r.summary.confirmedErrors === 0 && r.summary.uncertain === 0,
    "من استعاذ وبسمل لا يُتَّهم بزيادة على القرآن",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );

  // ومن لم يبسمل لا يُتَّهم بحذف
  const r2 = run(exp, words);
  ok(r2.summary.confirmedErrors === 0, "ومن لم يبسمل لا يُتَّهم بحذف أربع كلمات");

  // وفي الفاتحة البسملة آية، فحذفها خطأ حقيقي لا أدب متروك
  const fat = buildExpected(ayahs(1, 1, 7));
  const fatWords = perfect(fat);
  const withoutBasmala = fatWords.slice(4);
  const r3 = run(fat, withoutBasmala);
  ok(
    r3.entries[0].kind !== "MATCH",
    "وفي الفاتحة: البسملة آية معدودة، فغيابها لا يمرّ صامتًا",
    `أول تصنيف: ${r3.entries[0].kind} / ${r3.entries[0].reason ?? "—"}`
  );
}

// ══════════════ ١٩ب) صدى المزوّد — من قياس حقيقي ══════════════
//
// ⚠️ هذا الفحص مكتوب من تسجيلين حقيقيين لا من حدس. في كليهما تخطّت
// القارئة آية، فأضاف المزوّد كلمةً لم تُقَل — «قل» مرة و«هو» مرة —
// وكلتاهما موجودة في النص المتوقَّع الذي زوّدناه به. وفي تسجيلين
// صحيحين لم يُضِف شيئًا. فالتعثّر وحده هو ما يستدعي الصدى.
console.log("\n  ── ١٩ب) صدى المزوّد ──");
{
  const exp = buildExpected(ayahs(112, 1, 4));
  const words = perfect(exp);

  // الحالة كما وقعت: تُخطّى الآية ٢ ويضيف المزوّد «هو» قرب آخر المقطع
  const said = perfect(exp.filter((w) => w.ayah !== 2));
  const at = said.length - 2;
  const withEcho = said.slice(0, at).concat([words[1]], said.slice(at));

  const r = run(exp, withEcho, { confidence: 0.86 });
  ok(
    countOf(r, "SKIP") === 1,
    "التخطّي يبقى مكشوفًا — الحارس لا يُعطّل الكشف الحقيقي"
  );
  ok(
    countOf(r, "INSERTION") === 0,
    "والكلمة المخترعة لا تُعدّ إضافةً",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(
    reasons(r).indexOf("ECHO_OF_PASSAGE") !== -1,
    "بل «لم أتأكد» بسبب صدى المقطع — بثقة عالية ٠٫٨٦، فبوابة الثقة لا تلتقطها"
  );
  ok(
    r.weakSpots.length === 1 && r.weakSpots[0].ayah === 2,
    "ولا يُرسَل للمراجعة إلا التخطّي الحقيقي"
  );

  // ⚠️ والزيادة من خارج المقطع تبقى خطأً مؤكَّدًا — الحارس ليس تعطيلًا
  const alien = CORPUS.get("36:1").split(/\s+/)[0];
  const outside = words.slice(0, 6).concat([alien], words.slice(6));
  const r2 = run(exp, outside, { confidence: 0.9 });
  ok(
    countOf(r2, "INSERTION") === 1,
    `كلمة من خارج المقطع («${alien}») تبقى إضافةً مؤكَّدة — المزوّد لا يخترع ما لم نعطه`,
    `التصنيفات: ${JSON.stringify(kinds(r2).filter((k) => k !== "MATCH"))}`
  );

  // والقراءة الصحيحة تبقى نظيفة
  ok(run(exp, words).summary.confirmedErrors === 0, "والقراءة الصحيحة تبقى نظيفة");
}

// ══════════════ ١٩ج) المتشابه القصير — من بلاغ حقيقي ══════════════
//
// ⚠️ مكتوب من تسميع فعلي للنبأ في ٢٠٢٦-٠٨-٢٠: قرأت القارئة صحيحًا،
// فاتُّهمت بحذف «ثُمَّ». وهي الفرق **الوحيد** بين الآيتين ٤ و٥:
//   ٤: كَلَّا سَيَعْلَمُونَ   ·   ٥: ثُمَّ كَلَّا سَيَعْلَمُونَ
// فإسقاطها يجعل النصّين سواءً، ولا يُعلم أسقطتها هي أم دمج المزوّد
// التكرارين. وقاعدة السياق الثلاثي لا تمسكها: «ثمّ» لا تتكرّر، وإنما
// يتكرّر ما حولها.
console.log("\n  ── ١٩ج) المتشابه القصير ──");
{
  const exp = buildExpected(ayahs(78, 1, 16));
  const words = perfect(exp);

  // الحالة قائمة فعلًا في المصحف لا في خيالنا
  ok(
    normalizeForComparison(CORPUS.get("78:5")).indexOf(
      normalizeForComparison(CORPUS.get("78:4"))
    ) !== -1,
    "الآية ٥ تحوي الآية ٤ بنصّها وتزيد كلمة — الحالة قائمة"
  );

  const at = exp.findIndex((w) => w.ayah === 5);
  const dropped = exp[at].uthmani;
  const heard = words.slice(0, at).concat(words.slice(at + 1));
  const r = run(exp, heard);

  ok(
    r.summary.confirmedErrors === 0,
    `حذف «${dropped}» بين متشابهين لا يُتَّهم به أحد`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(
    reasons(r).indexOf("REPEATED_NEIGHBOURHOOD") !== -1,
    "والسبب المسجَّل: جوارٌ متكرّر"
  );
  ok(r.weakSpots.length === 0, "ولا يُرسَل للمراجعة");

  // ⚠️ ولا يُشلّ الكشف: حذفٌ في نصٍّ فريد من السورة نفسها يبقى مؤكَّدًا
  const uniqueAt = exp.findIndex((w) => w.ayah === 10);
  const heard2 = words.slice(0, uniqueAt).concat(words.slice(uniqueAt + 1));
  const r2 = run(exp, heard2);
  ok(
    r2.summary.confirmedErrors === 1,
    `وحذفٌ في نصّ فريد («${exp[uniqueAt].uthmani}») يبقى خطأً مؤكَّدًا`,
    `أخطاء ${r2.summary.confirmedErrors} · غير مؤكد ${r2.summary.uncertain}`
  );
}

// ══════════════ ١٩د) كلمة يخترعها المزوّد في المستهلّ ══════════════
//
// ⚠️ من البلاغ نفسه: اتُّهمت القارئة بحذف «عَمَّ» أول كلمة في النبأ.
// وحارس القطع كان يشترط ألا يسبق الحذفَ مسموعٌ في القائمة — فكلمة
// واحدة يخترعها المزوّد في المستهلّ تُزيح الحذف عن رأس القائمة
// فيتحوّل إلى اتهام مؤكَّد. والمناط أن يمسّ الحذفُ أول المقطع.
console.log("\n  ── ١٩د) الحذف في المستهلّ ──");
{
  const exp = buildExpected(ayahs(78, 1, 16));
  const words = perfect(exp);
  const first = exp[0].uthmani;

  // بلا صدى: يُكتشف قطعًا
  const plain = run(exp, words.slice(1));
  ok(
    plain.summary.confirmedErrors === 0 &&
      reasons(plain).indexOf("TRUNCATED_START") !== -1,
    `سقوط «${first}» وحده ⇒ قطعُ تسجيلٍ لا نسيان`
  );

  // والحالة الأرجح فيما وقع: يسمعها المزوّد كلمةً تفارقها بحرف واحد
  const misheard = words.slice();
  misheard[0] = normalizeForComparison(first).slice(0, -1) + "ن";
  const r = run(exp, misheard, { confidence: 0.88 });
  // ⚠️ يكفي ألا تُتَّهم. والسبب المسجَّل قد يكون «حرفٌ واحد» أو «صدى
  // المقطع» — فـ«عن» نفسها في «عَنِ ٱلنَّبَإِ» — وكلاهما صحيح، وأيّهما
  // سبق لا يغيّر شيئًا عند الطالبة. فنفحص الحكم لا طريق الوصول إليه.
  ok(
    r.summary.confirmedErrors === 0 && r.summary.uncertain >= 1,
    `«${first}» تُسمَع «${misheard[0]}» ⇒ حرفٌ واحد لا يُبنى عليه اتهام`,
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))} · الأسباب: ${JSON.stringify(reasons(r))}`
  );

  // ⚠️ ولا يُشلّ الكشف: كلمة بعيدة تبقى استبدالًا مؤكَّدًا
  const alien = misheard.slice();
  alien[0] = CORPUS.get("36:1").split(/\s+/)[0];
  ok(
    run(exp, alien, { confidence: 0.9 }).summary.confirmedErrors === 1,
    "وكلمة بعيدة في الموضع نفسه تبقى استبدالًا مؤكَّدًا"
  );
}

// ══════════════ ١٩هـ) الحروف المقطَّعة — من قياس على آيباد ══════════════
//
// ⚠️ «الٓمٓ» في أول البقرة رجعت من المزوّد **«اليك»** — لا أسماءَ حروف
// ولا شيئًا قريبًا. فهو لا يعرف الحروف المتتابعة: ليست في لغته، فيلفّق
// أقرب كلمة عربية مهما أحسنت القارئة. وعجزُ الآلة ليس خطأ الطالبة.
console.log("\n  ── ١٩هـ) الحروف المقطَّعة ──");
{
  const exp = buildExpected(ayahs(2, 1, 5));
  const words = perfect(exp);

  ok(
    exp[0].norm === "الم" && exp[0].ayah === 1,
    `أول البقرة «${exp[0].uthmani}» — حروف مقطَّعة`
  );

  // ما وقع فعلًا: كلمة ملفَّقة مكان الحروف
  const heard = words.slice();
  heard[0] = "اليك";
  const r = run(exp, heard, { confidence: 0.9 });
  ok(
    r.summary.confirmedErrors === 0,
    "لا تُتَّهم القارئة بما تعجز الآلةُ عن تفريغه",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(reasons(r).indexOf("MUQATTAAT") !== -1, "والسبب المسجَّل: حروف مقطَّعة");
  ok(r.weakSpots.length === 0, "ولا تُرسَل إلى المراجعة");

  // ولا يُشلّ الحكم على بقية السورة
  const alien = CORPUS.get("36:2").split(/\s+/)[0];
  const both = heard.slice();
  both[6] = alien;
  ok(
    run(exp, both, { confidence: 0.9 }).summary.confirmedErrors === 1,
    "وخطأٌ حقيقي في بقية المقطع يبقى مكشوفًا"
  );
}

// ══════════════ ١٩و) استبدالٌ بكلمة من المقطع ══════════════
//
// ⚠️ «يُنفِقُونَ» (٢:٣) رجعت «يوقنون» — وهي آخر كلمة في الآية ٤
// مباشرة. فالمزوّد خلط بين متقاربَين وسحب الثانية من النص الذي
// زوّدناه به. وهي علّة صدى الزيادة نفسها، تقع في الاستبدال.
console.log("\n  ── ١٩و) استبدالٌ بكلمة من المقطع ──");
{
  const exp = buildExpected(ayahs(2, 1, 5));
  const words = perfect(exp);

  const at = exp.findIndex((w) => w.norm === "ينفقون");
  const other = exp.find((w) => w.norm === "يوقنون");
  ok(at !== -1 && Boolean(other), "«ينفقون» و«يوقنون» كلتاهما في المقطع — الحالة قائمة");

  const heard = words.slice();
  heard[at] = other.uthmani;
  const r = run(exp, heard, { confidence: 0.89 });
  ok(
    r.summary.confirmedErrors === 0,
    "استبدالٌ بكلمةٍ من المقطع نفسه لا يُتَّهم به",
    `التصنيفات: ${JSON.stringify(kinds(r).filter((k) => k !== "MATCH"))}`
  );
  ok(reasons(r).indexOf("ECHO_OF_PASSAGE") !== -1, "والسبب: صدى المقطع");

  // ⚠️ وكلمةٌ من خارج المقطع تبقى استبدالًا مؤكَّدًا
  const outside = words.slice();
  outside[at] = CORPUS.get("36:2").split(/\s+/)[0];
  ok(
    run(exp, outside, { confidence: 0.9 }).summary.confirmedErrors === 1,
    "وكلمةٌ من خارج المقطع تبقى استبدالًا مؤكَّدًا — الحارس ليس تعطيلًا"
  );
}

// ══════════════ ٢٠) الحتمية ══════════════
console.log("\n  ── ٢٠) الحتمية ──");
{
  const exp = buildExpected(ayahs(67, 1, 5));
  const words = perfect(exp);
  const alien = CORPUS.get("36:1").split(/\s+/)[0];
  const heard = words.slice();
  heard[7] = alien;

  const a = JSON.stringify(run(exp, heard).entries.map((e) => [e.kind, e.reason ?? null]));
  const b = JSON.stringify(run(exp, heard).entries.map((e) => [e.kind, e.reason ?? null]));
  ok(a === b, "نفس المُدخل يعطي نفس المُخرج — لا عشوائية ولا ذكاء اصطناعي");
}

// ══════════════ ٢١) التشابه الحرفي ══════════════
console.log("\n  ── ٢١) قياس التشابه ──");
{
  ok(wordSimilarity("قل", "قل") === 1, "الكلمة ونفسها = ١");
  ok(wordSimilarity("", "") === 1, "فارغتان = ١ ولا تنقسم على صفر");
  const s = wordSimilarity("الرحمن", "الرحيم");
  ok(s > 0.6 && s < 1, `«الرحمن» و«الرحيم» متقاربتان (${s.toFixed(2)}) لا متطابقتان`);
}

// ══════════════ الخلاصة ══════════════
console.log(`\n  ═══ ${passed} نجح · ${failed} سقط ═══`);
if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحصًا.\n`);
  process.exit(1);
}
console.log("\n  ✅ اجتاز محرّك المحاذاة كل الفحوص.\n");
