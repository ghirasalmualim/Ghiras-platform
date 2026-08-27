-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 7: MYFATOORAH (محوّل المزوّد)
-- أدلة الأحداث الخام · التأكيدات · جولات الاسترداد · ابتلاع حالة
-- المزوّد إلى كيانات Stage 6 العامة — بلا ترحيل آلي (BLK-004 مفتوح)
-- (Git فقط — فوق هجرات Stage 1..6 ولا تعدّلها)
--
-- المزوّد يملك حقيقة **الحالة**؛ محرك غراس يملك **المعالجة المحاسبية**
-- (MF-005). الويبهوك مُحفِّز؛ GetPaymentStatus هو التأكيد قبل أي أثر
-- محاسبي (MF-013). idempotency طبقتان: تسليم (Event.Reference) وأثر
-- تجاري (معرّف كيان المزوّد). SUCCESS نهائية (MF-011). صفر ترحيل آلي:
-- لا دالة هنا تستدعي acc_post_journal — الترحيل يبقى بشهادة Stage 6.
--
-- ⚠️ لا أسرار في أي صف/تدقيق: التحقق من التوقيع يتم في طبقة الخادم
-- قبل الابتلاع، والمفتاح بيئي. البطاقة/التوكن لا تُخزَّن — تقليل بيانات.
-- كل تخويل fail-closed (coalesce(acc_role,'')). الابتلاع فاعله WEBHOOK/
-- IMPORT (لا auth.uid بشري مزيّف) عبر دوال محجوبة يستدعيها الخادم.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · أدلة الأحداث الخام — idempotency التسليم (Event.Reference)
-- ─────────────────────────────────────────────
create table if not exists public.acc_mf_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  provider          text not null default 'MYFATOORAH',
  event_code        integer not null,
  event_name        text not null,
  event_reference   text not null,          -- Event.Reference (فريد للتسليم)
  source            text not null default 'WEBHOOK' check (source in ('WEBHOOK','RECOVERY')),
  signature_valid   boolean not null,
  -- الحمولة بعد تقليل البيانات — لا رؤوس اعتماد ولا PAN/توكن
  payload           jsonb not null,
  -- مفتاح الأثر التجاري المستخرَج (PaymentId/Refund.Id/Deposit.Reference/
  -- Dispute.DisputeTransactionId/Recurring.Id) — الطبقة الثانية
  business_key      text,
  processing_state  text not null default 'RECEIVED' check (processing_state in
                      ('RECEIVED','REJECTED_SIGNATURE','CONFLICT','CONFIRMED','APPLIED','IGNORED','UNSUPPORTED')),
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  -- طبقة أ: نفس الحدث لا يُبتلع مرتين
  unique (company_id, provider, event_reference)
);
create index if not exists acc_mf_events_biz_idx on public.acc_mf_events (company_id, business_key);

-- سجل الأدلة append-only؛ الحالة تتحرك بتوقيع الخادم فقط
create or replace function public.acc_mf_events_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'acc_mf_events are permanent provider evidence — never deleted (MF-015)'; end if;
  if new.company_id is distinct from old.company_id
     or new.event_reference is distinct from old.event_reference
     or new.payload is distinct from old.payload
     or new.signature_valid is distinct from old.signature_valid
     or new.received_at is distinct from old.received_at then
    raise exception 'acc_mf_events evidence facts are immutable';
  end if;
  if new.processing_state is distinct from old.processing_state
     and coalesce(current_setting('acc.mf_op', true), '') <> old.id::text then
    raise exception 'event processing state changes only through the signed ingestion path';
  end if;
  return new;
end $$;
drop trigger if exists acc_mf_events_guard_trg on public.acc_mf_events;
create trigger acc_mf_events_guard_trg
  before update or delete on public.acc_mf_events
  for each row execute function public.acc_mf_events_guard();

-- ─────────────────────────────────────────────
-- ٢ · تأكيدات المزوّد — تاريخ append-only (لا تفرّد يمنع تأكيدًا لاحقًا)
-- ─────────────────────────────────────────────
create table if not exists public.acc_mf_confirmations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.acc_companies(id),
  provider          text not null default 'MYFATOORAH',
  kind              text not null check (kind in ('GET_PAYMENT_STATUS','GET_DEPOSITED_INVOICES')),
  provider_ref      text not null,          -- PaymentId / Deposit.Reference
  triggering_event  uuid references public.acc_mf_events(id),
  recovery_run      uuid,
  requested_at      timestamptz not null default now(),
  received_at       timestamptz,
  result_state      text not null check (result_state in ('OK','FAILED','UNAVAILABLE')),
  -- استجابة المزوّد الخام (بعد تقليل البيانات) + الحقائق المستخرَجة
  raw_response      jsonb,
  extracted         jsonb,
  created_at        timestamptz not null default now()
  -- لا unique(company, provider_ref, kind): التأكيد قد يتكرر شرعًا
);
create index if not exists acc_mf_confirmations_ref_idx on public.acc_mf_confirmations (company_id, provider_ref, kind);
create or replace function public.acc_mf_confirmations_frozen()
returns trigger language plpgsql as $$
begin raise exception 'acc_mf_confirmations are append-only history: % refused', tg_op; end $$;
drop trigger if exists acc_mf_confirmations_frozen_trg on public.acc_mf_confirmations;
create trigger acc_mf_confirmations_frozen_trg
  before update or delete on public.acc_mf_confirmations
  for each row execute function public.acc_mf_confirmations_frozen();

-- ─────────────────────────────────────────────
-- ٣ · جولات استرداد GetWebhooks — نوافذ UTC متداخلة
-- ─────────────────────────────────────────────
create table if not exists public.acc_mf_recovery_runs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.acc_companies(id),
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  pages_fetched integer not null default 0,
  events_seen   integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create or replace function public.acc_mf_recovery_frozen()
returns trigger language plpgsql as $$
begin raise exception 'acc_mf_recovery_runs are append-only: % refused', tg_op; end $$;
drop trigger if exists acc_mf_recovery_frozen_trg on public.acc_mf_recovery_runs;
create trigger acc_mf_recovery_frozen_trg
  before update or delete on public.acc_mf_recovery_runs
  for each row execute function public.acc_mf_recovery_frozen();

-- ─────────────────────────────────────────────
-- ٤ · RLS — أدلة المزوّد للمهنيين قراءةً؛ الكتابة عبر دوال الخادم
-- ─────────────────────────────────────────────
alter table public.acc_mf_events        enable row level security;
alter table public.acc_mf_confirmations enable row level security;
alter table public.acc_mf_recovery_runs enable row level security;
create policy acc_mf_events_select on public.acc_mf_events
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_mf_confirmations_select on public.acc_mf_confirmations
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
create policy acc_mf_recovery_select on public.acc_mf_recovery_runs
  for select using (public.acc_role(company_id) in ('ACCOUNTANT','AUDITOR','FINANCE_MANAGER'));
revoke insert, update, delete on public.acc_mf_events        from anon, authenticated;
revoke insert, update, delete on public.acc_mf_confirmations from anon, authenticated;
revoke insert, update, delete on public.acc_mf_recovery_runs from anon, authenticated;

-- ─────────────────────────────────────────────
-- ٥ · تصليب Stage 6: مسار المزوّد الموثوق FAILED→SUCCESS (MF-011)
--     Stage 6 يسمح PENDING→SUCCESS فقط؛ حقيقة المزوّد قد تعطي SUCCESS
--     بعد FAILED. نعيد تعريف حارس المدفوعات (create or replace محمولًا
--     في Stage 7 — لا تعديل لملف Stage 6) بإضافة حافة واحدة موقّعة
--     acc.payment_provider_override؛ تحفظ تاريخ FAILED، وتُدقَّق، ولا
--     تُعرَض لواجهة بشرية. SUCCESS تبقى نهائية (FAILED لاحقًا يُتجاهل).
-- ─────────────────────────────────────────────
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
  if old.status in ('SUCCESS','SETTLED','RECONCILED','REFUNDED','DISPUTED')
     and (new.amount_minor is distinct from old.amount_minor
          or new.currency is distinct from old.currency
          or new.gateway_txn_id is distinct from old.gateway_txn_id
          or new.received_at is distinct from old.received_at) then
    raise exception 'a successful payment financial fact is immutable';
  end if;
  if new.status is distinct from old.status then
    -- حافة المزوّد الموثوقة: FAILED→SUCCESS بتوقيعها الخاص فقط
    if old.status = 'FAILED' and new.status = 'SUCCESS' then
      if coalesce(current_setting('acc.payment_provider_override', true), '') <> old.id::text then
        raise exception 'FAILED -> SUCCESS is a provider-authoritative override, only through the signed MyFatoorah path';
      end if;
      return new;
    end if;
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

-- ─────────────────────────────────────────────
-- ٦ · سلطة الابتلاع — فاعل خادم/مزوّد (WEBHOOK/IMPORT) لا auth.uid بشري
--     تُستدعى من route الخادم بمفتاح الخدمة بعد التحقق من التوقيع.
--     محجوبة عن authenticated: لا bypass عام في SQL.
-- ─────────────────────────────────────────────
create or replace function public.acc_mf_record_event(
  p_company uuid, p_event_code integer, p_event_name text, p_event_reference text,
  p_source text, p_signature_valid boolean, p_payload jsonb, p_business_key text
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_existing record;
begin
  -- idempotency التسليم: نفس Event.Reference = دليل واحد
  select * into v_existing from public.acc_mf_events
   where company_id = p_company and provider = 'MYFATOORAH' and event_reference = p_event_reference;
  if found then
    -- حمولة مختلفة بنفس المرجع = تعارض: لا استبدال، نسجّل ونوقف الأمن
    if v_existing.payload is distinct from p_payload then
      perform set_config('acc.mf_op', v_existing.id::text, true);
      update public.acc_mf_events set processing_state = 'CONFLICT' where id = v_existing.id;
      perform set_config('acc.mf_op', '', true);
      perform public.acc_audit(p_company, null, 'MF_EVENT_CONFLICT', 'acc_mf_events',
        v_existing.id::text, null, jsonb_build_object('event_reference', p_event_reference), 'acc_mf_record_event');
      raise exception 'duplicate Event.Reference % with a conflicting payload — recorded, processing stopped', p_event_reference;
    end if;
    return v_existing.id;  -- تكرار مطابق = نفس الدليل، لا أثر جديد
  end if;
  insert into public.acc_mf_events
    (company_id, event_code, event_name, event_reference, source, signature_valid, payload, business_key,
     processing_state)
  values (p_company, p_event_code, p_event_name, p_event_reference, coalesce(p_source,'WEBHOOK'),
          p_signature_valid, p_payload, p_business_key,
          case when not p_signature_valid then 'REJECTED_SIGNATURE'
               when p_event_name in ('SUPPLIER_STATUS_CHANGED','SUPPLIER_UPDATE_REQUEST_CHANGED') then 'UNSUPPORTED'
               else 'RECEIVED' end)
  returning id into v_id;
  perform public.acc_audit(p_company, null,
    case when not p_signature_valid then 'MF_EVENT_REJECTED_SIGNATURE' else 'MF_EVENT_RECEIVED' end,
    'acc_mf_events', v_id::text, null,
    jsonb_build_object('event_name', p_event_name, 'reference', p_event_reference,
                       'source', p_source, 'signature_valid', p_signature_valid), 'acc_mf_record_event');
  return v_id;
end $$;
revoke execute on function public.acc_mf_record_event(uuid,integer,text,text,text,boolean,jsonb,text) from public, anon, authenticated;
grant  execute on function public.acc_mf_record_event(uuid,integer,text,text,text,boolean,jsonb,text) to service_role;  -- الخادم الموثوق حصرًا

-- تسجيل تأكيد (append-only) — تاريخ لا يُستبدل
create or replace function public.acc_mf_record_confirmation(
  p_company uuid, p_kind text, p_provider_ref text, p_event uuid,
  p_result_state text, p_raw jsonb, p_extracted jsonb
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  insert into public.acc_mf_confirmations
    (company_id, kind, provider_ref, triggering_event, received_at, result_state, raw_response, extracted)
  values (p_company, p_kind, p_provider_ref, p_event, now(), p_result_state, p_raw, p_extracted)
  returning id into v_id;
  perform public.acc_audit(p_company, null, 'MF_CONFIRMATION_RECORDED', 'acc_mf_confirmations',
    v_id::text, null, jsonb_build_object('kind', p_kind, 'ref', p_provider_ref, 'result', p_result_state),
    'acc_mf_record_confirmation');
  return v_id;
end $$;
revoke execute on function public.acc_mf_record_confirmation(uuid,text,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant  execute on function public.acc_mf_record_confirmation(uuid,text,text,uuid,text,jsonb,jsonb) to service_role;  -- الخادم الموثوق حصرًا

-- تطبيق حالة الدفع المؤكَّدة على Stage 6 (MF-011/013/016):
-- يُستدعى **بعد** GetPaymentStatus OK فقط. الأثر التجاري idempotent
-- عبر gateway_txn_id=PaymentId. SUCCESS نهائية: FAILED لاحقًا يُتجاهل
-- ويُدقَّق ولا يعكس. INITIATED/PENDING/FAILED/CANCELLED صفر أثر محاسبي.
create or replace function public.acc_mf_apply_payment_status(
  p_event uuid, p_payment_id text, p_confirmed_status text
)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_ev record; v_pmt record;
begin
  select * into v_ev from public.acc_mf_events where id = p_event;
  if not found then raise exception 'unknown MyFatoorah event'; end if;
  -- الأثر التجاري: الدفعة مطابَقة بمعرّف المعاملة (طبقة ب) — مرجعان
  -- مختلفان لنفس PaymentId لا يضاعفان دفعة
  select * into v_pmt from public.acc_payments
   where company_id = v_ev.company_id and gateway_txn_id = p_payment_id;
  if not found then
    -- لا دفعة محلية بعد (حدث قبل التسجيل) — الدليل محفوظ، لا أثر
    perform set_config('acc.mf_op', v_ev.id::text, true);
    update public.acc_mf_events set processing_state = 'CONFIRMED' where id = p_event;
    perform set_config('acc.mf_op', '', true);
    return;
  end if;

  if p_confirmed_status = 'SUCCESS' then
    if v_pmt.status in ('SUCCESS','SETTLED','RECONCILED','REFUNDED','DISPUTED') then
      null;  -- SUCCESS نهائية بلفعل — تكرار بلا أثر (idempotent)
    elsif v_pmt.status = 'FAILED' then
      -- أسبقية المزوّد: FAILED→SUCCESS بتوقيعها، مع حفظ تاريخ FAILED
      perform set_config('acc.payment_provider_override', v_pmt.id::text, true);
      update public.acc_payments set status = 'SUCCESS', received_at = now() where id = v_pmt.id;
      perform set_config('acc.payment_provider_override', '', true);
      perform public.acc_audit(v_ev.company_id, null, 'MF_PAYMENT_SUCCESS_OVERRIDE', 'acc_payments',
        v_pmt.id::text, jsonb_build_object('status','FAILED'), jsonb_build_object('status','SUCCESS'),
        'acc_mf_apply_payment_status');
    else
      perform set_config('acc.payment_op', v_pmt.id::text, true);
      update public.acc_payments set status = 'SUCCESS', received_at = now() where id = v_pmt.id;
      perform set_config('acc.payment_op', '', true);
    end if;
  elsif p_confirmed_status in ('FAILED','CANCELED') then
    if v_pmt.status in ('SUCCESS','SETTLED','RECONCILED','REFUNDED','DISPUTED') then
      -- تخفيض بعد SUCCESS: يُتجاهل ويُدقَّق (MF-011) — لا عكس
      perform public.acc_audit(v_ev.company_id, null, 'MF_LATE_FAILED_IGNORED', 'acc_payments',
        v_pmt.id::text, null, jsonb_build_object('confirmed_status', p_confirmed_status), 'acc_mf_apply_payment_status');
    elsif v_pmt.status = 'PENDING' then
      perform set_config('acc.payment_op', v_pmt.id::text, true);
      update public.acc_payments set status = 'FAILED' where id = v_pmt.id;
      perform set_config('acc.payment_op', '', true);
    end if;
  end if;

  perform set_config('acc.mf_op', v_ev.id::text, true);
  update public.acc_mf_events set processing_state = 'APPLIED' where id = p_event;
  perform set_config('acc.mf_op', '', true);
end $$;
revoke execute on function public.acc_mf_apply_payment_status(uuid,text,text) from public, anon, authenticated;
grant  execute on function public.acc_mf_apply_payment_status(uuid,text,text) to service_role;  -- الخادم الموثوق حصرًا

-- تسجيل جولة استرداد (append-only) — للتدقيق والتمييز عن WEBHOOK
create or replace function public.acc_mf_record_recovery(
  p_company uuid, p_start timestamptz, p_end timestamptz, p_pages integer, p_events integer
)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  insert into public.acc_mf_recovery_runs (company_id, window_start, window_end, pages_fetched, events_seen)
  values (p_company, p_start, p_end, p_pages, p_events) returning id into v_id;
  perform public.acc_audit(p_company, null, 'MF_RECOVERY_SWEEP', 'acc_mf_recovery_runs',
    v_id::text, null, jsonb_build_object('start', p_start, 'end', p_end, 'events', p_events), 'acc_mf_record_recovery');
  return v_id;
end $$;
revoke execute on function public.acc_mf_record_recovery(uuid,timestamptz,timestamptz,integer,integer) from public, anon, authenticated;
grant  execute on function public.acc_mf_record_recovery(uuid,timestamptz,timestamptz,integer,integer) to service_role;  -- الخادم الموثوق حصرًا

-- ─────────────────────────────────────────────
-- ٧ · ابتلاع idempotent لكيانات المزوّد الموثوقة (concurrency-safe)
--     التكرار الشرعي = NO-OP لا خطأ؛ القيود الفريدة تبقى السلطة
--     النهائية. المتطابق يعيد الكيان القائم؛ المتعارض = CONFLICT بلا
--     استبدال ولا كيان ثانٍ ولا أثر. service_role فقط (الخادم).
--     ⛔ لا ترحيل: هذه دوال ابتلاع حالة/كيان لا قيد (BLK-004).
-- ─────────────────────────────────────────────
create or replace function public.acc_mf_ingest_payment(
  p_company uuid, p_invoice uuid, p_amount_minor bigint, p_currency char(3), p_payment_id text
)
returns table (payment_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_exist record;
begin
  -- إدراج ذرّي؛ التعارض على (company, gateway_txn_id) = التكرار
  insert into public.acc_payments (company_id, invoice_id, amount_minor, currency, gateway_txn_id)
  values (p_company, p_invoice, p_amount_minor, p_currency, p_payment_id)
  on conflict (company_id, gateway_txn_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.acc_audit(p_company, null, 'MF_PAYMENT_INGESTED', 'acc_payments', v_id::text,
      null, jsonb_build_object('payment_id', p_payment_id), 'acc_mf_ingest_payment');
    return query select v_id, 'CREATED'::text; return;
  end if;
  -- تكرار: أعد قراءة الفائز وقارن الحقائق الثابتة
  select * into v_exist from public.acc_payments
   where company_id = p_company and gateway_txn_id = p_payment_id;
  if v_exist.amount_minor = p_amount_minor and v_exist.currency = p_currency
     and v_exist.invoice_id = p_invoice then
    return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text; return;  -- NO-OP
  end if;
  -- متعارض: لا استبدال، لا كيان ثانٍ، لا أثر — CONFLICT مدقَّق
  perform public.acc_audit(p_company, null, 'MF_PAYMENT_CONFLICT', 'acc_payments', v_exist.id::text,
    jsonb_build_object('amount_minor', v_exist.amount_minor::text, 'invoice_id', v_exist.invoice_id),
    jsonb_build_object('amount_minor', p_amount_minor::text, 'invoice_id', p_invoice), 'acc_mf_ingest_payment');
  return query select v_exist.id, 'CONFLICT'::text;
end $$;
revoke execute on function public.acc_mf_ingest_payment(uuid,uuid,bigint,char,text) from public, anon, authenticated;
grant  execute on function public.acc_mf_ingest_payment(uuid,uuid,bigint,char,text) to service_role;

create or replace function public.acc_mf_ingest_settlement(
  p_company uuid, p_provider text, p_deposit_ref text, p_settled_at date
)
returns table (settlement_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_exist record;
begin
  insert into public.acc_settlements (company_id, provider, settlement_ref, settled_at)
  values (p_company, p_provider, p_deposit_ref, p_settled_at)
  on conflict (company_id, provider, settlement_ref) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.acc_audit(p_company, null, 'MF_SETTLEMENT_INGESTED', 'acc_settlements', v_id::text,
      null, jsonb_build_object('deposit_ref', p_deposit_ref), 'acc_mf_ingest_settlement');
    return query select v_id, 'CREATED'::text; return;
  end if;
  select * into v_exist from public.acc_settlements
   where company_id = p_company and provider = p_provider and settlement_ref = p_deposit_ref;
  if v_exist.settled_at is not distinct from p_settled_at then
    return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text; return;
  end if;
  perform public.acc_audit(p_company, null, 'MF_SETTLEMENT_CONFLICT', 'acc_settlements', v_exist.id::text,
    jsonb_build_object('settled_at', v_exist.settled_at), jsonb_build_object('settled_at', p_settled_at),
    'acc_mf_ingest_settlement');
  return query select v_exist.id, 'CONFLICT'::text;
end $$;
revoke execute on function public.acc_mf_ingest_settlement(uuid,text,text,date) from public, anon, authenticated;
grant  execute on function public.acc_mf_ingest_settlement(uuid,text,text,date) to service_role;

create or replace function public.acc_mf_ingest_refund(
  p_company uuid, p_payment uuid, p_amount_minor bigint, p_refund_id text,
  p_policy_id text, p_effective date
)
returns table (refund_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_exist record; v_pmt record; v_pol record; v_prov boolean;
begin
  select * into v_pmt from public.acc_payments where id = p_payment;
  if not found or v_pmt.company_id <> p_company then raise exception 'payment not in company'; end if;
  -- إدراج ذرّي على external_refund_id (=Refund.Id)
  select * into v_pol from public.acc_resolve_policy(p_company, p_policy_id, p_effective, 'SANDBOX');
  v_prov := coalesce(v_pol.is_provisional, true) or v_pol.scope is distinct from 'COMPANY'
            or v_pol.status is distinct from 'APPROVED';
  insert into public.acc_refunds
    (company_id, payment_id, invoice_id, amount_minor, currency, effective_date,
     external_refund_id, refund_policy_id, policy_version, policy_status_used, provisional)
  values (p_company, p_payment, v_pmt.invoice_id, p_amount_minor, v_pmt.currency, p_effective,
          p_refund_id, p_policy_id, v_pol.version, v_pol.status, v_prov)
  on conflict (company_id, external_refund_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.acc_audit(p_company, null, 'MF_REFUND_INGESTED', 'acc_refunds', v_id::text,
      null, jsonb_build_object('refund_id', p_refund_id), 'acc_mf_ingest_refund');
    return query select v_id, 'CREATED'::text; return;
  end if;
  select * into v_exist from public.acc_refunds
   where company_id = p_company and external_refund_id = p_refund_id;
  if v_exist.amount_minor = p_amount_minor and v_exist.payment_id = p_payment then
    return query select v_exist.id, 'IDEMPOTENT_DUPLICATE'::text; return;
  end if;
  perform public.acc_audit(p_company, null, 'MF_REFUND_CONFLICT', 'acc_refunds', v_exist.id::text,
    jsonb_build_object('amount_minor', v_exist.amount_minor::text),
    jsonb_build_object('amount_minor', p_amount_minor::text), 'acc_mf_ingest_refund');
  return query select v_exist.id, 'CONFLICT'::text;
end $$;
revoke execute on function public.acc_mf_ingest_refund(uuid,uuid,bigint,text,text,date) from public, anon, authenticated;
grant  execute on function public.acc_mf_ingest_refund(uuid,uuid,bigint,text,text,date) to service_role;
