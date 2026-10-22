-- AsylKech (ING_A) и Indigo Prime (ING_P) ездят теми же автобусами, что и ING
-- (Индиго Kids), но как отдельные филиалы имели свои трансферы, и правило
-- временных водителей создавало на них лишние карточки. Объединяем их в ING:
-- филиал остаётся в комментарии семьи, старые филиалы и трансферы не удаляются,
-- а скрываются. Прежнее состояние каждой записи сохраняется в v2_audit_log
-- (action = 'merge_ing_branches'), чтобы шаг можно было откатить.
-- ING_W (Indigo West) — отдельная школа, не затрагивается.
do $$
declare
  ing public.v2_school_branches%rowtype;
begin
  select * into ing from public.v2_school_branches where code = 'ING';
  if not found then raise exception 'Филиал ING не найден'; end if;

  create temp table merge_children on commit drop as
  select c.id, c.family_id, c.transfer_id as old_transfer_id, c.transfer_assigned_at,
         b.name as old_branch_name, target.id as new_transfer_id
  from public.v2_children c
  join public.v2_school_branches b on b.id = c.branch_id
  left join public.v2_transfers source on source.id = c.transfer_id
  left join public.v2_transfers target
    on target.branch_id = ing.id and target.transfer_number = source.transfer_number
  where b.code in ('ING_A', 'ING_P');

  if exists (select 1 from merge_children where old_transfer_id is not null and new_transfer_id is null) then
    raise exception 'Не для всех трансферов ING_A/ING_P есть трансфер ING с тем же номером';
  end if;

  create temp table merge_transfers on commit drop as
  select t.id, t.driver_id
  from public.v2_transfers t
  join public.v2_school_branches b on b.id = t.branch_id
  where b.code in ('ING_A', 'ING_P');

  insert into public.v2_audit_log (actor_name, action, entity_type, entity_id, old_value, comment)
  select 'CRM migration', 'merge_ing_branches', 'child', c.id::text, to_jsonb(c), 'ING_A/ING_P → ING'
  from public.v2_children c where c.id in (select id from merge_children)
  union all
  select 'CRM migration', 'merge_ing_branches', 'family', f.id, to_jsonb(f), 'ING_A/ING_P → ING'
  from public.v2_families f where f.id in (select family_id from merge_children)
  union all
  select 'CRM migration', 'merge_ing_branches', 'transfer', t.id::text, to_jsonb(t), 'ING_A/ING_P → ING'
  from public.v2_transfers t where t.id in (select id from merge_transfers)
  union all
  select 'CRM migration', 'merge_ing_branches', 'driver', d.id::text, to_jsonb(d), 'ING_A/ING_P → ING'
  from public.v2_drivers d where d.id in (select driver_id from merge_transfers)
  union all
  select 'CRM migration', 'merge_ing_branches', 'branch', b.id::text, to_jsonb(b), 'ING_A/ING_P → ING'
  from public.v2_school_branches b where b.code in ('ING_A', 'ING_P');

  update public.v2_children c
  set branch_id = ing.id, school_id = ing.school_id, transfer_id = m.new_transfer_id
  from merge_children m where c.id = m.id;

  -- Смена трансфера сбрасывает дату назначения; ребёнок фактически едет тем же
  -- автобусом, поэтому возвращаем прежнюю дату.
  update public.v2_children c
  set transfer_assigned_at = m.transfer_assigned_at
  from merge_children m where c.id = m.id;

  update public.v2_families f
  set comment = concat_ws(E'\n', tags.tag, nullif(f.comment, ''))
  from (
    select family_id, string_agg(distinct 'Филиал: ' || old_branch_name, E'\n') as tag
    from merge_children group by family_id
  ) tags
  where f.id = tags.family_id;

  update public.v2_transfers
  set driver_id = null, vehicle_id = null, status = 'archive', updated_at = now()
  where id in (select id from merge_transfers);

  delete from public.v2_drivers d
  where d.id in (select driver_id from merge_transfers)
    and d.full_name ~ '^Временный водитель №[0-9]+$'
    and not exists (select 1 from public.v2_transfers t where t.driver_id = d.id);

  update public.v2_school_branches set active = false where code in ('ING_A', 'ING_P');
end;
$$;
