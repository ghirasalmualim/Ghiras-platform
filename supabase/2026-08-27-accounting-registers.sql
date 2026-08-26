-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 2: REGISTERS + TAX STATUS FOUNDATION
-- (Git فقط — لا تُطبَّق قبل مراجعة صاحبة المنصة · تبنى فوق هجرة
--  الأساس المعتمدة 2026-08-27-accounting-foundation ولا تعدّلها)
--
-- المرجع الملزم: MASTER BLUEPRINT v1.0 §17 §18 — الجوهر:
--   ACC-012/REG-001: لا معالجة محاسبية ولا قانون/نسبة/موعد مرمّز صلبًا؛
--   كل شيء يُحل من السجلّين وقت التشغيل.
--   ACC-013..015: تغيير المعالجة = نسخة جديدة؛ التاريخ لا يُكتب فوقه.
--   ACC-017: التفعيل فعل بشري — هذه الهجرة لا تعتمد أي سياسة،
--   والبذر كله بحالات الـBlueprint كما هي (لا صف APPROVED واحد).
--   REG-003: DRAFT/BLOCKED جاهزية بيانات فقط — لا حساب.
--   TAX-001: الضريبة حالة لا نسبة؛ الكويت اليوم NO_TAX_REGIME.
--
-- حدود صارمة: لا GL، لا قيود، لا فواتير، لا مدفوعات، لا حساب ضريبي،
-- ولا تنفيذ QAYD/XBRL — REG-KW-003 تُعرَف هنا كقاعدة مسجلة فقط.
--
-- قرار Part D (عام ↔ شركة): القواعد التنظيمية مرجع عالمي واحد غير
-- قابل للتحوير من العملاء (لا نسخ لكل شركة). السياسات صفّان:
-- قوالب عامة company_id IS NULL (اقتراحات §17 المبذورة)، ونسخ
-- شركةٍ company_id محدد تُنشأ لاحقًا بموافقة بشرية — فلا يوجد صف
-- APPROVED عالمي متغير تتشاركه الشركات، وتاريخ شركةٍ لا يتأثر
-- بقرار شركة أخرى أبدًا.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · مفردات حالة الضريبة (TAX-001) — حالة لا نسبة
-- ─────────────────────────────────────────────
create table if not exists public.acc_tax_statuses (
  code         text primary key check (code in
                 ('NO_TAX_REGIME','OUT_OF_SCOPE','TAXABLE',
                  'ZERO_RATED','EXEMPT','REVERSE_CHARGE')),
  -- النسبة لا معنى لها إلا مع هاتين — NO_TAX_REGIME ليست «نسبة صفر»
  rate_bearing boolean not null,
  description  text not null
);
insert into public.acc_tax_statuses (code, rate_bearing, description) values
  ('NO_TAX_REGIME', false, 'لا نظام ضريبي قائمًا أصلًا — حالة الكويت الحالية للـVAT (REG-KW-008)'),
  ('OUT_OF_SCOPE',  false, 'خارج نطاق النظام الضريبي القائم'),
  ('TAXABLE',       true,  'خاضع بنسبة صريحة من السجل التنظيمي — لا نسبة مرمّزة'),
  ('ZERO_RATED',    true,  'خاضع بنسبة صفر داخل نظام قائم — تختلف جوهريًا عن غياب النظام'),
  ('EXEMPT',        false, 'معفى داخل نظام قائم'),
  ('REVERSE_CHARGE',false, 'الالتزام ينتقل إلى المتلقي')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────
-- ٢ · سجل السياسات المحاسبية (§17 · ACC-009..018)
--     الصف نسخة: (نطاق, policy_id, version) — التغيير إدراج نسخة
-- ─────────────────────────────────────────────
create table if not exists public.acc_policy_register (
  id                uuid primary key default gen_random_uuid(),
  -- null = قالب عام (اقتراح Blueprint)؛ محدد = نسخة شركة (Part D)
  company_id        uuid references public.acc_companies(id),
  policy_id         text not null check (policy_id ~ '^POL-[0-9]{3}$'),
  version           integer not null check (version >= 1),
  name              text not null,
  ifrs_ref          text,
  treatment         text not null,
  alternatives      text,
  approval_required text not null check (approval_required in
                      ('ACCOUNTANT','ACCOUNTANT_AND_AUDITOR')),
  status            text not null check (status in
                      ('PROPOSED','NEEDS_ACCOUNTANT_APPROVAL',
                       'NEEDS_AUDITOR_APPROVAL','APPROVED')),
  effective_from    date,
  effective_to      date,
  impact_if_changed text,  -- ACC-016: شرط قبل التفعيل — يُفرض بالتريغر
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  approved_at       timestamptz,
  -- إنسان حقيقي حصرًا — SYSTEM/AI بلا صف مستخدمين فلا يمكنهما الاعتماد (ACC-011/017)
  approved_by       uuid references auth.users(id),
  check (effective_to is null or effective_from is not null),
  check ((approved_at is null) = (approved_by is null))
);
create unique index if not exists acc_policy_version_uq
  on public.acc_policy_register (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), policy_id, version);
create index if not exists acc_policy_lookup_idx
  on public.acc_policy_register (policy_id, company_id, version desc);

-- حارس التاريخ: المعالجة التاريخية لا تُكتب فوقها أبدًا (ACC-013/014).
-- المسموح تعديله في صفٍّ غير معتمد: الحالة ومساري الاعتماد والسريان
-- وimpact_if_changed فقط. صف APPROVED مجمّد كليًا. الحذف مرفوض دائمًا.
-- الترقية إلى APPROVED تتطلب: مسار NEEDS_*، وإنسانًا معتمِدًا،
-- وimpact_if_changed مسجلًا، وتاريخ سريان — والهجرة نفسها لا ترقّي شيئًا.
create or replace function public.acc_policy_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_policy_register: history is never deleted (ACC-013)';
  end if;
  if old.status = 'APPROVED' then
    raise exception 'acc_policy_register: an APPROVED version is frozen — supersede with a new version (ACC-013/014)';
  end if;
  if new.policy_id      is distinct from old.policy_id
     or new.version     is distinct from old.version
     or new.company_id  is distinct from old.company_id
     or new.name        is distinct from old.name
     or new.ifrs_ref    is distinct from old.ifrs_ref
     or new.treatment   is distinct from old.treatment
     or new.alternatives is distinct from old.alternatives
     or new.approval_required is distinct from old.approval_required
     or new.created_at  is distinct from old.created_at
     or new.created_by  is distinct from old.created_by then
    raise exception 'acc_policy_register: treatment/identity fields are immutable — insert a new version (ACC-013)';
  end if;
  if new.status = 'APPROVED' then
    -- التفعيل لا يمر إلا عبر acc_activate_policy التي تتحقق بنيويًا من
    -- سجل الشهادات (مزدوج حيث يلزم) ثم توقّع الجلسة لهذا الصف تحديدًا —
    -- أي UPDATE مباشر، حتى بمفتاح الخدمة، مرفوض
    if current_setting('acc.policy_activation', true) is distinct from old.id::text then
      raise exception 'status APPROVED only via acc_activate_policy after structural approval checks (ACC-017)';
    end if;
    if new.company_id is null then
      -- قوالب §17 اقتراحات عامة إلى الأبد — الاعتماد لنسخ الشركات فقط
      raise exception 'a GLOBAL template can never become APPROVED — create a company version first (Part D)';
    end if;
    if old.status not in ('NEEDS_ACCOUNTANT_APPROVAL','NEEDS_AUDITOR_APPROVAL') then
      raise exception 'approval must pass through an explicit NEEDS_%% path (ACC-017)';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'approval requires a human approver — SYSTEM/AI cannot approve (ACC-011/017)';
    end if;
    if new.impact_if_changed is null or btrim(new.impact_if_changed) = '' then
      raise exception 'impact_if_changed must be recorded before activation (ACC-016)';
    end if;
    if new.effective_from is null then
      raise exception 'activation requires an effective_from date (ACC-013)';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_policy_guard_trg on public.acc_policy_register;
create trigger acc_policy_guard_trg
  before update or delete on public.acc_policy_register
  for each row execute function public.acc_policy_guard();

-- ─────────────────────────────────────────────
-- ٣ · سجل القواعد التنظيمية (§18 · REG-001..003)
--     مرجع عالمي؛ الصف نسخة مجمّدة — التصحيح إدراج نسخة أعلى
-- ─────────────────────────────────────────────
create table if not exists public.acc_regulatory_rules (
  id             uuid primary key default gen_random_uuid(),
  rule_id        text not null check (rule_id ~ '^REG-(KW|INT)-[0-9]{3}$'),
  version        integer not null check (version >= 1),
  jurisdiction   text not null,
  regulator      text,
  requirement    text not null,
  -- النص الحرفي من الـBlueprint — «?» و«proposed …» و«—» تُحفظ ولا تُملأ
  effective_from_text text not null,
  effective_to_text   text not null,
  -- دقة التاريخ صريحة — لا نصنع دقةً لم يعطها المصدر:
  --   DAY     = يوم مؤكد من المصدر (التاريخ في العمود date)
  --   YEAR    = المصدر أعطى سنة فقط (السنة في العمود year، ولا يوم مخترعًا)
  --   NONE    = المصدر يقول «—»: لا حدّ أصلًا — القاعدة قائمة بلا بداية/نهاية
  --   UNKNOWN = «?» أو proposed/draft — غير مؤكد ويبقى كذلك
  effective_from_precision text not null check (effective_from_precision in ('DAY','YEAR','NONE','UNKNOWN')),
  effective_from date,
  effective_from_year smallint,
  effective_to_precision text not null check (effective_to_precision in ('DAY','YEAR','NONE','UNKNOWN')),
  effective_to   date,
  effective_to_year smallint,
  check ((effective_from_precision = 'DAY')  = (effective_from is not null)),
  check ((effective_from_precision = 'YEAR') = (effective_from_year is not null)),
  check ((effective_to_precision = 'DAY')  = (effective_to is not null)),
  check ((effective_to_precision = 'YEAR') = (effective_to_year is not null)),
  source         text not null,
  status         text not null check (status in ('ACTIVE','PENDING','DRAFT','BLOCKED')),
  confidence     text not null check (confidence in ('🟢','🟡','🟠','🔴')),
  system_impact  text not null,
  created_at     timestamptz not null default now(),
  unique (rule_id, version)
);
create index if not exists acc_rules_lookup_idx
  on public.acc_regulatory_rules (rule_id, version desc);

-- ما اعتقده النظام في تاريخٍ ما يجب أن يبقى قابلًا لإعادة الإنتاج —
-- الصف مجمّد كليًا، والتصحيح نسخة جديدة (Part E)
create or replace function public.acc_rules_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_regulatory_rules versions are frozen history: % refused — insert a new version', tg_op;
end $$;
drop trigger if exists acc_rules_frozen_trg on public.acc_regulatory_rules;
create trigger acc_rules_frozen_trg
  before update or delete on public.acc_regulatory_rules
  for each row execute function public.acc_rules_frozen();

-- ─────────────────────────────────────────────
-- ٤ · التدقيق (Part F): نظام Stage 1 نفسه — لا نظام ثانيًا.
--     نسخ القواعد العالمية بلا شركة → company_id يصبح اختياريًا
--     لأحداث السجل العالمي فقط (تعديل عبر هجرة جديدة — هجرة
--     الأساس المعتمدة لم تُمسّ). مناعة append-only باقية كما هي.
-- ─────────────────────────────────────────────
alter table public.acc_audit_events alter column company_id drop not null;
alter table public.acc_audit_events drop constraint if exists acc_audit_global_scope_chk;
alter table public.acc_audit_events add constraint acc_audit_global_scope_chk
  check (company_id is not null or subject_type in ('acc_regulatory_rules','acc_policy_register'));

-- ─────────────────────────────────────────────
-- ٥ · إدراج نسخ عبر عمليات خادم موقّعة بالتدقيق (server-only)
--     لا تُمنح للعملاء في هذه المرحلة — سير الاعتماد البشري لاحق
-- ─────────────────────────────────────────────
create or replace function public.acc_add_policy_version(
  p_company uuid,
  p_policy_id text,
  p_name text,
  p_ifrs_ref text,
  p_treatment text,
  p_alternatives text,
  p_approval_required text,
  p_status text,
  p_impact_if_changed text default null,
  p_notes text default null,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_version integer;
  v_id uuid;
begin
  if p_status = 'APPROVED' then
    raise exception 'a new version is never born APPROVED — approval is a separate human act (ACC-017)';
  end if;
  select coalesce(max(version), 0) + 1 into v_version
  from public.acc_policy_register
  where policy_id = p_policy_id
    and company_id is not distinct from p_company;

  insert into public.acc_policy_register
    (company_id, policy_id, version, name, ifrs_ref, treatment, alternatives,
     approval_required, status, impact_if_changed, notes, created_by)
  values
    (p_company, p_policy_id, v_version, p_name, p_ifrs_ref, p_treatment,
     p_alternatives, p_approval_required, p_status, p_impact_if_changed, p_notes, p_actor)
  returning id into v_id;

  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     after_state, occurred_at, source)
  values
    (p_company, case when p_actor is null then 'SYSTEM' else 'USER' end, p_actor,
     'POLICY_VERSION_ADDED', 'acc_policy_register', p_policy_id || ' v' || v_version,
     jsonb_build_object('policy_id', p_policy_id, 'version', v_version,
                        'status', p_status, 'treatment', p_treatment),
     now(), 'acc_add_policy_version');
  return v_id;
end $$;
revoke execute on function public.acc_add_policy_version(uuid,text,text,text,text,text,text,text,text,text,uuid)
  from public, anon, authenticated;

create or replace function public.acc_add_regulatory_rule_version(
  p_rule_id text,
  p_jurisdiction text,
  p_regulator text,
  p_requirement text,
  p_effective_from_text text,
  p_effective_to_text text,
  p_effective_from_precision text,
  p_effective_from date,
  p_effective_from_year smallint,
  p_effective_to_precision text,
  p_effective_to date,
  p_effective_to_year smallint,
  p_source text,
  p_status text,
  p_confidence text,
  p_system_impact text,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_version integer;
  v_id uuid;
begin
  select coalesce(max(version), 0) + 1 into v_version
  from public.acc_regulatory_rules where rule_id = p_rule_id;

  insert into public.acc_regulatory_rules
    (rule_id, version, jurisdiction, regulator, requirement,
     effective_from_text, effective_to_text,
     effective_from_precision, effective_from, effective_from_year,
     effective_to_precision, effective_to, effective_to_year,
     source, status, confidence, system_impact)
  values
    (p_rule_id, v_version, p_jurisdiction, p_regulator, p_requirement,
     p_effective_from_text, p_effective_to_text,
     p_effective_from_precision, p_effective_from, p_effective_from_year,
     p_effective_to_precision, p_effective_to, p_effective_to_year,
     p_source, p_status, p_confidence, p_system_impact)
  returning id into v_id;

  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     after_state, occurred_at, source)
  values
    (null, case when p_actor is null then 'SYSTEM' else 'USER' end, p_actor,
     'REGULATORY_RULE_VERSION_ADDED', 'acc_regulatory_rules', p_rule_id || ' v' || v_version,
     jsonb_build_object('rule_id', p_rule_id, 'version', v_version, 'status', p_status),
     now(), 'acc_add_regulatory_rule_version');
  return v_id;
end $$;
revoke execute on function public.acc_add_regulatory_rule_version(text,text,text,text,text,text,text,date,smallint,text,date,smallint,text,text,text,text,uuid)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ٦ · محلّلا as-of حتميان في القاعدة (Part H) — مرآة محلّلات TS
-- ─────────────────────────────────────────────
create or replace function public.acc_resolve_rule(p_rule_id text, p_as_of date)
returns table (
  rule_id text, version integer, status text, requirement text,
  in_force boolean, may_compute boolean, readiness_only boolean,
  date_imprecise boolean, note text
)
language sql stable
set search_path to 'public'
as $$
  -- أعلى نسخة نطاقها يشمل التاريخ — لا سقوط صامتًا إلى الأحدث؛
  -- PENDING داخل نطاقها ليست سارية؛ DRAFT/BLOCKED جاهزية فقط (REG-003).
  -- دقة YEAR: قبل السنة = غير سارية، بعدها = سارية، وداخلها = لبس
  -- صريح (EFFECTIVE_DATE_IMPRECISE) — لا يومَ مخترعًا أبدًا.
  with pos as (
    select r.*,
      case r.effective_from_precision
        when 'DAY'  then case when r.effective_from <= p_as_of then 'STARTED'
                              else 'NOT_YET' end
        when 'YEAR' then case when extract(year from p_as_of) >  r.effective_from_year then 'STARTED'
                              when extract(year from p_as_of) =  r.effective_from_year then 'IMPRECISE'
                              else 'NOT_YET' end
        else 'STARTED' -- NONE/UNKNOWN: لا حدّ قابل للمقارنة — الحالة تحكم
      end as from_pos,
      case r.effective_to_precision
        when 'DAY'  then case when p_as_of <= r.effective_to then 'OPEN'
                              else 'ENDED' end
        when 'YEAR' then case when extract(year from p_as_of) <  r.effective_to_year then 'OPEN'
                              when extract(year from p_as_of) =  r.effective_to_year then 'IMPRECISE'
                              else 'ENDED' end
        else 'OPEN'
      end as to_pos
    from public.acc_regulatory_rules r
    where r.rule_id = p_rule_id
  )
  select p.rule_id, p.version, p.status, p.requirement,
         (p.status = 'ACTIVE' and p.from_pos = 'STARTED' and p.to_pos = 'OPEN') as in_force,
         (p.status = 'ACTIVE' and p.from_pos = 'STARTED' and p.to_pos = 'OPEN') as may_compute,
         p.status in ('DRAFT','BLOCKED') as readiness_only,
         (p.from_pos = 'IMPRECISE' or p.to_pos = 'IMPRECISE') as date_imprecise,
         case when p.from_pos = 'IMPRECISE' or p.to_pos = 'IMPRECISE'
                then 'EFFECTIVE_DATE_IMPRECISE (YEAR precision — no invented day)'
              when p.status in ('DRAFT','BLOCKED') then 'DATA_READINESS_ONLY (REG-003)'
              when p.status = 'PENDING' then 'PENDING_NOT_ACTIVE' end as note
  from pos p
  where p.from_pos <> 'NOT_YET' and p.to_pos <> 'ENDED'
  order by p.version desc
  limit 1
$$;

create or replace function public.acc_resolve_policy(
  p_company uuid, p_policy_id text, p_as_of date, p_mode text
)
returns table (
  policy_id text, version integer, status text, treatment text,
  scope text, is_provisional boolean, governs_production boolean, refusal text
)
language plpgsql stable
set search_path to 'public'
as $$
declare r record;
begin
  if p_mode not in ('PRODUCTION','SANDBOX') then
    raise exception 'mode must be PRODUCTION or SANDBOX';
  end if;
  -- نسخة الشركة تسبق القالب العام؛ أعلى نسخة **سارية بالتاريخ** فقط
  select * into r from (
    select p.*, (p.company_id is not null) as is_company
    from public.acc_policy_register p
    where p.policy_id = p_policy_id
      and (p.company_id = p_company or p.company_id is null)
      and (p.effective_from is null or p.effective_from <= p_as_of)
      and (p.effective_to   is null or p_as_of <= p.effective_to)
    order by (p.company_id is not null) desc, p.version desc
    limit 1
  ) s;
  if not found then
    return query select p_policy_id, null::integer, null::text, null::text,
      null::text, null::boolean, null::boolean, 'NO_POLICY_IN_EFFECT_AT_DATE'::text;
    return;
  end if;
  if p_mode = 'PRODUCTION' and (r.status <> 'APPROVED' or not r.is_company) then
    -- الإنتاج لا يحكمه إلا نسخة **شركةٍ** معتمدة (ACC-010 + Part D) —
    -- القالب العام لا يحكم الإنتاج مهما كانت حالته. رفض صريح.
    return query select p_policy_id, null::integer, null::text, null::text,
      null::text, null::boolean, null::boolean, 'NO_APPROVED_POLICY_FOR_PRODUCTION'::text;
    return;
  end if;
  return query select r.policy_id, r.version, r.status, r.treatment,
    case when r.is_company then 'COMPANY' else 'GLOBAL_TEMPLATE' end,
    r.status <> 'APPROVED',                                -- ACC-018: مؤقت وموسوم
    r.status = 'APPROVED' and p_mode = 'PRODUCTION' and r.is_company,
    null::text;
end $$;

-- ─────────────────────────────────────────────
-- ٧ · RLS (Part G) — عزل Stage 1 نفسه؛ لا is_admin هنا أيضًا
-- ─────────────────────────────────────────────
alter table public.acc_tax_statuses     enable row level security;
alter table public.acc_policy_register  enable row level security;
alter table public.acc_regulatory_rules enable row level security;

-- مفردات الضريبة والقواعد العالمية: مرجع قراءة للمسجلين، صفر كتابة عميل
create policy acc_tax_statuses_read on public.acc_tax_statuses
  for select using (auth.uid() is not null);
create policy acc_rules_read on public.acc_regulatory_rules
  for select using (auth.uid() is not null);

-- السياسات: القوالب العامة مرجع مقروء؛ نسخ الشركة لأعضائها فقط —
-- شركة A لا ترى إعداد شركة B الخاص. كل الكتابة من الخادم حصريًا.
create policy acc_policy_select on public.acc_policy_register
  for select using (
    company_id is null
    or public.acc_role(company_id) is not null
  );

revoke insert, update, delete on public.acc_tax_statuses     from anon, authenticated;
revoke insert, update, delete on public.acc_policy_register  from anon, authenticated;
revoke insert, update, delete on public.acc_regulatory_rules from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٨ · البذر — §17 و§18 حرفيًا، بحالات الـBlueprint دون ترقية
--     (بذر مرجعي وقت الهجرة؛ النسخ اللاحقة عبر دوال الخادم الموقعة)
-- ─────────────────────────────────────────────
insert into public.acc_policy_register
  (company_id, policy_id, version, name, ifrs_ref, treatment, alternatives, approval_required, status, notes)
values
  (null,'POL-001',1,'Monthly subscription revenue','IFRS 15','Recognise over the service month','Point-in-time on invoice','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-002',1,'Annual subscription revenue','IFRS 15','Recognise rateably over 12 months; balance to contract liability','Recognise on receipt','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-003',1,'6-month subscription revenue','IFRS 15','Rateably over 6 months',null,'ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-004',1,'One-time digital product','IFRS 15','Recognise on delivery/access grant','On payment','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-005',1,'AI credits — initial','IFRS 15','Contract liability on sale; recognise on consumption','Recognise on sale','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-006',1,'AI credits — breakage','IFRS 15','Recognise expired unused credits as revenue at expiry','Recognise proportionally over the expected pattern','ACCOUNTANT_AND_AUDITOR','NEEDS_AUDITOR_APPROVAL',null),
  (null,'POL-007',1,'Upgrade / downgrade mid-term','IFRS 15','Prospective modification; adjust the remaining schedule','Cumulative catch-up','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-008',1,'Refund within the same period','IFRS 15','Contra-revenue; reduce deferred before recognised','Reverse the original entry','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-009',1,'Refund across periods','IFRS 15 / IAS 8','Contra-revenue in the current period; never restate a closed period','Prior-period adjustment','ACCOUNTANT_AND_AUDITOR','NEEDS_AUDITOR_APPROVAL',null),
  (null,'POL-010',1,'Chargeback pending','IAS 37','Contingent liability; no revenue reversal until resolved','Reverse immediately','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-011',1,'Chargeback lost','IFRS 15','Contra-revenue plus any dispute fee as expense',null,'ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-012',1,'Expected credit losses','IFRS 9','Simplified matrix approach on trade receivables','Full general model','ACCOUNTANT_AND_AUDITOR','NEEDS_AUDITOR_APPROVAL',null),
  (null,'POL-013',1,'Cost of revenue classification','IAS 1 / IFRS 18','AI API, hosting, storage, delivery messaging and gateway fees are cost of revenue','Treat gateway fees as finance/opex','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-014',1,'Gateway fee presentation','IAS 1','Expense, gross presentation','Net against revenue','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-015',1,'Accrual policy','IAS 1','Accrue known recurring costs at period end; auto-reverse next period','Accrue only above a threshold','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-016',1,'Prepayment amortisation','IAS 1','Straight-line for time-based; consumption-based for credit-based','Straight-line for all','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-017',1,'Revenue presentation gross vs net','IFRS 15','Gross (Ghiras is principal)','Net (agent)','ACCOUNTANT_AND_AUDITOR','NEEDS_AUDITOR_APPROVAL',null),
  (null,'POL-018',1,'FX revaluation','IAS 21','Revalue monetary items at period end','No revaluation','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-019',1,'Depreciation','IAS 16 / Companies Law Art. 223','Straight-line over useful life','Reducing balance','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-020',1,'Software development capitalisation','IAS 38','Expense as incurred until IAS 38 criteria are demonstrably met','Capitalise from technical feasibility','ACCOUNTANT_AND_AUDITOR','NEEDS_AUDITOR_APPROVAL',null),
  (null,'POL-021',1,'Legal reserve','Companies Law Art. 222','Compute and present for approval; do not auto-post','Auto-post','ACCOUNTANT','NEEDS_ACCOUNTANT_APPROVAL',null),
  (null,'POL-022',1,'Materiality threshold','IAS 1','Configurable, documented, applied consistently',null,'ACCOUNTANT','PROPOSED',null),
  (null,'POL-023',1,'Functional currency','IAS 21','KWD',null,'ACCOUNTANT','PROPOSED',null),
  (null,'POL-024',1,'Unidentified settlement difference',null,'Route to a named suspense account; never absorb into fees or revenue','Absorb into fees','ACCOUNTANT','PROPOSED','depends on BLK-004')
on conflict do nothing;

-- الدقة معلنة لكل حدّ: يوم مؤكد = DAY؛ سنة فقط = YEAR (بلا يوم مخترع)؛
-- «—» = NONE (لا حدّ)؛ «?»/proposed/draft = UNKNOWN (يبقى غامضًا)
insert into public.acc_regulatory_rules
  (rule_id, version, jurisdiction, regulator, requirement,
   effective_from_text, effective_to_text,
   effective_from_precision, effective_from, effective_from_year,
   effective_to_precision, effective_to, effective_to_year,
   source, status, confidence, system_impact)
values
  ('REG-KW-001',1,'Kuwait','MOCI','Full IFRS as issued by IASB required for all companies under the Commercial Companies Law','1990 (amended 2008)','open','YEAR',null,1990,'NONE',null,null,'Ministerial Decree 18/1990, amended 101/2008 (IFRS Foundation jurisdictional profile)','ACTIVE','🟢','Statement model, chart of accounts'),
  ('REG-KW-002',1,'Kuwait','MOCI','IFRS for SMEs not applicable','—','—','NONE',null,null,'NONE',null,null,'Same','ACTIVE','🟢','No SME framework branch may be built'),
  ('REG-KW-003',1,'Kuwait','MOCI','Electronic filing of financial statements via QAYD in XBRL becomes mandatory for all legal entities','1 Jan 2027','open','DAY','2027-01-01',null,'NONE',null,null,'MOCI announcements; KUNA 15 Apr 2026','PENDING','🟢','QAYD Adapter (BLOCKED)'),
  ('REG-KW-004',1,'Kuwait','MOCI','XBRL filing optional during 2026; existing submission mechanism remains mandatory in parallel','1 Jan 2026','31 Dec 2026','DAY','2026-01-01',null,'DAY','2026-12-31',null,'Same','ACTIVE','🟢','No mandatory export in 2026'),
  ('REG-KW-005',1,'Kuwait','MOCI','Non-compliance after 1 Jan 2027 attracts action under Companies Law No. 1 of 2016','1 Jan 2027','open','DAY','2027-01-01',null,'NONE',null,null,'MOCI statement','PENDING','🟢','Compliance alerting'),
  ('REG-KW-006',1,'Kuwait','MOCI','Filing deadline after fiscal year end','?','?','UNKNOWN',null,null,'UNKNOWN',null,null,'Conflicting secondary sources: 3 months vs 6 months','BLOCKED','🔴','No deadline logic may be built'),
  ('REG-KW-007',1,'Kuwait','MOCI','Independent auditor licensed and registered with MOCI required','—','open','NONE',null,null,'NONE',null,null,'Law No. 5 of 1981','ACTIVE','🟡','Auditor role, audit export'),
  ('REG-KW-008',1,'Kuwait',null,'No VAT regime exists','—','—','NONE',null,null,'NONE',null,null,'Multiple; no enacted legislation found','ACTIVE','🟢','VAT status = NO_TAX_REGIME'),
  ('REG-KW-009',1,'Kuwait','MoF / KTA','DMTT 15% for MNE groups ≥ €750m consolidated revenue','1 Jan 2025','open','DAY','2025-01-01',null,'NONE',null,null,'Decree-Law No. 157 of 2024','ACTIVE','🟢','Out of scope for Ghiras'),
  ('REG-KW-010',1,'Kuwait','MoF','Business Profits Tax — phase 2 proposed for all legal and natural persons; exemption below KD 1.5m turnover','proposed 1 Jan 2027','—','UNKNOWN',null,null,'NONE',null,null,'Draft law','DRAFT','🟠','Data readiness only. No calculation.'),
  ('REG-KW-011',1,'Kuwait','MoF','5% withholding on non-resident payments including technical services','proposed','—','UNKNOWN',null,null,'NONE',null,null,'Draft BPT law','DRAFT','🟠','Vendor residency flags only'),
  ('REG-KW-012',1,'Kuwait',null,'No mandatory e-invoicing regime','—','—','NONE',null,null,'NONE',null,null,'Regional surveys; Kuwait in preparatory work','ACTIVE','🟢','Structural readiness only'),
  ('REG-KW-013',1,'Kuwait','CBK','Open Banking framework issued in draft only','draft 4 Jun 2025','—','UNKNOWN',null,null,'NONE',null,null,'CBK press statement','DRAFT','🟢','No bank feed may be built'),
  ('REG-KW-014',1,'Kuwait',null,'Accounting record retention period','?','?','UNKNOWN',null,null,'UNKNOWN',null,null,'Conflicting: 5-year civil limitation vs 10-year claims','BLOCKED','🔴','Default 10 years, configurable'),
  ('REG-KW-015',1,'Kuwait','DIT','Computerised accounting records permitted, subject to containing the required records and prior notification to the tax department','—','open','NONE',null,null,'NONE',null,null,'PwC Kuwait tax administration summary','ACTIVE','🟡','Complete journal and ledger retention'),
  ('REG-KW-016',1,'Kuwait','CITRA','DPPR applies exclusively to CITRA licensees following Decision No. 26 of 2024','2024','open','YEAR',null,2024,'NONE',null,null,'Chambers Kuwait 2026','ACTIVE','🟡','Likely not applicable to Ghiras — verify'),
  ('REG-KW-017',1,'Kuwait',null,'E-Transactions Law duties: consent, purpose, accuracy, security','2014','open','YEAR',null,2014,'NONE',null,null,'Law No. 20 of 2014','ACTIVE','🟡','Privacy controls'),
  ('REG-KW-018',1,'Kuwait',null,'Cybercrime Law criminalises unauthorised access, alteration, disclosure, destruction','2015','open','YEAR',null,2015,'NONE',null,null,'Law No. 63 of 2015','ACTIVE','🟡','Access control, audit logging'),
  ('REG-KW-019',1,'Kuwait','MOCI','Companies Law Arts. 221–225: fiscal year, legal reserve, depreciation, labour/social security deductions, voluntary reserves','2016','open','YEAR',null,2016,'NONE',null,null,'Law No. 1 of 2016','ACTIVE','🟢','Period model, reserve computation'),
  ('REG-INT-001',1,'International','IASB','IFRS 18 replaces IAS 1 for annual periods beginning on or after 1 Jan 2027, retrospective','1 Jan 2027','open','DAY','2027-01-01',null,'NONE',null,null,'IASB','PENDING','🟡','Versioned presentation layer required'),
  ('REG-INT-002',1,'International','ISO','KWD minor unit = 3','—','open','NONE',null,null,'NONE',null,null,'ISO 4217','ACTIVE','🟢','Money model')
on conflict (rule_id, version) do nothing;

-- ─────────────────────────────────────────────
-- ٩ · شهادات اعتماد السياسات — append-only (FIX 1)
--     المدقق قراءة-فقط على البيانات المالية، لكن الـBlueprint يخوّله
--     صراحة «وسم السياسات auditor-approved» — الشهادة فعل توثيق لا
--     ترحيلًا ولا تعديلًا ماليًا، فلا تمس invariant المرحلة الأولى.
-- ─────────────────────────────────────────────
create table if not exists public.acc_policy_approvals (
  id               uuid primary key default gen_random_uuid(),
  policy_row_id    uuid not null references public.acc_policy_register(id),
  company_id       uuid not null references public.acc_companies(id),
  approval_role    text not null check (approval_role in ('ACCOUNTANT','AUDITOR')),
  -- إنسان حقيقي حصرًا — لا SYSTEM ولا AI ولا أدمِن منصة بلا دور محاسبي
  approver_user_id uuid not null references auth.users(id),
  decision         text not null check (decision in ('APPROVED','REJECTED')),
  reason           text,
  created_at       timestamptz not null default now(),
  -- شهادة واحدة لكل (نسخة، دور، معتمِد) — والدوران المزدوجان لا
  -- يُستنتجان من فعل واحد أبدًا
  unique (policy_row_id, approval_role, approver_user_id)
);
create index if not exists acc_approvals_row_idx on public.acc_policy_approvals (policy_row_id);

create or replace function public.acc_approvals_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_policy_approvals is append-only: % refused', tg_op;
end $$;
drop trigger if exists acc_approvals_no_update on public.acc_policy_approvals;
create trigger acc_approvals_no_update
  before update or delete on public.acc_policy_approvals
  for each row execute function public.acc_approvals_immutable();

alter table public.acc_policy_approvals enable row level security;
create policy acc_approvals_select on public.acc_policy_approvals
  for select using (public.acc_role(company_id) is not null);
revoke insert, update, delete on public.acc_policy_approvals from anon, authenticated;

-- تسجيل شهادة: المعتمِد هو auth.uid() نفسه ودوره في **تلك الشركة وقت
-- الاعتماد** يطابق دور الشهادة — أدمِن المنصة بلا عضوية لا يمر بنيويًا
create or replace function public.acc_record_policy_approval(
  p_policy_row uuid,
  p_approval_role text,
  p_decision text default 'APPROVED',
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_role text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required — approvals are human acts (ACC-017)';
  end if;
  select * into v_row from public.acc_policy_register where id = p_policy_row;
  if not found then raise exception 'unknown policy row'; end if;
  if v_row.company_id is null then
    raise exception 'global templates are not approvable — approval is company-scoped (Part D)';
  end if;
  if v_row.status = 'APPROVED' then
    raise exception 'version already APPROVED and frozen';
  end if;
  v_role := public.acc_role(v_row.company_id);
  if p_approval_role = 'ACCOUNTANT' and v_role is distinct from 'ACCOUNTANT' then
    raise exception 'accountant approval requires the ACCOUNTANT role in this company (got %)', coalesce(v_role, 'none');
  end if;
  if p_approval_role = 'AUDITOR' and v_role is distinct from 'AUDITOR' then
    raise exception 'auditor attestation requires the AUDITOR role in this company (got %)', coalesce(v_role, 'none');
  end if;

  insert into public.acc_policy_approvals
    (policy_row_id, company_id, approval_role, approver_user_id, decision, reason)
  values (p_policy_row, v_row.company_id, p_approval_role, v_user, p_decision, p_reason)
  returning id into v_id;

  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     after_state, occurred_at, source)
  values
    (v_row.company_id, 'USER', v_user, 'POLICY_APPROVAL_RECORDED',
     'acc_policy_register', v_row.policy_id || ' v' || v_row.version,
     jsonb_build_object('approval_role', p_approval_role, 'decision', p_decision),
     now(), 'acc_record_policy_approval');
  return v_id;
end $$;
revoke execute on function public.acc_record_policy_approval(uuid,text,text,text) from public, anon;
grant  execute on function public.acc_record_policy_approval(uuid,text,text,text) to authenticated;

-- التفعيل: المسار الوحيد إلى APPROVED — يتحقق بنيويًا من سجل الشهادات
-- (ACCOUNTANT دائمًا؛ وAUDITOR **من إنسان مختلف** حين الاعتماد مزدوج)
-- ثم يوقّع الجلسة لهذا الصف تحديدًا فيسمح التريغر بالانتقال
create or replace function public.acc_activate_policy(
  p_policy_row uuid,
  p_effective_from date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_role text;
  v_accountant uuid;
  v_auditor uuid;
begin
  if v_user is null then
    raise exception 'authentication required — activation is a human act (ACC-017)';
  end if;
  select * into v_row from public.acc_policy_register where id = p_policy_row;
  if not found then raise exception 'unknown policy row'; end if;
  if v_row.company_id is null then
    raise exception 'global templates cannot be activated — activation is company-scoped (Part D)';
  end if;
  v_role := public.acc_role(v_row.company_id);
  if v_role is distinct from 'ACCOUNTANT' then
    -- الفعل المحاسبي لمحاسبة الشركة نفسها: لا مالك بلا دور محاسبي،
    -- ولا مدقق، ولا read-only، ولا أدمِن منصة بلا عضوية
    raise exception 'activation requires the ACCOUNTANT role in this company (got %)', coalesce(v_role, 'none');
  end if;
  if v_row.impact_if_changed is null or btrim(v_row.impact_if_changed) = '' then
    raise exception 'impact_if_changed must be recorded before activation (ACC-016)';
  end if;

  select approver_user_id into v_accountant
  from public.acc_policy_approvals
  where policy_row_id = p_policy_row and approval_role = 'ACCOUNTANT' and decision = 'APPROVED'
  limit 1;
  if v_accountant is null then
    raise exception 'activation requires a recorded ACCOUNTANT approval — an auditor cannot substitute';
  end if;
  if v_row.approval_required = 'ACCOUNTANT_AND_AUDITOR' then
    select approver_user_id into v_auditor
    from public.acc_policy_approvals
    where policy_row_id = p_policy_row and approval_role = 'AUDITOR' and decision = 'APPROVED'
      and approver_user_id <> v_accountant  -- إنسانان مختلفان — لا يُستنتج المزدوج من فعل واحد
    limit 1;
    if v_auditor is null then
      raise exception 'dual approval requires a distinct human AUDITOR attestation in addition to the ACCOUNTANT';
    end if;
  end if;

  perform set_config('acc.policy_activation', v_row.id::text, true);
  update public.acc_policy_register
     set status = 'APPROVED',
         approved_at = now(),
         approved_by = v_user,
         effective_from = p_effective_from
   where id = p_policy_row;
  perform set_config('acc.policy_activation', '', true);

  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     after_state, occurred_at, source)
  values
    (v_row.company_id, 'USER', v_user, 'POLICY_ACTIVATED',
     'acc_policy_register', v_row.policy_id || ' v' || v_row.version,
     jsonb_build_object('effective_from', p_effective_from,
                        'approval_required', v_row.approval_required),
     now(), 'acc_activate_policy');
end $$;
revoke execute on function public.acc_activate_policy(uuid,date) from public, anon;
grant  execute on function public.acc_activate_policy(uuid,date) to authenticated;
