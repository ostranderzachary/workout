-- Forged: global leaderboard.
-- Run once, after schema.sql: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run again.
--
-- Boards: weekly XP, monthly XP, total XP and bosses defeated.
-- * All XP matches the History page: workout XP plus weekly bonuses and boss rewards (minus missed-day
--   penalties). The app works these out and reports them; this database checks every number against what
--   the logged workouts, weekly bonuses and boss fights could earn, caps anything above that, and
--   recomputes the level. If the app hasn't reported a period yet, its workout XP is used instead.
-- * Joining is opt-in. Others only ever see your display name, title, level and scores: never your email
--   or your workouts.

-- ---------- Workout XP, matching the app ----------
-- Lifting: 25 + 10-15 XP per set for the first 40 sets (heavier sets a little more, up to 15 at 400 lb).
-- Cardio: 25 + 2 XP per minute, up to 180 minutes.

create or replace function public.forged_num(t text) returns numeric
language sql immutable set search_path = '' as $$
  select case when t ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then t::numeric else 0 end
$$;

create or replace function public.forged_date(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end;
$$;

create or replace function public.forged_workout_xp(w jsonb) returns integer
language sql immutable set search_path = '' as $$
  select case
    when w->>'kind' = 'cardio' then
      25 + round(least(180, greatest(0, public.forged_num(w->>'minutes'))) * 2)::integer
    else
      25 + coalesce((
        select sum(round(10 * (1 + 0.5 * sqrt(least(400,
                 greatest(0, public.forged_num(f.st->>'weight')) * (case when w->>'unit' = 'kg' then 2.20462 else 1 end)) / 400))))::integer
        from (
          select s.st
          from jsonb_array_elements(case when jsonb_typeof(w->'exercises') = 'array' then w->'exercises' else '[]'::jsonb end)
                 with ordinality as e(ex, i),
               jsonb_array_elements(case when jsonb_typeof(e.ex->'sets') = 'array' then e.ex->'sets' else '[]'::jsonb end)
                 with ordinality as s(st, j)
          order by e.i, s.j
          limit 40
        ) f
      ), 0)
  end
$$;

-- ---------- Who's on the board ----------
create table if not exists public.leaderboard (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null,
  title text not null default '',
  theme text not null default '',
  total_xp integer not null default 0,
  level integer not null default 1,
  bosses integer not null default 0,
  streak integer not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_name_ok check (
    char_length(display_name) between 2 and 24
    and display_name = btrim(display_name)
    and display_name !~ '[<>[:cntrl:]]'),
  constraint leaderboard_text_ok check (char_length(title) <= 40 and char_length(theme) <= 40)
);

-- Weekly and monthly XP as the app shows them, with the Monday of that week and the 1st of that month.
alter table public.leaderboard add column if not exists week_xp integer not null default 0;
alter table public.leaderboard add column if not exists week_of date;
alter table public.leaderboard add column if not exists month_xp integer not null default 0;
alter table public.leaderboard add column if not exists month_of date;

-- No two people can take the same name (ignoring capitals).
create unique index if not exists leaderboard_name_unique on public.leaderboard (lower(display_name));

alter table public.leaderboard enable row level security;
revoke all on public.leaderboard from anon;
grant select, insert, update, delete on public.leaderboard to authenticated;

-- You can only read and change your own entry; everyone else's comes through forged_leaderboard() below.
drop policy if exists "Own leaderboard entry" on public.leaderboard;
create policy "Own leaderboard entry" on public.leaderboard for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every save is checked:
-- * bosses can't be more than the bosses you've actually fought (your saved boss fights), or one per 5 levels;
-- * total XP can't be more than four times the workout XP the database can see, plus 1,000 a week for weekly
--   bonuses, plus the rewards for those bosses (the same formula as the app);
-- * the level is recomputed from the XP;
-- * weekly XP can't be more than that week's workout XP, plus 1,000 for weekly bonuses, plus the rewards for
--   bosses fought that week; monthly XP the same for the month, with 6,000 for the weeks' bonuses.
create or replace function public.forged_period_cap(uid uuid, d0 date, d1 date, bonus integer, max_tier integer) returns integer
language sql stable security definer set search_path = '' as $$
  select (select coalesce(sum(public.forged_workout_xp(w.data)), 0)
            from public.workouts w
            where w.user_id = uid and w.data->>'date' >= to_char(d0, 'YYYY-MM-DD') and w.data->>'date' <= to_char(d1, 'YYYY-MM-DD'))
       + bonus
       + (select coalesce(sum(round(100 * (10 * t + 1) * (1 + 0.05 * (t - 1)) / 50.0) * 50), 0)
            from (select distinct (f->>'tier')::integer as t
                    from public.profiles p,
                         jsonb_array_elements(case when jsonb_typeof(p.goals->'bossFights') = 'array' then p.goals->'bossFights' else '[]'::jsonb end) f
                    where p.user_id = uid and f->>'tier' ~ '^[0-9]+$' and f->>'start' ~ '^[0-9]+$'
                      -- a day either side, so time zones never cut off a real fight
                      and to_timestamp((f->>'start')::bigint / 1000.0) >= d0 - 1
                      and to_timestamp((f->>'start')::bigint / 1000.0) < d1 + 2) x
            where x.t between 1 and max_tier)::integer
$$;

create or replace function public.forged_leaderboard_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wxp integer;
  first_day date;
  weeks integer;
  fought integer;
  b integer;
  boss_xp integer;
begin
  select coalesce(sum(public.forged_workout_xp(w.data)), 0), min(public.forged_date(w.data->>'date'))
    into wxp, first_day
    from public.workouts w where w.user_id = new.user_id;
  weeks := case when first_day is null then 0 else greatest(1, (current_date - first_day) / 7 + 1) end;
  select count(distinct f->>'tier') into fought
    from public.profiles p,
         jsonb_array_elements(case when jsonb_typeof(p.goals->'bossFights') = 'array' then p.goals->'bossFights' else '[]'::jsonb end) f
    where p.user_id = new.user_id;
  b := least(greatest(coalesce(new.bosses, 0), 0), coalesce(fought, 0));
  -- Boss reward for tier t (level 5t): the XP of the next two levels, plus 5% for each boss before it
  select coalesce(sum(round(100 * (10 * t + 1) * (1 + 0.05 * (t - 1)) / 50.0) * 50), 0)::integer into boss_xp
    from generate_series(1, b) t;
  new.total_xp := least(greatest(coalesce(new.total_xp, 0), 0), 4 * wxp + 1000 * weeks + boss_xp);
  new.level := floor((1 + sqrt(1 + 8 * new.total_xp / 100.0)) / 2)::integer;
  new.bosses := least(b, new.level / 5);
  new.streak := least(greatest(coalesce(new.streak, 0), 0), weeks);
  if new.week_of is null then new.week_xp := 0;
  else
    new.week_of := new.week_of - (extract(isodow from new.week_of)::integer - 1); -- always a Monday
    new.week_xp := least(greatest(coalesce(new.week_xp, 0), 0),
                         public.forged_period_cap(new.user_id, new.week_of, new.week_of + 6, 1000, new.bosses));
  end if;
  if new.month_of is null then new.month_xp := 0;
  else
    new.month_of := date_trunc('month', new.month_of)::date; -- always the 1st
    new.month_xp := least(greatest(coalesce(new.month_xp, 0), 0),
                          public.forged_period_cap(new.user_id, new.month_of, (new.month_of + interval '1 month - 1 day')::date, 6000, new.bosses));
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.joined_at := old.joined_at; end if;
  return new;
end;
$$;

drop trigger if exists leaderboard_check on public.leaderboard;
create trigger leaderboard_check before insert or update on public.leaderboard
  for each row execute function public.forged_leaderboard_check();

-- ---------- Reading a board ----------
-- board: 'week', 'month', 'total' or 'bosses'. on_day: the viewer's own date, so weeks (Monday to Sunday)
-- and months follow their calendar. Returns the top rows plus your own row wherever you are.
create or replace function public.forged_leaderboard(board text, on_day date default current_date, max_rows integer default 100)
returns table (
  place bigint, display_name text, title text, theme text, level integer, score integer,
  total_xp integer, bosses integer, streak integer, workouts integer, is_me boolean, players bigint
)
language sql stable security definer set search_path = '' as $$
  with span as (
    select
      case board when 'week' then on_day - (extract(isodow from on_day)::integer - 1)
                 when 'month' then date_trunc('month', on_day)::date end as d0,
      case board when 'week' then on_day - (extract(isodow from on_day)::integer - 1) + 6
                 when 'month' then (date_trunc('month', on_day) + interval '1 month - 1 day')::date end as d1
  ),
  done as (
    select w.user_id, count(*)::integer as n, sum(public.forged_workout_xp(w.data))::integer as xp
    from public.workouts w
    join public.leaderboard l on l.user_id = w.user_id
    cross join span
    where span.d0 is null
       or (w.data->>'date' >= to_char(span.d0, 'YYYY-MM-DD') and w.data->>'date' <= to_char(span.d1, 'YYYY-MM-DD'))
    group by w.user_id
  ),
  scored as (
    -- Weekly and monthly XP: what the app reported for this period, or the workout XP if it hasn't yet
    select l.user_id, l.display_name, l.title, l.theme, l.level, l.total_xp, l.bosses, l.streak,
           coalesce(d.n, 0) as n,
           case when board = 'week' then (case when l.week_of = span.d0 then l.week_xp else coalesce(d.xp, 0) end)
                when board = 'month' then (case when l.month_of = span.d0 then l.month_xp else coalesce(d.xp, 0) end)
                when board = 'bosses' then l.bosses
                else l.total_xp end as score
    from public.leaderboard l
    cross join span
    left join done d on d.user_id = l.user_id
  ),
  ranked as (
    select rank() over (order by s.score desc, s.total_xp desc) as place, s.*,
           s.user_id = (select auth.uid()) as me,
           count(*) over () as players
    from scored s
  )
  select r.place, r.display_name, r.title, r.theme, r.level, r.score, r.total_xp, r.bosses, r.streak, r.n, r.me, r.players
  from ranked r
  where board in ('week', 'month', 'total', 'bosses')
    and ((r.place <= greatest(1, least(coalesce(max_rows, 100), 500)) and (r.score > 0 or board in ('total', 'bosses'))) or r.me)
  order by r.place, r.display_name
$$;

-- Only signed-in people can read boards; the helpers above are for the database's own use.
revoke all on function public.forged_leaderboard(text, date, integer) from public, anon;
grant execute on function public.forged_leaderboard(text, date, integer) to authenticated;
revoke all on function public.forged_num(text) from public, anon, authenticated;
revoke all on function public.forged_date(text) from public, anon, authenticated;
revoke all on function public.forged_workout_xp(jsonb) from public, anon, authenticated;
revoke all on function public.forged_leaderboard_check() from public, anon, authenticated;
revoke all on function public.forged_period_cap(uuid, date, date, integer, integer) from public, anon, authenticated;
