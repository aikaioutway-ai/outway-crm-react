-- Фактические выплаты зарплаты: поддерживает частичные и групповые выплаты.
create table if not exists public.v2_payroll_payments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  subject_id text not null,
  subject_type text not null check (subject_type in ('driver', 'employee')),
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('cash', 'cashless')),
  recipient_id text,
  recipient_name text not null,
  paid_by_name text,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_v2_payroll_payments_period
  on public.v2_payroll_payments(period_month, period_year, subject_id);
create index if not exists idx_v2_payroll_payments_batch
  on public.v2_payroll_payments(batch_id);

alter table public.v2_payroll_payments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_payments' and policyname = 'v2 anon read') then
    create policy "v2 anon read" on public.v2_payroll_payments for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'v2_payroll_payments' and policyname = 'v2 authenticated read') then
    create policy "v2 authenticated read" on public.v2_payroll_payments for select to authenticated using (true);
  end if;
end $$;

create or replace function public.v2_record_payroll_payments(
  p_batch_id uuid,
  p_period_month int,
  p_period_year int,
  p_payment_date date,
  p_payment_method text,
  p_recipient_id text,
  p_recipient_name text,
  p_paid_by_name text,
  p_comment text,
  p_payments jsonb
)
returns setof public.v2_payroll_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_subject_id text;
  item_subject_type text;
  item_amount numeric(12, 2);
  item_accrued numeric(12, 2);
  item_paid numeric(12, 2);
  item_advance numeric(12, 2);
  item_remaining numeric(12, 2);
begin
  if p_period_month not between 1 and 12 or p_period_year < 2020 then
    raise exception 'Некорректный период выплаты';
  end if;
  if p_payment_method not in ('cash', 'cashless') then
    raise exception 'Некорректный способ выплаты';
  end if;
  if coalesce(trim(p_recipient_name), '') = '' then
    raise exception 'Не указан получатель выплаты';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Не выбраны получатели зарплаты';
  end if;

  for item in select value from jsonb_array_elements(p_payments)
  loop
    item_subject_id := trim(item->>'subjectId');
    item_subject_type := trim(item->>'subjectType');
    item_amount := (item->>'amount')::numeric;
    if item_subject_id = '' or item_subject_type not in ('driver', 'employee') or item_amount <= 0 then
      raise exception 'Некорректная строка выплаты';
    end if;

    select
      coalesce(entry.accrued_amount, entry.days * entry.rate + entry.bonus_amount - entry.penalty_amount),
      coalesce(entry.salary_amount, 0)
    into item_accrued, item_paid
    from public.v2_payroll_entries entry
    where entry.subject_id = item_subject_id
      and entry.subject_type = item_subject_type
      and entry.period_month = p_period_month
      and entry.period_year = p_period_year
    for update;
    if not found then
      raise exception 'Строка табеля для выплаты не найдена';
    end if;

    item_advance := 0;
    if item_subject_type = 'driver' then
      select coalesce(sum(advance.amount), 0)
      into item_advance
      from public.v2_driver_advances advance
      where advance.driver_id = item_subject_id
        and advance.date >= make_date(p_period_year, p_period_month, 1)
        and advance.date < make_date(p_period_year, p_period_month, 1) + interval '1 month';
    end if;
    item_remaining := greatest(0, item_accrued - item_paid - item_advance);
    if item_amount > item_remaining then
      raise exception 'Сумма выплаты превышает остаток зарплаты';
    end if;

    insert into public.v2_payroll_payments (
      batch_id, subject_id, subject_type, period_month, period_year, amount,
      payment_date, payment_method, recipient_id, recipient_name, paid_by_name, comment
    ) values (
      p_batch_id, item_subject_id, item_subject_type, p_period_month, p_period_year, item_amount,
      p_payment_date, p_payment_method, nullif(trim(p_recipient_id), ''), trim(p_recipient_name),
      nullif(trim(p_paid_by_name), ''), nullif(trim(p_comment), '')
    );

    update public.v2_payroll_entries
      set salary_amount = salary_amount + item_amount
      where subject_id = item_subject_id
        and subject_type = item_subject_type
        and period_month = p_period_month
        and period_year = p_period_year;
  end loop;

  return query
    select payment.* from public.v2_payroll_payments payment
    where payment.batch_id = p_batch_id
    order by payment.created_at, payment.id;
end;
$$;

revoke all on function public.v2_record_payroll_payments(uuid, int, int, date, text, text, text, text, text, jsonb) from public;
grant execute on function public.v2_record_payroll_payments(uuid, int, int, date, text, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
