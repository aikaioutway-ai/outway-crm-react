-- Scale indexes for CRM screens that read thousands of families/payments.
-- Safe to run multiple times in Supabase SQL Editor.

create index if not exists idx_v2_families_created_at
  on public.v2_families(created_at desc);

create index if not exists idx_v2_children_status
  on public.v2_children(status);

create index if not exists idx_v2_drivers_full_name
  on public.v2_drivers(full_name);

create index if not exists idx_v2_transfers_status_number
  on public.v2_transfers(status, transfer_number);

create index if not exists idx_v2_payments_status_created_at
  on public.v2_payments(status, created_at desc);

create index if not exists idx_v2_payments_created_at
  on public.v2_payments(created_at desc);

create index if not exists idx_v2_charges_type_period
  on public.v2_charges(charge_type, period_year, period_month);

create index if not exists idx_v2_charges_period
  on public.v2_charges(period_year, period_month);
