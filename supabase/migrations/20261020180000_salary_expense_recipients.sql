alter table public.v2_expenses
  add column driver_id uuid references public.v2_drivers(id),
  add column employee_id text references public.v2_employees(id),
  add column transfer_id uuid references public.v2_transfers(id);
alter table public.v2_expenses add constraint v2_expenses_salary_recipient check (
  (driver_id is null or (category = 'school' and subcategory = 'ЗП' and employee_id is null))
  and (employee_id is null or (category = 'office' and subcategory = 'ЗП' and driver_id is null))
  and (transfer_id is null or driver_id is not null)
);

create index v2_expenses_driver_salary_history_idx on public.v2_expenses (driver_id, expense_date desc) where category = 'school' and subcategory = 'ЗП';
