/**
 * غراس للمحاسبة — Stage 9: توكيد الرصيد والنزاهة (BANK-008).
 *
 * المعادلة الدقيقة بلا تسامح: opening + Σ الحركات الموقَّعة = closing
 * (bigint صرف). التوكيد إمّا صريح من الملف (EXPLICIT_SOURCE) أو مشتق
 * حتميًا من سلسلة رصيد جارٍ كاملة (DERIVED_FROM_RUNNING_BALANCE) مع
 * حفظ حقائق الاشتقاق — لا يُدّعى أن المشتق جاء من ترويسة البنك، ولا
 * تُصنع أرصدة (CORRECTION 5). القاعدة تعيد التحقق سلطويًا؛ هذا فحص
 * الخادم القبلي بنفس الدلالة.
 */
import type { NormalizedBankTxn, BalanceAssertion, ParsedStatement } from './connector.ts';

export function movementSum(rows: readonly NormalizedBankTxn[]): bigint {
  return rows.reduce((a, r) => a + r.amountMinor, 0n);
}

/**
 * يبني توكيد الرصيد من المتاح فعلًا، أو يرفض:
 * - أرصدة صريحة في الملف → EXPLICIT_SOURCE
 * - سلسلة رصيد جارٍ كاملة الصفوف → اشتقاق حتمي مع حقائقه
 * - غير ذلك → null (فشل مغلق أعلى المكدس — FILE_INTEGRITY)
 */
export function buildAssertion(parsed: ParsedStatement): BalanceAssertion | null {
  const sum = movementSum(parsed.rows);
  if (parsed.explicitOpeningMinor !== null && parsed.explicitClosingMinor !== null) {
    return {
      openingMinor: parsed.explicitOpeningMinor,
      closingMinor: parsed.explicitClosingMinor,
      movementSumMinor: sum,
      source: 'EXPLICIT_SOURCE',
      derivation: null,
    };
  }
  const rows = parsed.rows;
  if (rows.length > 0 && rows.every((r) => r.runningBalanceMinor !== null)) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const opening = first.runningBalanceMinor! - first.amountMinor;
    return {
      openingMinor: opening,
      closingMinor: last.runningBalanceMinor!,
      movementSumMinor: sum,
      source: 'DERIVED_FROM_RUNNING_BALANCE',
      derivation: {
        first_row_balance: first.runningBalanceMinor!.toString(),
        first_row_amount: first.amountMinor.toString(),
        last_row_balance: last.runningBalanceMinor!.toString(),
        rows: rows.length,
      },
    };
  }
  return null;  // لا دليل قابل للإثبات — لا اختراع
}

/** الفحص القبلي: المعادلة + سلسلة الرصيد صفًا بصف حيث اكتملت */
export function verifyIntegrity(
  assertion: BalanceAssertion, rows: readonly NormalizedBankTxn[]
): { ok: true } | { ok: false; reason: string; detail: Record<string, string | number> } {
  const expected = assertion.openingMinor + assertion.movementSumMinor;
  if (expected !== assertion.closingMinor) {
    return {
      ok: false, reason: 'BALANCE_EQUATION',
      detail: {
        opening: assertion.openingMinor.toString(),
        movements: assertion.movementSumMinor.toString(),
        expected_closing: expected.toString(),
        stated_closing: assertion.closingMinor.toString(),
      },
    };
  }
  if (rows.length > 0 && rows.every((r) => r.runningBalanceMinor !== null)) {
    let prev = assertion.openingMinor;
    for (const r of rows) {
      if (prev + r.amountMinor !== r.runningBalanceMinor) {
        return {
          ok: false, reason: 'RUNNING_BALANCE_CHAIN',
          detail: {
            row_no: r.rowNo,
            expected_balance: (prev + r.amountMinor).toString(),
            stated_balance: r.runningBalanceMinor!.toString(),
          },
        };
      }
      prev = r.runningBalanceMinor!;
    }
  }
  return { ok: true };
}

/** نطاق التغطية من الصفوف — كشف صفري الحركة يمرَّر نطاقه صراحةً */
export function coverageFromRows(rows: readonly NormalizedBankTxn[]): { start: string; end: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((r) => r.txnDate).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
