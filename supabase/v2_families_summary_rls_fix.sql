alter table public.v2_families_summary enable row level security;

grant select, insert, update, delete on public.v2_families_summary to anon, authenticated;

drop policy if exists "v2 anon read families summary" on public.v2_families_summary;
create policy "v2 anon read families summary"
  on public.v2_families_summary
  for select
  to anon
  using (true);

drop policy if exists "v2 anon write families summary" on public.v2_families_summary;
create policy "v2 anon write families summary"
  on public.v2_families_summary
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "v2 authenticated read families summary" on public.v2_families_summary;
create policy "v2 authenticated read families summary"
  on public.v2_families_summary
  for select
  to authenticated
  using (true);

drop policy if exists "v2 authenticated write families summary" on public.v2_families_summary;
create policy "v2 authenticated write families summary"
  on public.v2_families_summary
  for all
  to authenticated
  using (true)
  with check (true);
