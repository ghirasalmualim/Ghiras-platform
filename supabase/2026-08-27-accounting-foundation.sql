-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 1: FOUNDATION
-- (Git فقط — لا تُطبَّق على أي قاعدة قبل مراجعة صاحبة المنصة)
--
-- المرجع الملزم: MASTER BLUEPRINT v1.0 §36 Stage 1 — ولا شيء بعده:
-- لا دفتر أستاذ، لا حسابات، لا قيود، لا فواتير، لا سياسات، لا ضرائب،
-- لا QAYD ولا XBRL (BLK-001/002 — الحد في §38).
--
-- قرار البنية: بادئة acc_ داخل public بدل schema منفصل — عميل
-- Supabase الحالي لا يعرّض schemas إضافية إلا بإعداد لوحةٍ يدوي،
-- والبادئة تعطي العزل والاستخراج المستقبلي بنفس أنماط RLS المجرّبة
-- في المنصة. (قابل للنقل إلى schema مستقل عند فصل الـSaaS.)
--
-- فصل الصلاحيات: أدوار المحاسبة scoped لكل شركة ولا علاقة لها
-- بـprofiles.role — أدمِن منصة غراس ليس محاسبًا ولا مالكًا هنا،
-- ولا تظهر is_admin() في أي سياسة محاسبية.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · العملات — الدقة ملك العملة لا النظام (ACC-001, REG-INT-002)
-- ─────────────────────────────────────────────
create table if not exists public.acc_currencies (
  code        char(3) primary key check (code = upper(code)),
  name        text not null,
  minor_unit  smallint not null check (minor_unit between 0 and 4),
  symbol      text,
  active      boolean not null default true
);

-- حقائق ISO 4217 — بيانات مرجعية لا سياسات
insert into public.acc_currencies (code, name, minor_unit, symbol) values
  ('KWD', 'دينار كويتي',   3, 'د.ك'),
  ('USD', 'دولار أمريكي',  2, '$'),
  ('EUR', 'يورو',          2, '€'),
  ('JPY', 'ين ياباني',     0, '¥')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────
-- ٢ · الشركات — Multi-tenant من اليوم الأول (SEC-001, DEC-016)
--     بيانات منتجٍ وتشغيل؛ أي ربط تنظيمي (QAYD) مستقبلي غير مؤكد
--     ولا يجعل حقلًا هنا «إلزاميًا تنظيميًا» (QAYD-002)
-- ─────────────────────────────────────────────
create table if not exists public.acc_companies (
  id                    uuid primary key default gen_random_uuid(),
  legal_name            text not null check (char_length(legal_name) between 1 and 200),
  display_name          text,
  cr_number             text,
  legal_form            text,
  registered_address    text,
  principal_activity    text,
  base_currency         char(3) not null references public.acc_currencies(code),
  fiscal_year_end_month smallint not null default 12 check (fiscal_year_end_month between 1 and 12),
  fiscal_year_end_day   smallint not null default 31 check (fiscal_year_end_day between 1 and 31),
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- ٣ · العضويات — USER ↔ COMPANY ↔ ROLE per company (§3)
-- ─────────────────────────────────────────────
create table if not exists public.acc_company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.acc_companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in
                ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR',
                 'FINANCE_MANAGER','EMPLOYEE','READ_ONLY')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  unique (company_id, user_id)
);
create index if not exists acc_members_user_idx on public.acc_company_members (user_id);

-- دور المستخدم الحالي في شركةٍ ما — لَبِنة كل السياسات
create or replace function public.acc_role(p_company uuid)
returns text
language sql
security definer
set search_path to 'public'
stable
as $$
  select role from public.acc_company_members
  where company_id = p_company and user_id = auth.uid()
$$;
revoke execute on function public.acc_role(uuid) from public, anon;
grant  execute on function public.acc_role(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٤ · أسعار الصرف — مشاهدات ثابتة لا تُعاد كتابتها (ACC-005)
--     rate بـnumeric دقيق (لا float في أي طبقة — ACC-002)
-- ─────────────────────────────────────────────
create table if not exists public.acc_exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  base_code   char(3) not null references public.acc_currencies(code),
  quote_code  char(3) not null references public.acc_currencies(code),
  rate        numeric(20,10) not null check (rate > 0),
  rate_date   date not null,
  source      text not null,
  recorded_at timestamptz not null default now(),
  check (base_code <> quote_code),
  unique (base_code, quote_code, rate_date, source)
);

-- ─────────────────────────────────────────────
-- ٥ · سجل التدقيق — APPEND-ONLY على مستوى القاعدة (AUD-001..004)
--     occurred_at ≠ recorded_at، والفاعل بشري أو غير بشري (§3, §29)
-- ─────────────────────────────────────────────
create table if not exists public.acc_audit_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.acc_companies(id),
  actor_type    text not null check (actor_type in
                  ('USER','SYSTEM','AI_AGENT','WEBHOOK','IMPORT')),
  actor_user_id uuid references auth.users(id),
  action        text not null,
  subject_type  text not null,
  subject_id    text,
  before_state  jsonb,
  after_state   jsonb,
  occurred_at   timestamptz not null,
  recorded_at   timestamptz not null default now(),
  reason        text,
  source        text,
  metadata      jsonb
);
create index if not exists acc_audit_company_idx
  on public.acc_audit_events (company_id, recorded_at desc);
create index if not exists acc_audit_subject_idx
  on public.acc_audit_events (subject_type, subject_id);

-- المناعة البنيوية: trigger يرفض التعديل والحذف مهما كان المنفذ —
-- حتى مفتاح الخدمة ومسارات SQL الإدارية (لا اعتماد على إخفاء أزرار)
create or replace function public.acc_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_audit_events is append-only: % refused', tg_op;
end $$;
drop trigger if exists acc_audit_no_update on public.acc_audit_events;
create trigger acc_audit_no_update
  before update or delete on public.acc_audit_events
  for each row execute function public.acc_audit_immutable();

-- أسعار الصرف مشاهدات تاريخية — نفس المناعة
create or replace function public.acc_rates_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_exchange_rates are immutable observations: % refused', tg_op;
end $$;
drop trigger if exists acc_rates_no_update on public.acc_exchange_rates;
create trigger acc_rates_no_update
  before update or delete on public.acc_exchange_rates
  for each row execute function public.acc_rates_immutable();

-- ─────────────────────────────────────────────
-- ٦ · RLS — عزل الشركات هو الاختبار الأول (§14, SEC-001/002)
-- ─────────────────────────────────────────────
alter table public.acc_currencies      enable row level security;
alter table public.acc_companies       enable row level security;
alter table public.acc_company_members enable row level security;
alter table public.acc_exchange_rates  enable row level security;
alter table public.acc_audit_events    enable row level security;

-- العملات: مرجع عام للقراءة؛ لا كتابة من العملاء إطلاقًا
create policy acc_currencies_read on public.acc_currencies
  for select using (true);

-- الشركات: يراها أعضاؤها فقط — لا is_admin هنا عمدًا
create policy acc_companies_select on public.acc_companies
  for select using (public.acc_role(id) is not null);

-- العضويات: العضو يرى عضويات شركاته؛ والإدارة للمالك وحده.
-- AUDITOR وREAD_ONLY بنيويًا بلا أي سياسة كتابة تذكرهما —
-- القائمة البيضاء للكتابة هي BUSINESS_OWNER حصرًا (SEC-002)
create policy acc_members_select on public.acc_company_members
  for select using (public.acc_role(company_id) is not null);
create policy acc_members_insert on public.acc_company_members
  for insert with check (public.acc_role(company_id) = 'BUSINESS_OWNER');
create policy acc_members_update on public.acc_company_members
  for update using (public.acc_role(company_id) = 'BUSINESS_OWNER')
  with check (public.acc_role(company_id) = 'BUSINESS_OWNER');
create policy acc_members_delete on public.acc_company_members
  for delete using (public.acc_role(company_id) = 'BUSINESS_OWNER');

-- أسعار الصرف: قراءة للمسجلين؛ الإدخال من النظام (الخادم) فقط
create policy acc_rates_select on public.acc_exchange_rates
  for select using (auth.uid() is not null);

-- سجل التدقيق: قراءة للأدوار المخوّلة (المالك والمحاسب والمدقق
-- والمدير المالي)؛ لا قراءة لموظف أو Read-Only؛ الإدخال من الخادم فقط
create policy acc_audit_select on public.acc_audit_events
  for select using (public.acc_role(company_id) in
    ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));

-- ─────────────────────────────────────────────
-- ٧ · صلاحيات الجداول: القاعدة تضيّق قبل السياسات
--     (لا insert للشركات من العميل — الإنشاء عبر RPC الذرّي أدناه؛
--      لا كتابة للعملات والأسعار والتدقيق من أي عميل)
-- ─────────────────────────────────────────────
revoke insert, update, delete on public.acc_currencies     from anon, authenticated;
revoke insert, update, delete on public.acc_companies      from anon, authenticated;
revoke update, delete         on public.acc_company_members from anon, authenticated
; -- insert العضويات يبقى محكومًا بسياسة المالك أعلاه
revoke insert, update, delete on public.acc_exchange_rates from anon, authenticated;
revoke insert, update, delete on public.acc_audit_events   from anon, authenticated;
grant  update on public.acc_company_members to authenticated; -- تحكمه سياسة المالك
grant  delete on public.acc_company_members to authenticated; -- تحكمه سياسة المالك

-- ─────────────────────────────────────────────
-- ٨ · إنشاء شركة — ذرّيًا: شركة + عضوية مالك + حدث تدقيق
--     SECURITY DEFINER بهوية auth.uid() (نمط المنصة المجرّب)
-- ─────────────────────────────────────────────
create or replace function public.acc_create_company(
  p_legal_name text,
  p_base_currency char(3) default 'KWD'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;
  if p_legal_name is null or btrim(p_legal_name) = '' then
    raise exception 'legal_name required';
  end if;
  if not exists (select 1 from public.acc_currencies
                 where code = p_base_currency and active) then
    raise exception 'unknown or inactive currency: %', p_base_currency;
  end if;

  insert into public.acc_companies (legal_name, base_currency, created_by)
  values (btrim(p_legal_name), p_base_currency, v_user)
  returning id into v_company;

  insert into public.acc_company_members (company_id, user_id, role, created_by)
  values (v_company, v_user, 'BUSINESS_OWNER', v_user);

  insert into public.acc_audit_events
    (company_id, actor_type, actor_user_id, action, subject_type, subject_id,
     after_state, occurred_at, source)
  values
    (v_company, 'USER', v_user, 'COMPANY_CREATED', 'acc_companies', v_company::text,
     jsonb_build_object('legal_name', btrim(p_legal_name),
                        'base_currency', p_base_currency),
     now(), 'acc_create_company');

  return v_company;
end $$;
revoke execute on function public.acc_create_company(text, char) from public, anon;
grant  execute on function public.acc_create_company(text, char) to authenticated;
