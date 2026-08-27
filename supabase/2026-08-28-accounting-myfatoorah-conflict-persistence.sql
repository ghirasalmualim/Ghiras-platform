-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 7 · تصحيح موجّه: ثبات حالة CONFLICT
-- يسري بعد supabase/2026-08-27-accounting-myfatoorah.sql (تاريخ لاحق
-- يفرز/يُطبَّق بعده يقينًا). لا يعدّل هجرات Stage 1..6 ولا الهجرة
-- الأساس؛ يستبدل تعريف acc_mf_record_event فقط بالسلوك المصحّح.
--
-- العيب (Stage 7، acc_mf_record_event): مسار التعارض كان يكتب
-- processing_state='CONFLICT' + تدقيق MF_EVENT_CONFLICT ثم يرفع
-- استثناءً في نفس الاستدعاء — فتُلغى الكتابتان (rollback). النتيجة:
-- الحالة تبقى RECEIVED والتدقيق يختفي رغم منع الاستبدال.
--
-- التصحيح: التعارض يُبلَّغ كـ**نتيجة بنيوية** (outcome='CONFLICT') بلا
-- رفع استثناء في المسار الطبيعي؛ فتثبت الحالة والتدقيق. المستدعي
-- (المسار/الخادم) يميّز CREATED / IDEMPOTENT_DUPLICATE / CONFLICT
-- ويحوّل CONFLICT إلى HTTP 409 في الطبقة العليا لا كاستثناء SQL.
-- الحمولة الأصلية لا تُستبدل أبدًا. صفر أثر تجاري/محاسبي. BLK-004 كما هو.
--
-- تغيير نوع الإرجاع (uuid → table) يستوجب DROP صريحًا للتوقيع القديم
-- (بلا CASCADE) ثم إعادة الإنشاء والمنح. المستدعي الوحيد هو route
-- الويبهوك (RPC بالاسم) — يُحدَّث ضمن هذا التصحيح. لا overload غامض:
-- التوقيع القديم يُسقَط قبل إنشاء الجديد بنفس أسماء/أنواع الوسائط.
-- ═══════════════════════════════════════════════════════════════

-- تثبيت التعارض: الحالة تنتقل إلى CONFLICT مرة (عبر التوقيع الموثوق
-- acc.mf_op فقط)، والحمولة الأصلية لا تُمَسّ، وتدقيق دائم لكل ملاحظة
-- تعارض (شذوذ تسليم) ببصمات SHA-256 للحمولتين المُسقَطتين فقط — بلا
-- حمولة خام حسّاسة ولا أسرار. دالة داخلية للخادم الموثوق حصرًا. تُعرَّف
-- بـ SECURITY DEFINER لتبقى بوابة CONFLICT محصورة في مسار الابتلاع.
-- تُعرَّف أولًا كي يجدها acc_mf_record_event عند فحص جسده.
create or replace function public.acc_mf_mark_conflict(
  v_existing public.acc_mf_events, p_payload jsonb, p_source text
)
returns table (event_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
begin
  perform set_config('acc.mf_op', v_existing.id::text, true);
  update public.acc_mf_events set processing_state = 'CONFLICT'
   where id = v_existing.id and processing_state is distinct from 'CONFLICT';
  perform set_config('acc.mf_op', '', true);
  perform public.acc_audit(v_existing.company_id, null, 'MF_EVENT_CONFLICT', 'acc_mf_events',
    v_existing.id::text, null,
    jsonb_build_object(
      'provider', v_existing.provider,
      'event_reference', v_existing.event_reference,
      'source', coalesce(p_source, 'WEBHOOK'),
      'existing_payload_sha256', encode(sha256(convert_to(v_existing.payload::text, 'UTF8')), 'hex'),
      'incoming_payload_sha256', encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'),
      'reason', 'PROVIDER_EVENT_REFERENCE_PAYLOAD_CONFLICT'),
    'acc_mf_record_event');
  return query select v_existing.id, 'CONFLICT'::text;
end $$;
revoke execute on function public.acc_mf_mark_conflict(public.acc_mf_events, jsonb, text) from public, anon, authenticated;
grant  execute on function public.acc_mf_mark_conflict(public.acc_mf_events, jsonb, text) to service_role;

-- إسقاط صريح للتوقيع القديم (returns uuid) — لا CASCADE، لا اعتماد SQL آخر
drop function if exists public.acc_mf_record_event(uuid,integer,text,text,text,boolean,jsonb,text);

create function public.acc_mf_record_event(
  p_company uuid, p_event_code integer, p_event_name text, p_event_reference text,
  p_source text, p_signature_valid boolean, p_payload jsonb, p_business_key text
)
returns table (event_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_existing public.acc_mf_events;
begin
  -- idempotency التسليم: نفس Event.Reference = دليل واحد
  select * into v_existing from public.acc_mf_events
   where company_id = p_company and provider = 'MYFATOORAH' and event_reference = p_event_reference;
  if found then
    if v_existing.payload is distinct from p_payload then
      return query select r.event_id, r.outcome
        from public.acc_mf_mark_conflict(v_existing, p_payload, p_source) r;
    else
      return query select v_existing.id, 'IDEMPOTENT_DUPLICATE'::text;  -- تكرار مطابق = لا أثر
    end if;
    return;
  end if;
  -- إدراج جديد؛ سباق نادر بنفس المرجع = unique_violation نلتقطه ونعيد الحسم
  begin
    insert into public.acc_mf_events
      (company_id, event_code, event_name, event_reference, source, signature_valid, payload, business_key,
       processing_state)
    values (p_company, p_event_code, p_event_name, p_event_reference, coalesce(p_source,'WEBHOOK'),
            p_signature_valid, p_payload, p_business_key,
            case when not p_signature_valid then 'REJECTED_SIGNATURE'
                 when p_event_name in ('SUPPLIER_STATUS_CHANGED','SUPPLIER_UPDATE_REQUEST_CHANGED') then 'UNSUPPORTED'
                 else 'RECEIVED' end)
    returning id into v_id;
  exception when unique_violation then
    select * into v_existing from public.acc_mf_events
     where company_id = p_company and provider = 'MYFATOORAH' and event_reference = p_event_reference;
    if v_existing.payload is distinct from p_payload then
      return query select r.event_id, r.outcome
        from public.acc_mf_mark_conflict(v_existing, p_payload, p_source) r;
    else
      return query select v_existing.id, 'IDEMPOTENT_DUPLICATE'::text;
    end if;
    return;
  end;
  perform public.acc_audit(p_company, null,
    case when not p_signature_valid then 'MF_EVENT_REJECTED_SIGNATURE' else 'MF_EVENT_RECEIVED' end,
    'acc_mf_events', v_id::text, null,
    jsonb_build_object('event_name', p_event_name, 'reference', p_event_reference,
                       'source', p_source, 'signature_valid', p_signature_valid), 'acc_mf_record_event');
  return query select v_id, 'CREATED'::text;
end $$;
revoke execute on function public.acc_mf_record_event(uuid,integer,text,text,text,boolean,jsonb,text) from public, anon, authenticated;
grant  execute on function public.acc_mf_record_event(uuid,integer,text,text,text,boolean,jsonb,text) to service_role;  -- الخادم الموثوق حصرًا
