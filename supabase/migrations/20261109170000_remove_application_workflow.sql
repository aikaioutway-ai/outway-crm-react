-- Вкладку «Новые заявки» убрали (решение владельца 2026-11-09).
-- Удаляем всё, что добавили для неё миграции 20261109120000 и 20261109150000.

drop trigger if exists sync_v2_child_request_stage on public.v2_children;
drop function if exists public.v2_child_sync_request_stage();

alter table public.v2_children
  drop constraint if exists v2_children_waiting_details_check,
  drop constraint if exists v2_children_request_stage_check;

alter table public.v2_children
  drop column if exists request_stage,
  drop column if exists waiting_reason,
  drop column if exists waiting_comment,
  drop column if exists reject_reason,
  drop column if exists reject_comment,
  drop column if exists rejected_at;
