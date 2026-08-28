-- Премия и штраф в строке табеля.

alter table public.v2_payroll_entries
  add column if not exists bonus_amount numeric(12, 2) not null default 0,
  add column if not exists penalty_amount numeric(12, 2) not null default 0;

notify pgrst, 'reload schema';
