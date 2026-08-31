-- Сохраняемые зоны маршрутов, нарисованные диспетчером на карте.
create table if not exists public.v2_route_zones (
  id uuid primary key default gen_random_uuid(),
  school_key text not null,
  name text not null,
  shape_type text not null check (shape_type in ('polygon', 'rectangle')),
  coordinates jsonb not null,
  fill_color text not null default '#2AA5A5',
  stroke_color text not null default '#167C80',
  fill_opacity numeric(3, 2) not null default 0.28 check (fill_opacity between 0 and 1),
  transfer_number integer check (transfer_number between 1 and 30),
  comment text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_route_zones_school
  on public.v2_route_zones(school_key, created_at);

drop trigger if exists trg_v2_route_zones_updated_at on public.v2_route_zones;
create trigger trg_v2_route_zones_updated_at
before update on public.v2_route_zones
for each row execute function public.v2_touch_updated_at();

alter table public.v2_route_zones enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_route_zones' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_route_zones for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_route_zones' and policyname = 'v2 anon write') then
    create policy "v2 anon write" on public.v2_route_zones for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_route_zones' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_route_zones for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_route_zones' and policyname = 'v2 authenticated write') then
    create policy "v2 authenticated write" on public.v2_route_zones for all to authenticated using (true) with check (true);
  end if;
end $$;
