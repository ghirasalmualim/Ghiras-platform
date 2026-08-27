#!/usr/bin/env node
/**
 * Stage 11 — طبقة المفردات الواحدة + DTO المالكة (وحدات صرفة).
 *
 * يثبت: كل مفتاح مستعمل في واجهة المالكة موجود في السجل المغلق؛
 * صفر مصطلح محرَّم في قيم المفردات وفي DTO مسلسلًا (قيمًا ومفاتيح)؛
 * وقواعد الصدق في البنّائين: ZERO ≠ UNKNOWN ≠ NOT_CONFIGURED،
 * الجزئي لا يُنشر رصيدًا كاملًا، الربح بلا رقم (C7)، بطاقة ٣
 * بثلاثة مكوّنات (C8)، الصمود يرفض التغطية الناقصة (C10)،
 * الالتزامات لا تدّعي «ما عليك شيء»، والبطاقة ٦ محروسة بالتغطية (C4).
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { FORBIDDEN_OWNER_TERMS, OWNER_VOCAB, isOwnerKey, t }
  from '../../src/lib/accounting/owner/vocabulary.ts';
import {
  buildAttentionCard, buildCashCard, buildInboxItem, buildObligationsCard,
  buildProfitCard, buildRunwayCard, buildTransitCard,
} from '../../src/lib/accounting/owner/dto.ts';
import { buildDraftLines, resolveInvoiceTaxPosture }
  from '../../src/lib/accounting/owner/tax.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const hasForbidden = (text) => {
  const lower = text.toLowerCase();
  return FORBIDDEN_OWNER_TERMS.find((term) =>
    /[a-z]/.test(term) ? lower.includes(term.toLowerCase()) : text.includes(term));
};

console.log('\n═══ ١ · السجل المغلق: كل مفتاح مستعمل موجود، وكل قيمة نظيفة ═══');
{
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  } };
  walk('src/app/owner'); walk('src/lib/accounting/owner'); walk('src/lib/accounting/exceptions');
  const used = new Set();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\('([A-Z0-9_]+)'/g)) used.add(m[1]);
    for (const m of s.matchAll(/vkey="([A-Z0-9_]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/(?:labelKey|noteKey|messageKey|whatKey|whyKey|emptyKey|titleKey):\s*'([A-Z0-9_]+)'/g)) used.add(m[1]);
  }
  check('مفاتيح مستعملة رُصدت فعلًا (> 40)', used.size > 40, String(used.size));
  let missing = 0;
  for (const k of used) if (!isOwnerKey(k)) { missing++; console.error(`    مفتاح مجهول: ${k}`); }
  check('كل مفتاح مستعمل معرّف في طبقة المفردات', missing === 0);
  let dirty = 0;
  for (const [k, v] of Object.entries(OWNER_VOCAB)) {
    const hit = hasForbidden(v);
    if (hit) { dirty++; console.error(`    ${k}: يحوي «${hit}»`); }
  }
  check('صفر مصطلح محرَّم في قيم المفردات كلها', dirty === 0);
  check('t() تفشل بصوت عالٍ للمفتاح المجهول', (() => {
    try { t('NO_SUCH_KEY'); return false; } catch { return true; }
  })());
  check('بارامترات t() تُستبدل', t('EXC_RECURRENCE', { n: '3' }).includes('3'));
  // نفي اصطناعي: مصطلح محرَّم مزروع يُصطاد
  check('النفي الاصطناعي: «مدين» يُصطاد', hasForbidden('رصيد مدين') === 'مدين');
  check('النفي الاصطناعي: Debit يُصطاد بلا حساسية حالة', hasForbidden('DEBIT balance') === 'debit');
}

console.log('═══ ٢ · بطاقة ١: GL سلطة والجزئي لا يُنشر كاملًا ═══');
{
  const asOf = '2026-09-03T10:00:00Z';
  const bank = { label: 'بنك اختبار 1234', balanceMinor: 150000n, currency: 'KWD', evidenceDate: '2026-08-31' };
  const nothing = buildCashCard({ bankComponents: [], hasBankMapping: false,
    unmappedActiveBankAccounts: 0, cashOnHand: null, baseCurrency: 'KWD', asOf });
  check('لا تعيين إطلاقًا → NOT_CONFIGURED بلا رقم',
    nothing.status === 'NOT_CONFIGURED' && nothing.headline.amountMinor === null);
  const full = buildCashCard({ bankComponents: [bank], hasBankMapping: true,
    unmappedActiveBankAccounts: 0, cashOnHand: { balanceMinor: 25000n, currency: 'KWD' },
    baseCurrency: 'KWD', asOf });
  check('نطاق كامل بعملة واحدة → FINAL بمجموع دقيق',
    full.status === 'FINAL' && full.headline.amountMinor === '175000');
  const partial = buildCashCard({ bankComponents: [bank], hasBankMapping: true,
    unmappedActiveBankAccounts: 0, cashOnHand: null, baseCurrency: 'KWD', asOf });
  check('نقد الصندوق غير مهيأ → المجموع لا يُدّعى (UNKNOWN) والمكوّن يُعرض',
    partial.status === 'UNKNOWN' && partial.headline.amountMinor === null
    && partial.components[0].value.amountMinor === '150000');
  const unmapped = buildCashCard({ bankComponents: [bank], hasBankMapping: true,
    unmappedActiveBankAccounts: 1, cashOnHand: { balanceMinor: 0n, currency: 'KWD' },
    baseCurrency: 'KWD', asOf });
  check('حساب بنكي نشط بلا ربط → UNKNOWN لا مجموع جزئي', unmapped.status === 'UNKNOWN');
  const mixed = buildCashCard({
    bankComponents: [bank, { label: 'دولار', balanceMinor: 100n, currency: 'USD', evidenceDate: null }],
    hasBankMapping: true, unmappedActiveBankAccounts: 0,
    cashOnHand: { balanceMinor: 0n, currency: 'KWD' }, baseCurrency: 'KWD', asOf });
  check('عملات مختلطة → لا جمع مخترع (UNKNOWN)', mixed.status === 'UNKNOWN');
  check('دليل الكشف تاريخ نضارة لا رصيدًا',
    full.components[0].noteKey === 'CASH_BANK_EVIDENCE'
    && full.components[0].noteParams.date === '2026-08-31');
}

console.log('═══ ٣ · بطاقة ٢ (C7): الربح بلا رقم قبل Stage 12 ═══');
{
  const p = buildProfitCard('2026-09-03T10:00:00Z');
  check('NOT_CONFIGURED + PENDING_STAGE_12 + صفر قيمة',
    p.status === 'NOT_CONFIGURED' && p.pendingOn === 'STAGE_12'
    && p.headline.amountMinor === null && p.headline.scalar === null
    && p.components.length === 0);
  check('الرسالة الصادقة المعتمدة', t(p.messageKey) === 'ما نقدر نحسب ربح الشهر بدقة للحين');
}

console.log('═══ ٤ · بطاقة ٣ (C8): ثلاثة مكوّنات، الغائب UNKNOWN لا صفرًا ═══');
{
  const asOf = '2026-09-03T10:00:00Z';
  const full = buildTransitCard({
    gateway: { balanceMinor: 5000n, currency: 'KWD' },
    toBank: { balanceMinor: 3000n, currency: 'KWD' },
    awaited: { balanceMinor: 2000n, currency: 'KWD' },
    settlementDifferenceOpen: false, asOf });
  check('ثلاثة مكوّنات دائمًا', full.components.length === 3);
  check('اكتمال بعملة واحدة → مجموع دقيق', full.headline.amountMinor === '10000' && full.status === 'FINAL');
  const missing = buildTransitCard({
    gateway: null, toBank: { balanceMinor: 3000n, currency: 'KWD' },
    awaited: { balanceMinor: 2000n, currency: 'KWD' },
    settlementDifferenceOpen: true, asOf });
  check('مكوّن غائب → NOT_CONFIGURED لذاته ولا مجموع معتم',
    missing.components[0].status === 'NOT_CONFIGURED'
    && missing.components[0].value.amountMinor === null
    && missing.headline.amountMinor === null && missing.status === 'UNKNOWN');
  check('فرق تسوية مفتوح يُعلن لا يُخفى', missing.noteKey === 'TRANSIT_DIFFERENCE_OPEN');
}

console.log('═══ ٥ · بطاقة ٤ (C10): الصمود يرفض التغطية الناقصة ═══');
{
  const asOf = '2026-09-03T10:00:00Z';
  const base = { cashScopeFinal: true, cashMinor: 90000n, currency: 'KWD',
    windowDays: 30, historyCoveredDays: 45, inflowWindowMinor: 15000n,
    outflowWindowMinor: 45000n, asOf };
  const ok = buildRunwayCard(base);
  check('حساب حتمي بالأيام: 90000×30/30000 = 90',
    ok.status === 'FINAL' && ok.headline.scalar === '90');
  check('افتراضات معلنة (نافذة صريحة، لا تنبؤ ذكي)',
    ok.noteKey === 'RUNWAY_ASSUMPTION' && ok.noteParams.days === '30');
  check('بلا نافذة مكوّنة → NOT_CONFIGURED (لا افتراض مخترع)',
    buildRunwayCard({ ...base, windowDays: null }).status === 'NOT_CONFIGURED');
  check('نطاق نقد غير كامل → UNKNOWN (لا حساب من مجموعة جزئية)',
    buildRunwayCard({ ...base, cashScopeFinal: false, cashMinor: null }).status === 'UNKNOWN');
  check('تاريخ أقصر من النافذة → UNKNOWN',
    buildRunwayCard({ ...base, historyCoveredDays: 10 }).status === 'UNKNOWN');
  const noBurn = buildRunwayCard({ ...base, inflowWindowMinor: 50000n });
  check('صافي موجب → «لا نزف» لا لانهاية مزعومة',
    noBurn.status === 'FINAL' && noBurn.headline.scalar === null
    && noBurn.messageKey === 'RUNWAY_NO_BURN');
}

console.log('═══ ٦ · بطاقة ٥: لا «ما عليك شيء» بلا برهان ═══');
{
  const empty = buildObligationsCard({ recordedPayable: null, noTaxRegime: false, asOf: 'x' });
  check('بلا بيانات → UNKNOWN «غير مكتملة» — أبدًا ليست "لا التزامات"',
    empty.status === 'UNKNOWN' && empty.messageKey === 'OBLIGATIONS_INCOMPLETE'
    && empty.headline.amountMinor === null);
  const withPayable = buildObligationsCard({
    recordedPayable: { balanceMinor: 7000n, currency: 'KWD' }, noTaxRegime: false, asOf: 'x' });
  check('المسجل يُعرض مكوّنًا والحالة تبقى UNKNOWN (الاكتمال غير مثبت)',
    withPayable.components[0].value.amountMinor === '7000' && withPayable.status === 'UNKNOWN');
}

console.log('═══ ٧ · بطاقة ٦ (C4): محروسة بالتغطية + الصياغة المعتمدة ═══');
{
  const cover = (over) => ({ allSucceeded: true, anyNoCoverage: false, anyFailed: false, ...over });
  const zero = buildAttentionCard({ openCount: 0, top: [], coverage: cover({}), asOf: 'x' });
  check('صفر مفتوح → «ما عندك شيء عاجل الآن» (لا «كل شيء تمام»)',
    t(zero.messageKey) === 'ما عندك شيء عاجل الآن');
  check('ملاحظة الفحوص المؤجلة حاضرة دائمًا قبل Stage 13',
    zero.noteKey === 'ATTENTION_CHECKS_DEFERRED');
  const failedRun = buildAttentionCard({ openCount: 0, top: [],
    coverage: cover({ allSucceeded: false, anyFailed: true }), asOf: 'x' });
  check('فشل محوّل → UNKNOWN + «ما قدرنا نكمل» — لا طمأنة زائفة',
    failedRun.status === 'UNKNOWN' && failedRun.noteKey === 'ATTENTION_CHECKS_INCOMPLETE');
  const partial = buildAttentionCard({ openCount: 2, top: [],
    coverage: cover({ allSucceeded: false, anyNoCoverage: true }), asOf: 'x' });
  check('بلا تغطية (استرداد/مطابقة لم تجرِ) → ملاحظة هادئة صادقة',
    partial.noteKey === 'ATTENTION_COVERAGE_PARTIAL');
  const three = buildAttentionCard({ openCount: 3, top: [], coverage: cover({}), asOf: 'x' });
  check('العدّ الدقيق مع الوقت التقريبي',
    three.headline.scalar === '3' && t(three.messageKey, three.messageParams).includes('3'));
}

console.log('═══ ٨ · عنصر الصندوق: أفعال بحسب الدور بلا توسيع صلاحية ═══');
{
  const row = (over) => ({
    id: 'e1', exception_type: 'PERSONAL_BUSINESS_AMBIGUITY', state: 'OPEN',
    owner_params: { expense_date: '2026-09-01' }, acknowledged_at: null,
    occurrence: 1, first_detected_at: '2026-09-01T00:00:00Z', ...over,
  });
  const owner7 = buildInboxItem(row({}), 'BUSINESS_OWNER');
  check('المالكة تجاوب الغموض (الدالة المحكومة تسمح لها أصلًا)',
    owner7.actions.includes('ANSWER_AMBIGUITY') && owner7.actions.includes('ACK'));
  const aud7 = buildInboxItem(row({}), 'AUDITOR');
  check('المدقق قراءة فقط — لا جواب', !aud7.actions.includes('ANSWER_AMBIGUITY'));
  const ownerBank = buildInboxItem(row({ exception_type: 'UNMATCHED_BANK_TRANSACTION' }), 'BUSINESS_OWNER');
  check('حركة البنك عند المحاسبة — المالكة عرض وتصديق فقط',
    ownerBank.actions.includes('HANDLED_BY_ACCOUNTANT')
    && !ownerBank.actions.includes('ANSWER_AMBIGUITY'));
  const doc10 = buildInboxItem(row({ exception_type: 'MISSING_DOCUMENT' }), 'BUSINESS_OWNER');
  check('بلا ورقة → «أرفق الورقة»', doc10.actions.includes('ATTACH_DOCUMENT'));
  const resolved = buildInboxItem(row({ state: 'RESOLVED' }), 'BUSINESS_OWNER');
  check('المحسوم بلا أفعال', resolved.actions.length === 0);
  const acked = buildInboxItem(row({ acknowledged_at: '2026-09-02T00:00:00Z' }), 'BUSINESS_OWNER');
  check('المصدَّق لا يعرض زر تصديق ثانيًا ويبقى مفتوحًا (ACK ≠ RESOLVE)',
    !acked.actions.includes('ACK') && acked.acknowledged === true);
  check('DTO الصندوق بلا أي معرّف حقيقة مهنية — حقوله المغلقة فقط',
    JSON.stringify(Object.keys(owner7).sort()) === JSON.stringify(
      ['acknowledged', 'actions', 'firstDetectedAt', 'id', 'occurrence',
       'params', 'priority', 'stateKey', 'whatKey', 'whyKey']));
}

console.log('═══ ٩ · DTO مسلسلًا: صفر مصطلح محرَّم قيمًا ومفاتيحَ (UX-005) ═══');
{
  const asOf = '2026-09-03T10:00:00Z';
  const everything = JSON.stringify({
    cards: [
      buildCashCard({ bankComponents: [{ label: 'بنك الاختبار 1234', balanceMinor: 1n, currency: 'KWD', evidenceDate: '2026-08-31' }],
        hasBankMapping: true, unmappedActiveBankAccounts: 0,
        cashOnHand: { balanceMinor: 1n, currency: 'KWD' }, baseCurrency: 'KWD', asOf }),
      buildProfitCard(asOf),
      buildTransitCard({ gateway: null, toBank: null,
        awaited: { balanceMinor: 5n, currency: 'KWD' }, settlementDifferenceOpen: true, asOf }),
      buildRunwayCard({ cashScopeFinal: true, cashMinor: 10n, currency: 'KWD', windowDays: 30,
        historyCoveredDays: 60, inflowWindowMinor: 1n, outflowWindowMinor: 5n, asOf }),
      buildObligationsCard({ recordedPayable: { balanceMinor: 3n, currency: 'KWD' }, noTaxRegime: true, asOf }),
      buildAttentionCard({ openCount: 1, top: [], coverage: { allSucceeded: true, anyNoCoverage: false, anyFailed: false }, asOf }),
    ],
    inbox: ['SETTLEMENT_DIFFERENCE', 'PERIOD_CLOSE_ISSUE', 'MISSING_WEBHOOK',
      'UNMATCHED_BANK_TRANSACTION', 'FAILED_REFUND', 'PERSONAL_BUSINESS_AMBIGUITY',
      'SUSPECTED_DUPLICATE', 'MISSING_DOCUMENT'].map((type) => buildInboxItem({
        id: 'x', exception_type: type, state: 'OPEN', owner_params: {},
        acknowledged_at: null, occurrence: 2, first_detected_at: asOf,
      }, 'BUSINESS_OWNER')),
  });
  // نُترجم كل مفتاح مفردات يظهر في التسلسل إلى نصه النهائي ونفحصه أيضًا
  let rendered = everything;
  for (const [k, v] of Object.entries(OWNER_VOCAB)) rendered = rendered.split(`"${k}"`).join(`"${v}"`);
  const hit = hasForbidden(everything) ?? hasForbidden(rendered);
  check('التسلسل الكامل (قيم + مفاتيح + النص المترجم) نظيف', !hit, hit ?? '');
}

console.log('═══ ١٠ · وضع الفاتورة الضريبي: سلطة سجل Stage 2 لا العميل ═══');
{
  // محلّل Stage 2 **الحقيقي** عبر نمط استهلاكه المعتمد (ترجمة .acc-test
  // كما في test-registers) — يُحقن في مساعد Stage 11، لا محرك ثانيًا
  execSync(
    'npx tsc src/lib/accounting/*.ts --outDir .acc-test --module nodenext --moduleResolution nodenext --target es2022 --strict',
    { stdio: 'inherit' });
  const { resolveVatStatus } = await import('../../.acc-test/resolvers.js');
  const KW_RULE = {
    rule_id: 'REG-KW-008', version: 1, jurisdiction: 'Kuwait', regulator: null,
    requirement: 'No VAT regime exists', effective_from_text: '—', effective_to_text: '—',
    effective_from_precision: 'NONE', effective_from: null, effective_from_year: null,
    effective_to_precision: 'NONE', effective_to: null, effective_to_year: null,
    source: 'test', status: 'ACTIVE', confidence: '🟢', system_impact: 'VAT status = NO_TAX_REGIME',
  };
  const posture = resolveInvoiceTaxPosture([KW_RULE], '2026-09-03', resolveVatStatus);
  check('القاعدة السارية → NO_TAX_REGIME بنسخة السجل',
    posture.status === 'NO_TAX_REGIME' && posture.ruleId === 'REG-KW-008' && posture.ruleVersion === 1);
  check('لا نسبة تُصنَّع أبدًا (rate = null، ليست "0")', posture.rate === null);
  check('بلا صفوف سجل → فشل مغلق TAX_POSTURE_UNRESOLVED', (() => {
    try { resolveInvoiceTaxPosture([], '2026-09-03', resolveVatStatus); return false; }
    catch (e) { return /TAX_POSTURE_UNRESOLVED/.test(e.message); }
  })());
  check('قاعدة DRAFT (جاهزية فقط) → فشل مغلق لا سريان', (() => {
    try { resolveInvoiceTaxPosture([{ ...KW_RULE, status: 'DRAFT' }], '2026-09-03', resolveVatStatus); return false; }
    catch (e) { return /TAX_POSTURE_UNRESOLVED/.test(e.message); }
  })());
  const lines = buildDraftLines([
    { product_id: 'p1', quantity: '2', unit_price_minor: '4500', currency: 'KWD',
      tax_status: 'TAXABLE', tax_rate: '0', evil: 'x' },
    { product_id: 'p2', quantity: '1', unit_price_minor: '1000', currency: 'KWD',
      tax_status: 'ZERO_RATED' },
  ], posture);
  check('اقتراح العميل الضريبي يُسقط بنيويًا وكل سطر يُختم سلطويًا',
    lines.length === 2 && lines.every((l) => l.tax_status === 'NO_TAX_REGIME'));
  check('لا tax_rate ولا حقول دخيلة تمر (قائمة بيضاء)',
    lines.every((l) => !('tax_rate' in l) && !('evil' in l)));
  check('سطر ناقص الحقول التجارية يُرفض قبل Stage 4', (() => {
    try { buildDraftLines([{ quantity: '1' }], posture); return false; }
    catch { return true; }
  })());
}

console.log(`\n  مفردات وDTO المالكة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
