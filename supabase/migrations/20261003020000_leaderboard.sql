-- D4: public leaderboard + profile card stats.
-- attempts are owner-only under RLS, so these SECURITY DEFINER functions expose aggregates only
-- (never seeds, raw answers, or per-attempt rows).

-- Best passed attempt per (user, challenge).
create function public.best_passes(p_league public.league default null)
returns table (user_id uuid, challenge_id text, league public.league, category text, score numeric, lift numeric)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.challenge_id, c.league, c.category, max(a.score), max(a.lift)
  from public.attempts a
  join public.challenges c on c.id = a.challenge_id
  where a.status = 'passed' and (p_league is null or c.league = p_league)
  group by a.user_id, a.challenge_id, c.league, c.category
$$;
revoke execute on function public.best_passes(public.league) from public, anon, authenticated;

create function public.leaderboard(p_league public.league default null, p_limit integer default 50)
returns table (rank bigint, username text, display_name text, avatar_url text, sprite_id text, base_model text,
               total_score numeric, passed integer, avg_lift numeric)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select user_id, sum(score) as total_score, count(*)::int as passed, avg(lift) as avg_lift
    from public.best_passes(p_league) group by user_id
  )
  select rank() over (order by agg.total_score desc), p.username, p.display_name, p.avatar_url,
         b.sprite_id, b.base_model, round(agg.total_score, 2), agg.passed, round(agg.avg_lift, 2)
  from agg
  join public.profiles p on p.id = agg.user_id
  left join public.builds b on b.user_id = agg.user_id and b.is_primary
  order by 1, p.username
  limit least(greatest(p_limit, 1), 200)
$$;

create function public.profile_card(p_username text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.profiles where username = p_username),
  best as (select bp.* from public.best_passes() bp join p on p.id = bp.user_id),
  cats as (select category, sum(score) as s from best group by category),
  ranked as (
    select user_id, rank() over (partition by league order by sum(score) desc) as r, league
    from public.best_passes() group by user_id, league
  )
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'build', (select jsonb_build_object('name', b.name, 'base_model', b.base_model, 'client', b.client, 'sprite_id', b.sprite_id, 'gear_count', jsonb_array_length(b.gear))
              from public.builds b where b.user_id = p.id and b.is_primary),
    'passed', (select count(*) from best),
    'total_score', (select coalesce(round(sum(score), 2), 0) from best),
    'avg_lift', (select round(avg(lift), 2) from best),
    'top_category', (select category from cats order by s desc, category limit 1),
    'global_rank', (select r from ranked where user_id = p.id and league = 'global'),
    'thai_rank', (select r from ranked where user_id = p.id and league = 'thai'),
    'leagues', (select coalesce(jsonb_object_agg(league, n), '{}'::jsonb) from (select league, count(*) n from best group by league) l)
  )
  from p
$$;

grant execute on function public.leaderboard(public.league, integer) to anon, authenticated;
grant execute on function public.profile_card(text) to anon, authenticated;
