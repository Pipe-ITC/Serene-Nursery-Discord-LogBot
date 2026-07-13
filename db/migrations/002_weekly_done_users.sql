begin;

create table if not exists weekly_done_users (
  discord_user_id text primary key references app_users(discord_user_id) on delete cascade,
  done_at timestamptz not null default now()
);

create index if not exists weekly_done_users_done_at_idx on weekly_done_users(done_at);

insert into schema_migrations(version) values ('002_weekly_done_users')
on conflict (version) do nothing;

commit;
