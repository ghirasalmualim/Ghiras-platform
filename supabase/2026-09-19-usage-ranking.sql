-- ═══════════════════════════════════════════════════════════════
-- ترتيبُ الأكثرِ استخدامًا للمنصّة — للوحةِ الأدمِن.
--
-- ★ المشكلة: المنصّةُ لم تكن تحفظُ تاريخَ زياراتٍ قَطّ. `last_active` يحفظُ
--   آخرَ مرّةٍ فقط (يُكتَب فوقَ نفسِه)، فلا يُعرَفُ منه من دخلتْ ثلاثين يومًا
--   ممّن دخلتْ مرّةً واحدة. هذا الملفُّ يبدأُ التأريخَ الحقيقيَّ من اليوم.
--
-- ★ لا يمسُّ touch_activity ولا admin_list_users ولا أيَّ دالّةٍ قائمة:
--   جدولٌ جديدٌ ودالّتانِ جديدتانِ فحسب.
--
-- يُنفَّذُ مرّةً على Supabase → SQL Editor. آمنٌ لإعادةِ التشغيل.
-- ═══════════════════════════════════════════════════════════════

-- ── ١) سجلُّ أيّامِ النشاط: صفٌّ واحدٌ لكلِّ مستخدمةٍ في كلِّ يوم ──
--     صغيرٌ عمدًا: ١٥٠٠ حسابٍ × يومٍ = ١٥٠٠ صفًّا كحدٍّ أقصى يوميًّا.
--     اليومُ بتوقيتِ الكويت (UTC+3 بلا صيفيّ) كما في ai_daily_usage.
create table if not exists public.activity_days (
  user_id  uuid        not null references public.profiles(id) on delete cascade,
  day_key  date        not null,
  hits     integer     not null default 1 check (hits > 0),  -- ≈ ساعاتُ الاستخدامِ في اليوم
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, day_key)
);
create index if not exists activity_days_day_idx on public.activity_days(day_key desc);

alter table public.activity_days enable row level security;
-- القراءةُ للأدمِن وللمالكةِ نفسِها. لا كتابةَ مباشرةً — الدالّةُ أدناه وحدَها تكتب.
drop policy if exists activity_days_select on public.activity_days;
create policy activity_days_select on public.activity_days for select
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.activity_days from anon;
grant select on public.activity_days to authenticated;

-- ── ٢) تسجيلُ يومِ نشاط — تُنادى من ActivityPing مع touch_activity ──
--     خنقٌ في القاعدةِ نفسِها: لا يزيدُ العدّادُ إلّا بعد خمسينَ دقيقةً من
--     آخرِ زيادة، فمهما تكرّرَ النداءُ (تبويباتٌ كثيرةٌ، تخزينٌ محليٌّ ممسوح)
--     يبقى ≈ نبضةً في الساعة. و`last_at` يُحدَّثُ دائمًا لأنّه قياسُ قُربٍ لا عدّ.
create or replace function public.log_activity_day()
 returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_day  date := (now() at time zone 'Asia/Kuwait')::date;
begin
  if v_user is null then return; end if;
  -- الاسمُ المستعارُ `ad` مقصود: داخلَ ON CONFLICT يُشارُ إلى الصفِّ القائمِ
  -- باسمِ الجدولِ كما كُتب، ولا يُقبلُ فيه اسمٌ مؤهَّلٌ بالمخطَّط (public.…).
  insert into public.activity_days as ad (user_id, day_key)
  values (v_user, v_day)
  on conflict (user_id, day_key) do update
    set hits = case
                 when ad.last_at < now() - interval '50 minutes'
                 then ad.hits + 1
                 else ad.hits
               end,
        last_at = now();
end $$;
revoke all on function public.log_activity_day() from public, anon;
grant execute on function public.log_activity_day() to authenticated;

-- ── ٣) الترتيب: كلُّ المسجَّلاتِ لا المشترِكاتِ وحدَهنّ ──
--     يُرجِعُ لكلِّ حسابٍ مقاييسَ مستقلّةً ولا يخترعُ «درجةً» مركَّبة: الرقمُ
--     المركَّبُ يُخفي مصدرَه فيُضلّل. الترتيبُ الافتراضيُّ بأيّامِ النشاطِ ثمّ
--     بالنبضاتِ ثمّ بآخرِ ظهور، واللوحةُ تتيحُ تغييرَه.
--
--     ⚠️ أيّامُ النشاطِ تبدأُ من تنفيذِ هذا الملفّ — لا تاريخَ قبلَه. أمّا
--     الألعابُ المحفوظةُ ونتائجُ الطالباتِ وطلباتُ الذكاءِ فتاريخُها قائمٌ
--     فعلًا، فالترتيبُ مفيدٌ من أوّلِ يوم.
--
--     ⚠️ دروسُ الاستوديو ليست هنا: قاعدتُها منفصلةٌ عن قاعدةِ المنصّة.
create or replace function public.admin_usage_ranking(p_days integer default 30)
 returns table (
   user_id      uuid,
   full_name    text,
   username     text,
   phone        text,
   role         text,
   status       text,
   created_at   timestamptz,
   last_active  timestamptz,
   active_days  integer,
   hits         integer,
   games        integer,
   results      integer,
   ai_requests  integer
 ) language plpgsql security definer set search_path to 'public' as $$
declare
  v_days    integer     := greatest(coalesce(p_days, 30), 1);
  v_from_d  date        := (now() at time zone 'Asia/Kuwait')::date - (v_days - 1);
  v_from_ts timestamptz := now() - (v_days || ' days')::interval;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  -- ⚠️ التصريحُ بالأنواعِ لازم: `role` و`status` نوعُهما enum لا text
  --    (public.user_role / public.user_status)، وبلا ::text ترفضُ Postgres
  --    النتيجةَ كلَّها برسالة «structure of query does not match function
  --    result type». وبقيّةُ الأعمدةِ مصبوبةٌ معها حصانةً لأيِّ تغييرِ نوعٍ لاحق.
  return query
  select p.id::uuid,
         p.full_name::text, p.username::text, p.phone::text,
         p.role::text, p.status::text,
         p.created_at::timestamptz, p.last_active::timestamptz,
         coalesce(a.d, 0)::integer,
         coalesce(a.h, 0)::integer,
         coalesce(g.n, 0)::integer,
         coalesce(r.n, 0)::integer,
         coalesce(u.n, 0)::integer
  from public.profiles p
  left join (
    select ad.user_id as uid, count(*) as d, sum(ad.hits) as h
    from public.activity_days ad
    where ad.day_key >= v_from_d
    group by ad.user_id
  ) a on a.uid = p.id
  left join (
    select sg.user_id as uid, count(*) as n
    from public.saved_games sg
    where sg.created_at >= v_from_ts and sg.deleted_at is null
    group by sg.user_id
  ) g on g.uid = p.id
  left join (
    select gr.teacher_user_id as uid, count(*) as n
    from public.game_results gr
    where gr.created_at >= v_from_ts
    group by gr.teacher_user_id
  ) r on r.uid = p.id
  left join (
    select au.user_id as uid, sum(au.request_count) as n
    from public.ai_daily_usage au
    where au.day_key >= v_from_d
    group by au.user_id
  ) u on u.uid = p.id
  order by coalesce(a.d, 0) desc,
           coalesce(a.h, 0) desc,
           p.last_active desc nulls last;
end $$;
revoke all on function public.admin_usage_ranking(integer) from public, anon;
grant execute on function public.admin_usage_ranking(integer) to authenticated;

NOTIFY pgrst, 'reload schema';

-- ── ٤) التحقّق ──
--     لا نُنادي admin_usage_ranking هنا: مُحرِّرُ SQL ينفّذُ بلا جلسةِ مستخدم،
--     فـauth.uid() فارغةٌ وis_admin() تكذّبُ فترفعُ الدالّةُ «not authorized»
--     — وذاك صوابُها لا عطلُها. نتحقّقُ من وجودِ الأشياءِ نفسِها.
select 'جدول activity_days' as "البند", count(*)::text as "القيمة" from public.activity_days
union all
select 'دالّة log_activity_day', count(*)::text from pg_proc where proname = 'log_activity_day'
union all
select 'دالّة admin_usage_ranking', count(*)::text from pg_proc where proname = 'admin_usage_ranking'
union all
select 'حسابات مسجّلة', count(*)::text from public.profiles;
