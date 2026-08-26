-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 4: COMMERCIAL DOCUMENTS
-- العملاء · الموردون · المنتجات · الفواتير وأسطرها · الترقيم
-- المتسلسل بلا فجوات · آلة حالات الفاتورة · التجميد بعد الإصدار
-- (Git فقط — لا تُطبَّق قبل مراجعة صاحبة المنصة · فوق هجرات
--  Stage 1/2/3 المعتمدة ولا تعدّلها)
--
-- المبدأ الحاكم: الفاتورة **مطالبة تجارية على عميل** — ليست إثبات
-- دفع ولا اعترافًا بإيراد ولا قيدًا محاسبيًا. إصدارها في هذه
-- المرحلة لا يرحّل شيئًا ولا يلمس الإيراد أو الذمم أو المدفوعات —
-- محرك الإيراد ملك Stage 5 والمدفوعات ملك Stage 6.
--
-- الترقيم: متسلسل صحيح محايد لكل شركة، بلا فجوات، آمن تزامنيًا،
-- ومدقّق — العدّاد يُقفل FOR UPDATE داخل معاملة الإصدار نفسها،
-- ففشل الإصدار يرد تخصيص الرقم معه (لا nextval يستهلك رقمًا عند
-- التراجع). لا بادئة حكومية مخترعة — العرض طبقة لاحقة.
--
-- التاريخ لا ينجرف: الفاتورة المصدرة تحمل لقطة هوية عميلها ولقطة
-- منتجات أسطرها — تغيير العميل أو المنتج لاحقًا لا يغيّر وثيقة
-- صدرت. الضريبة حالة لا نسبة: الكويت اليوم NO_TAX_REGIME بنسبة
-- NULL — لا «صفر بالمئة» مرمّزًا ولا حساب VAT.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · العملاء (Part A) — قابلون للتعديل بتدقيق، لا حذف بعد أثر مالي
-- ─────────────────────────────────────────────
create table if not exists public.acc_customers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.acc_companies(id),
  name            text not null check (btrim(name) <> ''),
  -- تفاصيل الاتصال والمعرفات الضريبية حقول مرنة — لا تحقق قانونيًا
  -- كويتيًا مخترعًا (لا متطلبات معرفات رسمية في الـBlueprint)
  contact         jsonb not null default '{}'::jsonb,
  tax_identifiers jsonb not null default '{}'::jsonb,
  currency        char(3) references public.acc_currencies(code),
  payment_terms   text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);
create index if not exists acc_customers_company_idx on public.acc_customers (company_id, name);

create table if not exists public.acc_vendors (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.acc_companies(id),
  name               text not null check (btrim(name) <> ''),
  contact            jsonb not null default '{}'::jsonb,
  currency           char(3) references public.acc_currencies(code),
  -- REG-KW-011 (DRAFT): التقاط بيانات وتصنيف فقط — لا حساب استقطاع
  -- ولا نسبة مخترعة ولا ترميز مقترحٍ كقانون
  is_non_resident    boolean not null default false,
  withholding_status text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  updated_at         timestamptz not null default now()
);
create index if not exists acc_vendors_company_idx on public.acc_vendors (company_id, name);

create table if not exists public.acc_products (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  name              text not null check (btrim(name) <> ''),
  -- قيم متحفظة قابلة للتوسعة — لا تصنيفات محاسبية مخمّنة
  product_type      text,
  delivery_model    text,
  -- السعر مال تام: وحدات صغرى + عملة — لا float في أي طبقة
  price_minor       bigint not null check (price_minor >= 0),
  currency          char(3) not null references public.acc_currencies(code),
  -- المعرف المنطقي الثابت للسياسة (POL-xxx) لا صف نسخة متغيرًا —
  -- Stage 5 يحل نسخة الشركة المعتمدة بتاريخ المعاملة؛ لا تنفيذ هنا
  revenue_policy_id text check (revenue_policy_id ~ '^POL-[0-9]{3}$'),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);
create index if not exists acc_products_company_idx on public.acc_products (company_id, name);

-- حارس مشترك للسجلات الرئيسة: لا حذف (تعطيل بدل الحذف) والشركة
-- والإنشاء هوية مجمّدة — التغييرات تمر بدوال موقّتة بالتدقيق
create or replace function public.acc_master_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception '%: records are never deleted — deactivate instead', tg_table_name;
  end if;
  if new.company_id is distinct from old.company_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception '%: company/creation identity is immutable', tg_table_name;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists acc_customers_guard_trg on public.acc_customers;
create trigger acc_customers_guard_trg
  before update or delete on public.acc_customers
  for each row execute function public.acc_master_guard();
drop trigger if exists acc_vendors_guard_trg on public.acc_vendors;
create trigger acc_vendors_guard_trg
  before update or delete on public.acc_vendors
  for each row execute function public.acc_master_guard();
drop trigger if exists acc_products_guard_trg on public.acc_products;
create trigger acc_products_guard_trg
  before update or delete on public.acc_products
  for each row execute function public.acc_master_guard();

-- ─────────────────────────────────────────────
-- ٢ · عدّاد الترقيم — متسلسل بلا فجوات لكل شركة (Part G)
--     يُقفل FOR UPDATE داخل معاملة الإصدار — التراجع يرد الرقم
-- ─────────────────────────────────────────────
create table if not exists public.acc_invoice_counters (
  company_id  uuid primary key references public.acc_companies(id),
  last_number bigint not null default 0 check (last_number >= 0)
);

-- العدّاد ضابط مالي (FIX 1): لا لمس له إلا داخل معاملة إصدارٍ موقّعة —
-- لا عميل ولا مالكة ولا خدمة خارجها؛ الإدراج الكسول يبدأ من صفر حصرًا،
-- والتقدم +1 بالضبط، والحذف مستحيل — لا فجوة ولا إعادة تصفير أبدًا
create or replace function public.acc_counter_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_invoice_counters can never be deleted — numbering never resets';
  end if;
  if current_setting('acc.invoice_issue', true) is null
     or current_setting('acc.invoice_issue', true) = '' then
    raise exception 'the invoice counter moves only inside the signed issue transaction';
  end if;
  if tg_op = 'INSERT' then
    if new.last_number <> 0 then
      raise exception 'a counter is born at zero — no arbitrary starting point';
    end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id
     or new.last_number <> old.last_number + 1 then
    raise exception 'the counter advances by exactly one per successful issue';
  end if;
  return new;
end $$;
drop trigger if exists acc_counter_guard_trg on public.acc_invoice_counters;
create trigger acc_counter_guard_trg
  before insert or update or delete on public.acc_invoice_counters
  for each row execute function public.acc_counter_guard();

-- ─────────────────────────────────────────────
-- ٣ · الفواتير وأسطرها (Parts D/E)
-- ─────────────────────────────────────────────
create table if not exists public.acc_invoices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  customer_id       uuid not null references public.acc_customers(id),
  status            text not null default 'DRAFT' check (status in
                      ('DRAFT','ISSUED','SENT','PARTIALLY_PAID','PAID',
                       'PARTIALLY_REFUNDED','REFUNDED','DISPUTED','OVERDUE',
                       'WRITTEN_OFF','VOIDED','DELETED')),
  -- الرقم النهائي يولد عند الإصدار الناجح فقط — المسودة بلا رقم
  invoice_number    bigint,
  issue_date        date,
  due_date          date,
  currency          char(3) not null references public.acc_currencies(code),
  -- المجاميع تُشتق من الأسطر في الخادم وتُعاد فحصًا عند الإصدار —
  -- لا مجموع مقدّمًا من العميل يُقبل
  subtotal_minor    bigint check (subtotal_minor >= 0),
  total_minor       bigint check (total_minor >= 0),
  -- أدلة FX تُثبت عند الإصدار ولا يعاد حسابها (نفس HALF_UP المعتمد)
  base_currency     char(3) references public.acc_currencies(code),
  base_total_minor  bigint check (base_total_minor >= 0),
  fx_rate           numeric(20,10) check (fx_rate is null or fx_rate > 0),
  fx_rate_date      date,
  fx_rate_source    text,
  -- لقطة هوية العميل لحظة الإصدار — الوثيقة التاريخية لا تنجرف
  customer_snapshot jsonb,
  issued_at         timestamptz,
  issued_by         uuid references auth.users(id),
  sent_at           timestamptz,
  void_reason       text,
  -- غير مالي صرف — يبقى قابلًا للتعديل ولا يغير معنى الوثيقة
  internal_note     text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id)
);
create unique index if not exists acc_invoices_number_uq
  on public.acc_invoices (company_id, invoice_number) where invoice_number is not null;
create index if not exists acc_invoices_company_idx on public.acc_invoices (company_id, status);

create table if not exists public.acc_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.acc_invoices(id),
  company_id        uuid not null references public.acc_companies(id),
  product_id        uuid not null references public.acc_products(id),
  -- لقطة الوصف التجاري لحظة البيع — تغيّر المنتج لاحقًا لا يغيرها
  description       text not null check (btrim(description) <> ''),
  -- الكمية عشري تام numeric — لا float ثنائيًا أبدًا
  quantity          numeric(18,6) not null check (quantity > 0),
  unit_price_minor  bigint not null check (unit_price_minor >= 0),
  line_amount_minor bigint not null check (line_amount_minor >= 0),
  currency          char(3) not null references public.acc_currencies(code),
  tax_status        text not null references public.acc_tax_statuses(code),
  tax_rate          numeric(9,6),
  revenue_policy_id text check (revenue_policy_id ~ '^POL-[0-9]{3}$'),
  position          integer not null default 1,
  created_at        timestamptz not null default now(),
  -- النسبة لا معنى لها إلا مع TAXABLE/ZERO_RATED — NO_TAX_REGIME
  -- نسبتها NULL لا صفرًا (TAX-001)؛ وTAXABLE بلا نسبة مرفوضة
  check (tax_rate is null or tax_status in ('TAXABLE','ZERO_RATED')),
  check (tax_status <> 'TAXABLE' or tax_rate is not null)
);
create index if not exists acc_invoice_lines_invoice_idx on public.acc_invoice_lines (invoice_id);

-- آلة حالات الفاتورة (Part H — حرفيًا من الـBlueprint، لا تحسين):
--   DRAFT→ISSUED · DRAFT→DELETED · ISSUED→SENT · ISSUED→VOIDED ·
--   SENT→PARTIALLY_PAID · PARTIALLY_PAID→PAID/OVERDUE ·
--   PAID→PARTIALLY_REFUNDED/DISPUTED · PARTIALLY_REFUNDED→REFUNDED ·
--   DISPUTED→PAID/REFUNDED · OVERDUE→PAID/WRITTEN_OFF — وكل ما عداها محرم.
-- بوابتان: العمليات البشرية الأربع لهذه المرحلة توقّع acc.invoice_op؛
-- والانتقالات المدفوعة بالمدفوعات/الاستردادات تعرفها الآلة بنيويًا
-- لكن توقيعها acc.invoice_module_transition لا تضعه **أي** دالة في
-- هذه المرحلة — فلا set_status عامًا ولا PAID بلا سجل دفع: وحدات
-- Stage 6/7 المستقبلية توصل هنا دون إعادة تصميم.
create or replace function public.acc_invoices_guard()
returns trigger language plpgsql as $$
declare
  v_human boolean;
  v_module boolean;
begin
  -- الميلاد DRAFT حصرًا وبلا رقم ولا آثار إصدار — لا INSERT خامًا
  -- يظهر ISSUED/PAID ولو بمفتاح الخدمة (FIX 2)
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'an invoice is born DRAFT — issuance only through acc_issue_invoice';
    end if;
    if new.invoice_number is not null or new.issued_at is not null
       or new.issued_by is not null or new.customer_snapshot is not null
       or new.base_total_minor is not null or new.fx_rate is not null then
      raise exception 'final number, snapshots and issue evidence are written only by acc_issue_invoice';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'acc_invoices are never physically deleted — DELETED is a retained state';
  end if;
  if new.company_id is distinct from old.company_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'acc_invoices: identity is immutable';
  end if;

  -- وأثناء DRAFT أيضًا: الرقم وأدلة الإصدار واللقطة وأدلة FX لا
  -- تُكتب إلا من acc_issue_invoice نفسها بتوقيعها لهذا الصف (FIX 2)
  if old.status = 'DRAFT'
     and (new.invoice_number is distinct from old.invoice_number
          or new.issued_at is distinct from old.issued_at
          or new.issued_by is distinct from old.issued_by
          or new.customer_snapshot is distinct from old.customer_snapshot
          or new.base_currency is distinct from old.base_currency
          or new.base_total_minor is distinct from old.base_total_minor
          or new.fx_rate is distinct from old.fx_rate
          or new.fx_rate_date is distinct from old.fx_rate_date
          or new.fx_rate_source is distinct from old.fx_rate_source)
     and current_setting('acc.invoice_issue', true) is distinct from old.id::text then
    raise exception 'the final number and issue evidence are written only inside acc_issue_invoice';
  end if;

  -- الرقم مجمّد فور كتابته: N→N+1 وN→NULL مستحيلان، وN→N (التحديث
  -- الثاني الشرعي أثناء الإصدار) يمر — الملغاة والمرسلة تحتفظان به للأبد
  if old.invoice_number is not null
     and new.invoice_number is distinct from old.invoice_number then
    raise exception 'an invoice number can never change once assigned';
  end if;

  -- التجميد المالي بعد مغادرة DRAFT (Part J): كل محتوى مالي مجمّد
  -- للأبد — الحالة تتحرك بآلتها وsent_at/void_reason مع عمليتيهما
  -- وinternal_note غير المالي فقط يبقى حرًا
  if old.status <> 'DRAFT' then
    if new.customer_id        is distinct from old.customer_id
       or new.invoice_number  is distinct from old.invoice_number
       or new.issue_date      is distinct from old.issue_date
       or new.due_date        is distinct from old.due_date
       or new.currency        is distinct from old.currency
       or new.subtotal_minor  is distinct from old.subtotal_minor
       or new.total_minor     is distinct from old.total_minor
       or new.base_currency   is distinct from old.base_currency
       or new.base_total_minor is distinct from old.base_total_minor
       or new.fx_rate         is distinct from old.fx_rate
       or new.fx_rate_date    is distinct from old.fx_rate_date
       or new.fx_rate_source  is distinct from old.fx_rate_source
       or new.customer_snapshot is distinct from old.customer_snapshot
       or new.issued_at       is distinct from old.issued_at
       or new.issued_by       is distinct from old.issued_by then
      raise exception 'an issued invoice is financially frozen forever — nothing commercial may change';
    end if;
  end if;

  if new.status is distinct from old.status then
    -- fail-closed حتميًا: GUC غائب (NULL) أو فارغ أو لمعرف فاتورة أخرى
    -- كله = false — لا مسار منطق-ثلاثي-القيم يمنح تخويلًا أبدًا
    v_human  := coalesce(current_setting('acc.invoice_op', true), '') = old.id::text;
    v_module := coalesce(current_setting('acc.invoice_module_transition', true), '') = old.id::text;
    -- العمليات البشرية لهذه المرحلة حصرًا
    if (old.status = 'DRAFT'  and new.status = 'ISSUED')
       or (old.status = 'DRAFT'  and new.status = 'DELETED')
       or (old.status = 'ISSUED' and new.status = 'SENT')
       or (old.status = 'ISSUED' and new.status = 'VOIDED') then
      if v_human is not true then
        raise exception 'this transition passes only through its signed Stage 4 operation';
      end if;
    -- انتقالات الوحدات المستقبلية: معرّفة بنيويًا، ولا مسار إليها اليوم
    elsif (old.status = 'SENT' and new.status = 'PARTIALLY_PAID')
       or (old.status = 'PARTIALLY_PAID' and new.status in ('PAID','OVERDUE'))
       or (old.status = 'PAID' and new.status in ('PARTIALLY_REFUNDED','DISPUTED'))
       or (old.status = 'PARTIALLY_REFUNDED' and new.status = 'REFUNDED')
       or (old.status = 'DISPUTED' and new.status in ('PAID','REFUNDED'))
       or (old.status = 'OVERDUE' and new.status in ('PAID','WRITTEN_OFF')) then
      if v_module is not true then
        raise exception 'payment/refund/dispute transitions belong to future signed modules — no generic set_status exists';
      end if;
    else
      raise exception 'forbidden invoice transition: % -> %', old.status, new.status;
    end if;

  end if;
  return new;
end $$;
drop trigger if exists acc_invoices_guard_trg on public.acc_invoices;
create trigger acc_invoices_guard_trg
  before insert or update or delete on public.acc_invoices
  for each row execute function public.acc_invoices_guard();

-- الأسطر تُعدّل والفاتورة DRAFT فقط — بعدها مجمّدة حتى ضد الخدمة
create or replace function public.acc_invoice_lines_guard()
returns trigger language plpgsql as $$
declare v_inv record;
begin
  select status, company_id into v_inv
  from public.acc_invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if tg_op = 'INSERT' then
    if v_inv.status <> 'DRAFT' then
      raise exception 'lines can only be added to a DRAFT invoice (invoice is %)', v_inv.status;
    end if;
    if new.company_id <> v_inv.company_id then
      raise exception 'line company must match its invoice company';
    end if;
    return new;
  end if;
  if v_inv.status <> 'DRAFT' then
    raise exception 'lines of a % invoice are immutable: % refused', v_inv.status, tg_op;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.invoice_id is distinct from old.invoice_id
     or new.company_id is distinct from old.company_id then
    raise exception 'a line cannot move between invoices or companies';
  end if;
  return new;
end $$;
drop trigger if exists acc_invoice_lines_guard_trg on public.acc_invoice_lines;
create trigger acc_invoice_lines_guard_trg
  before insert or update or delete on public.acc_invoice_lines
  for each row execute function public.acc_invoice_lines_guard();

-- ─────────────────────────────────────────────
-- ٤ · RLS (Part P) — دور + شركة؛ لا is_admin ولا ثقة بجسد الطلب
--     القراءة: المالكة (وثائقها التجارية) والمحاسبة والمدقق والمدير
--     المالي؛ الموظف وREAD_ONLY وأدمِن المنصة: لا شيء.
--     الكتابة كلها عبر الدوال الموقّتة — صفر كتابة عميل مباشرة.
-- ─────────────────────────────────────────────
alter table public.acc_customers        enable row level security;
alter table public.acc_vendors          enable row level security;
alter table public.acc_products         enable row level security;
alter table public.acc_invoices         enable row level security;
alter table public.acc_invoice_lines    enable row level security;
alter table public.acc_invoice_counters enable row level security;

create policy acc_customers_select on public.acc_customers
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_vendors_select on public.acc_vendors
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_products_select on public.acc_products
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_invoices_select on public.acc_invoices
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_invoice_lines_select on public.acc_invoice_lines
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
-- العدّاد تفصيلة تشغيلية داخلية — لا قراءة عميل أصلًا (الرقم على الفاتورة)

revoke insert, update, delete on public.acc_customers        from anon, authenticated;
revoke insert, update, delete on public.acc_vendors          from anon, authenticated;
revoke insert, update, delete on public.acc_products         from anon, authenticated;
revoke insert, update, delete on public.acc_invoices         from anon, authenticated;
revoke insert, update, delete on public.acc_invoice_lines    from anon, authenticated;
revoke select, insert, update, delete on public.acc_invoice_counters from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٥ · السجلات الرئيسة — دوال (BUSINESS_OWNER للفوترة؛ least privilege)
-- ─────────────────────────────────────────────
-- هوية السياسة (FIX 3): الصيغة وحدها لا تكفي — المعرف المنطقي يجب أن
-- يوجد في سجل السياسات كقالب عام أو سياسة للشركة **نفسها**. هوية فقط:
-- لا اشتراط APPROVED ولا تنفيذ — Stage 5 يحل النسخة والسريان والاعتماد،
-- والقالب العام لا يحكم الإنتاج (محلّل Stage 2 يضمنها).
create or replace function public.acc_assert_known_policy(p_company uuid, p_policy_id text)
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_policy_id is null then return; end if;
  if not exists (
    select 1 from public.acc_policy_register r
    where r.policy_id = p_policy_id
      and (r.company_id is null or r.company_id = p_company)
  ) then
    raise exception 'unknown revenue policy % — it must exist in the policy register as a global template or a policy of this company', p_policy_id;
  end if;
end $$;
revoke execute on function public.acc_assert_known_policy(uuid,text) from public, anon, authenticated;
create or replace function public.acc_assert_owner(p_company uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if public.acc_role(p_company) is distinct from 'BUSINESS_OWNER' then
    raise exception 'commercial document operations require the BUSINESS_OWNER role in this company';
  end if;
  return v_user;
end $$;
revoke execute on function public.acc_assert_owner(uuid) from public, anon, authenticated;

create or replace function public.acc_create_customer(
  p_company uuid, p_name text, p_contact jsonb default '{}'::jsonb,
  p_tax_identifiers jsonb default '{}'::jsonb,
  p_currency char(3) default null, p_payment_terms text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_id uuid;
begin
  v_user := public.acc_assert_owner(p_company);
  insert into public.acc_customers (company_id, name, contact, tax_identifiers, currency, payment_terms, created_by)
  values (p_company, btrim(p_name), coalesce(p_contact, '{}'::jsonb),
          coalesce(p_tax_identifiers, '{}'::jsonb), p_currency, p_payment_terms, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'CUSTOMER_CREATED', 'acc_customers', v_id::text,
    null, jsonb_build_object('name', p_name), 'acc_create_customer');
  return v_id;
end $$;
revoke execute on function public.acc_create_customer(uuid,text,jsonb,jsonb,char,text) from public, anon;
grant  execute on function public.acc_create_customer(uuid,text,jsonb,jsonb,char,text) to authenticated;

create or replace function public.acc_update_customer(
  p_customer uuid, p_name text, p_contact jsonb, p_tax_identifiers jsonb,
  p_currency char(3), p_payment_terms text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_customers where id = p_customer;
  if not found then raise exception 'unknown customer'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  update public.acc_customers
     set name = btrim(p_name), contact = coalesce(p_contact, '{}'::jsonb),
         tax_identifiers = coalesce(p_tax_identifiers, '{}'::jsonb),
         currency = p_currency, payment_terms = p_payment_terms
   where id = p_customer;
  -- التغييرات ذات الدلالة المالية مدققة قبل/بعد: الاسم والمعرفات
  -- الضريبية والعملة والشروط
  perform public.acc_audit(v_row.company_id, v_user, 'CUSTOMER_CHANGED', 'acc_customers', p_customer::text,
    jsonb_build_object('name', v_row.name, 'tax_identifiers', v_row.tax_identifiers,
                       'currency', v_row.currency, 'payment_terms', v_row.payment_terms),
    jsonb_build_object('name', btrim(p_name), 'tax_identifiers', p_tax_identifiers,
                       'currency', p_currency, 'payment_terms', p_payment_terms),
    'acc_update_customer');
end $$;
revoke execute on function public.acc_update_customer(uuid,text,jsonb,jsonb,char,text) from public, anon;
grant  execute on function public.acc_update_customer(uuid,text,jsonb,jsonb,char,text) to authenticated;

create or replace function public.acc_set_customer_active(p_customer uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_customers where id = p_customer;
  if not found then raise exception 'unknown customer'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  update public.acc_customers set active = p_active where id = p_customer;
  perform public.acc_audit(v_row.company_id, v_user,
    case when p_active then 'CUSTOMER_CHANGED' else 'CUSTOMER_DEACTIVATED' end,
    'acc_customers', p_customer::text,
    jsonb_build_object('active', v_row.active), jsonb_build_object('active', p_active),
    'acc_set_customer_active');
end $$;
revoke execute on function public.acc_set_customer_active(uuid,boolean) from public, anon;
grant  execute on function public.acc_set_customer_active(uuid,boolean) to authenticated;

create or replace function public.acc_create_vendor(
  p_company uuid, p_name text, p_contact jsonb default '{}'::jsonb,
  p_currency char(3) default null,
  p_is_non_resident boolean default false, p_withholding_status text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_id uuid;
begin
  v_user := public.acc_assert_owner(p_company);
  insert into public.acc_vendors (company_id, name, contact, currency, is_non_resident, withholding_status, created_by)
  values (p_company, btrim(p_name), coalesce(p_contact, '{}'::jsonb), p_currency,
          p_is_non_resident, p_withholding_status, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'VENDOR_CREATED', 'acc_vendors', v_id::text,
    null, jsonb_build_object('name', p_name, 'is_non_resident', p_is_non_resident), 'acc_create_vendor');
  return v_id;
end $$;
revoke execute on function public.acc_create_vendor(uuid,text,jsonb,char,boolean,text) from public, anon;
grant  execute on function public.acc_create_vendor(uuid,text,jsonb,char,boolean,text) to authenticated;

create or replace function public.acc_update_vendor(
  p_vendor uuid, p_name text, p_contact jsonb, p_currency char(3),
  p_is_non_resident boolean, p_withholding_status text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_vendors where id = p_vendor;
  if not found then raise exception 'unknown vendor'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  update public.acc_vendors
     set name = btrim(p_name), contact = coalesce(p_contact, '{}'::jsonb), currency = p_currency,
         is_non_resident = p_is_non_resident, withholding_status = p_withholding_status
   where id = p_vendor;
  -- تغيّر الإقامة/الاستقطاع دلالة تنظيمية مستقبلية — مدقق قبل/بعد
  perform public.acc_audit(v_row.company_id, v_user, 'VENDOR_CHANGED', 'acc_vendors', p_vendor::text,
    jsonb_build_object('name', v_row.name, 'is_non_resident', v_row.is_non_resident,
                       'withholding_status', v_row.withholding_status, 'currency', v_row.currency),
    jsonb_build_object('name', btrim(p_name), 'is_non_resident', p_is_non_resident,
                       'withholding_status', p_withholding_status, 'currency', p_currency),
    'acc_update_vendor');
end $$;
revoke execute on function public.acc_update_vendor(uuid,text,jsonb,char,boolean,text) from public, anon;
grant  execute on function public.acc_update_vendor(uuid,text,jsonb,char,boolean,text) to authenticated;

create or replace function public.acc_set_vendor_active(p_vendor uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_vendors where id = p_vendor;
  if not found then raise exception 'unknown vendor'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  update public.acc_vendors set active = p_active where id = p_vendor;
  perform public.acc_audit(v_row.company_id, v_user,
    case when p_active then 'VENDOR_CHANGED' else 'VENDOR_DEACTIVATED' end,
    'acc_vendors', p_vendor::text,
    jsonb_build_object('active', v_row.active), jsonb_build_object('active', p_active),
    'acc_set_vendor_active');
end $$;
revoke execute on function public.acc_set_vendor_active(uuid,boolean) from public, anon;
grant  execute on function public.acc_set_vendor_active(uuid,boolean) to authenticated;

create or replace function public.acc_create_product(
  p_company uuid, p_name text, p_price_minor bigint, p_currency char(3),
  p_revenue_policy_id text default null,
  p_product_type text default null, p_delivery_model text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_id uuid;
begin
  v_user := public.acc_assert_owner(p_company);
  perform public.acc_assert_known_policy(p_company, p_revenue_policy_id);
  insert into public.acc_products
    (company_id, name, price_minor, currency, revenue_policy_id, product_type, delivery_model, created_by)
  values (p_company, btrim(p_name), p_price_minor, p_currency, p_revenue_policy_id,
          p_product_type, p_delivery_model, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'PRODUCT_CREATED', 'acc_products', v_id::text,
    null, jsonb_build_object('name', p_name, 'price_minor', p_price_minor::text,
                             'currency', p_currency, 'revenue_policy_id', p_revenue_policy_id),
    'acc_create_product');
  return v_id;
end $$;
revoke execute on function public.acc_create_product(uuid,text,bigint,char,text,text,text) from public, anon;
grant  execute on function public.acc_create_product(uuid,text,bigint,char,text,text,text) to authenticated;

-- تغييرات المنتج تسري **قدمًا فقط** — الأسطر المصدرة لقطات لا تتأثر؛
-- تغيّر السعر والسياسة حدثان مدققان مميزان
create or replace function public.acc_update_product(
  p_product uuid, p_name text, p_price_minor bigint, p_currency char(3),
  p_revenue_policy_id text, p_product_type text, p_delivery_model text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_products where id = p_product;
  if not found then raise exception 'unknown product'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  perform public.acc_assert_known_policy(v_row.company_id, p_revenue_policy_id);
  update public.acc_products
     set name = btrim(p_name), price_minor = p_price_minor, currency = p_currency,
         revenue_policy_id = p_revenue_policy_id,
         product_type = p_product_type, delivery_model = p_delivery_model
   where id = p_product;
  perform public.acc_audit(v_row.company_id, v_user, 'PRODUCT_CHANGED', 'acc_products', p_product::text,
    jsonb_build_object('name', v_row.name), jsonb_build_object('name', btrim(p_name)), 'acc_update_product');
  if p_price_minor is distinct from v_row.price_minor or p_currency is distinct from v_row.currency then
    perform public.acc_audit(v_row.company_id, v_user, 'PRODUCT_PRICE_CHANGED', 'acc_products', p_product::text,
      jsonb_build_object('price_minor', v_row.price_minor::text, 'currency', v_row.currency),
      jsonb_build_object('price_minor', p_price_minor::text, 'currency', p_currency),
      'acc_update_product');
  end if;
  if p_revenue_policy_id is distinct from v_row.revenue_policy_id then
    perform public.acc_audit(v_row.company_id, v_user, 'PRODUCT_POLICY_CHANGED', 'acc_products', p_product::text,
      jsonb_build_object('revenue_policy_id', v_row.revenue_policy_id),
      jsonb_build_object('revenue_policy_id', p_revenue_policy_id),
      'acc_update_product');
  end if;
end $$;
revoke execute on function public.acc_update_product(uuid,text,bigint,char,text,text,text) from public, anon;
grant  execute on function public.acc_update_product(uuid,text,bigint,char,text,text,text) to authenticated;

create or replace function public.acc_set_product_active(p_product uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_products where id = p_product;
  if not found then raise exception 'unknown product'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  update public.acc_products set active = p_active where id = p_product;
  perform public.acc_audit(v_row.company_id, v_user,
    case when p_active then 'PRODUCT_CHANGED' else 'PRODUCT_DEACTIVATED' end,
    'acc_products', p_product::text,
    jsonb_build_object('active', v_row.active), jsonb_build_object('active', p_active),
    'acc_set_product_active');
end $$;
revoke execute on function public.acc_set_product_active(uuid,boolean) from public, anon;
grant  execute on function public.acc_set_product_active(uuid,boolean) to authenticated;

-- ─────────────────────────────────────────────
-- ٦ · حساب الأسطر — نقطة تقريب واحدة حتمية (Part E)
--     line_amount = HALF_UP(quantity × unit_price_minor)
--     الكمية numeric(18,6) تامة: q_scaled = quantity×10⁶ عدد صحيح،
--     ثم div/mod على 10⁶ — نفس أسلوب Stage 3 الصحيح التام حرفيًا.
--     الخادم يحسب — العميل لا يقدّم مبلغ سطر ولا مجموعًا.
-- ─────────────────────────────────────────────
create or replace function public.acc_line_amount(p_quantity numeric, p_unit_price_minor bigint)
returns bigint language plpgsql immutable as $$
declare v_num numeric; v_den numeric := 1000000; v_res numeric;
begin
  v_num := (p_quantity * 1000000) * p_unit_price_minor::numeric;
  if v_num <> trunc(v_num) then
    raise exception 'quantity supports at most 6 exact decimal places';
  end if;
  v_res := div(v_num, v_den) + case when 2 * mod(v_num, v_den) >= v_den then 1 else 0 end;
  return v_res::bigint;
end $$;

create or replace function public.acc_insert_invoice_lines(p_invoice uuid, p_company uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l jsonb; v_pos integer := 0; v_prod record; v_amount bigint;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'an invoice needs at least one meaningful line';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_pos := v_pos + 1;
    select * into v_prod from public.acc_products where id = (l->>'product_id')::uuid;
    if not found or v_prod.company_id <> p_company then
      raise exception 'every line needs a product of the same company';
    end if;
    -- المبلغ يُحسب هنا حصرًا — لا line_amount مقدّمًا يُقبل
    v_amount := public.acc_line_amount((l->>'quantity')::numeric, (l->>'unit_price_minor')::bigint);
    perform public.acc_assert_known_policy(p_company, nullif(l->>'revenue_policy_id',''));
    insert into public.acc_invoice_lines
      (invoice_id, company_id, product_id, description, quantity, unit_price_minor,
       line_amount_minor, currency, tax_status, tax_rate, revenue_policy_id, position)
    values
      (p_invoice, p_company, v_prod.id,
       coalesce(nullif(btrim(l->>'description'), ''), v_prod.name),  -- لقطة الوصف
       (l->>'quantity')::numeric, (l->>'unit_price_minor')::bigint,
       v_amount, l->>'currency', l->>'tax_status',
       nullif(l->>'tax_rate','')::numeric,
       coalesce(nullif(l->>'revenue_policy_id',''), v_prod.revenue_policy_id), -- لقطة السياسة
       v_pos);
  end loop;
end $$;
revoke execute on function public.acc_insert_invoice_lines(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.acc_refresh_invoice_totals(p_invoice uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sum bigint;
begin
  select coalesce(sum(line_amount_minor), 0) into v_sum
  from public.acc_invoice_lines where invoice_id = p_invoice;
  update public.acc_invoices set subtotal_minor = v_sum, total_minor = v_sum
   where id = p_invoice;
end $$;
revoke execute on function public.acc_refresh_invoice_totals(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ٧ · الفاتورة — عمليات المرحلة البشرية (Parts D/I/L/M)
-- ─────────────────────────────────────────────
create or replace function public.acc_create_invoice_draft(
  p_company uuid, p_customer uuid, p_currency char(3),
  p_due_date date default null, p_lines jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_cust record; v_id uuid;
begin
  v_user := public.acc_assert_owner(p_company);
  select * into v_cust from public.acc_customers where id = p_customer;
  if not found or v_cust.company_id <> p_company then
    raise exception 'the customer must belong to the same company';
  end if;
  insert into public.acc_invoices (company_id, customer_id, currency, due_date, created_by)
  values (p_company, p_customer, p_currency, p_due_date, v_user)
  returning id into v_id;
  perform public.acc_insert_invoice_lines(v_id, p_company, p_lines);
  perform public.acc_refresh_invoice_totals(v_id);
  perform public.acc_audit(p_company, v_user, 'INVOICE_DRAFT_CREATED', 'acc_invoices', v_id::text,
    null, jsonb_build_object('customer_id', p_customer, 'lines', p_lines), 'acc_create_invoice_draft');
  return v_id;
end $$;
revoke execute on function public.acc_create_invoice_draft(uuid,uuid,char,date,jsonb) from public, anon;
grant  execute on function public.acc_create_invoice_draft(uuid,uuid,char,date,jsonb) to authenticated;

create or replace function public.acc_edit_invoice_draft(
  p_invoice uuid, p_customer uuid, p_currency char(3), p_due_date date, p_lines jsonb
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record; v_cust record; v_before jsonb;
begin
  select * into v_row from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  if v_row.status <> 'DRAFT' then
    raise exception 'only DRAFT invoices are editable (invoice is %)', v_row.status;
  end if;
  select * into v_cust from public.acc_customers where id = p_customer;
  if not found or v_cust.company_id <> v_row.company_id then
    raise exception 'the customer must belong to the same company';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'quantity', quantity::text,
    'unit_price_minor', unit_price_minor::text,
    'line_amount_minor', line_amount_minor::text, 'tax_status', tax_status)), '[]'::jsonb)
    into v_before from public.acc_invoice_lines where invoice_id = p_invoice;
  delete from public.acc_invoice_lines where invoice_id = p_invoice;
  update public.acc_invoices
     set customer_id = p_customer, currency = p_currency, due_date = p_due_date
   where id = p_invoice;
  perform public.acc_insert_invoice_lines(p_invoice, v_row.company_id, p_lines);
  perform public.acc_refresh_invoice_totals(p_invoice);
  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_DRAFT_EDITED', 'acc_invoices', p_invoice::text,
    jsonb_build_object('customer_id', v_row.customer_id, 'lines', v_before),
    jsonb_build_object('customer_id', p_customer, 'lines', p_lines),
    'acc_edit_invoice_draft');
end $$;
revoke execute on function public.acc_edit_invoice_draft(uuid,uuid,char,date,jsonb) from public, anon;
grant  execute on function public.acc_edit_invoice_draft(uuid,uuid,char,date,jsonb) to authenticated;

create or replace function public.acc_delete_invoice_draft(p_invoice uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  if v_row.status <> 'DRAFT' then
    raise exception 'only DRAFT invoices can be deleted (invoice is %)', v_row.status;
  end if;
  -- حالة محفوظة تاريخيًا — لا حذف فعليًا ولا رقم مستهلكًا
  perform set_config('acc.invoice_op', v_row.id::text, true);
  update public.acc_invoices set status = 'DELETED' where id = p_invoice;
  perform set_config('acc.invoice_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_DRAFT_DELETED', 'acc_invoices', p_invoice::text,
    jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'DELETED'), 'acc_delete_invoice_draft');
end $$;
revoke execute on function public.acc_delete_invoice_draft(uuid) from public, anon;
grant  execute on function public.acc_delete_invoice_draft(uuid) to authenticated;

-- الإصدار (Part K): ذري بالكامل — التحققات كلها، ثم قفل العدّاد
-- FOR UPDATE وتخصيص الرقم، ثم اللقطة والتجميد والانتقال والتدقيق.
-- أي فشل يرد المعاملة كلها: تبقى DRAFT ولا يُستهلك رقم أبدًا.
create or replace function public.acc_issue_invoice(
  p_invoice uuid, p_issue_date date,
  p_fx_rate numeric default null, p_fx_rate_date date default null, p_fx_rate_source text default null
)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid; v_row record; v_cust record; v_base char(3);
  v_sum bigint; v_bad integer; v_number bigint;
  v_base_total bigint; v_rate_scaled numeric; v_num numeric; v_den numeric;
  v_inv_unit smallint; v_base_unit smallint;
begin
  select * into v_row from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  if v_row.status <> 'DRAFT' then
    raise exception 'only DRAFT invoices can be issued (invoice is %)', v_row.status;
  end if;

  select * into v_cust from public.acc_customers where id = v_row.customer_id;
  if v_cust.company_id <> v_row.company_id then
    raise exception 'invoice customer belongs to another company';
  end if;
  if not v_cust.active then
    raise exception 'an inactive customer cannot receive a new invoice';
  end if;

  -- الأسطر: موجودة، منتجاتها فعالة من الشركة نفسها، عملتها عملة
  -- الفاتورة، وضريبتها سليمة الدلالة
  select count(*) into v_bad from public.acc_invoice_lines l
  left join public.acc_products p on p.id = l.product_id
  where l.invoice_id = p_invoice
    and (p.id is null or p.company_id <> v_row.company_id or not p.active
         or l.currency <> v_row.currency);
  if v_bad > 0 then
    raise exception 'every line needs an active same-company product in the invoice currency';
  end if;
  select count(*) into v_bad from public.acc_invoice_lines
  where invoice_id = p_invoice
    and line_amount_minor <> public.acc_line_amount(quantity, unit_price_minor);
  if v_bad > 0 then
    raise exception 'line amounts must equal the deterministic quantity x price calculation';
  end if;
  select coalesce(sum(line_amount_minor), 0) into v_sum
  from public.acc_invoice_lines where invoice_id = p_invoice;
  if v_sum = 0 then
    raise exception 'an invoice of zero value needs at least one meaningful line';
  end if;
  if v_row.total_minor is distinct from v_sum or v_row.subtotal_minor is distinct from v_sum then
    raise exception 'invoice totals must equal the exact sum of its lines — supplied totals are never trusted';
  end if;

  -- FX: عملة أجنبية تتطلب أدلة سعر عبر الآلية المعتمدة — لا تخمين؛
  -- نفس معادلة HALF_UP الصحيحة التامة من Stage 3 حرفيًا
  select base_currency into v_base from public.acc_companies where id = v_row.company_id;
  if v_row.currency = v_base then
    if p_fx_rate is not null then
      raise exception 'same-currency invoices carry no FX rate';
    end if;
    v_base_total := v_sum;
  else
    if p_fx_rate is null or p_fx_rate <= 0 or p_fx_rate_date is null
       or p_fx_rate_source is null or btrim(p_fx_rate_source) = '' then
      raise exception 'a foreign-currency invoice needs rate, rate date and rate source — never guessed';
    end if;
    select minor_unit into v_inv_unit  from public.acc_currencies where code = v_row.currency;
    select minor_unit into v_base_unit from public.acc_currencies where code = v_base;
    v_rate_scaled := round(p_fx_rate::numeric(20,10) * 10000000000);
    v_num := v_sum::numeric * v_rate_scaled * (10::numeric ^ v_base_unit);
    v_den := 10::numeric ^ (10 + v_inv_unit);
    v_base_total := (div(v_num, v_den)
                     + case when 2 * mod(v_num, v_den) >= v_den then 1 else 0 end)::bigint;
  end if;

  -- الترقيم بلا فجوات: قفل صف عدّاد الشركة داخل هذه المعاملة نفسها —
  -- تزامنيًا يحصل الثاني على N+1، وفشل أي تحقق لاحق يرد الرقم.
  -- التوقيع يفتح العدّاد وكتابة أدلة الإصدار لهذا الصف حصرًا (FIX 1/2)
  perform set_config('acc.invoice_issue', p_invoice::text, true);
  insert into public.acc_invoice_counters (company_id) values (v_row.company_id)
  on conflict (company_id) do nothing;
  select last_number + 1 into v_number
  from public.acc_invoice_counters where company_id = v_row.company_id for update;
  update public.acc_invoice_counters set last_number = v_number where company_id = v_row.company_id;
  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_NUMBER_ALLOCATED', 'acc_invoices', p_invoice::text,
    null, jsonb_build_object('invoice_number', v_number::text), 'acc_issue_invoice');

  update public.acc_invoices
     set invoice_number = v_number,
         issue_date = p_issue_date,
         base_currency = v_base,
         base_total_minor = v_base_total,
         fx_rate = p_fx_rate, fx_rate_date = p_fx_rate_date, fx_rate_source = p_fx_rate_source,
         -- لقطة هوية العميل لحظة الإصدار — الوثيقة تُعاد طباعتها منها
         customer_snapshot = jsonb_build_object(
           'name', v_cust.name, 'contact', v_cust.contact,
           'tax_identifiers', v_cust.tax_identifiers,
           'currency', v_cust.currency, 'payment_terms', v_cust.payment_terms),
         issued_at = now(), issued_by = v_user
   where id = p_invoice;

  perform set_config('acc.invoice_op', v_row.id::text, true);
  update public.acc_invoices set status = 'ISSUED' where id = p_invoice;
  perform set_config('acc.invoice_op', '', true);
  perform set_config('acc.invoice_issue', '', true);

  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_ISSUED', 'acc_invoices', p_invoice::text,
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'ISSUED', 'invoice_number', v_number::text,
                       'total_minor', v_sum::text, 'base_total_minor', v_base_total::text),
    'acc_issue_invoice');
  return v_number;
end $$;
revoke execute on function public.acc_issue_invoice(uuid,date,numeric,date,text) from public, anon;
grant  execute on function public.acc_issue_invoice(uuid,date,numeric,date,text) to authenticated;

create or replace function public.acc_send_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  if v_row.status <> 'ISSUED' then
    raise exception 'only ISSUED invoices can be sent (invoice is %)', v_row.status;
  end if;
  -- SENT دليل تجاري أن التطبيق المالك طلب/أتم التسليم — لا منصة رسائل
  perform set_config('acc.invoice_op', v_row.id::text, true);
  update public.acc_invoices set status = 'SENT', sent_at = now() where id = p_invoice;
  perform set_config('acc.invoice_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_SENT', 'acc_invoices', p_invoice::text,
    jsonb_build_object('status', 'ISSUED'), jsonb_build_object('status', 'SENT'), 'acc_send_invoice');
end $$;
revoke execute on function public.acc_send_invoice(uuid) from public, anon;
grant  execute on function public.acc_send_invoice(uuid) to authenticated;

create or replace function public.acc_void_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'voiding requires a recorded reason';
  end if;
  select * into v_row from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  v_user := public.acc_assert_owner(v_row.company_id);
  if v_row.status <> 'ISSUED' then
    raise exception 'only ISSUED invoices can be voided (invoice is %)', v_row.status;
  end if;
  -- الملغاة تحتفظ برقمها ومحتواها للأبد — دليل تاريخي، لا حذف ولا أثر محاسبي
  perform set_config('acc.invoice_op', v_row.id::text, true);
  update public.acc_invoices set status = 'VOIDED', void_reason = p_reason where id = p_invoice;
  perform set_config('acc.invoice_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'INVOICE_VOIDED', 'acc_invoices', p_invoice::text,
    jsonb_build_object('status', 'ISSUED'),
    jsonb_build_object('status', 'VOIDED', 'reason', p_reason), 'acc_void_invoice');
end $$;
revoke execute on function public.acc_void_invoice(uuid,text) from public, anon;
grant  execute on function public.acc_void_invoice(uuid,text) to authenticated;
