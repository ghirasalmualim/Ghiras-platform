-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 10 · تصحيح موجّه: مسار المطابقة اليدوية
-- يسري بعد supabase/2026-09-01-accounting-reconciliation.sql (تاريخ
-- لاحق يفرز/يُطبَّق بعده يقينًا). لا يعدّل هجرات 1..9 ولا هجرة Stage 10
-- الأساس؛ يعيد تعريف دالة واحدة حصرًا بنفس التوقيع والعقد.
--
-- العيب (أثبتته Staging): المسار اليدوي (p_run IS NULL) يترك السجل
-- v_run غير مُسنَد، بينما أربعة تعبيرات لاحقة تُقيّم
--   coalesce((p_payload->>'company_id')::uuid, v_run.company_id)
-- وPL/pgSQL يرفض أي مرجع لسجل غير مُسنَد حتى داخل COALESCE:
--   record "v_run" is not assigned yet
-- فتعطّل المسار اليدوي كاملًا (فشل مغلق — لا فساد بيانات).
--
-- الجذر: عدديّ صريح v_company uuid يُحسم **مرة واحدة** في فرعه:
--   يدوي  → company_id من الحمولة المحكومة (إلزامي، ويُتحقق من عضوية
--            الفاعل المصادَق ودوره في هذه الشركة بالذات قبل أي استخدام)
--   محرك → v_run.company_id بعد تحميل الجولة والتحقق منها
-- وكل ما بعد الفرعين يستعمل v_company حصرًا — صفر مرجع لـv_run خارج
-- فرع p_run IS NOT NULL. المراجعة الكاملة أثبتت أن الدالتين الأخريين
-- (record_event/complete_run) تُحمّلان الجولة إلزاميًا فلا عيب فيهما.
--
-- الدلالات محفوظة حرفيًا: اليدوي يولد MANUALLY_MATCHED والتأكيد فعل
-- بشري مستقل؛ مسار المحرك (SYSTEM + المُطلِق البشري على الجولة +
-- REC-001/002 + كل الحرّاس) كما هو بلا أي إضعاف.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.acc_recon_create_assertion(
  p_run uuid, p_actor uuid, p_payload jsonb
)
returns table (reconciliation_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_run record; v_s record; v_company uuid; v_id uuid; a jsonb; f jsonb;
        v_mode text; v_type text; v_state text; v_score integer; v_cov integer;
        v_override boolean; v_ref text; v_mf integer;
        v_banks integer; v_targets integer;
        v_period record; v_diff bigint; v_diff_reason text; v_manual boolean;
begin
  v_manual := (p_run is null);
  if not v_manual and auth.uid() is not null then
    raise exception 'the engine path is service-only — humans use the manual path';
  end if;
  if v_manual then
    -- مطابقة يدوية: فعل بشري authenticated بشركة صريحة محسومة أولًا
    if auth.uid() is null or auth.uid() <> p_actor then
      raise exception 'manual matching is a human act';
    end if;
    v_company := (p_payload->>'company_id')::uuid;
    if v_company is null then
      raise exception 'manual matching requires an explicit company_id';
    end if;
    if not (coalesce(public.acc_role(v_company), '')
            = any (array['ACCOUNTANT','FINANCE_MANAGER'])) then
      raise exception 'manual matching requires ACCOUNTANT or FINANCE_MANAGER';
    end if;
    select s.* into v_s from public.acc_recon_settings s
     where s.company_id = v_company and s.status = 'ACTIVE';
    if not found then raise exception 'no ACTIVE reconciliation settings'; end if;
  else
    select r.* into v_run from public.acc_recon_runs r where r.id = p_run;
    if not found or v_run.state <> 'RUNNING' then raise exception 'run is not RUNNING'; end if;
    if v_run.initiated_by <> p_actor then raise exception 'actor must be the run initiator'; end if;
    v_company := v_run.company_id;
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
    (v_company, p_run, v_s.id, v_s.version,
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
      (v_id, v_company,
       (a->>'bank_transaction_id')::uuid, a->>'target_kind', (a->>'target_id')::uuid,
       (a->>'allocated_minor')::bigint, a->>'currency', a->>'expected_direction', a->>'layer_key');
  end loop;
  for f in select * from jsonb_array_elements(coalesce(p_payload->'factors', '[]'::jsonb)) loop
    insert into public.acc_recon_factor_evidence
      (reconciliation_id, company_id, factor_key, available, matched, weight_bp, contribution_bp, provenance)
    values
      (v_id, v_company,
       f->>'factor_key', (f->>'available')::boolean, (f->>'matched')::boolean,
       (f->>'weight_bp')::integer, (f->>'contribution_bp')::integer, coalesce(f->'provenance', '{}'::jsonb));
  end loop;
  perform set_config('acc.recon_op', '', true);

  -- الفترة الحاكمة: AUTO المؤكد يمتنع عند فترة مقفلة/مؤرشفة — الرفض
  -- بنيوي هنا والدليل الدائم يسجّله المحرك بنداء مستقل (درس Stage 7)
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
        raise exception 'CLOSED_PERIOD_CONFLICT: confirmation blocked for a closed/archived period target';
      end if;
    end loop;
  end if;

  perform public.acc_audit(v_company, p_actor,
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
