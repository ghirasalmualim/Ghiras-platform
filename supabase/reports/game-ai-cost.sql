-- ============================================================
-- Report: what the games' AI costs, per teacher.
-- Read-only. Run in Supabase (production) -> SQL Editor.
-- 1 USD ~ 0.307 KWD (change the number below if the rate moves).
-- ============================================================

-- 1) Per teacher: calls, images, tokens, cost in fils (most expensive first)
select p.full_name,
       count(*)                                   as calls,
       sum(u.image_count)                         as images,
       sum(u.input_tokens)                        as tokens_in,
       sum(u.output_tokens)                       as tokens_out,
       round(sum(u.cost_usd) * 0.307 * 1000, 1)   as cost_fils,
       round(max(u.cost_usd) * 0.307 * 1000, 1)   as max_call_fils,
       min(u.created_at)::date                    as first_day,
       max(u.created_at)::date                    as last_day
from public.game_ai_usage u
join public.profiles p on p.id = u.user_id
group by p.full_name
order by cost_fils desc;

-- 2) One teacher, call by call (change the name)
select u.created_at, u.game, u.image_count, u.text_chars,
       u.input_tokens, u.output_tokens,
       round(u.cost_usd * 0.307 * 1000, 2) as cost_fils, u.ok
from public.game_ai_usage u
join public.profiles p on p.id = u.user_id
where p.full_name ilike '%فجر%'
order by u.created_at;
