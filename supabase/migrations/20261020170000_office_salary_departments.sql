alter table public.v2_expenses add column department_key text;
alter table public.v2_expenses add constraint v2_expenses_office_salary_fields check (
  category <> 'office' or subcategory <> 'ЗП' or (
    department_key is not null and department_key in ('logistics', 'service', 'finance', 'admin')
    and salary_period_key is not null
    and salary_period_key ~ '^[0-9]{4}-(09|10|11|12|01|02|03|04|05)-[12]$'
  )
);
