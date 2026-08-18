#!/usr/bin/env node
/**
 * اختبار فصل البسملة — على المصحف كاملًا لا على عيّنة.
 *
 * ما يثبته:
 *   ١) تُرفع إلى سطرها المستقل في ١١٣ سورة — كل السور إلا التوبة
 *   ٢) التوبة لا بسملة لها أصلًا فلا تُرفع ولا تُقحم
 *   ٣) الفاتحة تُرفع **ومعها رقمها ١**: البسملة فيها آية بعدّ حفص،
 *      وهكذا تُرسم في المصحف المطبوع. وسائر السور بلا رقم البتة.
 *   ٤) المقطع الذي يبدأ من وسط السورة لا تُقحم عليه بسملة
 *   ٥) ٢٧:٣٠ فيها البسملة في آخرها ولا تُعامَل كافتتاحية
 *   ٦) لا حرف يُفقد: البسملة المفصولة + باقي الآية = الآية الأصلية
 *   ٧) صورتا الرسم (بشدّة وبغيرها) كلتاهما تُلتقطان
 *
 * الفحص السادس هو الحارس الحقيقي: لو أخطأ الفصل يومًا فأكل حرفًا من
 * كلام الله، يسقط هنا قبل أن يصل إلى طالبة.
 */

import { readFileSync } from 'node:fs';
import { splitOpeningBasmala } from '../../.quran-test/engine/basmala.js';

let failed = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ''}`);
    failed++;
  }
};

console.log('\n  ═══ اختبار فصل البسملة ═══\n');

const raw = readFileSync('src/features/quran/corpus/quran-uthmani.txt', 'utf8');
const bySurah = new Map();
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const a = t.indexOf('|');
  const b = t.indexOf('|', a + 1);
  if (a === -1 || b === -1) continue;
  const surah = Number(t.slice(0, a));
  const ayah = Number(t.slice(a + 1, b));
  if (!Number.isInteger(surah)) continue;
  const list = bySurah.get(surah) ?? [];
  list.push({ surah, ayah, text_uthmani: t.slice(b + 1) });
  bySurah.set(surah, list);
}

// ── ١) و ٢) و ٣) أي السور تُرفع بسملتها ──────────────────────
const raised = [];
const notRaised = [];
const numbered = [];
for (let s = 1; s <= 114; s++) {
  const r = splitOpeningBasmala(bySurah.get(s).slice(0, 3));
  (r.basmala ? raised : notRaised).push(s);
  if (r.basmalaAyahNumber !== null) numbered.push(s);
}
ok(raised.length === 113, `تُرفع في ١١٣ سورة (وُجد ${raised.length})`);
ok(
  notRaised.length === 1 && notRaised[0] === 9,
  `لا تُرفع إلا في التوبة وحدها (وُجد: ${notRaised.join('، ')})`
);
ok(
  numbered.length === 1 && numbered[0] === 1,
  `الرقم لا يُعرض مع البسملة إلا في الفاتحة (وُجد: ${numbered.join('، ')})`
);

// الفاتحة: البسملة ترتفع كاملةً برقمها ١، ولا تتكرر في تدفّق الآيات
const fatiha = splitOpeningBasmala(bySurah.get(1));
ok(
  fatiha.basmala === bySurah.get(1)[0].text_uthmani &&
    fatiha.basmalaAyahNumber === 1 &&
    fatiha.ayahs.length === 6 &&
    fatiha.ayahs[0].ayah === 2,
  'الفاتحة: البسملة آية ١ في سطرها، والتدفّق يبدأ من الآية ٢ بلا تكرار'
);

// التوبة: لا بسملة تُقحم
const tawbah = splitOpeningBasmala(bySurah.get(9).slice(0, 2));
ok(
  tawbah.basmala === null &&
    tawbah.basmalaAyahNumber === null &&
    tawbah.ayahs[0].text_uthmani === bySurah.get(9)[0].text_uthmani,
  'التوبة: لا بسملة تُقحم ولا نص يتغيّر'
);

// ── ٤) مقطع من وسط السورة ────────────────────────────────────
let midOk = true;
let midErr = '';
for (const [s, from] of [[2, 255], [18, 10], [36, 5], [112, 2], [67, 3]]) {
  const seg = bySurah.get(s).filter((a) => a.ayah >= from && a.ayah <= from + 1);
  const r = splitOpeningBasmala(seg);
  if (r.basmala !== null || r.ayahs[0].text_uthmani !== seg[0].text_uthmani) {
    midOk = false;
    midErr = `${s}:${from}`;
  }
}
ok(midOk, 'المقطع من وسط السورة: لا بسملة تُقحم ولا نص يتغيّر', midErr);

// ── ٥) ٢٧:٣٠ ────────────────────────────────────────────────
const naml = bySurah.get(27).filter((a) => a.ayah === 30);
const namlR = splitOpeningBasmala(naml);
ok(
  namlR.basmala === null && namlR.ayahs[0].text_uthmani === naml[0].text_uthmani,
  '٢٧:٣٠ فيها البسملة في آخرها ولا تُعامَل كافتتاحية'
);

// ── ٦) لا حرف يُفقد ─────────────────────────────────────────
let lossless = true;
let lossErr = '';
for (let s = 1; s <= 114; s++) {
  const original = bySurah.get(s)[0].text_uthmani;
  const r = splitOpeningBasmala(bySurah.get(s).slice(0, 1));
  // الفاتحة: البسملة هي الآية كلها فلا يبقى بعدها نص في التدفّق
  const rebuilt = !r.basmala
    ? r.ayahs[0].text_uthmani
    : r.ayahs.length === 0
      ? r.basmala
      : `${r.basmala} ${r.ayahs[0].text_uthmani}`;
  if (rebuilt !== original) {
    lossless = false;
    lossErr = `سورة ${s}:\n     الأصل  : ${original}\n     المُعاد : ${rebuilt}`;
    break;
  }
}
ok(lossless, 'لا حرف يُفقد: البسملة + باقي الآية = الآية الأصلية (١١٤/١١٤)', lossErr);

// ── ٧) صورتا الرسم ──────────────────────────────────────────
const forms = new Set();
for (let s = 1; s <= 114; s++) {
  const { basmala } = splitOpeningBasmala(bySurah.get(s).slice(0, 1));
  if (basmala) forms.add(basmala);
}
ok(
  forms.size === 2,
  `الصورتان الرسميتان كلتاهما مُلتقَطتان (وُجد ${forms.size})`,
  [...forms].join('  |  ')
);
// صورة الإدغام: الباء تحمل شدّة (U+0651) قبل الكسرة، لأن السورة قبلها
// تنتهي بباء فتُدغم عند الوصل. نفحص برموز المحارف لا بحروف مكتوبة:
// ترتيب العلامات فوق الحرف لا يظهر للعين وسهل أن يُكتب مقلوبًا.
const SHADDA = 0x0651;
const shadda = [];
for (let s = 1; s <= 114; s++) {
  const { basmala } = splitOpeningBasmala(bySurah.get(s).slice(0, 1));
  if (basmala && [...basmala][1]?.codePointAt(0) === SHADDA) shadda.push(s);
}
ok(
  shadda.length === 2 && shadda.includes(95) && shadda.includes(97),
  `صورة الإدغام في التين والقدر (وُجد: ${shadda.join('، ')})`
);

if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص.\n`);
  process.exit(1);
}
console.log('\n  ✅ فصل البسملة سليم.\n');
