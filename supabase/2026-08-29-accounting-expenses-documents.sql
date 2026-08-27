-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 8: المصروفات والمستندات
-- (Git فقط — فوق هجرات Stage 1..7 ولا تعدّلها)
--
-- المستند دليل مصدر: بايتاته وبصماته وهويته مجمّدة بعد FINALIZED؛
-- بياناته الوصفية قابلة للتعديل المدقَّق. المصروف كيان مستقل بآلة
-- حالات صريحة؛ لا أثر محاسبي قبل POSTED، والترحيل حصراً عبر
-- acc_post_journal القائم (Stage 3) — لا دفتر ثانٍ ولا بوابة ترحيل
-- جديدة. الموافقة ≠ سلطة ترحيل. كل تخويل fail-closed
-- (coalesce(acc_role,'')). صفر AI (المرحلة 13) وصفر QAYD/XBRL.
--
-- روابط الدليل تتجمّد من SUBMITTED (سد ثغرة فكّ الربط ثم الحذف)؛
-- مستند مرتبط بقيد POSTED لا يُحذف بنيويًا أبدًا. التخزين خاص
-- (acc-documents) بلا أي سياسة عميل — الخادم الموثوق حصرًا.
-- سلطة البصمة للخادم: العميل يقترح، والخادم يحسب ويتحقق.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ٠ · دور مستخدمٍ محدد (لخدمة مسار الرفع الخادمي حيث auth.uid() غائب)
-- ─────────────────────────────────────────────
create or replace function public.acc_role_of(p_company uuid, p_user uuid)
returns text language sql security definer set search_path to 'public' stable as $$
  select role from public.acc_company_members
  where company_id = p_company and user_id = p_user;
$$;
revoke execute on function public.acc_role_of(uuid,uuid) from public, anon, authenticated;
grant  execute on function public.acc_role_of(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────
-- ١ · إعدادات المصروفات لكل شركة — حدّ الموافقة بعملة الأساس (لا مبلغ
--     مرمّز)، وحدود الملفات والاحتفاظ قابلة للضبط. الغياب = تصعيد للمالكة.
-- ─────────────────────────────────────────────
create table if not exists public.acc_expense_settings (
  company_id                 uuid primary key references public.acc_companies(id),
  -- حدّ موافقة المدير المالي بوحدات صغرى **لعملة أساس الشركة** — null =
  -- لا حدّ مضبوطًا: المدير المالي لا يعتمد نهائيًا، الاعتماد للمالكة
  approval_limit_base_minor  bigint check (approval_limit_base_minor > 0),
  max_file_bytes             bigint check (max_file_bytes > 0),
  retention_years            integer not null default 10 check (retention_years between 1 and 50),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users(id)
);

-- ─────────────────────────────────────────────
-- ٢ · المستندات — دليل المصدر (الأصل A مجمّد بعد FINALIZED؛ الوصف B مرن مدقَّق)
-- ─────────────────────────────────────────────
create table if not exists public.acc_documents (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.acc_companies(id),
  -- مفتاح idempotency الالتقاط: يولّده العميل مرة عند الالتقاط ويبقى
  -- عبر إعادة المحاولة/إعادة التشغيل — نفس الالتقاط = مستند واحد
  capture_id             text not null check (btrim(capture_id) <> ''),
  doc_type               text not null check (doc_type in
                           ('RECEIPT','VENDOR_BILL','INVOICE_ATTACHMENT',
                            'BANK_STATEMENT','EMAIL_ATTACHMENT','OTHER')),
  source                 text not null check (source in
                           ('CAMERA','FILE_UPLOAD','EMAIL','SYSTEM_IMPORT','MANUAL')),
  original_filename      text,
  mime_type              text not null,
  expected_page_count    integer not null check (expected_page_count between 1 and 200),
  -- حقائق الدليل — يملؤها الخادم عند الإقفال ثم تتجمّد
  page_count             integer,
  byte_size              bigint,
  -- بصمة manifest يحسبها **الخادم** من بصمات الصفحات المرتّبة —
  -- لا تُقبل بصمة عميل كسلطة (CORRECTION 3)
  content_sha256         text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  state                  text not null default 'CAPTURING' check (state in ('CAPTURING','FINALIZED')),
  captured_at            timestamptz not null default now(),
  uploaded_by            uuid not null references auth.users(id),
  -- بيانات وصفية مرنة مدقَّقة (B)
  tags                   jsonb not null default '[]'::jsonb,
  notes                  text,
  -- حقول الاستخلاص للمرحلة 13 — هنا يدوي/تجهيزات اختبار فقط، لا AI
  extracted_fields       jsonb,
  extraction_confidence  numeric(5,4) check (extraction_confidence between 0 and 1),
  extraction_source      text check (extraction_source in ('MANUAL','FIXTURE')),
  duplicate_of_document_id uuid references public.acc_documents(id),
  supersedes_document_id   uuid references public.acc_documents(id),
  created_at             timestamptz not null default now(),
  unique (company_id, capture_id)
);
create index if not exists acc_documents_company_idx on public.acc_documents (company_id, created_at);
create index if not exists acc_documents_hash_idx on public.acc_documents (company_id, content_sha256);

-- صفحات المستند — إيصال متعدد الصفحات بترتيب ثابت ومفاتيح كائنات حتمية
create table if not exists public.acc_document_pages (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.acc_documents(id),
  company_id     uuid not null references public.acc_companies(id),
  page_no        integer not null check (page_no between 1 and 200),
  -- مفتاح الكائن حتمي: {company}/{document}/{page} — إعادة المحاولة
  -- تستهدف نفس الكائن، لا كائن ثانٍ أبدًا (CORRECTION 2)
  object_key     text not null,
  mime_type      text not null,
  byte_size      bigint,
  -- بصمة الصفحة يتحقق منها الخادم بعد وجود الكائن فعليًا
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  upload_state   text not null default 'RESERVED' check (upload_state in ('RESERVED','VERIFIED')),
  created_at     timestamptz not null default now(),
  unique (document_id, page_no),
  unique (object_key)
);
create index if not exists acc_doc_pages_doc_idx on public.acc_document_pages (document_id, page_no);

-- روابط المستند ↔ الكيانات — junction مكتوب بقيود سلامة صلبة
-- (لا BANK_TRANSACTION/RECONCILIATION الآن — المرحلتان 9/10 تضيفانها)
create table if not exists public.acc_document_links (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.acc_companies(id),
  document_id uuid not null references public.acc_documents(id),
  target_kind text not null check (target_kind in ('EXPENSE','JOURNAL_ENTRY','INVOICE','PAYMENT')),
  target_id   uuid not null,
  link_role   text not null default 'SOURCE' check (link_role in ('SOURCE','ATTACHMENT')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  unique (document_id, target_kind, target_id)
);
create index if not exists acc_doc_links_target_idx on public.acc_document_links (company_id, target_kind, target_id);

-- ─────────────────────────────────────────────
-- ٣ · المصروفات — الحقيقة غراس؛ آلة حالات صريحة؛ صفر أثر قبل POSTED
-- ─────────────────────────────────────────────
create table if not exists public.acc_expenses (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.acc_companies(id),
  -- مفتاح idempotency الإرسال (CORRECTION 5-A): إعادة نفس العملية = نفس المصروف
  submission_key        text not null check (btrim(submission_key) <> ''),
  vendor_id             uuid references public.acc_vendors(id),
  expense_date          date not null,
  vendor_reference      text,
  description           text,
  source_kind           text not null check (source_kind in
                          ('RECEIPT','VENDOR_BILL','MANUAL','RECURRING_VENDOR')),
  -- المصدر اليدوي ليس بلا مصدر: تبرير كتابي إلزامي عند الإرسال
  manual_justification  text,
  state                 text not null default 'DRAFT' check (state in
                          ('DRAFT','SUBMITTED','NEEDS_REVIEW','REJECTED',
                           'APPROVED','READY_TO_POST','POSTED','VOIDED')),
  needs_human_review    boolean not null default false,
  review_reason         text,
  -- التصنيف عبر سجل السياسات — لا معالجة مرمّزة؛ العجز = provisional
  policy_id             text check (policy_id ~ '^POL-[0-9]{3}$'),
  policy_version        integer,
  policy_status_used    text,
  treatment             text,
  provisional           boolean not null default true,
  -- ربط الترحيل: مصدر وقيد Stage 3 — القيد يُرحّل هناك حصراً
  prepared_source_id    uuid references public.acc_sources(id),
  journal_entry_id      uuid references public.acc_journal_entries(id),
  posted_at             timestamptz,
  corrected_by_entry_id uuid references public.acc_journal_entries(id),
  created_at            timestamptz not null default now(),
  created_by            uuid not null references auth.users(id),
  submitted_at          timestamptz,
  submitted_by          uuid references auth.users(id),
  voided_reason         text,
  unique (company_id, submission_key)
);
create index if not exists acc_expenses_company_idx on public.acc_expenses (company_id, state);
create index if not exists acc_expenses_vendor_ref_idx on public.acc_expenses (company_id, vendor_id, vendor_reference);

-- أسطر المصروف — نفس عقد المال/الصرف التاريخي لأسطر القيود حرفيًا
create table if not exists public.acc_expense_lines (
  id                uuid primary key default gen_random_uuid(),
  expense_id        uuid not null references public.acc_expenses(id),
  company_id        uuid not null references public.acc_companies(id),
  line_no           integer not null check (line_no >= 1),
  description       text,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          char(3) not null references public.acc_currencies(code),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  base_currency     char(3) not null references public.acc_currencies(code),
  tax_status        text not null references public.acc_tax_statuses(code),
  tax_rate          numeric(9,6),
  -- مفتاح فئة الربط المعتمد: scope_key لغرض EXPENSE_ACCOUNT
  category_key      text not null check (btrim(category_key) <> ''),
  fx_rate           numeric(20,10),
  fx_rate_date      date,
  fx_rate_source    text,
  created_at        timestamptz not null default now(),
  unique (expense_id, line_no),
  check (tax_rate is null or tax_status in ('TAXABLE','ZERO_RATED')),
  -- نفس العملة: الأساس يساوي المعاملة ولا حقول FX؛ عملة مختلفة:
  -- أدلة السعر الثلاثة إلزامية ولا يعاد حسابها لاحقًا
  check (currency <> base_currency
         or (base_amount_minor = amount_minor and fx_rate is null
             and fx_rate_date is null and fx_rate_source is null)),
  check (currency = base_currency
         or (fx_rate is not null and fx_rate > 0
             and fx_rate_date is not null and fx_rate_source is not null))
);
create index if not exists acc_expense_lines_expense_idx on public.acc_expense_lines (expense_id, line_no);

-- سجل الموافقات — append-only مع لقطة الحدّ وقت القرار (لا يعاد حسابها)
create table if not exists public.acc_expense_approvals (
  id                       uuid primary key default gen_random_uuid(),
  expense_id               uuid not null references public.acc_expenses(id),
  company_id               uuid not null references public.acc_companies(id),
  approval_role            text not null check (approval_role in ('FINANCE_MANAGER','BUSINESS_OWNER')),
  -- إنسان حقيقي حصرًا — لا SYSTEM ولا AI
  approver_user_id         uuid not null references auth.users(id),
  decision                 text not null check (decision in ('APPROVED','REJECTED')),
  reason                   text,
  -- لقطة القرار: الحدّ المضبوط وعملة الأساس والمبلغ المُختبَر (الأساس التاريخي)
  limit_base_minor         bigint,
  base_currency            char(3) not null,
  tested_base_amount_minor bigint not null,
  -- شهادة المالكة على مصروفها هي تصديق عمل موثَّق صراحةً — ليست سلطة ترحيل
  self_attested            boolean not null default false,
  created_at               timestamptz not null default now()
);
create index if not exists acc_expense_approvals_idx on public.acc_expense_approvals (expense_id);

-- ─────────────────────────────────────────────
-- ٤ · توسيع أغراض الربط المعتمدة (في هجرة Stage 8 حصراً — لا مساس بـ5/6)
-- ─────────────────────────────────────────────
alter table public.acc_gl_account_links drop constraint if exists acc_gl_links_purpose_chk;
alter table public.acc_gl_account_links
  add constraint acc_gl_links_purpose_chk check (purpose in
    ('DEFERRED_REVENUE','GATEWAY_CLEARING','CASH_IN_TRANSIT',
     'GATEWAY_FEE_EXPENSE','CONTRA_REVENUE','UNIDENTIFIED_SETTLEMENT_DIFFERENCE',
     'EXPENSE_ACCOUNT','EXPENSE_PAYABLE'));

-- ─────────────────────────────────────────────
-- ٥ · الحرّاس — مناعة الدليل، تجميد الروابط، آلة حالات المصروف
-- ─────────────────────────────────────────────
-- المستند: حقائق الدليل تتجمّد بعد FINALIZED؛ الحالة عبر توقيع الخادم فقط
create or replace function public.acc_documents_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- الحذف ممنوع بنيويًا ما دام رابط واحد قائمًا — وفكّ الرابط نفسه
    -- مجمّد من SUBMITTED فما فوق، فطريق «افكّ ثم احذف» مسدود
    if exists (select 1 from public.acc_document_links where document_id = old.id) then
      raise exception 'a linked document cannot be deleted — unlink first (and links freeze from SUBMITTED)';
    end if;
    if coalesce(current_setting('acc.doc_op', true), '') <> old.id::text then
      raise exception 'document deletion only through acc_delete_document';
    end if;
    return old;
  end if;
  if old.state = 'FINALIZED' then
    if new.capture_id  is distinct from old.capture_id
       or new.company_id is distinct from old.company_id
       or new.content_sha256 is distinct from old.content_sha256
       or new.page_count is distinct from old.page_count
       or new.byte_size  is distinct from old.byte_size
       or new.mime_type  is distinct from old.mime_type
       or new.source     is distinct from old.source
       or new.captured_at is distinct from old.captured_at
       or new.uploaded_by is distinct from old.uploaded_by
       or new.state is distinct from old.state then
      raise exception 'finalized document evidence is immutable — replacement is a new superseding document';
    end if;
  end if;
  if new.state is distinct from old.state
     and coalesce(current_setting('acc.doc_op', true), '') <> old.id::text then
    raise exception 'document state changes only through the trusted document path';
  end if;
  return new;
end $$;
drop trigger if exists acc_documents_guard_trg on public.acc_documents;
create trigger acc_documents_guard_trg
  before update or delete on public.acc_documents
  for each row execute function public.acc_documents_guard();

-- الصفحات: مجمّدة بعد VERIFIED؛ الحذف فقط ضمن حذف المستند الموقّع
create or replace function public.acc_doc_pages_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('acc.doc_op', true), '') <> old.document_id::text then
      raise exception 'document pages are deleted only with their document through acc_delete_document';
    end if;
    return old;
  end if;
  if old.upload_state = 'VERIFIED'
     and (new.content_sha256 is distinct from old.content_sha256
          or new.byte_size is distinct from old.byte_size
          or new.object_key is distinct from old.object_key
          or new.page_no is distinct from old.page_no
          or new.upload_state is distinct from old.upload_state) then
    raise exception 'a verified page is immutable evidence';
  end if;
  return new;
end $$;
drop trigger if exists acc_doc_pages_guard_trg on public.acc_document_pages;
create trigger acc_doc_pages_guard_trg
  before update or delete on public.acc_document_pages
  for each row execute function public.acc_doc_pages_guard();

-- الروابط: سلامة الهدف والشركة عند الإنشاء؛ تجميد الفكّ (CORRECTION 1)
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
  -- فما فوق يتجمّد — الاستبدال الصريح الموقّع فقط (وبعد POSTED لا استبدال)
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
  end if;
  return old;
end $$;
drop trigger if exists acc_doc_links_guard_trg on public.acc_document_links;
create trigger acc_doc_links_guard_trg
  before insert or update or delete on public.acc_document_links
  for each row execute function public.acc_doc_links_guard();

-- المصروف: انتقالات مسموحة فقط، حقائق مجمّدة خارج DRAFT، POSTED نهائي
create or replace function public.acc_expenses_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.state <> 'DRAFT' then
      raise exception 'an expense past DRAFT is history — VOIDED, never deleted';
    end if;
    return old;
  end if;
  -- الهوية دائمًا مجمّدة
  if new.company_id is distinct from old.company_id
     or new.submission_key is distinct from old.submission_key
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'acc_expenses: identity is immutable';
  end if;
  -- الحقائق المالية/المصدرية قابلة للتعديل في DRAFT فقط
  if old.state <> 'DRAFT'
     and (new.vendor_id is distinct from old.vendor_id
          or new.expense_date is distinct from old.expense_date
          or new.vendor_reference is distinct from old.vendor_reference
          or new.source_kind is distinct from old.source_kind
          or new.manual_justification is distinct from old.manual_justification) then
    raise exception 'expense facts freeze at SUBMITTED — corrections after posting use reversal';
  end if;
  if old.state = 'POSTED'
     and (new.policy_id is distinct from old.policy_id
          or new.policy_version is distinct from old.policy_version
          or new.treatment is distinct from old.treatment
          or new.journal_entry_id is distinct from old.journal_entry_id
          or new.prepared_source_id is distinct from old.prepared_source_id
          or new.posted_at is distinct from old.posted_at
          or new.description is distinct from old.description) then
    raise exception 'a posted expense is immutable — corrections are reversal plus corrected entry';
  end if;
  if new.state is distinct from old.state then
    if coalesce(current_setting('acc.expense_op', true), '') <> old.id::text then
      raise exception 'expense state changes only through the signed expense operations';
    end if;
    if not ( (old.state = 'DRAFT'         and new.state in ('SUBMITTED','NEEDS_REVIEW','VOIDED'))
          or (old.state = 'SUBMITTED'     and new.state in ('APPROVED','REJECTED','NEEDS_REVIEW','VOIDED'))
          or (old.state = 'NEEDS_REVIEW'  and new.state in ('SUBMITTED','VOIDED'))
          or (old.state = 'REJECTED'      and new.state in ('DRAFT','VOIDED'))
          or (old.state = 'APPROVED'      and new.state in ('READY_TO_POST','VOIDED'))
          or (old.state = 'READY_TO_POST' and new.state in ('POSTED','VOIDED')) ) then
      raise exception 'forbidden expense transition: % -> %', old.state, new.state;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_expenses_guard_trg on public.acc_expenses;
create trigger acc_expenses_guard_trg
  before update or delete on public.acc_expenses
  for each row execute function public.acc_expenses_guard();

-- الأسطر: تتحرك مع مسودة أمها فقط
create or replace function public.acc_expense_lines_guard()
returns trigger language plpgsql as $$
declare v_state text;
begin
  select state into v_state from public.acc_expenses
   where id = coalesce(new.expense_id, old.expense_id);
  if v_state is distinct from 'DRAFT' then
    raise exception 'expense lines change only while the expense is DRAFT';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists acc_expense_lines_guard_trg on public.acc_expense_lines;
create trigger acc_expense_lines_guard_trg
  before insert or update or delete on public.acc_expense_lines
  for each row execute function public.acc_expense_lines_guard();

-- الموافقات: تاريخ لا يُمسّ
create or replace function public.acc_expense_approvals_frozen()
returns trigger language plpgsql as $$
begin raise exception 'acc_expense_approvals are append-only immutable history: % refused', tg_op; end $$;
drop trigger if exists acc_expense_approvals_frozen_trg on public.acc_expense_approvals;
create trigger acc_expense_approvals_frozen_trg
  before update or delete on public.acc_expense_approvals
  for each row execute function public.acc_expense_approvals_frozen();

-- ─────────────────────────────────────────────
-- ٦ · RLS — عزل المستأجر + خصوصية الأدوار
--     READ_ONLY لا ترى دليل المصدر افتراضًا (منح صريح لاحق)؛
--     EMPLOYEE ترى ما رفعت/أنشأت فقط؛ AUDITOR قراءة بلا أي كتابة.
-- ─────────────────────────────────────────────
alter table public.acc_expense_settings enable row level security;
alter table public.acc_documents        enable row level security;
alter table public.acc_document_pages   enable row level security;
alter table public.acc_document_links   enable row level security;
alter table public.acc_expenses         enable row level security;
alter table public.acc_expense_lines    enable row level security;
alter table public.acc_expense_approvals enable row level security;

create policy acc_expense_settings_select on public.acc_expense_settings
  for select using (coalesce(public.acc_role(company_id), '') in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_documents_select on public.acc_documents
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE' and uploaded_by = auth.uid()));
create policy acc_doc_pages_select on public.acc_document_pages
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE'
        and exists (select 1 from public.acc_documents d
                    where d.id = document_id and d.uploaded_by = auth.uid())));
create policy acc_doc_links_select on public.acc_document_links
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE'
        and exists (select 1 from public.acc_documents d
                    where d.id = document_id and d.uploaded_by = auth.uid())));
create policy acc_expenses_select on public.acc_expenses
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE' and created_by = auth.uid()));
create policy acc_expense_lines_select on public.acc_expense_lines
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE'
        and exists (select 1 from public.acc_expenses e
                    where e.id = expense_id and e.created_by = auth.uid())));
create policy acc_expense_approvals_select on public.acc_expense_approvals
  for select using (
    coalesce(public.acc_role(company_id), '') in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR')
    or (coalesce(public.acc_role(company_id), '') = 'EMPLOYEE'
        and exists (select 1 from public.acc_expenses e
                    where e.id = expense_id and e.created_by = auth.uid())));

revoke insert, update, delete on public.acc_expense_settings  from anon, authenticated;
revoke insert, update, delete on public.acc_documents         from anon, authenticated;
revoke insert, update, delete on public.acc_document_pages    from anon, authenticated;
revoke insert, update, delete on public.acc_document_links    from anon, authenticated;
revoke insert, update, delete on public.acc_expenses          from anon, authenticated;
revoke insert, update, delete on public.acc_expense_lines     from anon, authenticated;
revoke insert, update, delete on public.acc_expense_approvals from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٧ · التخزين — دلو خاص بلا أي سياسة عميل: الخادم الموثوق حصرًا
--     (مسار الكائن ليس أمنًا؛ الغياب التام لسياسات storage.objects
--      لهذا الدلو = رفض افتراضي لكل anon/authenticated)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('acc-documents', 'acc-documents', false)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- ٨ · دوال المستندات — الابتلاع خادمي (service_role يمرر هوية الفاعل
--     المصادَق عليه)، والعمليات البشرية authenticated ببوابات دور صريحة
-- ─────────────────────────────────────────────
-- إنشاء/استئناف مستند بالتقاط idempotent: نفس capture_id = نفس المستند
create or replace function public.acc_create_document(
  p_company uuid, p_actor uuid, p_capture_id text, p_doc_type text, p_source text,
  p_original_filename text, p_mime text, p_expected_pages integer
)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_exist record; v_role text;
begin
  if p_actor is null then raise exception 'actor identity required'; end if;
  v_role := coalesce(public.acc_role_of(p_company, p_actor), '');
  if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','EMPLOYEE') then
    raise exception 'document capture requires a company member with capture rights (got %)', coalesce(nullif(v_role,''),'none');
  end if;
  insert into public.acc_documents
    (company_id, capture_id, doc_type, source, original_filename, mime_type,
     expected_page_count, uploaded_by)
  values (p_company, p_capture_id, p_doc_type, p_source, p_original_filename, p_mime,
          p_expected_pages, p_actor)
  on conflict (company_id, capture_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.acc_audit(p_company, p_actor, 'DOCUMENT_CAPTURED', 'acc_documents', v_id::text,
      null, jsonb_build_object('doc_type', p_doc_type, 'source', p_source, 'pages', p_expected_pages),
      'acc_create_document');
    return query select v_id, 'CREATED'::text; return;
  end if;
  select * into v_exist from public.acc_documents
   where company_id = p_company and capture_id = p_capture_id;
  if v_exist.doc_type = p_doc_type and v_exist.expected_page_count = p_expected_pages
     and v_exist.mime_type = p_mime then
    return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text; return;  -- استئناف
  end if;
  perform public.acc_audit(p_company, p_actor, 'DOCUMENT_CAPTURE_CONFLICT', 'acc_documents',
    v_exist.id::text, jsonb_build_object('doc_type', v_exist.doc_type, 'pages', v_exist.expected_page_count),
    jsonb_build_object('doc_type', p_doc_type, 'pages', p_expected_pages), 'acc_create_document');
  return query select v_exist.id, 'CONFLICT'::text;
end $$;
revoke execute on function public.acc_create_document(uuid,uuid,text,text,text,text,text,integer) from public, anon, authenticated;
grant  execute on function public.acc_create_document(uuid,uuid,text,text,text,text,text,integer) to service_role;

-- حجز صفحة بمفتاح كائن حتمي — إعادة المحاولة تعيد نفس المفتاح
create or replace function public.acc_register_document_page(
  p_document uuid, p_page_no integer, p_mime text
)
returns table (page_id uuid, object_key text, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_doc record; v_key text; v_id uuid; v_exist record;
begin
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  if v_doc.state <> 'CAPTURING' then raise exception 'pages are added only while CAPTURING'; end if;
  if p_page_no > v_doc.expected_page_count then raise exception 'page_no exceeds declared page count'; end if;
  v_key := v_doc.company_id::text || '/' || p_document::text || '/' || p_page_no::text;
  insert into public.acc_document_pages (document_id, company_id, page_no, object_key, mime_type)
  values (p_document, v_doc.company_id, p_page_no, v_key, p_mime)
  on conflict (document_id, page_no) do nothing
  returning id into v_id;
  if v_id is not null then
    return query select v_id, v_key, 'CREATED'::text; return;
  end if;
  select * into v_exist from public.acc_document_pages
   where document_id = p_document and page_no = p_page_no;
  return query select v_exist.id, v_exist.object_key, 'IDEMPOTENT_DUPLICATE'::text;
end $$;
revoke execute on function public.acc_register_document_page(uuid,integer,text) from public, anon, authenticated;
grant  execute on function public.acc_register_document_page(uuid,integer,text) to service_role;

-- تأكيد صفحة بعد رفعها: **الخادم** حسب البصمة من البايتات المرفوعة —
-- الاسترداد من فشل القاعدة/الرفع idempotent؛ بايتات مختلفة = CONFLICT
create or replace function public.acc_confirm_document_page(
  p_document uuid, p_page_no integer, p_byte_size bigint, p_server_sha256 text
)
returns table (page_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_page record;
begin
  select * into v_page from public.acc_document_pages
   where document_id = p_document and page_no = p_page_no;
  if not found then raise exception 'page not reserved'; end if;
  if v_page.upload_state = 'VERIFIED' then
    if v_page.content_sha256 = p_server_sha256 then
      return query select v_page.id, 'IDEMPOTENT_DUPLICATE'::text; return;  -- استئناف
    end if;
    -- كائن قائم ببايتات مختلفة: لا استبدال أبدًا (CORRECTION 2)
    perform public.acc_audit(v_page.company_id, null, 'DOCUMENT_UPLOAD_FAILED', 'acc_document_pages',
      v_page.id::text, jsonb_build_object('sha256', v_page.content_sha256),
      jsonb_build_object('sha256', p_server_sha256, 'reason', 'PAGE_BYTES_CONFLICT'),
      'acc_confirm_document_page');
    return query select v_page.id, 'CONFLICT'::text; return;
  end if;
  update public.acc_document_pages
     set byte_size = p_byte_size, content_sha256 = p_server_sha256, upload_state = 'VERIFIED'
   where id = v_page.id;
  perform public.acc_audit(v_page.company_id, null, 'DOCUMENT_UPLOADED', 'acc_document_pages',
    v_page.id::text, null,
    jsonb_build_object('page_no', p_page_no, 'sha256', p_server_sha256, 'bytes', p_byte_size),
    'acc_confirm_document_page');
  return query select v_page.id, 'VERIFIED'::text;
end $$;
revoke execute on function public.acc_confirm_document_page(uuid,integer,bigint,text) from public, anon, authenticated;
grant  execute on function public.acc_confirm_document_page(uuid,integer,bigint,text) to service_role;

-- إقفال المستند: كل الصفحات VERIFIED بلا فجوات؛ بصمة الـmanifest تُحسب
-- هنا في الخادم من بصمات الصفحات المرتبة (سلطة الخادم — CORRECTION 3)
create or replace function public.acc_finalize_document(p_document uuid)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_doc record; v_pages integer; v_verified integer; v_manifest text;
        v_bytes bigint; v_dup uuid;
begin
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  if v_doc.state = 'FINALIZED' then
    return query select v_doc.id, 'IDEMPOTENT_DUPLICATE'::text; return;
  end if;
  select count(*), count(*) filter (where upload_state = 'VERIFIED'), sum(byte_size)
    into v_pages, v_verified, v_bytes
    from public.acc_document_pages where document_id = p_document;
  if v_pages <> v_doc.expected_page_count or v_verified <> v_doc.expected_page_count then
    raise exception 'finalize requires all % declared pages verified (have %/% verified)',
      v_doc.expected_page_count, v_verified, v_pages;
  end if;
  if exists (select 1 from generate_series(1, v_doc.expected_page_count) g
             where not exists (select 1 from public.acc_document_pages
                               where document_id = p_document and page_no = g)) then
    raise exception 'page numbering must be gapless 1..%', v_doc.expected_page_count;
  end if;
  select encode(sha256(convert_to(
           string_agg(page_no::text || ':' || content_sha256, '|' order by page_no), 'UTF8')), 'hex')
    into v_manifest
    from public.acc_document_pages where document_id = p_document;
  perform set_config('acc.doc_op', p_document::text, true);
  update public.acc_documents
     set state = 'FINALIZED', content_sha256 = v_manifest,
         page_count = v_doc.expected_page_count, byte_size = v_bytes
   where id = p_document;
  perform set_config('acc.doc_op', '', true);
  -- اشتباه تكرار محتوى (نفس البصمة داخل الشركة) — علم للمراجعة، لا رفض
  select id into v_dup from public.acc_documents
   where company_id = v_doc.company_id and content_sha256 = v_manifest
     and id <> p_document and state = 'FINALIZED'
   limit 1;
  if v_dup is not null then
    update public.acc_documents set duplicate_of_document_id = v_dup where id = p_document;
    perform public.acc_audit(v_doc.company_id, null, 'DOCUMENT_DUPLICATE_SUSPECTED', 'acc_documents',
      p_document::text, null, jsonb_build_object('duplicate_of', v_dup, 'sha256', v_manifest),
      'acc_finalize_document');
  end if;
  perform public.acc_audit(v_doc.company_id, null, 'DOCUMENT_FINALIZED', 'acc_documents',
    p_document::text, null,
    jsonb_build_object('sha256', v_manifest, 'pages', v_doc.expected_page_count, 'bytes', v_bytes),
    'acc_finalize_document');
  return query select p_document, 'FINALIZED'::text;
end $$;
revoke execute on function public.acc_finalize_document(uuid) from public, anon, authenticated;
grant  execute on function public.acc_finalize_document(uuid) to service_role;

-- تعديل الوصف (B) — مدقَّق؛ الدليل (A) لا يمسّه هذا المسار أصلًا
create or replace function public.acc_update_document_metadata(
  p_document uuid, p_doc_type text, p_tags jsonb, p_notes text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record; v_role text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  v_role := coalesce(public.acc_role(v_doc.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_doc.uploaded_by = v_user
              and not exists (select 1 from public.acc_document_links where document_id = p_document))) then
    raise exception 'metadata editing requires OWNER/ACCOUNTANT/FINANCE_MANAGER (or the employee uploader before linking)';
  end if;
  update public.acc_documents
     set doc_type = coalesce(p_doc_type, doc_type),
         tags = coalesce(p_tags, tags),
         notes = coalesce(p_notes, notes)
   where id = p_document;
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_METADATA_UPDATED', 'acc_documents',
    p_document::text,
    jsonb_build_object('doc_type', v_doc.doc_type, 'tags', v_doc.tags, 'notes', v_doc.notes),
    jsonb_build_object('doc_type', coalesce(p_doc_type, v_doc.doc_type),
                       'tags', coalesce(p_tags, v_doc.tags), 'notes', coalesce(p_notes, v_doc.notes)),
    'acc_update_document_metadata');
end $$;
revoke execute on function public.acc_update_document_metadata(uuid,text,jsonb,text) from public, anon;
grant  execute on function public.acc_update_document_metadata(uuid,text,jsonb,text) to authenticated;

-- حقول الاستخلاص — يدوي/تجهيزات فقط في Stage 8 (قيد CHECK يمنع غيرهما؛
-- المرحلة 13 توسّعه) — لا استدعاء نموذج هنا إطلاقًا
create or replace function public.acc_set_document_extraction(
  p_document uuid, p_fields jsonb, p_confidence numeric, p_extraction_source text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  if coalesce(public.acc_role(v_doc.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'extraction fields require OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  if p_extraction_source not in ('MANUAL','FIXTURE') then
    raise exception 'Stage 8 extraction sources are MANUAL or FIXTURE only — AI belongs to Stage 13';
  end if;
  update public.acc_documents
     set extracted_fields = p_fields, extraction_confidence = p_confidence,
         extraction_source = p_extraction_source
   where id = p_document;
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_METADATA_UPDATED', 'acc_documents',
    p_document::text, null,
    jsonb_build_object('extraction_source', p_extraction_source, 'confidence', p_confidence),
    'acc_set_document_extraction');
end $$;
revoke execute on function public.acc_set_document_extraction(uuid,jsonb,numeric,text) from public, anon;
grant  execute on function public.acc_set_document_extraction(uuid,jsonb,numeric,text) to authenticated;

-- ربط مستند بهدف — المستند FINALIZED حصراً؛ trigger يفرض الشركة والوجود
create or replace function public.acc_link_document(
  p_document uuid, p_target_kind text, p_target uuid, p_link_role text default 'SOURCE'
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record; v_role text; v_id uuid; v_exp record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  if v_doc.state <> 'FINALIZED' then raise exception 'only FINALIZED documents may be linked as evidence'; end if;
  v_role := coalesce(public.acc_role(v_doc.company_id), '');
  if v_role = 'EMPLOYEE' then
    -- الموظفة تربط دليلها بمصروفها المسودّ فقط
    if p_target_kind <> 'EXPENSE' or v_doc.uploaded_by <> v_user then
      raise exception 'employees link their own documents to their own draft expenses only';
    end if;
    select * into v_exp from public.acc_expenses where id = p_target;
    if not found or v_exp.created_by <> v_user or v_exp.state <> 'DRAFT' then
      raise exception 'employees link their own documents to their own draft expenses only';
    end if;
  elsif v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'document linking requires OWNER/ACCOUNTANT/FINANCE_MANAGER (or the employee owner-path)';
  end if;
  insert into public.acc_document_links (company_id, document_id, target_kind, target_id, link_role, created_by)
  values (v_doc.company_id, p_document, p_target_kind, p_target, p_link_role, v_user)
  on conflict (document_id, target_kind, target_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.acc_document_links
     where document_id = p_document and target_kind = p_target_kind and target_id = p_target;
    return v_id;  -- الرابط قائم — idempotent
  end if;
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_LINKED', 'acc_document_links', v_id::text,
    null, jsonb_build_object('document', p_document, 'kind', p_target_kind, 'target', p_target, 'role', p_link_role),
    'acc_link_document');
  return v_id;
end $$;
revoke execute on function public.acc_link_document(uuid,text,uuid,text) from public, anon;
grant  execute on function public.acc_link_document(uuid,text,uuid,text) to authenticated;

-- فكّ رابط — الحارس يفرض التجميد (SUBMITTED فما فوق مسدود، POSTED نهائي)
create or replace function public.acc_unlink_document(p_link uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_link record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_link from public.acc_document_links where id = p_link;
  if not found then raise exception 'unknown document link'; end if;
  if coalesce(public.acc_role(v_link.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'unlinking requires OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  delete from public.acc_document_links where id = p_link;  -- الحارس قد يرفض
  perform public.acc_audit(v_link.company_id, v_user, 'DOCUMENT_UNLINKED', 'acc_document_links',
    p_link::text, jsonb_build_object('document', v_link.document_id, 'kind', v_link.target_kind,
    'target', v_link.target_id), null, 'acc_unlink_document');
end $$;
revoke execute on function public.acc_unlink_document(uuid) from public, anon;
grant  execute on function public.acc_unlink_document(uuid) to authenticated;

-- استبدال دليل مصدر قبل الترحيل (CORRECTION 1): الجديد أولًا، إثبات بقاء
-- مصدر صالح، ثم فكّ القديم موقَّعًا — الدليل القديم يبقى محفوظًا مؤرَّخًا
create or replace function public.acc_replace_expense_source(
  p_expense uuid, p_old_document uuid, p_new_document uuid, p_reason text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_new record; v_old_link record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written replacement reason is required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'source replacement requires OWNER or ACCOUNTANT';
  end if;
  if v_exp.state = 'POSTED' then
    raise exception 'posted evidence is history — corrections reference new evidence beside the old, never replace it';
  end if;
  if v_exp.state not in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST') then
    raise exception 'replacement applies to frozen pre-post expenses — a DRAFT relinks normally';
  end if;
  select * into v_new from public.acc_documents where id = p_new_document;
  if not found or v_new.company_id <> v_exp.company_id or v_new.state <> 'FINALIZED' then
    raise exception 'the replacement source must be a FINALIZED same-company document';
  end if;
  -- ١ · الرابط الجديد أولًا
  insert into public.acc_document_links (company_id, document_id, target_kind, target_id, link_role, created_by)
  values (v_exp.company_id, p_new_document, 'EXPENSE', p_expense, 'SOURCE', v_user)
  on conflict (document_id, target_kind, target_id) do nothing;
  -- ٢ · فكّ القديم عبر التوقيع — بعد إثبات وجود مصدر آخر
  select * into v_old_link from public.acc_document_links
   where document_id = p_old_document and target_kind = 'EXPENSE' and target_id = p_expense;
  if not found then raise exception 'the old document is not linked to this expense'; end if;
  if not exists (select 1 from public.acc_document_links
                 where target_kind = 'EXPENSE' and target_id = p_expense
                   and link_role = 'SOURCE' and document_id <> p_old_document) then
    raise exception 'replacement must leave the expense with a valid source';
  end if;
  perform set_config('acc.doc_replace', v_old_link.id::text, true);
  delete from public.acc_document_links where id = v_old_link.id;
  perform set_config('acc.doc_replace', '', true);
  update public.acc_documents set supersedes_document_id = p_old_document where id = p_new_document;
  perform public.acc_audit(v_exp.company_id, v_user, 'DOCUMENT_SUPERSEDED', 'acc_documents',
    p_old_document::text, jsonb_build_object('expense', p_expense),
    jsonb_build_object('replaced_by', p_new_document, 'reason', p_reason), 'acc_replace_expense_source');
end $$;
revoke execute on function public.acc_replace_expense_source(uuid,uuid,uuid,text) from public, anon;
grant  execute on function public.acc_replace_expense_source(uuid,uuid,uuid,text) to authenticated;

-- حذف مستند غير مرتبط — نتيجة بنيوية لا استثناء (درس Stage 7): الحجب
-- يُدقَّق ويثبت؛ الحذف يدقَّق ببصمته المحفوظة في التدقيق للأبد
create or replace function public.acc_delete_document(p_document uuid)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record; v_role text; v_posted boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents where id = p_document;
  if not found then raise exception 'unknown document'; end if;
  v_role := coalesce(public.acc_role(v_doc.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT')
          or (v_role = 'EMPLOYEE' and v_doc.uploaded_by = v_user
              and not exists (select 1 from public.acc_document_links where document_id = p_document))) then
    raise exception 'document deletion requires OWNER/ACCOUNTANT (or the employee uploader while unlinked)';
  end if;
  -- مرتبط بقيد مرحَّل (مباشرة أو عبر مصروف مرحَّل)؟ حجب مدقَّق دائم
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
  if exists (select 1 from public.acc_document_links where document_id = p_document) then
    return query select p_document, 'BLOCKED_LINKED'::text; return;  -- فكّ أولًا (والفكّ محكوم)
  end if;
  perform set_config('acc.doc_op', p_document::text, true);
  delete from public.acc_document_pages where document_id = p_document;
  delete from public.acc_documents where id = p_document;
  perform set_config('acc.doc_op', '', true);
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETED', 'acc_documents',
    p_document::text, jsonb_build_object('sha256', v_doc.content_sha256, 'doc_type', v_doc.doc_type,
    'state', v_doc.state), null, 'acc_delete_document');
  return query select p_document, 'DELETED'::text;
end $$;
revoke execute on function public.acc_delete_document(uuid) from public, anon;
grant  execute on function public.acc_delete_document(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · دوال المصروفات
-- ─────────────────────────────────────────────
-- مسودة idempotent على (company, submission_key) — إعادة المحاولة لا تكرّر
create or replace function public.acc_create_expense_draft(
  p_company uuid, p_submission_key text, p_vendor uuid, p_expense_date date,
  p_vendor_reference text, p_description text, p_source_kind text,
  p_manual_justification text, p_lines jsonb
)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_role text; v_id uuid; v_exist record;
        v_base char(3); l jsonb; v_no integer := 0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  v_role := coalesce(public.acc_role(p_company), '');
  if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','EMPLOYEE') then
    raise exception 'expense drafts require a company member with submission rights (got %)', coalesce(nullif(v_role,''),'none');
  end if;
  if p_vendor is not null and not exists
     (select 1 from public.acc_vendors v where v.id = p_vendor and v.company_id = p_company) then
    raise exception 'vendor does not belong to this company';
  end if;
  select base_currency into v_base from public.acc_companies where id = p_company;
  insert into public.acc_expenses
    (company_id, submission_key, vendor_id, expense_date, vendor_reference, description,
     source_kind, manual_justification, created_by)
  values (p_company, p_submission_key, p_vendor, p_expense_date, p_vendor_reference,
          p_description, p_source_kind, p_manual_justification, v_user)
  on conflict (company_id, submission_key) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_exist from public.acc_expenses
     where company_id = p_company and submission_key = p_submission_key;
    if v_exist.vendor_id is not distinct from p_vendor
       and v_exist.expense_date = p_expense_date
       and v_exist.vendor_reference is not distinct from p_vendor_reference then
      return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text; return;
    end if;
    perform public.acc_audit(p_company, v_user, 'EXPENSE_SUBMISSION_CONFLICT', 'acc_expenses',
      v_exist.id::text, jsonb_build_object('vendor', v_exist.vendor_id, 'date', v_exist.expense_date),
      jsonb_build_object('vendor', p_vendor, 'date', p_expense_date), 'acc_create_expense_draft');
    return query select v_exist.id, 'CONFLICT'::text; return;
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'an expense needs at least one line';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.acc_expense_lines
      (expense_id, company_id, line_no, description, amount_minor, currency,
       base_amount_minor, base_currency, tax_status, tax_rate, category_key,
       fx_rate, fx_rate_date, fx_rate_source)
    values
      (v_id, p_company, v_no, l->>'description',
       (l->>'amount_minor')::bigint, l->>'currency',
       (l->>'base_amount_minor')::bigint, coalesce(l->>'base_currency', v_base),
       l->>'tax_status', nullif(l->>'tax_rate','')::numeric, l->>'category_key',
       nullif(l->>'fx_rate','')::numeric, nullif(l->>'fx_rate_date','')::date,
       nullif(l->>'fx_rate_source',''));
  end loop;
  perform public.acc_audit(p_company, v_user, 'EXPENSE_CREATED', 'acc_expenses', v_id::text,
    null, jsonb_build_object('source_kind', p_source_kind, 'lines', v_no), 'acc_create_expense_draft');
  return query select v_id, 'CREATED'::text;
end $$;
revoke execute on function public.acc_create_expense_draft(uuid,text,uuid,date,text,text,text,text,jsonb) from public, anon;
grant  execute on function public.acc_create_expense_draft(uuid,text,uuid,date,text,text,text,text,jsonb) to authenticated;

-- تعديل مسودة (الأسطر تُستبدل كاملة) — DRAFT فقط
create or replace function public.acc_update_expense_draft(
  p_expense uuid, p_vendor uuid, p_expense_date date, p_vendor_reference text,
  p_description text, p_manual_justification text, p_lines jsonb
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_base char(3); l jsonb; v_no integer := 0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'DRAFT' then raise exception 'only DRAFT expenses are editable'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_exp.created_by = v_user)) then
    raise exception 'editing requires the creator or OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  if p_vendor is not null and not exists
     (select 1 from public.acc_vendors v where v.id = p_vendor and v.company_id = v_exp.company_id) then
    raise exception 'vendor does not belong to this company';
  end if;
  select base_currency into v_base from public.acc_companies where id = v_exp.company_id;
  update public.acc_expenses
     set vendor_id = p_vendor, expense_date = p_expense_date,
         vendor_reference = p_vendor_reference, description = p_description,
         manual_justification = p_manual_justification
   where id = p_expense;
  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'an expense needs at least one line';
    end if;
    delete from public.acc_expense_lines where expense_id = p_expense;
    for l in select * from jsonb_array_elements(p_lines) loop
      v_no := v_no + 1;
      insert into public.acc_expense_lines
        (expense_id, company_id, line_no, description, amount_minor, currency,
         base_amount_minor, base_currency, tax_status, tax_rate, category_key,
         fx_rate, fx_rate_date, fx_rate_source)
      values
        (p_expense, v_exp.company_id, v_no, l->>'description',
         (l->>'amount_minor')::bigint, l->>'currency',
         (l->>'base_amount_minor')::bigint, coalesce(l->>'base_currency', v_base),
         l->>'tax_status', nullif(l->>'tax_rate','')::numeric, l->>'category_key',
         nullif(l->>'fx_rate','')::numeric, nullif(l->>'fx_rate_date','')::date,
         nullif(l->>'fx_rate_source',''));
    end loop;
  end if;
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_UPDATED', 'acc_expenses', p_expense::text,
    null, jsonb_build_object('lines_replaced', p_lines is not null), 'acc_update_expense_draft');
end $$;
revoke execute on function public.acc_update_expense_draft(uuid,uuid,date,text,text,text,jsonb) from public, anon;
grant  execute on function public.acc_update_expense_draft(uuid,uuid,date,text,text,text,jsonb) to authenticated;

-- الإرسال: قاعدة المصدر الملزمة + كشف التكرار الحتمي/المشتبه (CORRECTION 5-B)
create or replace function public.acc_submit_expense(p_expense uuid, p_mark_uncertain boolean default false)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_reason text := null;
        v_total bigint; v_other record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'DRAFT' then raise exception 'only DRAFT expenses are submitted'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_exp.created_by = v_user)) then
    raise exception 'submission requires the creator or OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  if v_exp.vendor_id is null then raise exception 'a submitted expense needs its vendor'; end if;
  if not exists (select 1 from public.acc_expense_lines where expense_id = p_expense) then
    raise exception 'a submitted expense needs at least one line';
  end if;
  -- قاعدة المصدر: مستند FINALIZED مربوط SOURCE، أو مصدر يدوي بتبرير كتابي
  if v_exp.source_kind = 'MANUAL' then
    if v_exp.manual_justification is null or btrim(v_exp.manual_justification) = '' then
      raise exception 'a MANUAL source requires a written justification — manual is not source-less';
    end if;
  elsif not exists (
    select 1 from public.acc_document_links l
    join public.acc_documents d on d.id = l.document_id
    where l.target_kind = 'EXPENSE' and l.target_id = p_expense
      and l.link_role = 'SOURCE' and d.state = 'FINALIZED') then
    raise exception 'submission requires at least one FINALIZED linked source document';
  end if;
  select sum(base_amount_minor) into v_total from public.acc_expense_lines where expense_id = p_expense;
  -- تكرار حتمي/مشتبه — لا إسقاط صامت أبدًا، القرار للإنسان
  if p_mark_uncertain then
    v_reason := 'PERSONAL_BUSINESS_AMBIGUITY';
  end if;
  if v_reason is null and v_exp.vendor_reference is not null then
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.vendor_id = v_exp.vendor_id
       and upper(btrim(e.vendor_reference)) = upper(btrim(v_exp.vendor_reference))
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
     limit 1;
    if found then
      v_reason := 'VENDOR_REFERENCE_DUPLICATE';
    end if;
  end if;
  if v_reason is null then
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.vendor_id = v_exp.vendor_id and e.expense_date = v_exp.expense_date
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
       and (select sum(base_amount_minor) from public.acc_expense_lines where expense_id = e.id) = v_total
     limit 1;
    if found then
      v_reason := 'SUSPECTED_DUPLICATE';
    end if;
  end if;
  if v_reason is null then
    -- نفس دليل المصدر مستخدم في مصروف نشط آخر → مراجعة (لا أثر ثانٍ صامت)
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
       and exists (
         select 1 from public.acc_document_links l1
         join public.acc_document_links l2 on l2.document_id = l1.document_id
         where l1.target_kind = 'EXPENSE' and l1.target_id = p_expense and l1.link_role = 'SOURCE'
           and l2.target_kind = 'EXPENSE' and l2.target_id = e.id and l2.link_role = 'SOURCE')
     limit 1;
    if found then
      v_reason := 'SOURCE_ALREADY_USED';
    end if;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  if v_reason is not null then
    update public.acc_expenses
       set state = 'NEEDS_REVIEW', needs_human_review = true, review_reason = v_reason,
           submitted_at = now(), submitted_by = v_user
     where id = p_expense;
    perform set_config('acc.expense_op', '', true);
    perform public.acc_audit(v_exp.company_id, v_user,
      case when v_reason in ('VENDOR_REFERENCE_DUPLICATE','SUSPECTED_DUPLICATE','SOURCE_ALREADY_USED')
           then 'EXPENSE_DUPLICATE_SUSPECTED' else 'EXPENSE_REVIEW_REQUIRED' end,
      'acc_expenses', p_expense::text, null,
      jsonb_build_object('reason', v_reason), 'acc_submit_expense');
    return query select p_expense, 'NEEDS_REVIEW'::text; return;
  end if;
  update public.acc_expenses
     set state = 'SUBMITTED', submitted_at = now(), submitted_by = v_user
   where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_SUBMITTED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('total_base_minor', v_total::text), 'acc_submit_expense');
  return query select p_expense, 'SUBMITTED'::text;
end $$;
revoke execute on function public.acc_submit_expense(uuid,boolean) from public, anon;
grant  execute on function public.acc_submit_expense(uuid,boolean) to authenticated;

-- حسم المراجعة البشرية — الإنسان يقرر، لا كشف تلقائي يحوّل الغامض عملًا
create or replace function public.acc_resolve_expense_review(
  p_expense uuid, p_resolution text, p_reason text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written review decision reason is required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'NEEDS_REVIEW' then raise exception 'only NEEDS_REVIEW expenses are resolved'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'review resolution requires OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  if p_resolution not in ('PROCEED','VOID') then raise exception 'resolution is PROCEED or VOID'; end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  if p_resolution = 'PROCEED' then
    update public.acc_expenses
       set state = 'SUBMITTED', needs_human_review = false, review_reason = null
     where id = p_expense;
  else
    update public.acc_expenses set state = 'VOIDED', voided_reason = p_reason where id = p_expense;
  end if;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_REVIEW_RESOLVED', 'acc_expenses',
    p_expense::text, jsonb_build_object('review_reason', v_exp.review_reason),
    jsonb_build_object('resolution', p_resolution, 'reason', p_reason), 'acc_resolve_expense_review');
end $$;
revoke execute on function public.acc_resolve_expense_review(uuid,text,text) from public, anon;
grant  execute on function public.acc_resolve_expense_review(uuid,text,text) to authenticated;

-- الاعتماد: حدّ بعملة الأساس مقارنًا بالأساس التاريخي المحفوظ؛ الغياب =
-- تصعيد للمالكة؛ الموظفة/المدير لا يعتمدان ما أنشآ؛ شهادة المالكة على
-- مصروفها تصديق عمل موثَّق — وليست سلطة ترحيل بأي حال
create or replace function public.acc_approve_expense(p_expense uuid, p_reason text)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_limit bigint;
        v_base char(3); v_total bigint; v_self boolean; v_ok boolean := false;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'SUBMITTED' then raise exception 'only SUBMITTED expenses are approved'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if v_role not in ('FINANCE_MANAGER','BUSINESS_OWNER') then
    raise exception 'expense approval requires FINANCE_MANAGER or BUSINESS_OWNER (approval is not posting)';
  end if;
  v_self := (v_exp.created_by = v_user);
  if v_self and v_role = 'FINANCE_MANAGER' then
    raise exception 'no one approves their own submission — FINANCE_MANAGER included';
  end if;
  -- المالكة على مصروفها: تصديق ذاتي موثَّق صراحةً (MVP مالكة واحدة)
  select base_currency into v_base from public.acc_companies where id = v_exp.company_id;
  select approval_limit_base_minor into v_limit
    from public.acc_expense_settings where company_id = v_exp.company_id;
  select sum(base_amount_minor) into v_total from public.acc_expense_lines where expense_id = p_expense;
  insert into public.acc_expense_approvals
    (expense_id, company_id, approval_role, approver_user_id, decision, reason,
     limit_base_minor, base_currency, tested_base_amount_minor, self_attested)
  values (p_expense, v_exp.company_id, v_role, v_user, 'APPROVED', p_reason,
          v_limit, v_base, v_total, v_self);
  -- شرط الاكتمال: المالكة تكفي دائمًا؛ المدير يكفي ضمن حدّ مضبوط فقط
  if v_role = 'BUSINESS_OWNER' then
    v_ok := true;
  elsif v_limit is not null and v_total <= v_limit then
    v_ok := true;
  end if;
  if v_ok then
    perform set_config('acc.expense_op', p_expense::text, true);
    update public.acc_expenses set state = 'APPROVED' where id = p_expense;
    perform set_config('acc.expense_op', '', true);
    perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_APPROVED', 'acc_expenses',
      p_expense::text, null, jsonb_build_object('role', v_role, 'self_attested', v_self,
      'tested_base_minor', v_total::text, 'limit_base_minor', v_limit::text), 'acc_approve_expense');
    return query select p_expense, 'APPROVED'::text; return;
  end if;
  -- موافقة المدير فوق الحدّ (أو بلا حدّ مضبوط): تُسجَّل وتنتظر المالكة
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_APPROVED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('role', v_role, 'partial', true,
    'tested_base_minor', v_total::text, 'limit_base_minor', v_limit::text,
    'escalation', 'OWNER_APPROVAL_REQUIRED'), 'acc_approve_expense');
  return query select p_expense, 'OWNER_APPROVAL_REQUIRED'::text;
end $$;
revoke execute on function public.acc_approve_expense(uuid,text) from public, anon;
grant  execute on function public.acc_approve_expense(uuid,text) to authenticated;

create or replace function public.acc_reject_expense(p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_base char(3); v_total bigint;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written rejection reason is required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'SUBMITTED' then raise exception 'only SUBMITTED expenses are rejected'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if v_role not in ('FINANCE_MANAGER','BUSINESS_OWNER') then
    raise exception 'expense rejection requires FINANCE_MANAGER or BUSINESS_OWNER';
  end if;
  select base_currency into v_base from public.acc_companies where id = v_exp.company_id;
  select sum(base_amount_minor) into v_total from public.acc_expense_lines where expense_id = p_expense;
  insert into public.acc_expense_approvals
    (expense_id, company_id, approval_role, approver_user_id, decision, reason,
     base_currency, tested_base_amount_minor, self_attested)
  values (p_expense, v_exp.company_id, v_role, v_user, 'REJECTED', p_reason,
          v_base, v_total, v_exp.created_by = v_user);
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses set state = 'REJECTED' where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_REJECTED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('reason', p_reason), 'acc_reject_expense');
end $$;
revoke execute on function public.acc_reject_expense(uuid,text) from public, anon;
grant  execute on function public.acc_reject_expense(uuid,text) to authenticated;

-- إعادة العمل: REJECTED → DRAFT — عملية صريحة مدقَّقة
create or replace function public.acc_rework_expense(p_expense uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'REJECTED' then raise exception 'only REJECTED expenses are reworked'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_exp.created_by = v_user)) then
    raise exception 'rework requires the creator or OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses set state = 'DRAFT' where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_UPDATED', 'acc_expenses',
    p_expense::text, jsonb_build_object('state','REJECTED'), jsonb_build_object('state','DRAFT'),
    'acc_rework_expense');
end $$;
revoke execute on function public.acc_rework_expense(uuid) from public, anon;
grant  execute on function public.acc_rework_expense(uuid) to authenticated;

-- التصنيف: المحاسبة حصراً؛ السياسة من السجل؛ المعالجة المؤجَّل محركها
-- تبقى provisional غير قابلة للترحيل — لا ترحيل خاطئ كمصروف فوري
create or replace function public.acc_classify_expense(
  p_expense uuid, p_policy_id text, p_as_of date
)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_pol record; v_missing text := null; r record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'APPROVED' then raise exception 'classification follows business approval (APPROVED only)'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'accounting classification is the ACCOUNTANT''s act';
  end if;
  select * into v_pol from public.acc_resolve_policy(v_exp.company_id, p_policy_id, p_as_of, 'SANDBOX');
  update public.acc_expenses
     set policy_id = p_policy_id, policy_version = v_pol.version,
         policy_status_used = v_pol.status, treatment = v_pol.treatment,
         provisional = coalesce(v_pol.is_provisional, true)
                       or v_pol.status is distinct from 'APPROVED'
   where id = p_expense;
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_CLASSIFIED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('policy', p_policy_id, 'version', v_pol.version,
    'status', v_pol.status, 'treatment', v_pol.treatment), 'acc_classify_expense');
  if v_pol.status is distinct from 'APPROVED' then
    return query select p_expense, 'POLICY_NOT_APPROVED'::text; return;  -- provisional، لا ترحيل
  end if;
  if v_pol.treatment is distinct from 'IMMEDIATE_EXPENSE' then
    -- accrual/prepaid/capitalise محركاتها مؤجلة — يبقى provisional
    return query select p_expense, 'TREATMENT_ENGINE_DEFERRED'::text; return;
  end if;
  -- خرائط الحسابات المعتمدة: كل فئة سطر + حساب الدائن — الغياب فشل مغلق
  for r in select distinct category_key from public.acc_expense_lines where expense_id = p_expense loop
    if not exists (select 1 from public.acc_gl_account_links
                   where company_id = v_exp.company_id and purpose = 'EXPENSE_ACCOUNT'
                     and scope_key = r.category_key) then
      v_missing := coalesce(v_missing, '') || ' EXPENSE_ACCOUNT:' || r.category_key;
    end if;
  end loop;
  if not exists (select 1 from public.acc_gl_account_links
                 where company_id = v_exp.company_id and purpose = 'EXPENSE_PAYABLE' and scope_key = '') then
    v_missing := coalesce(v_missing, '') || ' EXPENSE_PAYABLE';
  end if;
  if v_missing is not null then
    return query select p_expense, ('AUTHORITATIVE_MAPPING_REQUIRED:' || v_missing)::text; return;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses set state = 'READY_TO_POST', provisional = false where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  return query select p_expense, 'READY_TO_POST'::text;
end $$;
revoke execute on function public.acc_classify_expense(uuid,text,date) from public, anon;
grant  execute on function public.acc_classify_expense(uuid,text,date) to authenticated;

-- تجهيز قيد المصروف: **تحضير فقط** — قيد DRAFT عبر بنية Stage 3، مدين
-- الفئات المعتمدة ودائن EXPENSE_PAYABLE، وربط أدلة المصدر بالقيد.
-- المصروف لا يصير POSTED هنا أبدًا.
create or replace function public.acc_prepare_expense_journal(p_expense uuid, p_period uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_source uuid; v_entry uuid;
        v_base char(3); v_total bigint; r record; v_acct uuid; v_link uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'READY_TO_POST' then raise exception 'journal preparation requires READY_TO_POST'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'journal preparation is the ACCOUNTANT''s act';
  end if;
  if v_exp.journal_entry_id is not null then
    return v_exp.journal_entry_id;  -- مجهَّز مسبقًا — idempotent
  end if;
  select base_currency into v_base from public.acc_companies where id = v_exp.company_id;
  insert into public.acc_sources (company_id, kind, reference, description, created_by)
  values (v_exp.company_id, 'EXPENSE', p_expense::text, v_exp.description, v_user)
  returning id into v_source;
  insert into public.acc_journal_entries
    (company_id, period_id, source_id, entry_date, description, kind, created_by)
  values (v_exp.company_id, p_period, v_source, v_exp.expense_date, v_exp.description, 'STANDARD', v_user)
  returning id into v_entry;
  v_total := 0;
  for r in select * from public.acc_expense_lines where expense_id = p_expense order by line_no loop
    v_acct := public.acc_required_account(v_exp.company_id, 'EXPENSE_ACCOUNT', r.category_key);
    insert into public.acc_journal_lines
      (entry_id, company_id, account_id, side, amount_minor, currency,
       base_amount_minor, base_currency, tax_status, memo,
       fx_rate, fx_rate_date, fx_rate_source)
    values (v_entry, v_exp.company_id, v_acct, 'DEBIT', r.amount_minor, r.currency,
            r.base_amount_minor, r.base_currency, r.tax_status, r.description,
            r.fx_rate, r.fx_rate_date, r.fx_rate_source);
    v_total := v_total + r.base_amount_minor;
  end loop;
  v_acct := public.acc_required_account(v_exp.company_id, 'EXPENSE_PAYABLE', '');
  insert into public.acc_journal_lines
    (entry_id, company_id, account_id, side, amount_minor, currency,
     base_amount_minor, base_currency, tax_status, memo)
  values (v_entry, v_exp.company_id, v_acct, 'CREDIT', v_total, v_base,
          v_total, v_base, 'OUT_OF_SCOPE', 'التزام مصروف — ' || coalesce(v_exp.description, p_expense::text));
  update public.acc_expenses
     set prepared_source_id = v_source, journal_entry_id = v_entry
   where id = p_expense;
  -- أدلة المصدر تُربط بالقيد (DoD: مستند ↔ قيد) — الفكّ سيتجمّد عند الترحيل
  for r in select l.document_id from public.acc_document_links l
            where l.target_kind = 'EXPENSE' and l.target_id = p_expense and l.link_role = 'SOURCE' loop
    insert into public.acc_document_links (company_id, document_id, target_kind, target_id, link_role, created_by)
    values (v_exp.company_id, r.document_id, 'JOURNAL_ENTRY', v_entry, 'SOURCE', v_user)
    on conflict (document_id, target_kind, target_id) do nothing
    returning id into v_link;
    if v_link is not null then
      perform public.acc_audit(v_exp.company_id, v_user, 'DOCUMENT_LINKED', 'acc_document_links',
        v_link::text, null, jsonb_build_object('document', r.document_id, 'kind', 'JOURNAL_ENTRY',
        'target', v_entry), 'acc_prepare_expense_journal');
    end if;
  end loop;
  perform public.acc_audit(v_exp.company_id, v_user, 'JOURNAL_DRAFT_CREATED', 'acc_journal_entries',
    v_entry::text, null, jsonb_build_object('expense', p_expense, 'total_base_minor', v_total::text),
    'acc_prepare_expense_journal');
  return v_entry;
end $$;
revoke execute on function public.acc_prepare_expense_journal(uuid,uuid) from public, anon;
grant  execute on function public.acc_prepare_expense_journal(uuid,uuid) to authenticated;

-- شهادة الترحيل: المصروف POSTED **فقط بعد** بلوغ قيده POSTED فعليًا عبر
-- acc_post_journal — تحقق شركة ومصدر وقيد وتطابق مجاميع، وانتقال يحدث مرة
create or replace function public.acc_attest_expense_posted(p_expense uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_j record; v_exp_total bigint; v_j_total bigint;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'READY_TO_POST' then raise exception 'attestation applies to READY_TO_POST once'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'posting attestation is the ACCOUNTANT''s act';
  end if;
  if v_exp.journal_entry_id is null then raise exception 'no prepared journal for this expense'; end if;
  select * into v_j from public.acc_journal_entries where id = v_exp.journal_entry_id;
  if v_j.company_id <> v_exp.company_id then raise exception 'journal company mismatch'; end if;
  if v_j.source_id is distinct from v_exp.prepared_source_id then
    raise exception 'the journal does not originate from this expense''s source';
  end if;
  if v_j.status <> 'POSTED' then
    raise exception 'the expense becomes POSTED only after its journal is POSTED (journal is %)', v_j.status;
  end if;
  select sum(base_amount_minor) into v_exp_total from public.acc_expense_lines where expense_id = p_expense;
  select sum(base_amount_minor) into v_j_total from public.acc_journal_lines
   where entry_id = v_j.id and side = 'DEBIT';
  if v_exp_total is distinct from v_j_total then
    raise exception 'journal debits (%) do not correspond to expense base total (%)', v_j_total, v_exp_total;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses set state = 'POSTED', posted_at = now() where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_POSTED', 'acc_expenses',
    p_expense::text, jsonb_build_object('state','READY_TO_POST'),
    jsonb_build_object('state','POSTED','journal', v_j.id), 'acc_attest_expense_posted');
end $$;
revoke execute on function public.acc_attest_expense_posted(uuid) from public, anon;
grant  execute on function public.acc_attest_expense_posted(uuid) to authenticated;

-- تسجيل تصحيح بعد الترحيل: المصروف يبقى POSTED تاريخًا؛ العكس عبر محرك
-- Stage 3 والقيد المصحح يُوصَل هنا — لا تعديل ولا إعادة مسودة
create or replace function public.acc_record_expense_correction(
  p_expense uuid, p_correction_entry uuid, p_reason text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_j record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written correction reason is required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'POSTED' then raise exception 'corrections apply to POSTED expenses'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'correction linkage is the ACCOUNTANT''s act';
  end if;
  select * into v_j from public.acc_journal_entries where id = p_correction_entry;
  if not found or v_j.company_id <> v_exp.company_id then
    raise exception 'the correction entry must exist in the same company';
  end if;
  update public.acc_expenses set corrected_by_entry_id = p_correction_entry where id = p_expense;
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_CORRECTION_REQUIRED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('correction_entry', p_correction_entry, 'reason', p_reason),
    'acc_record_expense_correction');
end $$;
revoke execute on function public.acc_record_expense_correction(uuid,uuid,text) from public, anon;
grant  execute on function public.acc_record_expense_correction(uuid,uuid,text) to authenticated;

-- إلغاء قبل الترحيل: يتعامل بأمان مع قيد DRAFT مجهَّز (DISCARDED) —
-- لا يحذف قيدًا POSTED أبدًا؛ تاريخ الموافقات append-only يبقى
create or replace function public.acc_void_expense(p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_j record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written void reason is required'; end if;
  select * into v_exp from public.acc_expenses where id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state = 'POSTED' then
    raise exception 'a posted expense is never voided — corrections use reversal plus a corrected entry';
  end if;
  if v_exp.state = 'VOIDED' then raise exception 'already voided'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_exp.created_by = v_user and v_exp.state = 'DRAFT')) then
    raise exception 'voiding requires OWNER/ACCOUNTANT/FINANCE_MANAGER (employees void their own drafts only)';
  end if;
  if v_exp.journal_entry_id is not null then
    select * into v_j from public.acc_journal_entries where id = v_exp.journal_entry_id;
    if v_j.status = 'DRAFT' then
      update public.acc_journal_entries set status = 'DISCARDED' where id = v_j.id;
      perform public.acc_audit(v_exp.company_id, v_user, 'JOURNAL_DISCARDED', 'acc_journal_entries',
        v_j.id::text, jsonb_build_object('status','DRAFT'), jsonb_build_object('status','DISCARDED'),
        'acc_void_expense');
    elsif v_j.status not in ('DISCARDED') then
      raise exception 'the prepared journal is % — resolve it through the ledger before voiding', v_j.status;
    end if;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses set state = 'VOIDED', voided_reason = p_reason where id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_VOIDED', 'acc_expenses',
    p_expense::text, jsonb_build_object('state', v_exp.state),
    jsonb_build_object('state','VOIDED','reason', p_reason), 'acc_void_expense');
end $$;
revoke execute on function public.acc_void_expense(uuid,text) from public, anon;
grant  execute on function public.acc_void_expense(uuid,text) to authenticated;

-- ضبط الإعدادات — المالكة حصراً، مدقَّق (الحدّ بعملة أساس الشركة)
create or replace function public.acc_set_expense_settings(
  p_company uuid, p_approval_limit_base_minor bigint, p_max_file_bytes bigint,
  p_retention_years integer, p_reason text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_old record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') <> 'BUSINESS_OWNER' then
    raise exception 'expense settings are the BUSINESS_OWNER''s act';
  end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written settings reason is required'; end if;
  select * into v_old from public.acc_expense_settings where company_id = p_company;
  insert into public.acc_expense_settings
    (company_id, approval_limit_base_minor, max_file_bytes, retention_years, updated_by)
  values (p_company, p_approval_limit_base_minor, p_max_file_bytes,
          coalesce(p_retention_years, 10), v_user)
  on conflict (company_id) do update
    set approval_limit_base_minor = excluded.approval_limit_base_minor,
        max_file_bytes = excluded.max_file_bytes,
        retention_years = excluded.retention_years,
        updated_at = now(), updated_by = excluded.updated_by;
  perform public.acc_audit(p_company, v_user, 'EXPENSE_SETTINGS_UPDATED', 'acc_expense_settings',
    p_company::text,
    case when v_old is null then null else jsonb_build_object(
      'approval_limit_base_minor', v_old.approval_limit_base_minor::text,
      'retention_years', v_old.retention_years) end,
    jsonb_build_object('approval_limit_base_minor', p_approval_limit_base_minor::text,
      'retention_years', coalesce(p_retention_years, 10), 'reason', p_reason),
    'acc_set_expense_settings');
end $$;
revoke execute on function public.acc_set_expense_settings(uuid,bigint,bigint,integer,text) from public, anon;
grant  execute on function public.acc_set_expense_settings(uuid,bigint,bigint,integer,text) to authenticated;
