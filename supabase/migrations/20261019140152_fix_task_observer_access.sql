-- Existing tasks may have no observer: NULL must never satisfy participant authorization.
create or replace function public.v2_mutate_task(p_actor_id text,p_action text,p_task_id uuid default null,p_input jsonb default '{}'::jsonb)
returns public.v2_tasks language plpgsql security invoker set search_path = public as $$
declare
  actor public.v2_employees%rowtype;
  task public.v2_tasks%rowtype;
  previous jsonb;
  leader boolean;
  editor boolean;
  note text := trim(coalesce(p_input->>'comment',''));
  next_due timestamptz;
begin
  select * into actor from public.v2_employees where id=p_actor_id and status='active';
  if not found or actor.role not in ('admin','gen_director','director','manager','logist','senior_logist','cashier','b2b_manager','b2b_logist') then raise exception 'Нет доступа к задачам'; end if;
  leader := actor.role in ('admin','gen_director','director');
  if p_action='create' then
    if not exists(select 1 from public.v2_employees where id=p_input->>'assigneeId' and status='active' and role<>'driver') then raise exception 'Выберите действующего сотрудника'; end if;
    if not exists(select 1 from public.v2_employees where id=p_input->>'observerId' and status='active' and role in ('gen_director','director','senior_logist','cashier')) then raise exception 'Выберите наблюдателя: гендиректора, директора, начальника логистики или кассира'; end if;
    insert into public.v2_tasks(title,description,creator_id,assignee_id,observer_id,due_at,priority,requires_review,target)
    values(trim(p_input->>'title'),coalesce(p_input->>'description',''),actor.id,p_input->>'assigneeId',p_input->>'observerId',
      (p_input->>'dueAt')::timestamptz,coalesce(p_input->>'priority','normal'),coalesce((p_input->>'requiresReview')::boolean,true),
      coalesce(p_input->'target','{"type":"general","id":"","label":"Общая задача"}'::jsonb)) returning * into task;
  else
    select * into task from public.v2_tasks where id=p_task_id for update;
    if not found or not(leader or task.creator_id=actor.id or task.assignee_id=actor.id or coalesce(task.observer_id=actor.id,false)) then raise exception 'Задача не найдена или нет доступа'; end if;
    if (p_input->>'version')::integer is distinct from task.version then raise exception 'Задача уже изменена. Обновите список и повторите действие'; end if;
    previous := to_jsonb(task);
    editor := leader or task.creator_id=actor.id;
    if p_action='comment' then
      if note='' then raise exception 'Введите комментарий'; end if;
    elsif p_action='edit' then
      if task.status in ('done','cancelled') then raise exception 'Сначала верните задачу в работу'; end if;
      next_due := coalesce((p_input->>'dueAt')::timestamptz,task.due_at);
      if next_due<>task.due_at and note='' then raise exception 'Укажите причину переноса срока'; end if;
      if editor then
        if not exists(select 1 from public.v2_employees where id=coalesce(p_input->>'assigneeId',task.assignee_id) and status='active' and role<>'driver') then raise exception 'Выберите действующего сотрудника'; end if;
        if p_input ? 'assigneeId' and p_input->>'assigneeId'<>task.assignee_id then task.status:='new'; task.accepted_at:=null; task.result:=''; end if;
        if p_input ? 'observerId' then
          if not exists(select 1 from public.v2_employees where id=p_input->>'observerId' and status='active' and role in ('gen_director','director','senior_logist','cashier')) then raise exception 'Выберите действующего наблюдателя из руководителей или кассиров'; end if;
          task.observer_id:=p_input->>'observerId';
        end if;
        task.title:=coalesce(trim(p_input->>'title'),task.title);
        task.description:=coalesce(p_input->>'description',task.description);
        task.assignee_id:=coalesce(p_input->>'assigneeId',task.assignee_id);
        task.priority:=coalesce(p_input->>'priority',task.priority);
        task.requires_review:=coalesce((p_input->>'requiresReview')::boolean,task.requires_review);
        task.target:=coalesce(p_input->'target',task.target);
      elsif task.assignee_id<>actor.id then raise exception 'Недостаточно прав';
      end if;
      task.due_at:=next_due;
    elsif p_action='accept' then
      if task.assignee_id<>actor.id or task.status<>'new' then raise exception 'Принять новую задачу может только ответственный'; end if;
      task.status:='in_progress'; task.accepted_at:=now();
    elsif p_action='submit' then
      if task.assignee_id<>actor.id or task.status<>'in_progress' then raise exception 'Завершить задачу может ответственный после принятия в работу'; end if;
      if trim(coalesce(p_input->>'result',''))='' then raise exception 'Опишите результат выполнения'; end if;
      task.result:=trim(p_input->>'result');
      task.status:=case when task.requires_review and task.creator_id<>actor.id then 'review' else 'done' end;
      if task.status='done' then task.completed_at:=now(); end if;
    elsif p_action in ('approve','return') then
      if not editor or task.status<>'review' then raise exception 'Проверить задачу может постановщик или руководитель'; end if;
      if p_action='return' and note='' then raise exception 'Укажите, что нужно доработать'; end if;
      task.status:=case when p_action='approve' then 'done' else 'in_progress' end;
      if task.status='done' then task.completed_at:=now(); end if;
    elsif p_action in ('cancel','reopen') then
      if not editor or note='' then raise exception 'Укажите причину. Действие доступно постановщику и руководителю'; end if;
      if p_action='reopen' and task.status not in ('done','cancelled') then raise exception 'Задача уже открыта'; end if;
      if p_action='cancel' and task.status in ('done','cancelled') then raise exception 'Задача уже закрыта'; end if;
      task.status:=case when p_action='cancel' then 'cancelled' else 'new' end;
      task.completed_at:=null;
      if p_action='reopen' then task.accepted_at:=null; end if;
    else raise exception 'Неизвестное действие'; end if;
    update public.v2_tasks set title=task.title,description=task.description,assignee_id=task.assignee_id,observer_id=task.observer_id,due_at=task.due_at,
      priority=task.priority,status=task.status,requires_review=task.requires_review,target=task.target,accepted_at=task.accepted_at,
      result=task.result,completed_at=task.completed_at,version=task.version+1,updated_at=now()
      where id=task.id returning * into task;
  end if;
  insert into public.v2_task_events(task_id,actor_id,action,comment,old_value,new_value)
  values(task.id,actor.id,p_action,note,previous,to_jsonb(task));
  return task;
end;
$$;
revoke all on function public.v2_mutate_task(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.v2_mutate_task(text,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
