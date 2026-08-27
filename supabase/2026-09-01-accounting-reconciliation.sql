-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 10: المطابقة (Reconciliation)
-- (Git فقط — فوق هجرات Stage 1..9 ولا تعدّلها)
--
-- المطابقة **تأكيد تقابل** لا أكثر: تربط حركة بنك بحدث اقتصادي داخلي
-- بلا تعديل أي مبلغ مصدر أبدًا (REC-004)، وبلا أي قيد دفتري. القرار
-- التفسيري المعتمد: المرحلة 10 حتمية بالكامل — المطابقة الضبابية
-- والأنماط الإحصائية ووكيل AI-MTCH للمرحلة 13 عبر هجرتها هي لاحقًا.
--
-- REC-001: مرجع حتمي صريح + مبلغ تام بنفس العملة = تخطٍّ حتمي لا
--   تُخفّضه العوامل الأضعف. REC-002: المبلغ وحده لا يؤكد آليًا أبدًا.
-- REC-003: العتبات تهيئة منسوخة مدقَّقة (بذور الـBlueprint تهيئة
--   PROPOSED افتراضية للمنتج — لا قيم تنظيمية)، ونافذة التاريخ اختيار
--   بشري صريح قبل التفعيل — لا افتراض مخترع.
--
-- CORRECTION 1: لا إعادة معايرة — score_bp على أساس 10000 الكامل
--   (الغائب يساهم صفرًا)، وcoverage_bp يوثّق المتاح. الوضع من score_bp.
-- CORRECTION 2: اتجاه النقد عنصر أول: دائن البنك (+) وارد، مدين (−)
--   صادر — لا مطابقة مبلغين متعاكسي الاتجاه أبدًا.
-- CORRECTION 3: الهدف حدث اقتصادي نقدي: تسوية كاملة = ONE_TO_ONE؛
--   الفاتورة بمتبقي التحصيل الموثوق فقط؛ **المصروف مستبعد** (لا حقيقة
--   نقدية في Stage 8 — لا اختراع سلوك دفع موردين)؛ القيد بحركة سطر
--   حساب البنك المعيَّن (BANK_ACCOUNT) لا بمجموع المدين.
-- CORRECTION 4: العلاقة تُشتق من التخصيصات لا من السرد؛ الاصطلاح
--   القانوني المعتمد أدناه ثابت في القيد والمحرك والاختبارات:
--     ONE_TO_ONE  = بنك واحد ↔ هدف واحد
--     MANY_TO_ONE = أهداف داخلية عدة ↔ حركة بنك واحدة
--     ONE_TO_MANY = هدف داخلي واحد ↔ حركات بنك عدة
--     MANY_TO_MANY= أكثر من واحد في الجانبين — لا AUTO أبدًا
-- CORRECTION 5: حسم مرشّحي التكرار المشتبهين سجل دائم مستقل.
-- CORRECTION 6: التخصيصات دليل مجمّد للأبد — العكس ينقل حالة التأكيد
--   (REVERSED) والسعة تستثني آباء REVERSED/REJECTED؛ لا released.
-- CORRECTION 7: date_window_days بلا افتراض — إلزامي عند التفعيل.
--
-- BLK-004/BLK-009 مفتوحان: FEE/FX تصنيف واقتراح موصوف فقط — صفر ترحيل.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · تهيئة المطابقة — نسخ محكومة (REC-003)
-- ─────────────────────────────────────────────
create or replace function public.acc_validate_recon_weights(p jsonb)
returns boolean language plpgsql immutable as $$
declare k text; total bigint := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('EXACT_AMOUNT','EXPLICIT_REFERENCE','DATE_PROXIMITY',
                 'COUNTERPARTY_CANONICAL','HISTORICAL_CONFIRMED_MAPPING','GROUP_PLAUSIBILITY') then
      return false;
    end if;
    if jsonb_typeof(p->k) <> 'number' then return false; end if;
    if (p->>k)::bigint < 0 or (p->>k)::bigint > 10000 then return false; end if;
    total := total + (p->>k)::bigint;
  end loop;
  -- الأساس الثابت: مجموع الأوزان = 10000 نقطة أساس تمامًا
  return total = 10000
     and (select count(*) from jsonb_object_keys(p)) = 6;
end $$;

create table if not exists public.acc_recon_settings (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.acc_companies(id),
  version             integer not null check (version >= 1),
  auto_threshold_bp   integer not null check (auto_threshold_bp between 0 and 10000),
  review_threshold_bp integer not null check (review_threshold_bp between 0 and 10000),
  ask_threshold_bp    integer not null check (ask_threshold_bp between 0 and 10000),
  -- نافذة التاريخ اختيار بشري صريح: nullable في PROPOSED، إلزامية للتفعيل
  date_window_days    integer check (date_window_days between 0 and 90),
  weights             jsonb not null check (public.acc_validate_recon_weights(weights)),
  status              text not null default 'PROPOSED' check (status in ('PROPOSED','ACTIVE','RETIRED')),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  activated_at        timestamptz,
  activated_by        uuid references auth.users(id),
  unique (company_id, version),
  check (auto_threshold_bp >= review_threshold_bp and review_threshold_bp >= ask_threshold_bp)
);
create or replace function public.acc_recon_settings_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliation settings are versioned history — RETIRED, never deleted';
  end if;
  if new.company_id is distinct from old.company_id
     or new.version is distinct from old.version
     or new.created_at is distinct from old.created_at then
    raise exception 'settings identity is immutable';
  end if;
  if old.status = 'ACTIVE'
     and (new.auto_threshold_bp is distinct from old.auto_threshold_bp
          or new.review_threshold_bp is distinct from old.review_threshold_bp
          or new.ask_threshold_bp is distinct from old.ask_threshold_bp
          or new.date_window_days is distinct from old.date_window_days
          or new.weights is distinct from old.weights) then
    raise exception 'an ACTIVE settings version is immutable — changes are a new version';
  end if;
  if new.status is distinct from old.status then
    if coalesce(current_setting('acc.recon_settings_op', true), '') <> old.id::text then
      raise exception 'settings status changes only through the governed configuration functions';
    end if;
    if not ( (old.status = 'PROPOSED' and new.status in ('ACTIVE','RETIRED'))
          or (old.status = 'ACTIVE'   and new.status = 'RETIRED') ) then
      raise exception 'forbidden settings transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_recon_settings_guard_trg on public.acc_recon_settings;
create trigger acc_recon_settings_guard_trg
  before update or delete on public.acc_recon_settings
  for each row execute function public.acc_recon_settings_guard();

-- ─────────────────────────────────────────────
-- ٢ · جولات المحرك — لقطة تهيئة مجمّدة لكل تنفيذ
-- ─────────────────────────────────────────────
create table if not exists public.acc_recon_runs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.acc_companies(id),
  settings_id      uuid not null references public.acc_recon_settings(id),
  settings_version integer not null,
  bank_account_id  uuid references public.acc_bank_accounts(id),
  -- الآلية SYSTEM لكن الإنسان المُطلِق يُحفظ مستقلًا — لا انتحال
  initiated_by     uuid not null references auth.users(id),
  state            text not null default 'RUNNING' check (state in ('RUNNING','COMPLETED','FAILED')),
  txns_considered  integer,
  auto_created     integer,
  suggestions      integer,
  unmatched        integer,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create or replace function public.acc_recon_runs_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'reconciliation runs are permanent history'; end if;
  if old.state <> 'RUNNING' then
    raise exception 'a finished run is frozen';
  end if;
  return new;
end $$;
drop trigger if exists acc_recon_runs_guard_trg on public.acc_recon_runs;
create trigger acc_recon_runs_guard_trg
  before update or delete on public.acc_recon_runs
  for each row execute function public.acc_recon_runs_guard();

-- ─────────────────────────────────────────────
-- ٣ · حسم مرشّحي التكرار المشتبهين (CORRECTION 5) — سجل دائم
-- ─────────────────────────────────────────────
create table if not exists public.acc_recon_duplicate_resolutions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.acc_companies(id),
  candidate_id uuid not null references public.acc_bank_duplicate_candidates(id),
  decision     text not null check (decision in ('DISTINCT','DUPLICATE')),
  reason       text not null check (btrim(reason) <> ''),
  resolved_by  uuid not null references auth.users(id),
  resolved_at  timestamptz not null default now(),
  unique (candidate_id)
);
create or replace function public.acc_recon_dupres_frozen()
returns trigger language plpgsql as $$
begin raise exception 'duplicate resolutions are append-once immutable: % refused', tg_op; end $$;
drop trigger if exists acc_recon_dupres_frozen_trg on public.acc_recon_duplicate_resolutions;
create trigger acc_recon_dupres_frozen_trg
  before update or delete on public.acc_recon_duplicate_resolutions
  for each row execute function public.acc_recon_dupres_frozen();

-- ─────────────────────────────────────────────
-- ٤ · محلّل الأهداف القانوني الواحد (CORRECTION 3 + «TARGET CAPACITY»)
--     عقد واحد لكل نوع: شركة/عملة/اتجاه نقد/سعة مؤهلة/تواريخ/مراجع/
--     فترة حاكمة/مفتاح الطبقة الاقتصادية — لا منطق أهداف مبعثرًا.
--     ⛔ EXPENSE مستبعد: Stage 8 بلا حقيقة دفع نقدي — لا اختراع AP.
-- ─────────────────────────────────────────────
create or replace function public.acc_recon_resolve_target(
  p_company uuid, p_bank_account uuid, p_kind text, p_id uuid
)
returns table (
  company_id uuid, currency char(3), direction text, eligible_minor bigint,
  event_date date, ref_primary text, ref_secondary text,
  period_id uuid, layer_key text, eligible boolean, reason text
)
language plpgsql security definer set search_path to 'public' stable as $$
declare v record; v_sum bigint; v_cur char(3); v_curs integer; v_out bigint;
        v_acct uuid; v_period uuid; v_net bigint;
begin
  if p_kind = 'SETTLEMENT' then
    select s.* into v from public.acc_settlements s where s.id = p_id;
    if not found then return query select null::uuid,null::char(3),null::text,null::bigint,null::date,null::text,null::text,null::uuid,null::text,false,'TARGET_NOT_FOUND'; return; end if;
    select sum(sl.net_minor), count(distinct sl.currency), min(sl.currency)
      into v_sum, v_curs, v_cur
      from public.acc_settlement_lines sl where sl.settlement_id = p_id;
    select fp.id into v_period from public.acc_fiscal_periods fp
     where fp.company_id = v.company_id and v.settled_at between fp.start_date and fp.end_date
     order by fp.start_date desc limit 1;
    return query select v.company_id, v_cur, 'INFLOW'::text, coalesce(v_sum, 0),
      v.settled_at, v.settlement_ref, v.provider, v_period,
      'SETTLEMENT:' || p_id::text,
      (v_sum is not null and v_sum > 0 and v_curs = 1),
      case when v_sum is null then 'NO_SETTLEMENT_LINES'
           when v_curs > 1 then 'MIXED_CURRENCY_LINES' else null end;
    return;
  elsif p_kind = 'PAYMENT' then
    select p.* into v from public.acc_payments p where p.id = p_id;
    if not found then return query select null::uuid,null::char(3),null::text,null::bigint,null::date,null::text,null::text,null::uuid,null::text,false,'TARGET_NOT_FOUND'; return; end if;
    select fp.id into v_period from public.acc_fiscal_periods fp
     where fp.company_id = v.company_id and (v.received_at at time zone 'UTC')::date between fp.start_date and fp.end_date
     order by fp.start_date desc limit 1;
    return query select v.company_id, v.currency, 'INFLOW'::text, v.amount_minor,
      (v.received_at at time zone 'UTC')::date, v.gateway_txn_id, null::text, v_period,
      'PAYMENT:' || p_id::text,
      (v.status in ('SUCCESS','SETTLED')
       -- الطبقة القانونية: دفعة داخل تسوية يملكها هدف التسوية لا هي
       and not exists (select 1 from public.acc_settlement_lines sl where sl.payment_id = p_id)),
      case when v.status not in ('SUCCESS','SETTLED') then 'PAYMENT_NOT_CASH_CONFIRMED'
           when exists (select 1 from public.acc_settlement_lines sl where sl.payment_id = p_id)
             then 'REPRESENTED_BY_SETTLEMENT' else null end;
    return;
  elsif p_kind = 'INVOICE' then
    select i.* into v from public.acc_invoices i where i.id = p_id;
    if not found then return query select null::uuid,null::char(3),null::text,null::bigint,null::date,null::text,null::text,null::uuid,null::text,false,'TARGET_NOT_FOUND'; return; end if;
    -- المتبقي الموثوق من حقائق Stage 6 القائمة حصرًا: الإجمالي − الدفعات
    -- النقدية المؤكدة — لا اختراع حالة ذمم
    select coalesce(sum(p.amount_minor), 0) into v_sum
      from public.acc_payments p
     where p.invoice_id = p_id and p.status in ('SUCCESS','SETTLED','RECONCILED');
    v_out := coalesce(v.total_minor, 0) - v_sum;
    select fp.id into v_period from public.acc_fiscal_periods fp
     where fp.company_id = v.company_id and v.issue_date between fp.start_date and fp.end_date
     order by fp.start_date desc limit 1;
    return query select v.company_id, v.currency, 'INFLOW'::text, greatest(v_out, 0),
      coalesce(v.due_date, v.issue_date), v.invoice_number::text, null::text, v_period,
      'INVOICE:' || p_id::text,
      (v.status in ('ISSUED','SENT','PARTIALLY_PAID','OVERDUE') and v.total_minor is not null and v_out > 0),
      case when v.status not in ('ISSUED','SENT','PARTIALLY_PAID','OVERDUE') then 'INVOICE_NOT_RECEIVABLE'
           when v.total_minor is null then 'NO_TRUSTWORTHY_TOTAL'
           when v_out <= 0 then 'NO_OUTSTANDING_AMOUNT' else null end;
    return;
  elsif p_kind = 'REFUND' then
    select r.* into v from public.acc_refunds r where r.id = p_id;
    if not found then return query select null::uuid,null::char(3),null::text,null::bigint,null::date,null::text,null::text,null::uuid,null::text,false,'TARGET_NOT_FOUND'; return; end if;
    select fp.id into v_period from public.acc_fiscal_periods fp
     where fp.company_id = v.company_id and v.effective_date between fp.start_date and fp.end_date
     order by fp.start_date desc limit 1;
    return query select v.company_id, v.currency, 'OUTFLOW'::text, v.amount_minor,
      v.effective_date, v.external_refund_id, null::text, v_period,
      'REFUND:' || p_id::text,
      (v.status = 'REFUNDED'),
      case when v.status <> 'REFUNDED' then 'REFUND_NOT_CASH_SETTLED' else null end;
    return;
  elsif p_kind = 'JOURNAL_ENTRY' then
    select j.* into v from public.acc_journal_entries j where j.id = p_id;
    if not found then return query select null::uuid,null::char(3),null::text,null::bigint,null::date,null::text,null::text,null::uuid,null::text,false,'TARGET_NOT_FOUND'; return; end if;
    -- سطر حساب البنك المعيَّن حصرًا (لا مجموع المدين):
    select gl.account_id into v_acct from public.acc_gl_account_links gl
     where gl.company_id = v.company_id and gl.purpose = 'BANK_ACCOUNT'
       and gl.scope_key = p_bank_account::text;
    if v_acct is null then
      return query select v.company_id, null::char(3), null::text, null::bigint,
        v.entry_date, null::text, null::text, v.period_id, 'JOURNAL:' || p_id::text,
        false, 'NO_BANK_ACCOUNT_MAPPING';
      return;
    end if;
    select sum(case when jl.side = 'DEBIT' then jl.amount_minor else -jl.amount_minor end),
           count(distinct jl.currency), min(jl.currency)
      into v_net, v_curs, v_cur
      from public.acc_journal_lines jl
     where jl.entry_id = p_id and jl.account_id = v_acct;
    return query select v.company_id, v_cur,
      case when v_net > 0 then 'INFLOW' when v_net < 0 then 'OUTFLOW' else null end,
      abs(coalesce(v_net, 0)), v.entry_date, null::text, null::text, v.period_id,
      'JOURNAL:' || p_id::text,
      (v.status = 'POSTED' and v_net is not null and v_net <> 0 and v_curs = 1),
      case when v.status <> 'POSTED' then 'JOURNAL_NOT_POSTED'
           when v_net is null then 'NO_MAPPED_BANK_LINE'
           when v_net = 0 then 'ZERO_BANK_MOVEMENT'
           when v_curs > 1 then 'MIXED_CURRENCY_BANK_LINES' else null end;
    return;
  end if;
  -- EXPENSE وكل نوع آخر: خارج أهداف النقد — لا حقيقة دفع في Stage 8
  return query select null::uuid, null::char(3), null::text, null::bigint,
    null::date, null::text, null::text, null::uuid, null::text,
    false, 'KIND_NOT_CASH_ELIGIBLE';
end $$;
revoke execute on function public.acc_recon_resolve_target(uuid,uuid,text,uuid) from public, anon, authenticated;
grant  execute on function public.acc_recon_resolve_target(uuid,uuid,text,uuid) to service_role;

-- ─────────────────────────────────────────────
-- ٥ · التأكيدات + التخصيصات + الأدلة + الأحداث + العكوس
-- ─────────────────────────────────────────────
create table if not exists public.acc_reconciliations (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.acc_companies(id),
  run_id                  uuid references public.acc_recon_runs(id),
  settings_id             uuid not null references public.acc_recon_settings(id),
  settings_version        integer not null,
  match_type              text not null check (match_type in
                            ('ONE_TO_ONE','MANY_TO_ONE','ONE_TO_MANY','MANY_TO_MANY',
                             'PARTIAL','FEE_DIFFERENCE','FX_DIFFERENCE','DATE_DIFFERENCE')),
  mode                    text not null check (mode in ('AUTO','SUGGESTED','MANUAL')),
  state                   text not null check (state in
                            ('SUGGESTED','MANUALLY_MATCHED','CONFIRMED','LOCKED','REJECTED','REVERSED')),
  score_bp                integer not null check (score_bp between 0 and 10000),
  coverage_bp             integer not null check (coverage_bp between 0 and 10000),
  matched_factors         integer not null check (matched_factors >= 0),
  deterministic_override  boolean not null default false,
  deterministic_reference text,
  difference_minor        bigint,
  difference_reason       text check (difference_reason in
                            ('POSSIBLE_FEE','POSSIBLE_FX','DATE_WINDOW') or difference_reason is null),
  created_at              timestamptz not null default now(),
  -- SYSTEM للآلي (الإنسان المُطلِق على الجولة)؛ الإنسان لليدوي
  created_source          text not null check (created_source in ('SYSTEM','HUMAN')),
  created_by              uuid references auth.users(id),
  confirmed_by            uuid references auth.users(id),
  confirmed_at            timestamptz,
  locked_by               uuid references auth.users(id),
  locked_at               timestamptz,
  rejected_by             uuid references auth.users(id),
  rejected_reason         text,
  -- REC-001/002 بنيويًا: AUTO يستلزم تخطّيًا حتميًا أو عتبة+تعاضدًا
  check (mode <> 'AUTO' or deterministic_override or matched_factors >= 2),
  check (not deterministic_override or deterministic_reference is not null),
  check (match_type <> 'MANY_TO_MANY' or mode <> 'AUTO'),
  check (created_source = 'HUMAN' or run_id is not null)
);
create index if not exists acc_recon_company_state_idx on public.acc_reconciliations (company_id, state);

create table if not exists public.acc_recon_allocations (
  id                  uuid primary key default gen_random_uuid(),
  reconciliation_id   uuid not null references public.acc_reconciliations(id),
  company_id          uuid not null references public.acc_companies(id),
  bank_transaction_id uuid not null references public.acc_bank_transactions(id),
  target_kind         text not null check (target_kind in
                        ('SETTLEMENT','PAYMENT','INVOICE','REFUND','JOURNAL_ENTRY')),
  target_id           uuid not null,
  -- سعة مطابَقة مطلقة موجبة؛ إشارة البنك تبقى في مصدرها كما هي
  allocated_minor     bigint not null check (allocated_minor > 0),
  currency            char(3) not null references public.acc_currencies(code),
  expected_direction  text not null check (expected_direction in ('INFLOW','OUTFLOW')),
  layer_key           text not null,
  created_at          timestamptz not null default now(),
  unique (reconciliation_id, bank_transaction_id, target_kind, target_id)
);
create index if not exists acc_recon_alloc_bank_idx on public.acc_recon_allocations (bank_transaction_id);
create index if not exists acc_recon_alloc_target_idx on public.acc_recon_allocations (company_id, target_kind, target_id);

create table if not exists public.acc_recon_factor_evidence (
  id                uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.acc_reconciliations(id),
  company_id        uuid not null references public.acc_companies(id),
  factor_key        text not null check (factor_key in
                      ('EXACT_AMOUNT','EXPLICIT_REFERENCE','DATE_PROXIMITY',
                       'COUNTERPARTY_CANONICAL','HISTORICAL_CONFIRMED_MAPPING','GROUP_PLAUSIBILITY')),
  available         boolean not null,
  matched           boolean not null,
  weight_bp         integer not null check (weight_bp between 0 and 10000),
  contribution_bp   integer not null check (contribution_bp between 0 and 10000),
  provenance        jsonb not null default '{}'::jsonb,
  check (matched is false or available is true),
  check (contribution_bp = 0 or matched is true),
  unique (reconciliation_id, factor_key)
);

create table if not exists public.acc_recon_events (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.acc_companies(id),
  run_id              uuid references public.acc_recon_runs(id),
  reconciliation_id   uuid references public.acc_reconciliations(id),
  bank_transaction_id uuid references public.acc_bank_transactions(id),
  condition           text not null check (condition in
                        ('UNMATCHED_BANK_TRANSACTION','AMBIGUOUS_MATCH','LOW_CONFIDENCE_MATCH',
                         'MANY_MANY_REVIEW','PARTIAL_REMAINDER','FEE_DIFFERENCE_REVIEW',
                         'FX_DIFFERENCE_REVIEW','CLOSED_PERIOD_CONFLICT',
                         'SUSPECTED_DUPLICATE_HOLD','COVERAGE_GAP_NOTED')),
  blocking            boolean not null,
  detail              jsonb,
  created_at          timestamptz not null default now()
);
create or replace function public.acc_recon_frozen()
returns trigger language plpgsql as $$
begin raise exception 'reconciliation derived evidence is append-only: % refused', tg_op; end $$;
drop trigger if exists acc_recon_alloc_frozen_trg on public.acc_recon_allocations;
create trigger acc_recon_alloc_frozen_trg
  before update or delete on public.acc_recon_allocations
  for each row execute function public.acc_recon_frozen();
drop trigger if exists acc_recon_factor_frozen_trg on public.acc_recon_factor_evidence;
create trigger acc_recon_factor_frozen_trg
  before update or delete on public.acc_recon_factor_evidence
  for each row execute function public.acc_recon_frozen();
drop trigger if exists acc_recon_events_frozen_trg on public.acc_recon_events;
create trigger acc_recon_events_frozen_trg
  before update or delete on public.acc_recon_events
  for each row execute function public.acc_recon_frozen();

create table if not exists public.acc_recon_reversals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  reconciliation_id uuid not null references public.acc_reconciliations(id),
  reason            text not null check (btrim(reason) <> ''),
  requested_by      uuid not null references auth.users(id),
  requested_at      timestamptz not null default now(),
  status            text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','DENIED')),
  decided_by        uuid references auth.users(id),
  decided_at        timestamptz,
  -- الموافق غير الطالب — بنيويًا أيضًا لا وظيفيًا فقط
  check (decided_by is null or decided_by <> requested_by)
);
create or replace function public.acc_recon_reversals_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'reversal records are permanent'; end if;
  if old.status <> 'REQUESTED' then raise exception 'a decided reversal is frozen'; end if;
  if new.reconciliation_id is distinct from old.reconciliation_id
     or new.requested_by is distinct from old.requested_by
     or new.reason is distinct from old.reason then
    raise exception 'reversal request facts are immutable';
  end if;
  if coalesce(current_setting('acc.recon_op', true), '') <> old.id::text then
    raise exception 'reversal decisions only through the governed approval function';
  end if;
  return new;
end $$;
drop trigger if exists acc_recon_reversals_guard_trg on public.acc_recon_reversals;
create trigger acc_recon_reversals_guard_trg
  before update or delete on public.acc_recon_reversals
  for each row execute function public.acc_recon_reversals_guard();

-- حارس التأكيد: آلة الحالات + الاشتقاق من التخصيصات (CORRECTION 4)
create or replace function public.acc_reconciliations_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliations are permanent assertions — REJECTED/REVERSED, never deleted';
  end if;
  if new.company_id is distinct from old.company_id
     or new.settings_id is distinct from old.settings_id
     or new.settings_version is distinct from old.settings_version
     or new.score_bp is distinct from old.score_bp
     or new.coverage_bp is distinct from old.coverage_bp
     or new.deterministic_override is distinct from old.deterministic_override
     or new.created_at is distinct from old.created_at
     or new.created_source is distinct from old.created_source then
    raise exception 'reconciliation evidence facts are immutable';
  end if;
  if old.state in ('REJECTED','REVERSED') then
    raise exception 'a % reconciliation is terminal history', old.state;
  end if;
  if old.state = 'LOCKED' and new.state <> 'REVERSED' then
    raise exception 'LOCKED leaves only through an approved reversal';
  end if;
  if new.state is distinct from old.state then
    if coalesce(current_setting('acc.recon_op', true), '') <> old.id::text then
      raise exception 'reconciliation state changes only through the governed functions';
    end if;
    if not ( (old.state = 'SUGGESTED'        and new.state in ('CONFIRMED','REJECTED'))
          or (old.state = 'MANUALLY_MATCHED' and new.state in ('CONFIRMED','REJECTED'))
          or (old.state = 'CONFIRMED'        and new.state in ('LOCKED','REVERSED'))
          or (old.state = 'LOCKED'           and new.state = 'REVERSED') ) then
      raise exception 'forbidden reconciliation transition: % -> %', old.state, new.state;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_reconciliations_guard_trg on public.acc_reconciliations;
create trigger acc_reconciliations_guard_trg
  before update or delete on public.acc_reconciliations
  for each row execute function public.acc_reconciliations_guard();

-- حارس التخصيص: وجود/شركة/عملة/اتجاه/طبقة/سعة (CORRECTIONS 2/3 + الحفظ)
create or replace function public.acc_recon_alloc_guard()
returns trigger language plpgsql as $$
declare v_rec record; v_txn record; v_t record; v_bank_used bigint; v_target_used bigint;
begin
  select * into v_rec from public.acc_reconciliations r where r.id = new.reconciliation_id;
  if not found or v_rec.company_id <> new.company_id then
    raise exception 'allocation must belong to its reconciliation company';
  end if;
  if coalesce(current_setting('acc.recon_op', true), '') <> v_rec.id::text then
    raise exception 'allocations are written only by the governed reconciliation functions';
  end if;
  select * into v_txn from public.acc_bank_transactions t where t.id = new.bank_transaction_id;
  if not found or v_txn.company_id <> new.company_id then
    raise exception 'bank transaction must exist in the same company';
  end if;
  -- الحركة من جولة مقبولة حصرًا
  if not exists (select 1 from public.acc_bank_imports bi
                 where bi.id = v_txn.import_id and bi.state = 'ACCEPTED') then
    raise exception 'only transactions of ACCEPTED imports are reconcilable';
  end if;
  -- المحلّل القانوني الواحد: وجود/أهلية/عملة/اتجاه/طبقة
  select * into v_t from public.acc_recon_resolve_target(
    new.company_id, v_txn.bank_account_id, new.target_kind, new.target_id);
  if v_t.company_id is null or v_t.company_id <> new.company_id then
    raise exception 'target does not exist in the same company (kind %)', new.target_kind;
  end if;
  if not v_t.eligible then
    raise exception 'target not cash-eligible: %', coalesce(v_t.reason, 'INELIGIBLE');
  end if;
  if v_t.currency <> new.currency or v_txn.currency <> new.currency then
    raise exception 'allocation requires one explicit currency on both sides (bank %, target %)', v_txn.currency, v_t.currency;
  end if;
  -- اتجاه النقد أولًا: دائن البنك (+) وارد، مدين (−) صادر
  if new.expected_direction is distinct from v_t.direction then
    raise exception 'cash direction evidence mismatch';
  end if;
  if (v_t.direction = 'INFLOW' and v_txn.amount_minor <= 0)
     or (v_t.direction = 'OUTFLOW' and v_txn.amount_minor >= 0) then
    raise exception 'opposite cash direction: a % target cannot match this bank movement', v_t.direction;
  end if;
  if new.layer_key is distinct from v_t.layer_key then
    raise exception 'economic layer key mismatch';
  end if;
  -- منع تمثيل الحدث مرتين عبر الطبقات لنفس حركة البنك: تسوية ↔ دفعاتها/فواتيرها
  if new.target_kind = 'SETTLEMENT' then
    if exists (
      select 1 from public.acc_recon_allocations a
      join public.acc_reconciliations r2 on r2.id = a.reconciliation_id
      where a.bank_transaction_id = new.bank_transaction_id
        and r2.state in ('SUGGESTED','MANUALLY_MATCHED','CONFIRMED','LOCKED')
        and ((a.target_kind = 'PAYMENT' and exists
               (select 1 from public.acc_settlement_lines sl
                where sl.settlement_id = new.target_id and sl.payment_id = a.target_id))
          or (a.target_kind = 'INVOICE' and exists
               (select 1 from public.acc_settlement_lines sl
                join public.acc_payments p on p.id = sl.payment_id
                where sl.settlement_id = new.target_id and p.invoice_id = a.target_id)))
    ) then
      raise exception 'settlement children are already matched for this bank movement (economic double-count)';
    end if;
  elsif new.target_kind in ('PAYMENT','INVOICE') then
    if exists (
      select 1 from public.acc_recon_allocations a
      join public.acc_reconciliations r2 on r2.id = a.reconciliation_id
      where a.bank_transaction_id = new.bank_transaction_id
        and a.target_kind = 'SETTLEMENT'
        and r2.state in ('SUGGESTED','MANUALLY_MATCHED','CONFIRMED','LOCKED')
        and ((new.target_kind = 'PAYMENT' and exists
               (select 1 from public.acc_settlement_lines sl
                where sl.settlement_id = a.target_id and sl.payment_id = new.target_id))
          or (new.target_kind = 'INVOICE' and exists
               (select 1 from public.acc_settlement_lines sl
                join public.acc_payments p on p.id = sl.payment_id
                where sl.settlement_id = a.target_id and p.invoice_id = new.target_id)))
    ) then
      raise exception 'this record is represented by an already-matched settlement (economic double-count)';
    end if;
  end if;
  -- الحفظ: السعة النشطة = آباء CONFIRMED/LOCKED فقط (SUGGESTED لا يستهلك؛
  -- التأكيد يعيد الفحص تحت قفل) — REVERSED/REJECTED مستثناة (CORRECTION 6)
  if v_rec.state in ('CONFIRMED','LOCKED') then
    select coalesce(sum(a.allocated_minor), 0) into v_bank_used
      from public.acc_recon_allocations a
      join public.acc_reconciliations r2 on r2.id = a.reconciliation_id
     where a.bank_transaction_id = new.bank_transaction_id
       and r2.state in ('CONFIRMED','LOCKED') and a.id <> new.id;
    if v_bank_used + new.allocated_minor > abs(v_txn.amount_minor)
       and v_rec.match_type not in ('FEE_DIFFERENCE') then
      raise exception 'bank capacity exceeded: % + % > %', v_bank_used, new.allocated_minor, abs(v_txn.amount_minor);
    end if;
    select coalesce(sum(a.allocated_minor), 0) into v_target_used
      from public.acc_recon_allocations a
      join public.acc_reconciliations r2 on r2.id = a.reconciliation_id
     where a.company_id = new.company_id and a.target_kind = new.target_kind
       and a.target_id = new.target_id
       and r2.state in ('CONFIRMED','LOCKED') and a.id <> new.id;
    if v_target_used + new.allocated_minor > v_t.eligible_minor then
      raise exception 'target capacity exceeded: % + % > %', v_target_used, new.allocated_minor, v_t.eligible_minor;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_recon_alloc_guard_trg on public.acc_recon_allocations;
create trigger acc_recon_alloc_guard_trg
  before insert on public.acc_recon_allocations
  for each row execute function public.acc_recon_alloc_guard();

-- ─────────────────────────────────────────────
-- ٦ · إسقاط مشتق لحالة مطابقة حركة البنك — لا مساس بصفوف Stage 9
-- ─────────────────────────────────────────────
create or replace view public.acc_bank_txn_recon_status
  with (security_invoker = true) as
select t.id as bank_transaction_id, t.company_id,
  case
    when exists (select 1 from public.acc_recon_allocations a
                 join public.acc_reconciliations r on r.id = a.reconciliation_id
                 where a.bank_transaction_id = t.id and r.state = 'LOCKED') then 'LOCKED'
    when (select coalesce(sum(a.allocated_minor), 0) from public.acc_recon_allocations a
          join public.acc_reconciliations r on r.id = a.reconciliation_id
          where a.bank_transaction_id = t.id and r.state in ('CONFIRMED','LOCKED'))
         >= abs(t.amount_minor) then 'RECONCILED'
    when exists (select 1 from public.acc_recon_allocations a
                 join public.acc_reconciliations r on r.id = a.reconciliation_id
                 where a.bank_transaction_id = t.id and r.state in ('CONFIRMED','LOCKED')) then 'PARTIAL'
    when exists (select 1 from public.acc_recon_allocations a
                 join public.acc_reconciliations r on r.id = a.reconciliation_id
                 where a.bank_transaction_id = t.id and r.state in ('SUGGESTED','MANUALLY_MATCHED')) then 'SUGGESTED'
    else 'UNMATCHED'
  end as recon_status
from public.acc_bank_transactions t;

-- ─────────────────────────────────────────────
-- ٧ · RLS — المحاسبة/المدير المالي/المدقّق؛ لا مالكة (درع وضع المالكة —
--     المرحلة 11 تعرض لغتها لاحقًا)، لا موظفة، لا READ_ONLY
-- ─────────────────────────────────────────────
alter table public.acc_recon_settings              enable row level security;
alter table public.acc_recon_runs                  enable row level security;
alter table public.acc_reconciliations             enable row level security;
alter table public.acc_recon_allocations           enable row level security;
alter table public.acc_recon_factor_evidence       enable row level security;
alter table public.acc_recon_events                enable row level security;
alter table public.acc_recon_reversals             enable row level security;
alter table public.acc_recon_duplicate_resolutions enable row level security;

create policy acc_recon_settings_select on public.acc_recon_settings
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_runs_select on public.acc_recon_runs
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_reconciliations_select on public.acc_reconciliations
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_alloc_select on public.acc_recon_allocations
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_factor_select on public.acc_recon_factor_evidence
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_events_select on public.acc_recon_events
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_reversals_select on public.acc_recon_reversals
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));
create policy acc_recon_dupres_select on public.acc_recon_duplicate_resolutions
  for select using (coalesce(public.acc_role(company_id), '') in ('ACCOUNTANT','FINANCE_MANAGER','AUDITOR'));

revoke insert, update, delete on public.acc_recon_settings              from anon, authenticated;
revoke insert, update, delete on public.acc_recon_runs                  from anon, authenticated;
revoke insert, update, delete on public.acc_reconciliations             from anon, authenticated;
revoke insert, update, delete on public.acc_recon_allocations           from anon, authenticated;
revoke insert, update, delete on public.acc_recon_factor_evidence       from anon, authenticated;
revoke insert, update, delete on public.acc_recon_events                from anon, authenticated;
revoke insert, update, delete on public.acc_recon_reversals             from anon, authenticated;
revoke insert, update, delete on public.acc_recon_duplicate_resolutions from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٨ · التهيئة — المحاسبة حصرًا (الأدوار المعتمدة)
-- ─────────────────────────────────────────────
create function public.acc_recon_add_settings(
  p_company uuid, p_auto_bp integer, p_review_bp integer, p_ask_bp integer,
  p_date_window_days integer, p_weights jsonb
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_version integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') <> 'ACCOUNTANT' then
    raise exception 'reconciliation configuration is the ACCOUNTANT''s act';
  end if;
  select coalesce(max(s.version), 0) + 1 into v_version
    from public.acc_recon_settings s where s.company_id = p_company;
  insert into public.acc_recon_settings
    (company_id, version, auto_threshold_bp, review_threshold_bp, ask_threshold_bp,
     date_window_days, weights, created_by)
  values (p_company, v_version, p_auto_bp, p_review_bp, p_ask_bp,
          p_date_window_days, p_weights, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'RECON_CONFIG_CREATED', 'acc_recon_settings', v_id::text,
    null, jsonb_build_object('version', v_version, 'auto_bp', p_auto_bp, 'review_bp', p_review_bp,
    'ask_bp', p_ask_bp, 'date_window_days', p_date_window_days, 'weights', p_weights),
    'acc_recon_add_settings');
  return v_id;
end $$;
revoke execute on function public.acc_recon_add_settings(uuid,integer,integer,integer,integer,jsonb) from public, anon;
grant  execute on function public.acc_recon_add_settings(uuid,integer,integer,integer,integer,jsonb) to authenticated;

create function public.acc_recon_activate_settings(p_settings uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_row record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_row from public.acc_recon_settings s where s.id = p_settings;
  if not found then raise exception 'unknown settings version'; end if;
  if coalesce(public.acc_role(v_row.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'settings activation is the ACCOUNTANT''s act';
  end if;
  -- CORRECTION 7: نافذة التاريخ اختيار بشري صريح — لا تفعيل بدونها
  if v_row.date_window_days is null then
    raise exception 'date_window_days must be explicitly chosen before activation — no invented default';
  end if;
  -- نسخة نشطة واحدة: أقعد السابقة
  perform set_config('acc.recon_settings_op', s.id::text, true)
    from public.acc_recon_settings s
   where s.company_id = v_row.company_id and s.status = 'ACTIVE';
  update public.acc_recon_settings s set status = 'RETIRED'
   where s.company_id = v_row.company_id and s.status = 'ACTIVE'
     and coalesce(current_setting('acc.recon_settings_op', true), '') = s.id::text;
  perform set_config('acc.recon_settings_op', p_settings::text, true);
  update public.acc_recon_settings s
     set status = 'ACTIVE', activated_at = now(), activated_by = v_user
   where s.id = p_settings;
  perform set_config('acc.recon_settings_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'RECON_CONFIG_ACTIVATED', 'acc_recon_settings',
    p_settings::text, jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', 'ACTIVE', 'date_window_days', v_row.date_window_days),
    'acc_recon_activate_settings');
end $$;
revoke execute on function public.acc_recon_activate_settings(uuid) from public, anon;
grant  execute on function public.acc_recon_activate_settings(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · الجولات (service عبر تنسيق الخادم؛ p_actor إنسان ACC/FM)
-- ─────────────────────────────────────────────
create function public.acc_recon_begin_run(p_company uuid, p_actor uuid, p_bank_account uuid)
returns table (run_id uuid, settings_id uuid, settings_version integer,
               auto_bp integer, review_bp integer, ask_bp integer,
               date_window_days integer, weights jsonb)
language plpgsql security definer set search_path to 'public' as $$
declare v_s record; v_id uuid;
begin
  if p_actor is null then raise exception 'actor identity required'; end if;
  if not (coalesce(public.acc_role_of(p_company, p_actor), '') = any (array['ACCOUNTANT','FINANCE_MANAGER'])) then
    raise exception 'reconciliation runs are initiated by ACCOUNTANT or FINANCE_MANAGER';
  end if;
  select * into v_s from public.acc_recon_settings s
   where s.company_id = p_company and s.status = 'ACTIVE';
  if not found then
    raise exception 'no ACTIVE reconciliation settings — configuration is a prerequisite (REC-003)';
  end if;
  insert into public.acc_recon_runs (company_id, settings_id, settings_version, bank_account_id, initiated_by)
  values (p_company, v_s.id, v_s.version, p_bank_account, p_actor)
  returning id into v_id;
  perform public.acc_audit(p_company, p_actor, 'RECON_RUN_STARTED', 'acc_recon_runs', v_id::text,
    null, jsonb_build_object('settings_version', v_s.version, 'bank_account', p_bank_account),
    'acc_recon_begin_run');
  return query select v_id, v_s.id, v_s.version, v_s.auto_threshold_bp,
    v_s.review_threshold_bp, v_s.ask_threshold_bp, v_s.date_window_days, v_s.weights;
end $$;
revoke execute on function public.acc_recon_begin_run(uuid,uuid,uuid) from public, anon, authenticated;
grant  execute on function public.acc_recon_begin_run(uuid,uuid,uuid) to service_role;

create function public.acc_recon_complete_run(
  p_run uuid, p_state text, p_considered integer, p_auto integer, p_suggested integer, p_unmatched integer
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_row record;
begin
  select * into v_row from public.acc_recon_runs r where r.id = p_run;
  if not found then raise exception 'unknown run'; end if;
  if p_state not in ('COMPLETED','FAILED') then raise exception 'terminal run states are COMPLETED/FAILED'; end if;
  update public.acc_recon_runs r
     set state = p_state, txns_considered = p_considered, auto_created = p_auto,
         suggestions = p_suggested, unmatched = p_unmatched, finished_at = now()
   where r.id = p_run;
  perform public.acc_audit(v_row.company_id, v_row.initiated_by, 'RECON_RUN_COMPLETED', 'acc_recon_runs',
    p_run::text, null, jsonb_build_object('state', p_state, 'considered', p_considered,
    'auto', p_auto, 'suggested', p_suggested, 'unmatched', p_unmatched), 'acc_recon_complete_run');
end $$;
revoke execute on function public.acc_recon_complete_run(uuid,text,integer,integer,integer,integer) from public, anon, authenticated;
grant  execute on function public.acc_recon_complete_run(uuid,text,integer,integer,integer,integer) to service_role;

-- ─────────────────────────────────────────────
-- ١٠ · إنشاء تأكيد (محرك service — أو يدوي بشري) — القلب المحكوم
--      يتحقق: أهلية Stage 9 (تكرارات)، الفترة، REC-001/002، الاصطلاح
--      القانوني للعلاقة من عدّ الأطراف، score من الأساس الثابت.
-- ─────────────────────────────────────────────
create function public.acc_recon_create_assertion(
  p_run uuid, p_actor uuid, p_payload jsonb
)
returns table (reconciliation_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_run record; v_s record; v_id uuid; a jsonb; f jsonb;
        v_mode text; v_type text; v_state text; v_score integer; v_cov integer;
        v_override boolean; v_ref text; v_mf integer;
        v_banks integer; v_targets integer; v_txn record; v_t record;
        v_period record; v_diff bigint; v_diff_reason text; v_manual boolean;
begin
  v_manual := (p_run is null);
  if not v_manual and auth.uid() is not null then
    raise exception 'the engine path is service-only — humans use the manual path';
  end if;
  if v_manual then
    -- مطابقة يدوية: فعل بشري authenticated
    if auth.uid() is null or auth.uid() <> p_actor then
      raise exception 'manual matching is a human act';
    end if;
    if not (coalesce(public.acc_role((p_payload->>'company_id')::uuid), '')
            = any (array['ACCOUNTANT','FINANCE_MANAGER'])) then
      raise exception 'manual matching requires ACCOUNTANT or FINANCE_MANAGER';
    end if;
    select s.* into v_s from public.acc_recon_settings s
     where s.company_id = (p_payload->>'company_id')::uuid and s.status = 'ACTIVE';
    if not found then raise exception 'no ACTIVE reconciliation settings'; end if;
  else
    select r.* into v_run from public.acc_recon_runs r where r.id = p_run;
    if not found or v_run.state <> 'RUNNING' then raise exception 'run is not RUNNING'; end if;
    if v_run.initiated_by <> p_actor then raise exception 'actor must be the run initiator'; end if;
    select s.* into v_s from public.acc_recon_settings s where s.id = v_run.settings_id;
  end if;

  v_mode := p_payload->>'mode';
  v_type := p_payload->>'match_type';
  v_score := (p_payload->>'score_bp')::integer;
  v_cov := (p_payload->>'coverage_bp')::integer;
  v_override := coalesce((p_payload->>'deterministic_override')::boolean, false);
  v_ref := p_payload->>'deterministic_reference';
  v_mf := (p_payload->>'matched_factors')::integer;
  v_diff := nullif(p_payload->>'difference_minor', '')::bigint;
  v_diff_reason := nullif(p_payload->>'difference_reason', '');

  if v_manual and v_mode <> 'MANUAL' then raise exception 'human path creates MANUAL assertions'; end if;
  if not v_manual and v_mode = 'MANUAL' then raise exception 'engine path cannot create MANUAL assertions'; end if;

  -- الاصطلاح القانوني: العلاقة تُشتق من عدّ الأطراف لا من ادعاء المستدعي
  select count(distinct (a2->>'bank_transaction_id')), count(distinct (a2->>'target_kind') || ':' || (a2->>'target_id'))
    into v_banks, v_targets
    from jsonb_array_elements(coalesce(p_payload->'allocations', '[]'::jsonb)) a2;
  if v_type = 'FX_DIFFERENCE' then
    if v_banks <> 0 then
      raise exception 'FX_DIFFERENCE is a review-only assertion — no numeric cross-currency allocation (no invented rate)';
    end if;
  else
    if v_banks < 1 or v_targets < 1 then raise exception 'an assertion needs allocations on both sides'; end if;
    if v_type = 'ONE_TO_ONE'   and not (v_banks = 1 and v_targets = 1) then raise exception 'cardinality mismatch: ONE_TO_ONE requires 1↔1 (got % banks, % targets)', v_banks, v_targets; end if;
    if v_type = 'MANY_TO_ONE'  and not (v_banks = 1 and v_targets > 1) then raise exception 'cardinality mismatch: MANY_TO_ONE = many internal targets ↔ one bank txn'; end if;
    if v_type = 'ONE_TO_MANY'  and not (v_banks > 1 and v_targets = 1) then raise exception 'cardinality mismatch: ONE_TO_MANY = one internal target ↔ many bank txns'; end if;
    if v_type = 'MANY_TO_MANY' and not (v_banks > 1 and v_targets > 1) then raise exception 'cardinality mismatch: MANY_TO_MANY requires both sides > 1'; end if;
    if v_type in ('PARTIAL','FEE_DIFFERENCE','DATE_DIFFERENCE') and not (v_banks = 1 and v_targets = 1) then
      raise exception 'cardinality mismatch: % is a 1↔1 shape', v_type;
    end if;
  end if;

  -- REC-002 بنيويًا + العتبات من اللقطة الثابتة (لا إعادة معايرة)
  if v_mode = 'AUTO' then
    if v_type = 'MANY_TO_MANY' then raise exception 'MANY_TO_MANY is never AUTO'; end if;
    if not v_override then
      if v_score < v_s.auto_threshold_bp then
        raise exception 'AUTO below the active auto threshold is structurally impossible';
      end if;
      if v_mf < 2 then
        raise exception 'REC-002: amount alone never auto-confirms — corroboration required';
      end if;
    end if;
  end if;

  -- أهلية Stage 9: مستبعد EXACT الجديد؛ المشتبه معلّق حتى حسم DISTINCT
  for a in select * from jsonb_array_elements(coalesce(p_payload->'allocations', '[]'::jsonb)) loop
    if exists (
      select 1 from public.acc_bank_duplicate_candidates c
      where c.transaction_id = (a->>'bank_transaction_id')::uuid
        and ( c.kind = 'EXACT_DUPLICATE'
           or (c.kind = 'SUSPECTED_DUPLICATE' and not exists (
                 select 1 from public.acc_recon_duplicate_resolutions dr
                 where dr.candidate_id = c.id and dr.decision = 'DISTINCT'))
           or (c.kind = 'SUSPECTED_DUPLICATE' and exists (
                 select 1 from public.acc_recon_duplicate_resolutions dr
                 where dr.candidate_id = c.id and dr.decision = 'DUPLICATE')))
    ) then
      raise exception 'bank transaction is excluded or held by Stage 9 duplicate evidence';
    end if;
  end loop;

  v_state := case when v_manual then 'MANUALLY_MATCHED'
                  when v_mode = 'AUTO' then 'CONFIRMED'
                  else 'SUGGESTED' end;

  -- AUTO يقفل السعة فورًا: قفل استشاري مرتب للطرفين ضد السباق
  if v_state = 'CONFIRMED' then
    for a in select e from jsonb_array_elements(p_payload->'allocations') e
             order by e->>'bank_transaction_id', e->>'target_kind', e->>'target_id' loop
      perform pg_advisory_xact_lock(hashtextextended((a->>'bank_transaction_id'), 42));
      perform pg_advisory_xact_lock(hashtextextended((a->>'target_kind') || ':' || (a->>'target_id'), 42));
    end loop;
  end if;

  insert into public.acc_reconciliations
    (company_id, run_id, settings_id, settings_version, match_type, mode, state,
     score_bp, coverage_bp, matched_factors, deterministic_override, deterministic_reference,
     difference_minor, difference_reason, created_source, created_by)
  values
    (coalesce((p_payload->>'company_id')::uuid, v_run.company_id), p_run, v_s.id, v_s.version,
     v_type, v_mode, v_state, v_score, v_cov, v_mf, v_override, v_ref,
     v_diff, v_diff_reason,
     case when v_manual then 'HUMAN' else 'SYSTEM' end,
     p_actor)
  returning id into v_id;

  perform set_config('acc.recon_op', v_id::text, true);
  for a in select * from jsonb_array_elements(coalesce(p_payload->'allocations', '[]'::jsonb)) loop
    insert into public.acc_recon_allocations
      (reconciliation_id, company_id, bank_transaction_id, target_kind, target_id,
       allocated_minor, currency, expected_direction, layer_key)
    values
      (v_id, coalesce((p_payload->>'company_id')::uuid, v_run.company_id),
       (a->>'bank_transaction_id')::uuid, a->>'target_kind', (a->>'target_id')::uuid,
       (a->>'allocated_minor')::bigint, a->>'currency', a->>'expected_direction', a->>'layer_key');
  end loop;
  for f in select * from jsonb_array_elements(coalesce(p_payload->'factors', '[]'::jsonb)) loop
    insert into public.acc_recon_factor_evidence
      (reconciliation_id, company_id, factor_key, available, matched, weight_bp, contribution_bp, provenance)
    values
      (v_id, coalesce((p_payload->>'company_id')::uuid, v_run.company_id),
       f->>'factor_key', (f->>'available')::boolean, (f->>'matched')::boolean,
       (f->>'weight_bp')::integer, (f->>'contribution_bp')::integer, coalesce(f->'provenance', '{}'::jsonb));
  end loop;
  perform set_config('acc.recon_op', '', true);

  -- الفترة الحاكمة: AUTO المؤكد يمتنع عند فترة مقفلة/مؤرشفة (الحارس البشري
  -- في confirm يفحصها أيضًا) — الفحص عبر تخصيصات الهدف
  if v_state = 'CONFIRMED' then
    for v_period in
      select fp.state as pstate from public.acc_recon_allocations al
      join public.acc_recon_resolve_target(al.company_id,
        (select t.bank_account_id from public.acc_bank_transactions t where t.id = al.bank_transaction_id),
        al.target_kind, al.target_id) rt on true
      left join public.acc_fiscal_periods fp on fp.id = rt.period_id
      where al.reconciliation_id = v_id
    loop
      if v_period.pstate in ('CLOSED','ARCHIVED') then
        -- الرفض بنيوي هنا؛ الحدث الدائم يسجّله المحرك بنداء مستقل بعد
        -- الالتقاط (درس Stage 7: الكتابة ثم raise في نفس النداء تُلغى)
        raise exception 'CLOSED_PERIOD_CONFLICT: confirmation blocked for a closed/archived period target';
      end if;
    end loop;
  end if;

  perform public.acc_audit(coalesce((p_payload->>'company_id')::uuid, v_run.company_id), p_actor,
    case when v_manual then 'RECON_MANUAL_MATCH_CREATED'
         when v_mode = 'AUTO' and v_override then 'RECON_DETERMINISTIC_MATCH_FOUND'
         when v_mode = 'AUTO' then 'RECON_AUTO_CONFIRMED'
         else 'RECON_SUGGESTION_CREATED' end,
    'acc_reconciliations', v_id::text, null,
    jsonb_build_object('match_type', v_type, 'mode', v_mode, 'state', v_state,
      'score_bp', v_score, 'coverage_bp', v_cov, 'matched_factors', v_mf,
      'deterministic_override', v_override, 'reference', v_ref,
      'settings_version', v_s.version, 'banks', v_banks, 'targets', v_targets),
    'acc_recon_create_assertion');
  return query select v_id, v_state;
end $$;
revoke execute on function public.acc_recon_create_assertion(uuid,uuid,jsonb) from public, anon;
grant  execute on function public.acc_recon_create_assertion(uuid,uuid,jsonb) to service_role;
grant  execute on function public.acc_recon_create_assertion(uuid,uuid,jsonb) to authenticated;  -- المسار اليدوي p_run=null فقط (يفرضه الجسد)

-- تسجيل حدث/استثناء من المحرك
create function public.acc_recon_record_event(
  p_run uuid, p_bank_txn uuid, p_condition text, p_blocking boolean, p_detail jsonb
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_run record;
begin
  select r.* into v_run from public.acc_recon_runs r where r.id = p_run;
  if not found then raise exception 'unknown run'; end if;
  insert into public.acc_recon_events (company_id, run_id, bank_transaction_id, condition, blocking, detail)
  values (v_run.company_id, p_run, p_bank_txn, p_condition, p_blocking, p_detail);
  perform public.acc_audit(v_run.company_id, v_run.initiated_by, 'RECON_EXCEPTION_CREATED',
    'acc_recon_events', coalesce(p_bank_txn::text, p_run::text), null,
    jsonb_build_object('condition', p_condition, 'blocking', p_blocking), 'acc_recon_record_event');
end $$;
revoke execute on function public.acc_recon_record_event(uuid,uuid,text,boolean,jsonb) from public, anon, authenticated;
grant  execute on function public.acc_recon_record_event(uuid,uuid,text,boolean,jsonb) to service_role;

-- ─────────────────────────────────────────────
-- ١١ · الأفعال البشرية: تأكيد/رفض/قفل/عكس/حسم التكرار
-- ─────────────────────────────────────────────
create function public.acc_recon_confirm(p_reconciliation uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_rec record; al record; v_t record; v_txn record;
        v_used bigint; v_pstate text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_rec from public.acc_reconciliations r where r.id = p_reconciliation;
  if not found then raise exception 'unknown reconciliation'; end if;
  if coalesce(public.acc_role(v_rec.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'confirmation requires ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_rec.state not in ('SUGGESTED','MANUALLY_MATCHED') then
    raise exception 'only SUGGESTED or MANUALLY_MATCHED assertions are confirmed (state %)', v_rec.state;
  end if;
  if v_rec.match_type = 'MANY_TO_MANY' and v_rec.mode = 'AUTO' then
    raise exception 'MANY_TO_MANY is never auto-born';  -- دفاع مضاعف
  end if;
  -- سباق التأكيد: أقفال مرتبة ثم فحص سعة نهائي + فترة حاكمة
  for al in select * from public.acc_recon_allocations a
             where a.reconciliation_id = p_reconciliation
             order by a.bank_transaction_id, a.target_kind, a.target_id loop
    perform pg_advisory_xact_lock(hashtextextended(al.bank_transaction_id::text, 42));
    perform pg_advisory_xact_lock(hashtextextended(al.target_kind || ':' || al.target_id::text, 42));
  end loop;
  for al in select * from public.acc_recon_allocations a where a.reconciliation_id = p_reconciliation loop
    select * into v_txn from public.acc_bank_transactions t where t.id = al.bank_transaction_id;
    select coalesce(sum(a2.allocated_minor), 0) into v_used
      from public.acc_recon_allocations a2
      join public.acc_reconciliations r2 on r2.id = a2.reconciliation_id
     where a2.bank_transaction_id = al.bank_transaction_id
       and r2.state in ('CONFIRMED','LOCKED');
    if v_used + al.allocated_minor > abs(v_txn.amount_minor)
       and v_rec.match_type <> 'FEE_DIFFERENCE' then
      raise exception 'double consumption blocked: bank capacity already used (% + % > %)',
        v_used, al.allocated_minor, abs(v_txn.amount_minor);
    end if;
    select * into v_t from public.acc_recon_resolve_target(
      al.company_id, v_txn.bank_account_id, al.target_kind, al.target_id);
    select coalesce(sum(a2.allocated_minor), 0) into v_used
      from public.acc_recon_allocations a2
      join public.acc_reconciliations r2 on r2.id = a2.reconciliation_id
     where a2.company_id = al.company_id and a2.target_kind = al.target_kind
       and a2.target_id = al.target_id and r2.state in ('CONFIRMED','LOCKED');
    if v_used + al.allocated_minor > v_t.eligible_minor then
      raise exception 'double consumption blocked: target capacity already used';
    end if;
    select fp.state into v_pstate from public.acc_fiscal_periods fp where fp.id = v_t.period_id;
    if v_pstate in ('CLOSED','ARCHIVED') then
      raise exception 'CLOSED_PERIOD_CONFLICT: reopen through the governed Stage 3 path first';
    end if;
  end loop;
  perform set_config('acc.recon_op', p_reconciliation::text, true);
  update public.acc_reconciliations r
     set state = 'CONFIRMED', confirmed_by = v_user, confirmed_at = now()
   where r.id = p_reconciliation;
  perform set_config('acc.recon_op', '', true);
  perform public.acc_audit(v_rec.company_id, v_user, 'RECON_CONFIRMED', 'acc_reconciliations',
    p_reconciliation::text, jsonb_build_object('state', v_rec.state),
    jsonb_build_object('state', 'CONFIRMED'), 'acc_recon_confirm');
end $$;
revoke execute on function public.acc_recon_confirm(uuid) from public, anon;
grant  execute on function public.acc_recon_confirm(uuid) to authenticated;

create function public.acc_recon_reject(p_reconciliation uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_rec record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a written rejection reason is required'; end if;
  select * into v_rec from public.acc_reconciliations r where r.id = p_reconciliation;
  if not found then raise exception 'unknown reconciliation'; end if;
  if coalesce(public.acc_role(v_rec.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'rejection requires ACCOUNTANT or FINANCE_MANAGER';
  end if;
  perform set_config('acc.recon_op', p_reconciliation::text, true);
  update public.acc_reconciliations r
     set state = 'REJECTED', rejected_by = v_user, rejected_reason = p_reason
   where r.id = p_reconciliation;
  perform set_config('acc.recon_op', '', true);
  perform public.acc_audit(v_rec.company_id, v_user, 'RECON_REJECTED', 'acc_reconciliations',
    p_reconciliation::text, jsonb_build_object('state', v_rec.state),
    jsonb_build_object('state', 'REJECTED', 'reason', p_reason), 'acc_recon_reject');
end $$;
revoke execute on function public.acc_recon_reject(uuid,text) from public, anon;
grant  execute on function public.acc_recon_reject(uuid,text) to authenticated;

create function public.acc_recon_lock(p_reconciliation uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_rec record; al record; v_t record; v_pstate text; v_txn record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_rec from public.acc_reconciliations r where r.id = p_reconciliation;
  if not found then raise exception 'unknown reconciliation'; end if;
  if coalesce(public.acc_role(v_rec.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'locking is the ACCOUNTANT''s act';
  end if;
  if v_rec.state <> 'CONFIRMED' then raise exception 'only CONFIRMED reconciliations are locked'; end if;
  -- SOFT_CLOSED: التأكيد جائز والقفل ممنوع (مرآة دلالات Stage 3)
  for al in select * from public.acc_recon_allocations a where a.reconciliation_id = p_reconciliation loop
    select * into v_txn from public.acc_bank_transactions t where t.id = al.bank_transaction_id;
    select * into v_t from public.acc_recon_resolve_target(
      al.company_id, v_txn.bank_account_id, al.target_kind, al.target_id);
    select fp.state into v_pstate from public.acc_fiscal_periods fp where fp.id = v_t.period_id;
    if v_pstate in ('SOFT_CLOSED','CLOSED','ARCHIVED') then
      raise exception 'locking is blocked while the governing period is %', v_pstate;
    end if;
  end loop;
  perform set_config('acc.recon_op', p_reconciliation::text, true);
  update public.acc_reconciliations r
     set state = 'LOCKED', locked_by = v_user, locked_at = now()
   where r.id = p_reconciliation;
  perform set_config('acc.recon_op', '', true);
  perform public.acc_audit(v_rec.company_id, v_user, 'RECON_LOCKED', 'acc_reconciliations',
    p_reconciliation::text, jsonb_build_object('state', 'CONFIRMED'),
    jsonb_build_object('state', 'LOCKED'), 'acc_recon_lock');
end $$;
revoke execute on function public.acc_recon_lock(uuid) from public, anon;
grant  execute on function public.acc_recon_lock(uuid) to authenticated;

create function public.acc_recon_request_reversal(p_reconciliation uuid, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_rec record; v_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_rec from public.acc_reconciliations r where r.id = p_reconciliation;
  if not found then raise exception 'unknown reconciliation'; end if;
  if coalesce(public.acc_role(v_rec.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'reversal requests require ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_rec.state not in ('CONFIRMED','LOCKED') then
    raise exception 'only CONFIRMED/LOCKED reconciliations are reversible';
  end if;
  insert into public.acc_recon_reversals (company_id, reconciliation_id, reason, requested_by)
  values (v_rec.company_id, p_reconciliation, p_reason, v_user)
  returning id into v_id;
  perform public.acc_audit(v_rec.company_id, v_user, 'RECON_REVERSAL_REQUESTED', 'acc_recon_reversals',
    v_id::text, null, jsonb_build_object('reconciliation', p_reconciliation, 'reason', p_reason),
    'acc_recon_request_reversal');
  return v_id;
end $$;
revoke execute on function public.acc_recon_request_reversal(uuid,text) from public, anon;
grant  execute on function public.acc_recon_request_reversal(uuid,text) to authenticated;

create function public.acc_recon_approve_reversal(p_reversal uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_rev record; v_rec record; al record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_rev from public.acc_recon_reversals rv where rv.id = p_reversal;
  if not found then raise exception 'unknown reversal request'; end if;
  if coalesce(public.acc_role(v_rev.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'reversal approval is the ACCOUNTANT''s act';
  end if;
  if v_user = v_rev.requested_by then
    raise exception 'the approver must differ from the requester';
  end if;
  if v_rev.status <> 'REQUESTED' then raise exception 'reversal already decided'; end if;
  select * into v_rec from public.acc_reconciliations r where r.id = v_rev.reconciliation_id;
  -- تسلسل العكس ضد تخصيص جديد: نفس الأقفال المرتبة
  for al in select * from public.acc_recon_allocations a
             where a.reconciliation_id = v_rev.reconciliation_id
             order by a.bank_transaction_id, a.target_kind, a.target_id loop
    perform pg_advisory_xact_lock(hashtextextended(al.bank_transaction_id::text, 42));
    perform pg_advisory_xact_lock(hashtextextended(al.target_kind || ':' || al.target_id::text, 42));
  end loop;
  perform set_config('acc.recon_op', p_reversal::text, true);
  update public.acc_recon_reversals rv
     set status = 'APPROVED', decided_by = v_user, decided_at = now()
   where rv.id = p_reversal;
  perform set_config('acc.recon_op', v_rev.reconciliation_id::text, true);
  update public.acc_reconciliations r set state = 'REVERSED' where r.id = v_rev.reconciliation_id;
  perform set_config('acc.recon_op', '', true);
  perform public.acc_audit(v_rev.company_id, v_user, 'RECON_REVERSAL_APPROVED', 'acc_recon_reversals',
    p_reversal::text, jsonb_build_object('status', 'REQUESTED'),
    jsonb_build_object('status', 'APPROVED'), 'acc_recon_approve_reversal');
  perform public.acc_audit(v_rev.company_id, v_user, 'RECON_REVERSED', 'acc_reconciliations',
    v_rev.reconciliation_id::text, jsonb_build_object('state', v_rec.state),
    jsonb_build_object('state', 'REVERSED'), 'acc_recon_approve_reversal');
end $$;
revoke execute on function public.acc_recon_approve_reversal(uuid) from public, anon;
grant  execute on function public.acc_recon_approve_reversal(uuid) to authenticated;

create function public.acc_recon_resolve_duplicate(p_candidate uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_c record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_c from public.acc_bank_duplicate_candidates c where c.id = p_candidate;
  if not found then raise exception 'unknown duplicate candidate'; end if;
  if coalesce(public.acc_role(v_c.company_id), '') not in ('ACCOUNTANT','FINANCE_MANAGER') then
    raise exception 'duplicate resolution requires ACCOUNTANT or FINANCE_MANAGER';
  end if;
  if v_c.kind <> 'SUSPECTED_DUPLICATE' then
    raise exception 'EXACT_DUPLICATE is a final deterministic Stage 9 conclusion — no reinterpretation';
  end if;
  insert into public.acc_recon_duplicate_resolutions (company_id, candidate_id, decision, reason, resolved_by)
  values (v_c.company_id, p_candidate, p_decision, p_reason, v_user);
  perform public.acc_audit(v_c.company_id, v_user, 'RECON_EXCEPTION_CREATED',
    'acc_recon_duplicate_resolutions', p_candidate::text, null,
    jsonb_build_object('decision', p_decision, 'reason', p_reason), 'acc_recon_resolve_duplicate');
end $$;
revoke execute on function public.acc_recon_resolve_duplicate(uuid,text,text) from public, anon;
grant  execute on function public.acc_recon_resolve_duplicate(uuid,text,text) to authenticated;
