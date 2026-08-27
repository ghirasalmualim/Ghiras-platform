-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 6: PAYMENTS & CLEARING
-- المدفوعات · التسويات وأسطرها · الاستردادات · المقاصّة والنقد في
-- الطريق · ربط الأثر المحاسبي بقيدٍ مرحّل بشهادة بشرية
-- (Git فقط — فوق هجرات Stage 1..5 المعتمدة ولا تعدّلها)
--
-- التمييزات الحاكمة: الفاتورة مطالبة، الدفعة استلام قيمة، معاملة
-- المزوّد سجل محاولة (Stage 7)، التسوية دفعة مزوّد، السطر تفصيل
-- gross/fee/net، حركة البنك حقيقة بنكية (Stage 9)، والتسوية-المقابلة
-- ربطٌ (Stage 10). الدفع **ليس أداءً**: نجاحه لا يستهلك جدول اعتراف
-- ولا يعترف بإيراد — محرك الأداء يبقى Stage 5 وحده.
--
-- ⚠️ BLK-004: gross − fee ≠ net بالضرورة. لا قيد يفرض المساواة؛
-- الأرقام الثلاثة مستقلة تامة، والباقي residual = gross−fee−net قد
-- يكون غير صفري: يُحفظ بالتمام، لا يُقرّب، لا يُبتلع في رسم ولا
-- إيراد، ويُوجَّه لحساب فرق التسوية المجهول أو يفشل مغلقًا.
--
-- ⛔ لا اختراع حسابات: كل حساب من acc_accounts تعيّنه المحاسبة عبر
-- acc_gl_account_links؛ الغياب = AUTHORITATIVE_MAPPING_REQUIRED.
-- كل تخويل fail-closed (coalesce(acc_role,'') — درس Stages 3/5).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ٠ · توسيع تعيينات الحسابات (يعيد استخدام بنية Stage 5)
--     أغراض جديدة + scope_key لمقاصّة مخصّصة لكل مزوّد دون كسر
--     سلوك DEFERRED_REVENUE (scope_key='' افتراضيًا = توافق خلفي)
-- ─────────────────────────────────────────────
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.acc_gl_account_links'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%purpose%';
  if c is not null then
    execute 'alter table public.acc_gl_account_links drop constraint ' || quote_ident(c);
  end if;
end $$;
alter table public.acc_gl_account_links
  add constraint acc_gl_links_purpose_chk check (purpose in
    ('DEFERRED_REVENUE','GATEWAY_CLEARING','CASH_IN_TRANSIT',
     'GATEWAY_FEE_EXPENSE','CONTRA_REVENUE','UNIDENTIFIED_SETTLEMENT_DIFFERENCE'));
alter table public.acc_gl_account_links add column if not exists scope_key text not null default '';
do $$
begin
  alter table public.acc_gl_account_links drop constraint acc_gl_account_links_pkey;
exception when others then null;
end $$;
alter table public.acc_gl_account_links add primary key (company_id, purpose, scope_key);

-- إعادة تعريف دالة التعيين: scope اختياري (افتراضه '' = DEFERRED_REVENUE
-- كما كان) + null-safe؛ الحساب من نفس الشركة، والمحاسبة حصرًا.
-- إزالة توقيع Stage 5 الثلاثي أولًا كي لا يبقى overload غامضًا (لا
-- CASCADE — لا تبعية على الدالة القديمة، مُثبت)
drop function if exists public.acc_link_gl_account(uuid, text, uuid);
create or replace function public.acc_link_gl_account(
  p_company uuid, p_purpose text, p_account uuid, p_scope text default ''
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_acct record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') <> 'ACCOUNTANT' then
    raise exception 'designating a GL account requires the ACCOUNTANT role in this company';
  end if;
  select * into v_acct from public.acc_accounts where id = p_account;
  if not found or v_acct.company_id <> p_company then
    raise exception 'the designated account must belong to this company';
  end if;
  insert into public.acc_gl_account_links (company_id, purpose, scope_key, account_id, created_by)
  values (p_company, p_purpose, coalesce(p_scope, ''), p_account, v_user)
  on conflict (company_id, purpose, scope_key)
    do update set account_id = excluded.account_id, created_by = excluded.created_by;
  perform public.acc_audit(p_company, v_user, 'GL_ACCOUNT_LINK_DESIGNATED', 'acc_gl_account_links',
    p_purpose || coalesce(nullif(':' || p_scope, ':'), ''), null,
    jsonb_build_object('account_id', p_account, 'scope', coalesce(p_scope, '')), 'acc_link_gl_account');
end $$;
revoke execute on function public.acc_link_gl_account(uuid,text,uuid,text) from public, anon;
grant  execute on function public.acc_link_gl_account(uuid,text,uuid,text) to authenticated;

-- حلّال حساب معيّن — غيابه fail-closed صريح
create or replace function public.acc_required_account(p_company uuid, p_purpose text, p_scope text default '')
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_acct uuid;
begin
  select account_id into v_acct from public.acc_gl_account_links
  where company_id = p_company and purpose = p_purpose and scope_key = coalesce(p_scope, '');
  if v_acct is null then
    raise exception 'AUTHORITATIVE_MAPPING_REQUIRED: no designated % account (scope %) — fails closed', p_purpose, coalesce(p_scope, '');
  end if;
  return v_acct;
end $$;
revoke execute on function public.acc_required_account(uuid,text,text) from public, anon, authenticated;

-- مساعد تخويل: المالكة أو المحاسبة (العملية عالية المستوى)
create or replace function public.acc_assert_owner_or_accountant(p_company uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') not in ('BUSINESS_OWNER','ACCOUNTANT') then
    raise exception 'recording a payment requires the BUSINESS_OWNER or ACCOUNTANT role in this company';
  end if;
  return v_user;
end $$;
revoke execute on function public.acc_assert_owner_or_accountant(uuid) from public, anon, authenticated;

create or replace function public.acc_assert_pay_accountant(p_company uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if coalesce(public.acc_role(p_company), '') <> 'ACCOUNTANT' then
    raise exception 'technical accounting operations require the ACCOUNTANT role in this company';
  end if;
  return v_user;
end $$;
revoke execute on function public.acc_assert_pay_accountant(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- ١ · المدفوعات — سجل غراس أن قيمة استُلمت (CORRECTION 2)
-- ─────────────────────────────────────────────
create table if not exists public.acc_payments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.acc_companies(id),
  invoice_id     uuid not null references public.acc_invoices(id),
  amount_minor   bigint not null check (amount_minor > 0),
  currency       char(3) not null references public.acc_currencies(code),
  status         text not null default 'INITIATED' check (status in
                   ('INITIATED','PENDING','SUCCESS','SETTLED','RECONCILED',
                    'FAILED','CANCELLED','REFUNDED','DISPUTED')),
  -- معرف معاملة المزوّد — دائم حين يوجد (PAY-007)، وأساس idempotency
  gateway_txn_id text,
  received_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  unique (company_id, gateway_txn_id)
);
create index if not exists acc_payments_invoice_idx on public.acc_payments (invoice_id);
create index if not exists acc_payments_company_idx on public.acc_payments (company_id, status);

-- آلة حالات الدفع + تجميد الحقائق بعد SUCCESS (INITIATED/PENDING/
-- FAILED/CANCELLED = صفر أثر محاسبي بنيويًا؛ الحواف المحرمة تفشل)
create or replace function public.acc_payments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_payments are never deleted — payment history is permanent';
  end if;
  if new.company_id is distinct from old.company_id
     or new.invoice_id is distinct from old.invoice_id
     or new.created_at is distinct from old.created_at then
    raise exception 'acc_payments: identity is immutable';
  end if;
  -- الحقائق المالية تُجمّد فور بلوغ SUCCESS فما بعدها
  if old.status in ('SUCCESS','SETTLED','RECONCILED','REFUNDED','DISPUTED')
     and (new.amount_minor is distinct from old.amount_minor
          or new.currency is distinct from old.currency
          or new.gateway_txn_id is distinct from old.gateway_txn_id
          or new.received_at is distinct from old.received_at) then
    raise exception 'a successful payment financial fact is immutable';
  end if;
  if new.status is distinct from old.status then
    if coalesce(current_setting('acc.payment_op', true), '') <> old.id::text then
      raise exception 'payment status changes only through the signed payment operations';
    end if;
    if not ( (old.status = 'INITIATED' and new.status in ('PENDING','CANCELLED'))
          or (old.status = 'PENDING'   and new.status in ('SUCCESS','FAILED','CANCELLED'))
          or (old.status = 'SUCCESS'   and new.status in ('SETTLED','REFUNDED','DISPUTED'))
          or (old.status = 'SETTLED'   and new.status in ('RECONCILED','REFUNDED','DISPUTED'))
          or (old.status = 'DISPUTED'  and new.status in ('SETTLED','REFUNDED')) ) then
      raise exception 'forbidden payment transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_payments_guard_trg on public.acc_payments;
create trigger acc_payments_guard_trg
  before update or delete on public.acc_payments
  for each row execute function public.acc_payments_guard();

-- ─────────────────────────────────────────────
-- ٢ · التسويات وأسطرها (CORRECTION 1) — مجمّدة، بلا مساواة مفروضة
-- ─────────────────────────────────────────────
create table if not exists public.acc_settlements (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.acc_companies(id),
  provider       text not null,
  settlement_ref text not null,
  settled_at     date,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  unique (company_id, provider, settlement_ref)
);
create table if not exists public.acc_settlement_lines (
  id           uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.acc_settlements(id),
  company_id   uuid not null references public.acc_companies(id),
  payment_id   uuid references public.acc_payments(id),
  -- ثلاثتها مستقلة تامة — لا check مساواة (BLK-004)
  gross_minor  bigint not null check (gross_minor >= 0),
  fee_minor    bigint not null check (fee_minor >= 0),
  net_minor    bigint not null check (net_minor >= 0),
  currency     char(3) not null references public.acc_currencies(code),
  created_at   timestamptz not null default now()
  -- residual = gross - fee - net مشتق، قد يكون ≠ 0، يُحفظ ولا يُقرّب
);
create index if not exists acc_settlement_lines_stl_idx on public.acc_settlement_lines (settlement_id);

create or replace function public.acc_settlement_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'settlement provider facts are immutable once confirmed: % refused', tg_op;
end $$;
drop trigger if exists acc_settlements_frozen_trg on public.acc_settlements;
create trigger acc_settlements_frozen_trg
  before update or delete on public.acc_settlements
  for each row execute function public.acc_settlement_frozen();
drop trigger if exists acc_settlement_lines_frozen_trg on public.acc_settlement_lines;
create trigger acc_settlement_lines_frozen_trg
  before update or delete on public.acc_settlement_lines
  for each row execute function public.acc_settlement_frozen();

-- ─────────────────────────────────────────────
-- ٣ · الاستردادات — كيان حقيقي (CORRECTION 4)
--     الجزئي لا يمسح الدفعة الأصلية؛ حالته آلته الخاصة
-- ─────────────────────────────────────────────
create table if not exists public.acc_refunds (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.acc_companies(id),
  payment_id         uuid not null references public.acc_payments(id),
  invoice_id         uuid not null references public.acc_invoices(id),
  amount_minor       bigint not null check (amount_minor > 0),
  currency           char(3) not null references public.acc_currencies(code),
  status             text not null default 'REQUESTED' check (status in
                       ('REQUESTED','PROCESSING','REFUNDED','FAILED','CANCELLED')),
  effective_date     date,
  external_refund_id text,
  -- حل نسخة سياسة الاسترداد (POL-008/009) بتاريخ الأثر — لا ترميز
  refund_policy_id   text check (refund_policy_id ~ '^POL-[0-9]{3}$'),
  policy_version     integer,
  policy_status_used text,
  provisional        boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  unique (company_id, external_refund_id)
);
create index if not exists acc_refunds_payment_idx on public.acc_refunds (payment_id);

create or replace function public.acc_refunds_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'acc_refunds are never deleted'; end if;
  if new.company_id is distinct from old.company_id
     or new.payment_id is distinct from old.payment_id
     or new.created_at is distinct from old.created_at then
    raise exception 'acc_refunds: identity is immutable';
  end if;
  if old.status = 'REFUNDED'
     and (new.amount_minor is distinct from old.amount_minor
          or new.currency is distinct from old.currency
          or new.refund_policy_id is distinct from old.refund_policy_id
          or new.policy_version is distinct from old.policy_version) then
    raise exception 'a confirmed refund financial fact is immutable';
  end if;
  if new.status is distinct from old.status then
    if coalesce(current_setting('acc.refund_op', true), '') <> old.id::text then
      raise exception 'refund status changes only through the signed refund operations';
    end if;
    if not ( (old.status = 'REQUESTED'  and new.status in ('PROCESSING','CANCELLED'))
          or (old.status = 'PROCESSING' and new.status in ('REFUNDED','FAILED','CANCELLED'))
          or (old.status = 'FAILED'     and new.status = 'REQUESTED') ) then
      raise exception 'forbidden refund transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists acc_refunds_guard_trg on public.acc_refunds;
create trigger acc_refunds_guard_trg
  before update or delete on public.acc_refunds
  for each row execute function public.acc_refunds_guard();

-- ─────────────────────────────────────────────
-- ٤ · ربط الأثر المحاسبي بقيدٍ مرحّل — شهادة بشرية (نمط Stage 5)
--     append-only؛ لا اشتقاق قيد آليًا — المحاسبة ترحّل ثم تشهد
-- ─────────────────────────────────────────────
create table if not exists public.acc_payment_journal_links (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.acc_companies(id),
  purpose            text not null check (purpose in
                       ('PAYMENT_CLEARING','SETTLEMENT','REFUND_CONTRA_REVENUE')),
  payment_id         uuid references public.acc_payments(id),
  settlement_id      uuid references public.acc_settlements(id),
  refund_id          uuid references public.acc_refunds(id),
  journal_entry_id   uuid not null references public.acc_journal_entries(id),
  attestation_reason text not null check (btrim(attestation_reason) <> ''),
  attested_by        uuid not null references auth.users(id),
  attested_at        timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists acc_pjl_company_idx on public.acc_payment_journal_links (company_id, purpose);
create or replace function public.acc_pjl_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'acc_payment_journal_links are append-only attestations: % refused', tg_op;
end $$;
drop trigger if exists acc_pjl_frozen_trg on public.acc_payment_journal_links;
create trigger acc_pjl_frozen_trg
  before update or delete on public.acc_payment_journal_links
  for each row execute function public.acc_pjl_frozen();

-- ─────────────────────────────────────────────
-- ٥ · RLS — دور + شركة، fail-closed؛ المالكة تسجّل دفعة لكن لا داخلًا خامًا
-- ─────────────────────────────────────────────
alter table public.acc_payments              enable row level security;
alter table public.acc_settlements           enable row level security;
alter table public.acc_settlement_lines      enable row level security;
alter table public.acc_refunds               enable row level security;
alter table public.acc_payment_journal_links enable row level security;

-- المدفوعات والاستردادات: المالكة تراها (فعلها عالي المستوى) + المهنيون
create policy acc_payments_select on public.acc_payments
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_refunds_select on public.acc_refunds
  for select using (public.acc_role(company_id) in ('BUSINESS_OWNER','ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
-- التسويات والأسطر وروابط القيود: داخل محاسبي خام — المالكة خارجه
create policy acc_settlements_select on public.acc_settlements
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_settlement_lines_select on public.acc_settlement_lines
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_pjl_select on public.acc_payment_journal_links
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));

revoke insert, update, delete on public.acc_payments              from anon, authenticated;
revoke insert, update, delete on public.acc_settlements           from anon, authenticated;
revoke insert, update, delete on public.acc_settlement_lines      from anon, authenticated;
revoke insert, update, delete on public.acc_refunds               from anon, authenticated;
revoke insert, update, delete on public.acc_payment_journal_links from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٦ · العمليات عالية المستوى (المالكة أو المحاسبة)
-- ─────────────────────────────────────────────
create or replace function public.acc_record_payment(
  p_company uuid, p_invoice uuid, p_amount_minor bigint, p_currency char(3),
  p_gateway_txn_id text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_inv record; v_id uuid;
begin
  v_user := public.acc_assert_owner_or_accountant(p_company);
  select * into v_inv from public.acc_invoices where id = p_invoice;
  if not found or v_inv.company_id <> p_company then
    raise exception 'the invoice must belong to this company';
  end if;
  if v_inv.status in ('DRAFT','DELETED','VOIDED') then
    raise exception 'a payment needs a commercially issued invoice (invoice is %)', v_inv.status;
  end if;
  insert into public.acc_payments (company_id, invoice_id, amount_minor, currency, gateway_txn_id, created_by)
  values (p_company, p_invoice, p_amount_minor, p_currency, p_gateway_txn_id, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'PAYMENT_RECORDED', 'acc_payments', v_id::text,
    null, jsonb_build_object('invoice_id', p_invoice, 'amount_minor', p_amount_minor::text,
                             'gateway_txn_id', p_gateway_txn_id), 'acc_record_payment');
  return v_id;
end $$;
revoke execute on function public.acc_record_payment(uuid,uuid,bigint,char,text) from public, anon;
grant  execute on function public.acc_record_payment(uuid,uuid,bigint,char,text) to authenticated;

-- انتقالات الدفع الموقّعة (INITIATED/PENDING/CANCELLED/FAILED بلا أثر محاسبي)
create or replace function public.acc_set_payment_status(p_payment uuid, p_new_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record;
begin
  select * into v_row from public.acc_payments where id = p_payment;
  if not found then raise exception 'unknown payment'; end if;
  v_user := public.acc_assert_owner_or_accountant(v_row.company_id);
  perform set_config('acc.payment_op', v_row.id::text, true);
  update public.acc_payments set status = p_new_status,
    received_at = case when p_new_status = 'SUCCESS' then now() else received_at end
   where id = p_payment;
  perform set_config('acc.payment_op', '', true);
  perform public.acc_audit(v_row.company_id, v_user, 'PAYMENT_STATUS_CHANGED', 'acc_payments',
    p_payment::text, jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', p_new_status), 'acc_set_payment_status');
end $$;
revoke execute on function public.acc_set_payment_status(uuid,text) from public, anon;
grant  execute on function public.acc_set_payment_status(uuid,text) to authenticated;

-- حالة سداد الفاتورة من مدفوعاتها الناجحة فقط، ناقصًا الاستردادات المؤكدة
-- (لا ازدواج، لا مساس بمحتوى الفاتورة؛ تنقل حافة Stage 4 الموقّعة)
create or replace function public.acc_sync_invoice_payment_status(p_invoice uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_inv record; v_paid bigint; v_refunded bigint; v_net bigint; v_target text;
begin
  select * into v_inv from public.acc_invoices where id = p_invoice;
  if not found then raise exception 'unknown invoice'; end if;
  select coalesce(sum(amount_minor), 0) into v_paid from public.acc_payments
   where invoice_id = p_invoice and status in ('SUCCESS','SETTLED','RECONCILED');
  select coalesce(sum(amount_minor), 0) into v_refunded from public.acc_refunds
   where invoice_id = p_invoice and status = 'REFUNDED';
  v_net := v_paid - v_refunded;
  if v_net <= 0 then return v_inv.status; end if;
  v_target := case when v_net >= coalesce(v_inv.total_minor, 0) then 'PAID' else 'PARTIALLY_PAID' end;
  -- انتقال عبر توقيع الوحدة (حافة Stage 4 المستقبلية) — من SENT/PARTIALLY_PAID
  if v_inv.status in ('SENT','PARTIALLY_PAID') and v_target <> v_inv.status then
    perform set_config('acc.invoice_module_transition', v_inv.id::text, true);
    update public.acc_invoices set status = v_target where id = p_invoice;
    perform set_config('acc.invoice_module_transition', '', true);
    perform public.acc_audit(v_inv.company_id, auth.uid(), 'INVOICE_PAYMENT_STATUS_SYNCED', 'acc_invoices',
      p_invoice::text, jsonb_build_object('status', v_inv.status),
      jsonb_build_object('status', v_target, 'net_paid_minor', v_net::text), 'acc_sync_invoice_payment_status');
  end if;
  return v_target;
end $$;
revoke execute on function public.acc_sync_invoice_payment_status(uuid) from public, anon;
grant  execute on function public.acc_sync_invoice_payment_status(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٧ · التسويات — تسجيل مزوّد (محاسبة) بأرقام مستقلة + residual مرئي
-- ─────────────────────────────────────────────
create or replace function public.acc_record_settlement(
  p_company uuid, p_provider text, p_settlement_ref text, p_settled_at date
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_id uuid;
begin
  v_user := public.acc_assert_pay_accountant(p_company);
  insert into public.acc_settlements (company_id, provider, settlement_ref, settled_at, created_by)
  values (p_company, p_provider, p_settlement_ref, p_settled_at, v_user)
  returning id into v_id;
  perform public.acc_audit(p_company, v_user, 'SETTLEMENT_RECORDED', 'acc_settlements', v_id::text,
    null, jsonb_build_object('provider', p_provider, 'ref', p_settlement_ref), 'acc_record_settlement');
  return v_id;
end $$;
revoke execute on function public.acc_record_settlement(uuid,text,text,date) from public, anon;
grant  execute on function public.acc_record_settlement(uuid,text,text,date) to authenticated;

create or replace function public.acc_add_settlement_line(
  p_settlement uuid, p_payment uuid, p_gross bigint, p_fee bigint, p_net bigint, p_currency char(3)
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_s record; v_id uuid; v_residual bigint;
begin
  select * into v_s from public.acc_settlements where id = p_settlement;
  if not found then raise exception 'unknown settlement'; end if;
  v_user := public.acc_assert_pay_accountant(v_s.company_id);
  -- الأرقام الثلاثة كما وردت — لا مساواة مفروضة (BLK-004)
  insert into public.acc_settlement_lines
    (settlement_id, company_id, payment_id, gross_minor, fee_minor, net_minor, currency)
  values (p_settlement, v_s.company_id, p_payment, p_gross, p_fee, p_net, p_currency)
  returning id into v_id;
  v_residual := p_gross - p_fee - p_net;   -- قد يكون ≠ 0، مرئي ومحفوظ بالتمام
  perform public.acc_audit(v_s.company_id, v_user, 'SETTLEMENT_LINE_ADDED', 'acc_settlement_lines',
    v_id::text, null,
    jsonb_build_object('gross_minor', p_gross::text, 'fee_minor', p_fee::text,
                       'net_minor', p_net::text, 'residual_minor', v_residual::text),
    'acc_add_settlement_line');
  -- تدقيق الباقي غير الصفري **مرة واحدة** هنا عند تسجيل السطر المجمّد
  -- الفريد — لا تكرار من قراءات لاحقة (السطر append-only). لا مساس
  -- بأي مبلغ مصدري ولا ابتلاع في رسم/إيراد.
  if v_residual <> 0 then
    perform public.acc_audit(v_s.company_id, v_user, 'SETTLEMENT_RESIDUAL_DETECTED',
      'acc_settlement_lines', v_id::text, null,
      jsonb_build_object('settlement_line_id', v_id, 'settlement_id', p_settlement,
                         'gross_minor', p_gross::text, 'fee_minor', p_fee::text,
                         'net_minor', p_net::text, 'residual_minor', v_residual::text,
                         'provider', v_s.provider, 'reference', v_s.settlement_ref),
      'acc_add_settlement_line');
  end if;
  return v_id;
end $$;
revoke execute on function public.acc_add_settlement_line(uuid,uuid,bigint,bigint,bigint,char) from public, anon;
grant  execute on function public.acc_add_settlement_line(uuid,uuid,bigint,bigint,bigint,char) to authenticated;

-- residual تسوية: مجموع (gross − fee − net) لكل أسطرها — مرئي؛ غير الصفري
-- يجب أن يُوجَّه لحساب الفرق المجهول (يُتحقق من تعيينه) لا يُبتلع
create or replace function public.acc_settlement_residual(p_settlement uuid)
returns bigint language plpgsql stable security definer set search_path to 'public' as $$
declare v_s record; v_r bigint;
begin
  select * into v_s from public.acc_settlements where id = p_settlement;
  if not found then raise exception 'unknown settlement'; end if;
  if coalesce(public.acc_role(v_s.company_id), '') not in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER') then
    raise exception 'settlement residual requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER';
  end if;
  -- قراءة صرفة (STABLE): تحسب من الحقائق المجمّدة وتُعيد — لا INSERT/UPDATE
  -- ولا استدعاء مساعد كاتب. التدقيق تمّ مرة عند تسجيل السطر، والتحقق
  -- fail-closed لخطوة المحاسبة ينتقل إلى الشهادة (acc_attest_payment_journal).
  select coalesce(sum(gross_minor - fee_minor - net_minor), 0) into v_r
  from public.acc_settlement_lines where settlement_id = p_settlement;
  return v_r;
end $$;
revoke execute on function public.acc_settlement_residual(uuid) from public, anon;
grant  execute on function public.acc_settlement_residual(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ٨ · الاستردادات — كيان + حل سياسة POL-008/009 (REV-010)
-- ─────────────────────────────────────────────
create or replace function public.acc_request_refund(
  p_payment uuid, p_amount_minor bigint, p_effective date,
  p_policy_id text, p_external_refund_id text default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_pmt record; v_pol record; v_id uuid; v_paid bigint; v_refunded bigint; v_prov boolean;
begin
  select * into v_pmt from public.acc_payments where id = p_payment;
  if not found then raise exception 'unknown payment'; end if;
  v_user := public.acc_assert_pay_accountant(v_pmt.company_id);
  if v_pmt.status not in ('SUCCESS','SETTLED','RECONCILED','DISPUTED','REFUNDED') then
    raise exception 'only a successful payment can be refunded (payment is %)', v_pmt.status;
  end if;
  if p_policy_id not in ('POL-008','POL-009') then
    raise exception 'refund treatment is governed by POL-008 or POL-009 only';
  end if;
  -- الجزئي لا يتجاوز المتبقي؛ لا يمسح الدفعة (كيان منفصل)
  select coalesce(sum(amount_minor), 0) into v_refunded from public.acc_refunds
   where payment_id = p_payment and status in ('REQUESTED','PROCESSING','REFUNDED');
  if v_refunded + p_amount_minor > v_pmt.amount_minor then
    raise exception 'refund exceeds the remaining refundable amount of the payment';
  end if;
  -- حل نسخة سياسة الاسترداد بتاريخ الأثر — لا ترميز؛ provisional إن غير معتمدة
  select * into v_pol from public.acc_resolve_policy(v_pmt.company_id, p_policy_id, p_effective, 'SANDBOX');
  if v_pol.policy_id is null or v_pol.refusal is not null then
    raise exception 'no version of % is resolvable on the effective date', p_policy_id;
  end if;
  v_prov := coalesce(v_pol.is_provisional, true) or v_pol.scope is distinct from 'COMPANY'
            or v_pol.status is distinct from 'APPROVED';
  insert into public.acc_refunds
    (company_id, payment_id, invoice_id, amount_minor, currency, effective_date,
     external_refund_id, refund_policy_id, policy_version, policy_status_used, provisional, created_by)
  values (v_pmt.company_id, p_payment, v_pmt.invoice_id, p_amount_minor, v_pmt.currency, p_effective,
          p_external_refund_id, p_policy_id, v_pol.version, v_pol.status, v_prov, v_user)
  returning id into v_id;
  perform public.acc_audit(v_pmt.company_id, v_user, 'REFUND_REQUESTED', 'acc_refunds', v_id::text,
    null, jsonb_build_object('amount_minor', p_amount_minor::text, 'policy_id', p_policy_id,
                             'policy_version', v_pol.version, 'provisional', v_prov), 'acc_request_refund');
  return v_id;
end $$;
revoke execute on function public.acc_request_refund(uuid,bigint,date,text,text) from public, anon;
grant  execute on function public.acc_request_refund(uuid,bigint,date,text,text) to authenticated;

create or replace function public.acc_set_refund_status(p_refund uuid, p_new_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_row record; v_pmt record; v_totalref bigint;
begin
  select * into v_row from public.acc_refunds where id = p_refund;
  if not found then raise exception 'unknown refund'; end if;
  v_user := public.acc_assert_pay_accountant(v_row.company_id);
  perform set_config('acc.refund_op', v_row.id::text, true);
  update public.acc_refunds set status = p_new_status where id = p_refund;
  perform set_config('acc.refund_op', '', true);
  -- استرداد كامل مؤكد ينقل الدفعة إلى REFUNDED (الجزئي لا)
  if p_new_status = 'REFUNDED' then
    select coalesce(sum(amount_minor), 0) into v_totalref from public.acc_refunds
     where payment_id = v_row.payment_id and status = 'REFUNDED';
    select * into v_pmt from public.acc_payments where id = v_row.payment_id;
    if v_totalref >= v_pmt.amount_minor and v_pmt.status in ('SUCCESS','SETTLED','RECONCILED','DISPUTED') then
      perform set_config('acc.payment_op', v_pmt.id::text, true);
      update public.acc_payments set status = 'REFUNDED' where id = v_pmt.id;
      perform set_config('acc.payment_op', '', true);
    end if;
  end if;
  perform public.acc_audit(v_row.company_id, v_user, 'REFUND_STATUS_CHANGED', 'acc_refunds',
    p_refund::text, jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', p_new_status), 'acc_set_refund_status');
end $$;
revoke execute on function public.acc_set_refund_status(uuid,text) from public, anon;
grant  execute on function public.acc_set_refund_status(uuid,text) to authenticated;

-- ─────────────────────────────────────────────
-- ٩ · شهادة ربط القيد المرحّل (نمط Stage 5) — المحاسبة حصرًا
--     لا اشتقاق آليًا؛ قيد نفس الشركة POSTED + شهادة سبب إلزامية
-- ─────────────────────────────────────────────
create or replace function public.acc_attest_payment_journal(
  p_purpose text, p_journal_entry uuid, p_attestation_reason text,
  p_payment uuid default null, p_settlement uuid default null, p_refund uuid default null
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid; v_j record; v_company uuid; v_id uuid;
begin
  if p_attestation_reason is null or btrim(p_attestation_reason) = '' then
    raise exception 'a same-company POSTED journal alone is not proof — an explicit accountant attestation reason is required';
  end if;
  select * into v_j from public.acc_journal_entries where id = p_journal_entry;
  if not found then raise exception 'unknown journal entry'; end if;
  v_company := v_j.company_id;
  v_user := public.acc_assert_pay_accountant(v_company);
  if v_j.status <> 'POSTED' then
    raise exception 'the recognition/payment journal must be POSTED (entry is %)', v_j.status;
  end if;
  -- الكيان المرجعي (إن وُجد) من نفس الشركة
  if p_payment is not null and (select company_id from public.acc_payments where id = p_payment) is distinct from v_company then
    raise exception 'the payment must belong to the journal company'; end if;
  if p_settlement is not null and (select company_id from public.acc_settlements where id = p_settlement) is distinct from v_company then
    raise exception 'the settlement must belong to the journal company'; end if;
  -- خطوة المحاسبة fail-closed: تسوية بباقٍ غير صفري تتطلب حساب الفرق
  -- المجهول معيّنًا — لا شهادة/أثر يمر بلا مسار الفرق (لا ابتلاع)
  if p_purpose = 'SETTLEMENT' and p_settlement is not null
     and public.acc_settlement_residual(p_settlement) <> 0 then
    perform public.acc_required_account(v_company, 'UNIDENTIFIED_SETTLEMENT_DIFFERENCE');
  end if;
  if p_refund is not null and (select company_id from public.acc_refunds where id = p_refund) is distinct from v_company then
    raise exception 'the refund must belong to the journal company'; end if;
  insert into public.acc_payment_journal_links
    (company_id, purpose, payment_id, settlement_id, refund_id, journal_entry_id, attestation_reason, attested_by)
  values (v_company, p_purpose, p_payment, p_settlement, p_refund, p_journal_entry, btrim(p_attestation_reason), v_user)
  returning id into v_id;
  perform public.acc_audit(v_company, v_user, 'PAYMENT_JOURNAL_ATTESTED', 'acc_payment_journal_links',
    v_id::text, null, jsonb_build_object('purpose', p_purpose, 'journal_entry', p_journal_entry),
    'acc_attest_payment_journal');
  return v_id;
end $$;
revoke execute on function public.acc_attest_payment_journal(text,uuid,text,uuid,uuid,uuid) from public, anon;
grant  execute on function public.acc_attest_payment_journal(text,uuid,text,uuid,uuid,uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ١٠ · تقادم المقاصّة (Clearing Ageing) — مصدره الدفتر + الحساب المعيّن
--      لا رصيد ثانيًا مخزّنًا؛ الرصيد غير الصفري استثناء لا تقريب
-- ─────────────────────────────────────────────
create or replace function public.acc_clearing_ageing(
  p_company uuid, p_as_of date default current_date, p_stale_days integer default 7
)
returns table (
  entry_date date, source_kind text, reference text,
  debit_minor text, credit_minor text, open_balance_minor text,
  age_days integer, stale boolean
)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_clearing uuid;
begin
  if coalesce(public.acc_role(p_company), '') not in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER') then
    raise exception 'clearing ageing requires ACCOUNTANT, AUDITOR or FINANCE_MANAGER in this company';
  end if;
  v_clearing := public.acc_required_account(p_company, 'GATEWAY_CLEARING'); -- fail-closed
  return query
  select e.entry_date, s.kind, s.reference,
         case when l.side = 'DEBIT'  then l.base_amount_minor::text else '0' end,
         case when l.side = 'CREDIT' then l.base_amount_minor::text else '0' end,
         (sum(case when l.side = 'DEBIT' then l.base_amount_minor else -l.base_amount_minor end)
            over (order by e.entry_date, e.posted_at, l.created_at, l.id))::text,
         (p_as_of - e.entry_date)::integer,
         (p_as_of - e.entry_date) > p_stale_days
  from public.acc_journal_lines l
  join public.acc_journal_entries e on e.id = l.entry_id
  join public.acc_sources s on s.id = e.source_id
  where l.account_id = v_clearing and e.status in ('POSTED','REVERSED')
    and e.entry_date <= p_as_of
  order by e.entry_date, e.posted_at, l.created_at, l.id;
end $$;
revoke execute on function public.acc_clearing_ageing(uuid,date,integer) from public, anon;
grant  execute on function public.acc_clearing_ageing(uuid,date,integer) to authenticated;
