alter table public.v2_driver_advances add column salary_period_key text check (salary_period_key ~ '^[0-9]{4}-(09|10|11|12|01|02|03|04|05)-[12]$');
alter table public.v2_employee_advances add column salary_period_key text check (salary_period_key ~ '^[0-9]{4}-(09|10|11|12|01|02|03|04|05)-[12]$');
