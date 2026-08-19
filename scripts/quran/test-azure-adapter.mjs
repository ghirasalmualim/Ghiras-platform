#!/usr/bin/env node
/**
 * اختبارات مهايئ Azure — بلا شبكة ولا مفتاح ولا فاتورة.
 *
 * ⚠️ الردود هنا مبنية على **شكل الرد الموثَّق رسميًا** من Microsoft
 * (نفس أسماء الحقول ونفس التداخل ونفس الوحدات)، والنص القرآني فيها
 * مقروء من ملف المصحف لا مكتوب من الذاكرة.
 *
 * وهذه الاختبارات تفحص **قواعد الترجمة** لا جودة Azure. جودته لا
 * تُعرف إلا بصوت حقيقي، وذلك قياسٌ منفصل لم يُجرَ بعد.
 */

import { readFileSync } from "node:fs";
import {
  adaptAzureResponse,
  buildAssessmentHeader,
  azureEndpoint,
  wavDurationSec,
} from "../../.quran-test/speech/azure.js";
import { encodeWav } from "../../.quran-test/capture/recorder.js";

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

console.log("\n  ═══ مهايئ Azure ═══\n");

// نص قرآني حقيقي من الملف
const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
const C = new Map();
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const a = t.indexOf("|");
  const b = t.indexOf("|", a + 1);
  if (a === -1 || b === -1) continue;
  C.set(`${t.slice(0, a)}:${t.slice(a + 1, b)}`, t.slice(b + 1));
}
const IKHLAS1 = C.get("112:1"); // قُلْ هُوَ ٱللَّهُ أَحَدٌ
const W = IKHLAS1.split(/\s+/);

/** ردّ بشكل Azure الموثَّق. */
function azure({ status = "Success", words, lexical, confidence = 0.94, snr = 32.5 }) {
  return {
    RecognitionStatus: status,
    Offset: 700000,
    Duration: 24000000,
    DisplayText: lexical,
    SNR: snr,
    NBest: [
      {
        Confidence: confidence,
        Lexical: lexical,
        ITN: lexical,
        MaskedITN: lexical,
        Display: lexical,
        AccuracyScore: 88.0,
        FluencyScore: 91.0,
        CompletenessScore: 100.0,
        PronScore: 89.5,
        Words: words,
      },
    ],
  };
}
const word = (w, errorType, offsetTicks, durTicks) => ({
  Word: w,
  Offset: offsetTicks,
  Duration: durTicks,
  // ⚠️ صفر عن قصد — هكذا يرجعها Azure في مثاله الرسمي
  Confidence: 0.0,
  AccuracyScore: errorType === "Mispronunciation" ? 42.0 : 96.0,
  ErrorType: errorType,
});

// ── ١) الترويسة ──────────────────────────────────────────────
console.log("  ── ترويسة التقييم ──");
{
  const header = buildAssessmentHeader(IKHLAS1);
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  ok(decoded.ReferenceText === IKHLAS1, "النص المرجعي يُرسل كما هو حرفًا بحرف");
  ok(decoded.EnableMiscue === "True", "EnableMiscue مفعَّل — بدونه لا كشف حذف ولا إضافة");
  ok(decoded.Granularity === "Word", "التفصيل على مستوى الكلمة");
  ok(
    decoded.Dimension === "Comprehensive",
    "Comprehensive — شرط الحصول على ErrorType لكل كلمة"
  );
  ok(
    decoded.EnableProsodyAssessment === "False",
    "⚠️ تقييم الأداء مطفأ — العروض والنبر تجويدٌ مؤجَّل"
  );
}

// ── ٢) الرابط ────────────────────────────────────────────────
console.log("\n  ── الرابط ──");
{
  // بالمنطقة — الصيغة المفضَّلة، تعمل مع كل مورد
  const url = azureEndpoint({ region: "eastus" }, "ar-SA");
  ok(url.indexOf("language=ar-SA") !== -1, "اللغة في الرابط — بدونها يرفض Azure الطلب");
  ok(url.indexOf("format=detailed") !== -1, "detailed — بدونه لا NBest ولا كلمات");
  ok(url.indexOf("cognitiveservices/v1") !== -1, "مسار الصوت القصير الموثَّق");
  ok(
    url.indexOf("https://eastus.stt.speech.microsoft.com/") === 0,
    `⚠️ المضيف يُبنى من المنطقة — وُجد: ${url.split("?")[0]}`
  );

  // باسم المورد — لا تعمل إلا مع نطاق فرعي مخصص
  const byName = azureEndpoint({ resourceName: "ghiras-speech" }, "ar-SA");
  ok(
    byName.indexOf("https://ghiras-speech.cognitiveservices.azure.com/stt/") === 0,
    "وصيغة اسم المورد باقية لمن يملك نطاقًا مخصصًا"
  );

  // المنطقة تسبق الاسم إن وُجدا معًا
  const both = azureEndpoint({ region: "eastus", resourceName: "ghiras-speech" }, "ar-SA");
  ok(both === url, "المنطقة تُقدَّم على الاسم — لأنها تعمل دائمًا");
}

// ── ٣) المصدر الافتراضي: النص الحرّ ──────────────────────────
console.log("\n  ── الكلمات من النص الحرّ ──");
{
  const r = adaptAzureResponse(azure({ lexical: W.join(" "), words: [] }));
  ok(r.status === "OK", "Success ⇒ OK");
  ok(r.tokens.length === W.length, `عدد الكلمات ${r.tokens.length} = ${W.length}`);
  ok(
    r.tokens.every((t) => t.confidence === 0.94),
    "⚠️ ثقة الجملة تُنسب لكل كلمة — لأن ثقة الكلمة عند Azure صفر دائمًا"
  );
  ok(
    r.tokens.every((t) => t.startSec === undefined),
    "بلا توقيت — ولا نخترع توقيتًا لم يعطه المزوّد"
  );
}

// ── ٤) كلمة Omission لا تدخل أبدًا ───────────────────────────
console.log("\n  ── الحذف لا يصير كلمة مسموعة ──");
{
  const words = [
    word(W[0], "None", 7000000, 3000000),
    word(W[1], "Omission", 0, 0), // لم تُنطق
    word(W[2], "None", 12000000, 4000000),
    word(W[3], "None", 17000000, 5000000),
  ];
  const r = adaptAzureResponse(azure({ lexical: "x", words }), { source: "assessed" });

  ok(r.tokens.length === 3, `٣ كلمات مسموعة من ٤ (وُجد ${r.tokens.length})`);
  ok(
    r.tokens.every((t) => t.text !== W[1]),
    `⚠️ الكلمة المحذوفة «${W[1]}» لا تظهر — وإلا لأخبرنا المحرّك بأن الطفل قالها`
  );
  ok(
    r.diagnostics.providerErrorTypes.some((x) => x.errorType === "Omission"),
    "لكنها تبقى في التشخيص — معلومة مساعدة لا حكم"
  );
}

// ── ٥) التوقيت والوحدات ──────────────────────────────────────
console.log("\n  ── التوقيت ──");
{
  const words = [word(W[0], "None", 7000000, 3000000)];
  const r = adaptAzureResponse(azure({ lexical: "x", words }), { source: "assessed" });
  const t = r.tokens[0];
  ok(
    Math.abs(t.startSec - 0.7) < 1e-9,
    `١٠٠ نانوثانية ← ثانية: ٧٠٠٠٠٠٠ ⇒ ٠٫٧ ثانية (وُجد ${t.startSec})`
  );
  ok(Math.abs(t.endSec - 1.0) < 1e-9, `النهاية = البداية + المدة (وُجد ${t.endSec})`);
}

// ── ٦) الثقة الصفرية لا تُصدَّق ───────────────────────────────
console.log("\n  ── الثقة ──");
{
  const words = [word(W[0], "None", 7000000, 3000000)];
  const r = adaptAzureResponse(azure({ lexical: "x", words, confidence: 0.81 }), {
    source: "assessed",
  });
  ok(
    r.tokens[0].confidence === 0.81,
    `صفر الكلمة يُتجاهَل لصالح ثقة الجملة (وُجد ${r.tokens[0].confidence})`
  );

  // وإن أعطى Azure ثقة حقيقية للكلمة، تُقدَّم
  const real = [{ ...word(W[0], "None", 7000000, 3000000), Confidence: 0.55 }];
  const r2 = adaptAzureResponse(azure({ lexical: "x", words: real, confidence: 0.81 }), {
    source: "assessed",
  });
  ok(r2.tokens[0].confidence === 0.55, "وثقة الكلمة الحقيقية تُقدَّم على ثقة الجملة");
}

// ── ٧) درجات النطق لا تتسرّب إلى الحكم ───────────────────────
console.log("\n  ── الفصل عن التجويد ──");
{
  const words = [word(W[0], "Mispronunciation", 7000000, 3000000)];
  const r = adaptAzureResponse(azure({ lexical: W[0], words }), { source: "assessed" });

  const blob = JSON.stringify(r.tokens);
  ok(
    blob.indexOf("42") === -1 && blob.indexOf("Accuracy") === -1,
    "⚠️ ولا درجة نطق واحدة تصل إلى الكلمات التي يحكم عليها المحرّك",
    blob
  );
  ok(
    blob.indexOf("Mispronunciation") === -1 && blob.indexOf("ErrorType") === -1,
    "⚠️ ولا تصنيف خطأ من Azure يتسرّب — نموذج غراس وحده"
  );
  ok(
    r.diagnostics.pronunciationScores.accuracy === 88,
    "الدرجات موجودة في التشخيص للقياس فقط"
  );
  ok(
    r.tokens.length === 1,
    "والكلمة نفسها تُنقل مسموعةً — الحكم عليها لمحرّكنا"
  );
}

// ── ٨) حالات الفشل ───────────────────────────────────────────
console.log("\n  ── حالات الفشل ──");
{
  for (const [azStatus, ours, why] of [
    ["NoMatch", "NO_SPEECH", "صوت بلا كلام مفهوم"],
    ["InitialSilenceTimeout", "SILENCE", "صمت — الميكروفون بعيد أو مقفل"],
    ["BabbleTimeout", "NOISE", "ضجيج غلب على الصوت"],
    ["Error", "PROVIDER_ERROR", "المزوّد تعثّر"],
  ]) {
    const r = adaptAzureResponse(azure({ status: azStatus, lexical: "", words: [] }));
    ok(r.status === ours, `${azStatus} ⇒ ${ours} (${why})`);
    ok(r.tokens.length === 0, `  ولا كلمة تُنتج في حالة ${azStatus}`);
  }
}

// ── ٩) ردود مشوَّهة لا تُسقط الخادم ──────────────────────────
console.log("\n  ── متانة ──");
{
  ok(adaptAzureResponse({}).status === "PROVIDER_ERROR", "رد فارغ ⇒ خطأ مزوّد، بلا انهيار");
  ok(
    adaptAzureResponse({ RecognitionStatus: "Success" }).tokens.length === 0,
    "نجاح بلا NBest ⇒ صفر كلمات، بلا انهيار"
  );
  ok(
    adaptAzureResponse(azure({ lexical: "", words: [] })).tokens.length === 0,
    "نص حرّ فارغ ⇒ صفر كلمات"
  );
}

// ── ١٠) التشخيص كامل ─────────────────────────────────────────
console.log("\n  ── التشخيص ──");
{
  const r = adaptAzureResponse(azure({ lexical: W.join(" "), words: [], snr: 27.3 }), {
    audioBytes: 96044,
    audioSec: 3.0,
    latencyMs: 480,
  });
  const d = r.diagnostics;
  ok(d.provider === "azure", "المزوّد مسمّى");
  ok(d.snr === 27.3, "نسبة الإشارة إلى الضجيج منقولة — تنفع لكشف الضجيج");
  ok(d.utteranceConfidence === 0.94, "ثقة الجملة منقولة");
  ok(d.lexical === W.join(" "), "النص الحرّ محفوظ للمقارنة");
  ok(d.audioBytes === 96044 && d.audioSec === 3 && d.latencyMs === 480, "حجم ومدة وزمن الاستجابة");
}

// ── ١١) بناء WAV ─────────────────────────────────────────────
console.log("\n  ── صيغة الصوت ──");
{
  const samples = new Float32Array(16000); // ثانية واحدة
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((i / 16000) * 2 * Math.PI * 440) * 0.5;
  const wav = encodeWav(samples, 16000);

  const v = new DataView(wav);
  const tag = (at) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  ok(tag(0) === "RIFF" && tag(8) === "WAVE", "ترويسة RIFF/WAVE سليمة");
  ok(v.getUint16(20, true) === 1, "PCM — الترميز الوحيد الذي يقبله المزوّد");
  ok(v.getUint16(22, true) === 1, "أحادي القناة");
  ok(v.getUint32(24, true) === 16000, "١٦ ك.هرتز بالضبط");
  ok(v.getUint16(34, true) === 16, "١٦ بت لكل عيّنة");
  ok(wav.byteLength === 44 + 16000 * 2, `الحجم ${wav.byteLength} بايت = ترويسة + عيّنات`);
  ok(Math.abs(wavDurationSec(wav) - 1) < 1e-6, "المدة المحسوبة من الترويسة = ثانية");

  // ثلاثون ثانية — سقف تقييم Azure المكتوب
  const thirty = encodeWav(new Float32Array(16000 * 30), 16000);
  ok(
    thirty.byteLength === 44 + 16000 * 2 * 30,
    `٣٠ ثانية = ${(thirty.byteLength / 1024).toFixed(0)} ك.ب — تحت سقف Vercel (٤٫٥ م.ب)`
  );
}

console.log(`\n  ═══ ${passed} نجح · ${failed} سقط ═══`);
if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحصًا.\n`);
  process.exit(1);
}
console.log("\n  ✅ اجتاز مهايئ Azure كل فحوص الترجمة.");
console.log("  ⚠️ وهذا يثبت الترجمة لا جودة Azure — تلك تحتاج صوتًا حقيقيًا.\n");
