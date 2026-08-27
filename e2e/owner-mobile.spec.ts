/**
 * غراس للمحاسبة — Stage 11: قبول الجوال 390×844 + الغياب البنيوي
 * للمصطلح المهني في DOM المعروض فعليًا (UX-T-001/002/004/005/008/
 * 009/011/020..025/030 — نطاق النواة).
 *
 * الحمولات معترَضة على حدود /api/accounting/owner/* ومبنية
 * بالبنّائين الحقيقيين (نفس مسار الترجمة والمكوّنات) — صفر Staging.
 * ما هو مؤجل (Stage 12/13/بنية دفع) لا يُدّعى هنا PASS.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  buildAttentionCard, buildCashCard, buildInboxItem, buildObligationsCard,
  buildProfitCard, buildRunwayCard, buildTransitCard,
} from '../src/lib/accounting/owner/dto.ts';
import { FORBIDDEN_OWNER_TERMS, OWNER_VOCAB } from '../src/lib/accounting/owner/vocabulary.ts';

const asOf = '2026-09-03T10:00:00Z';

const inboxItems = [
  buildInboxItem({
    id: 'exc-amb', exception_type: 'PERSONAL_BUSINESS_AMBIGUITY', state: 'OPEN',
    owner_params: { expense_date: '2026-09-01' }, acknowledged_at: null,
    occurrence: 1, first_detected_at: asOf,
  }, 'BUSINESS_OWNER'),
  buildInboxItem({
    id: 'exc-hook', exception_type: 'MISSING_WEBHOOK', state: 'OPEN',
    owner_params: {}, acknowledged_at: null, occurrence: 2, first_detected_at: asOf,
  }, 'BUSINESS_OWNER'),
];

const cards = [
  buildCashCard({
    bankComponents: [{ label: 'بنك الاختبار ****1234', balanceMinor: 1250000n, currency: 'KWD', evidenceDate: '2026-08-31' }],
    hasBankMapping: true, unmappedActiveBankAccounts: 0,
    cashOnHand: { balanceMinor: 50000n, currency: 'KWD' }, baseCurrency: 'KWD', asOf,
  }),
  buildProfitCard(asOf),
  buildTransitCard({
    gateway: null, toBank: { balanceMinor: 30000n, currency: 'KWD' },
    awaited: { balanceMinor: 45000n, currency: 'KWD' },
    settlementDifferenceOpen: true, asOf,
  }),
  buildRunwayCard({
    cashScopeFinal: true, cashMinor: 1300000n, currency: 'KWD', windowDays: 30,
    historyCoveredDays: 90, inflowWindowMinor: 100000n, outflowWindowMinor: 400000n, asOf,
  }),
  buildObligationsCard({ recordedPayable: { balanceMinor: 90000n, currency: 'KWD' }, noTaxRegime: false, asOf }),
  buildAttentionCard({
    openCount: 2, top: inboxItems,
    coverage: { allSucceeded: true, anyNoCoverage: false, anyFailed: false }, asOf,
  }),
];

const fixtures: Record<string, unknown> = {
  context: {
    userId: 'u-test',
    companies: [{ id: 'co-test', name: 'مشروع الاختبار', role: 'BUSINESS_OWNER', baseCurrency: 'KWD' }],
    currencies: [{ code: 'KWD', minorUnit: 3, symbol: 'د.ك' }],
  },
  dashboard: {
    cards, inboxTop: inboxItems,
    coverage: [{ adapterKey: 'SETTLEMENT_DIFFERENCE', status: 'SUCCEEDED' }],
    provenanceRecorded: true, viewerRole: 'BUSINESS_OWNER',
  },
  inbox: { items: inboxItems, viewerRole: 'BUSINESS_OWNER' },
  money: {
    month: '2026-09', status: 'FINAL',
    movementsIn: [{ labelKey: 'MOVEMENT_FROM_INVOICE', dateISO: '2026-09-02', amountMinor: '45000', currency: 'KWD', direction: 'IN', entryId: 'je-1' }],
    movementsOut: [{ labelKey: 'MOVEMENT_FROM_EXPENSE', dateISO: '2026-09-01', amountMinor: '12000', currency: 'KWD', direction: 'OUT', entryId: 'je-2' }],
    totalInMinor: '45000', totalOutMinor: '12000', currency: 'KWD',
    transit: { gatewayMinor: null, toBankMinor: '30000', status: 'NOT_CONFIGURED' },
    awaited: {
      invoices: [{ id: 'inv-1', number: '1001', customerName: 'روضة الياسمين', outstandingMinor: '45000', currency: 'KWD', statusKey: 'INVOICE_STATUS_SENT' }],
      totalMinor: '45000',
    },
  },
  invoices: {
    invoices: [
      { id: 'inv-1', number: '1001', statusKey: 'INVOICE_STATUS_ISSUED', rawStatus: 'ISSUED', customerName: 'روضة الياسمين', totalMinor: '45000', paidMinor: '0', outstandingMinor: '45000', currency: 'KWD', issueDate: '2026-09-01', dueDate: null },
    ],
    customers: [{ id: 'cu-1', name: 'روضة الياسمين', currency: null }],
    products: [{ id: 'pr-1', name: 'اشتراك شهري', priceMinor: '45000', currency: 'KWD' }],
    viewerRole: 'BUSINESS_OWNER',
  },
  documents: {
    documents: [{
      id: 'doc-1', docType: 'RECEIPT', filename: 'فاتورة-مورد.pdf', state: 'FINALIZED',
      pageCount: 1, capturedAt: '2026-09-01T08:00:00Z',
      extracted: { vendor: 'مكتبة النور', total: '12.000' }, extractionSource: 'MANUAL',
      links: [{ kindLabelKey: 'DOCS_LINKED_EXPENSE', role: 'SOURCE' }],
    }],
  },
  explain: {
    card: 'CASH_TODAY',
    tree: {
      labelKey: 'CARD_CASH_TODAY',
      value: { amountMinor: '1300000', currency: 'KWD', scalar: null },
      status: 'FINAL', asOf,
      provenance: { queryDefKey: 'OWNER_CASH_TODAY_V1', params: {}, sourceIds: ['acct-1'] },
      children: [{
        label: 'بنك الاختبار ****1234',
        value: { amountMinor: '1250000', currency: 'KWD', scalar: null },
        status: 'FINAL', asOf,
        provenance: { queryDefKey: 'OWNER_GL_BALANCE_V1', params: {}, sourceIds: ['acct-1'] },
        children: [{
          labelKey: 'MOVEMENT_FROM_INVOICE',
          value: { amountMinor: '45000', currency: 'KWD', scalar: null },
          status: 'FINAL', asOf: '2026-09-02',
          provenance: { queryDefKey: 'OWNER_GL_MOVEMENT_V1', params: {}, sourceIds: ['je-1'] },
        }],
      }],
    },
  },
};

const posted: { url: string; body: Record<string, unknown> }[] = [];

async function wire(page: Page) {
  posted.length = 0;
  await page.route('**/api/accounting/owner/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'POST') {
      posted.push({ url, body: JSON.parse(route.request().postData() ?? '{}') });
      await route.fulfill({ json: { status: 'acknowledged', resolved: false } });
      return;
    }
    const key = ['context', 'dashboard', 'inbox', 'money', 'invoices', 'documents', 'explain']
      .find((k) => url.includes(`/owner/${k}`));
    await route.fulfill({ json: fixtures[key ?? 'context'] });
  });
}

const forbiddenIn = (text: string) => {
  const lower = text.toLowerCase();
  return FORBIDDEN_OWNER_TERMS.find((term) =>
    /[a-z]/.test(term) ? lower.includes(term.toLowerCase()) : text.includes(term));
};

/** فحص DOM: النص المعروض + aria-label + title + placeholder (لا إخفاء CSS) */
async function scanForbidden(page: Page) {
  const surface = await page.evaluate(() => {
    const parts: string[] = [document.body.innerText];
    for (const el of Array.from(document.querySelectorAll('[aria-label],[title],[placeholder]'))) {
      parts.push(el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '',
        el.getAttribute('placeholder') ?? '');
    }
    return parts.join('\n');
  });
  return forbiddenIn(surface);
}

const noHorizontalScroll = (page: Page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe('وضع المالكة على 390×844', () => {
  test.beforeEach(async ({ page }) => { await wire(page); });

  test('UX-T-001: الهبوط = وضعي، وخمسة أقسام حرفية لا سادس', async ({ page }) => {
    await page.goto('/owner');
    await expect(page.locator('[data-dashboard]')).toBeVisible();
    const nav = page.locator('nav a');
    await expect(nav).toHaveCount(5);
    for (const label of ['وضعي', 'فلوسي', 'فواتيري', 'مستنداتي', 'مستشاري']) {
      await expect(page.locator('nav')).toContainText(label);
    }
  });

  test('UX-022: البطاقات الست وأرقامها الرئيسية في الشاشة الأولى', async ({ page }) => {
    await page.goto('/owner');
    await expect(page.locator('[data-card]')).toHaveCount(6);
    for (const key of ['CASH_TODAY', 'PROFIT_MONTH', 'MONEY_IN_TRANSIT', 'RUNWAY', 'OBLIGATIONS', 'ATTENTION']) {
      const box = await page.locator(`[data-card="${key}"] [data-headline]`).boundingBox();
      expect(box, key).toBeTruthy();
      expect(box!.y + box!.height, `${key} داخل 844`).toBeLessThanOrEqual(844);
    }
  });

  test('حالات الصدق مرئية: الربح بلا رقم والغائب معلَن', async ({ page }) => {
    await page.goto('/owner');
    await expect(page.locator('[data-card="PROFIT_MONTH"]'))
      .toContainText(OWNER_VOCAB.PROFIT_NOT_READY);
    await expect(page.locator('[data-card="PROFIT_MONTH"] [data-headline]')).toContainText('—');
    await expect(page.locator('[data-card="ATTENTION"]')).toContainText('2');
  });

  test('UX-T-002/005: صفر مصطلح محرَّم في DOM المعروض — الأقسام الخمسة', async ({ page }) => {
    for (const path of ['/owner', '/owner/flusi', '/owner/fawatiri', '/owner/mustanadati', '/owner/mustashari']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const hit = await scanForbidden(page);
      expect(hit, `${path}: «${hit}»`).toBeUndefined();
    }
  });

  test('UX-T-023: صفر تمرير أفقي في المهام الأساسية', async ({ page }) => {
    for (const path of ['/owner', '/owner/flusi', '/owner/fawatiri', '/owner/mustanadati', '/owner/mustashari']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await noHorizontalScroll(page), path).toBe(true);
    }
  });

  test('UX-011: جواب الغموض لمسة واحدة عبر المسار المحكوم', async ({ page }) => {
    await page.goto('/owner');
    await page.locator('[data-card="ATTENTION"]').click();
    await expect(page.locator('[data-inbox]')).toBeVisible();
    await expect(page.locator('[data-exception="exc-amb"]'))
      .toContainText(OWNER_VOCAB.EXC_AMBIGUITY_WHAT);
    await page.locator('[data-exception="exc-amb"] [data-action="answer-business"]').click();
    await page.locator('[data-exception="exc-amb"] input').fill('مشتريات المشروع');
    await page.locator('[data-exception="exc-amb"] [data-action="confirm-answer"]').click();
    await expect.poll(() => posted.length).toBeGreaterThan(0);
    const body = posted[0].body;
    expect(body.action).toBe('answer_ambiguity');
    expect(body.answer).toBe('BUSINESS');
    expect(body.reason).toBe('مشتريات المشروع');
    expect(body.exception_id).toBe('exc-amb');
  });

  test('ACK ≠ RESOLVE: «شفته» يوثّق ولا يغلق، والحرج عند المحاسبة', async ({ page }) => {
    await page.goto('/owner');
    await page.locator('[data-card="ATTENTION"]').click();
    const hook = page.locator('[data-exception="exc-hook"]');
    await expect(hook).toContainText(OWNER_VOCAB.EXC_NEEDS_ACCOUNTANT);
    await hook.locator('[data-action="ack"]').click();
    await expect.poll(() => posted.some((p) => p.body.action === 'acknowledge')).toBe(true);
    await expect(hook).toContainText(OWNER_VOCAB.EXC_RECURRENCE.replace('{n}', '2'));
  });

  test('فلوسي: أربعة تبويبات ودرْل «اللي ما وصل بعد»', async ({ page }) => {
    await page.goto('/owner/flusi');
    await expect(page.locator('[role="tab"]')).toHaveCount(4);
    await page.locator('[role="tab"]', { hasText: OWNER_VOCAB.MONEY_TAB_AWAITED }).click();
    await expect(page.getByText('روضة الياسمين')).toBeVisible();
    await page.locator('[role="tab"]', { hasText: OWNER_VOCAB.MONEY_TAB_TRANSIT }).click();
    await expect(page.getByText(OWNER_VOCAB.STATUS_NOT_CONFIGURED)).toBeVisible();
  });

  test('فواتيري: الفعل الحقيقي حاضر و«الإرسال» صادق', async ({ page }) => {
    await page.goto('/owner/fawatiri');
    await expect(page.locator('[data-invoice="inv-1"] [data-action="mark-sent"]'))
      .toContainText(OWNER_VOCAB.INVOICE_MARK_SENT);
    await expect(page.getByText(OWNER_VOCAB.INVOICE_DELIVERY_PENDING)).toBeVisible();
    await page.locator('[data-action="new-invoice"]').click();
    await expect(page.locator('[data-create-form]')).toBeVisible();
  });

  test('مستنداتي: «وش قرينا منه» و«وش صار عليه» والتقاط حاضر', async ({ page }) => {
    await page.goto('/owner/mustanadati');
    await expect(page.locator('[data-action="capture"]')).toBeVisible();
    await expect(page.locator('[data-document="doc-1"]'))
      .toContainText(OWNER_VOCAB.DOCS_WHAT_READ);
    await expect(page.locator('[data-document="doc-1"]'))
      .toContainText(OWNER_VOCAB.DOCS_LINKED_EXPENSE);
  });

  test('مستشاري: حدود Stage 13 صادقة — لا مساعد زائف', async ({ page }) => {
    await page.goto('/owner/mustashari');
    await expect(page.locator('[data-advisor-unavailable]'))
      .toContainText(OWNER_VOCAB.ADVISOR_UNAVAILABLE);
    await expect(page.locator('input, textarea')).toHaveCount(0);
  });

  test('اشرح أي رقم: سلسلة الإسناد تُفتح من البطاقة', async ({ page }) => {
    await page.goto('/owner');
    await page.locator('[data-card="CASH_TODAY"]').click();
    await expect(page.getByRole('dialog')).toContainText(OWNER_VOCAB.EXPLAIN_TITLE);
    await expect(page.getByRole('dialog')).toContainText('بنك الاختبار');
    await expect(page.getByRole('dialog')).toContainText(OWNER_VOCAB.MOVEMENT_FROM_INVOICE);
  });
});
