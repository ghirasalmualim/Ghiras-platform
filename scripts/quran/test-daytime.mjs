#!/usr/bin/env node
/**
 * اختبارات مواقيت الكويت ودعوتَي الوقت.
 *
 * ⚠️ تُقاس على مواقيت معروفة منشورة، لا على ما تُخرجه الدالة نفسها.
 * والاختبار الذي يقارن الدالة بنفسها لا يثبت شيئًا.
 */

import {
  sunTimesKuwait,
  kuwaitNow,
  isFridayBeforeMaghrib,
  isMulkNight,
  MULK_FROM_MIN,
} from "../../.quran-test/engine/daytime.js";

let passed = 0;
let failed = 0;
const ok = (cond, label, extra = "") => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ""}`);
  }
};
const fmt = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

console.log("\n  🕌 اختبارات مواقيت الكويت\n");

// ── مقارنة بمواقيت منشورة (هامش ٥ دقائق) ─────────────────
// ⚠️ الهامش خمس دقائق لا صفر: الحساب الفلكي يختلف قليلًا عن الجداول
// المحلية باختلاف زاوية الأفق المعتمدة، والغرض إظهار زرّ لا أذان.
const known = [
  // [سنة, شهر(٠=يناير), يوم, شروق, غروب]
  [2026, 5, 21, 4 * 60 + 48, 18 * 60 + 52], // الانقلاب الصيفي
  [2026, 11, 21, 6 * 60 + 39, 16 * 60 + 53], // الانقلاب الشتوي
  [2026, 7, 21, 5 * 60 + 19, 18 * 60 + 24], // أغسطس
];

for (const [y, m, d, sr, ss] of known) {
  const t = sunTimesKuwait(y, m, d);
  ok(
    Math.abs(t.sunriseMin - sr) <= 5,
    `شروق ${d}/${m + 1} قريب من المنشور`,
    `حُسب ${fmt(t.sunriseMin)} · المنشور ${fmt(sr)}`
  );
  ok(
    Math.abs(t.sunsetMin - ss) <= 5,
    `غروب ${d}/${m + 1} قريب من المنشور`,
    `حُسب ${fmt(t.sunsetMin)} · المنشور ${fmt(ss)}`
  );
}

// ⚠️ الفرق بين الصيف والشتاء ساعتان — وهو ما يُبطل أي ساعة ثابتة
const summer = sunTimesKuwait(2026, 5, 21).sunsetMin;
const winter = sunTimesKuwait(2026, 11, 21).sunsetMin;
ok(
  summer - winter > 100,
  "⚠️ الغروب يتقلّب أكثر من ١٠٠ دقيقة — فلا تصلح ساعة ثابتة",
  `${fmt(winter)} ← ${fmt(summer)}`
);

// ── الشروق قبل الغروب دائمًا، في كل يوم من السنة ──────────
let sane = true;
for (let m = 0; m < 12; m++)
  for (let d = 1; d <= 28; d++) {
    const t = sunTimesKuwait(2026, m, d);
    if (!(t.sunriseMin > 0 && t.sunriseMin < t.sunsetMin && t.sunsetMin < 24 * 60))
      sane = false;
  }
ok(sane, "كل أيام السنة: ٠ < شروق < غروب < منتصف الليل");

// ── توقيت الكويت من UTC ───────────────────────────────────
// ‏٢٠٢٦-٠٨-٢١ الساعة ٠٠:٠٠ UTC = ٠٣:٠٠ في الكويت، والجمعة
const t = kuwaitNow(new Date(Date.UTC(2026, 7, 21, 0, 0)));
ok(t.minutes === 180, "‏UTC+3 مضافة", String(t.minutes));
ok(t.weekday === 5, "٢١ أغسطس ٢٠٢٦ جمعة", String(t.weekday));

// ⚠️ ويُبنى من UTC لا من حقول الجهاز — وإلا اختلف الحكم باختلاف بلد القارئ
const cairoLike = kuwaitNow(new Date(Date.UTC(2026, 7, 21, 15, 30)));
ok(cairoLike.minutes === 18 * 60 + 30, "١٥:٣٠ UTC = ١٨:٣٠ بالكويت");

// ── الكهف: الجمعة إلى مغربها ──────────────────────────────
const KUWAIT = (h, min = 0) => new Date(Date.UTC(2026, 7, 21, h - 3, min));

ok(isFridayBeforeMaghrib(KUWAIT(6)), "الجمعة صباحًا ⇒ يظهر");
ok(isFridayBeforeMaghrib(KUWAIT(18, 0)), "الجمعة ٦:٠٠ مساءً ⇒ ما زال (الغروب ٦:٢٣)");
ok(!isFridayBeforeMaghrib(KUWAIT(18, 45)), "⚠️ بعد المغرب ⇒ ينطفئ");
ok(!isFridayBeforeMaghrib(KUWAIT(23)), "ليلة الجمعة ⇒ لا يظهر");

// الخميس والسبت لا شيء
const THU = (h) => new Date(Date.UTC(2026, 7, 20, h - 3));
const SAT = (h) => new Date(Date.UTC(2026, 7, 22, h - 3));
ok(!isFridayBeforeMaghrib(THU(10)), "الخميس ⇒ لا يظهر");
ok(!isFridayBeforeMaghrib(SAT(10)), "السبت ⇒ لا يظهر");

// ── الملك: كل ليلة من الثامنة إلى الشروق ──────────────────
ok(MULK_FROM_MIN === 20 * 60, "يبدأ الثامنة مساءً");
ok(!isMulkNight(KUWAIT(19, 59)), "٧:٥٩ مساءً ⇒ لم يبدأ");
ok(isMulkNight(KUWAIT(20, 0)), "٨:٠٠ مساءً ⇒ يظهر");
ok(isMulkNight(KUWAIT(23, 30)), "١١:٣٠ ليلًا ⇒ يظهر");

// ⚠️ أهمّ فحص: عبور منتصف الليل
ok(isMulkNight(new Date(Date.UTC(2026, 7, 21, 21, 1))), "⚠️ ١٢:٠١ بعد منتصف الليل ⇒ يظل");
ok(isMulkNight(new Date(Date.UTC(2026, 7, 22, 1, 0))), "٤:٠٠ فجرًا ⇒ يظل");
ok(!isMulkNight(KUWAIT(6, 0)), "بعد الشروق (٥:٢٠) ⇒ ينطفئ");
ok(!isMulkNight(KUWAIT(12)), "الظهر ⇒ لا يظهر");

/**
 * ⚠️ الدعوتان تجتمعان في نافذةٍ واحدة معلومة: **فجر الجمعة**، من
 * منتصف ليلها إلى شروقها. وذلك صحيحٌ لا خلل — تلك الساعات جمعةٌ
 * وليلٌ معًا، فينطبق عليها الوصفان.
 *
 * ويُفحص هنا **أنها الوحيدة**: لو اجتمعتا في غيرها فثمّة خلل في
 * التوقيت. والاختبار يصف الواقع ولا يمنع ما لم نفكّر فيه.
 */
const overlaps = [];
for (let m = 0; m < 12; m++)
  for (let d = 1; d <= 28; d++)
    for (let min = 0; min < 24 * 60; min += 10) {
      const when = new Date(Date.UTC(2026, m, d, 0, 0) + (min - 180) * 60000);
      if (isFridayBeforeMaghrib(when) && isMulkNight(when))
        overlaps.push({ m, d, min });
    }

ok(overlaps.length > 0, "الدعوتان تجتمعان فعلًا — والنافذة معلومة");

const allFridayDawn = overlaps.every((o) => {
  const when = new Date(Date.UTC(2026, o.m, o.d, 0, 0) + (o.min - 180) * 60000);
  const now = kuwaitNow(when);
  const { sunriseMin } = sunTimesKuwait(now.year, now.month, now.day);
  return now.weekday === 5 && now.minutes < sunriseMin;
});
ok(
  allFridayDawn,
  "⚠️ ولا تجتمعان إلا في فجر الجمعة — من منتصف ليلها إلى شروقها"
);

const latest = Math.max(...overlaps.map((o) => o.min));
ok(latest < 7 * 60, "وآخر اجتماعٍ قبل السابعة صباحًا", fmt(latest));

console.log(`\n  ${passed} نجحت · ${failed} فشلت\n`);
process.exit(failed ? 1 : 0);
