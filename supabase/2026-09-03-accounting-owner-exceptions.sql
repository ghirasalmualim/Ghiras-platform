-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 11: EXCEPTIONS + OWNER UX (CORE)
-- (Git فقط — تُطبَّق يدويًا على ghiras-staging · PREVIEW بعد المراجعة)
--
-- المرجع الملزم: MASTER BLUEPRINT — صندوق الاستثناءات القانوني الواحد
-- + تصحيحات إذن التنفيذ (Stage 11):
--   C1: لا أصل FIXTURE إنتاجي — الأصول SOURCE_ADAPTER/HUMAN_DECISION
--       حصرًا، ونوعا Stage 13 (LARGE_UNUSUAL_EXPENSE/UNKNOWN_EXPENSE)
--       يرفضهما الاستيعاب بنيويًا: PENDING_STAGE_13.
--   C2: الاستثناء الواحد قد تدعمه عدة حقائق مصدرية —
--       acc_exception_source_links جدول مستقل مجمّد.
--   C3: issue_key على مستوى القضية الاقتصادية لا السطر.
--   C4: سجل تغطية المحوّلات acc_exception_ingestion_runs —
--       «لا استثناءات مفتوحة» ≠ «كل الفحوص اكتملت».
--   C5: لا NOTIFIED_STUB — لا حالة تسليم بلا بنية تسليم فعلية.
--   C6: CASH_ON_HAND غرض تعيين بشري محاسبي فقط — لا حساب مخترع.
--   ACK ≠ RESOLVE: التصديق حدث لا يغلق؛ استثناءات المال تُغلق
--   حصرًا بإثبات شفاء الحقيقة المصدرية (acc_exception_verify_cure).
--
-- صفر تعديل على حقائق Stages 1..10 (جداول Stage 11 فقط)، صفر قيود،
-- صفر AI، صفر QAYD/XBRL. كل تخويل fail-closed (coalesce(acc_role,'')).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ٠ · توسيع أغراض التعيين: CASH_ON_HAND (C6)
--     تعيين بشري من المحاسبة عبر acc_link_gl_account الموجودة —
--     نفس النمط السلطوي المجرّب؛ غياب التعيين لا يعني «صفر نقد»
--     أبدًا: بطاقة المالكة تفشل مغلقةً إلى NOT_CONFIGURED.
-- ─────────────────────────────────────────────
alter table public.acc_gl_account_links drop constraint if exists acc_gl_links_purpose_chk;
alter table public.acc_gl_account_links
  add constraint acc_gl_links_purpose_chk check (purpose in
    ('DEFERRED_REVENUE','GATEWAY_CLEARING','CASH_IN_TRANSIT',
     'GATEWAY_FEE_EXPENSE','CONTRA_REVENUE','UNIDENTIFIED_SETTLEMENT_DIFFERENCE',
     'EXPENSE_ACCOUNT','EXPENSE_PAYABLE','BANK_ACCOUNT','CASH_ON_HAND'));

-- ─────────────────────────────────────────────
-- ١ · سجل الأولوية الثابت — تصميم منتج لا يحرّره أي مستأجر
--     (الأولوية تُلقط على الصف وتُقفل بقيد CHECK على هذه الدالة)
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_priority(p_type text)
returns text
language sql immutable
as $$
  select case p_type
    when 'SETTLEMENT_DIFFERENCE'        then 'CRITICAL'
    when 'PERIOD_CLOSE_ISSUE'           then 'CRITICAL'
    when 'MISSING_WEBHOOK'              then 'CRITICAL'
    when 'UNMATCHED_BANK_TRANSACTION'   then 'ACTION_REQUIRED'
    when 'FAILED_REFUND'                then 'ACTION_REQUIRED'
    when 'LARGE_UNUSUAL_EXPENSE'        then 'ACTION_REQUIRED'
    when 'PERSONAL_BUSINESS_AMBIGUITY'  then 'ACTION_REQUIRED'
    when 'SUSPECTED_DUPLICATE'          then 'INFORMATIONAL'
    when 'UNKNOWN_EXPENSE'              then 'ROUTINE'
    when 'MISSING_DOCUMENT'             then 'ROUTINE'
  end
$$;
revoke execute on function public.acc_exception_priority(text) from public, anon;
grant  execute on function public.acc_exception_priority(text) to authenticated;

-- ─────────────────────────────────────────────
-- ٢ · صندوق الاستثناءات القانوني الواحد (C1/C3)
--     الصف يشير إلى الحقائق المصدرية ولا ينسخها كحقيقة؛ رسالة
--     المالكة مفاتيح مفردات مغلقة (لا نثر مهني يُخزَّن هنا أبدًا)
-- ─────────────────────────────────────────────
create table if not exists public.acc_exceptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.acc_companies(id),
  exception_type        text not null check (exception_type in
                          ('SETTLEMENT_DIFFERENCE','PERIOD_CLOSE_ISSUE','MISSING_WEBHOOK',
                           'UNMATCHED_BANK_TRANSACTION','FAILED_REFUND','LARGE_UNUSUAL_EXPENSE',
                           'PERSONAL_BUSINESS_AMBIGUITY','SUSPECTED_DUPLICATE',
                           'UNKNOWN_EXPENSE','MISSING_DOCUMENT')),
  -- الأولوية تصميم منتج مقفول — القيد يربطها بالسجل الثابت
  priority              text not null check (priority in
                          ('CRITICAL','ACTION_REQUIRED','INFORMATIONAL','ROUTINE')),
  state                 text not null default 'OPEN' check (state in
                          ('OPEN','IN_REVIEW','ESCALATED','RESOLVED')),
  -- هوية القضية الاقتصادية (C3): تسوية/فترة/حركة بنك/استرداد/مصروف —
  -- لا مفتاح على مستوى سطر حين تكون القضية أُمًّا
  issue_key             text not null check (btrim(issue_key) <> ''),
  -- C1: لا FIXTURE — أصلان محكومان فقط
  origin                text not null check (origin in ('SOURCE_ADAPTER','HUMAN_DECISION')),
  -- رسالة المالكة: مفاتيح مغلقة تُترجم في طبقة المفردات الواحدة —
  -- النمط يمنع تخزين نثرٍ أو مصطلح مهني في حقول المالكة
  owner_what_key        text not null check (owner_what_key ~ '^[A-Z0-9_]+$'),
  owner_why_key         text not null check (owner_why_key ~ '^[A-Z0-9_]+$'),
  owner_params          jsonb not null default '{}'::jsonb,
  occurrence            integer not null default 1 check (occurrence >= 1),
  first_detected_at     timestamptz not null default now(),
  last_detected_at      timestamptz not null default now(),
  acknowledged_at       timestamptz,
  acknowledged_by       uuid references auth.users(id),
  -- سلسلة التكرار: نفس القضية بعد حلٍّ حقيقي = صف جديد موصول
  previous_exception_id uuid references public.acc_exceptions(id),
  resolved_at           timestamptz,
  created_by_run        uuid,
  created_at            timestamptz not null default now(),
  check (priority = public.acc_exception_priority(exception_type)),
  check ((state = 'RESOLVED') = (resolved_at is not null))
);
-- قضية نشطة واحدة لكل مفتاح — التكرار بعد الحل صف جديد لا نسخة
create unique index if not exists acc_exceptions_active_issue
  on public.acc_exceptions (company_id, issue_key) where state <> 'RESOLVED';
create index if not exists acc_exceptions_company_state_idx
  on public.acc_exceptions (company_id, state, priority);

-- ─────────────────────────────────────────────
-- ٣ · روابط الحقائق المصدرية (C2) — مجمّدة، مغلقة الأنواع
-- ─────────────────────────────────────────────
create table if not exists public.acc_exception_source_links (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.acc_companies(id),
  exception_id uuid not null references public.acc_exceptions(id),
  source_kind  text not null check (source_kind in
                 ('SETTLEMENT','SETTLEMENT_LINE','MF_EVENT','MF_RECOVERY_RUN',
                  'BANK_TRANSACTION','BANK_DUPLICATE_CANDIDATE','RECON_EVENT',
                  'RECONCILIATION','REFUND','EXPENSE','DOCUMENT','FISCAL_PERIOD',
                  'PAYMENT','INVOICE')),
  source_id    uuid not null,
  source_role  text not null default 'EVIDENCE' check (source_role in
                 ('PRIMARY','EVIDENCE','CONTEXT')),
  created_by_run uuid,
  created_at   timestamptz not null default now(),
  unique (exception_id, source_kind, source_id, source_role)
);
-- حقيقة أولية واحدة بالضبط لكل استثناء
create unique index if not exists acc_exception_primary_one
  on public.acc_exception_source_links (exception_id) where source_role = 'PRIMARY';
create index if not exists acc_exception_links_exc_idx
  on public.acc_exception_source_links (exception_id);

-- ─────────────────────────────────────────────
-- ٤ · قرارات الحل — append-only؛ ACK ليس نوع حلّ أصلًا
--     DOMAIN_ACTION: مرجع فعل محكوم شافٍ (يُتحقق منه) — إلزامي
--     لاستثناءات المال. DECISION: جواب بشري هو الشفاء ذاته حيث
--     يسمح السجل (سبب كتابي إلزامي).
-- ─────────────────────────────────────────────
create table if not exists public.acc_exception_resolutions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.acc_companies(id),
  exception_id    uuid not null references public.acc_exceptions(id),
  action_key      text not null check (action_key ~ '^[A-Z0-9_]+$'),
  resolution_kind text not null check (resolution_kind in ('DOMAIN_ACTION','DECISION')),
  decision        jsonb not null default '{}'::jsonb,
  reason          text,
  domain_ref      uuid,
  resolved_by     uuid not null references auth.users(id),
  resolver_role   text not null check (resolver_role in
                    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')),
  created_at      timestamptz not null default now(),
  check ((resolution_kind = 'DOMAIN_ACTION') = (domain_ref is not null)),
  check (resolution_kind <> 'DECISION' or (reason is not null and btrim(reason) <> ''))
);
create index if not exists acc_exception_res_exc_idx
  on public.acc_exception_resolutions (exception_id);

-- ─────────────────────────────────────────────
-- ٥ · أحداث دورة الحياة — append-only، ولا NOTIFIED_STUB (C5):
--     إشعارٌ لم يُرسَل لا يُسجَّل كأنه أُرسل — Stage 11 Core
--     عرض داخل التطبيق فقط، وقبول الدفع الفعلي PENDING_INFRA.
-- ─────────────────────────────────────────────
create table if not exists public.acc_exception_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.acc_companies(id),
  exception_id uuid not null references public.acc_exceptions(id),
  event        text not null check (event in
                 ('SEEN','ACKNOWLEDGED','IN_REVIEW','ESCALATED','RESOLVED',
                  'RECURRENCE_LINKED','INGEST_REFRESHED','CURE_DETECTED')),
  actor        uuid references auth.users(id),
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists acc_exception_events_exc_idx
  on public.acc_exception_events (exception_id);

-- ─────────────────────────────────────────────
-- ٦ · جولات استيعاب المحوّلات (C4) — تفرقة «لا شيء مفتوح» عن
--     «ما أكملنا الفحوص»؛ failure_code رمز مغلق لا نص خطأ خام
-- ─────────────────────────────────────────────
create table if not exists public.acc_exception_ingestion_runs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.acc_companies(id),
  adapter_key     text not null check (adapter_key in
                    ('SETTLEMENT_DIFFERENCE','PERIOD_CLOSE','MISSING_WEBHOOK',
                     'UNMATCHED_BANK','FAILED_REFUND','EXPENSE_REVIEW',
                     'BANK_DUPLICATE','MISSING_DOCUMENT')),
  status          text not null default 'RUNNING' check (status in
                    ('RUNNING','SUCCEEDED','SUCCEEDED_NO_COVERAGE','FAILED')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  coverage_as_of  timestamptz,
  produced_count  integer not null default 0 check (produced_count >= 0),
  refreshed_count integer not null default 0 check (refreshed_count >= 0),
  failure_code    text check (failure_code is null or failure_code ~ '^[A-Z0-9_]+$'),
  initiated_by    uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  check ((status = 'RUNNING') = (completed_at is null)),
  check (status <> 'FAILED' or failure_code is not null)
);
create index if not exists acc_exception_runs_company_idx
  on public.acc_exception_ingestion_runs (company_id, adapter_key, started_at desc);

-- ─────────────────────────────────────────────
-- ٧ · إسناد لقطات لوحة المالكة — REP-007: لا رقم مجمّع بلا إسناد؛
--     التعريف الاستعلامي مفتاح نسخة مغلق لا نص SQL
-- ─────────────────────────────────────────────
create table if not exists public.acc_owner_snapshot_provenance (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.acc_companies(id),
  card_key      text not null check (card_key in
                  ('CASH_TODAY','PROFIT_MONTH','MONEY_IN_TRANSIT','RUNWAY',
                   'OBLIGATIONS','ATTENTION','MONEY_IN','MONEY_OUT','MONEY_AWAITED')),
  as_of         timestamptz not null,
  value_minor   bigint,
  value_scalar  numeric,
  currency      char(3) references public.acc_currencies(code),
  status        text not null check (status in
                  ('FINAL','PROVISIONAL','STALE','UNKNOWN','NOT_CONFIGURED')),
  query_def_key text not null check (query_def_key ~ '^[A-Z0-9_]+_V[0-9]+$'),
  query_params  jsonb not null default '{}'::jsonb,
  source_ids    jsonb not null default '[]'::jsonb,
  policy_refs   jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check (value_minor is null or currency is not null)
);
create index if not exists acc_owner_snap_company_idx
  on public.acc_owner_snapshot_provenance (company_id, card_key, as_of desc);

-- ─────────────────────────────────────────────
-- ٨ · إعدادات لوحة المالكة — نافذة الصمود تكوين مستأجر صريح
--     (لا افتراض مخترع: غيابها = بطاقة الصمود UNKNOWN)
-- ─────────────────────────────────────────────
create table if not exists public.acc_owner_settings (
  company_id         uuid primary key references public.acc_companies(id),
  runway_window_days integer check (runway_window_days is null or runway_window_days > 0),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id)
);

-- ─────────────────────────────────────────────
-- ٩ · الحرّاس البنيويون — المناعة في القاعدة لا في إخفاء الأزرار
-- ─────────────────────────────────────────────
-- الاستثناء: لا حذف أبدًا؛ التعديل عبر توقيع العملية فقط، والحقول
-- الهووية والأولوية مجمّدة؛ انتقالات الحالة الشرعية حصرًا؛
-- RESOLVED نهائية (التكرار صف جديد موصول لا إحياء)
create or replace function public.acc_exceptions_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_exceptions are never deleted — unresolved issues never expire';
  end if;
  if coalesce(current_setting('acc.exception_op', true), '') <> old.id::text then
    raise exception 'exception changes only through the signed exception operations';
  end if;
  if new.company_id            is distinct from old.company_id
     or new.exception_type     is distinct from old.exception_type
     or new.priority           is distinct from old.priority
     or new.issue_key          is distinct from old.issue_key
     or new.origin             is distinct from old.origin
     or new.owner_what_key     is distinct from old.owner_what_key
     or new.owner_why_key      is distinct from old.owner_why_key
     or new.occurrence         is distinct from old.occurrence
     or new.first_detected_at  is distinct from old.first_detected_at
     or new.previous_exception_id is distinct from old.previous_exception_id
     or new.created_by_run     is distinct from old.created_by_run
     or new.created_at         is distinct from old.created_at then
    raise exception 'exception identity, priority and detection history are immutable';
  end if;
  if new.state is distinct from old.state then
    if not ( (old.state = 'OPEN'      and new.state in ('IN_REVIEW','ESCALATED','RESOLVED'))
          or (old.state = 'IN_REVIEW' and new.state in ('ESCALATED','RESOLVED'))
          or (old.state = 'ESCALATED' and new.state = 'RESOLVED') ) then
      raise exception 'forbidden exception transition: % -> %', old.state, new.state;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_exceptions_guard_trg on public.acc_exceptions;
create trigger acc_exceptions_guard_trg
  before update or delete on public.acc_exceptions
  for each row execute function public.acc_exceptions_guard();

-- الروابط والقرارات والأحداث والإسناد: append-only مطلق
create or replace function public.acc_exception_frozen()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % refused', tg_table_name, tg_op;
end $$;
drop trigger if exists acc_exception_links_frozen on public.acc_exception_source_links;
create trigger acc_exception_links_frozen
  before update or delete on public.acc_exception_source_links
  for each row execute function public.acc_exception_frozen();
drop trigger if exists acc_exception_res_frozen on public.acc_exception_resolutions;
create trigger acc_exception_res_frozen
  before update or delete on public.acc_exception_resolutions
  for each row execute function public.acc_exception_frozen();
drop trigger if exists acc_exception_events_frozen on public.acc_exception_events;
create trigger acc_exception_events_frozen
  before update or delete on public.acc_exception_events
  for each row execute function public.acc_exception_frozen();
drop trigger if exists acc_owner_snap_frozen on public.acc_owner_snapshot_provenance;
create trigger acc_owner_snap_frozen
  before update or delete on public.acc_owner_snapshot_provenance
  for each row execute function public.acc_exception_frozen();

-- جولات الاستيعاب: لا حذف؛ الإتمام موقّع، والهوية مجمّدة،
-- والانتقال RUNNING → (نجاح/نجاح-بلا-تغطية/فشل) فقط
create or replace function public.acc_exception_runs_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_exception_ingestion_runs are never deleted — coverage history is evidence';
  end if;
  if coalesce(current_setting('acc.exception_run_op', true), '') <> old.id::text then
    raise exception 'ingestion run changes only through the signed completion operation';
  end if;
  if new.company_id     is distinct from old.company_id
     or new.adapter_key is distinct from old.adapter_key
     or new.started_at  is distinct from old.started_at
     or new.initiated_by is distinct from old.initiated_by
     or new.created_at  is distinct from old.created_at then
    raise exception 'ingestion run identity is immutable';
  end if;
  if old.status <> 'RUNNING' then
    raise exception 'a completed ingestion run is immutable';
  end if;
  return new;
end $$;
drop trigger if exists acc_exception_runs_guard_trg on public.acc_exception_ingestion_runs;
create trigger acc_exception_runs_guard_trg
  before update or delete on public.acc_exception_ingestion_runs
  for each row execute function public.acc_exception_runs_guard();

-- إعدادات المالكة: تغيير موقّع فقط، لا حذف
create or replace function public.acc_owner_settings_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_owner_settings are never deleted';
  end if;
  if coalesce(current_setting('acc.owner_settings_op', true), '') <> old.company_id::text then
    raise exception 'owner settings change only through the signed settings operation';
  end if;
  return new;
end $$;
drop trigger if exists acc_owner_settings_guard_trg on public.acc_owner_settings;
create trigger acc_owner_settings_guard_trg
  before update or delete on public.acc_owner_settings
  for each row execute function public.acc_owner_settings_guard();

-- ─────────────────────────────────────────────
-- ١٠ · RLS — القراءة بحسب الدور؛ كل الكتابة عبر الدوال الموقّعة
--      المالكة ترى صف الاستثناء (مفاتيح آمنة فقط بنيويًا)؛ الروابط
--      والقرارات والأحداث والجولات مهنية (ACC/FM/AUDITOR)
-- ─────────────────────────────────────────────
alter table public.acc_exceptions enable row level security;
create policy acc_exceptions_select on public.acc_exceptions
  for select using (public.acc_role(company_id) in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_exceptions from anon, authenticated;

alter table public.acc_exception_source_links enable row level security;
create policy acc_exception_links_select on public.acc_exception_source_links
  for select using (public.acc_role(company_id) in
    ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_exception_source_links from anon, authenticated;

alter table public.acc_exception_resolutions enable row level security;
create policy acc_exception_res_select on public.acc_exception_resolutions
  for select using (public.acc_role(company_id) in
    ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_exception_resolutions from anon, authenticated;

alter table public.acc_exception_events enable row level security;
create policy acc_exception_events_select on public.acc_exception_events
  for select using (public.acc_role(company_id) in
    ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_exception_events from anon, authenticated;

alter table public.acc_exception_ingestion_runs enable row level security;
create policy acc_exception_runs_select on public.acc_exception_ingestion_runs
  for select using (public.acc_role(company_id) in
    ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_exception_ingestion_runs from anon, authenticated;

alter table public.acc_owner_snapshot_provenance enable row level security;
create policy acc_owner_snap_select on public.acc_owner_snapshot_provenance
  for select using (public.acc_role(company_id) in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_owner_snapshot_provenance from anon, authenticated;

alter table public.acc_owner_settings enable row level security;
create policy acc_owner_settings_select on public.acc_owner_settings
  for select using (public.acc_role(company_id) in
    ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
revoke insert, update, delete on public.acc_owner_settings from anon, authenticated;

-- ─────────────────────────────────────────────
-- ١١ · تحقق الحقيقة المصدرية — وجود + نفس الشركة لكل نوع (C2)
--      داخلي: يُستدعى من دوال الاستيعاب المعرِّفة حصرًا
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_validate_source(
  p_company uuid, p_kind text, p_id uuid
)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare v_ok boolean;
begin
  if p_id is null then raise exception 'a source fact needs an id'; end if;
  case p_kind
    when 'SETTLEMENT' then
      select exists (select 1 from public.acc_settlements s
        where s.id = p_id and s.company_id = p_company) into v_ok;
    when 'SETTLEMENT_LINE' then
      select exists (select 1 from public.acc_settlement_lines sl
        where sl.id = p_id and sl.company_id = p_company) into v_ok;
    when 'MF_EVENT' then
      select exists (select 1 from public.acc_mf_events m
        where m.id = p_id and m.company_id = p_company) into v_ok;
    when 'MF_RECOVERY_RUN' then
      select exists (select 1 from public.acc_mf_recovery_runs rr
        where rr.id = p_id and rr.company_id = p_company) into v_ok;
    when 'BANK_TRANSACTION' then
      select exists (select 1 from public.acc_bank_transactions bt
        where bt.id = p_id and bt.company_id = p_company) into v_ok;
    when 'BANK_DUPLICATE_CANDIDATE' then
      select exists (select 1 from public.acc_bank_duplicate_candidates dc
        where dc.id = p_id and dc.company_id = p_company) into v_ok;
    when 'RECON_EVENT' then
      select exists (select 1 from public.acc_recon_events re
        where re.id = p_id and re.company_id = p_company) into v_ok;
    when 'RECONCILIATION' then
      select exists (select 1 from public.acc_reconciliations rc
        where rc.id = p_id and rc.company_id = p_company) into v_ok;
    when 'REFUND' then
      select exists (select 1 from public.acc_refunds rf
        where rf.id = p_id and rf.company_id = p_company) into v_ok;
    when 'EXPENSE' then
      select exists (select 1 from public.acc_expenses ex
        where ex.id = p_id and ex.company_id = p_company) into v_ok;
    when 'DOCUMENT' then
      select exists (select 1 from public.acc_documents dd
        where dd.id = p_id and dd.company_id = p_company) into v_ok;
    when 'FISCAL_PERIOD' then
      select exists (select 1 from public.acc_fiscal_periods fp
        where fp.id = p_id and fp.company_id = p_company) into v_ok;
    when 'PAYMENT' then
      select exists (select 1 from public.acc_payments pm
        where pm.id = p_id and pm.company_id = p_company) into v_ok;
    when 'INVOICE' then
      select exists (select 1 from public.acc_invoices iv
        where iv.id = p_id and iv.company_id = p_company) into v_ok;
    else
      raise exception 'unknown source kind %', p_kind;
  end case;
  if not v_ok then
    raise exception 'SOURCE_FACT_INVALID: % % does not exist in this company', p_kind, p_id;
  end if;
end $$;
revoke execute on function public.acc_exception_validate_source(uuid,text,uuid)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ١٢ · جولات الاستيعاب — خدمة فقط، بفاعل بشري مصرَّح (C4)
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_begin_ingestion(
  p_company uuid, p_actor uuid, p_adapter_key text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_role text;
begin
  if auth.uid() is not null then
    raise exception 'exception ingestion is a service-only pipeline';
  end if;
  if p_actor is null then raise exception 'ingestion needs the initiating human actor'; end if;
  v_role := coalesce(public.acc_role_of(p_company, p_actor), '');
  if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'ingestion requires BUSINESS_OWNER, ACCOUNTANT or FINANCE_MANAGER in this company';
  end if;
  insert into public.acc_exception_ingestion_runs (company_id, adapter_key, initiated_by)
  values (p_company, p_adapter_key, p_actor)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.acc_exception_begin_ingestion(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.acc_exception_begin_ingestion(uuid,uuid,text) to service_role;

create or replace function public.acc_exception_complete_ingestion(
  p_run uuid, p_status text, p_produced integer, p_refreshed integer,
  p_coverage timestamptz default null, p_failure_code text default null
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_run record;
begin
  if auth.uid() is not null then
    raise exception 'exception ingestion is a service-only pipeline';
  end if;
  select r.* into v_run from public.acc_exception_ingestion_runs r where r.id = p_run;
  if not found then raise exception 'unknown ingestion run'; end if;
  if p_status not in ('SUCCEEDED','SUCCEEDED_NO_COVERAGE','FAILED') then
    raise exception 'completion status must be SUCCEEDED, SUCCEEDED_NO_COVERAGE or FAILED';
  end if;
  perform set_config('acc.exception_run_op', p_run::text, true);
  update public.acc_exception_ingestion_runs r
     set status = p_status, completed_at = now(), coverage_as_of = p_coverage,
         produced_count = coalesce(p_produced, 0), refreshed_count = coalesce(p_refreshed, 0),
         failure_code = p_failure_code
   where r.id = p_run;
  perform set_config('acc.exception_run_op', '', true);
end $$;
revoke execute on function public.acc_exception_complete_ingestion(uuid,text,integer,integer,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.acc_exception_complete_ingestion(uuid,text,integer,integer,timestamptz,text) to service_role;

-- ─────────────────────────────────────────────
-- ١٣ · الاستيعاب — الهوية الاقتصادية idempotent (C3)، والتكرار
--      بعد الحل صف جديد موصول؛ نوعا Stage 13 يُرفضان بنيويًا (C1)
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_ingest(
  p_run uuid, p_type text, p_issue_key text,
  p_what_key text, p_why_key text, p_params jsonb,
  p_sources jsonb
)
returns table (exception_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_run record; v_existing record; v_prev record; v_id uuid; v_src jsonb;
  v_primary_count integer;
begin
  if auth.uid() is not null then
    raise exception 'exception ingestion is a service-only pipeline';
  end if;
  select r.* into v_run from public.acc_exception_ingestion_runs r where r.id = p_run;
  if not found then raise exception 'unknown ingestion run'; end if;
  if v_run.status <> 'RUNNING' then
    raise exception 'ingestion requires a RUNNING run';
  end if;
  -- C1: لا تصنيع صف إنتاجي لنوع بلا كاشف إنتاجي — القيد بنيوي هنا
  if p_type in ('LARGE_UNUSUAL_EXPENSE','UNKNOWN_EXPENSE') then
    raise exception 'PENDING_STAGE_13: % has no production detector yet — refusing to manufacture a production exception', p_type;
  end if;
  if public.acc_exception_priority(p_type) is null then
    raise exception 'unknown exception type %', p_type;
  end if;

  -- القضية النشطة (الفهرس الجزئي يضمن ≤ 1): تحديث الرصد لا صف جديد
  select e.* into v_existing from public.acc_exceptions e
   where e.company_id = v_run.company_id and e.issue_key = p_issue_key
     and e.state <> 'RESOLVED';
  if found then
    if v_existing.exception_type <> p_type then
      raise exception 'issue key % is already claimed by type %', p_issue_key, v_existing.exception_type;
    end if;
    perform set_config('acc.exception_op', v_existing.id::text, true);
    update public.acc_exceptions e set last_detected_at = now()
     where e.id = v_existing.id;
    perform set_config('acc.exception_op', '', true);
    -- أدلة جديدة قد تنضاف للقضية نفسها — بلا PRIMARY ثانٍ بنيويًا
    for v_src in select x.val from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) as x(val) loop
      if coalesce(v_src->>'role', 'EVIDENCE') <> 'PRIMARY' then
        perform public.acc_exception_validate_source(
          v_run.company_id, v_src->>'kind', (v_src->>'id')::uuid);
        insert into public.acc_exception_source_links
          (company_id, exception_id, source_kind, source_id, source_role, created_by_run)
        values (v_run.company_id, v_existing.id, v_src->>'kind', (v_src->>'id')::uuid,
                coalesce(v_src->>'role', 'EVIDENCE'), p_run)
        on conflict (exception_id, source_kind, source_id, source_role) do nothing;
      end if;
    end loop;
    insert into public.acc_exception_events (company_id, exception_id, event, detail)
    values (v_run.company_id, v_existing.id, 'INGEST_REFRESHED',
            jsonb_build_object('run_id', p_run));
    return query select v_existing.id, 'REFRESHED'::text;
    return;
  end if;

  -- سلسلة التكرار: آخر صف محلول بنفس المفتاح إن وُجد
  select e.* into v_prev from public.acc_exceptions e
   where e.company_id = v_run.company_id and e.issue_key = p_issue_key
     and e.state = 'RESOLVED'
   order by e.resolved_at desc limit 1;

  insert into public.acc_exceptions
    (company_id, exception_type, priority, issue_key, origin,
     owner_what_key, owner_why_key, owner_params,
     occurrence, previous_exception_id, created_by_run)
  values
    (v_run.company_id, p_type, public.acc_exception_priority(p_type), p_issue_key,
     'SOURCE_ADAPTER', p_what_key, p_why_key, coalesce(p_params, '{}'::jsonb),
     case when v_prev.id is null then 1 else v_prev.occurrence + 1 end,
     v_prev.id, p_run)
  returning id into v_id;

  for v_src in select x.val from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) as x(val) loop
    perform public.acc_exception_validate_source(
      v_run.company_id, v_src->>'kind', (v_src->>'id')::uuid);
    insert into public.acc_exception_source_links
      (company_id, exception_id, source_kind, source_id, source_role, created_by_run)
    values (v_run.company_id, v_id, v_src->>'kind', (v_src->>'id')::uuid,
            coalesce(v_src->>'role', 'EVIDENCE'), p_run)
    on conflict (exception_id, source_kind, source_id, source_role) do nothing;
  end loop;
  select count(*) into v_primary_count from public.acc_exception_source_links l
   where l.exception_id = v_id and l.source_role = 'PRIMARY';
  if v_primary_count <> 1 then
    raise exception 'every exception needs exactly one PRIMARY source fact (got %)', v_primary_count;
  end if;

  if v_prev.id is not null then
    insert into public.acc_exception_events (company_id, exception_id, event, detail)
    values (v_run.company_id, v_id, 'RECURRENCE_LINKED',
            jsonb_build_object('previous_exception_id', v_prev.id, 'occurrence',
                               v_prev.occurrence + 1));
    perform public.acc_audit(v_run.company_id, null, 'EXCEPTION_RECURRED', 'acc_exceptions',
      v_id::text, jsonb_build_object('previous_exception_id', v_prev.id),
      jsonb_build_object('exception_type', p_type, 'issue_key', p_issue_key),
      'acc_exception_ingest');
    return query select v_id, 'RECURRED'::text;
    return;
  end if;
  perform public.acc_audit(v_run.company_id, null, 'EXCEPTION_RAISED', 'acc_exceptions',
    v_id::text, null,
    jsonb_build_object('exception_type', p_type, 'issue_key', p_issue_key,
                       'priority', public.acc_exception_priority(p_type)),
    'acc_exception_ingest');
  return query select v_id, 'CREATED'::text;
end $$;
revoke execute on function public.acc_exception_ingest(uuid,text,text,text,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.acc_exception_ingest(uuid,text,text,text,text,jsonb,jsonb) to service_role;

-- ─────────────────────────────────────────────
-- ١٤ · دورة الحياة البشرية — SEEN/ACK/IN_REVIEW/ESCALATE
--      ACK ≠ RESOLVE بنيويًا: التصديق لا يلمس الحالة أبدًا
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_mark_seen(p_exception uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exc record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  if coalesce(public.acc_role(v_exc.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR') then
    raise exception 'viewing exceptions requires an accounting role in this company';
  end if;
  insert into public.acc_exception_events (company_id, exception_id, event, actor)
  values (v_exc.company_id, p_exception, 'SEEN', v_user);
end $$;
revoke execute on function public.acc_exception_mark_seen(uuid) from public, anon;
grant  execute on function public.acc_exception_mark_seen(uuid) to authenticated;

create or replace function public.acc_exception_acknowledge(p_exception uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exc record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  if coalesce(public.acc_role(v_exc.company_id), '') not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'acknowledging requires BUSINESS_OWNER, ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_exc.state = 'RESOLVED' then
    raise exception 'a resolved exception is history — nothing to acknowledge';
  end if;
  if v_exc.acknowledged_at is not null then
    return;  -- التصديق idempotent
  end if;
  -- التصديق **لا يغيّر الحالة** — عِلمٌ موثَّق فقط، والقضية تبقى مفتوحة
  perform set_config('acc.exception_op', p_exception::text, true);
  update public.acc_exceptions e
     set acknowledged_at = now(), acknowledged_by = v_user
   where e.id = p_exception;
  perform set_config('acc.exception_op', '', true);
  insert into public.acc_exception_events (company_id, exception_id, event, actor)
  values (v_exc.company_id, p_exception, 'ACKNOWLEDGED', v_user);
  perform public.acc_audit(v_exc.company_id, v_user, 'EXCEPTION_ACKNOWLEDGED', 'acc_exceptions',
    p_exception::text, null, jsonb_build_object('state_unchanged', v_exc.state),
    'acc_exception_acknowledge');
end $$;
revoke execute on function public.acc_exception_acknowledge(uuid) from public, anon;
grant  execute on function public.acc_exception_acknowledge(uuid) to authenticated;

create or replace function public.acc_exception_set_in_review(p_exception uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exc record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  if coalesce(public.acc_role(v_exc.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'review requires ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_exc.state <> 'OPEN' then
    raise exception 'only OPEN exceptions enter review (exception is %)', v_exc.state;
  end if;
  perform set_config('acc.exception_op', p_exception::text, true);
  update public.acc_exceptions e set state = 'IN_REVIEW' where e.id = p_exception;
  perform set_config('acc.exception_op', '', true);
  insert into public.acc_exception_events (company_id, exception_id, event, actor)
  values (v_exc.company_id, p_exception, 'IN_REVIEW', v_user);
end $$;
revoke execute on function public.acc_exception_set_in_review(uuid) from public, anon;
grant  execute on function public.acc_exception_set_in_review(uuid) to authenticated;

create or replace function public.acc_exception_escalate(p_exception uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exc record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'escalation needs a written reason';
  end if;
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  if coalesce(public.acc_role(v_exc.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'escalation requires ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_exc.state not in ('OPEN','IN_REVIEW') then
    raise exception 'only OPEN or IN_REVIEW exceptions escalate (exception is %)', v_exc.state;
  end if;
  perform set_config('acc.exception_op', p_exception::text, true);
  update public.acc_exceptions e set state = 'ESCALATED' where e.id = p_exception;
  perform set_config('acc.exception_op', '', true);
  insert into public.acc_exception_events (company_id, exception_id, event, actor, detail)
  values (v_exc.company_id, p_exception, 'ESCALATED', v_user,
          jsonb_build_object('reason', p_reason));
  perform public.acc_audit(v_exc.company_id, v_user, 'EXCEPTION_ESCALATED', 'acc_exceptions',
    p_exception::text, null, jsonb_build_object('reason', p_reason), 'acc_exception_escalate');
end $$;
revoke execute on function public.acc_exception_escalate(uuid,text) from public, anon;
grant  execute on function public.acc_exception_escalate(uuid,text) to authenticated;

-- ─────────────────────────────────────────────
-- ١٥ · إثبات شفاء الحقيقة المصدرية — لكل نوع تحققه الحتمي؛
--      الغياب = DOMAIN_CURE_NOT_PROVEN ولا إغلاق (داخلي)
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_verify_cure(p_exception uuid, p_domain_ref uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_exc record; v_primary record; v_residual bigint; v_state text;
  v_open_critical integer; v_ok boolean;
begin
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  select l.* into v_primary from public.acc_exception_source_links l
   where l.exception_id = p_exception and l.source_role = 'PRIMARY';
  if not found then raise exception 'exception has no PRIMARY source fact'; end if;

  case v_exc.exception_type
    when 'SETTLEMENT_DIFFERENCE' then
      -- الشفاء الوحيد المحكوم اليوم: سطر تصحيح من المزوّد عبر
      -- acc_add_settlement_line يجعل مجموع (gross−fee−net) صفرًا.
      -- لا ترحيل رسوم (BLK-004 مفتوح) — لا مسار «ابتلاع» بديلًا.
      if p_domain_ref is distinct from v_primary.source_id then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the settlement itself';
      end if;
      select coalesce(sum(sl.gross_minor - sl.fee_minor - sl.net_minor), 0) into v_residual
      from public.acc_settlement_lines sl where sl.settlement_id = v_primary.source_id;
      if v_residual <> 0 then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: settlement residual is still % minor units', v_residual;
      end if;
    when 'PERIOD_CLOSE_ISSUE' then
      if p_domain_ref is distinct from v_primary.source_id then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the fiscal period itself';
      end if;
      select fp.state into v_state from public.acc_fiscal_periods fp
       where fp.id = v_primary.source_id;
      select count(*) into v_open_critical from public.acc_exceptions e
       where e.company_id = v_exc.company_id and e.state <> 'RESOLVED'
         and e.priority = 'CRITICAL' and e.exception_type <> 'PERIOD_CLOSE_ISSUE'
         and e.id <> p_exception;
      if v_state = 'SOFT_CLOSED' and v_open_critical > 0 then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the period is still SOFT_CLOSED with % open critical exceptions', v_open_critical;
      end if;
    when 'MISSING_WEBHOOK' then
      if p_domain_ref is distinct from v_primary.source_id then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the recovered provider event';
      end if;
      select m.processing_state into v_state from public.acc_mf_events m
       where m.id = v_primary.source_id;
      if coalesce(v_state, '') not in ('CONFIRMED','APPLIED','IGNORED') then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the recovered event is still % — not yet processed', coalesce(v_state, 'missing');
      end if;
    when 'UNMATCHED_BANK_TRANSACTION' then
      -- شفاءان محكومان: مطابقة مؤكدة/مقفلة تستهلك الحركة، أو حسم
      -- «تكرار» عبر Stage 10 لمرشحها
      select exists (
        select 1 from public.acc_recon_allocations a
        join public.acc_reconciliations rc on rc.id = a.reconciliation_id
        where a.reconciliation_id = p_domain_ref
          and a.bank_transaction_id = v_primary.source_id
          and rc.state in ('CONFIRMED','LOCKED')
          and rc.company_id = v_exc.company_id) into v_ok;
      if not v_ok then
        select exists (
          select 1 from public.acc_recon_duplicate_resolutions dr
          join public.acc_bank_duplicate_candidates dc on dc.id = dr.candidate_id
          where dr.candidate_id = p_domain_ref
            and dc.transaction_id = v_primary.source_id
            and dr.decision = 'DUPLICATE'
            and dr.company_id = v_exc.company_id) into v_ok;
      end if;
      if not v_ok then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: no CONFIRMED/LOCKED reconciliation nor DUPLICATE resolution covers this bank transaction';
      end if;
    when 'FAILED_REFUND' then
      if p_domain_ref is distinct from v_primary.source_id then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the refund itself';
      end if;
      select rf.status into v_state from public.acc_refunds rf
       where rf.id = v_primary.source_id;
      if coalesce(v_state, 'FAILED') = 'FAILED' then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the refund is still FAILED — retry or cancel it through the signed refund operations first';
      end if;
    when 'PERSONAL_BUSINESS_AMBIGUITY' then
      if p_domain_ref is distinct from v_primary.source_id then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the expense itself';
      end if;
      select ex.state into v_state from public.acc_expenses ex
       where ex.id = v_primary.source_id;
      if coalesce(v_state, 'NEEDS_REVIEW') = 'NEEDS_REVIEW' then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: the expense is still NEEDS_REVIEW — resolve it through acc_resolve_expense_review first';
      end if;
    when 'SUSPECTED_DUPLICATE' then
      if v_primary.source_kind = 'EXPENSE' then
        if p_domain_ref is distinct from v_primary.source_id then
          raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the expense itself';
        end if;
        select ex.state into v_state from public.acc_expenses ex
         where ex.id = v_primary.source_id;
        if coalesce(v_state, 'NEEDS_REVIEW') = 'NEEDS_REVIEW' then
          raise exception 'DOMAIN_CURE_NOT_PROVEN: the expense is still NEEDS_REVIEW';
        end if;
      else
        if p_domain_ref is distinct from v_primary.source_id then
          raise exception 'DOMAIN_CURE_NOT_PROVEN: the cure reference must be the duplicate candidate itself';
        end if;
        select exists (select 1 from public.acc_recon_duplicate_resolutions dr
          where dr.candidate_id = v_primary.source_id) into v_ok;
        if not v_ok then
          raise exception 'DOMAIN_CURE_NOT_PROVEN: the duplicate candidate has no Stage 10 resolution yet';
        end if;
      end if;
    when 'MISSING_DOCUMENT' then
      select exists (
        select 1 from public.acc_document_links dl
        join public.acc_documents dd on dd.id = dl.document_id
        where dl.document_id = p_domain_ref
          and dl.target_kind = 'EXPENSE' and dl.target_id = v_primary.source_id
          and dd.state = 'FINALIZED') into v_ok;
      if not v_ok then
        raise exception 'DOMAIN_CURE_NOT_PROVEN: no FINALIZED document is linked to this record under that reference';
      end if;
    when 'LARGE_UNUSUAL_EXPENSE' then
      raise exception 'PENDING_STAGE_13: this type has no production path yet';
    when 'UNKNOWN_EXPENSE' then
      raise exception 'PENDING_STAGE_13: this type has no production path yet';
  end case;
end $$;
revoke execute on function public.acc_exception_verify_cure(uuid,uuid)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ١٦ · الحل — مصفوفة نوع×دور مغلقة، مفاتيح أفعال مغلقة، ولا
--      RESOLVE_ANY: استثناءات المال DOMAIN_ACTION مُثبت الشفاء
--      حصرًا؛ DECISION حيث الجواب البشري هو الشفاء ذاته فقط
-- ─────────────────────────────────────────────
create or replace function public.acc_exception_resolve(
  p_exception uuid, p_action_key text, p_kind text,
  p_reason text default null, p_decision jsonb default '{}'::jsonb,
  p_domain_ref uuid default null
)
returns table (resolution_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_exc record; v_role text; v_res uuid;
  v_primary record; v_allowed_actions text[]; v_last record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select e.* into v_exc from public.acc_exceptions e where e.id = p_exception;
  if not found then raise exception 'unknown exception'; end if;
  v_role := coalesce(public.acc_role(v_exc.company_id), '');

  if v_exc.state = 'RESOLVED' then
    select r.* into v_last from public.acc_exception_resolutions r
     where r.exception_id = p_exception order by r.created_at desc limit 1;
    return query select v_last.id, 'ALREADY_RESOLVED'::text;
    return;
  end if;

  select l.* into v_primary from public.acc_exception_source_links l
   where l.exception_id = p_exception and l.source_role = 'PRIMARY';
  if not found then raise exception 'exception has no PRIMARY source fact'; end if;

  -- مصفوفة النوع: الأدوار والأنواع والمفاتيح المسموحة — مغلقة هنا،
  -- ولا اسم دالة ولا SQL يصل من العميل بأي صورة
  case v_exc.exception_type
    when 'SETTLEMENT_DIFFERENCE' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a money condition resolves only by a proven domain cure'; end if;
      if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
        raise exception 'resolving a settlement difference requires ACCOUNTANT or FINANCE_MANAGER';
      end if;
      v_allowed_actions := array['PROVIDER_CORRECTION_RECORDED'];
    when 'PERIOD_CLOSE_ISSUE' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a money condition resolves only by a proven domain cure'; end if;
      if v_role <> 'ACCOUNTANT' then
        raise exception 'resolving a period close issue requires ACCOUNTANT';
      end if;
      v_allowed_actions := array['PERIOD_STATE_ADVANCED'];
    when 'MISSING_WEBHOOK' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a money condition resolves only by a proven domain cure'; end if;
      if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
        raise exception 'resolving a missing webhook requires ACCOUNTANT or FINANCE_MANAGER';
      end if;
      v_allowed_actions := array['RECOVERED_EVENT_PROCESSED'];
    when 'UNMATCHED_BANK_TRANSACTION' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a money condition resolves only by a proven domain cure'; end if;
      if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
        raise exception 'resolving an unmatched bank transaction requires ACCOUNTANT or FINANCE_MANAGER';
      end if;
      v_allowed_actions := array['RECONCILIATION_CONFIRMED','MARKED_DUPLICATE'];
    when 'FAILED_REFUND' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a money condition resolves only by a proven domain cure'; end if;
      if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
        raise exception 'resolving a failed refund requires ACCOUNTANT or FINANCE_MANAGER';
      end if;
      v_allowed_actions := array['REFUND_RETRIED','REFUND_CANCELLED'];
    when 'PERSONAL_BUSINESS_AMBIGUITY' then
      -- جواب المالكة يشفي عبر acc_resolve_expense_review المحكومة
      -- التي تسمح لها أصلًا — لا توسيع صلاحية هنا
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'the answer cures through the governed expense review — a domain cure is required'; end if;
      if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
        raise exception 'resolving an ambiguity requires BUSINESS_OWNER, ACCOUNTANT or FINANCE_MANAGER';
      end if;
      v_allowed_actions := array['REVIEW_RESOLVED'];
    when 'SUSPECTED_DUPLICATE' then
      if p_kind <> 'DOMAIN_ACTION' then raise exception 'a duplicate resolves only through its governed domain path'; end if;
      if v_primary.source_kind = 'EXPENSE' then
        if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
          raise exception 'resolving an expense duplicate requires BUSINESS_OWNER, ACCOUNTANT or FINANCE_MANAGER';
        end if;
        v_allowed_actions := array['REVIEW_RESOLVED'];
      else
        -- مرآة بوابة Stage 10 حرفيًا: لا توسيع للمالكة لأجل UX-011
        if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
          raise exception 'resolving a bank duplicate requires ACCOUNTANT or FINANCE_MANAGER (Stage 10 gate)';
        end if;
        v_allowed_actions := array['MARKED_DISTINCT','MARKED_DUPLICATE'];
      end if;
    when 'MISSING_DOCUMENT' then
      if p_kind = 'DOMAIN_ACTION' then
        if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER') then
          raise exception 'attaching evidence requires BUSINESS_OWNER, ACCOUNTANT or FINANCE_MANAGER';
        end if;
        v_allowed_actions := array['DOCUMENT_ATTACHED'];
      elsif p_kind = 'DECISION' then
        if v_role not in ('ACCOUNTANT','FINANCE_MANAGER') then
          raise exception 'a reasoned no-document decision requires ACCOUNTANT or FINANCE_MANAGER';
        end if;
        v_allowed_actions := array['NO_DOCUMENT_REASONED'];
      else
        raise exception 'resolution kind is DOMAIN_ACTION or DECISION';
      end if;
    when 'LARGE_UNUSUAL_EXPENSE' then
      raise exception 'PENDING_STAGE_13: this type has no production path yet';
    when 'UNKNOWN_EXPENSE' then
      raise exception 'PENDING_STAGE_13: this type has no production path yet';
  end case;

  if p_action_key is null or not (p_action_key = any (v_allowed_actions)) then
    raise exception 'action % is not in the closed action set for %', coalesce(p_action_key, '(null)'), v_exc.exception_type;
  end if;
  if p_kind = 'DOMAIN_ACTION' then
    if p_domain_ref is null then
      raise exception 'a domain cure needs its governed reference';
    end if;
    perform public.acc_exception_verify_cure(p_exception, p_domain_ref);
  end if;
  if p_kind = 'DECISION' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'a decision resolution needs a written reason';
  end if;

  insert into public.acc_exception_resolutions
    (company_id, exception_id, action_key, resolution_kind, decision, reason,
     domain_ref, resolved_by, resolver_role)
  values
    (v_exc.company_id, p_exception, p_action_key, p_kind,
     coalesce(p_decision, '{}'::jsonb), p_reason, p_domain_ref, v_user, v_role)
  returning id into v_res;

  perform set_config('acc.exception_op', p_exception::text, true);
  update public.acc_exceptions e
     set state = 'RESOLVED', resolved_at = now()
   where e.id = p_exception;
  perform set_config('acc.exception_op', '', true);

  insert into public.acc_exception_events (company_id, exception_id, event, actor, detail)
  values (v_exc.company_id, p_exception, 'RESOLVED', v_user,
          jsonb_build_object('action_key', p_action_key, 'resolution_kind', p_kind));
  perform public.acc_audit(v_exc.company_id, v_user, 'EXCEPTION_RESOLVED', 'acc_exceptions',
    p_exception::text, jsonb_build_object('state', v_exc.state),
    jsonb_build_object('action_key', p_action_key, 'resolution_kind', p_kind,
                       'domain_ref', p_domain_ref),
    'acc_exception_resolve');
  return query select v_res, 'RESOLVED'::text;
end $$;
revoke execute on function public.acc_exception_resolve(uuid,text,text,text,jsonb,uuid) from public, anon;
grant  execute on function public.acc_exception_resolve(uuid,text,text,text,jsonb,uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ١٧ · إعدادات المالكة — نافذة الصمود: تكوين محاسبي صريح مدقَّق
-- ─────────────────────────────────────────────
create or replace function public.acc_owner_set_runway_window(p_company uuid, p_days integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') <> 'ACCOUNTANT' then
    raise exception 'configuring the runway window requires the ACCOUNTANT role';
  end if;
  if p_days is not null and p_days <= 0 then
    raise exception 'the runway window must be a positive number of days';
  end if;
  perform set_config('acc.owner_settings_op', p_company::text, true);
  insert into public.acc_owner_settings (company_id, runway_window_days, updated_at, updated_by)
  values (p_company, p_days, now(), v_user)
  on conflict (company_id) do update
    set runway_window_days = excluded.runway_window_days,
        updated_at = now(), updated_by = excluded.updated_by;
  perform set_config('acc.owner_settings_op', '', true);
  perform public.acc_audit(p_company, v_user, 'OWNER_RUNWAY_WINDOW_SET', 'acc_owner_settings',
    p_company::text, null, jsonb_build_object('runway_window_days', p_days),
    'acc_owner_set_runway_window');
end $$;
revoke execute on function public.acc_owner_set_runway_window(uuid,integer) from public, anon;
grant  execute on function public.acc_owner_set_runway_window(uuid,integer) to authenticated;

-- ─────────────────────────────────────────────
-- ١٨ · تسجيل إسناد اللقطة — خدمة فقط بفاعل بشري مصرَّح (REP-007..009)
-- ─────────────────────────────────────────────
create or replace function public.acc_owner_record_snapshot(
  p_company uuid, p_actor uuid, p_card_key text, p_as_of timestamptz,
  p_value_minor bigint, p_value_scalar numeric, p_currency char(3),
  p_status text, p_query_def text, p_params jsonb, p_sources jsonb,
  p_policies jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_role text;
begin
  if auth.uid() is not null then
    raise exception 'snapshot provenance is recorded by the service pipeline only';
  end if;
  if p_actor is null then raise exception 'snapshot needs the initiating human actor'; end if;
  v_role := coalesce(public.acc_role_of(p_company, p_actor), '');
  if v_role not in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER','AUDITOR') then
    raise exception 'snapshot recording requires an accounting role in this company';
  end if;
  insert into public.acc_owner_snapshot_provenance
    (company_id, card_key, as_of, value_minor, value_scalar, currency, status,
     query_def_key, query_params, source_ids, policy_refs, created_by)
  values
    (p_company, p_card_key, p_as_of, p_value_minor, p_value_scalar, p_currency, p_status,
     p_query_def, coalesce(p_params, '{}'::jsonb), coalesce(p_sources, '[]'::jsonb),
     coalesce(p_policies, '[]'::jsonb), p_actor)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.acc_owner_record_snapshot(uuid,uuid,text,timestamptz,bigint,numeric,char,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.acc_owner_record_snapshot(uuid,uuid,text,timestamptz,bigint,numeric,char,text,text,jsonb,jsonb,jsonb) to service_role;

-- ─────────────────────────────────────────────
-- ١٩ · وصل خطاف ACC-024 — موانع إغلاق الفترة (تصميم Stage 3):
--      «استبدال جسدها لاحقًا يصل الوحدة دون إعادة تصميم للدفتر».
--      المانع: أي استثناء CRITICAL مفتوح للشركة — الإغلاق ينتظر
--      الحسم لا الإخفاء. نفس التوقيع، قراءة صرفة STABLE.
-- ─────────────────────────────────────────────
create or replace function public.acc_period_close_blockers(p_period uuid)
returns table (blocker_kind text, blocker_ref text)
language sql stable set search_path to 'public' as $$
  select 'OPEN_CRITICAL_EXCEPTION'::text, e.id::text
  from public.acc_fiscal_periods p
  join public.acc_exceptions e on e.company_id = p.company_id
  where p.id = p_period
    and e.state <> 'RESOLVED'
    and e.priority = 'CRITICAL'
$$;

-- ═══ نهاية هجرة Stage 11 — صفر قيود، صفر AI، صفر مساس بحقائق 1..10 ═══
