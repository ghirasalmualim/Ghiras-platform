/**
 * غراس للمحاسبة — Stage 11: تجميع بيانات وضع المالكة (خادم فقط).
 *
 * المالكة محجوبة عن الجداول التقنية بتصميم Stages 3..10 — فيقرأ
 * الخادم بمفتاح الخدمة **بعد** إثبات عضويتها ودورها، ويُسقط عبر
 * بنّائي DTO الصرفة حصرًا (لا حقل مهني يتسلسل). سلطة الرصيد: GL
 * المرحّل على الحسابات المعيَّنة (C6) — كشف البنك دليل نضارة فقط.
 * صفر كتابة على حقائق 1..10؛ الكتابات الوحيدة: جولات الاستيعاب
 * ولقطات الإسناد عبر دوالها الموقّعة.
 */
import type { ServiceDb } from '../exceptions/adapters.ts';
import { runIngestion } from '../exceptions/adapters.ts';
import type { IngestionRunSummary } from '../exceptions/adapters.ts';
import { sortOpenExceptions } from '../exceptions/registry.ts';
import type { ExceptionType } from '../exceptions/registry.ts';
import {
  buildAttentionCard, buildCashCard, buildInboxItem, buildObligationsCard,
  buildProfitCard, buildRunwayCard, buildTransitCard,
} from './dto.ts';
import type { DashboardCard, ExplainNode, InboxItemDTO, OwnerStatus } from './dto.ts';
import type { OwnerKey } from './vocabulary.ts';

const need = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
};

const big = (v: unknown): bigint => BigInt(String(v ?? 0));

// ── سياق المالكة: عضوياتها وشركاتها والعملات ──
export interface OwnerContext {
  companies: { id: string; name: string; role: string; baseCurrency: string }[];
  currencies: { code: string; minorUnit: number; symbol: string | null }[];
}

const OWNER_SURFACE_ROLES = ['BUSINESS_OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER', 'AUDITOR'];

export async function getOwnerContext(db: ServiceDb, userId: string): Promise<OwnerContext> {
  const members = need<any[]>(await db.from('acc_company_members')
    .select('company_id, role, acc_companies(id, legal_name, display_name, base_currency)')
    .eq('user_id', userId), 'memberships');
  const currencies = need<any[]>(await db.from('acc_currencies')
    .select('code, minor_unit, symbol'), 'currencies');
  return {
    companies: members
      .filter((m) => OWNER_SURFACE_ROLES.includes(m.role) && m.acc_companies)
      .map((m) => ({
        id: m.company_id,
        name: m.acc_companies.display_name || m.acc_companies.legal_name,
        role: m.role,
        baseCurrency: m.acc_companies.base_currency,
      })),
    currencies: currencies.map((c) => ({
      code: c.code, minorUnit: c.minor_unit, symbol: c.symbol ?? null,
    })),
  };
}

/** دور المستخدم في الشركة عبر مفتاح الخدمة — fail-closed */
export async function roleOf(db: ServiceDb, companyId: string, userId: string): Promise<string> {
  const rows = need<any[]>(await db.from('acc_company_members')
    .select('role').eq('company_id', companyId).eq('user_id', userId), 'membership');
  return rows[0]?.role ?? '';
}

// ── ميكانيكا GL: أرصدة الحسابات المعيَّنة (POSTED + REVERSED) ──
interface GlData {
  entries: Map<string, { status: string; entry_date: string; source_id: string }>;
  linesByAccount: Map<string, { side: string; amount: bigint; entryId: string }[]>;
}

async function loadGl(db: ServiceDb, companyId: string, accountIds: string[]): Promise<GlData> {
  const entries = need<any[]>(await db.from('acc_journal_entries')
    .select('id, status, entry_date, source_id').eq('company_id', companyId)
    .in('status', ['POSTED', 'REVERSED']).limit(10000), 'journal entries');
  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const linesByAccount = new Map<string, { side: string; amount: bigint; entryId: string }[]>();
  if (accountIds.length > 0) {
    const lines = need<any[]>(await db.from('acc_journal_lines')
      .select('account_id, side, base_amount_minor, entry_id')
      .in('account_id', accountIds).limit(10000), 'journal lines');
    for (const l of lines) {
      if (!entryMap.has(l.entry_id)) continue;
      const arr = linesByAccount.get(l.account_id) ?? [];
      arr.push({ side: l.side, amount: big(l.base_amount_minor), entryId: l.entry_id });
      linesByAccount.set(l.account_id, arr);
    }
  }
  return { entries: entryMap, linesByAccount };
}

const balanceOf = (gl: GlData, accountId: string, upTo?: string): bigint => {
  let sum = 0n;
  for (const l of gl.linesByAccount.get(accountId) ?? []) {
    const e = gl.entries.get(l.entryId);
    if (!e) continue;
    if (upTo && e.entry_date > upTo) continue;
    sum += l.side === 'DEBIT' ? l.amount : -l.amount;
  }
  return sum;
};

// ── الفواتير المستحقة (أساس «اللي ما وصل») — الحقائق الموثوقة:
//    الإجمالي − الدفعات المؤكدة (SUCCESS/SETTLED/RECONCILED) ──
export interface OutstandingInvoice {
  id: string; number: string | null; status: string; customerName: string;
  totalMinor: bigint; paidMinor: bigint; outstandingMinor: bigint;
  currency: string; issueDate: string | null; dueDate: string | null;
}

async function loadOutstandingInvoices(db: ServiceDb, companyId: string): Promise<OutstandingInvoice[]> {
  const invoices = need<any[]>(await db.from('acc_invoices')
    .select('id, invoice_number, status, total_minor, currency, customer_snapshot, issue_date, due_date')
    .eq('company_id', companyId)
    .in('status', ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'])
    .limit(2000), 'invoices');
  if (invoices.length === 0) return [];
  const payments = need<any[]>(await db.from('acc_payments')
    .select('invoice_id, amount_minor').eq('company_id', companyId)
    .in('status', ['SUCCESS', 'SETTLED', 'RECONCILED'])
    .in('invoice_id', invoices.map((i) => i.id)), 'payments');
  const paidByInvoice = new Map<string, bigint>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0n) + big(p.amount_minor));
  }
  return invoices.map((i) => {
    const total = big(i.total_minor);
    const paid = paidByInvoice.get(i.id) ?? 0n;
    return {
      id: i.id, number: i.invoice_number === null ? null : String(i.invoice_number),
      status: i.status,
      customerName: String(i.customer_snapshot?.name ?? ''),
      totalMinor: total, paidMinor: paid, outstandingMinor: total - paid,
      currency: i.currency, issueDate: i.issue_date, dueDate: i.due_date,
    };
  }).filter((i) => i.outstandingMinor > 0n);
}

// ── المكوّنات المعيَّنة: عناوين المفاتيح المطلوبة ──
interface Mappings {
  bankAccountLinks: { scope: string; accountId: string }[];
  cashOnHand: string | null;
  gatewayClearing: string[];
  cashInTransit: string[];
  expensePayable: string[];
}

async function loadMappings(db: ServiceDb, companyId: string): Promise<Mappings> {
  const links = need<any[]>(await db.from('acc_gl_account_links')
    .select('purpose, scope_key, account_id').eq('company_id', companyId), 'gl links');
  return {
    bankAccountLinks: links.filter((l) => l.purpose === 'BANK_ACCOUNT')
      .map((l) => ({ scope: l.scope_key, accountId: l.account_id })),
    cashOnHand: links.find((l) => l.purpose === 'CASH_ON_HAND')?.account_id ?? null,
    gatewayClearing: links.filter((l) => l.purpose === 'GATEWAY_CLEARING').map((l) => l.account_id),
    cashInTransit: links.filter((l) => l.purpose === 'CASH_IN_TRANSIT').map((l) => l.account_id),
    expensePayable: links.filter((l) => l.purpose === 'EXPENSE_PAYABLE').map((l) => l.account_id),
  };
}

// ── حساب اللوحة كاملة ──
export interface DashboardResult {
  cards: DashboardCard[];
  inboxTop: InboxItemDTO[];
  ingestion: IngestionRunSummary[];
  provenanceRecorded: boolean;
}

export async function computeDashboard(
  db: ServiceDb, companyId: string, actorId: string, viewerRole: string, baseCurrency: string,
): Promise<DashboardResult> {
  const asOf = new Date().toISOString();
  const today = asOf.slice(0, 10);

  // ١ · الاستيعاب أولًا — البطاقة ٦ تصف تغطية هذه الجولة نفسها
  const ingestion = await runIngestion(db, companyId, actorId);

  const mappings = await loadMappings(db, companyId);
  const bankAccounts = need<any[]>(await db.from('acc_bank_accounts')
    .select('id, bank_label, account_masked, currency, active')
    .eq('company_id', companyId), 'bank accounts');
  const accountIds = [
    ...mappings.bankAccountLinks.map((l) => l.accountId),
    ...(mappings.cashOnHand ? [mappings.cashOnHand] : []),
    ...mappings.gatewayClearing, ...mappings.cashInTransit, ...mappings.expensePayable,
  ];
  const gl = await loadGl(db, companyId, [...new Set(accountIds)]);

  // بطاقة ١ · GL سلطة الرصيد؛ آخر كشف مقبول دليل نضارة لا بديل
  const acceptedImports = need<any[]>(await db.from('acc_bank_imports')
    .select('bank_account_id, period_end, created_at').eq('company_id', companyId)
    .eq('state', 'ACCEPTED').order('created_at', { ascending: false }).limit(200), 'accepted imports');
  const latestImportPerAccount = new Map<string, any>();
  for (const imp of acceptedImports) {
    if (!latestImportPerAccount.has(imp.bank_account_id)) latestImportPerAccount.set(imp.bank_account_id, imp);
  }
  const activeBankAccounts = bankAccounts.filter((b) => b.active);
  const linkedScopes = new Set(mappings.bankAccountLinks.map((l) => l.scope));
  const bankComponents = mappings.bankAccountLinks.map((l) => {
    const acct = bankAccounts.find((b) => b.id === l.scope);
    const evidence = latestImportPerAccount.get(l.scope);
    return {
      label: acct ? `${acct.bank_label} ${acct.account_masked}` : 'حساب بنكي',
      balanceMinor: balanceOf(gl, l.accountId, today),
      currency: acct?.currency ?? baseCurrency,
      evidenceDate: evidence?.period_end ?? null,
    };
  });
  const cashCard = buildCashCard({
    bankComponents,
    hasBankMapping: mappings.bankAccountLinks.length > 0,
    unmappedActiveBankAccounts: activeBankAccounts.filter((b) => !linkedScopes.has(b.id)).length,
    cashOnHand: mappings.cashOnHand
      ? { balanceMinor: balanceOf(gl, mappings.cashOnHand, today), currency: baseCurrency }
      : null,
    baseCurrency, asOf,
  });

  // بطاقة ٢ · الربح: بلا رقم قبل Stage 12 — بنيويًا
  const profitCard = buildProfitCard(asOf);

  // بطاقة ٣ · ثلاثة مكوّنات منفصلة
  const sumAccounts = (ids: string[]): bigint =>
    ids.reduce((a, id) => a + balanceOf(gl, id, today), 0n);
  const outstanding = await loadOutstandingInvoices(db, companyId);
  const awaitedCurrencies = new Set(outstanding.map((i) => i.currency));
  const awaitedSingle = awaitedCurrencies.size <= 1;
  const awaitedTotal = outstanding.reduce((a, i) => a + i.outstandingMinor, 0n);
  const openSettlementDiff = need<any[]>(await db.from('acc_exceptions')
    .select('id').eq('company_id', companyId)
    .eq('exception_type', 'SETTLEMENT_DIFFERENCE').neq('state', 'RESOLVED').limit(1),
    'open settlement differences');
  const transitCard = buildTransitCard({
    gateway: mappings.gatewayClearing.length > 0
      ? { balanceMinor: sumAccounts(mappings.gatewayClearing), currency: baseCurrency } : null,
    toBank: mappings.cashInTransit.length > 0
      ? { balanceMinor: sumAccounts(mappings.cashInTransit), currency: baseCurrency } : null,
    awaited: awaitedSingle
      ? { balanceMinor: awaitedTotal, currency: [...awaitedCurrencies][0] ?? baseCurrency }
      : { balanceMinor: 0n, currency: baseCurrency },
    settlementDifferenceOpen: openSettlementDiff.length > 0,
    asOf,
  });
  if (!awaitedSingle) {
    // عملات مختلطة: المكوّن الثالث لا يُدّعى رقمًا واحدًا
    transitCard.components[2] = {
      ...transitCard.components[2],
      value: { amountMinor: null, currency: null }, status: 'UNKNOWN',
    };
    transitCard.headline = { amountMinor: null, currency: null, scalar: null };
    transitCard.status = 'UNKNOWN';
  }

  // بطاقة ٤ · الصمود: نافذة صريحة + نطاق نقد كامل + تاريخ كافٍ
  const settings = need<any[]>(await db.from('acc_owner_settings')
    .select('runway_window_days').eq('company_id', companyId), 'owner settings');
  const windowDays: number | null = settings[0]?.runway_window_days ?? null;
  const cashAccounts = [
    ...mappings.bankAccountLinks.map((l) => l.accountId),
    ...(mappings.cashOnHand ? [mappings.cashOnHand] : []),
  ];
  let earliest: string | null = null;
  let inflow = 0n, outflow = 0n;
  if (windowDays !== null) {
    const from = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    for (const accountId of cashAccounts) {
      for (const l of gl.linesByAccount.get(accountId) ?? []) {
        const e = gl.entries.get(l.entryId);
        if (!e) continue;
        if (earliest === null || e.entry_date < earliest) earliest = e.entry_date;
        if (e.entry_date >= from && e.entry_date <= today) {
          if (l.side === 'DEBIT') inflow += l.amount; else outflow += l.amount;
        }
      }
    }
  }
  const historyCoveredDays = earliest === null
    ? null
    : Math.floor((Date.parse(today) - Date.parse(earliest)) / 86400000);
  const runwayCard = buildRunwayCard({
    cashScopeFinal: cashCard.status === 'FINAL',
    cashMinor: cashCard.headline.amountMinor === null ? null : BigInt(cashCard.headline.amountMinor),
    currency: cashCard.headline.currency,
    windowDays, historyCoveredDays,
    inflowWindowMinor: inflow, outflowWindowMinor: outflow, asOf,
  });

  // بطاقة ٥ · الالتزامات: صدق النقص — لا AP كامل بعد
  const payableBalance = mappings.expensePayable.length > 0
    ? -sumAccounts(mappings.expensePayable)  // حساب التزام: دائن − مدين
    : null;
  const obligationsCard = buildObligationsCard({
    recordedPayable: payableBalance === null
      ? null : { balanceMinor: payableBalance, currency: baseCurrency },
    noTaxRegime: false,  // لا حقل نظام ضريبي للشركة بعد — لا اختراع سطر ضريبة
    asOf,
  });

  // بطاقة ٦ · الانتباه: من الصندوق القانوني + تغطية هذه الجولة
  const openExceptions = need<any[]>(await db.from('acc_exceptions')
    .select('id, exception_type, state, owner_params, acknowledged_at, occurrence, first_detected_at')
    .eq('company_id', companyId).neq('state', 'RESOLVED').limit(500), 'open exceptions');
  const sorted = sortOpenExceptions(openExceptions as {
    exception_type: ExceptionType; first_detected_at: string;
  }[] & typeof openExceptions);
  const inboxTop = sorted.slice(0, 3).map((r: any) => buildInboxItem(r, viewerRole));
  const attentionCard = buildAttentionCard({
    openCount: openExceptions.length,
    top: inboxTop,
    coverage: {
      allSucceeded: ingestion.every((r) => r.status === 'SUCCEEDED'),
      anyNoCoverage: ingestion.some((r) => r.status === 'SUCCEEDED_NO_COVERAGE'),
      anyFailed: ingestion.some((r) => r.status === 'FAILED'),
    },
    asOf,
  });

  const cards = [cashCard, profitCard, transitCard, runwayCard, obligationsCard, attentionCard];

  // إسناد اللقطات (REP-007) — سجل دائم لكل رقم معروض
  let provenanceRecorded = true;
  const QUERY_DEFS: Record<string, string> = {
    CASH_TODAY: 'OWNER_CASH_TODAY_V1', PROFIT_MONTH: 'OWNER_PROFIT_MONTH_V1',
    MONEY_IN_TRANSIT: 'OWNER_MONEY_IN_TRANSIT_V1', RUNWAY: 'OWNER_RUNWAY_V1',
    OBLIGATIONS: 'OWNER_OBLIGATIONS_V1', ATTENTION: 'OWNER_ATTENTION_V1',
  };
  for (const card of cards) {
    const rec = await db.rpc('acc_owner_record_snapshot', {
      p_company: companyId, p_actor: actorId, p_card_key: card.cardKey,
      p_as_of: asOf,
      p_value_minor: card.headline.amountMinor,
      p_value_scalar: card.headline.scalar,
      p_currency: card.headline.currency,
      p_status: card.status,
      p_query_def: QUERY_DEFS[card.cardKey],
      p_params: { window_days: windowDays === null ? '' : String(windowDays) },
      p_sources: [...new Set(accountIds)],
      p_policies: [],
    });
    if (rec.error) provenanceRecorded = false;
  }

  return { cards, inboxTop, ingestion, provenanceRecorded };
}

// ── فلوسي: طبقة الحركة النقدية القانونية الواحدة (C9) —
//    حركة GL على الحسابات النقدية المعيَّنة حصرًا: لا جمع «بنك +
//    دفعات» يعدّ الاستلام الواحد مرتين ──
export interface MoneyMovement {
  labelKey: OwnerKey; dateISO: string; amountMinor: string; currency: string;
  direction: 'IN' | 'OUT'; entryId: string;
}

const SOURCE_LABEL: { match: string; key: OwnerKey }[] = [
  { match: 'INVOICE', key: 'MOVEMENT_FROM_INVOICE' },
  { match: 'PAYMENT', key: 'MOVEMENT_FROM_INVOICE' },
  { match: 'EXPENSE', key: 'MOVEMENT_FROM_EXPENSE' },
  { match: 'REFUND', key: 'MOVEMENT_FROM_REFUND' },
  { match: 'SETTLEMENT', key: 'MOVEMENT_FROM_SETTLEMENT' },
  { match: 'BANK', key: 'MOVEMENT_FROM_BANK' },
];

export interface MoneyResult {
  status: OwnerStatus;
  movementsIn: MoneyMovement[];
  movementsOut: MoneyMovement[];
  totalInMinor: string | null;
  totalOutMinor: string | null;
  currency: string;
  transit: {
    gatewayMinor: string | null;   // null = غير مهيأ، ليس صفرًا
    toBankMinor: string | null;
    status: OwnerStatus;
  };
  awaited: {
    invoices: { id: string; number: string | null; customerName: string;
      outstandingMinor: string; currency: string; statusKey: OwnerKey }[];
    totalMinor: string | null;
  };
}

const INVOICE_STATUS_KEY: Record<string, OwnerKey> = {
  DRAFT: 'INVOICE_STATUS_DRAFT', ISSUED: 'INVOICE_STATUS_ISSUED',
  SENT: 'INVOICE_STATUS_SENT', PARTIALLY_PAID: 'INVOICE_STATUS_PARTIALLY_PAID',
  PAID: 'INVOICE_STATUS_PAID', OVERDUE: 'INVOICE_STATUS_OVERDUE',
};
export const invoiceStatusKey = (s: string): OwnerKey =>
  INVOICE_STATUS_KEY[s] ?? 'INVOICE_STATUS_OTHER';

export async function computeMoney(
  db: ServiceDb, companyId: string, baseCurrency: string, monthISO: string,
): Promise<MoneyResult> {
  const mappings = await loadMappings(db, companyId);
  const cashAccounts = [
    ...mappings.bankAccountLinks.map((l) => l.accountId),
    ...(mappings.cashOnHand ? [mappings.cashOnHand] : []),
  ];
  const outstanding = await loadOutstandingInvoices(db, companyId);
  const awaitedCurrencies = new Set(outstanding.map((i) => i.currency));
  const awaited = {
    invoices: outstanding.map((i) => ({
      id: i.id, number: i.number, customerName: i.customerName,
      outstandingMinor: i.outstandingMinor.toString(), currency: i.currency,
      statusKey: invoiceStatusKey(i.status),
    })),
    totalMinor: awaitedCurrencies.size <= 1
      ? outstanding.reduce((a, i) => a + i.outstandingMinor, 0n).toString()
      : null,
  };
  const transitAccounts = [...mappings.gatewayClearing, ...mappings.cashInTransit];
  const gl = await loadGl(db, companyId, [...new Set([...cashAccounts, ...transitAccounts])]);
  const today = new Date().toISOString().slice(0, 10);
  const sumTransit = (ids: string[]): bigint =>
    ids.reduce((a, id) => a + balanceOf(gl, id, today), 0n);
  const transit = {
    gatewayMinor: mappings.gatewayClearing.length > 0
      ? sumTransit(mappings.gatewayClearing).toString() : null,
    toBankMinor: mappings.cashInTransit.length > 0
      ? sumTransit(mappings.cashInTransit).toString() : null,
    status: (mappings.gatewayClearing.length > 0 && mappings.cashInTransit.length > 0
      ? 'FINAL' : 'NOT_CONFIGURED') as OwnerStatus,
  };
  if (cashAccounts.length === 0) {
    return {
      status: 'NOT_CONFIGURED', movementsIn: [], movementsOut: [],
      totalInMinor: null, totalOutMinor: null, currency: baseCurrency, transit, awaited,
    };
  }
  const sourceIds = [...new Set([...gl.entries.values()].map((e) => e.source_id))];
  const sources = sourceIds.length
    ? need<any[]>(await db.from('acc_sources').select('id, kind').in('id', sourceIds), 'sources')
    : [];
  const kindById = new Map(sources.map((s) => [s.id, String(s.kind ?? '')]));
  const labelFor = (sourceId: string): OwnerKey => {
    const kind = (kindById.get(sourceId) ?? '').toUpperCase();
    return SOURCE_LABEL.find((s) => kind.includes(s.match))?.key ?? 'MOVEMENT_OTHER';
  };
  const monthPrefix = monthISO.slice(0, 7);
  const movementsIn: MoneyMovement[] = [];
  const movementsOut: MoneyMovement[] = [];
  let totalIn = 0n, totalOut = 0n;
  for (const accountId of cashAccounts) {
    for (const l of gl.linesByAccount.get(accountId) ?? []) {
      const e = gl.entries.get(l.entryId);
      if (!e || !e.entry_date.startsWith(monthPrefix)) continue;
      const mv: MoneyMovement = {
        labelKey: labelFor(e.source_id), dateISO: e.entry_date,
        amountMinor: l.amount.toString(), currency: baseCurrency,
        direction: l.side === 'DEBIT' ? 'IN' : 'OUT', entryId: l.entryId,
      };
      if (mv.direction === 'IN') { movementsIn.push(mv); totalIn += l.amount; }
      else { movementsOut.push(mv); totalOut += l.amount; }
    }
  }
  const byDateDesc = (a: MoneyMovement, b: MoneyMovement) => b.dateISO.localeCompare(a.dateISO);
  movementsIn.sort(byDateDesc);
  movementsOut.sort(byDateDesc);
  return {
    status: 'FINAL',
    movementsIn, movementsOut,
    totalInMinor: totalIn.toString(), totalOutMinor: totalOut.toString(),
    currency: baseCurrency, transit, awaited,
  };
}

// ── اشرح أي رقم — شجرة كاملة الإسناد لكل بطاقة (REP-006/007) ──
export async function computeExplain(
  db: ServiceDb, companyId: string, actorId: string, viewerRole: string,
  baseCurrency: string, cardKey: string,
): Promise<ExplainNode> {
  const dash = await computeDashboard(db, companyId, actorId, viewerRole, baseCurrency);
  const card = dash.cards.find((c) => c.cardKey === cardKey);
  if (!card) throw new Error('unknown card');
  const asOf = card.asOf;
  const mappings = await loadMappings(db, companyId);

  const movementChildren = async (accountIds: string[]): Promise<ExplainNode[]> => {
    if (accountIds.length === 0) return [];
    const gl = await loadGl(db, companyId, accountIds);
    const rows: { entryId: string; date: string; amount: bigint; side: string; sourceId: string }[] = [];
    for (const accountId of accountIds) {
      for (const l of gl.linesByAccount.get(accountId) ?? []) {
        const e = gl.entries.get(l.entryId);
        if (!e) continue;
        rows.push({ entryId: l.entryId, date: e.entry_date, amount: l.amount, side: l.side, sourceId: e.source_id });
      }
    }
    const sourceIds = [...new Set(rows.map((r) => r.sourceId))];
    const sources = sourceIds.length
      ? need<any[]>(await db.from('acc_sources').select('id, kind').in('id', sourceIds), 'sources')
      : [];
    const kindById = new Map(sources.map((s) => [s.id, String(s.kind ?? '').toUpperCase()]));
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map((r) => ({
      labelKey: SOURCE_LABEL.find((s) => (kindById.get(r.sourceId) ?? '').includes(s.match))?.key
        ?? ('MOVEMENT_OTHER' as OwnerKey),
      value: {
        amountMinor: (r.side === 'DEBIT' ? r.amount : -r.amount).toString(),
        currency: baseCurrency, scalar: null,
      },
      status: 'FINAL' as OwnerStatus, asOf: r.date,
      provenance: {
        queryDefKey: 'OWNER_GL_MOVEMENT_V1',
        params: { entry_date: r.date },
        sourceIds: [r.entryId],
      },
    }));
  };

  const root: ExplainNode = {
    labelKey: card.titleKey,
    value: { ...card.headline },
    status: card.status, asOf,
    ...(card.messageKey ? { noteKey: card.messageKey, noteParams: card.messageParams } : {}),
    provenance: {
      queryDefKey: `OWNER_${card.cardKey}_V1`,
      params: {},
      sourceIds: [],
    },
    children: [],
  };

  if (cardKey === 'CASH_TODAY') {
    const children: ExplainNode[] = [];
    for (let i = 0; i < mappings.bankAccountLinks.length; i++) {
      const link = mappings.bankAccountLinks[i];
      const comp = card.components[i];
      children.push({
        label: comp?.label ?? 'حساب بنكي',
        value: {
          amountMinor: comp?.value.amountMinor ?? null,
          currency: comp?.value.currency ?? null, scalar: null,
        },
        status: comp?.status ?? 'UNKNOWN', asOf,
        provenance: {
          queryDefKey: 'OWNER_GL_BALANCE_V1',
          params: { as_of: asOf.slice(0, 10) },
          sourceIds: [link.accountId],
        },
        children: await movementChildren([link.accountId]),
      });
    }
    if (mappings.cashOnHand) {
      children.push({
        labelKey: 'CASH_ON_HAND_COMPONENT',
        value: {
          amountMinor: card.components[card.components.length - 1]?.value.amountMinor ?? null,
          currency: baseCurrency, scalar: null,
        },
        status: 'FINAL', asOf,
        provenance: {
          queryDefKey: 'OWNER_GL_BALANCE_V1', params: { as_of: asOf.slice(0, 10) },
          sourceIds: [mappings.cashOnHand],
        },
        children: await movementChildren([mappings.cashOnHand]),
      });
    } else {
      children.push({
        labelKey: 'CASH_ON_HAND_COMPONENT',
        value: { amountMinor: null, currency: null, scalar: null },
        status: 'NOT_CONFIGURED', asOf, noteKey: 'CASH_ON_HAND_NOT_CONFIGURED',
      });
    }
    root.children = children;
  } else if (cardKey === 'MONEY_IN_TRANSIT') {
    const outstanding = await loadOutstandingInvoices(db, companyId);
    root.children = [
      {
        labelKey: 'TRANSIT_GATEWAY',
        value: { amountMinor: card.components[0].value.amountMinor, currency: card.components[0].value.currency, scalar: null },
        status: card.components[0].status, asOf,
        provenance: { queryDefKey: 'OWNER_GL_BALANCE_V1', params: {}, sourceIds: mappings.gatewayClearing },
        children: await movementChildren(mappings.gatewayClearing),
      },
      {
        labelKey: 'TRANSIT_TO_BANK',
        value: { amountMinor: card.components[1].value.amountMinor, currency: card.components[1].value.currency, scalar: null },
        status: card.components[1].status, asOf,
        provenance: { queryDefKey: 'OWNER_GL_BALANCE_V1', params: {}, sourceIds: mappings.cashInTransit },
        children: await movementChildren(mappings.cashInTransit),
      },
      {
        labelKey: 'TRANSIT_AWAITED',
        value: { amountMinor: card.components[2].value.amountMinor, currency: card.components[2].value.currency, scalar: null },
        status: card.components[2].status, asOf,
        provenance: {
          queryDefKey: 'OWNER_INVOICE_OUTSTANDING_V1', params: {},
          sourceIds: outstanding.map((i) => i.id),
        },
        children: outstanding.slice(0, 20).map((i) => ({
          label: i.number ? `فاتورة ${i.number} — ${i.customerName}` : i.customerName,
          value: { amountMinor: i.outstandingMinor.toString(), currency: i.currency, scalar: null },
          status: 'FINAL' as OwnerStatus, asOf,
          provenance: { queryDefKey: 'OWNER_INVOICE_OUTSTANDING_V1', params: {}, sourceIds: [i.id] },
        })),
      },
    ];
  } else if (cardKey === 'RUNWAY') {
    const cashAccounts = [
      ...mappings.bankAccountLinks.map((l) => l.accountId),
      ...(mappings.cashOnHand ? [mappings.cashOnHand] : []),
    ];
    root.children = [
      {
        labelKey: 'CARD_CASH_TODAY',
        value: { ...dash.cards[0].headline },
        status: dash.cards[0].status, asOf,
        provenance: { queryDefKey: 'OWNER_CASH_TODAY_V1', params: {}, sourceIds: cashAccounts },
      },
      {
        labelKey: 'EXPLAIN_RECENT_MOVEMENTS',
        value: { amountMinor: null, currency: null, scalar: null },
        status: 'FINAL', asOf,
        children: await movementChildren(cashAccounts),
      },
    ];
  } else if (cardKey === 'OBLIGATIONS') {
    root.children = mappings.expensePayable.length > 0
      ? [{
          labelKey: 'OBLIGATIONS_RECORDED',
          value: {
            amountMinor: card.components[0]?.value.amountMinor ?? null,
            currency: card.components[0]?.value.currency ?? null, scalar: null,
          },
          status: 'FINAL', asOf,
          provenance: { queryDefKey: 'OWNER_GL_BALANCE_V1', params: {}, sourceIds: mappings.expensePayable },
          children: await movementChildren(mappings.expensePayable),
        }]
      : [];
  } else if (cardKey === 'ATTENTION') {
    root.children = dash.inboxTop.map((i) => ({
      labelKey: i.whatKey,
      value: { amountMinor: null, currency: null, scalar: null },
      status: 'FINAL' as OwnerStatus, asOf: i.firstDetectedAt,
      provenance: { queryDefKey: 'OWNER_ATTENTION_V1', params: {}, sourceIds: [i.id] },
    }));
  }
  // PROFIT_MONTH: الجذر يشرح بصدق أن الرقم غير قابل للحساب بعد — لا أبناء زائفين

  return root;
}

// ── الصندوق كاملًا للمالكة ──
export async function listInbox(
  db: ServiceDb, companyId: string, viewerRole: string,
): Promise<InboxItemDTO[]> {
  const rows = need<any[]>(await db.from('acc_exceptions')
    .select('id, exception_type, state, owner_params, acknowledged_at, occurrence, first_detected_at')
    .eq('company_id', companyId).neq('state', 'RESOLVED').limit(200), 'open exceptions');
  return sortOpenExceptions(rows as any).map((r: any) => buildInboxItem(r, viewerRole));
}

/** الحقيقة الأولية لاستثناء — للخادم فقط (تنفيذ أفعال اللمسة الواحدة) */
export async function primarySourceOf(
  db: ServiceDb, exceptionId: string,
): Promise<{ kind: string; id: string; companyId: string; exceptionType: string } | null> {
  const exc = need<any[]>(await db.from('acc_exceptions')
    .select('id, company_id, exception_type').eq('id', exceptionId), 'exception');
  if (!exc[0]) return null;
  const links = need<any[]>(await db.from('acc_exception_source_links')
    .select('source_kind, source_id').eq('exception_id', exceptionId)
    .eq('source_role', 'PRIMARY'), 'primary link');
  if (!links[0]) return null;
  return {
    kind: links[0].source_kind, id: links[0].source_id,
    companyId: exc[0].company_id, exceptionType: exc[0].exception_type,
  };
}
