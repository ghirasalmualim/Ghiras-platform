-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 9: استيراد كشوف البنوك
-- (Git فقط — فوق هجرات Stage 1..8 ولا تعدّلها)
--
-- BANK-001: استيراد الكشف هو القناة الأساسية لا بديلًا مؤقتًا.
-- BANK-002 + REG-KW-013: الربط البنكي المفتوح لاحقًا «موصل إضافي» بنفس
-- العقد — لا يُبنى أي bank feed الآن. BANK-004: المرحلة 10 تستهلك
-- النموذج الموحَّد حصرًا ولا تعرف صيغة المصدر. BANK-005: تخطيطات
-- البنوك «تهيئة بيانات» محدودة تصريحية — إضافة تخطيط جديد بلا إصدار
-- برمجي. BANK-006/007: بصمة مركّبة صارمة + مرشّح تكرار منفصل عن حقائق
-- المصدر؛ الغامض لا يُسقط أبدًا. BANK-008: معادلة النزاهة الدقيقة
-- opening + Σ = closing تحجب القبول.
--
-- ⚠️ صفر أثر دفتري: لا دالة هنا تنشئ/ترحّل قيدًا — المطابقة للمرحلة 10
-- والذكاء الاصطناعي للمرحلة 13 (قرار الإغلاق المعتمد: PDF الصوري
-- مؤجَّل صراحة للمرحلة 13). BLK-011 مفتوح: لا ادعاء دعم بنك كويتي
-- مسمّى بلا عينات ميدانية — كل البذور تركيبية PROPOSED.
--
-- الحقيقة المحاسبية للربط الدفتري مصدر واحد حصرًا:
-- acc_gl_account_links بغرض BANK_ACCOUNT (لا FK دفتري على حساب البنك).
-- كشف البنك بعملته «بيانات مصدر» — لا تحويل لعملة الأساس عند الابتلاع.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · حسابات البنك — بيانات واقعية مقنَّعة؛ لا IBAN كامل يُخزَّن أبدًا
-- ─────────────────────────────────────────────
create table if not exists public.acc_bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.acc_companies(id),
  bank_label          text not null check (btrim(bank_label) <> ''),
  -- القناع للعرض والبصمة للهوية/التكرار — ليست سرًّا ولا إخفاء هوية
  account_masked      text not null,
  account_fingerprint text not null check (account_fingerprint ~ '^[0-9a-f]{64}$'),
  currency            char(3) not null references public.acc_currencies(code),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now(),
  unique (company_id, account_fingerprint)
);
create or replace function public.acc_bank_accounts_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bank accounts are never deleted — deactivate instead';
  end if;
  if new.company_id is distinct from old.company_id
     or new.account_fingerprint is distinct from old.account_fingerprint
     or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at then
    raise exception 'bank account identity (company/fingerprint/currency) is immutable';
  end if;
  return new;
end $$;
drop trigger if exists acc_bank_accounts_guard_trg on public.acc_bank_accounts;
create trigger acc_bank_accounts_guard_trg
  before update or delete on public.acc_bank_accounts
  for each row execute function public.acc_bank_accounts_guard();

-- ─────────────────────────────────────────────
-- ٢ · تخطيطات الكشوف — تهيئة تصريحية محدودة (BANK-005) بنسخ محكومة
--     التحقق من الـspec في القاعدة نفسها: لا مفاتيح مجهولة، لا
--     تعبيرات، لا كود — صحة النوع والقيم المسموحة فقط (CORRECTION 8)
-- ─────────────────────────────────────────────
create or replace function public.acc_validate_bank_layout_spec(p jsonb, p_family text)
returns boolean language plpgsql immutable as $$
declare k text; cols jsonb; ck text;
        v_tabular boolean := p_family in ('CSV','XLSX','PDF_TEXT');
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  -- المفاتيح العليا: قائمة مغلقة
  for k in select jsonb_object_keys(p) loop
    if k not in ('header','columns','amount_semantics','drcr_flag','date_format',
                 'decimal_separator','thousands_separator','encoding','delimiter',
                 'currency_mode','fixed_currency','balance_direction','row_order') then
      return false;
    end if;
  end loop;
  -- الإلزامية والأنواع: الأعمدة والتاريخ ودلالة المبلغ للصيغ الجدولية
  -- حصرًا؛ الصيغ ذاتية الوصف (MT940/CAMT053/OFX/QIF) لا تحتاجها
  if v_tabular then
    if not (p ? 'columns' and jsonb_typeof(p->'columns') = 'object') then return false; end if;
    if not (p ? 'amount_semantics'
            and p->>'amount_semantics' in ('DEBIT_CREDIT_COLUMNS','SIGNED_AMOUNT','AMOUNT_PLUS_DRCR_FLAG')) then
      return false;
    end if;
    if not (p ? 'date_format' and jsonb_typeof(p->'date_format') = 'string'
            and p->>'date_format' ~ '^[DMY0-9./\- ]{4,20}$'
            and p->>'date_format' like '%D%' and p->>'date_format' like '%M%' and p->>'date_format' like '%Y%') then
      return false;
    end if;
  end if;
  if p ? 'encoding' and p->>'encoding' not in ('utf-8','windows-1256','utf-16le') then return false; end if;
  if p ? 'decimal_separator' and p->>'decimal_separator' not in ('.', ',') then return false; end if;
  if p ? 'thousands_separator' and p->>'thousands_separator' not in (',', '.', ' ', '') then return false; end if;
  if p ? 'delimiter' and (jsonb_typeof(p->'delimiter') <> 'string' or length(p->>'delimiter') <> 1) then return false; end if;
  if p ? 'currency_mode' and p->>'currency_mode' not in ('COLUMN','FIXED') then return false; end if;
  if p ? 'fixed_currency' and p->>'fixed_currency' !~ '^[A-Z]{3}$' then return false; end if;
  if p ? 'balance_direction' and p->>'balance_direction' not in ('AFTER_ROW','NONE') then return false; end if;
  if p ? 'row_order' and p->>'row_order' not in ('ASC','DESC') then return false; end if;
  if p ? 'header' then
    if jsonb_typeof(p->'header') <> 'object' then return false; end if;
    if (p->'header') ? 'skip_rows'
       and (jsonb_typeof(p->'header'->'skip_rows') <> 'number'
            or (p->'header'->>'skip_rows')::numeric not between 0 and 100) then return false; end if;
    if (p->'header') ? 'header_row_contains'
       and jsonb_typeof(p->'header'->'header_row_contains') <> 'array' then return false; end if;
  end if;
  -- الأعمدة: أسماء معلومة وقيم نص/رقم فقط (حيث وُجدت)
  if p ? 'columns' then
    cols := p->'columns';
    for ck in select jsonb_object_keys(cols) loop
      if ck not in ('txn_date','value_date','description','debit','credit','amount',
                    'balance','reference','currency') then return false; end if;
      if jsonb_typeof(cols->ck) not in ('string','number') then return false; end if;
    end loop;
    if v_tabular and not (cols ? 'txn_date' and cols ? 'description') then return false; end if;
  end if;
  if p ? 'drcr_flag' then
    if jsonb_typeof(p->'drcr_flag') <> 'object' then return false; end if;
    if not ((p->'drcr_flag') ? 'column'
            and jsonb_typeof(p->'drcr_flag'->'debit_values') = 'array'
            and jsonb_typeof(p->'drcr_flag'->'credit_values') = 'array') then return false; end if;
  end if;
  return true;
end $$;

create table if not exists public.acc_bank_layouts (
  id            uuid primary key default gen_random_uuid(),
  -- null = بذرة عامة (لا تُنشأ ولا تُفعَّل من مستأجر — CORRECTION 7)
  company_id    uuid references public.acc_companies(id),
  layout_key    text not null check (layout_key ~ '^[A-Za-z0-9_-]{2,60}$'),
  version       integer not null check (version >= 1),
  format_family text not null check (format_family in
                  ('CSV','XLSX','MT940','CAMT053','OFX','QIF','PDF_TEXT')),
  bank_hint     text,
  spec          jsonb not null,
  status        text not null default 'PROPOSED' check (status in ('PROPOSED','ACTIVE','RETIRED')),
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  check (public.acc_validate_bank_layout_spec(spec, format_family))
);
-- تفرّد النسخ: NULL في company_id لا يلغي التفرد
create unique index if not exists acc_bank_layouts_version_uq
  on public.acc_bank_layouts (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), layout_key, version);
create or replace function public.acc_bank_layouts_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bank layouts are configuration history — RETIRED, never deleted';
  end if;
  if new.company_id is distinct from old.company_id
     or new.layout_key is distinct from old.layout_key
     or new.version is distinct from old.version
     or new.format_family is distinct from old.format_family
     or new.created_at is distinct from old.created_at then
    raise exception 'layout identity is immutable — changes are a new version';
  end if;
  -- نسخة ACTIVE مجمّدة المواصفة؛ الانتقالات موقّعة
  if old.status = 'ACTIVE' and new.spec is distinct from old.spec then
    raise exception 'an ACTIVE layout spec is immutable — create a new version';
  end if;
  if new.status is distinct from old.status then
    if coalesce(current_setting('acc.bank_layout_op', true), '') <> old.id::text then
      raise exception 'layout status changes only through the governed layout functions';
    end if;
    if not ( (old.status = 'PROPOSED' and new.status in ('ACTIVE','RETIRED'))
          or (old.status = 'ACTIVE'   and new.status = 'RETIRED') ) then
      raise exception 'forbidden layout transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_bank_layouts_guard_trg on public.acc_bank_layouts;
create trigger acc_bank_layouts_guard_trg
  before update or delete on public.acc_bank_layouts
  for each row execute function public.acc_bank_layouts_guard();

-- ─────────────────────────────────────────────
-- ٣ · جولات الاستيراد — آلة حالات صريحة؛ ACCEPTED/REJECTED نهائيان مجمّدان
-- ─────────────────────────────────────────────
create table if not exists public.acc_bank_imports (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.acc_companies(id),
  bank_account_id       uuid not null references public.acc_bank_accounts(id),
  -- دليل المصدر: مستند Stage 8 مُقفَل من نوع BANK_STATEMENT
  document_id           uuid not null references public.acc_documents(id),
  -- بصمة المحتوى الخادمية المعتمدة: لقطة acc_documents.content_sha256
  -- (يحسبها الخادم من البايتات — لا بصمة عميل ولا بصمة منافسة)
  file_sha256           text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  layout_id             uuid not null references public.acc_bank_layouts(id),
  layout_version        integer not null,
  state                 text not null default 'CREATED' check (state in
                          ('CREATED','PARSING','PARSE_FAILED','NORMALIZED',
                           'INTEGRITY_FAILED','DEDUPLICATED','ACCEPTED','REJECTED')),
  attempt               integer not null default 1 check (attempt >= 1),
  -- coverage_range الإلزامي (BANK-003)
  period_start          date,
  period_end            date,
  -- balance_assertion الإلزامي + مصدره (CORRECTION 5)
  opening_balance_minor bigint,
  closing_balance_minor bigint,
  movement_sum_minor    bigint,
  assertion_source      text check (assertion_source in
                          ('EXPLICIT_SOURCE','DERIVED_FROM_RUNNING_BALANCE')),
  assertion_derivation  jsonb,
  currency              char(3) not null references public.acc_currencies(code),
  row_count             integer,
  freshness_as_of       date,
  supersedes_import_id  uuid references public.acc_bank_imports(id),
  rejected_reason       text,
  created_at            timestamptz not null default now(),
  created_by            uuid not null references auth.users(id),
  accepted_at           timestamptz,
  accepted_by           uuid references auth.users(id),
  -- نفس البايتات + نفس الشركة + نفس الحساب = جولة واحدة (idempotent)
  unique (company_id, bank_account_id, file_sha256),
  check (period_start is null or period_end is null or period_start <= period_end)
);
create index if not exists acc_bank_imports_account_idx
  on public.acc_bank_imports (bank_account_id, state, period_start, period_end);
create or replace function public.acc_bank_imports_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bank imports are permanent evidence runs — REJECTED, never deleted';
  end if;
  if new.company_id is distinct from old.company_id
     or new.bank_account_id is distinct from old.bank_account_id
     or new.document_id is distinct from old.document_id
     or new.file_sha256 is distinct from old.file_sha256
     or new.supersedes_import_id is distinct from old.supersedes_import_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'bank import identity is immutable';
  end if;
  if old.state in ('ACCEPTED','REJECTED') then
    raise exception 'an % bank import is frozen source evidence — a changed statement is a NEW import with supersedes lineage', old.state;
  end if;
  if new.attempt < old.attempt then
    raise exception 'attempt counter only increases';
  end if;
  if new.state is distinct from old.state then
    if coalesce(current_setting('acc.bank_import_op', true), '') <> old.id::text then
      raise exception 'bank import state changes only through the signed import pipeline';
    end if;
    if not ( (old.state = 'CREATED'          and new.state = 'PARSING')
          or (old.state = 'PARSING'          and new.state in ('NORMALIZED','PARSE_FAILED','INTEGRITY_FAILED'))
          or (old.state = 'NORMALIZED'       and new.state in ('DEDUPLICATED','INTEGRITY_FAILED'))
          or (old.state = 'DEDUPLICATED'     and new.state in ('ACCEPTED','REJECTED'))
          or (old.state = 'PARSE_FAILED'     and new.state in ('PARSING','REJECTED'))
          or (old.state = 'INTEGRITY_FAILED' and new.state in ('PARSING','REJECTED')) ) then
      raise exception 'forbidden bank import transition: % -> %', old.state, new.state;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_bank_imports_guard_trg on public.acc_bank_imports;
create trigger acc_bank_imports_guard_trg
  before update or delete on public.acc_bank_imports
  for each row execute function public.acc_bank_imports_guard();

-- ─────────────────────────────────────────────
-- ٤ · الحركات الموحَّدة — حقائق البنك المملوكة له؛ مجمّدة بعد القبول.
--     دائن للحساب = موجب، مدين = سالب. لا تحويل عملة، لا floats.
--     استنتاجات التكرار في جدول مشتق منفصل (CORRECTION 2) — لا حالة
--     قابلة للتغيير على صف المصدر.
-- ─────────────────────────────────────────────
create table if not exists public.acc_bank_transactions (
  id                    uuid primary key default gen_random_uuid(),
  import_id             uuid not null references public.acc_bank_imports(id),
  company_id            uuid not null references public.acc_companies(id),
  bank_account_id       uuid not null references public.acc_bank_accounts(id),
  row_no                integer not null check (row_no >= 1),
  txn_date              date not null,
  -- قد يغيب من المصدر — لا يُصنَّع ولا يُستبدل بتاريخ الحركة (CORRECTION 4)
  value_date            date,
  description_raw       text not null,
  -- التطبيع القانوني الحتمي للمطابقة فقط (NFKC، مسافات، حالة) — العرض خام
  description_canon     text not null,
  amount_minor          bigint not null,
  currency              char(3) not null references public.acc_currencies(code),
  running_balance_minor bigint,
  reference             text,
  -- البصمة الصارمة (BANK-006): تُحسب في الخادم فقط عند اكتمال مكوّناتها
  -- (value_date + الرصيد الجاري) — الغياب لا يُعوَّض بثنائية ضعيفة
  fingerprint           text check (fingerprint ~ '^[0-9a-f]{64}$'),
  raw                   jsonb not null,
  created_at            timestamptz not null default now(),
  unique (import_id, row_no)
);
create index if not exists acc_bank_txn_fp_idx
  on public.acc_bank_transactions (bank_account_id, fingerprint);
create index if not exists acc_bank_txn_anchor_idx
  on public.acc_bank_transactions (bank_account_id, value_date, amount_minor);
create or replace function public.acc_bank_txn_guard()
returns trigger language plpgsql as $$
declare v_state text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'normalized bank transactions are bank-owned source facts — never edited';
  end if;
  if tg_op = 'INSERT' then
    -- الصفوف تُكتب أثناء PARSING حصرًا — لا إدراج على جولة مقبولة/مجمّدة
    select bi.state into v_state from public.acc_bank_imports bi where bi.id = new.import_id;
    if v_state is distinct from 'PARSING' then
      raise exception 'bank transactions are written only while their import is PARSING';
    end if;
    return new;
  end if;
  -- الحذف حصرًا أثناء إعادة parse موقّعة على جولة غير مقبولة
  select bi.state into v_state from public.acc_bank_imports bi where bi.id = old.import_id;
  if v_state <> 'PARSING'
     or coalesce(current_setting('acc.bank_import_op', true), '') <> old.import_id::text then
    raise exception 'bank transactions of an accepted or non-reparsing import are immutable evidence';
  end if;
  return old;
end $$;
drop trigger if exists acc_bank_txn_guard_trg on public.acc_bank_transactions;
create trigger acc_bank_txn_guard_trg
  before insert or update or delete on public.acc_bank_transactions
  for each row execute function public.acc_bank_txn_guard();

-- ─────────────────────────────────────────────
-- ٥ · مرشّحو التكرار (دليل مشتق append-only) + أحداث/شروط الاستيراد
-- ─────────────────────────────────────────────
create table if not exists public.acc_bank_duplicate_candidates (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.acc_companies(id),
  import_id                uuid not null references public.acc_bank_imports(id),
  -- الاتجاه دائمًا: الحركة الجديدة → مرشّح سبق قبوله (أو صف أسبق بنفس الملف)
  transaction_id           uuid not null references public.acc_bank_transactions(id),
  candidate_transaction_id uuid not null references public.acc_bank_transactions(id),
  kind                     text not null check (kind in ('EXACT_DUPLICATE','SUSPECTED_DUPLICATE')),
  basis                    jsonb not null,
  created_at               timestamptz not null default now(),
  unique (transaction_id, candidate_transaction_id),
  check (transaction_id <> candidate_transaction_id)
);
create or replace function public.acc_bank_dupes_frozen()
returns trigger language plpgsql as $$
begin
  -- EXACT استنتاج حتمي نهائي؛ SUSPECTED معلّق تحسمه المرحلة 10/11 بسجل
  -- قرار لاحق منفصل — لا تعديل للحقيقة الأصلية أبدًا
  raise exception 'duplicate candidates are append-only derived evidence: % refused', tg_op;
end $$;
drop trigger if exists acc_bank_dupes_frozen_trg on public.acc_bank_duplicate_candidates;
create trigger acc_bank_dupes_frozen_trg
  before update or delete on public.acc_bank_duplicate_candidates
  for each row execute function public.acc_bank_dupes_frozen();

-- شروط الاستيراد الآلية — منفصلة عن «حالة» الجولة (CORRECTION 9):
-- حاجبة: PARSE_FAILED/FILE_INTEGRITY/UNSUPPORTED_FORMAT/UNKNOWN_LAYOUT/
--         ACCOUNT_MISMATCH/CURRENCY_MISMATCH
-- غير حاجبة: COVERAGE_GAP (معلوماتية)، SUSPECTED_DUPLICATE (لا تمنع
--            القبول لكنها معلّقة لاستهلاك المرحلة 10)
create table if not exists public.acc_bank_import_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.acc_companies(id),
  import_id   uuid not null references public.acc_bank_imports(id),
  attempt     integer not null,
  condition   text not null check (condition in
                ('PARSE_FAILED','FILE_INTEGRITY','SUSPECTED_DUPLICATE',
                 'UNSUPPORTED_FORMAT','UNKNOWN_LAYOUT','ACCOUNT_MISMATCH',
                 'CURRENCY_MISMATCH','COVERAGE_GAP')),
  blocking    boolean not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists acc_bank_events_import_idx
  on public.acc_bank_import_events (import_id, attempt, blocking);
create or replace function public.acc_bank_events_frozen()
returns trigger language plpgsql as $$
begin raise exception 'bank import events are append-only: % refused', tg_op; end $$;
drop trigger if exists acc_bank_events_frozen_trg on public.acc_bank_import_events;
create trigger acc_bank_events_frozen_trg
  before update or delete on public.acc_bank_import_events
  for each row execute function public.acc_bank_events_frozen();

-- ─────────────────────────────────────────────
-- ٦ · توسيعات Stage 8 (في هجرة Stage 9 حصرًا — لا تعديل لملفات 1..8)
-- ─────────────────────────────────────────────
-- أ · مصدر الربط الدفتري الواحد: غرض BANK_ACCOUNT (scope = هوية حساب البنك)
alter table public.acc_gl_account_links drop constraint if exists acc_gl_links_purpose_chk;
alter table public.acc_gl_account_links
  add constraint acc_gl_links_purpose_chk check (purpose in
    ('DEFERRED_REVENUE','GATEWAY_CLEARING','CASH_IN_TRANSIT',
     'GATEWAY_FEE_EXPENSE','CONTRA_REVENUE','UNIDENTIFIED_SETTLEMENT_DIFFERENCE',
     'EXPENSE_ACCOUNT','EXPENSE_PAYABLE','BANK_ACCOUNT'));

-- ب · نوع هدف روابط المستندات: BANK_IMPORT
alter table public.acc_document_links drop constraint if exists acc_document_links_target_kind_check;
alter table public.acc_document_links
  add constraint acc_document_links_target_kind_check
  check (target_kind in ('EXPENSE','JOURNAL_ENTRY','INVOICE','PAYMENT','BANK_IMPORT'));

-- ج · حارس الروابط: وجود الهدف وشركته + تجميد فكّ دليل الجولة المقبولة
create or replace function public.acc_doc_links_guard()
returns trigger language plpgsql as $$
declare v_target_company uuid; v_state text; v_doc_company uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'document links are immutable rows — remove and recreate through the audited path';
  end if;
  if tg_op = 'INSERT' then
    select company_id into v_doc_company from public.acc_documents where id = new.document_id;
    if v_doc_company is null or v_doc_company <> new.company_id then
      raise exception 'document does not belong to the link company';
    end if;
    if new.target_kind = 'EXPENSE' then
      select company_id into v_target_company from public.acc_expenses where id = new.target_id;
    elsif new.target_kind = 'JOURNAL_ENTRY' then
      select company_id into v_target_company from public.acc_journal_entries where id = new.target_id;
    elsif new.target_kind = 'INVOICE' then
      select company_id into v_target_company from public.acc_invoices where id = new.target_id;
    elsif new.target_kind = 'PAYMENT' then
      select company_id into v_target_company from public.acc_payments where id = new.target_id;
    elsif new.target_kind = 'BANK_IMPORT' then
      select company_id into v_target_company from public.acc_bank_imports where id = new.target_id;
    end if;
    if v_target_company is null then
      raise exception 'link target does not exist for kind %', new.target_kind;
    end if;
    if v_target_company <> new.company_id then
      raise exception 'cross-company document link is forbidden';
    end if;
    return new;
  end if;
  -- DELETE: قيد POSTED/REVERSED لا يفكّ دليله أبدًا؛ مصروف من SUBMITTED
  -- فما فوق يتجمّد؛ وجولة بنك ACCEPTED دليلها مجمّد (CORRECTION 6)
  if old.target_kind = 'JOURNAL_ENTRY' then
    select status into v_state from public.acc_journal_entries where id = old.target_id;
    if v_state in ('POSTED','REVERSED') then
      raise exception 'evidence linked to a posted journal can never be unlinked';
    end if;
  elsif old.target_kind = 'EXPENSE' then
    select state into v_state from public.acc_expenses where id = old.target_id;
    if v_state = 'POSTED' then
      raise exception 'evidence linked to a posted expense can never be unlinked';
    end if;
    if v_state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST')
       and coalesce(current_setting('acc.doc_replace', true), '') <> old.id::text then
      raise exception 'source links freeze at SUBMITTED — use the audited replacement operation';
    end if;
  elsif old.target_kind = 'BANK_IMPORT' then
    select state into v_state from public.acc_bank_imports where id = old.target_id;
    if v_state = 'ACCEPTED' then
      raise exception 'evidence linked to an accepted bank import can never be unlinked';
    end if;
  end if;
  return old;
end $$;

-- د · حذف المستند: حجب دليل جولة بنكية مقبولة (يمتد فوق نسخة 2026-08-30
--     المؤهَّلة — CREATE OR REPLACE فقط، لا تعديل لملف سابق)
create or replace function public.acc_delete_document(p_document uuid)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record; v_role text; v_posted boolean; v_bank boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents d where d.id = p_document;
  if not found then raise exception 'unknown document'; end if;
  v_role := coalesce(public.acc_role(v_doc.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT')
          or (v_role = 'EMPLOYEE' and v_doc.uploaded_by = v_user
              and not exists (select 1 from public.acc_document_links l where l.document_id = p_document))) then
    raise exception 'document deletion requires OWNER/ACCOUNTANT (or the employee uploader while unlinked)';
  end if;
  select exists (
    select 1 from public.acc_document_links l
    where l.document_id = p_document
      and ((l.target_kind = 'JOURNAL_ENTRY' and exists
             (select 1 from public.acc_journal_entries j
              where j.id = l.target_id and j.status in ('POSTED','REVERSED')))
        or (l.target_kind = 'EXPENSE' and exists
             (select 1 from public.acc_expenses e
              where e.id = l.target_id and e.state = 'POSTED')))
  ) into v_posted;
  if v_posted then
    perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETE_BLOCKED_POSTED', 'acc_documents',
      p_document::text, null, jsonb_build_object('sha256', v_doc.content_sha256), 'acc_delete_document');
    return query select p_document, 'BLOCKED_POSTED'::text; return;
  end if;
  select exists (
    select 1 from public.acc_document_links l
    where l.document_id = p_document and l.target_kind = 'BANK_IMPORT'
      and exists (select 1 from public.acc_bank_imports bi
                  where bi.id = l.target_id and bi.state = 'ACCEPTED')
  ) into v_bank;
  if v_bank then
    perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETE_BLOCKED_ACCEPTED_IMPORT', 'acc_documents',
      p_document::text, null, jsonb_build_object('sha256', v_doc.content_sha256), 'acc_delete_document');
    return query select p_document, 'BLOCKED_ACCEPTED_IMPORT'::text; return;
  end if;
  if exists (select 1 from public.acc_document_links l where l.document_id = p_document) then
    return query select p_document, 'BLOCKED_LINKED'::text; return;
  end if;
  perform set_config('acc.doc_op', p_document::text, true);
  delete from public.acc_document_pages dp where dp.document_id = p_document;
  delete from public.acc_documents d where d.id = p_document;
  perform set_config('acc.doc_op', '', true);
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETED', 'acc_documents',
    p_document::text, jsonb_build_object('sha256', v_doc.content_sha256, 'doc_type', v_doc.doc_type,
    'state', v_doc.state), null, 'acc_delete_document');
  return query select p_document, 'DELETED'::text;
end $$;
revoke execute on function public.acc_delete_document(uuid) from public, anon;
grant  execute on function public.acc_delete_document(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٧ · RLS — OWNER/ACCOUNTANT/FM/AUDITOR قراءة؛ لا EMPLOYEE ولا READ_ONLY
--     على أدلة البنك الخام؛ الكتابة عبر الدوال حصرًا
-- ─────────────────────────────────────────────
alter table public.acc_bank_accounts             enable row level security;
alter table public.acc_bank_layouts              enable row level security;
alter table public.acc_bank_imports              enable row level security;
alter table public.acc_bank_transactions         enable row level security;
alter table public.acc_bank_duplicate_candidates enable row level security;
alter table public.acc_bank_import_events        enable row level security;

create policy acc_bank_accounts_select on public.acc_bank_accounts
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_bank_layouts_select on public.acc_bank_layouts
  for select using (
    (company_id is null and auth.uid() is not null)  -- بذور عامة: قراءة فقط
    or coalesce(public.acc_role(company_id), '') in
       ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_bank_imports_select on public.acc_bank_imports
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_bank_txn_select on public.acc_bank_transactions
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_bank_dupes_select on public.acc_bank_duplicate_candidates
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_bank_events_select on public.acc_bank_import_events
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));

revoke insert, update, delete on public.acc_bank_accounts             from anon, authenticated;
revoke insert, update, delete on public.acc_bank_layouts              from anon, authenticated;
revoke insert, update, delete on public.acc_bank_imports              from anon, authenticated;
revoke insert, update, delete on public.acc_bank_transactions         from anon, authenticated;
revoke insert, update, delete on public.acc_bank_duplicate_candidates from anon, authenticated;
revoke insert, update, delete on public.acc_bank_import_events        from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٨ · دوال بشرية (authenticated ببوابات دور fail-closed)
-- ─────────────────────────────────────────────
-- حساب بنك: OWNER/ACCOUNTANT — المعرّف الكامل يمرّ عابرًا ولا يُخزَّن:
-- الخادم يحسب البصمة والقناع فقط
create function public.acc_create_bank_account(
  p_company uuid, p_bank_label text, p_account_identifier text, p_currency char(3)
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_fp text; v_masked text; v_clean text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'bank accounts are created by OWNER or ACCOUNTANT';
  end if;
  v_clean := upper(regexp_replace(coalesce(p_account_identifier, ''), '\s', '', 'g'));
  if length(v_clean) < 6 then raise exception 'account identifier too short'; end if;
  v_fp := encode(sha256(convert_to(v_clean, 'UTF8')), 'hex');
  v_masked := left(v_clean, 2) || '…' || right(v_clean, 4);
  insert into public.acc_bank_accounts (company_id, bank_label, account_masked, account_fingerprint, currency, created_by)
  values (p_company, p_bank_label, v_masked, v_fp, p_currency, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'BANK_ACCOUNT_CREATED', 'acc_bank_accounts', v_id::text,
    null, jsonb_build_object('label', p_bank_label, 'masked', v_masked, 'currency', p_currency),
    'acc_create_bank_account');
  return v_id;
end $$;
revoke execute on function public.acc_create_bank_account(uuid,text,text,char) from public, anon;
grant  execute on function public.acc_create_bank_account(uuid,text,text,char) to authenticated;

create function public.acc_update_bank_account(
  p_account uuid, p_bank_label text, p_active boolean
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_bank_accounts a where a.id = p_account;
  if not found then raise exception 'unknown bank account'; end if;
  if coalesce(public.acc_role(v_row.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'bank accounts are managed by OWNER or ACCOUNTANT';
  end if;
  update public.acc_bank_accounts a
     set bank_label = coalesce(p_bank_label, a.bank_label),
         active = coalesce(p_active, a.active), updated_at = now()
   where a.id = p_account;
  perform public.acc_audit(v_row.company_id, v_user, 'BANK_ACCOUNT_UPDATED', 'acc_bank_accounts',
    p_account::text, jsonb_build_object('label', v_row.bank_label, 'active', v_row.active),
    jsonb_build_object('label', coalesce(p_bank_label, v_row.bank_label),
                       'active', coalesce(p_active, v_row.active)), 'acc_update_bank_account');
end $$;
revoke execute on function public.acc_update_bank_account(uuid,text,boolean) from public, anon;
grant  execute on function public.acc_update_bank_account(uuid,text,boolean) to authenticated;

-- تخطيطات: المحاسبة حصرًا، ونطاق الشركة حصرًا (CORRECTION 7 — لا صفوف
-- عامة من مستأجر؛ العامة بذور هجرة/حوكمة منصة لاحقة فقط)
create function public.acc_add_bank_layout(
  p_company uuid, p_layout_key text, p_format_family text, p_bank_hint text, p_spec jsonb
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_version integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_company is null then
    raise exception 'global layouts are platform-governed seeds — tenants create company layouts only';
  end if;
  if coalesce(public.acc_role(p_company), '') <> 'ACCOUNTANT' then
    raise exception 'bank layout configuration is the ACCOUNTANT''s act';
  end if;
  select coalesce(max(l.version), 0) + 1 into v_version
    from public.acc_bank_layouts l
   where l.company_id = p_company and l.layout_key = p_layout_key;
  insert into public.acc_bank_layouts (company_id, layout_key, version, format_family, bank_hint, spec, created_by)
  values (p_company, p_layout_key, v_version, p_format_family, p_bank_hint, p_spec, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'BANK_LAYOUT_CREATED', 'acc_bank_layouts', v_id::text,
    null, jsonb_build_object('layout_key', p_layout_key, 'version', v_version,
    'format_family', p_format_family), 'acc_add_bank_layout');
  return v_id;
end $$;
revoke execute on function public.acc_add_bank_layout(uuid,text,text,text,jsonb) from public, anon;
grant  execute on function public.acc_add_bank_layout(uuid,text,text,text,jsonb) to authenticated;

create function public.acc_activate_bank_layout(p_layout uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_bank_layouts l where l.id = p_layout;
  if not found then raise exception 'unknown layout'; end if;
  if v_row.company_id is null then
    raise exception 'global seed layouts are never tenant-activated — copy into a company layout';
  end if;
  if coalesce(public.acc_role(v_row.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'layout activation is the ACCOUNTANT''s act';
  end if;
  perform set_config('acc.bank_layout_op', p_layout::text, true);
  update public.acc_bank_layouts l set status = 'ACTIVE' where l.id = p_layout;
  perform set_config('acc.bank_layout_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'BANK_LAYOUT_ACTIVATED', 'acc_bank_layouts',
    p_layout::text, jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', 'ACTIVE'), 'acc_activate_bank_layout');
end $$;
revoke execute on function public.acc_activate_bank_layout(uuid) from public, anon;
grant  execute on function public.acc_activate_bank_layout(uuid) to authenticated;

create function public.acc_retire_bank_layout(p_layout uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_bank_layouts l where l.id = p_layout;
  if not found then raise exception 'unknown layout'; end if;
  if v_row.company_id is null then raise exception 'global seed layouts are platform-governed'; end if;
  if coalesce(public.acc_role(v_row.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'layout retirement is the ACCOUNTANT''s act';
  end if;
  perform set_config('acc.bank_layout_op', p_layout::text, true);
  update public.acc_bank_layouts l set status = 'RETIRED' where l.id = p_layout;
  perform set_config('acc.bank_layout_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'BANK_LAYOUT_RETIRED', 'acc_bank_layouts',
    p_layout::text, jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', 'RETIRED'), 'acc_retire_bank_layout');
end $$;
revoke execute on function public.acc_retire_bank_layout(uuid) from public, anon;
grant  execute on function public.acc_retire_bank_layout(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · خط الأنابيب (service_role عبر تنسيق الخادم؛ p_actor إنسان مخوَّل
--     يتحقق منه بالاسم — CORRECTION «SERVICE ROLE»). صفر قيود دفترية.
-- ─────────────────────────────────────────────
-- مساعد تحقق الفاعل: عضو بشري بدور مسموح في نفس الشركة (fail-closed)
create function public.acc_bank_assert_actor(p_company uuid, p_actor uuid, p_roles text[])
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_actor is null then raise exception 'actor identity required'; end if;
  if not (coalesce(public.acc_role_of(p_company, p_actor), '') = any (p_roles)) then
    raise exception 'actor lacks an allowed role for this bank operation (needs one of %)', array_to_string(p_roles, '/');
  end if;
end $$;
revoke execute on function public.acc_bank_assert_actor(uuid,uuid,text[]) from public, anon, authenticated;
grant  execute on function public.acc_bank_assert_actor(uuid,uuid,text[]) to service_role;

-- إنشاء جولة استيراد — idempotent على بصمة المحتوى الخادمية للمستند
create function public.acc_create_bank_import(
  p_company uuid, p_actor uuid, p_bank_account uuid, p_document uuid,
  p_layout uuid, p_supersedes uuid default null
)
returns table (import_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_acct record; v_doc record; v_layout record; v_id uuid; v_exist record;
begin
  perform public.acc_bank_assert_actor(p_company, p_actor,
    array['BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER']);
  select * into v_acct from public.acc_bank_accounts a where a.id = p_bank_account;
  if not found or v_acct.company_id <> p_company then
    raise exception 'bank account does not belong to this company';
  end if;
  if not v_acct.active then raise exception 'bank account is inactive'; end if;
  select * into v_doc from public.acc_documents d where d.id = p_document;
  if not found or v_doc.company_id <> p_company then
    raise exception 'statement document does not belong to this company';
  end if;
  if v_doc.state <> 'FINALIZED' or v_doc.doc_type <> 'BANK_STATEMENT' then
    raise exception 'the source must be a FINALIZED BANK_STATEMENT document';
  end if;
  select * into v_layout from public.acc_bank_layouts l where l.id = p_layout;
  if not found or (v_layout.company_id is not null and v_layout.company_id <> p_company) then
    raise exception 'layout does not belong to this company';
  end if;
  if v_layout.status <> 'ACTIVE' then
    raise exception 'imports run only on an ACTIVE layout version';
  end if;
  if p_supersedes is not null and not exists
     (select 1 from public.acc_bank_imports s
       where s.id = p_supersedes and s.company_id = p_company
         and s.bank_account_id = p_bank_account) then
    raise exception 'supersedes lineage must reference a same-account import';
  end if;
  insert into public.acc_bank_imports
    (company_id, bank_account_id, document_id, file_sha256, layout_id, layout_version,
     currency, supersedes_import_id, created_by)
  values (p_company, p_bank_account, p_document, v_doc.content_sha256, p_layout,
          v_layout.version, v_acct.currency, p_supersedes, p_actor)
  on conflict (company_id, bank_account_id, file_sha256) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.acc_audit(p_company, p_actor, 'BANK_IMPORT_CREATED', 'acc_bank_imports', v_id::text,
      null, jsonb_build_object('bank_account', p_bank_account, 'document', p_document,
      'layout', v_layout.layout_key, 'layout_version', v_layout.version,
      'supersedes', p_supersedes), 'acc_create_bank_import');
    if p_supersedes is not null then
      perform public.acc_audit(p_company, p_actor, 'BANK_IMPORT_SUPERSEDED', 'acc_bank_imports',
        p_supersedes::text, null, jsonb_build_object('superseded_by', v_id), 'acc_create_bank_import');
    end if;
    return query select v_id, 'CREATED'::text; return;
  end if;
  -- نفس البايتات + نفس الحساب = نفس الجولة، لا صفوف جديدة
  select * into v_exist from public.acc_bank_imports bi
   where bi.company_id = p_company and bi.bank_account_id = p_bank_account
     and bi.file_sha256 = v_doc.content_sha256;
  return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text;
end $$;
revoke execute on function public.acc_create_bank_import(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant  execute on function public.acc_create_bank_import(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

-- بدء/إعادة parse — على نفس الجولة غير المقبولة؛ المحاولة تُعدّ وتدقَّق
create function public.acc_begin_bank_parse(p_import uuid, p_actor uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_row record; v_attempt integer;
begin
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  perform public.acc_bank_assert_actor(v_row.company_id, p_actor,
    array['BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER']);
  if v_row.state not in ('CREATED','PARSE_FAILED','INTEGRITY_FAILED') then
    raise exception 'parse begins from CREATED or a retryable failure (state %)', v_row.state;
  end if;
  v_attempt := case when v_row.state = 'CREATED' then v_row.attempt else v_row.attempt + 1 end;
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi
     set state = 'PARSING', attempt = v_attempt,
         period_start = null, period_end = null, opening_balance_minor = null,
         closing_balance_minor = null, movement_sum_minor = null,
         assertion_source = null, assertion_derivation = null, row_count = null
   where bi.id = p_import;
  delete from public.acc_bank_transactions t where t.import_id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  if v_attempt > v_row.attempt then
    perform public.acc_audit(v_row.company_id, p_actor, 'BANK_IMPORT_RETRIED', 'acc_bank_imports',
      p_import::text, jsonb_build_object('state', v_row.state, 'attempt', v_row.attempt),
      jsonb_build_object('attempt', v_attempt), 'acc_begin_bank_parse');
  end if;
  return v_attempt;
end $$;
revoke execute on function public.acc_begin_bank_parse(uuid,uuid) from public, anon, authenticated;
grant  execute on function public.acc_begin_bank_parse(uuid,uuid) to service_role;

-- فشل parse/كشف صيغة — حالة + شرط حاجب (المسمّيات في CORRECTION 9)
create function public.acc_fail_bank_parse(p_import uuid, p_condition text, p_detail jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_row record;
begin
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if v_row.state <> 'PARSING' then raise exception 'parse failure applies to PARSING'; end if;
  if p_condition not in ('PARSE_FAILED','UNSUPPORTED_FORMAT','UNKNOWN_LAYOUT') then
    raise exception 'invalid parse failure condition %', p_condition;
  end if;
  insert into public.acc_bank_import_events (company_id, import_id, attempt, condition, blocking, detail)
  values (v_row.company_id, p_import, v_row.attempt, p_condition, true, p_detail);
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi set state = 'PARSE_FAILED' where bi.id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  perform public.acc_audit(v_row.company_id, null, 'BANK_PARSE_FAILED', 'acc_bank_imports',
    p_import::text, null, jsonb_build_object('condition', p_condition, 'attempt', v_row.attempt,
    'detail', p_detail), 'acc_fail_bank_parse');
end $$;
revoke execute on function public.acc_fail_bank_parse(uuid,text,jsonb) from public, anon, authenticated;
grant  execute on function public.acc_fail_bank_parse(uuid,text,jsonb) to service_role;

-- تسجيل الحركات الموحَّدة دفعةً — البصمة الصارمة تُحسب هنا في الخادم
-- فقط عند اكتمال مكوّناتها (CORRECTION 4: لا تُصنَّع ولا تُضعَّف)
create function public.acc_record_bank_rows(p_import uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_row record; r jsonb; v_n integer := 0; v_vd date; v_bal bigint; v_fp text;
begin
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if v_row.state <> 'PARSING' then raise exception 'rows are recorded during PARSING'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_vd := nullif(r->>'value_date', '')::date;
    v_bal := nullif(r->>'running_balance_minor', '')::bigint;
    if v_vd is not null and v_bal is not null then
      v_fp := encode(sha256(convert_to(
        v_row.bank_account_id::text || '|' || v_vd::text || '|' || (r->>'amount_minor') || '|' ||
        v_row.currency || '|' || (r->>'description_canon') || '|' || v_bal::text, 'UTF8')), 'hex');
    else
      v_fp := null;
    end if;
    insert into public.acc_bank_transactions
      (import_id, company_id, bank_account_id, row_no, txn_date, value_date,
       description_raw, description_canon, amount_minor, currency,
       running_balance_minor, reference, fingerprint, raw)
    values
      (p_import, v_row.company_id, v_row.bank_account_id, (r->>'row_no')::integer,
       (r->>'txn_date')::date, v_vd, r->>'description_raw', r->>'description_canon',
       (r->>'amount_minor')::bigint, v_row.currency, v_bal,
       nullif(r->>'reference', ''), v_fp, coalesce(r->'raw', '{}'::jsonb));
  end loop;
  return v_n;
end $$;
revoke execute on function public.acc_record_bank_rows(uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.acc_record_bank_rows(uuid,jsonb) to service_role;

-- التطبيع + النزاهة (BANK-008): معادلة دقيقة بلا تسامح + سلسلة الرصيد
-- حيث توفّرت + مطابقة الحساب والعملة (شروط حاجبة) + مصدر التوكيد
create function public.acc_normalize_bank_import(
  p_import uuid, p_period_start date, p_period_end date,
  p_opening_minor bigint, p_closing_minor bigint,
  p_assertion_source text, p_assertion_derivation jsonb,
  p_freshness date, p_detected_currency char(3), p_detected_account_fp text
)
returns table (import_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_row record; v_acct record; v_sum bigint; v_cnt integer; v_chain_ok boolean := true;
        v_prev bigint; t record; v_fail text := null; v_detail jsonb := '{}'::jsonb;
begin
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if v_row.state <> 'PARSING' then raise exception 'normalization applies to PARSING'; end if;
  select * into v_acct from public.acc_bank_accounts a where a.id = v_row.bank_account_id;
  -- مطابقة الحساب والعملة المكتشفة في الملف (حاجبة عند التوفر والاختلاف)
  if p_detected_currency is not null and p_detected_currency <> v_acct.currency then
    v_fail := 'CURRENCY_MISMATCH';
    v_detail := jsonb_build_object('expected', v_acct.currency, 'found', p_detected_currency);
  elsif p_detected_account_fp is not null and p_detected_account_fp <> v_acct.account_fingerprint then
    v_fail := 'ACCOUNT_MISMATCH';
    v_detail := jsonb_build_object('note', 'statement account does not match the selected bank account');
  elsif p_assertion_source is null
        or p_assertion_source not in ('EXPLICIT_SOURCE','DERIVED_FROM_RUNNING_BALANCE') then
    -- لا توكيد رصيد قابل للإثبات = لا قبول (BANK-003/008 — لا حقائق مصنوعة)
    v_fail := 'FILE_INTEGRITY';
    v_detail := jsonb_build_object('note', 'no provable balance assertion (explicit or derived)');
  elsif p_period_start is null or p_period_end is null then
    v_fail := 'FILE_INTEGRITY';
    v_detail := jsonb_build_object('note', 'coverage range is mandatory (BANK-003)');
  elsif p_opening_minor is null or p_closing_minor is null then
    v_fail := 'FILE_INTEGRITY';
    v_detail := jsonb_build_object('note', 'opening/closing balances are mandatory (BANK-008)');
  end if;
  select coalesce(sum(t2.amount_minor), 0), count(*) into v_sum, v_cnt
    from public.acc_bank_transactions t2 where t2.import_id = p_import;
  if v_fail is null and p_opening_minor + v_sum <> p_closing_minor then
    v_fail := 'FILE_INTEGRITY';
    v_detail := jsonb_build_object('opening', p_opening_minor::text, 'movements', v_sum::text,
      'expected_closing', (p_opening_minor + v_sum)::text, 'stated_closing', p_closing_minor::text);
  end if;
  -- سلسلة الرصيد الجاري صفًا بصف حيث توفّرت كاملة
  if v_fail is null and v_cnt > 0
     and not exists (select 1 from public.acc_bank_transactions t3
                     where t3.import_id = p_import and t3.running_balance_minor is null) then
    v_prev := p_opening_minor;
    for t in select * from public.acc_bank_transactions t4
              where t4.import_id = p_import order by t4.row_no loop
      if v_prev + t.amount_minor <> t.running_balance_minor then
        v_fail := 'FILE_INTEGRITY';
        v_detail := jsonb_build_object('row_no', t.row_no,
          'expected_balance', (v_prev + t.amount_minor)::text,
          'stated_balance', t.running_balance_minor::text);
        exit;
      end if;
      v_prev := t.running_balance_minor;
    end loop;
  end if;
  if v_fail is not null then
    insert into public.acc_bank_import_events (company_id, import_id, attempt, condition, blocking, detail)
    values (v_row.company_id, p_import, v_row.attempt, v_fail, true, v_detail);
    perform set_config('acc.bank_import_op', p_import::text, true);
    update public.acc_bank_imports bi set state = 'INTEGRITY_FAILED' where bi.id = p_import;
    perform set_config('acc.bank_import_op', '', true);
    perform public.acc_audit(v_row.company_id, null, 'BANK_INTEGRITY_FAILED', 'acc_bank_imports',
      p_import::text, null, jsonb_build_object('condition', v_fail, 'detail', v_detail,
      'attempt', v_row.attempt), 'acc_normalize_bank_import');
    return query select p_import, ('INTEGRITY_FAILED:' || v_fail)::text; return;
  end if;
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi
     set state = 'NORMALIZED', period_start = p_period_start, period_end = p_period_end,
         opening_balance_minor = p_opening_minor, closing_balance_minor = p_closing_minor,
         movement_sum_minor = v_sum, assertion_source = p_assertion_source,
         assertion_derivation = p_assertion_derivation, row_count = v_cnt,
         freshness_as_of = p_freshness
   where bi.id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  perform public.acc_audit(v_row.company_id, null, 'BANK_INTEGRITY_PASSED', 'acc_bank_imports',
    p_import::text, null, jsonb_build_object('rows', v_cnt, 'movements', v_sum::text,
    'assertion_source', p_assertion_source), 'acc_normalize_bank_import');
  return query select p_import, 'NORMALIZED'::text;
end $$;
revoke execute on function public.acc_normalize_bank_import(uuid,date,date,bigint,bigint,text,jsonb,date,char,text) from public, anon, authenticated;
grant  execute on function public.acc_normalize_bank_import(uuid,date,date,bigint,bigint,text,jsonb,date,char,text) to service_role;

-- التكرار (BANK-006/007 + CORRECTIONS 2/3/4):
--   المقارنة محصورة في الجولات المقبولة **المتداخلة التغطية** لنفس الحساب.
--   ١ بصمة صارمة متساوية → EXACT_DUPLICATE
--   ٢ مرساة ثابتة (value_date + مبلغ + رصيد جارٍ) متساوية والوصف
--     القانوني مختلف → SUSPECTED_DUPLICATE
--   ٣ تاريخ + مبلغ وحدهما لا يكفيان أبدًا
--   ٤ مكوّنات ناقصة: SUSPECTED فقط بدليل حتمي كافٍ (وصف قانوني +
--     مرجع متطابقان مع value_date والمبلغ)، وإلا NEW
--   التداخل وحده لا يجعل صفًّا جديدًا مشبوهًا.
create function public.acc_dedup_bank_import(p_import uuid)
returns table (import_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_row record; v_exact integer := 0; v_susp integer := 0; v_overlap boolean; v_gap boolean;
begin
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if v_row.state <> 'NORMALIZED' then raise exception 'dedup applies to NORMALIZED'; end if;

  select exists (
    select 1 from public.acc_bank_imports p
    where p.bank_account_id = v_row.bank_account_id and p.state = 'ACCEPTED' and p.id <> p_import
      and p.period_start <= v_row.period_end and p.period_end >= v_row.period_start
  ) into v_overlap;
  if v_overlap then
    perform public.acc_audit(v_row.company_id, null, 'IMPORT_OVERLAP_DETECTED', 'acc_bank_imports',
      p_import::text, null, jsonb_build_object('period_start', v_row.period_start,
      'period_end', v_row.period_end), 'acc_dedup_bank_import');
  end if;
  -- فجوة تغطية عن آخر جولة مقبولة (معلوماتية غير حاجبة)
  select exists (
    select 1 from public.acc_bank_imports p
    where p.bank_account_id = v_row.bank_account_id and p.state = 'ACCEPTED' and p.id <> p_import
    having max(p.period_end) < v_row.period_start - 1
  ) into v_gap;
  if coalesce(v_gap, false) then
    insert into public.acc_bank_import_events (company_id, import_id, attempt, condition, blocking, detail)
    values (v_row.company_id, p_import, v_row.attempt, 'COVERAGE_GAP', false,
      jsonb_build_object('period_start', v_row.period_start));
    perform public.acc_audit(v_row.company_id, null, 'COVERAGE_GAP', 'acc_bank_imports',
      p_import::text, null, jsonb_build_object('period_start', v_row.period_start), 'acc_dedup_bank_import');
  end if;

  -- ١ · EXACT عبر البصمة الصارمة ضد المقبول المتداخل
  insert into public.acc_bank_duplicate_candidates
    (company_id, import_id, transaction_id, candidate_transaction_id, kind, basis)
  select v_row.company_id, p_import, n.id, a.id, 'EXACT_DUPLICATE',
         jsonb_build_object('rule', 'STRICT_FINGERPRINT', 'fingerprint', n.fingerprint)
  from public.acc_bank_transactions n
  join public.acc_bank_transactions a
    on a.bank_account_id = n.bank_account_id and a.fingerprint = n.fingerprint
  join public.acc_bank_imports pa on pa.id = a.import_id
  where n.import_id = p_import and n.fingerprint is not null and a.fingerprint is not null
    and pa.state = 'ACCEPTED' and pa.id <> p_import
    and pa.period_start <= v_row.period_end and pa.period_end >= v_row.period_start
  on conflict (transaction_id, candidate_transaction_id) do nothing;
  get diagnostics v_exact = row_count;

  -- ٢ · مرساة ثابتة متساوية والوصف مختلف → SUSPECTED
  insert into public.acc_bank_duplicate_candidates
    (company_id, import_id, transaction_id, candidate_transaction_id, kind, basis)
  select v_row.company_id, p_import, n.id, a.id, 'SUSPECTED_DUPLICATE',
         jsonb_build_object('rule', 'ANCHOR_MATCH_DESCRIPTION_DIFFERS',
           'value_date', n.value_date, 'amount_minor', n.amount_minor::text,
           'running_balance_minor', n.running_balance_minor::text)
  from public.acc_bank_transactions n
  join public.acc_bank_transactions a
    on a.bank_account_id = n.bank_account_id
   and a.value_date = n.value_date and a.amount_minor = n.amount_minor
   and a.running_balance_minor = n.running_balance_minor
  join public.acc_bank_imports pa on pa.id = a.import_id
  where n.import_id = p_import
    and n.value_date is not null and n.running_balance_minor is not null
    and a.value_date is not null and a.running_balance_minor is not null
    and a.description_canon <> n.description_canon
    and pa.state = 'ACCEPTED' and pa.id <> p_import
    and pa.period_start <= v_row.period_end and pa.period_end >= v_row.period_start
  on conflict (transaction_id, candidate_transaction_id) do nothing;
  get diagnostics v_susp = row_count;

  -- ٤ · الرصيد الجاري غائب في الطرفين: دليل حتمي كافٍ فقط (وصف + مرجع
  --     متطابقان مع value_date والمبلغ) → SUSPECTED، وإلا NEW
  insert into public.acc_bank_duplicate_candidates
    (company_id, import_id, transaction_id, candidate_transaction_id, kind, basis)
  select v_row.company_id, p_import, n.id, a.id, 'SUSPECTED_DUPLICATE',
         jsonb_build_object('rule', 'NO_BALANCE_DETERMINISTIC_EVIDENCE',
           'value_date', n.value_date, 'amount_minor', n.amount_minor::text,
           'reference', n.reference)
  from public.acc_bank_transactions n
  join public.acc_bank_transactions a
    on a.bank_account_id = n.bank_account_id
   and a.value_date = n.value_date and a.amount_minor = n.amount_minor
   and a.description_canon = n.description_canon
   and a.reference = n.reference
  join public.acc_bank_imports pa on pa.id = a.import_id
  where n.import_id = p_import
    and n.value_date is not null and n.reference is not null
    and n.running_balance_minor is null and a.running_balance_minor is null
    and pa.state = 'ACCEPTED' and pa.id <> p_import
    and pa.period_start <= v_row.period_end and pa.period_end >= v_row.period_start
  on conflict (transaction_id, candidate_transaction_id) do nothing;

  -- تكرار داخل الملف نفسه (بصمة صارمة مكررة) → SUSPECTED بين الصفين
  insert into public.acc_bank_duplicate_candidates
    (company_id, import_id, transaction_id, candidate_transaction_id, kind, basis)
  select v_row.company_id, p_import, n.id, e.id, 'SUSPECTED_DUPLICATE',
         jsonb_build_object('rule', 'INTRA_FILE_FINGERPRINT_REPEAT', 'fingerprint', n.fingerprint)
  from public.acc_bank_transactions n
  join public.acc_bank_transactions e
    on e.import_id = n.import_id and e.fingerprint = n.fingerprint and e.row_no < n.row_no
  where n.import_id = p_import and n.fingerprint is not null
  on conflict (transaction_id, candidate_transaction_id) do nothing;

  select count(*) into v_susp from public.acc_bank_duplicate_candidates c
   where c.import_id = p_import and c.kind = 'SUSPECTED_DUPLICATE';
  select count(*) into v_exact from public.acc_bank_duplicate_candidates c
   where c.import_id = p_import and c.kind = 'EXACT_DUPLICATE';
  if v_susp > 0 then
    insert into public.acc_bank_import_events (company_id, import_id, attempt, condition, blocking, detail)
    values (v_row.company_id, p_import, v_row.attempt, 'SUSPECTED_DUPLICATE', false,
      jsonb_build_object('count', v_susp));
    perform public.acc_audit(v_row.company_id, null, 'BANK_DUPLICATE_SUSPECTED', 'acc_bank_imports',
      p_import::text, null, jsonb_build_object('count', v_susp), 'acc_dedup_bank_import');
  end if;
  if v_exact > 0 then
    perform public.acc_audit(v_row.company_id, null, 'BANK_DUPLICATE_EXACT', 'acc_bank_imports',
      p_import::text, null, jsonb_build_object('count', v_exact), 'acc_dedup_bank_import');
  end if;
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi set state = 'DEDUPLICATED' where bi.id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  return query select p_import, 'DEDUPLICATED'::text;
end $$;
revoke execute on function public.acc_dedup_bank_import(uuid) from public, anon, authenticated;
grant  execute on function public.acc_dedup_bank_import(uuid) to service_role;

-- ─────────────────────────────────────────────
-- ١٠ · القبول/الرفض — فعل بشري (OWNER/ACCOUNTANT حصرًا؛ المدير المالي
--      يجهّز ولا يقبل). القبول يجمّد كل شيء ويوثّق دليل المصدر.
-- ─────────────────────────────────────────────
create function public.acc_accept_bank_import(p_import uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record; v_link uuid;
begin
  if v_user is null then raise exception 'authentication required — acceptance is a human act'; end if;
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if coalesce(public.acc_role(v_row.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'import acceptance requires BUSINESS_OWNER or ACCOUNTANT';
  end if;
  if v_row.state <> 'DEDUPLICATED' then
    raise exception 'acceptance applies to DEDUPLICATED (state %)', v_row.state;
  end if;
  -- لا شروط حاجبة على المحاولة الحالية (BANK-008 وأخواتها)
  if exists (select 1 from public.acc_bank_import_events ev
              where ev.import_id = p_import and ev.attempt = v_row.attempt and ev.blocking) then
    raise exception 'blocking import conditions must be resolved by retry or a superseding import';
  end if;
  -- توثيق دليل المصدر: مستند ↔ جولة (يتجمّد بالحارس بعد القبول)
  insert into public.acc_document_links (company_id, document_id, target_kind, target_id, link_role, created_by)
  values (v_row.company_id, v_row.document_id, 'BANK_IMPORT', p_import, 'SOURCE', v_user)
  on conflict (document_id, target_kind, target_id) do nothing
  returning id into v_link;
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi
     set state = 'ACCEPTED', accepted_at = now(), accepted_by = v_user
   where bi.id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'BANK_IMPORT_ACCEPTED', 'acc_bank_imports',
    p_import::text, jsonb_build_object('state', 'DEDUPLICATED'),
    jsonb_build_object('state', 'ACCEPTED', 'rows', v_row.row_count,
    'file_sha256', v_row.file_sha256), 'acc_accept_bank_import');
end $$;
revoke execute on function public.acc_accept_bank_import(uuid) from public, anon;
grant  execute on function public.acc_accept_bank_import(uuid) to authenticated;

create function public.acc_reject_bank_import(p_import uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written rejection reason is required'; end if;
  select * into v_row from public.acc_bank_imports bi where bi.id = p_import;
  if not found then raise exception 'unknown bank import'; end if;
  if coalesce(public.acc_role(v_row.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'import rejection requires BUSINESS_OWNER or ACCOUNTANT';
  end if;
  if v_row.state not in ('DEDUPLICATED','PARSE_FAILED','INTEGRITY_FAILED') then
    raise exception 'rejection applies to a pre-accepted import (state %)', v_row.state;
  end if;
  perform set_config('acc.bank_import_op', p_import::text, true);
  update public.acc_bank_imports bi
     set state = 'REJECTED', rejected_reason = p_reason
   where bi.id = p_import;
  perform set_config('acc.bank_import_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'BANK_IMPORT_REJECTED', 'acc_bank_imports',
    p_import::text, jsonb_build_object('state', v_row.state),
    jsonb_build_object('state', 'REJECTED', 'reason', p_reason), 'acc_reject_bank_import');
end $$;
revoke execute on function public.acc_reject_bank_import(uuid,text) from public, anon;
grant  execute on function public.acc_reject_bank_import(uuid,text) to authenticated;
