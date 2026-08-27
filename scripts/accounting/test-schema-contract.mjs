#!/usr/bin/env node
/**
 * عقد المخطط (وقائي، محلي بالكامل) — يمنع صنف العطب الذي كلّفنا
 * دورتَي تطبيق يدوي في Stage 11:
 *
 *   كود المرحلة ١١ ينادي عمودًا **غير موجود** في مخطط المراحل ١..١٠
 *   (حادثة: completed_at بدل finished_at في acc_recon_runs)
 *
 * ولا يمسكه شيء آخر: TypeScript لا يرى أسماء الأعمدة (نصوص داخل
 * الاستعلام)، والعقود الساكنة تفحص انضباط SQL لا تطابق الأسماء —
 * فلا ينكشف إلا على Staging بعد تطبيق هجرة يدويًا وجولة كاملة.
 *
 * الماسح يبني خريطة الأعمدة الحقيقية من الـDDL نفسه (لا قائمة
 * مكتوبة بيدٍ تشيخ)، ثم يقارنها بكل مرجع عمود في كود المرحلة ١١.
 *
 * ويحرس صنفًا ثانيًا مجاورًا (حادثة tax_status): حمولة أسطر JSON
 * تُمرَّر لدوال المراحل السابقة ناقصةً مفتاحًا **إلزاميًا** — تُشتق
 * الإلزامية من الـSQL نفسه (عمود NOT NULL تُغذّيه l->>'key' بلا
 * بديل)، لا من افتراض.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { buildDraftLines } from '../../src/lib/accounting/owner/tax.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

// ═══════════════════════════════════════════════════════════
// ٠ · خريطة المخطط الحقيقية من الهجرات (بالترتيب الزمني)
// ═══════════════════════════════════════════════════════════
const MIGRATIONS = readdirSync('supabase')
  .filter((f) => /^2026-\d\d-\d\d-accounting-.*\.sql$/.test(f)).sort();

const TYPE_TOKEN = /\b(uuid|text|char|varchar|integer|int|bigint|smallint|boolean|timestamptz|timestamp|date|numeric|decimal|jsonb|json|serial)\b/;
const NON_COLUMN = /^(check|unique|primary\s+key|foreign\s+key|constraint|exclude|like)\b/i;

/** table → Set(columns) — من create table + alter table add column */
function buildSchema() {
  const schema = new Map();
  for (const f of MIGRATIONS) {
    const src = readFileSync(`supabase/${f}`, 'utf8');
    // create table
    for (const m of src.matchAll(
      /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const table = m[1];
      const cols = schema.get(table) ?? new Set();
      for (const rawLine of m[2].split('\n')) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('--') || NON_COLUMN.test(line)) continue;
        const name = (line.match(/^(\w+)\s/) || [])[1];
        if (!name) continue;                       // أسطر تكملة مثل ('A','B')
        if (!TYPE_TOKEN.test(line)) continue;      // لا نوع = ليست تعريف عمود
        cols.add(name);
      }
      schema.set(table, cols);
    }
    // alter table add column
    for (const m of src.matchAll(
      /alter table public\.(\w+)\s+add column(?: if not exists)?\s+(\w+)/gi)) {
      const cols = schema.get(m[1]) ?? new Set();
      cols.add(m[2]);
      schema.set(m[1], cols);
    }
  }
  return schema;
}
const SCHEMA = buildSchema();

console.log('\n═══ ١ · خريطة المخطط مبنية من الـDDL نفسه ═══');
{
  check('جداول المحاسبة مستخرَجة (> 40 جدولًا)', SCHEMA.size > 40, String(SCHEMA.size));
  // عينات تحقق: أعمدة نعرفها يقينًا موجودة، وأخرى يقينًا غير موجودة
  const runs = SCHEMA.get('acc_recon_runs');
  check('acc_recon_runs: finished_at/state/started_at موجودة',
    runs?.has('finished_at') && runs?.has('state') && runs?.has('started_at'));
  check('acc_recon_runs: completed_at غير موجود (أصل الحادثة)',
    runs && !runs.has('completed_at'));
  const invLines = SCHEMA.get('acc_invoice_lines');
  check('acc_invoice_lines: tax_status وquantity موجودة',
    invLines?.has('tax_status') && invLines?.has('quantity'));
  check('توسيعات alter table ملتقطة (acc_gl_account_links.scope_key)',
    SCHEMA.get('acc_gl_account_links')?.has('scope_key'));
  check('لا كلمات قيود تسربت كأعمدة',
    !invLines?.has('check') && !invLines?.has('unique') && !runs?.has('check'));
}

// ═══════════════════════════════════════════════════════════
// ١ · مسح مراجع الأعمدة في كود المرحلة ١١
// ═══════════════════════════════════════════════════════════
function stage11Files() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  walk('src/lib/accounting/exceptions');
  walk('src/lib/accounting/owner');
  walk('src/app/api/accounting/owner');
  walk('src/app/owner');
  return out;
}

/** يقسّم قائمة select بفواصل المستوى الأعلى (يحترم أقواس التضمين) */
function splitTopLevel(list) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** مراجع الأعمدة في سلسلة استعلام واحدة: {table, column, kind} */
function refsInChain(table, chain) {
  const refs = [];
  // ‏select('a, b, embedded(c, d)')
  for (const m of chain.matchAll(/\.select\(\s*'([^']*)'/g)) {
    for (const item of splitTopLevel(m[1])) {
      if (item === '*' || item === '') continue;
      const embedded = item.match(/^(\w+)\s*\(([\s\S]*)\)$/);
      if (embedded) {
        for (const inner of splitTopLevel(embedded[2])) {
          if (inner !== '*') refs.push({ table: embedded[1], column: inner, kind: 'select' });
        }
      } else {
        refs.push({ table, column: item.split(/[:\s]/)[0], kind: 'select' });
      }
    }
  }
  // مُرشِّحات/ترتيب: أول وسيط نصي هو اسم عمود
  const FILTERS = 'eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|order|contains|overlaps';
  for (const m of chain.matchAll(new RegExp(`\\.(${FILTERS})\\(\\s*'([^']+)'`, 'g'))) {
    refs.push({ table, column: m[2], kind: m[1] });
  }
  // insert/update/upsert: مفاتيح الكائن الحرفي
  for (const m of chain.matchAll(/\.(insert|update|upsert)\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const k of m[2].matchAll(/(\w+)\s*:/g)) {
      refs.push({ table, column: k[1], kind: m[1] });
    }
  }
  return refs;
}

/** كل سلاسل .from('table') في ملف — تمتد حتى ; أو .from التالية */
function chainsInSource(src) {
  const chains = [];
  for (const m of src.matchAll(/\.from\(\s*'(\w+)'\s*\)/g)) {
    const start = m.index + m[0].length;
    const nextFrom = src.indexOf(".from('", start);
    const semi = src.indexOf(';', start);
    const candidates = [nextFrom, semi, start + 900].filter((i) => i > 0);
    chains.push({ table: m[1], chain: src.slice(start, Math.min(...candidates)) });
  }
  return chains;
}

console.log('═══ ٢ · كل مرجع عمود في كود المرحلة ١١ موجود فعلًا ═══');
{
  const files = stage11Files();
  check('ملفات المرحلة ١١ ضمن المسح (> 12 ملفًا)', files.length > 12, String(files.length));
  let refCount = 0, bad = 0, scannedTables = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const { table, chain } of chainsInSource(src)) {
      scannedTables.add(table);
      if (!SCHEMA.has(table)) {
        bad++; console.error(`  ❌ ${f}: جدول غير معروف «${table}»`);
        continue;
      }
      for (const ref of refsInChain(table, chain)) {
        refCount++;
        const cols = SCHEMA.get(ref.table);
        if (!cols) { bad++; console.error(`  ❌ ${f}: جدول مُضمَّن غير معروف «${ref.table}»`); continue; }
        if (!cols.has(ref.column)) {
          bad++;
          console.error(`  ❌ ${f}: ${ref.table}.${ref.column} غير موجود (${ref.kind})`);
        }
      }
    }
  }
  check('مراجع أعمدة فُحصت فعلًا (> 60)', refCount > 60, String(refCount));
  check('جداول المراحل ١..١٠ المستعملة معروفة كلها (> 12)', scannedTables.size > 12, String(scannedTables.size));
  check('صفر مرجع عمود غير موجود في كود المرحلة ١١', bad === 0);
}

console.log('═══ ٣ · إثبات نفي: الحادثة الحقيقية تُصطاد والصحيح يمرّ ═══');
{
  const badSrc = `const runs = need(await db.from('acc_recon_runs')
    .select('id, bank_account_id, completed_at').eq('company_id', companyId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false }).limit(200), 'recon runs');`;
  const goodSrc = badSrc.split('completed_at').join('finished_at');
  const scan = (src) => {
    let hits = 0;
    for (const { table, chain } of chainsInSource(src)) {
      for (const ref of refsInChain(table, chain)) {
        if (!SCHEMA.get(ref.table)?.has(ref.column)) hits++;
      }
    }
    return hits;
  };
  check('النص قبل الإصلاح يُصطاد (completed_at × ثلاثة مواضع)', scan(badSrc) === 3, String(scan(badSrc)));
  check('النص بعد الإصلاح (finished_at) يمرّ نظيفًا', scan(goodSrc) === 0);
  const typoSrc = `await db.from('acc_expenses').select('id, review_resaon').eq('state', 'NEEDS_REVIEW');`;
  check('خطأ إملائي في عمود يُصطاد (review_resaon)', scan(typoSrc) === 1);
  const embeddedBad = `await db.from('acc_company_members').select('role, acc_companies(id, legal_naem)');`;
  check('عمود خاطئ داخل تضمين PostgREST يُصطاد', scan(embeddedBad) === 1);
  const embeddedGood = `await db.from('acc_company_members').select('role, acc_companies(id, legal_name)');`;
  check('التضمين الصحيح يمرّ', scan(embeddedGood) === 0);
}

// ═══════════════════════════════════════════════════════════
// ٤ · صنف مجاور: مفاتيح JSON الإلزامية في حمولة الأسطر
//     (حادثة tax_status) — تُشتق من الـSQL لا من افتراض
// ═══════════════════════════════════════════════════════════
/**
 * لماذا لا يكفي ماسح الأعمدة هنا: أسطر الفاتورة/المصروف **لا تمر**
 * باستعلام جدول من كودنا — تُمرَّر jsonb إلى دالة محكومة (p_lines)،
 * وهي تفكّها بـl->>'key' داخل SQL. فلا يوجد مرجع عمود يُفحص أصلًا.
 * البديل الأقوى المتاح محليًا: نشتق «المفاتيح الإلزامية» من الـSQL
 * نفسه (عمود NOT NULL تغذّيه l->>'key' مباشرةً بلا coalesce/بديل)،
 * ثم نثبت أن بنّاء الأسطر عندنا يُصدرها فعليًا وقت التشغيل.
 */
function requiredJsonKeys(fnName, targetTable) {
  const src = MIGRATIONS.map((f) => readFileSync(`supabase/${f}`, 'utf8')).join('\n');
  // آخر تعريف فعّال للدالة
  const defs = [...src.matchAll(new RegExp(
    `create or replace function public\\.${fnName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, 'g'))];
  if (defs.length === 0) return null;
  const body = defs[defs.length - 1][1];
  const ins = body.match(new RegExp(
    `insert into public\\.${targetTable}\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)\\s*values\\s*\\(([\\s\\S]*?)\\);`));
  if (!ins) return null;
  const cols = splitTopLevel(ins[1]).map((c) => c.trim());
  const vals = splitTopLevel(ins[2]);
  if (cols.length !== vals.length) return null;
  // الإلزام يعني NOT NULL **بلا default** — العمود nullable (tax_rate,
  // fx_*) أو ذو قيمة خادمية ليس مفتاحًا مطلوبًا من الحمولة
  const notNull = notNullColumns(targetTable);
  const required = new Set();
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i], val = vals[i];
    if (!notNull.has(col)) continue;
    const key = (val.match(/l->>'(\w+)'/) || [])[1];
    if (!key) continue;                       // قيمة خادمية لا من الحمولة
    if (/coalesce|nullif\s*\(\s*l->>/.test(val) && /coalesce/.test(val)) continue; // له بديل
    required.add(key);
  }
  return required;
}

/** أعمدة NOT NULL فعلية (نص الـDDL) — لتضييق الاشتقاق */
function notNullColumns(table) {
  const out = new Set();
  for (const f of MIGRATIONS) {
    const src = readFileSync(`supabase/${f}`, 'utf8');
    const m = src.match(new RegExp(
      `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
    if (!m) continue;
    for (const rawLine of m[1].split('\n')) {
      const line = rawLine.trim();
      if (!TYPE_TOKEN.test(line) || NON_COLUMN.test(line)) continue;
      const name = (line.match(/^(\w+)\s/) || [])[1];
      if (name && /\bnot null\b/i.test(line) && !/\bdefault\b/i.test(line)) out.add(name);
    }
  }
  return out;
}

console.log('═══ ٤ · مفاتيح الحمولة الإلزامية مشتقّة من SQL ═══');
let invoiceRequired, expenseRequired;
{
  const invNotNull = notNullColumns('acc_invoice_lines');
  const expNotNull = notNullColumns('acc_expense_lines');
  check('NOT NULL بلا default مستخرَجة لأسطر الفاتورة',
    invNotNull.has('tax_status') && invNotNull.has('currency') && invNotNull.has('quantity')
    && !invNotNull.has('position'), [...invNotNull].join(','));
  check('NOT NULL بلا default مستخرَجة لأسطر المصروف',
    expNotNull.has('tax_status') && expNotNull.has('category_key')
    && expNotNull.has('amount_minor'), [...expNotNull].join(','));

  invoiceRequired = requiredJsonKeys('acc_insert_invoice_lines', 'acc_invoice_lines');
  expenseRequired = requiredJsonKeys('acc_create_expense_draft', 'acc_expense_lines');
  check('مفاتيح الفاتورة الإلزامية مشتقّة (tax_status ضمنها)',
    invoiceRequired?.has('tax_status') && invoiceRequired?.has('currency')
    && invoiceRequired?.has('quantity') && invoiceRequired?.has('unit_price_minor'),
    invoiceRequired ? [...invoiceRequired].join(',') : 'null');
  check('description ليست إلزامية (لها coalesce في SQL)',
    invoiceRequired && !invoiceRequired.has('description'));
  check('tax_rate ليست إلزامية (العمود nullable)',
    invoiceRequired && !invoiceRequired.has('tax_rate'));
  check('مفاتيح المصروف الإلزامية مشتقّة (tax_status وcategory_key ضمنها)',
    expenseRequired?.has('tax_status') && expenseRequired?.has('category_key')
    && expenseRequired?.has('amount_minor') && expenseRequired?.has('currency'),
    expenseRequired ? [...expenseRequired].join(',') : 'null');
  check('base_currency ليست إلزامية (لها coalesce في SQL)',
    expenseRequired && !expenseRequired.has('base_currency'));
}

console.log('═══ ٥ · بنّاء أسطر المالكة يُصدر كل مفتاح إلزامي (وقت تشغيل) ═══');
{
  const posture = { status: 'NO_TAX_REGIME', rate: null, ruleId: 'REG-KW-008', ruleVersion: 1 };
  const built = buildDraftLines(
    [{ product_id: 'p1', quantity: '1', unit_price_minor: '45000', currency: 'KWD' }], posture);
  const emitted = new Set(Object.keys(built[0]));
  const missing = [...invoiceRequired].filter((k) => !emitted.has(k));
  check('buildDraftLines يُصدر كل مفتاح إلزامي مشتقّ من SQL', missing.length === 0,
    `ناقص: ${missing.join(',')}`);
  check('ويضيف product_id الذي تبحث به الدالة عن المنتج', emitted.has('product_id'));
  // إثبات نفي: بنّاء يُسقط tax_status يُصطاد بنفس العقد
  const naive = [{ product_id: 'p1', quantity: '1', unit_price_minor: '45000', currency: 'KWD' }];
  const naiveMissing = [...invoiceRequired].filter((k) => !(k in naive[0]));
  check('النفي: حمولة بلا tax_status تُصطاد (الحادثة الحقيقية)',
    naiveMissing.includes('tax_status'));
}

console.log('═══ ٦ · حمولات الأسطر الحرفية في حزم الاختبار مكتملة ═══');
{
  // الحادثة الأولى كانت في تجهيزة اختبار: نفحص الحمولات الحرفية أيضًا
  const suites = readdirSync('scripts/accounting')
    .filter((f) => f.endsWith('.mjs') && f !== 'test-schema-contract.mjs')  // لا يفحص نفسه
    .map((f) => `scripts/accounting/${f}`);
  /** يعيد نطاق الكائن الحرفي المحيط بموضع ما */
  const enclosingObject = (src, idx) => {
    let depth = 0, start = -1;
    for (let i = idx; i >= 0; i--) {
      if (src[i] === '}') depth++;
      else if (src[i] === '{') { if (depth === 0) { start = i; break; } depth--; }
    }
    if (start < 0) return null;
    depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
  };
  const keysOf = (obj) => new Set([...obj.matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
  /**
   * تجهيزة نفي مقصودة: الحمولة الناقصة تُمرَّر عمدًا لإثبات أن القاعدة
   * ترفضها (مثل ACC-T-045 «سطر بلا tax_status مرفوض») — يتبعها فحص
   * يتوقّع خطأ. هذي لا تُصطاد وإلا انقلب العقد على أدلته نفسها.
   */
  const isNegativeFixture = (src, endIdx) =>
    /check\([^;]*!!\s*\w+(\.\w+)?\.error/.test(src.slice(endIdx, endIdx + 500));
  let checkedPayloads = 0, incomplete = 0, negativeSkipped = 0;
  for (const f of suites) {
    const src = readFileSync(f, 'utf8');
    // حمولات أسطر الفاتورة: الكائن الذي يحوي unit_price_minor
    for (const m of src.matchAll(/unit_price_minor\s*:/g)) {
      const obj = enclosingObject(src, m.index);
      if (!obj) continue;
      const keys = keysOf(obj);
      if (!keys.has('product_id')) continue;      // ليست حمولة سطر فاتورة
      if (isNegativeFixture(src, m.index)) { negativeSkipped++; continue; }
      checkedPayloads++;
      const miss = [...invoiceRequired].filter((k) => !keys.has(k));
      if (miss.length) { incomplete++; console.error(`  ❌ ${f}: حمولة سطر فاتورة ناقصة ${miss.join(',')}`); }
    }
    // حمولات أسطر المصروف: الكائن الذي يحوي base_amount_minor —
    // وأسطر القيد لها نفس الشكل النقدي فتُستبعد بحقولها الدفترية
    for (const m of src.matchAll(/base_amount_minor\s*:/g)) {
      const obj = enclosingObject(src, m.index);
      if (!obj) continue;
      const keys = keysOf(obj);
      if (!keys.has('amount_minor')) continue;
      if (keys.has('account_id') || keys.has('side')) continue;  // سطر قيد لا مصروف
      if (isNegativeFixture(src, m.index)) { negativeSkipped++; continue; }
      checkedPayloads++;
      const miss = [...expenseRequired].filter((k) => !keys.has(k));
      if (miss.length) { incomplete++; console.error(`  ❌ ${f}: حمولة سطر مصروف ناقصة ${miss.join(',')}`); }
    }
  }
  check('حمولات أسطر حرفية فُحصت فعلًا (> 5)', checkedPayloads > 5, String(checkedPayloads));
  check('صفر حمولة سطر ناقصة مفتاحًا إلزاميًا', incomplete === 0);
  check('تجهيزات النفي المقصودة مُستثناة لا مُصطادة (ACC-T-045 ونظائرها)',
    negativeSkipped >= 1, String(negativeSkipped));
  // نفي اصطناعي: نفس المنطق على حمولة ناقصة يصطادها
  const synthetic = `p_lines: [{ product_id: prod, quantity: '1', unit_price_minor: '100000', currency: 'KWD' }]`;
  const synKeys = keysOf(enclosingObject(synthetic, synthetic.indexOf('unit_price_minor')));
  check('النفي: حمولة اختبار بلا tax_status تُصطاد',
    [...invoiceRequired].filter((k) => !synKeys.has(k)).join(',') === 'tax_status');
}

console.log(`\n  عقد المخطط الوقائي: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
