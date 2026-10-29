create table public.v2_spending_entries (
  id text primary key,
  payload jsonb not null,
  category text generated always as (payload->>'category') stored,
  expense_date date not null,
  amount numeric(16,2) not null check (amount >= 0),
  source_table text,
  source_id text,
  source_record jsonb,
  deleted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_table, source_id),
  check (payload->>'id' = id),
  check (category in ('COGS','Revenue Tax','OPEX','CAPEX','Доп. Выезды','Logistics','Личное')),
  check ((payload->>'amount')::numeric = amount),
  check ((payload->>'date')::date = expense_date)
);
alter table public.v2_spending_entries enable row level security;
revoke all on public.v2_spending_entries from anon, authenticated;
grant all on public.v2_spending_entries to service_role;
create index v2_spending_entries_date_idx on public.v2_spending_entries(expense_date, id);
create index v2_spending_entries_family_idx on public.v2_spending_entries((payload->>'familyId'));
create trigger v2_spending_entries_updated_at before update on public.v2_spending_entries
for each row execute function public.v2_touch_updated_at();

with originals as (
  select 'v2_expenses'::text as source_table, x.id::text as source_id, to_jsonb(x) as original,
    x.category, x.subcategory, x.name as description, x.amount, x.expense_date as date,
    x.payment_method, x.payment_order_number, x.comment, x.school_key, x.department_key,
    x.driver_id::text, x.employee_id, x.transfer_id::text, x.salary_period_key,
    x.unit_price, x.quantity, x.created_at,
    coalesce(d.full_name, e.full_name, '') as recipient
  from public.v2_expenses x left join public.v2_drivers d on d.id=x.driver_id
  left join public.v2_employees e on e.id=x.employee_id
  union all
  select 'v2_driver_advances', a.id::text, to_jsonb(a), 'school', 'Аванс',
    'Аванс — ' || coalesce(d.full_name,'водитель'), a.amount,a.date,a.payment_method,
    a.payment_order_number,a.comment,a.school_key,null,a.driver_id::text,null,a.transfer_id::text,
    a.salary_period_key,a.amount,1,a.created_at,coalesce(d.full_name,'')
  from public.v2_driver_advances a left join public.v2_drivers d on d.id=a.driver_id
  union all
  select 'v2_employee_advances', a.id::text, to_jsonb(a),
    case when a.school_key is not null and a.school_key <> 'OFFICE' then 'school' else 'office' end,
    'Аванс','Аванс — ' || coalesce(e.full_name,'сотрудник'),a.amount,a.date,a.payment_method,
    a.payment_order_number,a.comment,a.school_key,
    case when e.role in ('logist','senior_logist','b2b_logist','driver') then 'logistics'
         when e.role in ('manager','b2b_manager','director') then 'service'
         when e.role in ('cashier','gen_director') then 'finance' when e.role='admin' then 'admin' end,
    null,a.employee_id,null,a.salary_period_key,a.amount,1,a.created_at,coalesce(e.full_name,'')
  from public.v2_employee_advances a left join public.v2_employees e on e.id=a.employee_id
), classified as (
 select *,
 case when employee_id is not null and subcategory in ('Аванс','ЗП') then 'OPEX'
      when category='school' and subcategory in ('Аванс','ЗП') then 'COGS'
      when category='personal' then 'Личное' when category='logistics' then 'Logistics'
      when category='extra_trip' then 'Доп. Выезды' else 'OPEX' end as target_category,
 case when employee_id is not null and subcategory='Аванс' then 'Авансы сотрудникам'
      when employee_id is not null and subcategory='ЗП' then 'Зарплата офиса'
      when category='school' and subcategory='ЗП' then 'Зарплата водителей'
      when category='school' and subcategory='Аванс' then 'Авансы водителям'
      when category='office' and subcategory='ЗП' then 'Зарплата офиса'
      when category='office' and subcategory='Соцфонд' then 'Социальный фонд'
      when category='office' and subcategory='Связь и интернет' then 'Связь'
      when category='school' and subcategory='Возврат' then 'Возврат родителю'
      when category='school' and subcategory='Промоматериалы' then 'Промоматериалы'
      when category in ('school','office') and subcategory='Прочее' then 'Прочие операционные расходы'
      else subcategory end as target_subcategory
 from originals
)
insert into public.v2_spending_entries(id,payload,expense_date,amount,source_table,source_id,source_record,created_at)
select 'finance:'||source_table||':'||source_id,
 jsonb_strip_nulls(jsonb_build_object(
 'id','finance:'||source_table||':'||source_id,'category',target_category,'subcategory',target_subcategory,
 'description',description,'date',date,'amount',amount,'recipient',recipient,
 'method',case when payment_method='cash' then 'Наличные' else 'Безналичные' end,
 'paymentOrderNumber',payment_order_number,'comment',comment,'schoolKey',school_key,
 'departmentKey',department_key,'driverId',driver_id,'employeeId',employee_id,
 'transferId',transfer_id,'salaryPeriodKey',salary_period_key,'unitPrice',unit_price,'quantity',quantity,
 'originalCategory',category,'originalSubcategory',subcategory,'sourceRef',source_table||':'||source_id)),
 date,amount,source_table,source_id,original,created_at from classified
on conflict (source_table,source_id) do nothing;
