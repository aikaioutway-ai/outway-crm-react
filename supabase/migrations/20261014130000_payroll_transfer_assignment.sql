-- Monthly payroll assignment does not change logistics or reserve status.
alter table public.v2_payroll_entries
  add column payroll_transfer_id uuid references public.v2_transfers(id) on delete restrict;
comment on column public.v2_payroll_entries.payroll_transfer_id is
  'Transfer selected for this monthly payroll entry independently of the current logistics assignment.';
