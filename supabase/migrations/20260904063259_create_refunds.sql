-- Возврат средств с баланса семьи (родитель уходит со школы/трансфера).
-- Менеджер оформляет заявку -> кассир подтверждает после фактического перевода:
-- баланс семьи списывается (может уйти в минус) и одновременно создаётся запись
-- в модуле расходов (категория "Школа", подкатегория "Возврат"), чтобы деньги,
-- физически покинувшие компанию, всегда были видны в обоих местах разом.

create table if not exists public.v2_refunds (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.v2_families(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  comment text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  requested_by text,
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  reject_reason text,
  wallet_transaction_id uuid references public.v2_wallet_transactions(id),
  expense_id uuid references public.v2_expenses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_refunds_family on public.v2_refunds(family_id, created_at desc);
create index if not exists idx_v2_refunds_status on public.v2_refunds(status, created_at desc);

drop trigger if exists v2_refunds_updated_at on public.v2_refunds;
create trigger v2_refunds_updated_at before update on public.v2_refunds
for each row execute function public.v2_touch_updated_at();

alter table public.v2_refunds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 authenticated read'
  ) then
    create policy "v2 authenticated read" on public.v2_refunds for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 authenticated write'
  ) then
    create policy "v2 authenticated write" on public.v2_refunds for all to authenticated using (true) with check (true);
  end if;

  -- Приложение обращается к Supabase без выполненного auth signIn — все
  -- запросы идут под ролью anon, поэтому нужны и anon-политики (см. остальные
  -- v2_*-таблицы в crm_v2_schema.sql).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 anon read'
  ) then
    create policy "v2 anon read" on public.v2_refunds for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'v2_refunds' and policyname = 'v2 anon write'
  ) then
    create policy "v2 anon write" on public.v2_refunds for all to anon using (true) with check (true);
  end if;
end $$;

-- Подтверждение возврата кассиром: списывает баланс семьи (может уйти в минус)
-- и заводит расход одной атомарной операцией.
create or replace function public.v2_confirm_refund(
  p_refund_id uuid,
  p_confirmed_by text default null,
  p_expense_payment_method text default 'cashless'
)
returns void
language plpgsql
security definer
as $$
declare
  v_refund public.v2_refunds%rowtype;
  v_family_name text;
  v_tx_id uuid;
  v_expense_id uuid;
begin
  select * into v_refund
  from public.v2_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found: %', p_refund_id;
  end if;
  if v_refund.status <> 'pending' then
    raise exception 'Refund is not pending: %', v_refund.status;
  end if;

  select parent_name into v_family_name
  from public.v2_families
  where id = v_refund.family_id;

  v_tx_id := public.v2_add_wallet_transaction(
    v_refund.family_id, 'main', 'refund', -v_refund.amount,
    'refund', p_refund_id, v_refund.comment, p_confirmed_by
  );

  insert into public.v2_expenses(
    name, category, subcategory, unit_price, quantity, amount,
    expense_date, payment_method, comment, created_by
  )
  values (
    'Возврат — ' || coalesce(v_family_name, v_refund.family_id),
    'school', 'Возврат', v_refund.amount, 1, v_refund.amount,
    current_date, p_expense_payment_method, v_refund.comment, p_confirmed_by
  )
  returning id into v_expense_id;

  update public.v2_refunds
    set status = 'confirmed',
        reviewed_by = p_confirmed_by,
        reviewed_at = now(),
        wallet_transaction_id = v_tx_id,
        expense_id = v_expense_id
    where id = p_refund_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (
    p_confirmed_by,
    'confirm_refund',
    'refund',
    p_refund_id::text,
    jsonb_build_object('amount', v_refund.amount, 'expense_id', v_expense_id),
    'Refund confirmed by cashier'
  );
end;
$$;

create or replace function public.v2_reject_refund(
  p_refund_id uuid,
  p_reject_reason text,
  p_reviewed_by text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update public.v2_refunds
    set status = 'rejected',
        reject_reason = p_reject_reason,
        reviewed_by = p_reviewed_by,
        reviewed_at = now()
    where id = p_refund_id and status = 'pending';

  if not found then
    raise exception 'Pending refund not found: %', p_refund_id;
  end if;
end;
$$;
