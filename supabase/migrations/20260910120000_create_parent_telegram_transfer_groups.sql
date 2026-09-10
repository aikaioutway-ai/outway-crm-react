create table if not exists public.v2_parent_telegram_transfer_groups (
  transfer_id uuid primary key references public.v2_transfers(id) on delete cascade,
  title text not null,
  admin_phone text not null default '',
  created_by_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_parent_telegram_member_overrides (
  transfer_id uuid not null references public.v2_transfers(id) on delete cascade,
  family_id text not null references public.v2_families(id) on delete cascade,
  status text not null check (status in ('not_connected', 'connected', 'invited', 'no_telegram', 'declined')),
  updated_by_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (transfer_id, family_id)
);

create index if not exists idx_v2_parent_telegram_overrides_family
  on public.v2_parent_telegram_member_overrides(family_id);

drop trigger if exists trg_v2_parent_telegram_transfer_groups_updated_at on public.v2_parent_telegram_transfer_groups;
create trigger trg_v2_parent_telegram_transfer_groups_updated_at
before update on public.v2_parent_telegram_transfer_groups
for each row execute function public.v2_bot_touch_updated_at();

drop trigger if exists trg_v2_parent_telegram_member_overrides_updated_at on public.v2_parent_telegram_member_overrides;
create trigger trg_v2_parent_telegram_member_overrides_updated_at
before update on public.v2_parent_telegram_member_overrides
for each row execute function public.v2_bot_touch_updated_at();

alter table public.v2_parent_telegram_transfer_groups enable row level security;
alter table public.v2_parent_telegram_member_overrides enable row level security;
revoke all on public.v2_parent_telegram_transfer_groups from anon, authenticated;
revoke all on public.v2_parent_telegram_member_overrides from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'v2_children'
  ) then
    alter publication supabase_realtime add table public.v2_children;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'v2_transfers'
  ) then
    alter publication supabase_realtime add table public.v2_transfers;
  end if;
end
$$;
