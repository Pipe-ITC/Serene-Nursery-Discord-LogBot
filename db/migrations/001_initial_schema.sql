begin;

create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app_users (
  discord_user_id text primary key,
  game_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flowers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  rarity text not null check (rarity in ('N', 'R', 'SR', 'SSR', 'UR')),
  quest_points integer not null check (quest_points >= 0),
  assignment_level integer check (assignment_level is null or assignment_level >= 0),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists flower_logs (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references app_users(discord_user_id) on delete cascade,
  flower_id uuid not null references flowers(id) on delete cascade,
  extra_points integer not null default 0 check (extra_points >= 0),
  logged_at timestamptz not null default now(),
  unique (discord_user_id, flower_id)
);

create table if not exists flower_pins (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references app_users(discord_user_id) on delete cascade,
  flower_id uuid not null references flowers(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  unique (discord_user_id, flower_id),
  foreign key (discord_user_id, flower_id)
    references flower_logs(discord_user_id, flower_id)
    on delete cascade
);

create table if not exists admin_approval_requests (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('add_admin', 'remove_admin')),
  requested_by_discord_user_id text not null references app_users(discord_user_id) on delete cascade,
  target_discord_user_id text not null references app_users(discord_user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  approved_by_discord_user_id text references app_users(discord_user_id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (requested_by_discord_user_id <> target_discord_user_id),
  check (approved_by_discord_user_id is null or approved_by_discord_user_id <> requested_by_discord_user_id)
);

create unique index if not exists admin_approval_requests_one_pending_per_target_action
  on admin_approval_requests(action, target_discord_user_id)
  where status = 'pending';

create index if not exists app_users_is_admin_idx on app_users(is_admin);
create index if not exists flowers_rarity_idx on flowers(rarity);
create index if not exists flowers_assignment_level_idx on flowers(assignment_level);
create index if not exists flowers_normalized_name_pattern_idx on flowers(normalized_name text_pattern_ops);
create index if not exists flower_logs_flower_id_idx on flower_logs(flower_id);
create index if not exists flower_logs_discord_user_id_idx on flower_logs(discord_user_id);
create index if not exists flower_pins_flower_id_idx on flower_pins(flower_id);
create index if not exists flower_pins_discord_user_id_idx on flower_pins(discord_user_id);
create index if not exists admin_approval_requests_status_idx on admin_approval_requests(status);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
before update on app_users
for each row
execute function set_updated_at();

drop trigger if exists flowers_set_updated_at on flowers;
create trigger flowers_set_updated_at
before update on flowers
for each row
execute function set_updated_at();

insert into schema_migrations(version) values ('001_initial_schema')
on conflict (version) do nothing;

commit;
