#!/usr/bin/env node
/**
 * اختبارات موضع القراءة — «تابع من حيث وقفت».
 *
 * أهم ما يُحرس: PAGE OPEN ≠ READING PROGRESS — فتحُ صفحةٍ لا يدوس
 * الموضع، والقراءة لا تمشي للخلف بغير قصدٍ صريح، ومنتصف الليل
 * بريء بنيويًا (لا day_key في المسار)، والدمج المحافظ لا يخمّن
 * عمرَ سجلٍّ قديم بلا طابع.
 */

import { readFileSync } from "node:fs";
import { shouldSaveResume, newerResume } from "../../.quran-test/engine/resume.js";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };
const P = (surah, ayah, updated_at) => ({ surah, ayah, ...(updated_at !== undefined ? { updated_at } : {}) });

console.log("\n═══ ١ · الحارس: لا رجوع بغير قصد ═══");
{
  const at22 = P(2, 22);
  check("١) البقرة ٢٢ ← لمس ١ = يبقى ٢٢", !shouldSaveResume(at22, { surah: 2, ayah: 1 }));
  check("٥) البقرة ٢٢ ← لمس ١٠ = يبقى ٢٢", !shouldSaveResume(at22, { surah: 2, ayah: 10 }));
  check("نفس الآية لا تُعاد كتابتها", !shouldSaveResume(at22, { surah: 2, ayah: 22 }));
  check("٤) لمس ٢٥ = يتقدم", shouldSaveResume(at22, { surah: 2, ayah: 25 }));
  check("٦) «انتهيت» عند ١٠ = force يرجع قصدًا", shouldSaveResume(at22, { surah: 2, ayah: 10 }, true));
  check("٣) تفاعلٌ في آل عمران ٥ = يتغير (المصدر تفاعل بالعقد)", shouldSaveResume(at22, { surah: 3, ayah: 5 }));
  check("أول تفاعلٍ بلا موضعٍ سابق يُسجل", shouldSaveResume(null, { surah: 67, ayah: 1 }));
}

console.log("═══ ٢ · فتح الصفحة لا يحفظ — من النص المنشور ═══");
{
  const s = readFileSync("src/features/quran/components/StudyScreen.tsx", "utf8");
  // ⚠️ ٢) و١٠): الـmount (والخطة التي تفتح شاشة) لا يستدعي الحفظ أصلًا
  const mountBlock = s.slice(s.indexOf("المقطع تغيّر"), s.indexOf("void isGuest()"));
  check("٢+١٠) الـmount لا يستدعي saveLastPosition إطلاقًا", !mountBlock.includes("saveLastPosition("));
  check("والقرار موثق مكانه", mountBlock.includes("PAGE OPEN ≠ READING PROGRESS"));
  check("«استمع من هنا» يسجل الآية", s.includes("playFrom.current?.(a);") && /playFrom\.current\?\.\(a\);[\s\S]{0,200}saveLastPosition\(surah\.number, a\)/.test(s));
  check("«انتهيت هنا» force صريح", s.includes("saveLastPosition(surah.number, ayah + 1, { force: true })"));
  check("وإتمام السورة force كذلك", s.includes("saveLastPosition(surah.number + 1, 1, { force: true })"));

  const p = readFileSync("src/features/quran/data/progress.ts", "utf8");
  check("الحفظ محروس بـshouldSaveResume", p.includes("shouldSaveResume(cachedPos"));
  check("عقد الاستدعاء مكتوب على الدالة", p.includes("PAGE OPEN ≠ READING PROGRESS"));
}

console.log("═══ ٣ · ٩) منتصف الليل بريء بنيويًا ═══");
{
  const files = [
    "src/features/quran/engine/resume.ts",
    "src/features/quran/data/progress.ts",
  ].map((f) => readFileSync(f, "utf8")).join("\n");
  check("لا day_key ولا dayAtOffset في مسار الموضع", !/day_key|dayAtOffset|kwToday/.test(files));
  // ٧+٨) الثبات عبر Refresh/إغلاق: التخزين localStorage + قاعدة، لا ذاكرة وحدها
  const p = readFileSync("src/features/quran/data/progress.ts", "utf8");
  check("٧+٨) يكتب localStorage والقاعدة معًا", p.includes("writeLocal(LAST_KEY") && p.includes("quran_last_position"));
}

console.log("═══ ٤ · الدمج المحافظ محلي/قاعدة ═══");
{
  const t1 = "2026-08-24T10:00:00Z", t2 = "2026-08-24T12:00:00Z";
  check("١١) محلي أحدث → المحلي (ويُرفع)", newerResume(P(2, 25, t2), P(2, 22, t1)).source === "local");
  check("١٢) قاعدة أحدث → القاعدة (ويُنزل)", newerResume(P(2, 22, t1), P(2, 25, t2)).source === "db");
  check("١٣) محلي قديم بلا طابع + قاعدة → القاعدة تغلب، لا تخمين", newerResume(P(2, 99), P(2, 22, t1)).source === "db");
  check("محلي قديم بلا طابع ولا قاعدة → المحلي خير من لا شيء", newerResume(P(2, 7), null).source === "local");
  check("تساوي الطابعين → القاعدة (محافظة)", newerResume(P(2, 22, t1), P(3, 5, t1)).source === "db");
  check("لا شيء في الجهتين → none", newerResume(null, null).source === "none");
}

console.log("═══ ٥ · ١٤) المفاهيم الثلاثة لم تُخلط ═══");
{
  const r = readFileSync("src/features/quran/engine/resume.ts", "utf8");
  check("محرك الموضع لا يلمس goal/review/verified",
    !/quran_goal|quran_review_state|verified/.test(r));
  const p = readFileSync("src/features/quran/data/progress.ts", "utf8");
  check("والحفظ لا يكتب إلا في جدولي القراءة",
    !/quran_goal|quran_review_state|quran_memory_spot/.test(p));
}

console.log(`\n  الموضع: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
