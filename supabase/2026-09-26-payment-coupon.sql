-- ============================================================================
-- كود الخصم — توسيمُ طلبِ الدفعِ بالكودِ ونسبتِه (للسجلّ والمحاسبة).
--
-- إضافيٌّ بالكامل: عمودان nullable على payment_orders ولا شيءَ غيرَهما.
-- لا يلمسُ أيَّ دالّة (لا payment_activate_* ولا admin_set_tool) ولا أيَّ سياسة.
-- الخصمُ نفسُه محسوبٌ في الخادم داخلَ amount_kwd، فالدفعُ يعملُ قبلَ هذا وبعدَه.
-- ============================================================================
alter table public.payment_orders
  add column if not exists coupon_code  text,
  add column if not exists discount_pct integer;

comment on column public.payment_orders.coupon_code  is 'كود الخصم المستخدَم (مثل: ورشة غراس) — فارغ إن لم يُستخدَم';
comment on column public.payment_orders.discount_pct is 'نسبة الخصم ٪ التي طُبّقت على السعر الأصلي';
