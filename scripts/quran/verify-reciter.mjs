#!/usr/bin/env node
/**
 * التحقق من تلاوة قبل اعتمادها.
 *
 *   node scripts/quran/verify-reciter.mjs ar.mahermuaiqly
 *
 * لا يُعتمد قارئ بلا هذا الفحص. ووجود التلاوة على المصدر ليس إذنًا
 * باستعمالها — هذا يفحص **التقنيات** لا الحقوق، والحقوق تُراجَع يدويًا
 * وتُوثَّق في `engine/reciters.ts`.
 *
 * ما يثبته:
 *   ١) النوع versebyverse — ملف لكل آية. أما surahbysurah فترقيمه
 *      مختلف تمامًا ولا يعمل مع التكرار ولا الحفظ الخفي.
 *   ٢) الحدود: الملفان ١ و٦٢٣٦ يعملان، و٠ و٦٢٣٧ يفشلان — أي ٦٢٣٦ آية
 *      بالضبط لا أكثر ولا أقل.
 *   ٣) عيّنة موزّعة على المصحف كله تعمل وبأحجام معقولة.
 *   ٤) توافق الترقيم: ارتباط مدة الصوت بعدد كلمات الآية في المصحف.
 *
 * الفحص الرابع هو الحاسم، وقد تطوّر: كان يقارن ترتيب المدد بين قارئين
 * فسقط على الحذيفي لأن آيتين تفصلهما عُشر ثانية تبادلتا الترتيب —
 * تعادلٌ لا إزاحة. فصار يقيس الارتباط، ويربط الصوت بالمصحف مباشرة لا
 * بإيقاع قارئ آخر. ويُقارَن بارتباط ترقيم مزاح بآية، فيثبت أن الفحص
 * يكشف الإزاحة فعلًا.
 */

import { readFileSync } from 'node:fs';

const id = process.argv[2];
if (!id) {
  console.error('الاستخدام: node scripts/quran/verify-reciter.mjs <المعرّف>');
  process.exit(2);
}

const CDN = 'https://cdn.islamic.network/quran/audio/128';
const TOTAL_AYAHS = 6236;

let failed = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ''}`);
    failed++;
  }
};

async function clip(n) {
  const r = await fetch(`${CDN}/${id}/${n}.mp3`);
  if (!r.ok) return { ok: false, status: r.status };
  const b = await r.arrayBuffer();
  return {
    ok: true,
    status: r.status,
    bytes: b.byteLength,
    sec: (b.byteLength * 8) / 128000,
    type: r.headers.get('content-type'),
  };
}

console.log(`\n  ═══ التحقق من ${id} ═══\n`);

// ── ١) النوع ────────────────────────────────────────────────
const editions = await (
  await fetch('https://api.alquran.cloud/v1/edition/format/audio')
).json();
const ed = editions.data.find((e) => e.identifier === id);
ok(Boolean(ed), `المعرّف موجود في المصدر`);
if (!ed) process.exit(1);
console.log(`     ${ed.englishName} — ${ed.name ?? ''}`);
ok(
  ed.type === 'versebyverse',
  `النوع versebyverse (ملف لكل آية) — وُجد: ${ed.type}`,
  ed.type === 'surahbysurah'
    ? 'ملف لكل سورة: ترقيمه مختلف ولا يعمل مع التكرار ولا الحفظ الخفي'
    : ''
);

// ── ٢) الحدود ───────────────────────────────────────────────
const [first, last, over, under] = await Promise.all([
  clip(1),
  clip(TOTAL_AYAHS),
  clip(TOTAL_AYAHS + 1),
  clip(0),
]);
ok(first.ok && last.ok, 'أول المصحف وآخره يعملان');
ok(!over.ok && !under.ok, `لا ملف قبل ١ ولا بعد ${TOTAL_AYAHS} — التلاوة كاملة بنفس الترقيم`);
ok(first.type === 'audio/mpeg', `الصيغة audio/mpeg — وُجد: ${first.type}`);

// ── ٣) عيّنة موزّعة ─────────────────────────────────────────
// عيّنة واسعة عن قصد: بعشر آيات فقط يصادف الترقيمُ المزاح ارتباطًا
// عاليًا أيضًا، فيضيع الفارق الذي نستدلّ به. والتوسيع يزيد قوة الفحص
// إحصائيًا بدل أن نُرخي الشرط لنُمرّر قارئًا.
const sample = [
  1, 8, 100, 262, 500, 800, 1236, 1500, 1800, 2000, 2300, 2600, 3000, 3300,
  3600, 4000, 4300, 4600, 5000, 5300, 5600, 5900, 6000, 6100, 6150, 6200,
  6222, 6231, 6234, 6236,
];
const clips = [];
for (const n of sample) clips.push(await clip(n));
ok(
  clips.every((c) => c.ok && c.bytes > 5000),
  `عيّنة من ${sample.length} آية موزّعة على المصحف كلها تعمل`
);

// ── ٤) توافق الترقيم ────────────────────────────────────────
const raw = readFileSync('src/features/quran/corpus/quran-uthmani.txt', 'utf8');
const ayahs = [];
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const a = t.indexOf('|');
  const b = t.indexOf('|', a + 1);
  if (a === -1 || b === -1) continue;
  ayahs.push(t.slice(b + 1));
}
const wordsOf = (n) => ayahs[n - 1].split(/\s+/).filter(Boolean).length;

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const corr = (A, B) => {
  const ma = mean(A);
  const mb = mean(B);
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < A.length; i++) {
    n += (A[i] - ma) * (B[i] - mb);
    da += (A[i] - ma) ** 2;
    db += (B[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * db);
};

// نتجنّب أوائل السور: نصّها المخزَّن يحوي البسملة بينما ملفها الصوتي
// لا يحويها، فتبدو أطول مما تُتلى وتُفسد القياس. ونحسبها من ملف المصحف
// لا من قائمة مكتوبة بيدنا.
const surahStarts = new Set();
{
  let g = 0;
  let prevSurah = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const a = t.indexOf('|');
    if (a === -1) continue;
    const surah = Number(t.slice(0, a));
    if (!Number.isInteger(surah)) continue;
    g++;
    if (surah !== prevSurah) {
      surahStarts.add(g);
      prevSurah = surah;
    }
  }
}
const probe = sample.filter((n) => !surahStarts.has(n) && n < TOTAL_AYAHS);
const dur = probe.map((n) => clips[sample.indexOf(n)].sec);
console.log(`     نقاط القياس: ${probe.length} آية`);
const words = probe.map(wordsOf);
const shifted = probe.map((n) => wordsOf(n + 1));

const rTrue = corr(words, dur);
const rShift = corr(shifted, dur);

console.log('');
ok(
  rTrue > 0.9 && rTrue > rShift + 0.15,
  `الترقيم موافق — ارتباط المدة بعدد الكلمات ${rTrue.toFixed(3)}`,
  `والترقيم مزاحًا بآية يعطي ${rShift.toFixed(3)}`
);
console.log(`     مزاحًا بآية للمقارنة: ${rShift.toFixed(3)}`);

if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص — لا يُعتمد هذا القارئ.\n`);
  process.exit(1);
}
console.log(`\n  ✅ ${id} صالح تقنيًا. تبقى مراجعة الحقوق وتوثيقها يدويًا.\n`);
