-- Forged: tables and security rules for Supabase.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run again; it only adds what is missing.

-- One row per workout. `data` holds the workout exactly as the app stores it.
create table if not exists public.workouts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- One row per person: goals (with their history, body weight and boss fights) and settings.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goals jsonb,
  prefs jsonb,
  updated_at timestamptz not null default now()
);

-- Row level security: nobody can read or write anything unless a policy below allows it.
alter table public.workouts enable row level security;
alter table public.profiles enable row level security;

-- Only signed-in people can use the tables at all (the public key alone gets nothing)...
revoke all on public.workouts, public.profiles from anon;
grant select, insert, update, delete on public.workouts, public.profiles to authenticated;

-- ...and each person only ever sees and changes their own rows.
drop policy if exists "Own workouts" on public.workouts;
create policy "Own workouts" on public.workouts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Keep updated_at current on every change.
create or replace function public.forged_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workouts_touch on public.workouts;
create trigger workouts_touch before update on public.workouts
  for each row execute function public.forged_touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.forged_touch_updated_at();

-- Live updates: an open phone or laptop hears about changes made on another device.
do $$
begin
  alter publication supabase_realtime add table public.workouts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
