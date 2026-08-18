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

const OUT = 'supabase/quran/2026-08-19-primary-curriculum.sql';

let failed = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ''}`);
    failed++;
  }
};

console.log('\n  ═══ التحقق من منهج الابتدائي ═══\n');

// ── عدد آيات كل سورة من ملف المصحف نفسه ─────────────────────
const surahs = JSON.parse(
  readFileSync('src/features/quran/corpus/surahs.json', 'utf8')
);
const ayahCount = new Map(surahs.map((s) => [s.number, s.ayah_count]));
// الأسماء من المصحف وحده — لا قائمة ثانية تنحرف عنه
const SURAH_NAMES = Object.fromEntries(surahs.map((s) => [s.number, s.name_ar]));

// ── ١) حدود كل درس ──────────────────────────────────────────
const outOfBounds = PRIMARY_TERM1.filter((r) => {
  const max = ayahCount.get(r.surah);
  return !max || r.from_ayah < 1 || r.to_ayah > max || r.to_ayah < r.from_ayah;
});
ok(
  outOfBounds.length === 0,
  `كل درس داخل حدود سورته (${PRIMARY_TERM1.length}/${PRIMARY_TERM1.length})`,
  outOfBounds
    .slice(0, 3)
    .map((r) => `${SURAH_NAMES[r.surah]} ${r.from_ayah}–${r.to_ayah} والسورة ${ayahCount.get(r.surah)} آية`)
    .join(' | ')
);

// ── ٢) كل سورة مذكورة موجودة في المصحف ──────────────────────
const unknown = [...new Set(PRIMARY_TERM1.map((r) => r.surah))].filter((n) => !ayahCount.has(n));
ok(unknown.length === 0, `كل السور المذكورة موجودة في المصحف`, unknown.join('، '));

// ── ٣) الصفوف الابتدائية وحدها ──────────────────────────────
const grades = [...new Set(PRIMARY_TERM1.map((r) => r.grade_slug))].sort();
ok(
  grades.length === 5 && grades.every((g) => /^grade-[1-5]$/.test(g)),
  `الصفوف الابتدائية وحدها: ${grades.join('، ')}`
);
ok(
  PRIMARY_TERM1.every((r) => r.term === 1),
  'الفصل الأول وحده — لا بيانات فصل ثانٍ'
);

// ── ٤) تسلسل دروس الحفظ ────────────────────────────────────
// نفحص التسلسل لا التغطية الكاملة: الفصل الأول قد يغطّي جزءًا من
// سورة والباقي في الثاني (سورة الإنسان: ١١ من ٣١). فالمطلوب أن يبدأ
// المقرر من الآية ١ وأن يتصل بلا فجوة ولا تداخل حتى حيث يقف.
const gaps = [];
const partial = [];
for (const grade of grades) {
  const rows = PRIMARY_TERM1.filter((r) => r.grade_slug === grade && r.requirement === 'memorize');
  const bySurah = new Map();
  for (const r of rows) {
    const list = bySurah.get(r.surah) ?? [];
    list.push(r);
    bySurah.set(r.surah, list);
  }
  for (const [surah, list] of bySurah) {
    const sorted = [...list].sort((a, b) => a.from_ayah - b.from_ayah);
    let expect = 1;
    for (const r of sorted) {
      if (r.from_ayah !== expect) {
        gaps.push(`${grade} ${SURAH_NAMES[surah]}: توقّعنا ${expect} فوجدنا ${r.from_ayah}`);
        break;
      }
      expect = r.to_ayah + 1;
    }
    const total = ayahCount.get(surah);
    if (expect - 1 < total) partial.push(`${SURAH_NAMES[surah]} ${expect - 1}/${total}`);
  }
}
ok(gaps.length === 0, 'دروس الحفظ متصلة من الآية ١ بلا فجوة ولا تداخل', gaps.slice(0, 3).join(' | '));
if (partial.length) console.log(`  ℹ️  سور مغطّاة جزئيًا (الباقي في الفصل الثاني): ${partial.join('، ')}`);

// ── ٥) لا نص قرآني في البيانات ──────────────────────────────
const arabicText = PRIMARY_TERM1.filter((r) => /[ًٌٍَُِّْٰ]/.test(r.title));
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
for (const r of PRIMARY_TERM1) {
  const list = byGrade.get(r.grade_slug) ?? [];
  list.push(r);
  byGrade.set(r.grade_slug, list);
}

const lines = [];
lines.push(`-- ============================================================
-- Quran curriculum — primary stage, term 1
--
-- GENERATED. Do not edit by hand.
-- Source of truth: src/features/quran/curriculum/primary-term1.ts
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
-- Only primary grades (grade-1..grade-5) and only term 1. Middle and
-- secondary stages are deliberately absent and await their own data.
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

for (const [grade, rows] of [...byGrade].sort()) {
  lines.push(`\n-- ── ${grade} — ${rows.length} lessons ──`);
  lines.push(
    'insert into public.quran_curriculum_lesson\n  (stage_slug, grade_slug, term, title, surah, from_ayah, to_ayah, requirement, sort_order, is_visible)\nvalues'
  );
  const values = rows.map((r, i) =>
    `  ('${PRIMARY_STAGE_SLUG}', '${r.grade_slug}', ${r.term}, '${esc(r.title)}', ${r.surah}, ${r.from_ayah}, ${r.to_ayah}, '${r.requirement}', ${i + 1}, true)`
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
for (const [grade, rows] of [...byGrade].sort()) {
  const mem = rows.filter((r) => r.requirement === 'memorize').length;
  const rev = rows.length - mem;
  const surahList = [...new Set(rows.map((r) => SURAH_NAMES[r.surah]))].join('، ');
  console.log(`  ${grade}: ${rows.length} درسًا (${mem} حفظ + ${rev} مراجعة) — ${surahList}`);
}
console.log(`\n  المجموع: ${PRIMARY_TERM1.length} درسًا`);
console.log(`  ✅ كُتب ${OUT}\n`);
