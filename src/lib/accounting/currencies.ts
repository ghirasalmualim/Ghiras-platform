/**
 * سجل العملات — الدقة ملك العملة (ISO 4217 · REG-INT-002).
 * مرجع القراءة في طبقة TypeScript؛ ومصدر الحقيقة التشغيلي جدول
 * acc_currencies في القاعدة — القائمتان تتطابقان بالاختبار.
 * لا حساب ماليًا يفترض ٣ منازل عالميًا.
 */

export type CurrencyCode = 'KWD' | 'USD' | 'EUR' | 'JPY';

export interface Currency {
  readonly code: CurrencyCode;
  readonly name: string;
  readonly minorUnit: 0 | 2 | 3;
  readonly symbol: string;
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  KWD: { code: 'KWD', name: 'دينار كويتي', minorUnit: 3, symbol: 'د.ك' },
  USD: { code: 'USD', name: 'دولار أمريكي', minorUnit: 2, symbol: '$' },
  EUR: { code: 'EUR', name: 'يورو', minorUnit: 2, symbol: '€' },
  JPY: { code: 'JPY', name: 'ين ياباني', minorUnit: 0, symbol: '¥' },
};
