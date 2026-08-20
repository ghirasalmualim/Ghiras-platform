#!/usr/bin/env node
/**
 * اختبارات محرّكات التسميع: عوارض المزوّد، ومنظّم الجلسة، والتقدير.
 *
 * ⚠️ كلها بلا مزوّد ولا مفتاح ولا شبكة. والنص القرآني من ملف المصحف.
 */

import { readFileSync } from "node:fs";
import { buildExpected, tokensFromText, alignRecitation }
  from "../../.quran-test/engine/alignment.js";
import { stripProviderArtifacts, ARTIFACT_RULES }
  from "../../.quran-test/engine/artifacts.js";
import { splitIntoChunks, findSilences, silentFor, SESSION_TUNING, PROVIDER_MAX_SEC }
  from "../../.quran-test/engine/session.js";
import { gradeSession, eventsFor } from "../../.quran-test/engine/grading.js";
import { nextHint } from "../../.quran-test/engine/hints.js";
import { inspectWav, checkRate, MAX_CLIP_SEC } from "../../.quran-test/speech/limits.js";
import { encodeWav } from "../../.quran-test/capture/recorder.js";

let passed = 0, failed = 0;
const ok = (c, label, extra = "") => {
  if (c) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ""}`); }
};

console.log("\n  ═══ محرّكات التسميع ═══\n");

const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
const C = new Map();
for (const l of raw.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const a = t.indexOf("|"), b = t.indexOf("|", a + 1); if (a < 0 || b < 0) continue;
  C.set(`${t.slice(0,a)}:${t.slice(a+1,b)}`, t.slice(b+1));
}
const ayahs = (s,f,t) => { const o=[]; for(let n=f;n<=t;n++) o.push({surah:s,ayah:n,text_uthmani:C.get(`${s}:${n}`)}); return o; };

// ══════════ عوارض المزوّد ══════════
console.log("  ── عوارض المزوّد: صلة الهاء ──");
{
  ok(ARTIFACT_RULES.length >= 1 && ARTIFACT_RULES[0].evidence.length > 40,
     "كل قاعدة موثَّقة بدليل من تسجيل حقيقي");

  // الإخلاص فيها «لَّهُۥ» بواو الصلة
  const exp = buildExpected(ayahs(112, 1, 4));
  const silah = exp.filter((w) => w.uthmani.indexOf("ۥ") !== -1);
  ok(silah.length === 1, `«${silah[0]?.uthmani}» تحمل واو الصلة — الحالة قائمة في النص`);

  // ما سمعه Azure فعلًا في تسجيلين حقيقيين
  const heard = tokensFromText("قل هو الله احد الله الصمد لم يلد ولم يولد ولم يكن له هو كفوا احد");
  const cleaned = stripProviderArtifacts(exp, heard);
  ok(cleaned.removed.length === 1 && cleaned.removed[0].ruleId === "SILAH_ECHO",
     "صدى «هو» بعد «له» يُحذف بوصفه عارض مزوّد",
     `حُذف ${cleaned.removed.length}`);
  ok(cleaned.tokens.length === heard.length - 1, "ولا يُحذف غيره");

  const r = alignRecitation(exp, cleaned.tokens);
  ok(r.summary.confirmedErrors === 0 && r.summary.uncertain === 0,
     "فتصير القراءة نظيفة تمامًا — ولا «لم أتأكد» حتى",
     `أخطاء ${r.summary.confirmedErrors} · غير مؤكد ${r.summary.uncertain}`);

  // القراءة الصحيحة لا تتأثر
  const perfect = tokensFromText(exp.map((w) => w.uthmani).join(" "));
  ok(stripProviderArtifacts(exp, perfect).removed.length === 0,
     "والقراءة الصحيحة لا يُحذف منها شيء");

  // ⚠️ لا يبتلع كلمة متوقَّعة فعلًا
  const exp2 = buildExpected(ayahs(2, 255, 255)); // آية الكرسي: «بِإِذْنِهِۦ» وغيرها
  const words2 = exp2.map((w) => w.uthmani);
  const clean2 = stripProviderArtifacts(exp2, tokensFromText(words2.join(" ")));
  ok(clean2.removed.length === 0,
     "آية الكرسي كاملةً صحيحة: لا يُحذف منها حرف رغم كثرة الصلات");
}

// ══════════ منظّم الجلسة ══════════
console.log("\n  ── منظّم الجلسة ──");
{
  const SR = 16000;
  const tone = (sec, amp = 0.3) => {
    const n = Math.floor(sec * SR), a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin((i / SR) * 2 * Math.PI * 220) * amp;
    return a;
  };
  const silence = (sec) => new Float32Array(Math.floor(sec * SR));
  const join = (...xs) => { let n=0; for(const x of xs) n+=x.length; const o=new Float32Array(n); let at=0; for(const x of xs){o.set(x,at);at+=x.length;} return o; };

  // تسجيل قصير ⇒ مقطع واحد بلا تقسيم
  ok(splitIntoChunks(tone(10), SR).length === 1, "عشر ثوانٍ = نداء واحد، بلا تقسيم");

  // تسجيل طويل بسكتات ⇒ يُقطع عندها
  const long = join(tone(18), silence(1), tone(18), silence(1), tone(18));
  const chunks = splitIntoChunks(long, SR);
  ok(chunks.length >= 2, `٥٦ ثانية ⇒ ${chunks.length} مقاطع`);
  ok(chunks.every((c) => c.endSec - c.startSec <= PROVIDER_MAX_SEC),
     "ولا مقطع يتجاوز حدّ المزوّد",
     chunks.map((c) => (c.endSec - c.startSec).toFixed(1)).join(", "));
  ok(chunks.every((c) => c.cutAtSilence),
     "⚠️ وكلها مقطوعة عند سكتة — لا كلمة تُبتر بسبب حدّ تقني");

  // تغطية كاملة: لا عيّنة تضيع بين المقاطع
  let total = 0;
  for (const c of chunks) total += c.samples.length;
  ok(total === long.length, `مجموع المقاطع = التسجيل كاملًا (${total} = ${long.length})`);

  // بلا سكتة إطلاقًا ⇒ يقطع عند الحدّ ويُعلن أنه مصطنع
  const noPause = splitIntoChunks(tone(70), SR);
  ok(noPause.some((c) => !c.cutAtSilence),
     "⚠️ تلاوة متصلة بلا سكتة: يُقطع عند الحدّ ويُعلَن أن الحدّ مصطنع");
  ok(noPause.every((c) => c.endSec - c.startSec <= PROVIDER_MAX_SEC),
     "ومع ذلك لا يتجاوز الحدّ");

  // كشف السكوت
  ok(findSilences(join(tone(2), silence(1), tone(2)), SR).length === 1, "السكتة الواحدة تُكتشف");
  ok(silentFor(join(tone(2), silence(1.5)), SR) > 1.2, "مدة السكوت الأخير تُقاس");
  ok(silentFor(tone(3), SR) < 0.1, "ولا سكوت في تلاوة متصلة");
}

// ══════════ التقدير ══════════
console.log("\n  ── التقدير: مستويات لا أرقام ──");
{
  const exp = buildExpected(ayahs(112, 1, 4));
  const words = exp.map((w) => w.uthmani);

  const perfect = gradeSession(alignRecitation(exp, tokensFromText(words.join(" "))));
  ok(perfect.level === "EXCELLENT", `قراءة كاملة ⇒ EXCELLENT (${perfect.level})`);
  ok(perfect.headline.indexOf("أحسنت") !== -1, "والعنوان تشجيع لا درجة");

  // ⚠️ ولا رقم من مئة في أي نصّ يُعرض
  const shown = `${perfect.headline} ${perfect.detail}`;
  ok(!/\d/.test(shown), "⚠️ ولا رقم واحد في النص المعروض — لا ندّعي دقة لا نملكها", shown);

  const dropped = tokensFromText(words.filter((_, i) => i !== 5).join(" "));
  const one = gradeSession(alignRecitation(exp, dropped));
  ok(one.level === "VERY_GOOD" || one.level === "NEEDS_LIGHT", `خطأ واحد ⇒ ${one.level}`);

  const empty = gradeSession(alignRecitation(exp, []));
  ok(empty.level === "UNJUDGED" && empty.internalScore === null,
     "تسجيل فارغ ⇒ UNJUDGED بلا درجة داخلية");
  ok(empty.detail.indexOf("نجرّب") !== -1, "ورسالته دعوة لإعادة المحاولة لا حكم");

  // الأحداث
  const r = alignRecitation(exp, tokensFromText(words.join(" ")));
  const ev = eventsFor(r, perfect, false);
  ok(ev.indexOf("recitation_completed") !== -1 && ev.indexOf("recitation_without_help") !== -1,
     "قراءة بلا مساعدة تسجّل الحدثين");
  ok(eventsFor(r, perfect, true).indexOf("recitation_without_help") === -1,
     "ومع المساعدة لا يُسجَّل «بلا مساعدة»");
  ok(eventsFor(alignRecitation(exp, []), empty, false).length === 0,
     "والجلسة غير الصالحة لا تسجّل حدثًا");
}

// ══════════ التلميحات ══════════
console.log("\n  ── سُلَّم التلميحات ──");
{
  // ⚠️ التلميح على **آية تختارها الطالبة** لا على موضعٍ نستنبطه.
  // فاستنباطُه كان يكلّف نداءً وأربعَ ثوانٍ ويخطئ: عددُ كلماتِ آخرِ
  // عشر ثوانٍ ليس موضعًا مطلقًا، فتُعطى تلميحَ أول المقطع وهي في آخره.
  const exp = buildExpected(ayahs(112, 1, 4));

  const h1 = nextHint(exp, 3, 0);
  ok(
    h1.kind === "PLAY" && h1.surah === 112 && h1.ayah === 3,
    "أول طلبٍ يُشغّل الآية المختارة — من طلب عونًا لا يُواسى"
  );

  const h2 = nextHint(exp, 3, 1);
  ok(h2.kind === "REVEAL" && h2.words.length <= 2,
     `وإعادةُ الطلب تكشف كلمتين لا أكثر (${h2.words.length})`);

  const third = exp.filter((w) => w.ayah === 3);
  ok(h2.words[0] === third[0].uthmani, "⚠️ والكلمة من النص المرجعي حرفًا بحرف");
  ok(
    h2.words.length < third.length || third.length <= 2,
    "⚠️ ولا تُكشف الآية كاملة — أوائلها تكفي لتتذكّر"
  );

  ok(nextHint(exp, 99, 0) === null, "وآيةٌ خارج المقطع لا تُلمَّح");
}

// ══════════ حماية التكلفة ══════════
console.log("\n  ── حماية المزوّد ──");
{
  const good = encodeWav(new Float32Array(16000 * 5), 16000);
  const g = inspectWav(good);
  ok(g.ok && Math.abs(g.seconds - 5) < 0.01, "WAV سليم يمرّ بمدته الصحيحة");

  ok(inspectWav(new ArrayBuffer(20)).ok === false, "ملف صغير جدًا يُرفض");
  ok(inspectWav(new ArrayBuffer(500)).reason === "NOT_WAV", "⚠️ ما ليس WAV يُرفض ببايتاته لا بادّعاء ترويسته");

  const wrongRate = encodeWav(new Float32Array(44100), 44100);
  ok(inspectWav(wrongRate).reason === "BAD_FORMAT", "معدّل عيّنة خاطئ يُرفض قبل أن يكلّفنا نداءً");

  const tooLong = encodeWav(new Float32Array(16000 * (MAX_CLIP_SEC + 5)), 16000);
  ok(inspectWav(tooLong).reason === "TOO_LONG", `أطول من ${MAX_CLIP_SEC} ثانية يُرفض`);

  ok(inspectWav(encodeWav(new Float32Array(1000), 16000)).reason === "TOO_SHORT", "وأقصر من اللازم يُرفض");

  // حدّ المعدّل
  const uid = "u-test-" + Math.random();
  let allowed = 0;
  for (let i = 0; i < 40; i++) if (checkRate(uid).ok) allowed++;
  ok(allowed < 40 && allowed >= 10, `حدّ المعدّل يوقف الإفراط (سُمح بـ${allowed} من ٤٠)`);
  ok(checkRate(uid).ok === false, "وبعد بلوغ الحدّ يُرفض");
  ok(checkRate("u-other-" + Math.random()).ok === true, "⚠️ والحدّ لكل حساب لا للجميع");
}

console.log(`\n  ═══ ${passed} نجح · ${failed} سقط ═══`);
if (failed) { console.error(`\n  ⛔️ سقط ${failed} فحصًا.\n`); process.exit(1); }
console.log("\n  ✅ اجتازت محرّكات التسميع كل الفحوص.\n");
