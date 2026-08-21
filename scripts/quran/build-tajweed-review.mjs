#!/usr/bin/env node
/**
 * مولّد حزمة مراجعة المختصّ.
 *
 * ⚠️ **العيّنة حتميّة**: تُختار بمواضع نسبيّة ثابتة من قائمةٍ مرتّبة
 * (سورة ثم آية ثم موضع)، فتُعاد نفسها بالضبط في كل تشغيل. ولو كانت
 * عشوائية لما استطعنا أن نسأل المختصّ عن الموضع نفسه مرّتين.
 *
 *   node scripts/quran/build-tajweed-review.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";

const OUT = ".tajweed-build";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync("npx", ["tsc",
  "src/features/quran/tajweed/engine.ts",
  "src/features/quran/tajweed/types.ts",
  "src/features/quran/tajweed/review.ts",
  "--outDir", OUT, "--rootDir", "src/features/quran/tajweed",
  "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
], { stdio: "inherit" });
writeFileSync(`${OUT}/package.json`, JSON.stringify({ type: "module" }) + "\n");
for (const f of ["engine.js", "review.js"]) {
  const p = `${OUT}/${f}`;
  writeFileSync(p, readFileSync(p, "utf8").replace(
    /(from\s+["'])(\.\.?\/[^"']+?)(["'])/g,
    (m, a, s, b) => (/\.(js|mjs|json)$/.test(s) ? m : `${a}${s}.js${b}`)));
}

const { annotateAyah } = await import(`../../${OUT}/engine.js`);
const { RULE_CATALOGUE, ENGINE_VERSION } = await import(`../../${OUT}/review.js`);

// ── المصحف ─────────────────────────────────────────────────
const raw = readFileSync("src/features/quran/corpus/quran-uthmani.txt", "utf8");
const AYAH = [];
for (const line of raw.split("\n")) {
  if (line.startsWith("#") || line.split("|").length < 3) continue;
  const [s, a, t] = line.split("|");
  if (/^\d+$/.test(s)) AYAH.push({ surah: +s, ayah: +a, text: t });
}
const SURAH_LEN = new Map();
for (const v of AYAH) SURAH_LEN.set(v.surah, (SURAH_LEN.get(v.surah) ?? 0) + 1);

// ── كل المواضع، مرتّبةً ترتيبًا ثابتًا ─────────────────────
const all = new Map();
for (const v of AYAH)
  for (const x of annotateAyah(v.text, v.surah, v.ayah)) {
    if (!all.has(x.rule)) all.set(x.rule, []);
    all.get(x.rule).push({ ...x, text: v.text });
  }
for (const list of all.values())
  list.sort((p, q) => p.surah - q.surah || p.ayah - q.ayah || p.start - q.start);

// ── إبراز الموضع داخل الآية ────────────────────────────────
const mark = (o) =>
  o.text.slice(0, o.start) + "⟦" + o.text.slice(o.start, o.end) + "⟧" + o.text.slice(o.end);

/** موضع الحكم من الآية: أوّلها · وسطها · آخرها. */
function place(o) {
  const w = o.text.split(" ").length;
  if (o.wordIndex === 0) return "أول الآية";
  if (o.wordIndex >= w - 1) return "آخر الآية";
  return "وسط الآية";
}

/**
 * ⚠️ اختيارٌ موزَّع لا منتقى: نأخذ من مواضع نسبيّة ثابتة، ثم نضمن
 * حضور أول المصحف وآخره وسورةٍ قصيرة وسورةٍ طويلة وأوّلَ الآية
 * ووسطَها وآخرَها. والانتقاء بالإعجاب يُري المختصَّ ما نحبّ أن يراه.
 */
function sample(list) {
  const picked = new Map();
  const take = (o, why) => { if (o && !picked.has(o)) picked.set(o, why); };
  const at = (frac) => list[Math.min(list.length - 1, Math.floor(list.length * frac))];

  for (const f of [0, 0.25, 0.5, 0.75, 0.99]) take(at(f), `موضع ${Math.round(f * 100)}٪ من القائمة`);
  take(list.find((o) => o.surah <= 2), "أول المصحف");
  take(list.find((o) => o.surah >= 78), "آخر المصحف (جزء عمّ)");
  take(list.find((o) => (SURAH_LEN.get(o.surah) ?? 0) <= 6), "سورة قصيرة");
  take(list.find((o) => (SURAH_LEN.get(o.surah) ?? 0) >= 200), "سورة طويلة");
  for (const p of ["أول الآية", "وسط الآية", "آخر الآية"])
    take(list.find((o) => place(o) === p), p);
  return [...picked.entries()];
}

// ── الحالات الصعبة، بأدلّتها من المصحف ─────────────────────
const hard = [];
const findAll = (pred, limit = 2) => {
  const out = [];
  for (const [rule, list] of all)
    for (const o of list) { if (pred(o, rule)) { out.push({ ...o, rule }); if (out.length >= limit) return out; } }
  return out;
};
const push = (title, question, items) => hard.push({ title, question, items });

push("تنوين الفتح والألف الصامتة",
  "الألف بعد تنوين الفتح رسمٌ لا تُنطق، فتخطّيناها ولم نعدّها الحرف التالي. أصوابٌ هذا؟",
  findAll((o) => /[ًٌٍ]/.test(o.text.slice(o.start + 1, o.end)) && o.rule === "ikhfa"));
push("الإدغام الناقص — بلا شدّة في الرسم",
  "الرسم لا يكتب الشدّة مع (ي و) لبقاء الغنّة. أحكمنا بالإدغام صوابًا؟",
  findAll((o, r) => r === "idgham_ghunnah" && (o.next === "ي" || o.next === "و")));
push("الإدغام الكامل — الشدّة مكتوبة",
  "هل تمثيلُنا للإدغام في (ن م ل ر) صحيح؟",
  findAll((o, r) => r === "idgham_no_ghunnah"));
push("الإظهار المطلق داخل الكلمة",
  "نونٌ ساكنة يليها واوٌ أو ياء في الكلمة نفسها: أظهرناها ولم ندغم. أصوابٌ هذا؟",
  findAll((o, r) => r === "idhhar" && (o.next === "و" || o.next === "ي")));
push("الإقلاب بعلامته",
  "اعتمدنا الميم الصغيرة (ۢ) دليلًا قاطعًا ولم نستنتج. أيكفي هذا؟",
  findAll((o, r) => r === "iqlab"));
push("القلقلة",
  "لم نفرّق بين الصغرى والكبرى لأن الكبرى تقع بالوقف ولا نعلم أين يقف. أنكتفي بواحدة؟",
  findAll((o, r) => r === "qalqalah"));
push("لام التعريف الشمسية ولفظ الجلالة",
  "أدخلنا (ٱللَّه) في اللام الشمسية لأن اللام حرفٌ شمسيّ. أيُعرض هكذا للمتعلّم؟",
  findAll((o, r) => r === "lam_shamsiyyah" && o.text.slice(o.start, o.start + 6).includes("لَّه")));
push("همزة الوصل في أول الآية",
  "حكمنا على كل همزة وصل، ومنها ما في أول الآية وهي تُنطق عند الابتداء. أنميّزها؟",
  findAll((o, r) => r === "hamzat_wasl" && o.wordIndex === 0));

// ── الإقلاب بين آيتين — سؤالٌ مستقلّ ───────────────────────
const crossAyah = AYAH.filter((v) => /ۢ$/.test(v.text))
  .map((v) => {
    const nx = AYAH.find((u) => u.surah === v.surah && u.ayah === v.ayah + 1);
    return { ...v, next: nx ? nx.text.slice(0, 22) : "(آخر السورة)" };
  });

// ── التقرير ────────────────────────────────────────────────
const N = (n) => n.toLocaleString("ar-EG");
let md = `# حزمة مراجعة أحكام التجويد — منصّة غراس

> نسخة المحرّك: \`${ENGINE_VERSION}\` · التاريخ: ${new Date().toISOString().slice(0, 10)}
> **الرواية: حفص عن عاصم** · النصّ: مصحف تنزيل العثماني (نسخة ١٫١)

---

## ما نطلبه منك — بلا مصطلحات تقنية

بنينا في منصّة غراس برنامجًا **يستخرج مواضع أحكام التجويد من نصّ المصحف نفسه**،
ليعرضها على المتعلّم ويشرحها له.

⚠️ **والبرنامج لا يسمع أحدًا ولا يحكم على تلاوة.** هو يقول: «في هذا الموضع
إخفاء» — لا «قراءتك خطأ». وقرّرنا ألّا نحكم على الصوت حتى تثبت دقّته.

**وما نحتاجه منك شيئان:**

**١. هل القاعدة التي طبّقناها صحيحة؟** — نصف لك في كل حكمٍ ما فهمناه، ونسألك: أهذا هو الحكم؟

**٢. هل المواضع التي استخرجناها في محلّها؟** — نعرض عليك أمثلة موزّعة من المصحف كلّه، والموضع محصورٌ بين ⟦ ⟧.

⚠️ **ولا يُعرض شيءٌ من هذا على طالبةٍ أو طفلٍ قبل حكمك.** فما لم تُجزه بقي في
الجهاز ولم يصل إلى شاشة. ونحن بنينا الاستخراج، ولا نُفتي في الحكم.

⚠️ **وإن رأيت خطأً فذاك هو المقصود.** غرض هذه الورقة أن نجده قبل أن يراه طفل.

---

## الأحكام المطلوب مراجعتها

`;

const counts = new Map([...all].map(([r, l]) => [r, l.length]));
md += `| # | الحكم | المواضع في المصحف |\n|---|---|---|\n`;
RULE_CATALOGUE.forEach((r, i) => {
  md += `| ${i + 1} | ${r.nameAr} | ${N(counts.get(r.ruleId) ?? 0)} |\n`;
});
md += `\n**المجموع: ${N([...counts.values()].reduce((a, b) => a + b, 0))} موضعًا.**\n\n---\n`;

for (const r of RULE_CATALOGUE) {
  const list = all.get(r.ruleId) ?? [];
  md += `\n## ${r.nameAr}\n\n`;
  md += `**عدد المواضع:** ${N(list.length)}\n\n`;
  md += `**القاعدة كما فهمناها:**\n> ${r.ruleAr}\n\n`;
  md += `**كيف استخرجناها من الرسم:**\n> ${r.derivationMethod}\n\n`;
  if (r.quranicEvidence.length)
    md += `**شواهد اعتمدنا عليها:** ${r.quranicEvidence.join(" · ")}\n\n`;
  if (r.technicalAssumption.length) {
    md += `**افتراضاتنا — وهي أوّل ما نرجو نظرك فيه:**\n`;
    for (const a of r.technicalAssumption) md += `- ${a}\n`;
    md += `\n`;
  }
  if (r.deliberateAbstention.length) {
    md += `**ما امتنعنا عن الحكم فيه عمدًا:**\n`;
    for (const a of r.deliberateAbstention) md += `- ${a}\n`;
    md += `\n`;
  }
  md += `**أمثلة موزّعة من المصحف:**\n\n`;
  md += `| السورة:الآية | الموضع من الآية | لماذا اختير | النصّ |\n|---|---|---|---|\n`;
  for (const [o, why] of sample(list))
    md += `| ${o.surah}:${o.ayah} | ${place(o)} | ${why} | ${mark(o)} |\n`;
  md += `\n**حكمك على هذه القاعدة:**\n\n`;
  md += `- [ ] ✅ صحيحة كما هي\n- [ ] ⚠️ صحيحة مع تعديل\n- [ ] ❌ غير صحيحة\n- [ ] 🔍 تحتاج نظرًا أطول\n\n`;
  md += `**ملاحظتك:**\n\n> \n\n---\n`;
}

md += `\n# حالاتٌ صعبة اخترناها عمدًا\n\n`;
md += `⚠️ **لم نعرض عليك السهل وحده.** هذه مواضع اجتهدنا فيها، وقد نكون أخطأنا.\n`;
for (const h of hard) {
  md += `\n## ${h.title}\n\n**سؤالنا:** ${h.question}\n\n`;
  if (h.items.length) {
    md += `| السورة:الآية | النصّ |\n|---|---|\n`;
    for (const o of h.items) md += `| ${o.surah}:${o.ayah} | ${mark(o)} |\n`;
  }
  md += `\n**جوابك:**\n\n> \n\n`;
}

md += `\n---\n\n# سؤالٌ خاصّ: الإقلاب بين آيتين\n\n`;
md += `وجدنا **${N(crossAyah.length)} موضعًا** تنتهي فيه الآية بتنوينٍ عليه علامةُ الإقلاب،\n`;
md += `والآيةُ التالية تبدأ بباء.\n\n`;
md += `⚠️ **وامتنعنا عن الحكم فيها**، لأن الإقلاب يقع إن وصل القارئ ويسقط إن وقف —\n`;
md += `ونحن لا نعلم أيّهما سيختار.\n\n`;
md += `**أمثلة:**\n\n| السورة:الآية | آخر الآية | بداية التالية |\n|---|---|---|\n`;
for (const v of crossAyah.slice(0, 6))
  md += `| ${v.surah}:${v.ayah} | …${v.text.slice(-20)} | ${v.next}… |\n`;
md += `\n**سؤالنا:** كيف ينبغي أن يمثّل نظامٌ تعليميّ هذا الحكم، والقارئ قد يقف وقد يصل؟\n\n`;
md += `ونقترح — إن رأيته صوابًا — أن نضع له حالةً ثالثة: **«حكمٌ مشروطٌ بالوصل»**،\n`;
md += `فيُعرض مع بيان شرطه بدل أن يُحذف أو يُطلَق.\n\n**جوابك:**\n\n> \n\n`;

md += `\n---\n\n# الوصل والوقف عمومًا\n\n`;
md += `مصحفُ التجويد الذي نبنيه سيعرض الأحكام على الشاشة. ولا نريد أن نُظهر حكمًا\n`;
md += `مطلقًا وهو مشروطٌ بطريقة القراءة.\n\n**نرجو بيان الأحكام التي:**\n\n`;
md += `1. تثبت في الوصل وتسقط في الوقف.\n2. تتغيّر عند الابتداء.\n`;
md += `3. تعتمد على حركةٍ عارضة.\n4. تختلف بين قارئٍ يقف وقارئٍ يصل.\n\n**جوابك:**\n\n> \n\n`;

md += `\n---\n\n# ما لم ندخله بعد\n\n`;
md += `⚠️ **المدود لم نبدأها عمدًا** — فيها نوعُ المدّ ومقدارُ الحركات والعارضُ\n`;
md += `واللازمُ والمتّصلُ والمنفصل، ولم نشأ أن نبنيها فوق أساسٍ لم يُراجَع.\n\n`;
md += `فإن أجزتَ ما سبق، بدأناها ورجعنا إليك بها.\n\n---\n\n`;
md += `**جزاك الله خيرًا.**\n`;

writeFileSync("docs/tajweed-review-package.md", md);
rmSync(OUT, { recursive: true, force: true });

console.log("✅ docs/tajweed-review-package.md");
console.log(`   ${md.split("\n").length} سطرًا · ${counts.size} حكمًا · ${N([...counts.values()].reduce((a,b)=>a+b,0))} موضعًا`);
