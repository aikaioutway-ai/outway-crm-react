-- Apply only after explicit production-data deletion approval.
begin;
-- Refuse to clear payroll when recorded salary payments exist.
do $$ begin
  if exists (select 1 from public.v2_payroll_payments) then
    raise exception 'Salary payments exist: payroll cleanup requires reconciliation';
  end if;
end $$;
delete from public.v2_payroll_entries;
delete from public.v2_payroll_approvals;
commit;
