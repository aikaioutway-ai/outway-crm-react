-- У одного трансфера не может быть одновременно двух активных рейсов.

create unique index if not exists idx_v2_transfer_runs_one_active
  on public.v2_transfer_runs (transfer_id)
  where status = 'active';
