-- ═══════════════════════════════════════════════════════════════
-- غراس للمحاسبة الذكية — STAGE 8 · تصحيح موجّه: غموض أعمدة PL/pgSQL
-- يسري بعد supabase/2026-08-29-accounting-expenses-documents.sql
-- (تاريخ لاحق يفرز/يُطبَّق بعده يقينًا). لا يعدّل هجرات 1..7 ولا هجرة
-- Stage 8 الأساس؛ يعيد تعريف خمس دوال فقط بمراجع أعمدة مؤهَّلة.
--
-- العيب (أثبتته Staging): أسماء أعمدة الإخراج في RETURNS TABLE
-- (document_id / expense_id) تصطدم بمراجع أعمدة غير مؤهَّلة داخل جسد
-- الدالة نفسها، فيرفض PostgreSQL التنفيذ:
--   column reference "document_id" is ambiguous
-- ما عطّل acc_finalize_document وسلسلة أدلة المصروف بأكملها (فشل مغلق
-- — لا فساد بيانات).
--
-- الإصلاح: تأهيل **كل** مرجع عمود بالاسم المستعار الصريح — لا تغيير
-- لـplpgsql.variable_conflict ولا أي ضبط جلسة/قاعدة: الـSQL ذاته يصبح
-- قاطع الدلالة. التواقيع وعقود الإرجاع والرسائل والتدقيق وبوابات
-- الأدوار وحرّاس التوقيع (GUC) والعزل كلها محفوظة حرفيًا.
--
-- المسح المستهدف لكل دوال RETURNS TABLE في هجرة Stage 8 حصر العيب في
-- خمس دوال بالضبط (الأربع الأخريات بلا أي مرجع متصادم، وثبت عملها
-- حيًّا): acc_finalize_document · acc_delete_document ·
-- acc_submit_expense · acc_approve_expense · acc_classify_expense
-- ═══════════════════════════════════════════════════════════════

-- ١ · إقفال المستند — كما هو، بمراجع مؤهَّلة (dp/d)
create or replace function public.acc_finalize_document(p_document uuid)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_doc record; v_pages integer; v_verified integer; v_manifest text;
        v_bytes bigint; v_dup uuid;
begin
  select * into v_doc from public.acc_documents d where d.id = p_document;
  if not found then raise exception 'unknown document'; end if;
  if v_doc.state = 'FINALIZED' then
    return query select v_doc.id, 'IDEMPOTENT_DUPLICATE'::text; return;
  end if;
  select count(*), count(*) filter (where dp.upload_state = 'VERIFIED'), sum(dp.byte_size)
    into v_pages, v_verified, v_bytes
    from public.acc_document_pages dp where dp.document_id = p_document;
  if v_pages <> v_doc.expected_page_count or v_verified <> v_doc.expected_page_count then
    raise exception 'finalize requires all % declared pages verified (have %/% verified)',
      v_doc.expected_page_count, v_verified, v_pages;
  end if;
  if exists (select 1 from generate_series(1, v_doc.expected_page_count) g
             where not exists (select 1 from public.acc_document_pages dp
                               where dp.document_id = p_document and dp.page_no = g)) then
    raise exception 'page numbering must be gapless 1..%', v_doc.expected_page_count;
  end if;
  select encode(sha256(convert_to(
           string_agg(dp.page_no::text || ':' || dp.content_sha256, '|' order by dp.page_no), 'UTF8')), 'hex')
    into v_manifest
    from public.acc_document_pages dp where dp.document_id = p_document;
  perform set_config('acc.doc_op', p_document::text, true);
  update public.acc_documents d
     set state = 'FINALIZED', content_sha256 = v_manifest,
         page_count = v_doc.expected_page_count, byte_size = v_bytes
   where d.id = p_document;
  perform set_config('acc.doc_op', '', true);
  -- اشتباه تكرار محتوى (نفس البصمة داخل الشركة) — علم للمراجعة، لا رفض
  select d.id into v_dup from public.acc_documents d
   where d.company_id = v_doc.company_id and d.content_sha256 = v_manifest
     and d.id <> p_document and d.state = 'FINALIZED'
   limit 1;
  if v_dup is not null then
    update public.acc_documents d set duplicate_of_document_id = v_dup where d.id = p_document;
    perform public.acc_audit(v_doc.company_id, null, 'DOCUMENT_DUPLICATE_SUSPECTED', 'acc_documents',
      p_document::text, null, jsonb_build_object('duplicate_of', v_dup, 'sha256', v_manifest),
      'acc_finalize_document');
  end if;
  perform public.acc_audit(v_doc.company_id, null, 'DOCUMENT_FINALIZED', 'acc_documents',
    p_document::text, null,
    jsonb_build_object('sha256', v_manifest, 'pages', v_doc.expected_page_count, 'bytes', v_bytes),
    'acc_finalize_document');
  return query select p_document, 'FINALIZED'::text;
end $$;
revoke execute on function public.acc_finalize_document(uuid) from public, anon, authenticated;
grant  execute on function public.acc_finalize_document(uuid) to service_role;

-- ٢ · حذف مستند — كما هو، بمراجع مؤهَّلة (l/dp/d/j/e)
create or replace function public.acc_delete_document(p_document uuid)
returns table (document_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_doc record; v_role text; v_posted boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_doc from public.acc_documents d where d.id = p_document;
  if not found then raise exception 'unknown document'; end if;
  v_role := coalesce(public.acc_role(v_doc.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT')
          or (v_role = 'EMPLOYEE' and v_doc.uploaded_by = v_user
              and not exists (select 1 from public.acc_document_links l where l.document_id = p_document))) then
    raise exception 'document deletion requires OWNER/ACCOUNTANT (or the employee uploader while unlinked)';
  end if;
  -- مرتبط بقيد مرحَّل (مباشرة أو عبر مصروف مرحَّل)؟ حجب مدقَّق دائم
  select exists (
    select 1 from public.acc_document_links l
    where l.document_id = p_document
      and ((l.target_kind = 'JOURNAL_ENTRY' and exists
             (select 1 from public.acc_journal_entries j
              where j.id = l.target_id and j.status in ('POSTED','REVERSED')))
        or (l.target_kind = 'EXPENSE' and exists
             (select 1 from public.acc_expenses e
              where e.id = l.target_id and e.state = 'POSTED')))
  ) into v_posted;
  if v_posted then
    perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETE_BLOCKED_POSTED', 'acc_documents',
      p_document::text, null, jsonb_build_object('sha256', v_doc.content_sha256), 'acc_delete_document');
    return query select p_document, 'BLOCKED_POSTED'::text; return;
  end if;
  if exists (select 1 from public.acc_document_links l where l.document_id = p_document) then
    return query select p_document, 'BLOCKED_LINKED'::text; return;  -- فكّ أولًا (والفكّ محكوم)
  end if;
  perform set_config('acc.doc_op', p_document::text, true);
  delete from public.acc_document_pages dp where dp.document_id = p_document;
  delete from public.acc_documents d where d.id = p_document;
  perform set_config('acc.doc_op', '', true);
  perform public.acc_audit(v_doc.company_id, v_user, 'DOCUMENT_DELETED', 'acc_documents',
    p_document::text, jsonb_build_object('sha256', v_doc.content_sha256, 'doc_type', v_doc.doc_type,
    'state', v_doc.state), null, 'acc_delete_document');
  return query select p_document, 'DELETED'::text;
end $$;
revoke execute on function public.acc_delete_document(uuid) from public, anon;
grant  execute on function public.acc_delete_document(uuid) to authenticated;

-- ٣ · إرسال المصروف — كما هو، بمراجع مؤهَّلة (el/l/d/e/l1/l2)
create or replace function public.acc_submit_expense(p_expense uuid, p_mark_uncertain boolean default false)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_reason text := null;
        v_total bigint; v_other record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses e where e.id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'DRAFT' then raise exception 'only DRAFT expenses are submitted'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if not (v_role in ('BUSINESS_OWNER','ACCOUNTANT','FINANCE_MANAGER')
          or (v_role = 'EMPLOYEE' and v_exp.created_by = v_user)) then
    raise exception 'submission requires the creator or OWNER/ACCOUNTANT/FINANCE_MANAGER';
  end if;
  if v_exp.vendor_id is null then raise exception 'a submitted expense needs its vendor'; end if;
  if not exists (select 1 from public.acc_expense_lines el where el.expense_id = p_expense) then
    raise exception 'a submitted expense needs at least one line';
  end if;
  -- قاعدة المصدر: مستند FINALIZED مربوط SOURCE، أو مصدر يدوي بتبرير كتابي
  if v_exp.source_kind = 'MANUAL' then
    if v_exp.manual_justification is null or btrim(v_exp.manual_justification) = '' then
      raise exception 'a MANUAL source requires a written justification — manual is not source-less';
    end if;
  elsif not exists (
    select 1 from public.acc_document_links l
    join public.acc_documents d on d.id = l.document_id
    where l.target_kind = 'EXPENSE' and l.target_id = p_expense
      and l.link_role = 'SOURCE' and d.state = 'FINALIZED') then
    raise exception 'submission requires at least one FINALIZED linked source document';
  end if;
  select sum(el.base_amount_minor) into v_total
    from public.acc_expense_lines el where el.expense_id = p_expense;
  -- تكرار حتمي/مشتبه — لا إسقاط صامت أبدًا، القرار للإنسان
  if p_mark_uncertain then
    v_reason := 'PERSONAL_BUSINESS_AMBIGUITY';
  end if;
  if v_reason is null and v_exp.vendor_reference is not null then
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.vendor_id = v_exp.vendor_id
       and upper(btrim(e.vendor_reference)) = upper(btrim(v_exp.vendor_reference))
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
     limit 1;
    if found then
      v_reason := 'VENDOR_REFERENCE_DUPLICATE';
    end if;
  end if;
  if v_reason is null then
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.vendor_id = v_exp.vendor_id and e.expense_date = v_exp.expense_date
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
       and (select sum(el.base_amount_minor) from public.acc_expense_lines el
            where el.expense_id = e.id) = v_total
     limit 1;
    if found then
      v_reason := 'SUSPECTED_DUPLICATE';
    end if;
  end if;
  if v_reason is null then
    -- نفس دليل المصدر مستخدم في مصروف نشط آخر → مراجعة (لا أثر ثانٍ صامت)
    select e.* into v_other from public.acc_expenses e
     where e.company_id = v_exp.company_id and e.id <> p_expense
       and e.state in ('SUBMITTED','NEEDS_REVIEW','APPROVED','READY_TO_POST','POSTED')
       and exists (
         select 1 from public.acc_document_links l1
         join public.acc_document_links l2 on l2.document_id = l1.document_id
         where l1.target_kind = 'EXPENSE' and l1.target_id = p_expense and l1.link_role = 'SOURCE'
           and l2.target_kind = 'EXPENSE' and l2.target_id = e.id and l2.link_role = 'SOURCE')
     limit 1;
    if found then
      v_reason := 'SOURCE_ALREADY_USED';
    end if;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  if v_reason is not null then
    update public.acc_expenses e
       set state = 'NEEDS_REVIEW', needs_human_review = true, review_reason = v_reason,
           submitted_at = now(), submitted_by = v_user
     where e.id = p_expense;
    perform set_config('acc.expense_op', '', true);
    perform public.acc_audit(v_exp.company_id, v_user,
      case when v_reason in ('VENDOR_REFERENCE_DUPLICATE','SUSPECTED_DUPLICATE','SOURCE_ALREADY_USED')
           then 'EXPENSE_DUPLICATE_SUSPECTED' else 'EXPENSE_REVIEW_REQUIRED' end,
      'acc_expenses', p_expense::text, null,
      jsonb_build_object('reason', v_reason), 'acc_submit_expense');
    return query select p_expense, 'NEEDS_REVIEW'::text; return;
  end if;
  update public.acc_expenses e
     set state = 'SUBMITTED', submitted_at = now(), submitted_by = v_user
   where e.id = p_expense;
  perform set_config('acc.expense_op', '', true);
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_SUBMITTED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('total_base_minor', v_total::text), 'acc_submit_expense');
  return query select p_expense, 'SUBMITTED'::text;
end $$;
revoke execute on function public.acc_submit_expense(uuid,boolean) from public, anon;
grant  execute on function public.acc_submit_expense(uuid,boolean) to authenticated;

-- ٤ · اعتماد المصروف — كما هو، بمراجع مؤهَّلة (el/e/c/s)
create or replace function public.acc_approve_expense(p_expense uuid, p_reason text)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_role text; v_limit bigint;
        v_base char(3); v_total bigint; v_self boolean; v_ok boolean := false;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses e where e.id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'SUBMITTED' then raise exception 'only SUBMITTED expenses are approved'; end if;
  v_role := coalesce(public.acc_role(v_exp.company_id), '');
  if v_role not in ('FINANCE_MANAGER','BUSINESS_OWNER') then
    raise exception 'expense approval requires FINANCE_MANAGER or BUSINESS_OWNER (approval is not posting)';
  end if;
  v_self := (v_exp.created_by = v_user);
  if v_self and v_role = 'FINANCE_MANAGER' then
    raise exception 'no one approves their own submission — FINANCE_MANAGER included';
  end if;
  -- المالكة على مصروفها: تصديق ذاتي موثَّق صراحةً (MVP مالكة واحدة)
  select c.base_currency into v_base from public.acc_companies c where c.id = v_exp.company_id;
  select s.approval_limit_base_minor into v_limit
    from public.acc_expense_settings s where s.company_id = v_exp.company_id;
  select sum(el.base_amount_minor) into v_total
    from public.acc_expense_lines el where el.expense_id = p_expense;
  insert into public.acc_expense_approvals
    (expense_id, company_id, approval_role, approver_user_id, decision, reason,
     limit_base_minor, base_currency, tested_base_amount_minor, self_attested)
  values (p_expense, v_exp.company_id, v_role, v_user, 'APPROVED', p_reason,
          v_limit, v_base, v_total, v_self);
  -- شرط الاكتمال: المالكة تكفي دائمًا؛ المدير يكفي ضمن حدّ مضبوط فقط
  if v_role = 'BUSINESS_OWNER' then
    v_ok := true;
  elsif v_limit is not null and v_total <= v_limit then
    v_ok := true;
  end if;
  if v_ok then
    perform set_config('acc.expense_op', p_expense::text, true);
    update public.acc_expenses e set state = 'APPROVED' where e.id = p_expense;
    perform set_config('acc.expense_op', '', true);
    perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_APPROVED', 'acc_expenses',
      p_expense::text, null, jsonb_build_object('role', v_role, 'self_attested', v_self,
      'tested_base_minor', v_total::text, 'limit_base_minor', v_limit::text), 'acc_approve_expense');
    return query select p_expense, 'APPROVED'::text; return;
  end if;
  -- موافقة المدير فوق الحدّ (أو بلا حدّ مضبوط): تُسجَّل وتنتظر المالكة
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_APPROVED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('role', v_role, 'partial', true,
    'tested_base_minor', v_total::text, 'limit_base_minor', v_limit::text,
    'escalation', 'OWNER_APPROVAL_REQUIRED'), 'acc_approve_expense');
  return query select p_expense, 'OWNER_APPROVAL_REQUIRED'::text;
end $$;
revoke execute on function public.acc_approve_expense(uuid,text) from public, anon;
grant  execute on function public.acc_approve_expense(uuid,text) to authenticated;

-- ٥ · تصنيف المصروف — كما هو، بمراجع مؤهَّلة (el/gl/e)
create or replace function public.acc_classify_expense(
  p_expense uuid, p_policy_id text, p_as_of date
)
returns table (expense_id uuid, outcome text)
language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_exp record; v_pol record; v_missing text := null; r record;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_exp from public.acc_expenses e where e.id = p_expense;
  if not found then raise exception 'unknown expense'; end if;
  if v_exp.state <> 'APPROVED' then raise exception 'classification follows business approval (APPROVED only)'; end if;
  if coalesce(public.acc_role(v_exp.company_id), '') <> 'ACCOUNTANT' then
    raise exception 'accounting classification is the ACCOUNTANT''s act';
  end if;
  select * into v_pol from public.acc_resolve_policy(v_exp.company_id, p_policy_id, p_as_of, 'SANDBOX');
  update public.acc_expenses e
     set policy_id = p_policy_id, policy_version = v_pol.version,
         policy_status_used = v_pol.status, treatment = v_pol.treatment,
         provisional = coalesce(v_pol.is_provisional, true)
                       or v_pol.status is distinct from 'APPROVED'
   where e.id = p_expense;
  perform public.acc_audit(v_exp.company_id, v_user, 'EXPENSE_CLASSIFIED', 'acc_expenses',
    p_expense::text, null, jsonb_build_object('policy', p_policy_id, 'version', v_pol.version,
    'status', v_pol.status, 'treatment', v_pol.treatment), 'acc_classify_expense');
  if v_pol.status is distinct from 'APPROVED' then
    return query select p_expense, 'POLICY_NOT_APPROVED'::text; return;  -- provisional، لا ترحيل
  end if;
  if v_pol.treatment is distinct from 'IMMEDIATE_EXPENSE' then
    -- accrual/prepaid/capitalise محركاتها مؤجلة — يبقى provisional
    return query select p_expense, 'TREATMENT_ENGINE_DEFERRED'::text; return;
  end if;
  -- خرائط الحسابات المعتمدة: كل فئة سطر + حساب الدائن — الغياب فشل مغلق
  for r in select distinct el.category_key from public.acc_expense_lines el
            where el.expense_id = p_expense loop
    if not exists (select 1 from public.acc_gl_account_links gl
                   where gl.company_id = v_exp.company_id and gl.purpose = 'EXPENSE_ACCOUNT'
                     and gl.scope_key = r.category_key) then
      v_missing := coalesce(v_missing, '') || ' EXPENSE_ACCOUNT:' || r.category_key;
    end if;
  end loop;
  if not exists (select 1 from public.acc_gl_account_links gl
                 where gl.company_id = v_exp.company_id and gl.purpose = 'EXPENSE_PAYABLE'
                   and gl.scope_key = '') then
    v_missing := coalesce(v_missing, '') || ' EXPENSE_PAYABLE';
  end if;
  if v_missing is not null then
    return query select p_expense, ('AUTHORITATIVE_MAPPING_REQUIRED:' || v_missing)::text; return;
  end if;
  perform set_config('acc.expense_op', p_expense::text, true);
  update public.acc_expenses e set state = 'READY_TO_POST', provisional = false where e.id = p_expense;
  perform set_config('acc.expense_op', '', true);
  return query select p_expense, 'READY_TO_POST'::text;
end $$;
revoke execute on function public.acc_classify_expense(uuid,text,date) from public, anon;
grant  execute on function public.acc_classify_expense(uuid,text,date) to authenticated;
