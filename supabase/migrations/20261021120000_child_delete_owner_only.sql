-- Детей удаляет только владелец CRM (emp-admin), и только через
-- v2_admin_delete_child_with_history: с причиной и копией в v2_audit_log.
-- Раньше карточка семьи удаляла ребёнка прямо из таблицы, без журнала,
-- и так за август–сентябрь пропали дети у сотен семей.

-- 1. Клиент (anon/authenticated) больше не может удалять детей и семьи напрямую.
--    Удаление семьи каскадом стирает её детей, поэтому закрываем и его.
--    service_role (edge-функции) и postgres не затронуты.
revoke delete on public.v2_children from anon, authenticated;
revoke delete on public.v2_families from anon, authenticated;

-- 2. RPC пускает только владельца, а не любого с ролью admin.
create or replace function public.v2_admin_delete_child_with_history(p_child_id uuid, p_actor_id text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_actor public.v2_employees%rowtype;
  v_child public.v2_children%rowtype;
  v_family public.v2_families%rowtype;
  v_charges jsonb;
  v_discounts jsonb;
  v_family_snapshot jsonb := null;
  v_family_deleted boolean := false;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  -- Callable only by service_role via the signed employee-session Edge Function.
  select * into v_actor from public.v2_employees where id = p_actor_id;
  if not found or v_actor.status <> 'active' or v_actor.id <> 'emp-admin' then
    raise exception 'Удалять детей может только Кайрат Эсенали';
  end if;
  if v_reason = '' then raise exception 'Укажите причину удаления'; end if;

  select * into v_child from public.v2_children where id = p_child_id for update;
  if not found then raise exception 'Ребёнок уже удалён или не найден'; end if;

  -- Оплаченные начисления удалять нельзя: деньги уже списаны с кошелька семьи.
  if exists (
    select 1 from public.v2_charge_allocations a
    join public.v2_charges c on c.id = a.charge_id
    where c.child_id = p_child_id
  ) then
    raise exception 'У ребёнка есть оплаченные начисления — сначала разберите оплаты, потом удаляйте';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_charges from public.v2_charges c where c.child_id = p_child_id;
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_discounts from public.v2_charge_discounts d where d.child_id = p_child_id;

  select * into v_family from public.v2_families where id = v_child.family_id for update;

  if found and not exists (select 1 from public.v2_children where family_id = v_family.id and id <> p_child_id) then
    if exists (select 1 from public.v2_payments where family_id = v_family.id)
      or exists (select 1 from public.v2_wallet_transactions where family_id = v_family.id)
      or exists (select 1 from public.v2_refunds where family_id = v_family.id)
      or exists (select 1 from public.v2_family_wallets where family_id = v_family.id
                 and (coalesce(main_balance, 0) <> 0 or coalesce(deposit_balance, 0) <> 0)) then
      raise exception 'Это последний ребёнок семьи, а у семьи есть платежи — сначала разберите оплаты, потом удаляйте';
    end if;
    select jsonb_build_object(
      'family', to_jsonb(v_family),
      'wallets', (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from public.v2_family_wallets w where w.family_id = v_family.id),
      'documents', (select coalesce(jsonb_agg(to_jsonb(fd)), '[]'::jsonb) from public.v2_family_documents fd where fd.family_id = v_family.id),
      'charge_discounts', (select coalesce(jsonb_agg(to_jsonb(cd)), '[]'::jsonb) from public.v2_charge_discounts cd where cd.family_id = v_family.id)
    ) into v_family_snapshot;
    v_family_deleted := true;
  end if;

  insert into public.v2_audit_log(actor_id, actor_name, actor_role, action, entity_type, entity_id, old_value, new_value, comment)
  values (v_actor.id, v_actor.full_name, v_actor.role, 'child_delete', 'child', v_child.family_id,
    jsonb_build_object('child', to_jsonb(v_child), 'charges', v_charges, 'charge_discounts', v_discounts, 'family', v_family_snapshot),
    jsonb_build_object('deleted_child_id', p_child_id, 'family_deleted', v_family_deleted),
    'Ребёнок удалён из CRM администратором. Причина: ' || v_reason || '. Оригинал сохранён в истории');

  delete from public.v2_children where id = p_child_id;
  if v_family_deleted then
    delete from public.v2_families where id = v_family.id;
  end if;

  return jsonb_build_object('family_deleted', v_family_deleted, 'family_id', v_child.family_id);
end;
$$;

revoke all on function public.v2_admin_delete_child_with_history(uuid, text, text) from public, anon, authenticated;
grant execute on function public.v2_admin_delete_child_with_history(uuid, text, text) to service_role;
