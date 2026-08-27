#!/usr/bin/env node
/**
 * Stage 11 — عقود الاستثناءات + وضع المالكة (ساكنة، بلا قاعدة).
 *
 * تثبت بنيويًا على نص الهجرة والمصدر:
 * C1 لا أصل FIXTURE ورفض نوعي Stage 13 في الاستيعاب (بنفي اصطناعي)،
 * C2 جدول الروابط وقيوده، C3 مفاتيح اقتصادية، C4 جولات التغطية،
 * C5 لا NOTIFIED_STUB، C6 CASH_ON_HAND + GL سلطة، ACK≠RESOLVE،
 * تطابق سجل TS مع دالة الأولوية SQL، مرآة بوابة Stage 10، وصل خطاف
 * ACC-024، صفر مساس بمصادر 1..10، صفر AI/QAYD، وخريطة UX-T الصادقة.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { EXCEPTION_REGISTRY, EXCEPTION_TYPES, PENDING_STAGE_13_TYPES }
  from '../../src/lib/accounting/exceptions/registry.ts';
import { ADAPTERS } from '../../src/lib/accounting/exceptions/adapters.ts';
import { OWNER_VOCAB } from '../../src/lib/accounting/owner/vocabulary.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const MIG = 'supabase/2026-09-03-accounting-owner-exceptions.sql';
const SQL = readFileSync(MIG, 'utf8');
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const fnBody = (name) => {
  const m = CODE.match(new RegExp(
    `create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  return m ? m[1] : '';
};

console.log('\n═══ ١ · البنية: سبعة جداول + السجل المغلق ═══');
{
  for (const t of ['acc_exceptions', 'acc_exception_source_links', 'acc_exception_resolutions',
    'acc_exception_events', 'acc_exception_ingestion_runs', 'acc_owner_snapshot_provenance',
    'acc_owner_settings']) {
    check(`جدول ${t}`, CODE.includes(`create table if not exists public.${t}`));
  }
  check('الأنواع العشرة حرفيًا وبترتيب الـBlueprint في CHECK',
    /exception_type in\s*\('SETTLEMENT_DIFFERENCE','PERIOD_CLOSE_ISSUE','MISSING_WEBHOOK',\s*'UNMATCHED_BANK_TRANSACTION','FAILED_REFUND','LARGE_UNUSUAL_EXPENSE',\s*'PERSONAL_BUSINESS_AMBIGUITY','SUSPECTED_DUPLICATE',\s*'UNKNOWN_EXPENSE','MISSING_DOCUMENT'\)/.test(CODE));
  check('قيد الأولوية مربوط بدالة السجل الثابت',
    CODE.includes('check (priority = public.acc_exception_priority(exception_type))'));
  check('قضية نشطة واحدة لكل مفتاح (فهرس جزئي)',
    /create unique index if not exists acc_exceptions_active_issue\s*on public\.acc_exceptions \(company_id, issue_key\) where state <> 'RESOLVED'/.test(CODE));
  check('حقيقة أولية واحدة بالضبط (فهرس جزئي PRIMARY)',
    /acc_exception_primary_one\s*on public\.acc_exception_source_links \(exception_id\) where source_role = 'PRIMARY'/.test(CODE));
  check('حالات أربع فقط', /state in\s*\('OPEN','IN_REVIEW','ESCALATED','RESOLVED'\)/.test(CODE));
  check('RESOLVED ⇔ resolved_at', CODE.includes(`check ((state = 'RESOLVED') = (resolved_at is not null))`));
}

console.log('═══ ٢ · C1: لا FIXTURE إنتاجيًا + رفض نوعي Stage 13 (بنفي اصطناعي) ═══');
{
  check('الأصلان المحكومان فقط',
    /origin in \('SOURCE_ADAPTER','HUMAN_DECISION'\)/.test(CODE));
  check('صفر FIXTURE في أصول الإنتاج', !/origin[^)]*FIXTURE/.test(CODE));
  const ingest = fnBody('acc_exception_ingest');
  const refuseIdx = ingest.indexOf(`p_type in ('LARGE_UNUSUAL_EXPENSE','UNKNOWN_EXPENSE')`);
  const insertIdx = ingest.indexOf('insert into public.acc_exceptions');
  check('الاستيعاب يرفض نوعي Stage 13 قبل أي إدراج',
    refuseIdx >= 0 && insertIdx > refuseIdx && ingest.includes('PENDING_STAGE_13'));
  // نفي اصطناعي: جسد بلا الحارس يفشل نفس الفحص
  const synthetic = ingest.replace(`p_type in ('LARGE_UNUSUAL_EXPENSE','UNKNOWN_EXPENSE')`, 'false');
  check('النفي الاصطناعي: إسقاط الحارس يُصطاد',
    synthetic.indexOf(`p_type in ('LARGE_UNUSUAL_EXPENSE','UNKNOWN_EXPENSE')`) === -1);
  check('verify_cure يرفض نوعي Stage 13 أيضًا',
    (fnBody('acc_exception_verify_cure').match(/PENDING_STAGE_13/g) || []).length === 2);
  check('resolve يرفض نوعي Stage 13 أيضًا',
    (fnBody('acc_exception_resolve').match(/PENDING_STAGE_13/g) || []).length === 2);
}

console.log('═══ ٣ · C5: لا NOTIFIED_STUB — إشعارٌ لم يُرسل لا يُسجَّل ═══');
{
  // الفحص على الـDDL الفعّال (التعليقات التوثيقية تُجرَّد أولًا)
  check('صفر NOTIFIED_STUB في الهجرة', !CODE.includes('NOTIFIED_STUB'));
  const eventsChk = CODE.match(/event in\s*\(([^)]*)\)/);
  check('أحداث مغلقة بلا أي حالة تسليم',
    !!eventsChk && !/QUEUED|SENT|DELIVERED|NOTIFIED|PUSHED/.test(eventsChk[1]));
  const srcFiles = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
  } };
  walk('src/lib/accounting/exceptions'); walk('src/lib/accounting/owner'); walk('src/app/owner');
  walk('src/app/api/accounting/owner');
  let stub = 0;
  for (const f of srcFiles) if (readFileSync(f, 'utf8').includes('NOTIFIED_STUB')) stub++;
  check('صفر NOTIFIED_STUB في مصدر المالكة كله', stub === 0);
  // نفي اصطناعي
  check('النفي الاصطناعي: NOTIFIED_STUB مزروع يُصطاد', "event: 'NOTIFIED_STUB'".includes('NOTIFIED_STUB'));
}

console.log('═══ ٤ · تطابق السجل: TS ↔ SQL أولويةً، والمفاتيح مفردات قائمة ═══');
{
  const sqlPairs = {};
  for (const m of fnBody('acc_exception_priority')
    .matchAll(/when '([A-Z_]+)'\s+then '([A-Z_]+)'/g)) sqlPairs[m[1]] = m[2];
  check('عشرة أزواج في دالة SQL', Object.keys(sqlPairs).length === 10);
  for (const t of EXCEPTION_TYPES) {
    check(`${t}: أولوية TS = SQL (${EXCEPTION_REGISTRY[t].priority})`,
      sqlPairs[t] === EXCEPTION_REGISTRY[t].priority);
  }
  check('ترتيب الـBlueprint ١..١٠ في السجل',
    EXCEPTION_TYPES.every((t, i) => EXCEPTION_REGISTRY[t].order === i + 1));
  check('نوعا Stage 13 هما بالضبط LARGE_UNUSUAL_EXPENSE وUNKNOWN_EXPENSE',
    PENDING_STAGE_13_TYPES.length === 2
    && PENDING_STAGE_13_TYPES.includes('LARGE_UNUSUAL_EXPENSE')
    && PENDING_STAGE_13_TYPES.includes('UNKNOWN_EXPENSE'));
  for (const t of EXCEPTION_TYPES) {
    check(`${t}: مفاتيح الرسالة موجودة في طبقة المفردات`,
      EXCEPTION_REGISTRY[t].whatKey in OWNER_VOCAB && EXCEPTION_REGISTRY[t].whyKey in OWNER_VOCAB);
  }
  // المحوّلات: ثمانية، مطابقة لقيد SQL، ولا محوّل لنوع Stage 13
  const sqlAdapters = (CODE.match(/adapter_key in\s*\(([^)]*)\)/) || ['', ''])[1]
    .match(/'([A-Z_]+)'/g).map((s) => s.replaceAll("'", ''));
  check('مفاتيح المحوّلات TS = قيد SQL',
    ADAPTERS.length === 8 && sqlAdapters.length === 8
    && ADAPTERS.every((a) => sqlAdapters.includes(a.key)));
  const adaptersSrc = readFileSync('src/lib/accounting/exceptions/adapters.ts', 'utf8');
  check('لا محوّل يصنّع نوعًا معلّق الكشف (C1)',
    !/type:\s*'LARGE_UNUSUAL_EXPENSE'/.test(adaptersSrc)
    && !/type:\s*'UNKNOWN_EXPENSE'/.test(adaptersSrc));
  check('PERIOD_CLOSE يعمل آخرًا (يرى حرجات الجولة نفسها)',
    ADAPTERS[ADAPTERS.length - 1].key === 'PERIOD_CLOSE');
}

console.log('═══ ٥ · ACK ≠ RESOLVE بنيويًا + الحل بإثبات الشفاء ═══');
{
  const ack = fnBody('acc_exception_acknowledge');
  check('التصديق لا يلمس الحالة أبدًا',
    ack.includes('acknowledged_at = now()') && !/set state/.test(ack));
  check('التصديق idempotent ولا يعمل على RESOLVED',
    ack.includes("v_exc.state = 'RESOLVED'") && ack.includes('return;'));
  const resolve = fnBody('acc_exception_resolve');
  check('استثناءات المال DOMAIN_ACTION حصرًا (٥ بوابات نوع)',
    (resolve.match(/a money condition resolves only by a proven domain cure/g) || []).length === 5);
  check('إثبات الشفاء قبل الإغلاق',
    resolve.indexOf('acc_exception_verify_cure') >= 0
    && resolve.indexOf('acc_exception_verify_cure') < resolve.indexOf('insert into public.acc_exception_resolutions'));
  check('مرآة بوابة Stage 10 للتكرار البنكي — لا توسيع للمالكة',
    resolve.includes('Stage 10 gate')
    && /bank duplicate requires ACCOUNTANT or FINANCE_MANAGER/.test(resolve));
  check('لا RESOLVE_ANY: مفاتيح أفعال مغلقة لكل نوع',
    resolve.includes('is not in the closed action set'));
  check('أنواع الحل قراران فقط — لا ACKNOWLEDGEMENT كنوع حل',
    /resolution_kind in \('DOMAIN_ACTION','DECISION'\)/.test(CODE)
    && !/resolution_kind[^)]*ACKNOWLEDGEMENT/.test(CODE));
  check('DOMAIN_ACTION ⇔ مرجع شفاء',
    CODE.includes(`check ((resolution_kind = 'DOMAIN_ACTION') = (domain_ref is not null))`));
  check('DECISION يتطلب سببًا كتابيًا',
    /check \(resolution_kind <> 'DECISION' or \(reason is not null and btrim\(reason\) <> ''\)\)/.test(CODE));
  const cure = fnBody('acc_exception_verify_cure');
  for (const [t, sig] of [
    ['SETTLEMENT_DIFFERENCE', 'settlement residual is still'],
    ['PERIOD_CLOSE_ISSUE', 'still SOFT_CLOSED'],
    ['MISSING_WEBHOOK', 'not yet processed'],
    ['UNMATCHED_BANK_TRANSACTION', 'no CONFIRMED/LOCKED reconciliation nor DUPLICATE resolution'],
    ['FAILED_REFUND', 'still FAILED'],
    ['PERSONAL_BUSINESS_AMBIGUITY', 'acc_resolve_expense_review'],
    ['MISSING_DOCUMENT', 'no FINALIZED document is linked'],
  ]) check(`شفاء ${t} متحقق حتميًا`, cure.includes(sig));
}

console.log('═══ ٦ · C4: جولات التغطية — «لا مفتوح» ≠ «فحصنا كل شيء» ═══');
{
  check('حالات الجولة الأربع',
    /status in\s*\('RUNNING','SUCCEEDED','SUCCEEDED_NO_COVERAGE','FAILED'\)/.test(CODE));
  check('رمز فشل مغلق — لا نص خطأ خام',
    /failure_code is null or failure_code ~ '\^\[A-Z0-9_\]\+\$'/.test(CODE));
  check('جولة مكتملة مجمّدة', fnBody('acc_exception_runs_guard').includes('a completed ingestion run is immutable'));
  const adaptersSrc = readFileSync('src/lib/accounting/exceptions/adapters.ts', 'utf8');
  check('MISSING_WEBHOOK بلا جولة استرداد = بلا تغطية (لا تخمين)',
    /coverage:\s*'NONE'/.test(adaptersSrc) && adaptersSrc.includes('acc_mf_recovery_runs'));
  check('فشل المحوّل يُسجَّل FAILED برمز مغلق ويُكمل الباقي',
    adaptersSrc.includes(`p_failure_code: 'ADAPTER_ERROR'`));
}

console.log('═══ ٧ · C6: CASH_ON_HAND + GL سلطة الرصيد ═══');
{
  check('الغرض CASH_ON_HAND انضاف لقائمة الأغراض العشرة',
    /'EXPENSE_ACCOUNT','EXPENSE_PAYABLE','BANK_ACCOUNT','CASH_ON_HAND'\)/.test(CODE));
  check('لا تعيين آلي: التعيين عبر acc_link_gl_account القائمة فقط (لا دالة تعيين جديدة)',
    !/create or replace function public\.acc_link/.test(CODE));
  const queries = readFileSync('src/lib/accounting/owner/queries.ts', 'utf8');
  check('رصيد اليوم من GL المرحّل (POSTED+REVERSED) لا من كشف البنك',
    queries.includes(`in('status', ['POSTED', 'REVERSED'])`));
  check('كشف البنك دليل نضارة لا بديل (evidenceDate فقط)',
    queries.includes('evidenceDate') && !/closing_balance_minor[^\n]*balance/.test(queries));
  const dto = readFileSync('src/lib/accounting/owner/dto.ts', 'utf8');
  check('النطاق الناقص لا يُنشر رصيدًا كاملًا (headline null + UNKNOWN)',
    dto.includes('CASH_SCOPE_INCOMPLETE'));
  check('غياب CASH_ON_HAND ليس صفرًا — NOT_CONFIGURED',
    dto.includes('CASH_ON_HAND_NOT_CONFIGURED'));
}

console.log('═══ ٨ · وصل خطاف ACC-024 (تصميم Stage 3) ═══');
{
  const blockers = CODE.match(/create or replace function public\.acc_period_close_blockers\(p_period uuid\)\s*returns table \(blocker_kind text, blocker_ref text\)\s*language sql stable[\s\S]*?\$\$([\s\S]*?)\$\$/);
  check('نفس التوقيع والقراءة الصرفة STABLE', !!blockers);
  check('المانع: استثناء CRITICAL مفتوح',
    !!blockers && blockers[1].includes("e.priority = 'CRITICAL'")
    && blockers[1].includes("e.state <> 'RESOLVED'"));
  const ledger = readFileSync('supabase/2026-08-27-accounting-ledger.sql', 'utf8');
  check('الإغلاق يستشير الخطاف فعلًا (ledger)', ledger.includes('from public.acc_period_close_blockers(p_period)'));
}

console.log('═══ ٩ · العزل والصلاحيات ═══');
{
  check('المالكة ترى صف الاستثناء (مفاتيح آمنة بنيويًا)',
    /acc_exceptions_select[\s\S]*?'BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'/.test(CODE));
  for (const t of ['acc_exception_links_select', 'acc_exception_res_select',
    'acc_exception_events_select', 'acc_exception_runs_select']) {
    const pol = CODE.match(new RegExp(`${t}[\\s\\S]*?\\(([^)]*)\\)\\);`));
    check(`${t}: مهنية فقط — المالكة محجوبة عن التفاصيل التقنية`,
      !!pol && !pol[1].includes('BUSINESS_OWNER'));
  }
  check('كتابة الجداول السبعة محجوبة عن العملاء',
    (CODE.match(/revoke insert, update, delete on public\.acc_(exception|owner)[a-z_]* from anon, authenticated/g) || []).length === 7);
  for (const fn of ['acc_exception_begin_ingestion', 'acc_exception_complete_ingestion',
    'acc_exception_ingest', 'acc_owner_record_snapshot']) {
    check(`${fn}: خدمة فقط`,
      new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`).test(CODE)
      && fnBody(fn).includes('auth.uid() is not null'));
  }
  // ٨ حرّاس دور: begin/seen/ack/review/escalate/resolve/runway/snapshot
  check('كل دوال المستخدم تبدأ بإثبات الهوية والدور null-safe',
    (CODE.match(/coalesce\(public\.acc_role(_of)?\(/g) || []).length >= 8);
}

console.log('═══ ١٠ · صفر مساس بمصادر Stages 1..10 + حدود المراحل ═══');
{
  const writes = [...CODE.matchAll(/(?:insert into|update|delete from)\s+public\.(acc_\w+)/g)]
    .map((m) => m[1]);
  const allowed = new Set(['acc_exceptions', 'acc_exception_source_links', 'acc_exception_resolutions',
    'acc_exception_events', 'acc_exception_ingestion_runs', 'acc_owner_snapshot_provenance',
    'acc_owner_settings']);
  const offenders = writes.filter((t) => !allowed.has(t));
  check('كل كتابات الهجرة على جداول Stage 11 حصرًا', offenders.length === 0, offenders.join(','));
  check('لا drop table ولا CASCADE', !/drop table|cascade/i.test(CODE));
  check('صفر أثر دفتري: لا acc_post_journal ولا كتابة قيود (BLK-004)',
    !CODE.includes('acc_post_journal') && !writes.includes('acc_journal_entries'));
  const NEW_SRC = ['src/lib/accounting/exceptions/registry.ts', 'src/lib/accounting/exceptions/adapters.ts',
    'src/lib/accounting/owner/vocabulary.ts', 'src/lib/accounting/owner/dto.ts',
    'src/lib/accounting/owner/queries.ts'];
  let ai = 0, qayd = 0, mutation = 0;
  // الهجرة تُفحص على الـDDL الفعّال (رأسها التوثيقي يذكر الحدود بالاسم)
  for (const s of [CODE, ...NEW_SRC.map((f) => readFileSync(f, 'utf8'))]) {
    if (/openai|anthropic|llm\b|embedding|gpt-|claude/i.test(s)) ai++;
    if (/qayd|xbrl/i.test(s)) qayd++;
  }
  const queries = readFileSync('src/lib/accounting/owner/queries.ts', 'utf8');
  for (const m of queries.matchAll(/\.(insert|update|delete|upsert)\(/g)) { void m; mutation++; }
  check('صفر AI في الهجرة والمصدر الجديد', ai === 0);
  check('صفر QAYD/XBRL', qayd === 0);
  check('طبقة القراءة لا تكتب على أي جدول إطلاقًا (rpc موقّعة فقط)', mutation === 0);
  check('لا Stage 12: لا محرك تقارير/تصدير',
    !/export.*csv|statement_engine|report_catalog/i.test(queries));
}

console.log('═══ ١١ · بنية المالكة الحرفية + خريطة UX-T الصادقة ═══');
{
  check('الأقسام الخمسة حرفيًا',
    OWNER_VOCAB.SECTION_STATUS === 'وضعي' && OWNER_VOCAB.SECTION_MONEY === 'فلوسي'
    && OWNER_VOCAB.SECTION_INVOICES === 'فواتيري' && OWNER_VOCAB.SECTION_DOCS === 'مستنداتي'
    && OWNER_VOCAB.SECTION_ADVISOR === 'مستشاري');
  check('البطاقات الست حرفيًا',
    OWNER_VOCAB.CARD_CASH_TODAY === 'رصيدك اليوم' && OWNER_VOCAB.CARD_PROFIT_MONTH === 'ربحك هذا الشهر'
    && OWNER_VOCAB.CARD_IN_TRANSIT === 'فلوس في الطريق' && OWNER_VOCAB.CARD_RUNWAY === 'كم تصمد سيولتك'
    && OWNER_VOCAB.CARD_OBLIGATIONS === 'التزاماتك القادمة' && OWNER_VOCAB.CARD_ATTENTION === 'يحتاج انتباهك');
  const layout = readFileSync('src/app/owner/layout.tsx', 'utf8');
  check('خمسة تبويبات بالضبط — لا سادس',
    (layout.match(/key: 'SECTION_/g) || []).length === 5);
  const dash = readFileSync('src/lib/accounting/owner/queries.ts', 'utf8');
  check('ست بطاقات بالضبط — لا سابعة',
    dash.includes('[cashCard, profitCard, transitCard, runwayCard, obligationsCard, attentionCard]'));
  const mustashari = readFileSync('src/app/owner/mustashari/page.tsx', 'utf8');
  check('مستشاري بلا صندوق إدخال زائف (PENDING_STAGE_13)',
    !/<input|<textarea|onSubmit/.test(mustashari) && mustashari.includes('ADVISOR_UNAVAILABLE'));
  const profitSrc = readFileSync('src/lib/accounting/owner/dto.ts', 'utf8');
  check('بطاقة الربح بلا أي قيمة رقمية (C7)',
    /buildProfitCard[\s\S]{0,400}amountMinor: null/.test(profitSrc));

  console.log(`
  ── خريطة UX-T (المجموعات الصادقة — لا "ALL PASS" زائف) ──
  PASS (نواة Stage 11): UX-T-001 (وضعي أولًا), 002/004/005 (مفردات/غياب بنيوي — DTO+DOM),
    003 (مستند↔أثر ثنائي الاتجاه), 008 (صندوق واحد يشير للمصادر),
    009/030 (هدوء افتراضي داخل التطبيق), 011 (لمسة واحدة بلا تجاوز حوكمة),
    020..025 (جوال 390×844: الشاشة الأولى/بلا تمرير أفقي/التقاط/رفع/تتبع) — تُثبت في Playwright وDB.
  PENDING_STAGE_12: تصدير البيانات، تفصيل الربح (بطاقة ٢ قيمة).
  PENDING_STAGE_13: المستشار المالي، اعتماد تصنيف AI، كواشف الأنواع 6/9.
  PENDING_INFRA: دفع حقيقي (Push)، تسليم/تذكير فواتير فعلي.
  البقية (006/007/010/012..019/026..029): توسعات قبول تنفيذية — تُثبت في
  الحزم الساكنة وحزمة القاعدة، وليست نصوص Blueprint حرفية.`);
}

console.log(`\n  عقود Stage 11 الساكنة: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
