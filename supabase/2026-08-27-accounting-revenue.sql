-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 5: REVENUE
-- عقود الإيراد · جداول الاعتراف المثبتة · الإيراد المؤجل ·
-- حل نسخ السياسات · الوسم المؤقت · الاستهلاك المرتبط بالدفتر
-- (Git فقط — لا تُطبَّق قبل مراجعة صاحبة المنصة · فوق هجرات
--  Stage 1..4 المعتمدة ولا تعدّلها)
--
-- القاعدة غير القابلة للتفاوض (REV-001): الاعتراف يتبع **الأداء** —
-- لا القبض ولا إصدار الفاتورة ولا نجاح الدفع ولا وصول البنك.
--
-- ⛔ BLOCKED GL POSTING — AUTHORITATIVE MAPPING REQUIRED:
-- لا يوجد دليل حسابات غراس معتمد ولا ربط سياسة→حسابات في السجل،
-- فلا دالة هنا تشتق قيد إيراد/مؤجل آليًا — الاختراع محرم. الاستهلاك
-- (REV-013) يتم بربط الصف بقيدٍ **رحّلته محاسبة الشركة بنفسها** عبر
-- محرك Stage 3 بحساباتها هي (تحقق: نفس الشركة + POSTED) — سلوك
-- fail-closed صحيح لا نقص. حين يُعتمد ربط رسمي تُبنى دالة الترحيل
-- الآلي فوق هذه البنية دون إعادة تصميم.
--
-- سجل السياسات هو الحقيقة (REV-011): كل عقد يحل نسخة سياسة **شركته**
-- السارية بتاريخه عبر acc_resolve_policy من Stage 2 ويجمّدها للأبد —
-- القالب العام هوية لا حكمًا، وغير المعتمد provisional لا يُقدَّم
-- نهائيًا أبدًا (REV-016) ولا ترقية لأي حالة سياسة.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ٠ · ملفات تنفيذ السياسات (ACC-012) — المعالجة بياناتٌ آلية مربوطة
--     بنسخة سياسةٍ بعينها في السجل، لا switch على معرفات في الكود
--     ولا parsing لنثر بشري. الملف امتداد تنفيذي لبيانات السجل —
--     ليس حقيقة محاسبية ثانية: حالته واعتماده من سياسته الأم، وإرفاقه
--     لا يرقّي شيئًا (الاقتراح يبقى اقتراحًا provisional).
-- ─────────────────────────────────────────────
create table if not exists public.acc_policy_execution_profiles (
  id                  uuid primary key default gen_random_uuid(),
  -- 1:1 مع **صف نسخة** بعينه في سجل السياسات — النطاق والحالة يورثان منه
  policy_row_id       uuid not null unique references public.acc_policy_register(id),
  recognition_basis   text not null check (recognition_basis in
                        ('RATABLE_TIME','POINT_IN_TIME','USAGE','EXPIRY','PROSPECTIVE_MODIFICATION')),
  performance_trigger text not null check (performance_trigger in
                        ('SERVICE_PERIOD','DELIVERY_ACCESS','CREDIT_CONSUMPTION','EXPIRY')),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id)
);
create or replace function public.acc_exec_profiles_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_policy_execution_profiles are immutable version-bound data: % refused', tg_op;
end $$;
drop trigger if exists acc_exec_profiles_frozen_trg on public.acc_policy_execution_profiles;
create trigger acc_exec_profiles_frozen_trg
  before update or delete on public.acc_policy_execution_profiles
  for each row execute function public.acc_exec_profiles_frozen();

alter table public.acc_policy_execution_profiles enable row level security;
create policy acc_exec_profiles_select on public.acc_policy_execution_profiles
  for select using (auth.uid() is not null);
revoke insert, update, delete on public.acc_policy_execution_profiles from anon, authenticated;

-- بذر ملفات تنفيذ **اقتراحات** §17 على قوالبها العامة v1 — تمثيل آلي
-- للمقترح لأغراض sandbox/provisional؛ لا اعتماد ولا حكم إنتاج
insert into public.acc_policy_execution_profiles (policy_row_id, recognition_basis, performance_trigger)
select r.id,
       case r.policy_id
         when 'POL-004' then 'POINT_IN_TIME'
         when 'POL-005' then 'USAGE'
         when 'POL-006' then 'EXPIRY'
         when 'POL-007' then 'PROSPECTIVE_MODIFICATION'
         else 'RATABLE_TIME' end,
       case r.policy_id
         when 'POL-004' then 'DELIVERY_ACCESS'
         when 'POL-005' then 'CREDIT_CONSUMPTION'
         when 'POL-006' then 'EXPIRY'
         else 'SERVICE_PERIOD' end
from public.acc_policy_register r
where r.company_id is null and r.version = 1
  and r.policy_id in ('POL-001','POL-002','POL-003','POL-004','POL-005','POL-006','POL-007')
on conflict (policy_row_id) do nothing;

-- إيجاد صف النسخة المحلولة + ملفها التنفيذي — غيابه = رفض صريح (ACC-012)
create or replace function public.acc_resolved_execution_profile(
  p_company uuid, p_policy_id text, p_version integer, p_scope text
)
returns public.acc_policy_execution_profiles
language plpgsql stable security definer set search_path to 'public' as $$
declare v_row uuid; v_prof public.acc_policy_execution_profiles;
begin
  select r.id into v_row from public.acc_policy_register r
  where r.policy_id = p_policy_id and r.version = p_version
    and ((p_scope = 'COMPANY' and r.company_id = p_company)
         or (p_scope = 'GLOBAL_TEMPLATE' and r.company_id is null));
  if v_row is null then raise exception 'resolved policy version row not found'; end if;
  select * into v_prof from public.acc_policy_execution_profiles where policy_row_id = v_row;
  if v_prof.id is null then
    raise exception 'policy % v% has no machine-readable execution profile — treatment is never hardcoded (ACC-012)',
      p_policy_id, p_version;
  end if;
  return v_prof;
end $$;
revoke execute on function public.acc_resolved_execution_profile(uuid,text,integer,text) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ١ · عقود الإيراد — الجسر من وثيقة Stage 4 إلى الاعتراف
-- ─────────────────────────────────────────────
create table if not exists public.acc_revenue_contracts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.acc_companies(id),
  customer_id        uuid not null references public.acc_customers(id),
  invoice_id         uuid not null references public.acc_invoices(id),
  invoice_line_id    uuid not null references public.acc_invoice_lines(id),
  product_id         uuid not null references public.acc_products(id),
  kind               text not null check (kind in ('SUBSCRIPTION','ONE_TIME','AI_CREDITS')),
  service_start      date,
  service_end        date,
  amount_minor       bigint not null check (amount_minor > 0),
  currency           char(3) not null references public.acc_currencies(code),
  -- تجميد هوية السياسة المحكِّمة (REV-011): المعرف والنسخة والحالة
  -- المستخدمة لحظة الإنشاء — لا استبدال نسخة اليوم بالتاريخ أبدًا
  revenue_policy_id  text not null check (revenue_policy_id ~ '^POL-[0-9]{3}$'),
  policy_version     integer not null,
  policy_status_used text not null,
  policy_scope_used  text not null check (policy_scope_used in ('COMPANY','GLOBAL_TEMPLATE')),
  -- المعالجة الآلية المستخدمة — من ملف تنفيذ النسخة المحلولة (ACC-012)
  recognition_basis   text not null,
  performance_trigger text not null,
  -- REV-016: غير المعتمد = provisional في كل ما يتولد عنه، ولا يضيع الوسم
  provisional        boolean not null,
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  check (kind <> 'SUBSCRIPTION' or (service_start is not null and service_end is not null
                                    and service_start <= service_end)),
  unique (invoice_line_id)  -- سطر فاتورة واحد = عقد إيراد واحد
);
create index if not exists acc_rev_contracts_company_idx on public.acc_revenue_contracts (company_id);

-- ─────────────────────────────────────────────
-- ٢ · جداول الاعتراف وصفوفها — مثبتة، لا تُحسب تاريخيًا عند الطلب
--     (REV-005/012/013)
-- ─────────────────────────────────────────────
create table if not exists public.acc_recognition_schedules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.acc_companies(id),
  contract_id    uuid not null references public.acc_revenue_contracts(id),
  total_minor    bigint not null check (total_minor > 0),
  currency       char(3) not null references public.acc_currencies(code),
  provisional    boolean not null,
  status         text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED')),
  superseded_by  uuid references public.acc_recognition_schedules(id),
  reason         text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);
create index if not exists acc_rev_schedules_contract_idx on public.acc_recognition_schedules (contract_id);

create table if not exists public.acc_recognition_rows (
  id                uuid primary key default gen_random_uuid(),
  schedule_id       uuid not null references public.acc_recognition_schedules(id),
  company_id        uuid not null references public.acc_companies(id),
  position          integer not null,
  recognition_date  date not null,
  amount_minor      bigint not null check (amount_minor > 0),
  provisional       boolean not null,
  -- OPEN → CONSUMED (بقيد مرحّل) أو OPEN → SUPERSEDED (تعديل مستقبلي)
  state             text not null default 'OPEN' check (state in ('OPEN','CONSUMED','SUPERSEDED')),
  consumed_at       timestamptz,
  -- مرجع القيد المرحّل الذي جسّد الاعتراف — مرة واحدة على الأكثر.
  -- بلا ربط حسابات معتمد لا برهانَ آليًا أن القيد يمثل الصف — الدليل
  -- الموثوق هو **شهادة المحاسبة البشرية** الصريحة، معلنةً كذلك لا
  -- كتحقق آلي مزعوم (ACCOUNTANT_ATTESTED_MANUAL)
  journal_entry_id  uuid references public.acc_journal_entries(id),
  consumption_basis text check (consumption_basis in ('ACCOUNTANT_ATTESTED_MANUAL')),
  attested_by       uuid references auth.users(id),
  attested_at       timestamptz,
  attestation_reason text,
  -- دليل الأداء (تسليم/استهلاك رصيد/كسر معتمد) حيث يوجد
  performance_evidence text,
  created_at        timestamptz not null default now()
);
create index if not exists acc_rev_rows_schedule_idx on public.acc_recognition_rows (schedule_id, position);
create index if not exists acc_rev_rows_open_idx on public.acc_recognition_rows (company_id, state, recognition_date);

-- أحداث استهلاك أرصدة AI — append-only وidempotent (REV-007)
create table if not exists public.acc_credit_consumptions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.acc_companies(id),
  contract_id     uuid not null references public.acc_revenue_contracts(id),
  amount_minor    bigint not null check (amount_minor > 0),
  occurred_at     timestamptz not null,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  unique (company_id, idempotency_key)
);

-- ─────────────────────────────────────────────
-- ٣ · الحراس — التاريخ لا يُعاد حسابه (REV-013/015)
--     كل التوقيعات fail-closed منذ الولادة (درس Stage 4):
--     coalesce + مقارنة صريحة — NULL لا يخوّل شيئًا أبدًا
-- ─────────────────────────────────────────────
create or replace function public.acc_rev_contracts_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_revenue_contracts are never deleted — revenue history is permanent';
  end if;
  -- كل شيء ما عدا الحالة مجمّد: الهوية والمبلغ والسياسة المجمّدة
  if new.company_id is distinct from old.company_id
     or new.invoice_line_id is distinct from old.invoice_line_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.revenue_policy_id is distinct from old.revenue_policy_id
     or new.policy_version is distinct from old.policy_version
     or new.policy_status_used is distinct from old.policy_status_used
     or new.provisional is distinct from old.provisional
     or new.created_at is distinct from old.created_at then
    raise exception 'a revenue contract is immutable evidence — its frozen policy version never changes';
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('acc.revenue_op', true), '') <> old.id::text then
    raise exception 'contract status changes only through the signed revenue operations';
  end if;
  return new;
end $$;
drop trigger if exists acc_rev_contracts_guard_trg on public.acc_revenue_contracts;
create trigger acc_rev_contracts_guard_trg
  before update or delete on public.acc_revenue_contracts
  for each row execute function public.acc_rev_contracts_guard();

create or replace function public.acc_rev_schedules_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_recognition_schedules are never deleted (REV-005)';
  end if;
  if new.company_id is distinct from old.company_id
     or new.contract_id is distinct from old.contract_id
     or new.total_minor is distinct from old.total_minor
     or new.currency is distinct from old.currency
     or new.provisional is distinct from old.provisional
     or new.created_at is distinct from old.created_at then
    raise exception 'a recognition schedule is immutable — modifications create a successor (REV-015)';
  end if;
  if (new.status is distinct from old.status or new.superseded_by is distinct from old.superseded_by)
     and coalesce(current_setting('acc.revenue_op', true), '') <> old.id::text then
    raise exception 'schedule supersession only through the signed modification operation';
  end if;
  return new;
end $$;
drop trigger if exists acc_rev_schedules_guard_trg on public.acc_recognition_schedules;
create trigger acc_rev_schedules_guard_trg
  before update or delete on public.acc_recognition_schedules
  for each row execute function public.acc_rev_schedules_guard();

-- الصفوف: المستهلك مجمّد بايتًا-ببايت للأبد؛ OPEN يتحول بتوقيع فقط
create or replace function public.acc_rev_rows_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_recognition_rows are never deleted — history is never recomputed (REV-013)';
  end if;
  if old.state = 'CONSUMED' then
    raise exception 'a consumed recognition row is immutable forever (REV-013/015)';
  end if;
  if old.state = 'SUPERSEDED' then
    raise exception 'a superseded recognition row is frozen history';
  end if;
  if new.schedule_id is distinct from old.schedule_id
     or new.company_id is distinct from old.company_id
     or new.position is distinct from old.position
     or new.recognition_date is distinct from old.recognition_date
     or new.amount_minor is distinct from old.amount_minor
     or new.provisional is distinct from old.provisional
     or new.created_at is distinct from old.created_at then
    raise exception 'recognition row facts are immutable — only its state moves through signed operations';
  end if;
  if new.state is distinct from old.state
     and coalesce(current_setting('acc.revenue_op', true), '') <> old.id::text then
    raise exception 'row state changes only through the signed revenue operations';
  end if;
  if new.state = 'CONSUMED'
     and (new.journal_entry_id is null or new.consumption_basis is null
          or new.attested_by is null or new.attested_at is null
          or new.attestation_reason is null or btrim(new.attestation_reason) = '') then
    raise exception 'consumption requires the posted journal plus an explicit human attestation (basis, attester, reason)';
  end if;
  return new;
end $$;
drop trigger if exists acc_rev_rows_guard_trg on public.acc_recognition_rows;
create trigger acc_rev_rows_guard_trg
  before update or delete on public.acc_recognition_rows
  for each row execute function public.acc_rev_rows_guard();

create or replace function public.acc_credit_consumptions_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_credit_consumptions are append-only idempotent events: % refused', tg_op;
end $$;
drop trigger if exists acc_credit_consumptions_frozen_trg on public.acc_credit_consumptions;
create trigger acc_credit_consumptions_frozen_trg
  before update or delete on public.acc_credit_consumptions
  for each row execute function public.acc_credit_consumptions_frozen();

-- ─────────────────────────────────────────────
-- ٤ · RLS — الداخل الإيرادي الخام للمهنيين فقط
-- ─────────────────────────────────────────────
alter table public.acc_revenue_contracts     enable row level security;
alter table public.acc_recognition_schedules enable row level security;
alter table public.acc_recognition_rows      enable row level security;
alter table public.acc_credit_consumptions   enable row level security;

create policy acc_rev_contracts_select on public.acc_revenue_contracts
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_rev_schedules_select on public.acc_recognition_schedules
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_rev_rows_select on public.acc_recognition_rows
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_credit_consumptions_select on public.acc_credit_consumptions
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));

revoke insert, update, delete on public.acc_revenue_contracts     from anon, authenticated;
revoke insert, update, delete on public.acc_recognition_schedules from anon, authenticated;
revoke insert, update, delete on public.acc_recognition_rows      from anon, authenticated;
revoke insert, update, delete on public.acc_credit_consumptions   from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٥ · مساعدات: دور المحاسبة + توليد صفوف رِبّية تامة
-- ─────────────────────────────────────────────
create or replace function public.acc_assert_accountant(p_company uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if public.acc_role(p_company) is distinct from 'ACCOUNTANT' then
    raise exception 'revenue operations require the ACCOUNTANT role in this company';
  end if;
  return v_user;
end $$;
revoke execute on function public.acc_assert_accountant(uuid) from public, anon, authenticated;

-- التوزيع الرِّبّي التام (REV-014): n صفوف شهرية، القسمة الصحيحة
-- floor لكل صف والبقية **كلها للصف الأخير** (القرار الافتراضي الموثق
-- ما لم تقل السياسة الحاكمة غيره) — Σ الصفوف = المبلغ بالتمام:
-- لا فلس يضيع ولا فلس يُصنع.
create or replace function public.acc_generate_rateable_rows(
  p_schedule uuid, p_company uuid, p_amount bigint, p_provisional boolean,
  p_start date, p_end date
)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_months integer; v_base bigint; v_i integer; v_amt bigint; v_d date;
begin
  v_months := (extract(year from p_end)::int - extract(year from p_start)::int) * 12
              + (extract(month from p_end)::int - extract(month from p_start)::int) + 1;
  if v_months < 1 then raise exception 'the service interval must span at least one month'; end if;
  v_base := p_amount / v_months;  -- قسمة صحيحة floor
  if v_base = 0 then raise exception 'the amount is too small to spread over % months', v_months; end if;
  for v_i in 1..v_months loop
    v_amt := case when v_i = v_months then p_amount - v_base * (v_months - 1) else v_base end;
    v_d := (date_trunc('month', p_start) + make_interval(months => v_i - 1)
            + make_interval(months => 1) - interval '1 day')::date; -- آخر يوم بشهر الخدمة
    insert into public.acc_recognition_rows
      (schedule_id, company_id, position, recognition_date, amount_minor, provisional)
    values (p_schedule, p_company, v_i, least(v_d, p_end), v_amt, p_provisional);
  end loop;
  return v_months;
end $$;
revoke execute on function public.acc_generate_rateable_rows(uuid,uuid,bigint,boolean,date,date) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ٦ · إنشاء عقد إيراد + جدوله (REV-002/003/005/011/012/016)
-- ─────────────────────────────────────────────
create or replace function public.acc_create_revenue_contract(
  p_invoice_line uuid,
  p_kind text,
  p_service_start date default null,
  p_service_end date default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid; v_line record; v_inv record; v_pol record;
  v_contract uuid; v_schedule uuid; v_provisional boolean;
begin
  select * into v_line from public.acc_invoice_lines where id = p_invoice_line;
  if not found then raise exception 'unknown invoice line'; end if;
  v_user := public.acc_assert_accountant(v_line.company_id);
  select * into v_inv from public.acc_invoices where id = v_line.invoice_id;
  if v_inv.status in ('DRAFT','DELETED','VOIDED') then
    raise exception 'a revenue contract needs a commercially issued invoice (invoice is %)', v_inv.status;
  end if;
  if v_line.revenue_policy_id is null then
    raise exception 'the invoice line carries no revenue_policy_id snapshot';
  end if;

  -- حل نسخة سياسة **الشركة** السارية بتاريخ المعاملة عبر محلّل Stage 2:
  -- SANDBOX يعطينا النسخة والحالة؛ القالب العام هوية فقط — provisional
  -- دائمًا، ولا يحكم الإنتاج (محلّل PRODUCTION يرفضه بنيويًا)
  select * into v_pol from public.acc_resolve_policy(
    v_line.company_id, v_line.revenue_policy_id,
    coalesce(v_inv.issue_date, current_date), 'SANDBOX');
  if v_pol.policy_id is null or v_pol.refusal is not null then
    raise exception 'no policy version of % is resolvable on the transaction date', v_line.revenue_policy_id;
  end if;
  v_provisional := coalesce(v_pol.is_provisional, true)
                   or v_pol.scope is distinct from 'COMPANY'
                   or v_pol.status is distinct from 'APPROVED';

  -- المعالجة من ملف تنفيذ النسخة المحلولة حصرًا — لا switch على النوع
  -- أو المعرف؛ والنوع المطلوب يجب أن يطابق أساس السياسة وإلا رفض
  declare v_prof public.acc_policy_execution_profiles;
  begin
    v_prof := public.acc_resolved_execution_profile(
      v_line.company_id, v_line.revenue_policy_id, v_pol.version, v_pol.scope);
    if (p_kind = 'SUBSCRIPTION' and v_prof.recognition_basis <> 'RATABLE_TIME')
       or (p_kind = 'ONE_TIME'   and v_prof.recognition_basis <> 'POINT_IN_TIME')
       or (p_kind = 'AI_CREDITS' and v_prof.recognition_basis <> 'USAGE') then
      raise exception 'contract kind % contradicts the resolved policy treatment (% / %) — mismatches are blocked, not guessed',
        p_kind, v_prof.recognition_basis, v_prof.performance_trigger;
    end if;

    insert into public.acc_revenue_contracts
      (company_id, customer_id, invoice_id, invoice_line_id, product_id, kind,
       service_start, service_end, amount_minor, currency,
       revenue_policy_id, policy_version, policy_status_used, policy_scope_used,
       recognition_basis, performance_trigger, provisional, created_by)
    values
      (v_line.company_id, v_inv.customer_id, v_inv.id, v_line.id, v_line.product_id, p_kind,
       p_service_start, p_service_end, v_line.line_amount_minor, v_line.currency,
       v_line.revenue_policy_id, v_pol.version, v_pol.status, v_pol.scope,
       v_prof.recognition_basis, v_prof.performance_trigger, v_provisional, v_user)
    returning id into v_contract;
  end;

  insert into public.acc_recognition_schedules
    (company_id, contract_id, total_minor, currency, provisional, created_by)
  values (v_line.company_id, v_contract, v_line.line_amount_minor, v_line.currency,
          v_provisional, v_user)
  returning id into v_schedule;

  -- التوليد من الأساس الآلي المجمّد على العقد (ACC-012)
  if (select recognition_basis from public.acc_revenue_contracts where id = v_contract) = 'RATABLE_TIME' then
    perform public.acc_generate_rateable_rows(v_schedule, v_line.company_id,
      v_line.line_amount_minor, v_provisional, p_service_start, p_service_end);
  end if;
  -- ONE_TIME: لا صف حتى دليل تسليم حقيقي (الإصدار ليس تسليمًا — REV-001)
  -- AI_CREDITS: لا صفوف حتى أحداث استهلاك idempotent (POL-005)

  perform public.acc_audit(v_line.company_id, v_user, 'REVENUE_CONTRACT_CREATED',
    'acc_revenue_contracts', v_contract::text, null,
    jsonb_build_object('kind', p_kind, 'amount_minor', v_line.line_amount_minor::text,
                       'policy_id', v_line.revenue_policy_id, 'policy_version', v_pol.version,
                       'policy_status', v_pol.status, 'provisional', v_provisional,
                       'schedule', v_schedule),
    'acc_create_revenue_contract');
  return v_contract;
end $$;
revoke execute on function public.acc_create_revenue_contract(uuid,text,date,date) from public, anon;
grant  execute on function public.acc_create_revenue_contract(uuid,text,date,date) to authenticated;

-- ─────────────────────────────────────────────
-- ٧ · الأداء: التسليم (POL-004) والاستهلاك (POL-005) والكسر (POL-006)
-- ─────────────────────────────────────────────
-- تسليم منتج رقمي: دليل أداء حقيقي إلزامي — لا «الإصدار = تسليم»
create or replace function public.acc_record_delivery(
  p_contract uuid, p_occurred_on date, p_evidence text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_c record; v_s record; v_row uuid;
begin
  if p_evidence is null or btrim(p_evidence) = '' then
    raise exception 'delivery needs real performance evidence — invoice issue alone is not delivery (REV-001)';
  end if;
  select * into v_c from public.acc_revenue_contracts where id = p_contract;
  if not found then raise exception 'unknown revenue contract'; end if;
  v_user := public.acc_assert_accountant(v_c.company_id);
  if v_c.kind <> 'ONE_TIME' then raise exception 'delivery applies to ONE_TIME contracts'; end if;
  select * into v_s from public.acc_recognition_schedules
   where contract_id = p_contract and status = 'ACTIVE' limit 1;
  if exists (select 1 from public.acc_recognition_rows where schedule_id = v_s.id) then
    raise exception 'delivery was already recorded for this contract';
  end if;
  insert into public.acc_recognition_rows
    (schedule_id, company_id, position, recognition_date, amount_minor, provisional, performance_evidence)
  values (v_s.id, v_c.company_id, 1, p_occurred_on, v_c.amount_minor, v_c.provisional, btrim(p_evidence))
  returning id into v_row;
  perform public.acc_audit(v_c.company_id, v_user, 'DELIVERY_RECORDED', 'acc_revenue_contracts',
    p_contract::text, null, jsonb_build_object('occurred_on', p_occurred_on, 'evidence', p_evidence, 'row', v_row),
    'acc_record_delivery');
  return v_row;
end $$;
revoke execute on function public.acc_record_delivery(uuid,date,text) from public, anon;
grant  execute on function public.acc_record_delivery(uuid,date,text) to authenticated;

-- استهلاك أرصدة AI — idempotent بمفتاح؛ الرصيد التزام حتى الاستهلاك
create or replace function public.acc_record_credit_consumption(
  p_contract uuid, p_amount_minor bigint, p_occurred_at timestamptz, p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_c record; v_s record; v_used bigint; v_row uuid; v_pos integer;
begin
  select * into v_c from public.acc_revenue_contracts where id = p_contract;
  if not found then raise exception 'unknown revenue contract'; end if;
  v_user := public.acc_assert_accountant(v_c.company_id);
  if v_c.kind <> 'AI_CREDITS' then raise exception 'credit consumption applies to AI_CREDITS contracts'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'consumption needs an idempotency key';
  end if;
  -- idempotency: نفس المفتاح = نفس الحدث، لا تكرار أثر
  if exists (select 1 from public.acc_credit_consumptions
             where company_id = v_c.company_id and idempotency_key = p_idempotency_key) then
    select r.id into v_row from public.acc_recognition_rows r
    join public.acc_recognition_schedules s on s.id = r.schedule_id
    where s.contract_id = p_contract and r.performance_evidence = 'credit:' || p_idempotency_key;
    return v_row;
  end if;
  select coalesce(sum(amount_minor), 0) into v_used
  from public.acc_credit_consumptions where contract_id = p_contract;
  if v_used + p_amount_minor > v_c.amount_minor then
    raise exception 'consumption exceeds the remaining credit liability';
  end if;
  insert into public.acc_credit_consumptions
    (company_id, contract_id, amount_minor, occurred_at, idempotency_key, created_by)
  values (v_c.company_id, p_contract, p_amount_minor, p_occurred_at, btrim(p_idempotency_key), v_user);
  select * into v_s from public.acc_recognition_schedules
   where contract_id = p_contract and status = 'ACTIVE' limit 1;
  select coalesce(max(position), 0) + 1 into v_pos from public.acc_recognition_rows where schedule_id = v_s.id;
  insert into public.acc_recognition_rows
    (schedule_id, company_id, position, recognition_date, amount_minor, provisional, performance_evidence)
  values (v_s.id, v_c.company_id, v_pos, p_occurred_at::date, p_amount_minor, v_c.provisional,
          'credit:' || btrim(p_idempotency_key))
  returning id into v_row;
  perform public.acc_audit(v_c.company_id, v_user, 'CREDIT_CONSUMPTION_RECORDED',
    'acc_revenue_contracts', p_contract::text, null,
    jsonb_build_object('amount_minor', p_amount_minor::text, 'key', p_idempotency_key, 'row', v_row),
    'acc_record_credit_consumption');
  return v_row;
end $$;
revoke execute on function public.acc_record_credit_consumption(uuid,bigint,timestamptz,text) from public, anon;
grant  execute on function public.acc_record_credit_consumption(uuid,bigint,timestamptz,text) to authenticated;

-- كسر الأرصدة (POL-006): محجوب بنيويًا حتى توجد نسخة **شركة معتمدة**
-- من POL-006 (اعتمادها المزدوج محاسِبة+مدقّقة يفرضه Stage 2) — لا
-- افتراض «انتهت الصلاحية = إيراد» أبدًا (REV-008)
create or replace function public.acc_recognize_breakage(p_contract uuid, p_occurred_on date)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_c record; v_pol record; v_s record; v_used bigint; v_rest bigint; v_row uuid; v_pos integer;
begin
  select * into v_c from public.acc_revenue_contracts where id = p_contract;
  if not found then raise exception 'unknown revenue contract'; end if;
  v_user := public.acc_assert_accountant(v_c.company_id);
  if v_c.kind <> 'AI_CREDITS' then raise exception 'breakage applies to AI_CREDITS contracts'; end if;
  select * into v_pol from public.acc_resolve_policy(v_c.company_id, 'POL-006', p_occurred_on, 'PRODUCTION');
  if v_pol.refusal is not null or coalesce(v_pol.governs_production, false) is not true then
    raise exception 'breakage is blocked until POL-006 has an APPROVED company version with its required auditor approval (REV-008)';
  end if;
  declare v_prof public.acc_policy_execution_profiles;
  begin
    v_prof := public.acc_resolved_execution_profile(v_c.company_id, 'POL-006', v_pol.version, v_pol.scope);
    if v_prof.recognition_basis <> 'EXPIRY' then
      raise exception 'the approved POL-006 version does not carry an EXPIRY treatment profile';
    end if;
  end;
  select coalesce(sum(amount_minor), 0) into v_used from public.acc_credit_consumptions where contract_id = p_contract;
  v_rest := v_c.amount_minor - v_used;
  if v_rest <= 0 then raise exception 'no remaining liability to break'; end if;
  select * into v_s from public.acc_recognition_schedules where contract_id = p_contract and status = 'ACTIVE' limit 1;
  select coalesce(max(position), 0) + 1 into v_pos from public.acc_recognition_rows where schedule_id = v_s.id;
  insert into public.acc_recognition_rows
    (schedule_id, company_id, position, recognition_date, amount_minor, provisional, performance_evidence)
  values (v_s.id, v_c.company_id, v_pos, p_occurred_on, v_rest, false, 'breakage:POL-006 v' || v_pol.version)
  returning id into v_row;
  perform public.acc_audit(v_c.company_id, v_user, 'BREAKAGE_RECOGNIZED', 'acc_revenue_contracts',
    p_contract::text, null,
    jsonb_build_object('amount_minor', v_rest::text, 'policy_version', v_pol.version, 'row', v_row),
    'acc_recognize_breakage');
  return v_row;
end $$;
revoke execute on function public.acc_recognize_breakage(uuid,date) from public, anon;
grant  execute on function public.acc_recognize_breakage(uuid,date) to authenticated;

-- ─────────────────────────────────────────────
-- ٨ · الاستهلاك (REV-013) — مرة واحدة على الأكثر، بقيد مرحّل
--     ⛔ لا اشتقاق آلي للقيد: BLOCKED GL POSTING — MAPPING REQUIRED.
--     المحاسبة ترحّل قيدها عبر Stage 3 بحساباتها ثم تربطه هنا؛
--     التحقق: نفس الشركة + POSTED — ذريًا: الربط والحالة معًا.
-- ─────────────────────────────────────────────
create or replace function public.acc_consume_schedule_row(
  p_row uuid, p_journal_entry uuid, p_attestation_reason text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_r record; v_j record;
begin
  -- الشهادة البشرية إلزامية: قيدٌ مرحّل من نفس الشركة **وحده لا يكفي** —
  -- المحاسبة تشهد صراحةً أن هذا القيد هو قيد اعتراف هذا الصف بعينه
  if p_attestation_reason is null or btrim(p_attestation_reason) = '' then
    raise exception 'a same-company POSTED journal alone is not proof — an explicit accountant attestation reason is required';
  end if;
  select * into v_r from public.acc_recognition_rows where id = p_row;
  if not found then raise exception 'unknown recognition row'; end if;
  v_user := public.acc_assert_accountant(v_r.company_id);
  if v_r.state = 'CONSUMED' then
    raise exception 'this row was already recognized — a row creates accounting effect at most once';
  end if;
  if v_r.state <> 'OPEN' then
    raise exception 'only OPEN rows can be consumed (row is %)', v_r.state;
  end if;
  select * into v_j from public.acc_journal_entries where id = p_journal_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  if v_j.company_id <> v_r.company_id then
    raise exception 'the recognition journal must belong to the same company';
  end if;
  if v_j.status <> 'POSTED' then
    raise exception 'recognition needs a POSTED journal (entry is %) — if posting failed the row stays OPEN', v_j.status;
  end if;
  perform set_config('acc.revenue_op', v_r.id::text, true);
  update public.acc_recognition_rows
     set state = 'CONSUMED', consumed_at = now(), journal_entry_id = p_journal_entry,
         consumption_basis = 'ACCOUNTANT_ATTESTED_MANUAL',
         attested_by = v_user, attested_at = now(),
         attestation_reason = btrim(p_attestation_reason)
   where id = p_row;
  perform set_config('acc.revenue_op', '', true);
  perform public.acc_audit(v_r.company_id, v_user, 'REVENUE_ROW_CONSUMED', 'acc_recognition_rows',
    p_row::text, jsonb_build_object('state', 'OPEN'),
    jsonb_build_object('state', 'CONSUMED', 'journal_entry', p_journal_entry,
                       'amount_minor', v_r.amount_minor::text, 'provisional', v_r.provisional,
                       'consumption_basis', 'ACCOUNTANT_ATTESTED_MANUAL',
                       'attestation_reason', btrim(p_attestation_reason)),
    'acc_consume_schedule_row');
end $$;
revoke execute on function public.acc_consume_schedule_row(uuid,uuid,text) from public, anon;
grant  execute on function public.acc_consume_schedule_row(uuid,uuid,text) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · التعديلات الاستباقية (POL-007 · REV-009/015)
--     المستهلك يبقى بايتًا-ببايت؛ المفتوح المستقبلي فقط يُستبدل؛
--     Σ(غير المُلغى) = المبلغ الجديد بالتمام
-- ─────────────────────────────────────────────
create or replace function public.acc_modify_subscription_schedule(
  p_contract uuid, p_new_total bigint, p_effective date, p_reason text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid; v_c record; v_old record; v_new uuid;
  v_kept bigint; v_future bigint; v_r record; v_months integer;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a schedule modification requires a recorded reason';
  end if;
  select * into v_c from public.acc_revenue_contracts where id = p_contract;
  if not found then raise exception 'unknown revenue contract'; end if;
  v_user := public.acc_assert_accountant(v_c.company_id);
  if v_c.kind <> 'SUBSCRIPTION' then raise exception 'prospective modification applies to SUBSCRIPTION contracts'; end if;
  declare v_mpol record; v_mprof public.acc_policy_execution_profiles;
  begin
    select * into v_mpol from public.acc_resolve_policy(v_c.company_id, 'POL-007', p_effective, 'SANDBOX');
    if v_mpol.policy_id is null or v_mpol.refusal is not null then
      raise exception 'no POL-007 version is resolvable on the effective date';
    end if;
    v_mprof := public.acc_resolved_execution_profile(v_c.company_id, 'POL-007', v_mpol.version, v_mpol.scope);
    if v_mprof.recognition_basis <> 'PROSPECTIVE_MODIFICATION' then
      raise exception 'the resolved POL-007 version does not carry a PROSPECTIVE_MODIFICATION profile';
    end if;
  end;
  select * into v_old from public.acc_recognition_schedules
   where contract_id = p_contract and status = 'ACTIVE' limit 1;
  if not found then raise exception 'no active schedule to modify'; end if;

  -- المحفوظ نوعان: المستهلك (يبقى تاريخًا في الجدول القديم بايتًا-ببايت)
  -- والمفتوح السابق لتاريخ السريان (تُنسخ حقائقه للجدول الخليفة كما هي
  -- حتى لا يغيب عن المؤجل، ويُلغى أصله)
  declare v_consumed bigint; v_kept_open bigint;
  begin
    select coalesce(sum(amount_minor), 0) into v_consumed
    from public.acc_recognition_rows where schedule_id = v_old.id and state = 'CONSUMED';
    select coalesce(sum(amount_minor), 0) into v_kept_open
    from public.acc_recognition_rows
    where schedule_id = v_old.id and state = 'OPEN' and recognition_date < p_effective;
    v_kept := v_consumed + v_kept_open;
    v_future := p_new_total - v_kept;
    if v_future <= 0 then
      raise exception 'the new total % cannot be below the already elapsed/consumed %', p_new_total, v_kept;
    end if;

    insert into public.acc_recognition_schedules
      (company_id, contract_id, total_minor, currency, provisional, reason, created_by)
    values (v_c.company_id, p_contract, p_new_total, v_c.currency, v_c.provisional, btrim(p_reason), v_user)
    returning id into v_new;

    -- نسخ حقائق المفتوح-قبل-السريان كما هي إلى الخليفة
    insert into public.acc_recognition_rows
      (schedule_id, company_id, position, recognition_date, amount_minor, provisional, performance_evidence)
    select v_new, company_id, position, recognition_date, amount_minor, provisional, performance_evidence
    from public.acc_recognition_rows
    where schedule_id = v_old.id and state = 'OPEN' and recognition_date < p_effective;

    -- إلغاء كل المفتوح في القديم (المنسوخ والمستقبلي) — المستهلك لا يُمس
    for v_r in select * from public.acc_recognition_rows
               where schedule_id = v_old.id and state = 'OPEN' loop
      perform set_config('acc.revenue_op', v_r.id::text, true);
      update public.acc_recognition_rows set state = 'SUPERSEDED' where id = v_r.id;
      perform set_config('acc.revenue_op', '', true);
    end loop;

    -- المستقبل الجديد رِبّيًا من تاريخ السريان حتى نهاية الخدمة —
    -- التكامل: v_consumed(القديم) + صفوف الخليفة = المبلغ الجديد بالتمام
    perform public.acc_generate_rateable_rows(v_new, v_c.company_id, v_future,
      v_c.provisional, p_effective, v_c.service_end);
  end;

  perform set_config('acc.revenue_op', v_old.id::text, true);
  update public.acc_recognition_schedules set status = 'SUPERSEDED', superseded_by = v_new
   where id = v_old.id;
  perform set_config('acc.revenue_op', '', true);

  perform public.acc_audit(v_c.company_id, v_user, 'SCHEDULE_MODIFIED', 'acc_recognition_schedules',
    v_old.id::text,
    jsonb_build_object('total_minor', v_old.total_minor::text),
    jsonb_build_object('new_schedule', v_new, 'new_total_minor', p_new_total::text,
                       'effective', p_effective, 'reason', p_reason),
    'acc_modify_subscription_schedule');
  return v_new;
end $$;
revoke execute on function public.acc_modify_subscription_schedule(uuid,bigint,date,text) from public, anon;
grant  execute on function public.acc_modify_subscription_schedule(uuid,bigint,date,text) to authenticated;

-- ─────────────────────────────────────────────
-- ١٠ · الإيراد المؤجل (REV-004/006/017) — الصفوف مصدر التحليل،
--      والمبالغ تُعاد نصوصًا حصرًا
-- ─────────────────────────────────────────────
create or replace function public.acc_deferred_revenue(p_company uuid, p_as_of date default current_date)
returns table (
  contract_id uuid, schedule_id uuid, open_minor text,
  current_minor text, non_current_minor text, provisional boolean, currency char(3),
  -- الدلالة الصريحة: رصيد أداءٍ مفتوح مشتق من الجداول — **مرآة** لا
  -- رصيد GL المؤجل الموثوق (مصدر الحقيقة = الدفتر، والانحراف استثناء)
  basis text
)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  -- fail-closed: NULL (لا عضوية) لا يمر أبدًا — not in مع NULL يسقط
  -- مفتوحًا لولا coalesce (درس Stage 4، معمَّم على acc_role)
  if coalesce(public.acc_role(p_company), '') not in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER') then
    raise exception 'deferred revenue reporting requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER';
  end if;
  return query
  select s.contract_id, s.id,
         coalesce(sum(r.amount_minor), 0)::text,
         coalesce(sum(case when r.recognition_date <= p_as_of + interval '12 months' then r.amount_minor else 0 end), 0)::text,
         coalesce(sum(case when r.recognition_date >  p_as_of + interval '12 months' then r.amount_minor else 0 end), 0)::text,
         s.provisional, s.currency,
         'SCHEDULE_BASIS'::text
  from public.acc_recognition_schedules s
  join public.acc_recognition_rows r on r.schedule_id = s.id and r.state = 'OPEN'
  where s.company_id = p_company and s.status = 'ACTIVE'
  group by s.contract_id, s.id, s.provisional, s.currency
  order by s.created_at;
end $$;
revoke execute on function public.acc_deferred_revenue(uuid,date) from public, anon;
grant  execute on function public.acc_deferred_revenue(uuid,date) to authenticated;

-- تعيين حساب المؤجل الموثوق: **تكوين بشري صريح من المحاسبة** يُدقَّق —
-- لا اختراع ولا استنتاج. حتى يوجد التعيين: الفحص fail-closed.
create table if not exists public.acc_gl_account_links (
  company_id uuid not null references public.acc_companies(id),
  purpose    text not null check (purpose in ('DEFERRED_REVENUE')),
  account_id uuid not null references public.acc_accounts(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (company_id, purpose)
);
alter table public.acc_gl_account_links enable row level security;
create policy acc_gl_links_select on public.acc_gl_account_links
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
revoke insert, update, delete on public.acc_gl_account_links from anon, authenticated;

create or replace function public.acc_link_gl_account(p_company uuid, p_purpose text, p_account uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_acct record;
begin
  v_user := public.acc_assert_accountant(p_company);
  select * into v_acct from public.acc_accounts where id = p_account;
  if not found or v_acct.company_id <> p_company then
    raise exception 'the designated account must belong to this company';
  end if;
  insert into public.acc_gl_account_links (company_id, purpose, account_id, created_by)
  values (p_company, p_purpose, p_account, v_user)
  on conflict (company_id, purpose) do update set account_id = excluded.account_id, created_by = excluded.created_by;
  perform public.acc_audit(p_company, v_user, 'GL_ACCOUNT_LINK_DESIGNATED', 'acc_gl_account_links',
    p_purpose, null, jsonb_build_object('account_id', p_account), 'acc_link_gl_account');
end $$;
revoke execute on function public.acc_link_gl_account(uuid,text,uuid) from public, anon;
grant  execute on function public.acc_link_gl_account(uuid,text,uuid) to authenticated;

-- تكامل REV-006/017 (أساس): مصدر الحقيقة = **GL** والجداول مرآة.
-- بلا تعيينٍ موثوق: رفض صريح AUTHORITATIVE_MAPPING_REQUIRED — لا
-- «تطابق» زائفًا أبدًا. مع التعيين: مقارنة فعلية + كشف قيود الاستهلاك
-- المعكوسة (RECOGNITION_JOURNAL_REVERSED) — كشفٌ فقط، لا فتح تاريخ
-- ولا قيد بديلًا آليًا (Stage 11 لاحقة).
create or replace function public.acc_deferred_integrity_check(p_company uuid)
returns table (schedule_open_minor text, gl_balance_minor text, drift_minor text, reversed_recognitions integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid; v_link record; v_open bigint; v_gl bigint; v_drift bigint;
  v_reversed integer; p_deferred_account uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') not in ('ACCOUNTANT','AUDITOR') then
    raise exception 'the integrity check requires ACCOUNTANT or AUDITOR';
  end if;
  select * into v_link from public.acc_gl_account_links
   where company_id = p_company and purpose = 'DEFERRED_REVENUE';
  if not found then
    raise exception 'AUTHORITATIVE_MAPPING_REQUIRED: no designated DEFERRED_REVENUE account — the check fails closed, never a false match';
  end if;
  p_deferred_account := v_link.account_id;
  select coalesce(sum(r.amount_minor), 0) into v_open
  from public.acc_recognition_rows r
  join public.acc_recognition_schedules s on s.id = r.schedule_id and s.status = 'ACTIVE'
  where r.company_id = p_company and r.state = 'OPEN';
  -- رصيد دائن لحساب التزام: دائن − مدين
  select coalesce(sum(case when l.side = 'CREDIT' then l.base_amount_minor else -l.base_amount_minor end), 0)
    into v_gl
  from public.acc_journal_lines l
  join public.acc_journal_entries e on e.id = l.entry_id
  where l.account_id = p_deferred_account and e.status in ('POSTED','REVERSED');
  v_drift := v_gl - v_open;
  if v_drift <> 0 then
    perform public.acc_audit(p_company, v_user, 'DEFERRED_DRIFT_DETECTED', 'acc_recognition_schedules',
      p_deferred_account::text, null,
      jsonb_build_object('schedule_open_minor', v_open::text, 'gl_balance_minor', v_gl::text,
                         'drift_minor', v_drift::text),
      'acc_deferred_integrity_check');
  end if;
  -- كشف: صف CONSUMED وقيده صار REVERSED لاحقًا — لا يمر صامتًا
  select count(*) into v_reversed
  from public.acc_recognition_rows r
  join public.acc_journal_entries e on e.id = r.journal_entry_id
  where r.company_id = p_company and r.state = 'CONSUMED' and e.status = 'REVERSED';
  if v_reversed > 0 then
    perform public.acc_audit(p_company, v_user, 'RECOGNITION_JOURNAL_REVERSED', 'acc_recognition_rows',
      p_company::text, null, jsonb_build_object('reversed_count', v_reversed),
      'acc_deferred_integrity_check');
  end if;
  return query select v_open::text, v_gl::text, v_drift::text, v_reversed;
end $$;
revoke execute on function public.acc_deferred_integrity_check(uuid) from public, anon;
grant  execute on function public.acc_deferred_integrity_check(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════
-- تصليب أمني تحمله Stage 5 (لا تعديل لهجرة Stage 3 المغلقة):
-- acc_general_ledger و acc_trial_balance كانتا تخوّلان بـ«not in»
-- على acc_role() القابلة لـNULL — لعضوٍ لا عضوية له في الشركة يسقط
-- الفحص fail-open. التعريفان أدناه مطابقان دلاليًا لـStage 3 عدا
-- coalesce الذي يجعل NULL (لا عضوية) يُحجب حتميًا. لا تغيير في
-- منطق التقرير ولا في المسندات (POSTED+REVERSED) ولا في الأرقام.
-- ═══════════════════════════════════════════════════════════════
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
  select company_id into v_company from public.acc_accounts where id = p_account;
  if v_company is null then raise exception 'unknown account'; end if;
  if coalesce(public.acc_role(v_company), '') not in ('ACCOUNTANT','AUDITOR') then
    raise exception 'the technical general ledger requires ACCOUNTANT or AUDITOR in this company';
  end if;
  return query
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
  if coalesce(public.acc_role(p_company), '') not in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER') then
    raise exception 'the trial balance requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER in this company';
  end if;
  return query
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
