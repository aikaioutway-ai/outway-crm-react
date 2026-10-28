-- Уточнение истории «Отправлен в трансфер Х» для детей, перенесённых в Х
-- миграцией 20261028180000. Если в истории карточки есть правка ребёнка
-- со сменой статуса на «Отказ», берём из неё дату и автора — это точнее,
-- чем запись об отказе семьи или «Автор неизвестен».

with logs as (
  select l.created_at, l.actor_name,
    case when jsonb_typeof(l.new_value) = 'string' then (l.new_value #>> '{}')::jsonb else l.new_value end as nv,
    case when jsonb_typeof(l.old_value) = 'string' then (l.old_value #>> '{}')::jsonb else l.old_value end as ov
  from public.v2_audit_log l
  where l.entity_type = 'child' and l.action = 'Редактирование ребёнка'
),
hits as (
  select distinct on (nv ->> 'id') nv ->> 'id' as child_id, created_at, actor_name
  from logs
  where nv ->> 'status' = 'rejected' and coalesce(ov ->> 'status', '') <> 'rejected'
  order by nv ->> 'id', created_at desc
)
update public.v2_audit_log x
set actor_name = coalesce(h.actor_name, x.actor_name),
    created_at = h.created_at
from hits h
where x.action = 'transfer_x'
  and (x.new_value ->> 'backfill')::boolean
  and h.child_id = x.new_value ->> 'child_id';
