/**
 * غراس للمحاسبة — Stage 11: وضع الفاتورة الضريبي من سلطة Stage 2.
 *
 * القاعدة الملزمة: كل سطر فاتورة يحمل tax_status صريحًا، لكن منتج
 * Stage 11 **لا يرمّز** الوضع القانوني — يحلّه من سجل القواعد
 * التنظيمية عبر resolveVatStatus القائمة (REG-KW-008): انتقال
 * الكويت المستقبلي من NO_TAX_REGIME يمر عبر بيانات السجل لا نشرة
 * كود. المتصفح لا يقرر الوضع القانوني أبدًا: بنّاء الأسطر يسقط أي
 * tax_status/tax_rate مقترحين من العميل بنيويًا (قائمة حقول بيضاء).
 * الغياب = فشل مغلق قبل أي مسودة — ولا تُصنَّع نسبة 0% أبدًا
 * (NO_TAX_REGIME ليست «صفر بالمئة»).
 */
import type { RegulatoryRuleVersion, TaxResolution, TaxStatus } from '../registerTypes.ts';
import { TAX_STATUSES, ruleBound } from '../registerTypes.ts';

/**
 * توقيع محلّل Stage 2 الحرفي (resolveVatStatus) — يُحقن حقنًا:
 * المسار الخادمي يمرر الدالة القائمة نفسها من ../resolvers، وهذه
 * الوحدة لا تحسب وضعًا ضريبيًا بنفسها أبدًا (لا محرك ثانيًا).
 * (شجرة Stage 1..3 المكتبية extensionless وتُستهلك عبر ترجمة
 * .acc-test في حزمها — فلا استيراد تشغيلي مباشر لها من هنا.)
 */
export type VatResolver = (
  rules: readonly RegulatoryRuleVersion[],
  jurisdiction: 'KW',
  asOf: string,
) => TaxResolution;

/** صف acc_regulatory_rules كما يصل من القاعدة (قراءة مسجلين) */
export interface DbRuleRow {
  rule_id: string;
  version: number;
  jurisdiction: string;
  regulator: string | null;
  requirement: string;
  effective_from_text: string;
  effective_to_text: string;
  effective_from_precision: string;
  effective_from: string | null;
  effective_from_year: number | null;
  effective_to_precision: string;
  effective_to: string | null;
  effective_to_year: number | null;
  source: string;
  status: string;
  confidence: string;
  system_impact: string;
}

/** تطبيع صفوف السجل الحية إلى عقد Stage 2 الحرفي — بلا تأويل */
export function mapDbRuleRows(rows: readonly DbRuleRow[]): RegulatoryRuleVersion[] {
  return rows.map((r) => ({
    ruleId: r.rule_id,
    version: r.version,
    jurisdiction: r.jurisdiction,
    regulator: r.regulator,
    requirement: r.requirement,
    effectiveFromText: r.effective_from_text,
    effectiveToText: r.effective_to_text,
    effectiveFrom: ruleBound({
      precision: r.effective_from_precision as RegulatoryRuleVersion['effectiveFrom']['precision'],
      date: r.effective_from, year: r.effective_from_year,
    }),
    effectiveTo: ruleBound({
      precision: r.effective_to_precision as RegulatoryRuleVersion['effectiveTo']['precision'],
      date: r.effective_to, year: r.effective_to_year,
    }),
    source: r.source,
    status: r.status as RegulatoryRuleVersion['status'],
    confidence: r.confidence as RegulatoryRuleVersion['confidence'],
    systemImpact: r.system_impact,
  }));
}

/** فشل مغلق: لا وضع ضريبي سلطويًّا بالتاريخ المطلوب — لا مسودة تُنشأ */
export class TaxPostureUnresolvedError extends Error {
  constructor(note: string | null) {
    super(`TAX_POSTURE_UNRESOLVED: ${note ?? 'no register-backed VAT posture at this date'}`);
    this.name = 'TaxPostureUnresolvedError';
  }
}

export interface InvoiceTaxPosture {
  status: TaxStatus;
  /** نص عشري أو null — لا يُصنَّع 0 أبدًا لحالة لا تحمل نسبة */
  rate: string | null;
  ruleId: string;
  ruleVersion: number;
}

/**
 * الوضع الضريبي السلطوي لأسطر فاتورة تُسجَّل بتاريخ p_asOf —
 * عبر محلّل Stage 2 حصرًا. يُقبل فقط حلٌّ يسنده صف سجل فعلي
 * (ruleId موجود) وحالة من المجموعة المغلقة؛ غير ذلك: فشل مغلق.
 */
export function resolveInvoiceTaxPosture(
  rows: readonly DbRuleRow[], asOfIso: string, resolveVat: VatResolver,
): InvoiceTaxPosture {
  const resolution = resolveVat(mapDbRuleRows(rows), 'KW', asOfIso);
  if (resolution.ruleId === null || resolution.ruleVersion === null) {
    // «نتيجة الغياب الصريح» من Stage 2 ليست وضعًا نُوثّق به سطرًا
    // ماليًا — الفاتورة تنتظر تحديث السجل، لا افتراضًا
    throw new TaxPostureUnresolvedError(resolution.note);
  }
  if (!(TAX_STATUSES as readonly string[]).includes(resolution.status)) {
    throw new TaxPostureUnresolvedError(`unknown status ${resolution.status}`);
  }
  return {
    status: resolution.status,
    rate: resolution.rate,
    ruleId: resolution.ruleId,
    ruleVersion: resolution.ruleVersion,
  };
}

/** سطر كما يرسله المتصفح — تجاري صرف، بلا أي سلطة ضريبية */
export interface ClientDraftLine {
  product_id?: unknown;
  quantity?: unknown;
  unit_price_minor?: unknown;
  currency?: unknown;
  description?: unknown;
}

/**
 * بناء أسطر Stage 4 خادميًا: قائمة بيضاء صارمة — أي tax_status/
 * tax_rate (أو أي حقل آخر) يقترحه العميل يُسقط بنيويًا، والوضع
 * السلطوي يُختم على **كل** سطر. النسبة تُمرَّر فقط حين يحملها
 * الحل نفسه (TAXABLE/ZERO_RATED) — لا 0 مصنّعة.
 */
export function buildDraftLines(
  clientLines: readonly ClientDraftLine[], posture: InvoiceTaxPosture,
): Record<string, string>[] {
  return clientLines.map((l, i) => {
    const productId = typeof l.product_id === 'string' ? l.product_id : '';
    const quantity = typeof l.quantity === 'string' || typeof l.quantity === 'number'
      ? String(l.quantity) : '';
    const price = typeof l.unit_price_minor === 'string' || typeof l.unit_price_minor === 'number'
      ? String(l.unit_price_minor) : '';
    const currency = typeof l.currency === 'string' ? l.currency : '';
    if (!productId || !quantity || !price || !currency) {
      throw new Error(`invoice line ${i + 1} needs product, quantity, unit price and currency`);
    }
    const line: Record<string, string> = {
      product_id: productId,
      quantity,
      unit_price_minor: price,
      currency,
      tax_status: posture.status,
    };
    if (typeof l.description === 'string' && l.description.trim() !== '') {
      line.description = l.description;
    }
    if (posture.rate !== null) {
      line.tax_rate = posture.rate;
    }
    return line;
  });
}
