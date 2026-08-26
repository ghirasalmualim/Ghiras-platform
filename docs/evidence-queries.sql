-- =====================================================================
-- STEP 1B - EVIDENCE ONLY. READ-ONLY QUERIES.
-- Nothing here creates, alters, deletes or updates anything.
-- Run each block in the Supabase SQL editor and send back the output.
-- =====================================================================


-- Q1 -- Is there a trigger on auth.users, and what does it call?
select  t.tgname                          as trigger_name,
        case t.tgtype::int & 2 when 2 then 'BEFORE' else 'AFTER' end as timing,
        case when (t.tgtype::int & 4)>0 then 'INSERT'
             when (t.tgtype::int & 8)>0 then 'DELETE'
             when (t.tgtype::int &16)>0 then 'UPDATE' end            as event,
        p.proname                         as function_name,
        t.tgenabled                       as enabled
from    pg_trigger t
join    pg_class   c on c.oid = t.tgrelid
join    pg_namespace n on n.oid = c.relnamespace
join    pg_proc   p on p.oid = t.tgfoid
where   n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;


-- Q2 -- Full source of whatever function Q1 named.
--       Replace 'handle_new_user' with the function_name Q1 returned.
select  p.proname,
        p.prosecdef            as is_security_definer,
        p.proconfig            as search_path_setting,
        pg_get_functiondef(p.oid) as full_source
from    pg_proc p
join    pg_namespace n on n.oid = p.pronamespace
where   p.proname in ('handle_new_user','ensure_profile','touch_last_active')
   and  n.nspname in ('public','auth');


-- Q3 -- Orphans. Auth users with no profile row, and the reverse.
select  'auth user without profile' as kind, count(*) as n
from    auth.users u
left join public.profiles p on p.id = u.id
where   p.id is null
union all
select  'profile without auth user', count(*)
from    public.profiles p
left join auth.users u on u.id = p.id
where   u.id is null;


-- Q4 -- The orphans themselves (identifiers only, no secrets).
select  u.id, u.email, u.created_at, u.last_sign_in_at,
        u.email_confirmed_at, u.banned_until
from    auth.users u
left join public.profiles p on p.id = u.id
where   p.id is null
order by u.created_at desc
limit   50;


-- Q5 -- Is login_logs actually empty, or was the claim wrong?
select  count(*) as total_rows,
        count(*) filter (where success)     as successes,
        count(*) filter (where not success) as failures,
        min(created_at) as first_row,
        max(created_at) as last_row
from    public.login_logs;


-- Q6 -- The most recent login attempts (no passwords, no tokens stored).
select  created_at, username, success, user_id is null as no_user_link
from    public.login_logs
order by created_at desc
limit   20;


-- Q7 -- Row-level security policies that could block a login_logs insert.
select  policyname, cmd, roles, qual, with_check
from    pg_policies
where   schemaname = 'public' and tablename = 'login_logs';


-- Q8 -- Is the subscriptions table used at all, or is profiles.sub_end alone?
select  'subscriptions rows' as what, count(*)::text as value from public.subscriptions
union all
select  'invoices rows',      count(*)::text from public.invoices
union all
select  'profiles with sub_end', count(*)::text from public.profiles where sub_end is not null
union all
select  'profiles total',     count(*)::text from public.profiles;


-- Q9 -- Accounts whose last_active is null (the "has not logged in yet" label).
select  count(*) filter (where last_active is null) as never_active,
        count(*) filter (where last_active is not null) as has_been_active,
        count(*) as total
from    public.profiles;


-- Q10 -- Duplicate or conflicting identity data.
select  'duplicate username' as issue, username as value, count(*) as n
from    public.profiles group by username having count(*) > 1
union all
select  'duplicate auth email', email, count(*)
from    auth.users group by email having count(*) > 1;
