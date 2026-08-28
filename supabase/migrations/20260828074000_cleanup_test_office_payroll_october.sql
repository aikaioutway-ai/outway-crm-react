-- Удаляет только проверочные офисные начисления за октябрь 2026.
do $$
declare
  removed_entries integer;
begin
  delete from public.v2_payroll_entries
  where period_month = 10
    and period_year = 2026
    and subject_type = 'employee'
    and salary_amount = 0
    and subject_id in (
      'emp-1787291055700',
      'emp-1787226262956',
      'emp-1787224300445',
      'emp-1787138706963',
      'emp-1786710005578',
      'emp-1784549824522',
      'emp-1782112961554',
      'emp-1781867071217',
      'emp-1781866930809',
      'emp-admin'
    );
  get diagnostics removed_entries = row_count;

  if removed_entries <> 10 then
    raise exception 'Ожидалось 10 тестовых начислений за октябрь, найдено %', removed_entries;
  end if;

  delete from public.v2_payroll_approvals
  where school_key = 'OFFICE'
    and period_month = 10
    and period_year = 2026;
end;
$$;
