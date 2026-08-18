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
import { writeFileSync, rmSync, mkdirSync } from "node:fs";

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
  "--outDir", OUT,
  // الجذر يشمل types.ts لأن المحركات تستورد أنواعها منه
  "--rootDir", "src/features/quran",
  "--module", "esnext",
  "--target", "es2022",
  "--moduleResolution", "bundler",
  "--skipLibCheck",
]);

// المجلد الأب ليس ESM، فنُعلن ذلك هنا حتى تعمل صيغة import.
writeFileSync(`${OUT}/package.json`, JSON.stringify({ type: "module" }) + "\n");

run("node", ["scripts/quran/test-normalize.mjs"]);
run("node", ["scripts/quran/test-engine.mjs"]);

rmSync(OUT, { recursive: true, force: true });
console.log("  ✅ كل اختبارات قسم القرآن نجحت.\n");
