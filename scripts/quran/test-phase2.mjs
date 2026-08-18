#!/usr/bin/env node
/**
 * اختبارات المرحلة ٢ — المراجعة والإتقان والأنشطة والخطة.
 *
 * تغطّي البنود التي طلبتها هيّسة في القسم ٢٤، والأهم فيها اثنان:
 *   • أن التلميح الكامل لا يُعدّ إتقانًا.
 *   • أن أي حرف يظهر للطالب — صحيحًا أو خاطئًا — منقول من المصحف
 *     المرجعي، فلا نص مولَّد ولا كلمات مخلوطة.
 */

import { readFileSync } from 'node:fs';
import {
  applySession,
  attemptQuality,
  sessionQuality,
  isDue,
  isMastered,
  intervalOf,
  addDays,
  needsStrengthening,
  MAX_BOX,
} from '../../.quran-test/engine/review.js';
import {
  makeMissingWord,
  makeCompleteAyah,
  makeNextAyah,
  makeListenIdentify,
  buildSession,
  rankActivities,
} from '../../.quran-test/engine/activities.js';
import { buildPlan, todaySlice, buildDailyTask, welcomeBack, dueToday } from '../../.quran-test/engine/planner.js';
import { splitOpeningBasmala } from '../../.quran-test/engine/basmala.js';

let failed = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ''}`);
    failed++;
  }
};

console.log('\n  ═══ اختبارات المرحلة ٢ ═══\n');

// ── المصحف المرجعي، للتحقق من أن كل نص معروض منه ─────────────
const raw = readFileSync('src/features/quran/corpus/quran-uthmani.txt', 'utf8');
const bySurah = new Map();
const allWords = new Set();
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const a = t.indexOf('|');
  const b = t.indexOf('|', a + 1);
  if (a === -1 || b === -1) continue;
  const surah = Number(t.slice(0, a));
  const ayah = Number(t.slice(a + 1, b));
  if (!Number.isInteger(surah)) continue;
  const text = t.slice(b + 1);
  const list = bySurah.get(surah) ?? [];
  list.push({ surah, ayah, text_uthmani: text });
  bySurah.set(surah, list);
  for (const w of text.split(/\s+/)) allWords.add(w);
}
const seg = (s, from, to) => bySurah.get(s).filter((a) => a.ayah >= from && a.ayah <= to);

console.log('  ── المراجعة المتباعدة ──');

// ١) موعد المراجعة القادمة
const s1 = applySession(null, 3, '2026-08-18');
ok(s1.box === 1 && s1.dueOn === '2026-08-19', `أول إتقان ← الصندوق ١ والموعد غدًا (${s1.dueOn})`);

// ٢) زيادة الفاصل بعد الإتقان المتكرر
let s = null;
const seen = [];
let day = '2026-08-18';
for (let i = 0; i < 5; i++) {
  s = applySession(s, 3, day);
  seen.push(`ص${s.box}=${intervalOf(s.box)}ي`);
  day = s.dueOn;
}
ok(
  s.box === MAX_BOX && intervalOf(s.box) === 30,
  `الفاصل يتباعد مع الإتقان: ${seen.join(' → ')}`
);

// ٣) تقديم الموعد بعد الخطأ
const before = { ...s };
const after = applySession(s, 0, '2026-10-01');
ok(
  after.box === before.box - 1 && intervalOf(after.box) < intervalOf(before.box),
  `الخطأ يقرّب الموعد: صندوق ${before.box}(${intervalOf(before.box)}ي) ← ${after.box}(${intervalOf(after.box)}ي)`
);

// ٤) التلميح الكامل ليس إتقانًا
ok(
  attemptQuality({ correct: true, attempts: 1, hintLevel: 3 }) === 0,
  'كشف الحل كاملًا = جودة صفر ولو كانت الإجابة صحيحة'
);
ok(
  attemptQuality({ correct: true, attempts: 1, hintLevel: 1 }) === 1,
  'تلميح خفيف = جودة ١ (مراجعة نافعة لا إتقان)'
);
const hinted = applySession({ box: 2, distinctDays: 2, lastReviewedOn: '2026-08-17', dueOn: '2026-08-18' }, 1, '2026-08-18');
ok(hinted.box === 2, 'الجلسة بتلميح لا ترفع الصندوق');
const perfect = applySession({ box: 2, distinctDays: 2, lastReviewedOn: '2026-08-17', dueOn: '2026-08-18' }, 3, '2026-08-18');
ok(perfect.box === 3, 'الجلسة بلا تلميح ترفع الصندوق');

// ٥) جودة الجلسة = الأدنى لا المتوسط
ok(
  sessionQuality([
    { correct: true, attempts: 1, hintLevel: 0 },
    { correct: true, attempts: 1, hintLevel: 0 },
    { correct: false, attempts: 3, hintLevel: 0 },
  ]) === 0,
  'جلسة فيها خطأ واحد = جودة صفر (الأدنى لا المتوسط)'
);

// ٦) الإتقان يتطلب أيامًا مختلفة
let sameDay = null;
for (let i = 0; i < 6; i++) sameDay = applySession(sameDay, 3, '2026-08-18');
ok(
  sameDay.box === MAX_BOX && sameDay.distinctDays === 1 && !isMastered(sameDay),
  `ستّ جلسات في يوم واحد لا تُعدّ إتقانًا (أيام مختلفة = ${sameDay.distinctDays})`
);
let manyDays = null;
let d = '2026-08-18';
for (let i = 0; i < 5; i++) { manyDays = applySession(manyDays, 3, d); d = manyDays.dueOn; }
ok(isMastered(manyDays), `النجاح في ${manyDays.distinctDays} أيام مختلفة = إتقان`);

// ٧) الاستحقاق
ok(isDue({ ...s1, dueOn: '2026-08-19' }, '2026-08-19'), 'المستحق اليوم يظهر');
ok(!isDue({ ...s1, dueOn: '2026-08-25' }, '2026-08-19'), 'غير المستحق لا يظهر');
ok(
  needsStrengthening({ box: 1, distinctDays: 2, lastReviewedOn: null, dueOn: '2026-08-19' }),
  'المقطع المتعثّر يظهر في «يحتاج مراجعة بسيطة»'
);

console.log('\n  ── الخطة ──');

// ٨) الخطة لا تجعل آخر يوم حفظًا جديدًا
const plan = buildPlan(67, 1, 12, '2026-08-21', '2026-08-18');
const last = plan.days[plan.days.length - 1];
ok(plan.days.length === 4, `أربعة أيام متبقية ← ${plan.days.length} أيام في الخطة`);
ok(last.kind === 'final_review' && last.from_ayah === null, 'آخر يوم مراجعة نهائية بلا حفظ جديد');
ok(
  plan.days[0].kind === 'memorize' && plan.days[1].review_from !== null,
  'اليوم الأول حفظ، وما بعده حفظ جديد مع ربط ما سبق'
);

// ٩) لا تتجاوز الخطة نطاق الآيات
const covered = plan.days.filter((x) => x.from_ayah).flatMap((x) => [x.from_ayah, x.to_ayah]);
ok(
  Math.min(...covered) >= 1 && Math.max(...covered) <= 12,
  `الخطة داخل المدى ١–١٢ (${Math.min(...covered)}–${Math.max(...covered)})`
);

// ١٠) إعادة الجدولة بعد الغياب
const afterGap = buildPlan(67, 1, 12, '2026-08-21', '2026-08-20');
ok(
  afterGap.days.length === 2 && afterGap.days[0].date === '2026-08-20',
  `الغياب يعيد التوزيع تلقائيًا على ما تبقّى (${afterGap.days.length} يومان)`
);
ok(
  buildPlan(67, 1, 12, '2026-08-19', '2026-08-18').overloaded,
  'الكمية غير الواقعية تُعلَّم بـ overloaded بدل حشرها بصمت'
);
ok(buildPlan(67, 1, 12, '2026-08-15', '2026-08-18').overdue, 'انقضاء الموعد يُعلَّم بـ overdue');
ok(
  buildPlan(67, 1, 12, '2026-08-25', '2026-08-18', 12).days.length === 0,
  'ما أُتقن كاملًا لا يُعاد حفظه'
);

// ١١) العودة بعد انقطاع — بلا عتاب
ok(welcomeBack('2026-08-14', '2026-08-18')?.includes('سعداء بعودتك'), 'رسالة العودة مرحّبة');
ok(welcomeBack('2026-08-18', '2026-08-18') === null, 'لا رسالة عودة لمن لم ينقطع');
const msgs = [welcomeBack('2026-08-10', '2026-08-18')];
ok(
  !msgs.some((m) => /خسر|تأخّر|تأخر|فشل|ضعيف/.test(m ?? '')),
  'لا لفظ سلبي في رسالة العودة'
);

// ١٢) مهمة اليوم
const ar = (n) => String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[Number(x)]);
const task = buildDailyTask(plan, [{ surah: 112, from_ayah: 1, to_ayah: 4, state: { box: 1, distinctDays: 1, lastReviewedOn: null, dueOn: '2026-08-18' } }], '2026-08-18', () => 'الملك', ar);
ok(task.items.length >= 3 && task.minutes > 0, `مهمة اليوم فيها ${task.items.length} عناصر و≈${task.minutes} دقائق`);
ok(task.items[0].icon === '🔄', 'المراجعة المستحقة أولًا — المؤجَّل منها يُنسى');
ok(buildDailyTask(null, [], '2026-08-18', () => '', ar).items.length === 0, 'لا مهمة لمن لا شيء عليه');

console.log('\n  ── الأنشطة ──');

const src = { segment: seg(112, 1, 4), pool: seg(114, 1, 6) };

// ١٣) الكلمة المفقودة
const mw = makeMissingWord(src, 7);
ok(mw !== null, 'الكلمة المفقودة تُولَّد');
ok(
  mw.words.join(' ') === bySurah.get(112).find((a) => a.ayah === mw.ayah).text_uthmani,
  'كلمات الآية بترتيبها الأصلي حرفًا بحرف — لا خلط ولا تقطيع'
);
ok(
  mw.choices.find((c) => c.correct).text === mw.words[mw.blankIndex],
  'الإجابة الصحيحة هي الكلمة التي في موضعها بالضبط'
);
ok(
  mw.choices.every((c) => allWords.has(c.text)),
  'كل الخيارات كلمات حقيقية من المصحف — لا كلمة مولَّدة'
);

// ١٤) ما الآية التالية
const na = makeNextAyah(src, 11);
ok(na !== null, '«ما الآية التالية؟» تُولَّد');
const trueNext = bySurah.get(112).find((a) => a.ayah === na.ayah + 1);
ok(
  na.choices.find((c) => c.correct).text === trueNext.text_uthmani,
  'الإجابة الصحيحة هي الآية التالية فعلًا من النص المرجعي'
);
ok(na.ayah + 1 <= 4, 'لا يُسأل إلا عن موضع تاليه داخل المقطع');

// ١٥) لا آية من خارج المقطع تكون هي الجواب
let outside = false;
for (let s2 = 1; s2 <= 5; s2++) {
  const q = makeNextAyah({ segment: seg(112, 1, 3) }, s2);
  if (q && (q.ayah < 1 || q.ayah + 1 > 3)) outside = true;
}
ok(!outside, 'موضوع السؤال لا يخرج عن المدى المحدد أبدًا');

// ١٦) أكمل الآية واسمع وحدّد
const long = { segment: seg(2, 1, 8) };
const ca = makeCompleteAyah(long, 3);
ok(ca !== null, '«أكمل الآية» تُولَّد');
const full = bySurah.get(2).find((a) => a.ayah === ca.ayah).text_uthmani;
ok(
  full.startsWith(ca.head) && full === `${ca.head} ${ca.choices.find((c) => c.correct).text}`,
  'الصدر + العجز الصحيح = الآية الأصلية حرفًا بحرف'
);
const li = makeListenIdentify(src, 5);
ok(li !== null && li.choices.find((c) => c.correct).text === bySurah.get(112).find((a) => a.ayah === li.ayah).text_uthmani, '«اسمع وحدّد» جوابها الآية المتلوّة نفسها');

// ١٧) كل نص معروض من المصحف
const allTexts = new Set();
for (let s3 = 0; s3 < 12; s3++) {
  for (const q of buildSession(src, {}, s3, 4)) {
    for (const c of q.choices) allTexts.add(c.text);
    if (q.kind === 'complete_ayah') allTexts.add(q.head);
    if (q.kind === 'next_ayah') allTexts.add(q.promptText);
  }
}
const corpusText = raw;
const notFound = [...allTexts].filter((t) => !corpusText.includes(t));
ok(
  notFound.length === 0,
  `كل نص معروض (${allTexts.size} نصًا) موجود حرفيًا في ملف المصحف`,
  notFound.slice(0, 2).join(' | ')
);

// ١٧ب) البسملة لا تتسرّب إلى الأنشطة
// عيب أمسكناه بالتجربة: خيار «اسمع وحدّد» كان يعرض البسملة ملتصقة
// بالآية الأولى بينما الصوت يتلو الآية وحدها.
const withBasmala = seg(112, 1, 4);
const split = splitOpeningBasmala(withBasmala).ayahs;
const bas = 'بِسْمِ';
ok(
  withBasmala[0].text_uthmani.startsWith(bas) && !split[0].text_uthmani.startsWith(bas),
  'النص المخزَّن يبدأ بالبسملة، والمعروض للأنشطة لا يبدأ بها'
);
let leaked = false;
for (let s4 = 0; s4 < 10; s4++) {
  for (const q of buildSession({ segment: split }, {}, s4, 4)) {
    for (const c of q.choices) if (c.text.startsWith(bas)) leaked = true;
    if (q.kind === 'missing_word' && q.words.some((w) => w.startsWith(bas))) leaked = true;
    if (q.kind === 'next_ayah' && q.promptText.startsWith(bas)) leaked = true;
  }
}
ok(!leaked, 'ولا كلمة من البسملة تظهر في سؤال ولا خيار ولا تُخفى');

// ١٨) الحتمية
const a1 = JSON.stringify(buildSession(src, {}, 42, 4));
const a2 = JSON.stringify(buildSession(src, {}, 42, 4));
ok(a1 === a2, 'التوليد حتمي: نفس البذرة تعطي نفس الأسئلة');

// ١٩) اختيار النشاط بقواعد صريحة
const ranked = rankActivities({ next_ayah: { wrong: 5, total: 5 }, missing_word: { wrong: 0, total: 5 } }, 1);
ok(ranked[0] === 'next_ayah', 'النشاط الأكثر خطأً يتقدّم — قاعدة صريحة لا ذكاء اصطناعي');
ok(
  ranked.indexOf('missing_word') === ranked.length - 1,
  'وما يجيده الطالب يتأخّر'
);

// ٢٠) المقطع القصير لا يُفشل الحصة
const tiny = { segment: seg(108, 1, 1) };
const tinySession = buildSession(tiny, {}, 9, 4);
ok(
  tinySession.every((q) => q.kind !== 'next_ayah' && q.kind !== 'listen_identify'),
  'مقطع من آية واحدة يتخطّى الأنشطة التي لا تصلح له بدل أن يفشل'
);

if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص.\n`);
  process.exit(1);
}
console.log('\n  ✅ المرحلة ٢ سليمة.\n');
