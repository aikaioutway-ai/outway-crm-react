create table public.v2_cell_comments (
  id uuid primary key default gen_random_uuid(),
  target_key text not null check (char_length(target_key) <= 1500),
  table_key text not null check (char_length(table_key) between 1 and 160),
  row_key text not null check (char_length(row_key) between 1 and 500),
  column_key text not null check (char_length(column_key) between 1 and 200),
  context_key text not null default '' check (char_length(context_key) <= 500),
  author_id text not null,
  author_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (author_id, request_id)
);
create index v2_cell_comments_target_created_idx on public.v2_cell_comments(target_key, created_at desc, id desc);
alter table public.v2_cell_comments enable row level security;
revoke all on public.v2_cell_comments from public, anon, authenticated;
grant select, insert on public.v2_cell_comments to service_role;
-- Custom employee sessions are verified by cell-comments-api; browsers never read this table directly.
create function public.v2_cell_comment_counts(p_keys text[])
returns table(target_key text, total bigint)
language sql stable security invoker set search_path = ''
as $$
  select c.target_key, count(*) from public.v2_cell_comments c
  where c.target_key = any(p_keys) and cardinality(p_keys) <= 200
  group by c.target_key;
$$;
revoke all on function public.v2_cell_comment_counts(text[]) from public, anon, authenticated;
grant execute on function public.v2_cell_comment_counts(text[]) to service_role;
