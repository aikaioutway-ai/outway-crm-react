-- Возврат родителю теперь оформляется в «Расходах» (Кассир → Расходы → OPEX → Компенсации).
-- Одна операция делает всё сразу: списывает сумму с баланса семьи, создаёт
-- подтверждённую запись в v2_refunds и пишет расход в v2_spending_entries.
-- Подтверждение заявки с карточки клиента тоже пишет расход сюда, а не в старую
-- таблицу «Финансов» v2_expenses.

alter table public.v2_refunds
  add column if not exists spending_entry_id text references public.v2_spending_entries(id);
create unique index if not exists v2_refunds_spending_entry_idx
  on public.v2_refunds(spending_entry_id) where spending_entry_id is not null;

-- Создать или изменить возврат из «Расходов».
create or replace function public.v2_spending_refund_save(p_entry jsonb, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := p_entry->>'id';
  v_family text := nullif(p_entry->>'familyId', '');
  v_amount numeric(12,2) := (p_entry->>'amount')::numeric;
  v_date date := (p_entry->>'date')::date;
  v_actor text := coalesce(nullif(p_actor_name, ''), 'CRM');
  v_old public.v2_spending_entries%rowtype;
  v_refund public.v2_refunds%rowtype;
  v_refund_id uuid;
  v_tx_id uuid;
  v_payload jsonb;
begin
  if v_id is null or v_id = '' then raise exception 'REFUND: Нет идентификатора расхода'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'REFUND: Сумма возврата должна быть больше нуля'; end if;
  if not (p_entry->>'category' = 'OPEX' and p_entry->>'subcategory' = 'Возврат родителю') then
    raise exception 'REFUND: Возврат нельзя перенести в другую категорию. Удалите его и создайте расход заново.';
  end if;
  if v_family is null then raise exception 'REFUND: Выберите ребёнка для возврата'; end if;

  select * into v_old from public.v2_spending_entries where id = v_id for update;

  if found then
    if v_old.deleted_at is not null then raise exception 'REFUND: Расход уже удалён. Обновите страницу.'; end if;
    if not (v_old.payload ? 'refundId') then raise exception 'REFUND: Этот расход не связан с балансом семьи'; end if;
    select * into v_refund from public.v2_refunds where id = (v_old.payload->>'refundId')::uuid for update;
    if not found then raise exception 'REFUND: Возврат не найден'; end if;
    if v_family is distinct from v_refund.family_id then
      raise exception 'REFUND: Нельзя сменить клиента у возврата. Удалите его и оформите заново.';
    end if;
    if v_amount <> v_refund.amount then
      -- Возвращаем семье разницу (или списываем доплату), чтобы баланс совпадал с суммой возврата.
      perform public.v2_add_wallet_transaction(
        v_family, 'main', case when v_amount > v_refund.amount then 'refund' else 'refund_cancelled' end,
        v_refund.amount - v_amount, 'refund', v_refund.id, 'Изменена сумма возврата', v_actor
      );
      update public.v2_refunds set amount = v_amount, reviewed_by = v_actor, reviewed_at = now() where id = v_refund.id;
    end if;
    v_payload := p_entry || jsonb_build_object('refundId', v_refund.id::text);
    update public.v2_spending_entries set payload = v_payload, expense_date = v_date, amount = v_amount where id = v_id;
    return v_payload;
  end if;

  if not exists (select 1 from public.v2_families where id = v_family) then
    raise exception 'REFUND: Клиент не найден';
  end if;

  v_refund_id := gen_random_uuid();
  v_payload := p_entry || jsonb_build_object('refundId', v_refund_id::text);
  insert into public.v2_spending_entries(id, payload, expense_date, amount, created_by)
  values (v_id, v_payload, v_date, v_amount, v_actor);

  insert into public.v2_refunds(id, family_id, amount, comment, status, requested_by, requested_at, reviewed_by, reviewed_at, spending_entry_id)
  values (v_refund_id, v_family, v_amount, nullif(p_entry->>'comment', ''), 'confirmed', v_actor, now(), v_actor, now(), v_id);

  v_tx_id := public.v2_add_wallet_transaction(
    v_family, 'main', 'refund', -v_amount, 'refund', v_refund_id, nullif(p_entry->>'comment', ''), v_actor
  );
  update public.v2_refunds set wallet_transaction_id = v_tx_id where id = v_refund_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (v_actor, 'confirm_refund', 'refund', v_refund_id::text,
    jsonb_build_object('amount', v_amount, 'spending_entry_id', v_id), 'Refund created in spending');

  return v_payload;
end;
$$;

-- Удалить возврат из «Расходов»: вернуть сумму на баланс семьи и отменить возврат.
create or replace function public.v2_spending_refund_delete(p_entry_id text, p_actor_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(nullif(p_actor_name, ''), 'CRM');
  v_entry public.v2_spending_entries%rowtype;
  v_refund public.v2_refunds%rowtype;
begin
  select * into v_entry from public.v2_spending_entries where id = p_entry_id for update;
  if not found or v_entry.deleted_at is not null then raise exception 'REFUND: Расход уже удалён. Обновите страницу.'; end if;
  if not (v_entry.payload ? 'refundId') then raise exception 'REFUND: Этот расход не связан с балансом семьи'; end if;
  select * into v_refund from public.v2_refunds where id = (v_entry.payload->>'refundId')::uuid for update;
  if found and v_refund.status = 'confirmed' then
    perform public.v2_add_wallet_transaction(
      v_refund.family_id, 'main', 'refund_cancelled', v_refund.amount, 'refund', v_refund.id, 'Возврат удалён в «Расходах»', v_actor
    );
    update public.v2_refunds
      set status = 'rejected', reject_reason = 'Удалён в «Расходах»', reviewed_by = v_actor, reviewed_at = now()
      where id = v_refund.id;
    insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
    values (v_actor, 'cancel_refund', 'refund', v_refund.id::text,
      jsonb_build_object('amount', v_refund.amount, 'spending_entry_id', p_entry_id), 'Refund deleted in spending');
  end if;
  update public.v2_spending_entries set deleted_at = now() where id = p_entry_id;
end;
$$;

-- Подтверждение заявки с карточки: расход теперь попадает в «Расходы».
create or replace function public.v2_confirm_refund(
  p_refund_id uuid,
  p_confirmed_by text default null,
  p_expense_payment_method text default 'cashless',
  p_payment_order_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.v2_refunds%rowtype;
  v_family_name text;
  v_tx_id uuid;
  v_entry_id text;
  v_actor text := coalesce(nullif(p_confirmed_by, ''), 'CRM');
begin
  select * into v_refund from public.v2_refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found: %', p_refund_id; end if;
  if v_refund.status <> 'pending' then raise exception 'Refund is not pending: %', v_refund.status; end if;

  select parent_name into v_family_name from public.v2_families where id = v_refund.family_id;

  v_tx_id := public.v2_add_wallet_transaction(
    v_refund.family_id, 'main', 'refund', -v_refund.amount,
    'refund', p_refund_id, v_refund.comment, v_actor
  );

  v_entry_id := 'refund:' || p_refund_id::text;
  insert into public.v2_spending_entries(id, payload, expense_date, amount, created_by)
  values (v_entry_id, jsonb_strip_nulls(jsonb_build_object(
    'id', v_entry_id, 'category', 'OPEX', 'subcategory', 'Возврат родителю',
    'description', 'Возврат — ' || coalesce(v_family_name, v_refund.family_id),
    'recipient', coalesce(v_family_name, ''), 'date', current_date, 'amount', v_refund.amount,
    'method', case when p_expense_payment_method = 'cash' then 'Наличные' else 'Безналичные' end,
    'paymentOrderNumber', nullif(trim(p_payment_order_number), ''), 'comment', v_refund.comment,
    'familyId', v_refund.family_id, 'refundId', p_refund_id::text
  )), current_date, v_refund.amount, v_actor);

  update public.v2_refunds
    set status = 'confirmed', reviewed_by = v_actor, reviewed_at = now(),
        wallet_transaction_id = v_tx_id, spending_entry_id = v_entry_id
    where id = p_refund_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, new_value, comment)
  values (v_actor, 'confirm_refund', 'refund', p_refund_id::text,
    jsonb_build_object('amount', v_refund.amount, 'spending_entry_id', v_entry_id), 'Refund confirmed by cashier');
end;
$$;

revoke execute on function public.v2_spending_refund_save(jsonb, text) from public, anon, authenticated;
revoke execute on function public.v2_spending_refund_delete(text, text) from public, anon, authenticated;
grant execute on function public.v2_spending_refund_save(jsonb, text) to service_role;
grant execute on function public.v2_spending_refund_delete(text, text) to service_role;

notify pgrst, 'reload schema';
