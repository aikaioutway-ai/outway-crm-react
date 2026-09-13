alter table public.v2_transfer_runs
  add column if not exists children_message_id bigint;
