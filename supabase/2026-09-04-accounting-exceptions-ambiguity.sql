-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 11: تصحيح غموض PL/pgSQL موضعي
-- (يُطبَّق **بعد** 2026-09-03؛ لا مساس بأي هجرة سابقة)
--
-- العطب المُثبت على Staging (خطأ 42702):
--   column reference "exception_id" is ambiguous
-- السبب: acc_exception_ingest تُعيد table(exception_id, outcome)،
-- فيصير exception_id متغيّر إخراج، وقائمة استدلال ON CONFLICT
-- ‏(exception_id, source_kind, source_id, source_role) مرجع عمود
-- **غير مؤهَّل** — وقوائم استدلال ON CONFLICT لا تقبل التأهيل
-- بمستعار أصلًا، فالحل بتسمية القيد صراحةً.
--
-- الشكل المعتمد: ON CONFLICT ON CONSTRAINT — يحفظ سلامة التزامن
-- كاملةً (القيد الفريد يبقى السلطة النهائية تحت التزامن)، بخلاف
-- WHERE NOT EXISTS الذي يُضعف idempotency عند التوازي.
--
-- تثبيت الاسم: القيد الرباعي أُنشئ ضمنيًا بـunique(...) فحمل اسمًا
-- مولَّدًا مبتورًا (يتجاوز اسمه الكامل ٦٣ محرفًا) — أي اسمًا مشتقًا
-- من البيئة لا يصحّ ترميزه. لذا نكتشفه بتعريفه ثم نعيد تسميته إلى
-- اسم صريح ثابت: عملية بيانات-وصفية بحتة، لا تُسقط فهرسًا ولا
-- تلمس صفًا ولا تغيّر التفرّد. غيابه = فشل مغلق صريح.
--
-- لا تغيير في: التوقيع، عقد table(exception_id, outcome)، الأمن،
-- الرسائل الدلالية، حرّاس C1/C2/C3، أو أي دالة أخرى. صفر قيود،
-- صفر AI، صفر مساس بحقائق Stages 1..10.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ١ · تثبيت اسم القيد الرباعي (بيانات وصفية فقط، idempotent)
-- ─────────────────────────────────────────────
do $$
declare v_name text;
begin
  -- القيد المستهدف بتعريفه لا باسمه المولَّد
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.acc_exception_source_links'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid)
        = 'UNIQUE (exception_id, source_kind, source_id, source_role)';
  if v_name is null then
    -- ربما سُمّي سابقًا بهذه الهجرة نفسها (إعادة تطبيق)
    if exists (select 1 from pg_constraint c
               where c.conrelid = 'public.acc_exception_source_links'::regclass
                 and c.conname = 'acc_exception_source_links_uniq') then
      return;
    end if;
    raise exception 'the four-column UNIQUE (exception_id, source_kind, source_id, source_role) constraint was not found — refusing to weaken concurrent idempotency';
  end if;
  if v_name <> 'acc_exception_source_links_uniq' then
    execute format(
      'alter table public.acc_exception_source_links rename constraint %I to acc_exception_source_links_uniq',
      v_name);
  end if;
end $$;

-- ─────────────────────────────────────────────
-- ٢ · إعادة تعريف الاستيعاب — سطران فقط تغيّرا (قائمتا ON CONFLICT)
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
        on conflict on constraint acc_exception_source_links_uniq do nothing;
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
    on conflict on constraint acc_exception_source_links_uniq do nothing;
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

-- ═══ نهاية تصحيح Stage 11 — سطران في دالة واحدة، بلا مساس بغيرها ═══
