-- ============================================================================
-- سلّةُ المشتريات (2026-10-10) — إضافيٌّ بالكامل.
--   • عمودٌ واحدٌ جديد على payment_orders: cart_id — صفوفُ السلّةِ الواحدةِ تشتركُ فيه،
--     وفاتورةُ MyFatoorah ترجعُ به (CustomerReference) فيُفعَّلُ كلُّ صفٍّ بدوالِّ التفعيلِ نفسِها.
--   • لا يمسّ أيَّ دالةٍ قائمة (payment_* / admin_* كما هي)، ولا سياساتِ RLS.
--   • الطلبُ المنفردُ القديمُ يعملُ كما هو (cart_id فارغ).
-- ============================================================================

alter table public.payment_orders add column if not exists cart_id uuid;
create index if not exists payment_orders_cart_idx on public.payment_orders(cart_id) where cart_id is not null;

select 'payment cart ready' as result;
