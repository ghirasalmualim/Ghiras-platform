#!/usr/bin/env node
/**
 * يتحقق من منهج الابتدائي ثم يُولّد ملف SQL لإدخاله.
 *
 * التحقق يسبق التوليد دائمًا: لا يُكتب سطر SQL واحد قبل أن تمرّ كل
 * الفحوصات. وأهمها فحص الحدود — أن كل درس داخل حدود سورته فعلًا،
 * بالمقارنة مع ملف المصحف نفسه لا مع جدول مكتوب بيدنا.
 *
 *   npm run quran:curriculum
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { PRIMARY_TERM1, PRIMARY_STAGE_SLUG } from '../../.quran-test/curriculum/primary-term1.js';
import { MIDDLE_TERM1, MIDDLE_STAGE_SLUG } from '../../.quran-test/curriculum/middle-term1.js';

/** المرحلة التي ينتمي إليها كل صف — تُقرأ من مصدر واحد لا تُخمَّن. */
const STAGE_OF = new Map();
for (const r of PRIMARY_TERM1) STAGE_OF.set(r.grade_slug, PRIMARY_STAGE_SLUG);
for (const r of MIDDLE_TERM1) STAGE_OF.set(r.grade_slug, MIDDLE_STAGE_SLUG);

/** كل الدروس معًا — المولّد لا يعرف «ابتدائي» ولا يفترضه. */
const ALL = [...PRIMARY_TERM1, ...MIDDLE_TERM1];

const OUT = 'supabase/quran/2026-08-19-curriculum-term1.sql';

let failed = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ''}`);
    failed++;
  }
};

console.log('\n  ═══ التحقق من منهج القرآن ═══\n');

// ── عدد آيات كل سورة من ملف المصحف نفسه ─────────────────────
const surahs = JSON.parse(
  readFileSync('src/features/quran/corpus/surahs.json', 'utf8')
);
const ayahCount = new Map(surahs.map((s) => [s.number, s.ayah_count]));
// الأسماء من المصحف وحده — لا قائمة ثانية تنحرف عنه
const SURAH_NAMES = Object.fromEntries(surahs.map((s) => [s.number, s.name_ar]));

// ── ١) حدود كل درس ──────────────────────────────────────────
const outOfBounds = ALL.filter((r) => {
  const max = ayahCount.get(r.surah);
  return !max || r.from_ayah < 1 || r.to_ayah > max || r.to_ayah < r.from_ayah;
});
ok(
  outOfBounds.length === 0,
  `كل درس داخل حدود سورته (${ALL.length}/${ALL.length})`,
  outOfBounds
    .slice(0, 3)
    .map((r) => `${SURAH_NAMES[r.surah]} ${r.from_ayah}–${r.to_ayah} والسورة ${ayahCount.get(r.surah)} آية`)
    .join(' | ')
);

// ── ٢) كل سورة مذكورة موجودة في المصحف ──────────────────────
const unknown = [...new Set(ALL.map((r) => r.surah))].filter((n) => !ayahCount.has(n));
ok(unknown.length === 0, `كل السور المذكورة موجودة في المصحف`, unknown.join('، '));

// ── ٣) الصفوف الابتدائية وحدها ──────────────────────────────
const grades = [...new Set(ALL.map((r) => r.grade_slug))].sort(
  (a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])
);
ok(
  grades.length === 9 && grades.every((g) => /^grade-[1-9]$/.test(g)),
  `الصفوف: ${grades.join('، ')} — ولا صف ثانوي`
);
// الثانوي مؤجَّل بقرارها؛ ظهور صف ١٠+ هنا يعني تسرّبًا لا نريده
ok(
  !ALL.some((r) => Number(r.grade_slug.split('-')[1]) > 9),
  'لا بيانات ثانوية — المرحلة مؤجَّلة وربما تُلغى'
);
ok(
  ALL.every((r) => r.term === 1),
  'الفصل الأول وحده — لا بيانات فصل ثانٍ'
);

// ── ٤) لا تداخل بين دروس الحفظ ─────────────────────────────
//
// الحارس هنا **التداخل** لا الفجوة، بعد أن أخطأتُ الافتراض مرتين:
//   • سورة الإنسان مقرّرها ١١ من ٣١ والباقي في الفصل الثاني.
//   • الصف التاسع يدرس من البقرة آية الكرسي وخواتيمها فقط، لا السورة
//     من أولها — فالمنتخبات مقصودة لا فجوة.
// أما أن يغطّي درسان آيةً واحدة فخطأ في كل حال: تُحسب مرتين وتربك
// المراجعة المتباعدة.
const overlaps = [];
const gaps = [];
for (const grade of grades) {
  const rows = ALL.filter((r) => r.grade_slug === grade && r.requirement === 'memorize');
  const bySurah = new Map();
  for (const r of rows) {
    const list = bySurah.get(r.surah) ?? [];
    list.push(r);
    bySurah.set(r.surah, list);
  }
  for (const [surah, list] of bySurah) {
    const sorted = [...list].sort((a, b) => a.from_ayah - b.from_ayah);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from_ayah <= sorted[i - 1].to_ayah)
        overlaps.push(
          `${grade} ${SURAH_NAMES[surah]}: ${sorted[i - 1].from_ayah}–${sorted[i - 1].to_ayah} و ${sorted[i].from_ayah}–${sorted[i].to_ayah}`
        );
      else if (sorted[i].from_ayah > sorted[i - 1].to_ayah + 1)
        gaps.push(
          `${grade} ${SURAH_NAMES[surah]}: ${sorted[i - 1].to_ayah}→${sorted[i].from_ayah}`
        );
    }
  }
}
ok(overlaps.length === 0, 'لا آية يغطّيها درسان في الصف نفسه', overlaps.slice(0, 3).join(' | '));
if (gaps.length)
  console.log(`  ℹ️  فجوات (منتخبات أو باقي الفصل الثاني): ${gaps.join('، ')}`);

// ── ٥) لا نص قرآني في البيانات ──────────────────────────────
const arabicText = ALL.filter((r) => /[ًٌٍَُِّْٰ]/.test(r.title));
ok(
  arabicText.length === 0,
  'لا نص قرآني مشكَّل في أسماء الدروس — العناوين وصفية فقط',
  arabicText.slice(0, 2).map((r) => r.title).join(' | ')
);

if (failed) {
  console.error(`\n  ⛔️ سقط ${failed} فحص — لم يُولَّد SQL.\n`);
  process.exit(1);
}

// ── التوليد ─────────────────────────────────────────────────
const esc = (s) => s.replace(/'/g, "''");
const byGrade = new Map();
for (const r of ALL) {
  const list = byGrade.get(r.grade_slug) ?? [];
  list.push(r);
  byGrade.set(r.grade_slug, list);
}

const lines = [];
lines.push(`-- ============================================================
-- Quran curriculum — primary and middle stages, term 1
--
-- GENERATED. Do not edit by hand.
-- Source of truth: src/features/quran/curriculum/{primary,middle}-term1.ts
-- Regenerate with: npm run quran:curriculum
--
-- Extracted from the official Ministry of Education distribution plan
-- for 2025/2026 (approved 16/9/2025), read page by page from the
-- scanned file and reviewed by the platform owner before entry.
--
-- No Quranic text is stored here. A lesson carries only a surah and an
-- ayah range; the text always comes from the platform's reference
-- mushaf. The curriculum tells us WHICH verses, never WHAT they say.
--
-- Primary (grade-1..5) and middle (grade-6..9), term 1 only.
-- Secondary is deliberately absent: the owner deferred it and may drop
-- it, so no secondary stage and no grades 10-12 exist in Ghiras.
--
-- Safe to run more than once: a unique key on
-- (grade_slug, term, sort_order) turns re-runs into updates.
--
-- Comments in English on purpose: Arabic text after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

-- Idempotency key. Without it a second run would duplicate every row.
create unique index if not exists quran_curriculum_lesson_key
  on public.quran_curriculum_lesson (grade_slug, term, sort_order);
`);

const sortedGrades = [...byGrade].sort(
  (a, b) => Number(a[0].split('-')[1]) - Number(b[0].split('-')[1])
);
for (const [grade, rows] of sortedGrades) {
  lines.push(`\n-- ── ${grade} (${STAGE_OF.get(grade)}) — ${rows.length} lessons ──`);
  lines.push(
    'insert into public.quran_curriculum_lesson\n  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)\nvalues'
  );
  const values = rows.map((r, i) =>
    `  ('${STAGE_OF.get(r.grade_slug)}', '${r.grade_slug}', ${r.term}, '${esc(r.title)}', ${r.surah}, ${r.from_ayah}, ${r.to_ayah}, '${r.requirement}', ${i + 1}, true)`
  );
  lines.push(values.join(',\n'));
  lines.push(`on conflict (grade_slug, term, sort_order) do update set
  stage_slug  = excluded.stage_slug,
  title       = excluded.title,
  surah       = excluded.surah,
  from_ayah   = excluded.from_ayah,
  to_ayah     = excluded.to_ayah,
  requirement = excluded.requirement,
  is_visible  = excluded.is_visible;`);
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

console.log(`\n  ── الخلاصة ──`);
for (const [grade, rows] of sortedGrades) {
  const mem = rows.filter((r) => r.requirement === 'memorize').length;
  const rev = rows.length - mem;
  const surahList = [...new Set(rows.map((r) => SURAH_NAMES[r.surah]))].join('، ');
  console.log(`  ${grade}: ${rows.length} درسًا (${mem} حفظ + ${rev} مراجعة) — ${surahList}`);
}
console.log(`\n  المجموع: ${ALL.length} درسًا`);
console.log(`  ✅ كُتب ${OUT}\n`);
