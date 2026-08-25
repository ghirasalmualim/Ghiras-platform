#!/usr/bin/env node
/**
 * مشغّل اختبارات قسم القرآن.
 *
 * المحركات مكتوبة بـTypeScript والاختبارات بـNode، فنحوّل المحركات
 * إلى JavaScript في مجلد مؤقت (`.quran-test/`, مستثنى من Git) ثم نشغّل
 * الاختبارات عليها. نختبر ما يُبنى فعلًا لا نسخة مكتوبة بيدنا منه.
 *
 *   npm run test:quran
 */

import { execFileSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";

const OUT = ".quran-test";
const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("\n  تحويل المحركات إلى JavaScript…");
run("npx", [
  "tsc",
  "src/features/quran/engine/audio.ts",
  "src/features/quran/engine/hide.ts",
  "src/features/quran/engine/basmala.ts",
  "src/features/quran/engine/review.ts",
  "src/features/quran/engine/activities.ts",
  "src/features/quran/engine/planner.ts",
  "src/features/quran/engine/pages.ts",
  "src/features/quran/engine/alignment.ts",
  "src/features/quran/engine/alignment-tuning.ts",
  "src/features/quran/speech/azure.ts",
  "src/features/quran/speech/limits.ts",
  "src/features/quran/engine/artifacts.ts",
  "src/features/quran/engine/session.ts",
  "src/features/quran/engine/grading.ts",
  "src/features/quran/engine/memory.ts",
  "src/features/quran/engine/plan.ts",
  "src/features/quran/engine/journey.ts",
  "src/features/quran/engine/stability.ts",
  "src/features/quran/engine/rate-policies.ts",
  "src/features/quran/engine/resume.ts",
  "src/features/quran/engine/hints.ts",
  "src/features/quran/engine/daytime.ts",
  "src/features/quran/speech/types.ts",
  "src/features/quran/capture/recorder.ts",
  "src/features/quran/garden/types.ts",
  "src/features/quran/garden/tuning.ts",
  "src/features/quran/garden/growth.ts",
  "src/features/quran/tajweed/types.ts",
  "src/features/quran/tajweed/engine.ts",
  "src/features/quran/tajweed/review.ts",
  "--outDir", OUT,
  // الجذر يشمل types.ts لأن المحركات تستورد أنواعها منه
  "--rootDir", "src/features/quran",
  "--module", "esnext",
  "--target", "es2022",
  "--moduleResolution", "bundler",
  "--resolveJsonModule",
  "--skipLibCheck",
]);

// المجلد الأب ليس ESM، فنُعلن ذلك هنا حتى تعمل صيغة import.
writeFileSync(`${OUT}/package.json`, JSON.stringify({ type: "module" }) + "\n");

// المطبِّع بصيغة .mjs أصلًا، وtsc لا ينسخ ما لا يترجمه. ننسخه كما هو
// فنختبر نفس الملف الذي يستعمله التطبيق لا نسخة مترجمة منه.
for (const f of ["normalize.mjs", "random.mjs"])
  copyFileSync(`src/features/quran/engine/${f}`, `${OUT}/engine/${f}`);

/**
 * إضافة لاحقة .js للمسارات النسبية في المخرجات.
 *
 * المشروع يُبنى بمحزّم (Next.js) يقبل `./review` بلا لاحقة، فمصدرنا
 * مكتوب بهذه الصيغة. أما Node بصيغة ESM فيطلب المسار كاملًا. ولأننا
 * نشغّل مخرجات tsc خامًا هنا لا محزَّمة، نصلح الفرق في هذه الخطوة
 * وحدها — ولا نغيّر المصدر لأجل بيئة الاختبار.
 */
for (const dir of ["engine", "speech", "capture", "garden", "tajweed"])
for (const f of readdirSync(`${OUT}/${dir}`)) {
  if (!f.endsWith(".js")) continue;
  const p = `${OUT}/${dir}/${f}`;
  writeFileSync(
    p,
    readFileSync(p, "utf8").replace(
      /(from\s+["'])(\.\.?\/[^"']+?)(["'])/g,
      (m, a, spec, b) => (/\.(js|mjs|json)$/.test(spec) ? m : `${a}${spec}.js${b}`)
    )
  );
  // ‏Node بصيغة ESM يطلب إعلانًا صريحًا لاستيراد JSON، والمحزّم لا
  // يطلبه. نضيفه هنا للسبب نفسه: بيئة الاختبار تتكيّف مع المصدر،
  // ولا يُشوَّه المصدر لأجلها.
  writeFileSync(
    p,
    readFileSync(p, "utf8").replace(
      /(from\s+["'][^"']+\.json["'])(?!\s*with)/g,
      '$1 with { type: "json" }'
    )
  );
}

run("node", ["scripts/quran/test-normalize.mjs"]);
run("node", ["scripts/quran/test-engine.mjs"]);
run("node", ["scripts/quran/test-basmala.mjs"]);
run("node", ["scripts/quran/test-phase2.mjs"]);
run("node", ["scripts/quran/test-pages.mjs"]);
run("node", ["scripts/quran/test-alignment.mjs"]);
run("node", ["scripts/quran/test-azure-adapter.mjs"]);
run("node", ["scripts/quran/test-recitation.mjs"]);
run("node", ["scripts/quran/test-garden.mjs"]);
run("node", ["scripts/quran/test-review-smart.mjs"]);
run("node", ["scripts/quran/test-plan.mjs"]);
run("node", ["scripts/quran/test-journey.mjs"]);
run("node", ["scripts/quran/test-stability.mjs"]);
run("node", ["scripts/quran/test-rate.mjs"]);
run("node", ["scripts/quran/test-resume.mjs"]);
run("node", ["scripts/quran/test-daytime.mjs"]);
run("node", ["scripts/quran/test-tajweed.mjs"]);

rmSync(OUT, { recursive: true, force: true });
console.log("  ✅ كل اختبارات قسم القرآن نجحت.\n");
