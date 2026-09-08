-- Prepared for explicit production approval. Existing payments are preserved.
begin;
alter table public.v2_employees drop constraint v2_employees_role_check;
alter table public.v2_employees add constraint v2_employees_role_check check (role in ('admin','gen_director','director','manager','senior_logist','logist','cashier','driver','b2b_manager','b2b_logist'));
alter table public.v2_employee_advances
  add column if not exists period_month integer check (period_month between 1 and 12),
  add column if not exists period_year integer check (period_year >= 2020),
  add column if not exists school_key text,
  add column if not exists payment_method text check (payment_method in ('cash','cashless')),
  add column if not exists payment_order_number text;
-- Historical rows keep their original dates; null period means the month of payment.
-- Update both existing overloads, preserving their signatures, permissions and other logic.
do $patch$
declare item record; original text; replacement text;
begin
  for item in select oid from pg_proc where pronamespace='public'::regnamespace and proname='v2_record_payroll_payments' loop
    original := pg_get_functiondef(item.oid);
    if position('public.v2_employee_advances' in original) > 0 then continue; end if;
    replacement := replace(original,
      '    item_remaining := greatest(0, item_accrued - item_paid - item_advance);',
      '    if item_subject_type = ''employee'' then
      select coalesce(sum(advance.amount), 0) into item_advance
      from public.v2_employee_advances advance
      where advance.employee_id = item_subject_id
        and coalesce(advance.period_month, extract(month from advance.date)::integer) = p_period_month
        and coalesce(advance.period_year, extract(year from advance.date)::integer) = p_period_year;
    end if;
    item_remaining := greatest(0, item_accrued - item_paid - item_advance);');
    if replacement = original then raise exception 'Payroll function changed; review required'; end if;
    execute replacement;
  end loop;
end;
$patch$;
commit;
