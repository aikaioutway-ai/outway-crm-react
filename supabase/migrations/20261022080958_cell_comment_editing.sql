alter table public.v2_cell_comments
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  add column edit_history jsonb not null default '[]'::jsonb;

create or replace function public.v2_cell_comment_counts(p_keys text[])
returns table(target_key text, total bigint)
language sql stable security invoker set search_path = ''
as $$
  select c.target_key, count(*) from public.v2_cell_comments c
  where c.target_key = any(p_keys) and cardinality(p_keys) <= 200 and c.deleted_at is null
  group by c.target_key;
$$;

create function public.v2_mutate_cell_comment(p_id uuid, p_target_key text, p_actor_id text, p_operation text, p_body text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.v2_cell_comments; next_time timestamptz := clock_timestamp();
begin
  select * into c from public.v2_cell_comments where id=p_id and target_key=p_target_key and author_id=p_actor_id for update;
  if not found then raise exception 'Можно изменять только свои комментарии'; end if;
  if p_operation not in ('edit','delete') then raise exception 'Неизвестное действие'; end if;
  if c.deleted_at is not null then
    if p_operation='delete' then return jsonb_build_object('deleted',true); end if;
    raise exception 'Комментарий уже удалён';
  end if;
  if p_expected_updated_at is null or c.updated_at<>p_expected_updated_at then
    raise exception 'Комментарий изменился. Обновите обсуждение и повторите';
  end if;
  if p_operation='edit' and (p_body is null or char_length(trim(p_body)) not between 1 and 5000) then
    raise exception 'Введите комментарий длиной до 5000 символов';
  end if;
  update public.v2_cell_comments set
    edit_history=edit_history || jsonb_build_array(jsonb_build_object('body',c.body,'updated_at',c.updated_at,'changed_at',next_time,'operation',p_operation)),
    body=case when p_operation='edit' then trim(p_body) else body end,
    deleted_at=case when p_operation='delete' then next_time else null end,
    updated_at=next_time
  where id=c.id;
  return jsonb_build_object('deleted',p_operation='delete','comment',case when p_operation='edit' then jsonb_build_object('id',c.id,'author_id',c.author_id,'author_name',c.author_name,'body',trim(p_body),'created_at',c.created_at,'updated_at',next_time,'can_edit',true) else null end);
end;
$$;
revoke all on function public.v2_mutate_cell_comment(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.v2_mutate_cell_comment(uuid,text,text,text,text,timestamptz) to service_role;
grant update on public.v2_cell_comments to service_role;
