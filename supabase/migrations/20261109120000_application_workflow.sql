-- Application processing is independent of transfer-driven child status.
alter table public.v2_children
  add column if not exists request_stage text not null default 'new',
  add column if not exists waiting_reason text,
  add column if not exists waiting_comment text;
alter table public.v2_children
  add constraint v2_children_request_stage_check check (request_stage in ('new', 'in_work', 'waiting', 'rejected')),
  add constraint v2_children_waiting_details_check check (
    request_stage <> 'waiting' or
    (length(trim(coalesce(waiting_reason, ''))) > 0 and length(trim(coalesce(waiting_comment, ''))) > 0)
  );
