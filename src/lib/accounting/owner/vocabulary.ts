/**
 * غراس للمحاسبة — Stage 11: طبقة المفردات الواحدة لوضع المالكة
 * (UX-004): **كل** نص يظهر للمالكة يمر من هنا حصرًا — لا نص مالي
 * حرفي في المكوّنات، ولا مفتاح خارج هذا السجل المغلق.
 *
 * الغياب البنيوي للمصطلح المهني (UX-005): القوائم المحرَّمة أدناه
 * يفحصها العقد الساكن ضد قيم هذا الملف، وضد DTO المالكة مُسلسلًا،
 * وضد DOM المعروض فعليًا (Playwright) — لا إخفاء CSS أبدًا.
 */

export const OWNER_VOCAB = {
  // ── الأقسام الخمسة — الأسماء الحرفية الملزمة، لا سادس ──
  SECTION_STATUS: 'وضعي',
  SECTION_MONEY: 'فلوسي',
  SECTION_INVOICES: 'فواتيري',
  SECTION_DOCS: 'مستنداتي',
  SECTION_ADVISOR: 'مستشاري',

  // ── بطاقات اللوحة الست — لا سابعة ──
  CARD_CASH_TODAY: 'رصيدك اليوم',
  CARD_PROFIT_MONTH: 'ربحك هذا الشهر',
  CARD_IN_TRANSIT: 'فلوس في الطريق',
  CARD_RUNWAY: 'كم تصمد سيولتك',
  CARD_OBLIGATIONS: 'التزاماتك القادمة',
  CARD_ATTENTION: 'يحتاج انتباهك',

  // ── حالات الصدق — صفر ≠ مجهول ≠ قديم ≠ مبدئي ≠ غير مهيأ ──
  STATUS_FINAL: 'محدَّث',
  STATUS_PROVISIONAL: 'رقم مبدئي',
  STATUS_STALE: 'آخر تحديث قديم',
  STATUS_UNKNOWN: 'ما نقدر نأكد الرقم الآن',
  STATUS_NOT_CONFIGURED: 'يحتاج تهيئة من محاسبك أول',

  // ── بطاقة ١: رصيدك اليوم ──
  CASH_BANK_COMPONENT: 'في حساباتك البنكية',
  CASH_ON_HAND_COMPONENT: 'نقد عندك',
  CASH_ON_HAND_NOT_CONFIGURED: 'نقد الصندوق ما انربط بعد — الرصيد الكامل ينتظر التهيئة',
  CASH_NO_BANK_MAPPING: 'حساباتك البنكية ما انربطت بعد في النظام',
  CASH_BANK_EVIDENCE: 'آخر كشف بنك مقبول بتاريخ {date}',
  CASH_SCOPE_INCOMPLETE: 'الرقم يغطي المربوط فقط — مو كل نقدك بعد',

  // ── بطاقة ٢: الربح — بلا رقم قبل طبقة التقارير (Stage 12) ──
  PROFIT_NOT_READY: 'ما نقدر نحسب ربح الشهر بدقة للحين',
  PROFIT_WHY_NOT_READY: 'حساب الربح الصحيح يحتاج تصنيف كامل لإيراداتك ومصاريفك — قاعدة يجهزها محاسبك قريبًا، وما راح نعطيك رقمًا ناقصًا',

  // ── بطاقة ٣: في الطريق — ثلاثة مكوّنات منفصلة، لا جمع معتم ──
  TRANSIT_GATEWAY: 'عند بوابة الدفع',
  TRANSIT_TO_BANK: 'بطريقها للبنك',
  TRANSIT_AWAITED: 'اللي لك عند عملائك',
  TRANSIT_COMPONENT_NOT_CONFIGURED: 'هذا الجزء ينتظر تهيئة من محاسبك',
  TRANSIT_DIFFERENCE_OPEN: 'فيه فرق تسوية قاعدين نتابعه — مو مخفي',

  // ── بطاقة ٤: الصمود ──
  RUNWAY_DAYS: 'تقريبًا {days} يوم',
  RUNWAY_NO_BURN: 'دخلك في الفترة الأخيرة يغطي مصروفك — ما فيه نزف',
  RUNWAY_NOT_CONFIGURED: 'يحتاج محاسبك يحدد نافذة الحساب أول',
  RUNWAY_INSUFFICIENT_HISTORY: 'ما عندنا تاريخ كافي نحسب منه بصدق',
  RUNWAY_CASH_INCOMPLETE: 'نحتاج رصيدك الكامل مؤكدًا قبل ما نحسب الصمود',
  RUNWAY_ASSUMPTION: 'محسوبة من مصروفك الفعلي في آخر {days} يوم — حساب ثابت، مو تنبؤ ذكي',

  // ── بطاقة ٥: الالتزامات — صدق النقص، لا «ما عليك شيء» ──
  OBLIGATIONS_RECORDED: 'التزامات مسجلة عندك',
  OBLIGATIONS_INCOMPLETE: 'المعلومة غير مكتملة بعد — فيه التزامات ممكن ما نعرفها',
  OBLIGATIONS_NO_TAX_REGIME: 'ما فيه ضريبة مطبقة عليك حاليًا حسب السجل',

  // ── بطاقة ٦: الانتباه ──
  ATTENTION_COUNT: '{count} أشياء تحتاجك',
  ATTENTION_ONE: 'شيء واحد يحتاجك',
  ATTENTION_TIME_HINT: 'دقيقتان تقريبًا',
  ATTENTION_NONE_URGENT: 'ما عندك شيء عاجل الآن',
  ATTENTION_CHECKS_DEFERRED: 'بعض الفحوص الذكية بتنضاف قريب',
  ATTENTION_CHECKS_INCOMPLETE: 'ما قدرنا نكمل كل الفحوص هالمرة — بنعيدها',
  ATTENTION_COVERAGE_PARTIAL: 'بعض الفحوص تنتظر بيانات أكثر (كشوف أو جولات مراجعة)',

  // ── فلوسي: التبويبات الأربعة ──
  MONEY_TAB_IN: 'اللي دخل',
  MONEY_TAB_OUT: 'اللي طلع',
  MONEY_TAB_TRANSIT: 'في الطريق',
  MONEY_TAB_AWAITED: 'اللي ما وصل بعد',
  MONEY_IN_EMPTY: 'ما فيه مبالغ داخلة مسجلة بهالفترة',
  MONEY_OUT_EMPTY: 'ما فيه مبالغ طالعة مسجلة بهالفترة',
  MONEY_AWAITED_EMPTY: 'ما فيه فواتير بانتظار التحصيل',
  MONEY_NOT_CONFIGURED: 'حركة فلوسك تبان هنا بعد ما يربط محاسبك حساباتك',

  // ── مصادر الحركات — أوصاف بلغة المالكة لا بلغة المهنة ──
  MOVEMENT_FROM_INVOICE: 'تحصيل فاتورة',
  MOVEMENT_FROM_EXPENSE: 'مصروف',
  MOVEMENT_FROM_REFUND: 'إرجاع مبلغ',
  MOVEMENT_FROM_SETTLEMENT: 'تحويلة من بوابة الدفع',
  MOVEMENT_FROM_BANK: 'حركة بنكية',
  MOVEMENT_OTHER: 'حركة مسجلة',

  // ── فواتيري ──
  INVOICE_STATUS_DRAFT: 'مسودة',
  INVOICE_STATUS_ISSUED: 'جاهزة',
  INVOICE_STATUS_SENT: 'مسجلة كمرسلة',
  INVOICE_STATUS_PARTIALLY_PAID: 'مدفوعة جزئيًا',
  INVOICE_STATUS_PAID: 'مدفوعة',
  INVOICE_STATUS_OVERDUE: 'متأخرة',
  INVOICE_STATUS_OTHER: 'بحالة خاصة — اسأل محاسبك',
  INVOICE_MARK_SENT: 'وسمها مرسلة',
  INVOICE_SHARED_TRUTH: 'شاركتها بنفسك — النظام سجلها كمرسلة، وما يرسل بالنيابة عنك بعد',
  INVOICE_RECORD_PAYMENT: 'سجّل استلام مبلغ',
  INVOICE_ISSUE: 'أصدرها',
  INVOICE_NEW: 'فاتورة جديدة',
  INVOICE_OUTSTANDING: 'المتبقي',
  INVOICE_DELIVERY_PENDING: 'الإرسال التلقائي والتذكير ينضافان لما تجهز قناة إرسال فعلية',
  INVOICE_TAX_UNRESOLVED: 'ما نقدر ننشئ الفاتورة الآن — الإعداد النظامي لبلدك يحتاج تحديثًا من محاسبك',

  // ── مستنداتي ──
  DOCS_WHAT_READ: 'وش قرينا منه',
  DOCS_WHAT_HAPPENED: 'وش صار عليه',
  DOCS_NOT_LINKED: 'ما انربط بشيء بعد',
  DOCS_EMPTY: 'ما عندك مستندات محفوظة بعد',
  DOCS_CAPTURE: 'صوّر أو ارفع مستند',
  DOCS_LINKED_EXPENSE: 'مربوط بمصروف',
  DOCS_LINKED_INVOICE: 'مربوط بفاتورة',
  DOCS_LINKED_BANK: 'كشف بنك مستورد',
  DOCS_LINKED_OTHER: 'مربوط بسجل مالي',

  // ── مستشاري — حدود Stage 13 الصادقة: لا مساعد زائف ──
  ADVISOR_UNAVAILABLE: 'هذا القسم ينفتح في مرحلة قادمة',
  ADVISOR_HONEST_NOTE: 'ما نحط لك مساعدًا شكليًا — لما يشتغل، بيقرأ أرقامك الحقيقية ويجاوبك منها',

  // ── الاستثناءات: ماذا/لماذا لكل نوع (مفاتيح الصف في القاعدة) ──
  EXC_SETTLEMENT_DIFF_WHAT: 'فرق في تحويلة من بوابة الدفع',
  EXC_SETTLEMENT_DIFF_WHY: 'المبلغ اللي وصل ما يطابق تفاصيل التحويلة — نتتبع وين راح الفرق بدل ما نبلعه',
  EXC_PERIOD_CLOSE_WHAT: 'إقفال شهر محاسبي واقف',
  EXC_PERIOD_CLOSE_WHY: 'فيه أمور مفتوحة لازم تنحسم قبل ما يقفل الشهر بأمان',
  EXC_MISSING_WEBHOOK_WHAT: 'دفعة وصلنا خبرها متأخر من بوابة الدفع',
  EXC_MISSING_WEBHOOK_WHY: 'اكتشفناها بجولة مراجعة — نتأكد إنها انسجلت صح وما ضاع شيء',
  EXC_UNMATCHED_BANK_WHAT: 'حركة في كشف البنك ما لقينا أصلها',
  EXC_UNMATCHED_BANK_WHY: 'كل حركة لازم نعرف قصتها — من وين جات أو ليش طلعت',
  EXC_FAILED_REFUND_WHAT: 'إرجاع مبلغ لعميل ما نجح',
  EXC_FAILED_REFUND_WHY: 'عميلك ينتظر فلوسه — نعيد المحاولة أو نلغي بقرار واضح',
  EXC_LARGE_EXPENSE_WHAT: 'مصروف كبير غير معتاد',
  EXC_LARGE_EXPENSE_WHY: 'نتأكد إنه مقصود قبل ما يمشي',
  EXC_AMBIGUITY_WHAT: 'مصروف يحتاج جوابك: شخصي أو للمشروع؟',
  EXC_AMBIGUITY_WHY: 'جوابك يخلي أرقامك تعكس مشروعك بصدق',
  EXC_SUSPECTED_DUP_WHAT: 'يمكن انسجل مرتين',
  EXC_SUSPECTED_DUP_WHY: 'نتأكد قبل لا يأثر على أرقامك',
  EXC_UNKNOWN_EXPENSE_WHAT: 'مصروف ما عرفنا نصنفه',
  EXC_UNKNOWN_EXPENSE_WHY: 'تصنيفه الصحيح يخلي تقاريرك أدق',
  EXC_MISSING_DOC_WHAT: 'مصروف بلا ورقة إثبات',
  EXC_MISSING_DOC_WHY: 'صورة الفاتورة تحفظ حقك وقت أي مراجعة',

  // ── حالة الاستثناء وأفعاله بلغة المالكة ──
  EXC_STATE_OPEN: 'جديد',
  EXC_STATE_IN_REVIEW: 'قاعدين نراجعه',
  EXC_STATE_ESCALATED: 'مصعّد للمتابعة',
  EXC_STATE_RESOLVED: 'انحسم',
  EXC_ACK: 'شفته — تابعوه',
  EXC_ACK_DONE: 'وصل علمك، والقضية باقية مفتوحة لين تنحسم فعليًا',
  EXC_NEEDS_ACCOUNTANT: 'هالنوع يحسمه محاسبك — وصلناه له',
  EXC_ANSWER_BUSINESS: 'للمشروع — كمّلوه',
  EXC_ANSWER_PERSONAL: 'شخصي — شيلوه',
  EXC_ATTACH_DOC: 'أرفق الورقة',
  EXC_RECURRENCE: 'تكرر {n} مرات',
  EXC_SYSTEM_TRIED: 'وش سوّى النظام',
  EXC_YOUR_OPTIONS: 'خياراتك',

  // ── الشرح والتتبع ──
  EXPLAIN_TITLE: 'من وين جا هذا الرقم؟',
  EXPLAIN_HOW_RECORDED: 'كيف انسجّل',
  EXPLAIN_RECENT_MOVEMENTS: 'آخر الحركات',
  EXPLAIN_AS_OF: 'محسوب بتاريخ {date}',
  EXPLAIN_POLICY_PROVISIONAL: 'الرقم مبدئي — في قاعدة تصنيف بانتظار الاعتماد',
  EXPLAIN_OFFLINE_COPY: 'نسخة محفوظة بتاريخ {date} — مو الرقم اللحظي',

  // ── عام ──
  APP_TITLE: 'غراس لمشروعك',
  LOADING: 'لحظة…',
  ERROR_GENERIC: 'صار خلل بسيط — جرب مرة ثانية',
  ERROR_NO_ACCESS: 'ما عندك وصول لبيانات مشروع هنا بعد',
  CURRENCY_KWD: 'د.ك',
  MONTH_THIS: 'هذا الشهر',
  SEE_DETAILS: 'التفاصيل',
  CLOSE: 'إغلاق',
  CONFIRM: 'تأكيد',
  CANCEL: 'إلغاء',
  REASON_LABEL: 'ليش؟ (كلمة تكفي)',
} as const;

export type OwnerKey = keyof typeof OWNER_VOCAB;

/** ترجمة مفتاح مع بارامترات {name} — المفتاح المجهول يفشل بصوت عالٍ */
export function t(key: OwnerKey, params?: Record<string, string | number>): string {
  const raw = OWNER_VOCAB[key];
  if (raw === undefined) throw new Error(`unknown owner vocabulary key: ${key}`);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p) =>
    params[p] !== undefined ? String(params[p]) : m);
}

export function isOwnerKey(k: string): k is OwnerKey {
  return Object.prototype.hasOwnProperty.call(OWNER_VOCAB, k);
}

/**
 * المصطلحات المحرَّمة في وضع المالكة (UX-002/005) — تُفحص ضد قيم
 * المفردات، وDTO مسلسلًا، وDOM المعروض. عربيًا وإنجليزيًا.
 */
export const FORBIDDEN_OWNER_TERMS: readonly string[] = [
  // عربي
  'مدين', 'دائن', 'قيد يومية', 'قيود اليومية', 'دفتر الأستاذ',
  'ميزان المراجعة', 'ذمم', 'مقاصة', 'حساب وسيط', 'استحقاق محاسبي',
  'ترحيل القيد', 'رصيد افتتاحي',
  // إنجليزي (يُفحص case-insensitively)
  'debit', 'credit', 'journal entry', 'general ledger', 'trial balance',
  'accounts receivable', 'accounts payable', 'clearing account',
  'accrual', 'chart of accounts',
];
