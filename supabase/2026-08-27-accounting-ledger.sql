-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 3: LEDGER
-- دليل الحسابات · المصادر · الفترات المالية · القيود · الترحيل ·
-- العكس · دفتر الأستاذ · ميزان المراجعة
-- (Git فقط — لا تُطبَّق قبل مراجعة صاحبة المنصة · تبنى فوق هجرتي
--  Stage 1/2 المعتمدتين ولا تعدّلهما)
--
-- المبدأ الحاكم: دفتر الأستاذ هو السجل الوحيد الموثوق لكل حدث مالي.
-- القيد المزدوج ليس اختياريًا: المدين = الدائن **بالتمام** لحظة
-- الترحيل بعملة الأساس — فلسٌ واحد فرقًا = رفض كامل بلا أثر جزئي،
-- ولا سطر موازنة خفيًا، ولا تصحيح تقريب، ولا معلق آليًا.
-- المُرحَّل مجمّد إلى الأبد؛ التصحيح عكسٌ + قيد جديد.
--
-- حدود صارمة: لا عملاء/موردين/فواتير/مدفوعات/إيراد مؤجل/بنوك،
-- لا AI ترحيلًا، لا QAYD ولا XBRL — الربط القوائمي داخلي محايد
-- تنظيميًا (statement_mapping) فقط.
--
-- لا دليل حسابات مبتكرًا باسم غراس: الـBlueprint لا يحوي COA معتمدًا
-- كاملًا، فبذر دليلٍ «رسمي» قرار مهني مؤجل لصاحبة القرار — حسابات
-- الاختبار fixtures صريحة تنشئها الاختبارات فقط.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

-- ─────────────────────────────────────────────
-- ١ · دليل الحسابات — company-scoped (Part A)
-- ─────────────────────────────────────────────
create table if not exists public.acc_accounts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  code              text not null check (btrim(code) <> ''),
  name              text not null check (btrim(name) <> ''),
  account_type      text not null check (account_type in
                      ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_id         uuid references public.acc_accounts(id),
  -- حساب مقابل (contra): يعكس الرصيد الطبيعي لنوعه — لا فئات IFRS مبتكرة
  is_contra         boolean not null default false,
  -- غير القابل للترحيل عقدة تجميع هرمية فقط
  postable          boolean not null default true,
  active            boolean not null default true,
  -- ربط قوائمي داخلي محايد تنظيميًا — ليس QAYD ولا XBRL
  statement_mapping text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  unique (company_id, code)
);
create index if not exists acc_accounts_company_idx on public.acc_accounts (company_id, code);

-- حارس الدليل: الأب من الشركة نفسها، لا دورات هرمية، لا حذف أبدًا
-- (التعطيل بدل الحذف — الحساب المعطل يبقى في التقارير التاريخية)،
-- والهوية المالية (company/type/code) لا تتبدل بعد الإنشاء.
create or replace function public.acc_accounts_guard()
returns trigger language plpgsql as $$
declare
  v_cursor uuid;
  v_depth integer := 0;
  v_parent_company uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_accounts: accounts are never deleted — deactivate instead (history must keep them)';
  end if;
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
       or new.account_type is distinct from old.account_type
       or new.code is distinct from old.code
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by then
      raise exception 'acc_accounts: company/type/code/creation identity is immutable';
    end if;
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'acc_accounts: an account cannot parent itself';
    end if;
    select company_id into v_parent_company from public.acc_accounts where id = new.parent_id;
    if v_parent_company is null then
      raise exception 'acc_accounts: unknown parent account';
    end if;
    if v_parent_company <> new.company_id then
      raise exception 'acc_accounts: parent must belong to the same company';
    end if;
    -- منع الدورات: الصعود من الأب حتى الجذر يجب ألا يمر بالحساب نفسه
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception 'acc_accounts: hierarchy cycle detected';
      end if;
      v_depth := v_depth + 1;
      if v_depth > 50 then
        raise exception 'acc_accounts: hierarchy too deep (possible cycle)';
      end if;
      select parent_id into v_cursor from public.acc_accounts where id = v_cursor;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists acc_accounts_guard_trg on public.acc_accounts;
create trigger acc_accounts_guard_trg
  before insert or update or delete on public.acc_accounts
  for each row execute function public.acc_accounts_guard();

-- ─────────────────────────────────────────────
-- ٢ · مصادر القيود — لا قيد مرحّلًا يتيمًا أبدًا (Part B)
--     المفردات تسع وحدات المستقبل دون تعديل نموذج الدفتر
-- ─────────────────────────────────────────────
create table if not exists public.acc_sources (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.acc_companies(id),
  kind        text not null check (kind in
                ('MANUAL_JOURNAL','INVOICE','PAYMENT','REFUND','SETTLEMENT',
                 'EXPENSE','BANK','REVENUE_RECOGNITION','PERIOD_CLOSE',
                 'REVERSAL','OPENING','SYSTEM')),
  reference   text,
  description text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
create or replace function public.acc_sources_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_sources are immutable: % refused', tg_op;
end $$;
drop trigger if exists acc_sources_frozen_trg on public.acc_sources;
create trigger acc_sources_frozen_trg
  before update or delete on public.acc_sources
  for each row execute function public.acc_sources_frozen();

-- ─────────────────────────────────────────────
-- ٣ · الفترات المالية وآلة حالاتها (Part C)
-- ─────────────────────────────────────────────
create table if not exists public.acc_fiscal_periods (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.acc_companies(id),
  fiscal_year text not null,          -- هوية السنة المالية (مثل «FY2026»)
  start_date  date not null,
  end_date    date not null,
  state       text not null default 'FUTURE' check (state in
                ('FUTURE','OPEN','SOFT_CLOSED','CLOSED','REOPENED','ARCHIVED')),
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  check (start_date <= end_date),
  -- لا تداخل فترات لنفس الشركة — والفترة الأولى تجوز أقصر أو أطول
  -- من ١٢ شهرًا: لا شرط مدة أصلًا (فترات انتقالية مستقبلية مدعومة)
  exclude using gist (company_id with =, daterange(start_date, end_date, '[]') with &&)
);
create index if not exists acc_periods_company_idx on public.acc_fiscal_periods (company_id, start_date);

-- آلة الحالات: الانتقالات المسموحة حصرًا (لا اختراع غيرها)،
-- والانتقال لا يمر إلا عبر دوال الفترات الموقّعة، وARCHIVED نهائية أبدًا
create or replace function public.acc_periods_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_fiscal_periods: periods are never deleted';
  end if;
  if new.company_id is distinct from old.company_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'acc_fiscal_periods: identity is immutable';
  end if;
  -- التواريخ تُعدَّل في FUTURE فقط (قبل أي أثر مالي)
  if (new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.fiscal_year is distinct from old.fiscal_year)
     and old.state <> 'FUTURE' then
    raise exception 'acc_fiscal_periods: dates are frozen once the period leaves FUTURE';
  end if;
  if new.state is distinct from old.state then
    if current_setting('acc.period_transition', true) is distinct from old.id::text then
      raise exception 'period state changes only through the signed period functions';
    end if;
    if old.state = 'ARCHIVED' then
      raise exception 'ARCHIVED is terminal forever';
    end if;
    if not ( (old.state = 'FUTURE'      and new.state = 'OPEN')
          or (old.state = 'OPEN'        and new.state = 'SOFT_CLOSED')
          or (old.state = 'SOFT_CLOSED' and new.state = 'OPEN')
          or (old.state = 'SOFT_CLOSED' and new.state = 'CLOSED')
          or (old.state = 'CLOSED'      and new.state = 'REOPENED')
          or (old.state = 'REOPENED'    and new.state = 'CLOSED')
          or (old.state = 'CLOSED'      and new.state = 'ARCHIVED') ) then
      raise exception 'forbidden period transition: % -> %', old.state, new.state;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_periods_guard_trg on public.acc_fiscal_periods;
create trigger acc_periods_guard_trg
  before update or delete on public.acc_fiscal_periods
  for each row execute function public.acc_periods_guard();

-- شهادات إعادة الفتح — append-only (Part N):
-- CLOSED → REOPENED تتطلب إنسانين مختلفين: ACCOUNTANT + BUSINESS_OWNER
-- (موافقة المالكة تأكيد، والمحاسبة تنفذ) — بعد آخر إغلاق، وبسبب مسجل
create table if not exists public.acc_period_approvals (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid not null references public.acc_fiscal_periods(id),
  company_id       uuid not null references public.acc_companies(id),
  approval_role    text not null check (approval_role in ('ACCOUNTANT','BUSINESS_OWNER')),
  approver_user_id uuid not null references auth.users(id),
  reason           text not null check (btrim(reason) <> ''),
  created_at       timestamptz not null default now()
);
create or replace function public.acc_period_approvals_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_period_approvals is append-only: % refused', tg_op;
end $$;
drop trigger if exists acc_period_approvals_frozen_trg on public.acc_period_approvals;
create trigger acc_period_approvals_frozen_trg
  before update or delete on public.acc_period_approvals
  for each row execute function public.acc_period_approvals_frozen();

-- لقطة الإغلاق — أرصدة الإقفال وسياساته، append-only وتبقى للأبد (Part M)
create table if not exists public.acc_close_snapshots (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.acc_companies(id),
  period_id       uuid not null references public.acc_fiscal_periods(id),
  closed_at       timestamptz not null default now(),
  -- المبالغ نصوص وحدات صغرى — لا تمر بأي float أو JSON number
  balances        jsonb not null,
  policy_versions jsonb not null,
  actor_user_id   uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create or replace function public.acc_snapshots_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_close_snapshots are immutable history: % refused', tg_op;
end $$;
drop trigger if exists acc_snapshots_frozen_trg on public.acc_close_snapshots;
create trigger acc_snapshots_frozen_trg
  before update or delete on public.acc_close_snapshots
  for each row execute function public.acc_snapshots_frozen();

-- ─────────────────────────────────────────────
-- ٤ · القيود وأسطرها (Parts D/E/F)
-- ─────────────────────────────────────────────
create table if not exists public.acc_journal_entries (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.acc_companies(id),
  period_id           uuid not null references public.acc_fiscal_periods(id),
  source_id           uuid not null references public.acc_sources(id),
  entry_date          date not null,
  description         text,
  kind                text not null default 'STANDARD' check (kind in
                        ('STANDARD','OPENING','ADJUSTMENT','REVERSAL')),
  status              text not null default 'DRAFT' check (status in
                        ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED','DISCARDED')),
  reverses_entry_id   uuid references public.acc_journal_entries(id),
  reversed_by_entry_id uuid references public.acc_journal_entries(id),
  posted_at           timestamptz,
  posted_by           uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  check ((kind = 'REVERSAL') = (reverses_entry_id is not null))
);
create index if not exists acc_entries_company_idx on public.acc_journal_entries (company_id, entry_date);
create index if not exists acc_entries_period_idx on public.acc_journal_entries (period_id);

-- آلة حالات القيد + مناعة المرحَّل (Parts D/H):
-- DRAFT→PENDING_APPROVAL→POSTED→REVERSED و DRAFT→DISCARDED فقط.
create or replace function public.acc_entries_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_journal_entries are never deleted — DISCARDED is a retained state';
  end if;
  if new.company_id is distinct from old.company_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.kind is distinct from old.kind
     or new.reverses_entry_id is distinct from old.reverses_entry_id then
    raise exception 'acc_journal_entries: identity fields are immutable';
  end if;
  if old.status in ('POSTED','REVERSED','DISCARDED') then
    -- المرحَّل مجمّد: التغيير الوحيد المسموح POSTED→REVERSED عبر محرك العكس
    if old.status = 'POSTED' and new.status = 'REVERSED'
       and current_setting('acc.journal_reversal', true) = old.id::text
       and new.reversed_by_entry_id is not null
       and new.period_id = old.period_id and new.source_id = old.source_id
       and new.entry_date = old.entry_date and new.posted_at = old.posted_at
       and new.posted_by is not distinct from old.posted_by
       and new.description is not distinct from old.description then
      return new;
    end if;
    raise exception 'a % journal entry is immutable — corrections are a reversal plus a new entry', old.status;
  end if;
  if new.status is distinct from old.status then
    if not ( (old.status = 'DRAFT' and new.status = 'PENDING_APPROVAL')
          or (old.status = 'PENDING_APPROVAL' and new.status = 'POSTED')
          or (old.status = 'DRAFT' and new.status = 'DISCARDED') ) then
      raise exception 'forbidden journal transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'POSTED'
       and current_setting('acc.journal_posting', true) is distinct from old.id::text then
      raise exception 'POSTED only through acc_post_journal after full ledger validation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_entries_guard_trg on public.acc_journal_entries;
create trigger acc_entries_guard_trg
  before update or delete on public.acc_journal_entries
  for each row execute function public.acc_entries_guard();

-- الأسطر: جانب صريح DEBIT/CREDIT ومبلغ موجب تام — لا سالب غامضًا،
-- ولا مدين+دائن معًا، ولا مبلغ صفريًا. حالة الضريبة على كل سطر.
create table if not exists public.acc_journal_lines (
  id                uuid primary key default gen_random_uuid(),
  entry_id          uuid not null references public.acc_journal_entries(id),
  company_id        uuid not null references public.acc_companies(id),
  account_id        uuid not null references public.acc_accounts(id),
  side              text not null check (side in ('DEBIT','CREDIT')),
  amount_minor      bigint not null check (amount_minor > 0),
  currency          char(3) not null references public.acc_currencies(code),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  base_currency     char(3) not null references public.acc_currencies(code),
  tax_status        text not null references public.acc_tax_statuses(code),
  memo              text,
  fx_rate           numeric(20,10),
  fx_rate_date      date,
  fx_rate_source    text,
  created_at        timestamptz not null default now(),
  -- نفس العملة: الأساس يساوي المعاملة تمامًا ولا حقول FX؛
  -- عملة مختلفة: أدلة السعر الثلاثة إلزامية ولا يعاد حسابها لاحقًا
  check (currency <> base_currency
         or (base_amount_minor = amount_minor and fx_rate is null
             and fx_rate_date is null and fx_rate_source is null)),
  check (currency = base_currency
         or (fx_rate is not null and fx_rate > 0
             and fx_rate_date is not null and fx_rate_source is not null))
);
create index if not exists acc_lines_entry_idx on public.acc_journal_lines (entry_id);
create index if not exists acc_lines_account_idx on public.acc_journal_lines (account_id);

-- أسطر القيود تُعدل في DRAFT فقط؛ المرحَّل مجمّد كليًا حتى ضد الخدمة
create or replace function public.acc_lines_guard()
returns trigger language plpgsql as $$
declare
  v_entry record;
begin
  select status, company_id into v_entry
  from public.acc_journal_entries
  where id = coalesce(new.entry_id, old.entry_id);
  if tg_op = 'INSERT' then
    if v_entry.status <> 'DRAFT' then
      raise exception 'lines can only be added to a DRAFT entry (entry is %)', v_entry.status;
    end if;
    if new.company_id <> v_entry.company_id then
      raise exception 'line company must match its entry company';
    end if;
    return new;
  end if;
  if v_entry.status <> 'DRAFT' then
    raise exception 'lines of a % entry are immutable: % refused', v_entry.status, tg_op;
  end if;
  if tg_op = 'UPDATE' and (new.entry_id is distinct from old.entry_id
                           or new.company_id is distinct from old.company_id) then
    raise exception 'a line cannot move between entries or companies';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists acc_lines_guard_trg on public.acc_journal_lines;
create trigger acc_lines_guard_trg
  before insert or update or delete on public.acc_journal_lines
  for each row execute function public.acc_lines_guard();

-- ─────────────────────────────────────────────
-- ٥ · RLS (Part O) — العزل مطلق ولا is_admin في أي سياسة
-- ─────────────────────────────────────────────
alter table public.acc_accounts         enable row level security;
alter table public.acc_sources          enable row level security;
alter table public.acc_fiscal_periods   enable row level security;
alter table public.acc_period_approvals enable row level security;
alter table public.acc_close_snapshots  enable row level security;
alter table public.acc_journal_entries  enable row level security;
alter table public.acc_journal_lines    enable row level security;

-- القراءة دور + شركة، لا عضوية وحدها (FIX 3): الدفتر التقني الخام
-- (دليل/قيود/أسطر/مصادر/لقطات) للمحاسبة والمدقق حصرًا. المالكة لا
-- ترى المدين/الدائن الخام — وضع المالكة لاحقًا واجهات مشتقة بلغة
-- مفهومة. المدير المالي بلا دفتر خام — تقاريره المسموحة (ميزان
-- المراجعة) عبر دالتها المخوّلة، ويرى الفترات لأن التقرير يُطلب بها.
-- الموظف وREAD_ONLY: لا وصول خامًا (تحفظ حتى تُعرَّف صلاحيات المنتج).
-- أدمِن المنصة بلا عضوية: لا شيء — لا is_admin هنا.
create policy acc_accounts_select on public.acc_accounts
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR'));
create policy acc_sources_select on public.acc_sources
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR'));
create policy acc_periods_select on public.acc_fiscal_periods
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
-- شهادات إعادة الفتح: أطرافها (المالكة تشهد فترى) + المحاسبة والمدقق
create policy acc_period_approvals_select on public.acc_period_approvals
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','BUSINESS_OWNER'));
create policy acc_snapshots_select on public.acc_close_snapshots
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR'));
create policy acc_entries_select on public.acc_journal_entries
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR'));
create policy acc_lines_select on public.acc_journal_lines
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR'));

-- كل الكتابة عبر الدوال الموقعة حصرًا — صفر كتابة عميل مباشرة
revoke insert, update, delete on public.acc_accounts         from anon, authenticated;
revoke insert, update, delete on public.acc_sources          from anon, authenticated;
revoke insert, update, delete on public.acc_fiscal_periods   from anon, authenticated;
revoke insert, update, delete on public.acc_period_approvals from anon, authenticated;
revoke insert, update, delete on public.acc_close_snapshots  from anon, authenticated;
revoke insert, update, delete on public.acc_journal_entries  from anon, authenticated;
revoke insert, update, delete on public.acc_journal_lines    from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٦ · مساعدات داخلية
-- ─────────────────────────────────────────────
create or replace function public.acc_audit(
  p_company uuid, p_actor uuid, p_action text, p_subject_type text,
  p_subject_id text, p_before jsonb, p_after jsonb, p_source text
)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     before_state, after_state, occurred_at, source)
  values (p_company, case when p_actor is null then 'SYSTEM' else 'USER' end,
          p_actor, p_action, p_subject_type, p_subject_id, p_before, p_after, now(), p_source);
$$;
revoke execute on function public.acc_audit(uuid,uuid,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;

-- خطاف ACC-024: موانع إغلاق الفترة — وحدة الاستثناءات الحرجة لاحقة؛
-- الإغلاق يستشير هذه الدالة، واستبدال جسدها لاحقًا يصل الوحدة دون
-- إعادة تصميم للدفتر. حاليًا: لا موانع (بنية جاهزة، اعتماد معلق).
create or replace function public.acc_period_close_blockers(p_period uuid)
returns table (blocker_kind text, blocker_ref text)
language sql stable set search_path to 'public' as $$
  select null::text, null::text where false
$$;

-- ─────────────────────────────────────────────
-- ٧ · دليل الحسابات — دوال (ACCOUNTANT فقط للتكوين)
-- ─────────────────────────────────────────────
create or replace function public.acc_create_account(
  p_company uuid, p_code text, p_name text, p_type text,
  p_parent uuid default null, p_postable boolean default true,
  p_is_contra boolean default false, p_statement_mapping text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if public.acc_role(p_company) is distinct from 'ACCOUNTANT' then
    raise exception 'chart of accounts configuration requires the ACCOUNTANT role in this company';
  end if;
  insert into public.acc_accounts
    (company_id, code, name, account_type, parent_id, postable, is_contra, statement_mapping, created_by)
  values (p_company, btrim(p_code), btrim(p_name), p_type, p_parent, p_postable, p_is_contra, p_statement_mapping, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'ACCOUNT_CREATED', 'acc_accounts', v_id::text,
    null, jsonb_build_object('code', p_code, 'type', p_type), 'acc_create_account');
  return v_id;
end $$;
revoke execute on function public.acc_create_account(uuid,text,text,text,uuid,boolean,boolean,text) from public, anon;
grant  execute on function public.acc_create_account(uuid,text,text,text,uuid,boolean,boolean,text) to authenticated;

create or replace function public.acc_set_account_active(p_account uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_accounts where id = p_account;
  if not found then raise exception 'unknown account'; end if;
  if public.acc_role(v_row.company_id) is distinct from 'ACCOUNTANT' then
    raise exception 'chart of accounts configuration requires the ACCOUNTANT role in this company';
  end if;
  update public.acc_accounts set active = p_active where id = p_account;
  perform public.acc_audit(v_row.company_id, v_user, 'ACCOUNT_ACTIVE_CHANGED', 'acc_accounts', p_account::text,
    jsonb_build_object('active', v_row.active), jsonb_build_object('active', p_active), 'acc_set_account_active');
end $$;
revoke execute on function public.acc_set_account_active(uuid,boolean) from public, anon;
grant  execute on function public.acc_set_account_active(uuid,boolean) to authenticated;

-- ─────────────────────────────────────────────
-- ٨ · الفترات — دوال الحالة (Parts C/M/N)
-- ─────────────────────────────────────────────
create or replace function public.acc_create_period(
  p_company uuid, p_fiscal_year text, p_start date, p_end date
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if public.acc_role(p_company) is distinct from 'ACCOUNTANT' then
    raise exception 'period management requires the ACCOUNTANT role in this company';
  end if;
  insert into public.acc_fiscal_periods (company_id, fiscal_year, start_date, end_date, created_by)
  values (p_company, p_fiscal_year, p_start, p_end, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'PERIOD_CREATED', 'acc_fiscal_periods', v_id::text,
    null, jsonb_build_object('fiscal_year', p_fiscal_year, 'start', p_start, 'end', p_end), 'acc_create_period');
  return v_id;
end $$;
revoke execute on function public.acc_create_period(uuid,text,date,date) from public, anon;
grant  execute on function public.acc_create_period(uuid,text,date,date) to authenticated;

-- الانتقالات البسيطة: FUTURE→OPEN · OPEN→SOFT_CLOSED · SOFT_CLOSED→OPEN
-- (فعل محاسبة موثق) · CLOSED→ARCHIVED — الإغلاق وإعادة الفتح لهما دالتاهما
create or replace function public.acc_transition_period(p_period uuid, p_new_state text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_fiscal_periods where id = p_period;
  if not found then raise exception 'unknown period'; end if;
  if public.acc_role(v_row.company_id) is distinct from 'ACCOUNTANT' then
    raise exception 'period transitions require the ACCOUNTANT role in this company';
  end if;
  if p_new_state in ('CLOSED','REOPENED') then
    raise exception 'closing uses acc_close_period and reopening uses acc_reopen_period';
  end if;
  perform set_config('acc.period_transition', v_row.id::text, true);
  update public.acc_fiscal_periods set state = p_new_state where id = p_period;
  perform set_config('acc.period_transition', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'PERIOD_STATE_CHANGED', 'acc_fiscal_periods', p_period::text,
    jsonb_build_object('state', v_row.state), jsonb_build_object('state', p_new_state), 'acc_transition_period');
end $$;
revoke execute on function public.acc_transition_period(uuid,text) from public, anon;
grant  execute on function public.acc_transition_period(uuid,text) to authenticated;

-- الإغلاق (SOFT_CLOSED→CLOSED أو REOPENED→CLOSED): يستشير موانع
-- ACC-024، يبني لقطة أرصدة تامة (نصوص وحدات صغرى) مع سياسات الشركة
-- المعتمدة السارية، ثم ينقل الحالة — ذريًا ومدققًا
create or replace function public.acc_close_period(p_period uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_row record; v_snapshot uuid;
  v_balances jsonb; v_policies jsonb; v_blockers integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_fiscal_periods where id = p_period;
  if not found then raise exception 'unknown period'; end if;
  if public.acc_role(v_row.company_id) is distinct from 'ACCOUNTANT' then
    raise exception 'closing a period requires the ACCOUNTANT role in this company';
  end if;
  if v_row.state not in ('SOFT_CLOSED','REOPENED') then
    raise exception 'only SOFT_CLOSED or REOPENED periods can close (period is %)', v_row.state;
  end if;
  select count(*) into v_blockers from public.acc_period_close_blockers(p_period);
  if v_blockers > 0 then
    raise exception 'period close blocked by unresolved critical exceptions (ACC-024)';
  end if;

  select coalesce(jsonb_object_agg(a.code, jsonb_build_object(
           'debit_minor',  t.debit::text,
           'credit_minor', t.credit::text)), '{}'::jsonb)
    into v_balances
  from (
    select l.account_id,
           sum(case when l.side = 'DEBIT'  then l.base_amount_minor else 0 end) as debit,
           sum(case when l.side = 'CREDIT' then l.base_amount_minor else 0 end) as credit
    from public.acc_journal_lines l
    join public.acc_journal_entries e on e.id = l.entry_id
    where e.period_id = p_period and e.status in ('POSTED','REVERSED')
    group by l.account_id
  ) t join public.acc_accounts a on a.id = t.account_id;

  select coalesce(jsonb_object_agg(p.policy_id, p.version), '{}'::jsonb) into v_policies
  from public.acc_policy_register p
  where p.company_id = v_row.company_id and p.status = 'APPROVED'
    and (p.effective_from is null or p.effective_from <= v_row.end_date)
    and (p.effective_to is null or v_row.end_date <= p.effective_to);

  insert into public.acc_close_snapshots (company_id, period_id, balances, policy_versions, actor_user_id)
  values (v_row.company_id, p_period, v_balances, v_policies, v_user)
  returning id into v_snapshot;

  perform set_config('acc.period_transition', v_row.id::text, true);
  update public.acc_fiscal_periods set state = 'CLOSED', closed_at = now() where id = p_period;
  perform set_config('acc.period_transition', '', true);

  perform public.acc_audit(v_row.company_id, v_user, 'PERIOD_CLOSED', 'acc_fiscal_periods', p_period::text,
    jsonb_build_object('state', v_row.state), jsonb_build_object('state', 'CLOSED', 'snapshot', v_snapshot), 'acc_close_period');
  return v_snapshot;
end $$;
revoke execute on function public.acc_close_period(uuid) from public, anon;
grant  execute on function public.acc_close_period(uuid) to authenticated;

-- شهادة إعادة فتح: الدور يُفحص في الشركة نفسها وقت الشهادة (is distinct from)
create or replace function public.acc_record_period_approval(
  p_period uuid, p_approval_role text, p_reason text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record; v_role text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication required — approvals are human acts'; end if;
  select * into v_row from public.acc_fiscal_periods where id = p_period;
  if not found then raise exception 'unknown period'; end if;
  v_role := public.acc_role(v_row.company_id);
  if p_approval_role = 'ACCOUNTANT' and v_role is distinct from 'ACCOUNTANT' then
    raise exception 'accountant approval requires the ACCOUNTANT role in this company (got %)', coalesce(v_role, 'none');
  end if;
  if p_approval_role = 'BUSINESS_OWNER' and v_role is distinct from 'BUSINESS_OWNER' then
    raise exception 'owner approval requires the BUSINESS_OWNER role in this company (got %)', coalesce(v_role, 'none');
  end if;
  insert into public.acc_period_approvals (period_id, company_id, approval_role, approver_user_id, reason)
  values (p_period, v_row.company_id, p_approval_role, v_user, p_reason)
  returning id into v_id;
  perform public.acc_audit(v_row.company_id, v_user, 'PERIOD_REOPEN_APPROVAL', 'acc_fiscal_periods', p_period::text,
    null, jsonb_build_object('approval_role', p_approval_role, 'reason', p_reason), 'acc_record_period_approval');
  return v_id;
end $$;
revoke execute on function public.acc_record_period_approval(uuid,text,text) from public, anon;
grant  execute on function public.acc_record_period_approval(uuid,text,text) to authenticated;

-- إعادة الفتح: إنسانان مختلفان (محاسبة + مالكة) بشهادتين بعد آخر إغلاق،
-- المحاسبة تنفذ، واللقطة السابقة باقية للأبد
create or replace function public.acc_reopen_period(p_period uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_row record;
  v_accountant uuid; v_owner uuid;
begin
  if v_user is null then raise exception 'authentication required — reopening is a human act'; end if;
  select * into v_row from public.acc_fiscal_periods where id = p_period;
  if not found then raise exception 'unknown period'; end if;
  if public.acc_role(v_row.company_id) is distinct from 'ACCOUNTANT' then
    raise exception 'the controlled reopen is performed by the ACCOUNTANT of this company';
  end if;
  if v_row.state <> 'CLOSED' then
    raise exception 'only CLOSED periods can be reopened (period is %)', v_row.state;
  end if;
  select approver_user_id into v_accountant from public.acc_period_approvals
  where period_id = p_period and approval_role = 'ACCOUNTANT'
    and created_at >= coalesce(v_row.closed_at, v_row.created_at) limit 1;
  if v_accountant is null then
    raise exception 'reopening requires a recorded ACCOUNTANT approval after the close';
  end if;
  select approver_user_id into v_owner from public.acc_period_approvals
  where period_id = p_period and approval_role = 'BUSINESS_OWNER'
    and created_at >= coalesce(v_row.closed_at, v_row.created_at)
    and approver_user_id <> v_accountant limit 1;
  if v_owner is null then
    raise exception 'reopening requires a distinct human BUSINESS_OWNER approval in addition to the ACCOUNTANT';
  end if;
  perform set_config('acc.period_transition', v_row.id::text, true);
  update public.acc_fiscal_periods set state = 'REOPENED' where id = p_period;
  perform set_config('acc.period_transition', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'PERIOD_REOPENED', 'acc_fiscal_periods', p_period::text,
    jsonb_build_object('state', 'CLOSED'), jsonb_build_object('state', 'REOPENED'), 'acc_reopen_period');
end $$;
revoke execute on function public.acc_reopen_period(uuid) from public, anon;
grant  execute on function public.acc_reopen_period(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · القيود — إنشاء وتحرير وتقديم (Parts D/E)
--     المبالغ تدخل نصوص وحدات صغرى — لا JS Number ماليًا أبدًا
-- ─────────────────────────────────────────────
create or replace function public.acc_insert_lines(p_entry uuid, p_company uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into public.acc_journal_lines
      (entry_id, company_id, account_id, side, amount_minor, currency,
       base_amount_minor, base_currency, tax_status, memo,
       fx_rate, fx_rate_date, fx_rate_source)
    values
      (p_entry, p_company, (l->>'account_id')::uuid, l->>'side',
       (l->>'amount_minor')::bigint, l->>'currency',
       (l->>'base_amount_minor')::bigint, l->>'base_currency',
       l->>'tax_status', l->>'memo',
       nullif(l->>'fx_rate','')::numeric, nullif(l->>'fx_rate_date','')::date,
       nullif(l->>'fx_rate_source',''));
  end loop;
end $$;
revoke execute on function public.acc_insert_lines(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.acc_create_manual_journal(
  p_company uuid, p_period uuid, p_entry_date date,
  p_description text, p_lines jsonb,
  p_kind text default 'STANDARD'
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_role text; v_source uuid; v_entry uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  v_role := public.acc_role(p_company);
  -- المحاسبة تنشئ وترحل؛ المدير المالي يجهز مسودة فقط (لا يرحّل)
  if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'manual journal drafts require ACCOUNTANT or FINANCE_MANAGER in this company (got %)', coalesce(v_role, 'none');
  end if;
  if p_kind not in ('STANDARD','OPENING','ADJUSTMENT') then
    raise exception 'manual journals are STANDARD, OPENING or ADJUSTMENT';
  end if;
  insert into public.acc_sources (company_id, kind, description, created_by)
  values (p_company, case when p_kind = 'OPENING' then 'OPENING' else 'MANUAL_JOURNAL' end,
          p_description, v_user)
  returning id into v_source;
  insert into public.acc_journal_entries
    (company_id, period_id, source_id, entry_date, description, kind, created_by)
  values (p_company, p_period, v_source, p_entry_date, p_description, p_kind, v_user)
  returning id into v_entry;
  perform public.acc_insert_lines(v_entry, p_company, p_lines);
  perform public.acc_audit(p_company, v_user, 'JOURNAL_DRAFT_CREATED', 'acc_journal_entries', v_entry::text,
    null, jsonb_build_object('kind', p_kind, 'lines', p_lines), 'acc_create_manual_journal');
  return v_entry;
end $$;
revoke execute on function public.acc_create_manual_journal(uuid,uuid,date,text,jsonb,text) from public, anon;
grant  execute on function public.acc_create_manual_journal(uuid,uuid,date,text,jsonb,text) to authenticated;

-- تحرير مسودة: استبدال كامل موثق قبل/بعد (تغييرات مالية جوهرية مدققة)
create or replace function public.acc_edit_draft(
  p_entry uuid, p_description text, p_entry_date date, p_period uuid, p_lines jsonb
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record; v_role text; v_before jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_journal_entries where id = p_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  v_role := public.acc_role(v_row.company_id);
  if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'draft editing requires ACCOUNTANT or FINANCE_MANAGER in this company';
  end if;
  if v_row.status <> 'DRAFT' then
    raise exception 'only DRAFT entries are editable (entry is %)', v_row.status;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', account_id, 'side', side,
    'amount_minor', amount_minor::text, 'currency', currency,
    'base_amount_minor', base_amount_minor::text, 'tax_status', tax_status)), '[]'::jsonb)
    into v_before from public.acc_journal_lines where entry_id = p_entry;
  delete from public.acc_journal_lines where entry_id = p_entry;
  update public.acc_journal_entries
     set description = p_description, entry_date = p_entry_date, period_id = p_period
   where id = p_entry;
  perform public.acc_insert_lines(p_entry, v_row.company_id, p_lines);
  perform public.acc_audit(v_row.company_id, v_user, 'JOURNAL_DRAFT_EDITED', 'acc_journal_entries', p_entry::text,
    jsonb_build_object('lines', v_before), jsonb_build_object('lines', p_lines), 'acc_edit_draft');
end $$;
revoke execute on function public.acc_edit_draft(uuid,text,date,uuid,jsonb) from public, anon;
grant  execute on function public.acc_edit_draft(uuid,text,date,uuid,jsonb) to authenticated;

create or replace function public.acc_submit_journal(p_entry uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record; v_role text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_journal_entries where id = p_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  v_role := public.acc_role(v_row.company_id);
  if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'submitting requires ACCOUNTANT or FINANCE_MANAGER in this company';
  end if;
  update public.acc_journal_entries set status = 'PENDING_APPROVAL' where id = p_entry;
  perform public.acc_audit(v_row.company_id, v_user, 'JOURNAL_SUBMITTED', 'acc_journal_entries', p_entry::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'PENDING_APPROVAL'), 'acc_submit_journal');
end $$;
revoke execute on function public.acc_submit_journal(uuid) from public, anon;
grant  execute on function public.acc_submit_journal(uuid) to authenticated;

create or replace function public.acc_discard_journal(p_entry uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record; v_role text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_journal_entries where id = p_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  v_role := public.acc_role(v_row.company_id);
  if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'discarding requires ACCOUNTANT or FINANCE_MANAGER in this company';
  end if;
  update public.acc_journal_entries set status = 'DISCARDED' where id = p_entry;
  perform public.acc_audit(v_row.company_id, v_user, 'JOURNAL_DISCARDED', 'acc_journal_entries', p_entry::text,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'DISCARDED'), 'acc_discard_journal');
end $$;
revoke execute on function public.acc_discard_journal(uuid) from public, anon;
grant  execute on function public.acc_discard_journal(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ١٠ · محرك الترحيل (Part G) — ذري، والفشل بلا أثر جزئي
-- ─────────────────────────────────────────────
-- التحققات المشتركة كاملة؛ يعيد شركة القيد. الاستدعاء داخل ترحيل
-- أو عكس فقط — أي فشل يرمي فيرتد كل شيء (atomicity من المعاملة).
create or replace function public.acc_assert_postable(p_entry uuid, p_is_reversal boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_row record; v_period record; v_source record;
  v_base char(3); v_lines integer;
  v_debit bigint; v_credit bigint; v_bad integer;
begin
  select * into v_row from public.acc_journal_entries where id = p_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  if v_row.status <> 'PENDING_APPROVAL' then
    raise exception 'only PENDING_APPROVAL entries can post (entry is %)', v_row.status;
  end if;

  select * into v_period from public.acc_fiscal_periods where id = v_row.period_id;
  if v_period.company_id <> v_row.company_id then
    raise exception 'entry period belongs to another company';
  end if;
  -- صلاحيات الفترة: OPEN للترحيل العادي؛ SOFT_CLOSED للتسويات والعكوس
  -- بفعل محاسبةٍ فقط؛ FUTURE/CLOSED/ARCHIVED مرفوضة دائمًا
  if v_period.state = 'OPEN' then null;
  elsif v_period.state = 'SOFT_CLOSED'
        and (p_is_reversal or v_row.kind in ('ADJUSTMENT','REVERSAL')) then null;
  else
    raise exception 'period % does not allow posting this entry (kind %)', v_period.state, v_row.kind;
  end if;
  if v_row.entry_date < v_period.start_date or v_row.entry_date > v_period.end_date then
    raise exception 'entry_date must lie inside its fiscal period';
  end if;

  select * into v_source from public.acc_sources where id = v_row.source_id;
  if v_source.company_id <> v_row.company_id then
    raise exception 'entry source belongs to another company';
  end if;

  select base_currency into v_base from public.acc_companies where id = v_row.company_id;

  select count(*) into v_lines from public.acc_journal_lines where entry_id = p_entry;
  if v_lines < 2 then
    raise exception 'a posted entry needs at least two meaningful lines';
  end if;
  select count(*) into v_bad from public.acc_journal_lines l
  left join public.acc_accounts a on a.id = l.account_id
  where l.entry_id = p_entry
    and (a.id is null or a.company_id <> v_row.company_id
         or not a.active or not a.postable
         or l.base_currency <> v_base);
  if v_bad > 0 then
    raise exception 'every line needs an active postable same-company account and the company base currency';
  end if;

  -- القيد المزدوج: تساوٍ **تام** بوحدات الأساس الصغرى — فلس واحد = رفض،
  -- ولا موازنة آلية ولا سطر تصحيح خفيًا أبدًا
  select coalesce(sum(case when side = 'DEBIT'  then base_amount_minor else 0 end), 0),
         coalesce(sum(case when side = 'CREDIT' then base_amount_minor else 0 end), 0)
    into v_debit, v_credit
  from public.acc_journal_lines where entry_id = p_entry;
  if v_debit <> v_credit then
    raise exception 'unbalanced entry rejected: debits % <> credits % (base minor units) — no auto-balancing exists',
      v_debit, v_credit;
  end if;
  if v_debit = 0 then
    raise exception 'an entry of zero value is meaningless';
  end if;

  -- سلامة FX (FIX 2): سطر بعملة أجنبية لا يمرر أساسًا اعتباطيًا —
  -- الأساس المخزن يجب أن يساوي **بالتمام** ناتج المعادلة الحتمية:
  --   amount_minor × rate_scaled × 10^base_unit / 10^(rate_scale + txn_unit)
  -- بتقريب HALF_UP الوحيد الموثق (نصف بعيدًا عن الصفر — يطابق
  -- DEFAULT_ROUNDING في money.ts convert حرفيًا؛ المبالغ هنا موجبة
  -- دائمًا فلا لبس إشارة). حساب صحيح تام عبر numeric بلا قسمة عائمة:
  -- div/mod على أعداد صحيحة. اختلافٌ بفلس = رفض؛ لا تصحيح آليًا أبدًا.
  declare
    v_fx record;
    v_txn_unit smallint; v_base_unit smallint;
    v_rate_scaled numeric; v_num numeric; v_den numeric; v_expected numeric;
  begin
    for v_fx in
      select l.id, l.amount_minor, l.base_amount_minor, l.currency, l.fx_rate
      from public.acc_journal_lines l
      where l.entry_id = p_entry and l.currency <> l.base_currency
    loop
      select minor_unit into v_txn_unit  from public.acc_currencies where code = v_fx.currency;
      select minor_unit into v_base_unit from public.acc_currencies where code = v_base;
      v_rate_scaled := (v_fx.fx_rate * 10000000000);          -- numeric(20,10) → صحيح تام
      v_num := v_fx.amount_minor::numeric * v_rate_scaled * (10::numeric ^ v_base_unit);
      v_den := 10::numeric ^ (10 + v_txn_unit);
      v_expected := div(v_num, v_den)
                    + case when 2 * mod(v_num, v_den) >= v_den then 1 else 0 end;
      if v_expected <> v_fx.base_amount_minor::numeric then
        raise exception 'FX base amount mismatch on line %: stored % but rate implies % (HALF_UP) — rejected, never auto-corrected',
          v_fx.id, v_fx.base_amount_minor, v_expected;
      end if;
    end loop;
  end;
  return v_row.company_id;
end $$;
revoke execute on function public.acc_assert_postable(uuid,boolean) from public, anon, authenticated;

create or replace function public.acc_post_journal(p_entry uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_company uuid;
begin
  if v_user is null then raise exception 'authentication required — posting is a human act'; end if;
  v_company := public.acc_assert_postable(p_entry, false);
  -- الترحيل فعل المحاسبة حصرًا — لا مالكة ولا مدير مالي ولا مدقق
  -- ولا موظف ولا read-only ولا أدمِن منصة ولا AI/SYSTEM
  if public.acc_role(v_company) is distinct from 'ACCOUNTANT' then
    raise exception 'posting requires the ACCOUNTANT role in this company';
  end if;
  perform set_config('acc.journal_posting', p_entry::text, true);
  update public.acc_journal_entries
     set status = 'POSTED', posted_at = now(), posted_by = v_user
   where id = p_entry;
  perform set_config('acc.journal_posting', '', true);
  perform public.acc_audit(v_company, v_user, 'JOURNAL_POSTED', 'acc_journal_entries', p_entry::text,
    jsonb_build_object('status', 'PENDING_APPROVAL'), jsonb_build_object('status', 'POSTED'), 'acc_post_journal');
end $$;
revoke execute on function public.acc_post_journal(uuid) from public, anon;
grant  execute on function public.acc_post_journal(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ١١ · محرك العكس (Part I)
-- ─────────────────────────────────────────────
create or replace function public.acc_reverse_journal(
  p_entry uuid, p_target_period uuid, p_reason text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_row record; v_target record;
  v_source uuid; v_reversal uuid;
begin
  if v_user is null then raise exception 'authentication required — reversal is a human act'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reversal requires a recorded reason';
  end if;
  select * into v_row from public.acc_journal_entries where id = p_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  if public.acc_role(v_row.company_id) is distinct from 'ACCOUNTANT' then
    raise exception 'reversal requires the ACCOUNTANT role in this company';
  end if;
  if v_row.status <> 'POSTED' then
    raise exception 'only POSTED entries can be reversed (entry is %)', v_row.status;
  end if;
  select * into v_target from public.acc_fiscal_periods where id = p_target_period;
  if v_target.company_id <> v_row.company_id then
    raise exception 'target period belongs to another company';
  end if;
  -- تاريخ مغلق لا يُعاد سرده: أصلٌ في فترة CLOSED/ARCHIVED يُعكس
  -- **قدمًا** في فترة سارية مع مرجع دائم للأصل — لا ترحيل للخلف
  if v_target.state in ('CLOSED','ARCHIVED','FUTURE') then
    raise exception 'the reversal must go to a currently postable period (target is %)', v_target.state;
  end if;

  insert into public.acc_sources (company_id, kind, reference, description, created_by)
  values (v_row.company_id, 'REVERSAL', p_entry::text, p_reason, v_user)
  returning id into v_source;

  insert into public.acc_journal_entries
    (company_id, period_id, source_id, entry_date, description, kind, reverses_entry_id, created_by)
  values (v_row.company_id, p_target_period,
          v_source, greatest(v_row.entry_date, v_target.start_date), -- داخل الفترة الهدف
          'عكس قيد: ' || coalesce(v_row.description, p_entry::text) || ' — ' || p_reason,
          'REVERSAL', p_entry, v_user)
  returning id into v_reversal;

  -- نسخ الأسطر معكوسة الجانب بمبالغها التامة وعملتيها وضريبتها وأدلة FX
  insert into public.acc_journal_lines
    (entry_id, company_id, account_id, side, amount_minor, currency,
     base_amount_minor, base_currency, tax_status, memo,
     fx_rate, fx_rate_date, fx_rate_source)
  select v_reversal, company_id, account_id,
         case when side = 'DEBIT' then 'CREDIT' else 'DEBIT' end,
         amount_minor, currency, base_amount_minor, base_currency,
         tax_status, memo, fx_rate, fx_rate_date, fx_rate_source
  from public.acc_journal_lines where entry_id = p_entry;

  -- ترحيل العكس بكامل تحققات المحرك — أي فشل يرد المعاملة كلها
  -- ويبقى الأصل POSTED بلا مساس
  update public.acc_journal_entries set status = 'PENDING_APPROVAL' where id = v_reversal;
  perform public.acc_assert_postable(v_reversal, true);
  perform set_config('acc.journal_posting', v_reversal::text, true);
  update public.acc_journal_entries
     set status = 'POSTED', posted_at = now(), posted_by = v_user
   where id = v_reversal;
  perform set_config('acc.journal_posting', '', true);

  -- الأصل → REVERSED فقط بعد نجاح ترحيل العكس
  perform set_config('acc.journal_reversal', p_entry::text, true);
  update public.acc_journal_entries set status = 'REVERSED', reversed_by_entry_id = v_reversal
   where id = p_entry;
  perform set_config('acc.journal_reversal', '', true);

  perform public.acc_audit(v_row.company_id, v_user, 'JOURNAL_REVERSED', 'acc_journal_entries', p_entry::text,
    jsonb_build_object('status', 'POSTED'),
    jsonb_build_object('status', 'REVERSED', 'reversal_entry', v_reversal, 'reason', p_reason),
    'acc_reverse_journal');
  return v_reversal;
end $$;
revoke execute on function public.acc_reverse_journal(uuid,uuid,text) from public, anon;
grant  execute on function public.acc_reverse_journal(uuid,uuid,text) to authenticated;

-- ─────────────────────────────────────────────
-- ١٢ · دفتر الأستاذ وميزان المراجعة (Parts J/K)
--     المبالغ تُعاد **نصوصًا** — لا تمر بأي JSON/JS Number أبدًا
-- ─────────────────────────────────────────────
create or replace function public.acc_general_ledger(
  p_account uuid, p_from date default null, p_to date default null
)
returns table (
  entry_date date, entry_id uuid, entry_status text, source_kind text,
  description text, side text, debit_minor text, credit_minor text,
  running_balance_minor text, base_currency char(3), posted_by uuid
)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_company uuid;
begin
  -- تخويل صريح في الدالة نفسها لا في إخفاء الواجهة (FIX 3):
  -- دفتر الأستاذ التقني للمحاسبة والمدقق حصرًا — المالكة محجوبة
  -- حتى تُبنى واجهة المالكة المشتقة صراحةً
  select company_id into v_company from public.acc_accounts where id = p_account;
  if v_company is null then raise exception 'unknown account'; end if;
  if public.acc_role(v_company) not in ('ACCOUNTANT','AUDITOR') then
    raise exception 'the technical general ledger requires ACCOUNTANT or AUDITOR in this company';
  end if;
  return query
  -- «آثار الترحيل المحاسبية فقط»: POSTED **وREVERSED** معًا — REVERSED
  -- تعني «قيد مرحّل عُكس لاحقًا» لا «يُستبعد من المحاسبة»؛ الأصل + عكسه
  -- المرحّل يصفّيان طبيعيًا عبر ميكانيكا القيود، والتاريخ لا يُمس
  select e.entry_date, e.id, e.status, s.kind, e.description, l.side,
         case when l.side = 'DEBIT'  then l.base_amount_minor::text else '0' end,
         case when l.side = 'CREDIT' then l.base_amount_minor::text else '0' end,
         (sum(case when l.side = 'DEBIT' then l.base_amount_minor else -l.base_amount_minor end)
            over (order by e.entry_date, e.posted_at, l.created_at, l.id))::text,
         l.base_currency, e.posted_by
  from public.acc_journal_lines l
  join public.acc_journal_entries e on e.id = l.entry_id
  join public.acc_sources s on s.id = e.source_id
  where l.account_id = p_account
    and e.status in ('POSTED','REVERSED')
    and (p_from is null or e.entry_date >= p_from)
    and (p_to   is null or e.entry_date <= p_to)
  order by e.entry_date, e.posted_at, l.created_at, l.id;
end $$;

create or replace function public.acc_trial_balance(
  p_company uuid, p_as_of date default null, p_period uuid default null
)
returns table (
  account_id uuid, account_code text, account_name text, account_type text,
  debit_minor text, credit_minor text, balance_minor text, base_currency char(3)
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  -- ميزان المراجعة تقرير مهني مسموح: محاسبة ومدقق ومدير مالي
  -- (التقارير المختارة في الـBlueprint) — المالكة والبقية محجوبون
  if public.acc_role(p_company) not in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER') then
    raise exception 'the trial balance requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER in this company';
  end if;
  return query
  -- آثار الترحيل المحاسبية فقط (POSTED + REVERSED) — التساوي التام
  -- مُثبت من نفس المجاميع الصحيحة، لا تقريب ولا سماحية
  select a.id, a.code, a.name, a.account_type,
         coalesce(sum(case when l.side = 'DEBIT'  then l.base_amount_minor else 0 end), 0)::text,
         coalesce(sum(case when l.side = 'CREDIT' then l.base_amount_minor else 0 end), 0)::text,
         coalesce(sum(case when l.side = 'DEBIT'  then l.base_amount_minor else -l.base_amount_minor end), 0)::text,
         max(l.base_currency)
  from public.acc_journal_lines l
  join public.acc_journal_entries e on e.id = l.entry_id
  join public.acc_accounts a on a.id = l.account_id
  where e.company_id = p_company
    and e.status in ('POSTED','REVERSED')
    and (p_as_of  is null or e.entry_date <= p_as_of)
    and (p_period is null or e.period_id = p_period)
  group by a.id, a.code, a.name, a.account_type
  order by a.code;
end $$;

-- تخويل الدالتين: للمسجلين (التحقق الدوري داخلهما) — لا anon
revoke execute on function public.acc_general_ledger(uuid,date,date) from public, anon;
grant  execute on function public.acc_general_ledger(uuid,date,date) to authenticated;
revoke execute on function public.acc_trial_balance(uuid,date,uuid) from public, anon;
grant  execute on function public.acc_trial_balance(uuid,date,uuid) to authenticated;
