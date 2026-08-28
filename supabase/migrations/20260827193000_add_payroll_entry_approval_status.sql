-- Индивидуальное согласование строк табеля.

alter table public.v2_payroll_entries
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected')),
  add column if not exists approved_by_id text,
  add column if not exists approved_by_name text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_comment text;

create index if not exists idx_v2_payroll_entries_approval
  on public.v2_payroll_entries(period_month, period_year, approval_status);

notify pgrst, 'reload schema';
