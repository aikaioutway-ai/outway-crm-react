alter table public.v2_expenses add column school_key text, add column salary_period_key text;
alter table public.v2_expenses add constraint v2_expenses_salary_fields check (category <> 'school' or subcategory <> 'ЗП' or (nullif(school_key, '') is not null and salary_period_key is not null and salary_period_key ~ '^[0-9]{4}-(09|10|11|12|01|02|03|04|05)-[12]$'));
create index v2_expenses_school_salary_period_idx on public.v2_expenses(school_key, salary_period_key) where category = 'school' and subcategory = 'ЗП';
