alter table public.v2_children add column if not exists discount_override_percent numeric
  check (discount_override_percent between 0 and 50 and mod(discount_override_percent, 5) = 0);

create or replace function public.v2_children_pricing_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.manual_discount_percent, 0) <> 0
        or coalesce(new.manual_discount_amount, 0) <> 0
        or new.discount_override_percent is not null
        or new.fixed_price is not null
        or new.discount_valid_from is not null
        or new.discount_valid_to is not null then
        raise exception 'Скидку может назначить только директор, гендиректор или администратор';
      end if;
    elsif (new.manual_discount_percent, new.manual_discount_amount, new.fixed_price,
           new.discount_valid_from, new.discount_valid_to, new.discount_reason,
           new.discount_approved_by, new.sibling_discount_percent, new.discount_override_percent)
      is distinct from
          (old.manual_discount_percent, old.manual_discount_amount, old.fixed_price,
           old.discount_valid_from, old.discount_valid_to, old.discount_reason,
           old.discount_approved_by, old.sibling_discount_percent, old.discount_override_percent) then
      raise exception 'Скидку может изменить только директор, гендиректор или администратор';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.boarded_at := case when new.status = 'boarded' then now() else null end;
  elsif new.status = 'boarded' and old.status is distinct from 'boarded' then
    new.boarded_at := now();
  else
    new.boarded_at := old.boarded_at;
  end if;

  new.sibling_applied := public.v2_child_sibling_eligible(
    new.family_id, new.id, new.status, new.sibling_discount_percent, new.created_at
  );
  new.final_price := case
    when new.fixed_price is not null then new.fixed_price
    when new.discount_override_percent is not null then greatest(0, new.base_price - round(new.base_price * new.discount_override_percent / 100))
    else public.v2_calc_child_price(
    new.base_price, new.fixed_price, new.manual_discount_percent, new.manual_discount_amount,
    new.discount_valid_from, new.discount_valid_to, new.sibling_applied,
    date_trunc('month', current_date)::date
  ) end;
  return new;
end;
$$;

create or replace function public.v2_child_period_price(p_child_id uuid, p_month int, p_year int)
returns numeric language sql set search_path = public as $$
  select case
    when c.fixed_price is not null then c.fixed_price
    when c.discount_override_percent is not null then greatest(0, c.base_price - round(c.base_price * c.discount_override_percent / 100))
    else public.v2_calc_child_price(
      c.base_price, c.fixed_price, c.manual_discount_percent, c.manual_discount_amount,
      c.discount_valid_from, c.discount_valid_to,
      public.v2_child_sibling_eligible(c.family_id, c.id, c.status, c.sibling_discount_percent, c.created_at),
      make_date(p_year, p_month, 1)
    ) end from public.v2_children c where c.id = p_child_id;
$$;

create or replace function public.v2_set_child_discount_choice(p_child_id uuid, p_percent numeric, p_actor text)
returns void language plpgsql set search_path = public as $$
declare v_child public.v2_children%rowtype;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Скидки меняются только через проверенную сессию сотрудника';
  end if;
  if p_percent is not null and (p_percent < 0 or p_percent > 50 or mod(p_percent, 5) <> 0) then
    raise exception 'Выберите скидку от 0 до 50%% с шагом 5';
  end if;
  select * into v_child from public.v2_children where id = p_child_id for update;
  if not found then raise exception 'Ребёнок не найден'; end if;
  if v_child.fixed_price is not null then raise exception 'Сначала отмените фиксированную цену'; end if;
  update public.v2_children set discount_override_percent = p_percent,
    manual_discount_percent = 0, manual_discount_amount = 0,
    discount_valid_from = null, discount_valid_to = null,
    discount_reason = case when p_percent is null then 'Автоматическая семейная скидка' else 'Постоянная скидка ' || p_percent || '%' end,
    discount_approved_by = p_actor, discount_updated_at = now()
  where id = p_child_id;
  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (p_actor, 'set_discount_choice', 'child', p_child_id::text,
    jsonb_build_object('percent', v_child.discount_override_percent, 'manualPercent', v_child.manual_discount_percent, 'manualAmount', v_child.manual_discount_amount, 'validFrom', v_child.discount_valid_from, 'validTo', v_child.discount_valid_to),
    jsonb_build_object('percent', p_percent), 'Выбор постоянной скидки в карточке ребёнка');
end;
$$;
revoke all on function public.v2_set_child_discount_choice(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.v2_set_child_discount_choice(uuid, numeric, text) to service_role;

-- The existing detailed discount dialog replaces an explicit percentage choice.
create or replace function public.v2_set_child_discount(
  p_child_id uuid,
  p_percent numeric,
  p_amount numeric,
  p_valid_from date,
  p_valid_to date,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.v2_children%rowtype;
  v_percent numeric := coalesce(p_percent, 0);
  v_amount numeric := coalesce(p_amount, 0);
  v_from date := date_trunc('month', p_valid_from)::date;
  v_to date := date_trunc('month', p_valid_to)::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_percent < 0 or v_percent > 100 or mod(v_percent, 5) <> 0 then
    raise exception 'Скидка в процентах: от 0 до 100 с шагом 5';
  end if;
  if v_amount < 0 or mod(v_amount, 100) <> 0 then
    raise exception 'Скидка суммой: не меньше 0, с шагом 100 сом';
  end if;
  if v_reason is null then
    raise exception 'Укажите причину скидки';
  end if;
  if v_from is not null and v_to is not null and v_from > v_to then
    raise exception 'Месяц окончания раньше месяца начала';
  end if;

  select * into v_child from public.v2_children where id = p_child_id for update;
  if not found then raise exception 'Ребёнок не найден: %', p_child_id; end if;

  if v_percent = 0 and v_amount = 0 then
    v_from := null;
    v_to := null;
  end if;

  update public.v2_children
  set discount_override_percent = null,
      manual_discount_percent = v_percent,
      manual_discount_amount = v_amount,
      discount_valid_from = v_from,
      discount_valid_to = v_to,
      discount_reason = v_reason,
      discount_approved_by = p_actor,
      discount_updated_at = now()
  where id = p_child_id;

  insert into public.v2_audit_log(actor_name, action, entity_type, entity_id, old_value, new_value, comment)
  values (
    p_actor, 'set_discount', 'child', p_child_id::text,
    jsonb_build_object(
      'percent', v_child.manual_discount_percent, 'amount', v_child.manual_discount_amount,
      'valid_from', v_child.discount_valid_from, 'valid_to', v_child.discount_valid_to,
      'final_price', v_child.final_price
    ),
    jsonb_build_object('percent', v_percent, 'amount', v_amount, 'valid_from', v_from, 'valid_to', v_to),
    v_reason
  );
end;
$$;

notify pgrst, 'reload schema';
