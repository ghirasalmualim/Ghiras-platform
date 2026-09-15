-- ═══════════════════════════════════════════════════════════════
-- «مشاركة الملفات» لرئيسة الشعبة — مشاركة صفحة معلمة واحدة معها.
--
-- رئيسة الشعبة (اشتراك head_records_until سارٍ، أو admin) تشارك حسابًا مسجّلًا
-- (معلمة) بالاسم المستخدم أو الإيميل. المعلمة تفتح صفحتها «ملفّي» وترفع صورًا
-- وملفات بمسمّيات، وتشوف مشاركاتها هي فقط — لا لقطة رئيسة الشعبة ولا معلمة أخرى.
--
-- العزل مبني من الأساس عبر RLS: كل معلمة لا تقرأ/تكتب إلا صفوف مشاركتها، والملفات
-- في Storage خاص (bucket خاص) بمسار = معرّف المشاركة. الوصول مجاني للمعلمة —
-- التخويل الوحيد المطلوب هو أن المُشارِكة رئيسة شعبة ذات اشتراك سارٍ (يُفرض في
-- الدالة head_share_add وحدها؛ الإدراج المباشر من العميل ممنوع).
--
-- يُنفَّذ مرة واحدة: Supabase → SQL Editor → New Query. آمن لإعادة التشغيل.
-- التعليقات بالإنجليزية لتوجيه محرّر SQL.
-- ═══════════════════════════════════════════════════════════════

-- 1) share link: one row per (head, teacher). No direct client INSERT — created
--    only through head_share_add() so the entitlement + lookup are enforced.
create table if not exists public.head_shares (
  id            uuid primary key default gen_random_uuid(),
  head_id       uuid not null references public.profiles(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  teacher_label text,                         -- display name the head assigns (أسماء)
  head_label    text,                         -- head's full_name, denormalized for the teacher's view
  requested     jsonb not null default '[]'::jsonb,  -- optional list of requested item titles
  created_at    timestamptz not null default now(),
  unique (head_id, teacher_id)
);
create index if not exists head_shares_head_idx    on public.head_shares(head_id);
create index if not exists head_shares_teacher_idx on public.head_shares(teacher_id);

alter table public.head_shares enable row level security;

-- both sides may read the link; only the head may edit/revoke it.
drop policy if exists head_shares_select on public.head_shares;
create policy head_shares_select on public.head_shares
  for select using (head_id = auth.uid() or teacher_id = auth.uid());
drop policy if exists head_shares_update on public.head_shares;
create policy head_shares_update on public.head_shares
  for update using (head_id = auth.uid()) with check (head_id = auth.uid());
drop policy if exists head_shares_delete on public.head_shares;
create policy head_shares_delete on public.head_shares
  for delete using (head_id = auth.uid());
-- NOTE: no INSERT policy on purpose — inserts happen only via head_share_add().

revoke all on public.head_shares from anon;
revoke insert on public.head_shares from authenticated;
grant select, update, delete on public.head_shares to authenticated;

-- 2) uploaded files (metadata only; bytes live in Storage). The teacher uploads;
--    both she and the head can read/remove.
create table if not exists public.head_share_files (
  id            uuid primary key default gen_random_uuid(),
  share_id      uuid not null references public.head_shares(id) on delete cascade,
  title         text,                         -- free-form label (صور الإنجازات / ورقة المتفوقين …)
  storage_path  text not null,                -- object path inside the 'head-shares' bucket
  file_name     text,
  mime          text,
  size_bytes    integer,
  uploaded_by   uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists head_share_files_share_idx on public.head_share_files(share_id);

alter table public.head_share_files enable row level security;

-- select: either party of the parent share.
drop policy if exists head_share_files_select on public.head_share_files;
create policy head_share_files_select on public.head_share_files
  for select using (exists (
    select 1 from public.head_shares s
    where s.id = share_id and (s.teacher_id = auth.uid() or s.head_id = auth.uid())
  ));
-- insert: only the teacher of the share, and only as herself.
drop policy if exists head_share_files_insert on public.head_share_files;
create policy head_share_files_insert on public.head_share_files
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.head_shares s
      where s.id = share_id and s.teacher_id = auth.uid()
    )
  );
-- update: the teacher may rename her own file's title.
drop policy if exists head_share_files_update on public.head_share_files;
create policy head_share_files_update on public.head_share_files
  for update using (exists (
    select 1 from public.head_shares s
    where s.id = share_id and s.teacher_id = auth.uid()
  )) with check (exists (
    select 1 from public.head_shares s
    where s.id = share_id and s.teacher_id = auth.uid()
  ));
-- delete: either party (teacher removes her upload; head cleans up).
drop policy if exists head_share_files_delete on public.head_share_files;
create policy head_share_files_delete on public.head_share_files
  for delete using (exists (
    select 1 from public.head_shares s
    where s.id = share_id and (s.teacher_id = auth.uid() or s.head_id = auth.uid())
  ));

revoke all on public.head_share_files from anon;
grant select, insert, update, delete on public.head_share_files to authenticated;

-- 3) private Storage bucket. Object path = '<share_id>/<file>'. RLS mirrors the
--    files table via the parent share. Bucket is NOT public — URLs signed server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('head-shares', 'head-shares', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists head_shares_obj_select on storage.objects;
create policy head_shares_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'head-shares' and exists (
    select 1 from public.head_shares s
    where s.id::text = (storage.foldername(name))[1]
      and (s.teacher_id = auth.uid() or s.head_id = auth.uid())
  ));
drop policy if exists head_shares_obj_insert on storage.objects;
create policy head_shares_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'head-shares' and exists (
    select 1 from public.head_shares s
    where s.id::text = (storage.foldername(name))[1]
      and s.teacher_id = auth.uid()
  ));
drop policy if exists head_shares_obj_delete on storage.objects;
create policy head_shares_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'head-shares' and exists (
    select 1 from public.head_shares s
    where s.id::text = (storage.foldername(name))[1]
      and (s.teacher_id = auth.uid() or s.head_id = auth.uid())
  ));

-- 4) head_share_add: the ONLY way to create a share. Enforces that the caller is
--    a head with a valid entitlement (or admin), resolves the teacher by username
--    or email (case-insensitive), forbids self-share, and upserts the link.
--    Returns: 'added' | 'not_found' | 'self' | 'forbidden'.
create or replace function public.head_share_add(p_login text, p_label text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ok       boolean;
  v_head_nm  text;
  v_teacher  uuid;
begin
  select
    (role = 'admin')
      or (status <> 'suspended' and head_records_until is not null and head_records_until > now()),
    full_name
    into v_ok, v_head_nm
  from public.profiles
  where id = auth.uid();

  if not coalesce(v_ok, false) then
    raise exception 'forbidden';
  end if;

  select id into v_teacher
  from public.profiles
  where lower(username) = lower(trim(p_login))
     or (email is not null and lower(email) = lower(trim(p_login)))
  limit 1;

  if v_teacher is null then
    return 'not_found';
  end if;
  if v_teacher = auth.uid() then
    return 'self';
  end if;

  insert into public.head_shares (head_id, teacher_id, teacher_label, head_label)
    values (auth.uid(), v_teacher, nullif(trim(p_label), ''), v_head_nm)
  on conflict (head_id, teacher_id)
    do update set teacher_label = coalesce(nullif(trim(p_label), ''), public.head_shares.teacher_label),
                  head_label    = v_head_nm;

  return 'added';
end;
$function$;

grant execute on function public.head_share_add(text, text) to authenticated;

select 'head_shares: link table + files table + storage bucket + head_share_add ready' as migration_revision;
