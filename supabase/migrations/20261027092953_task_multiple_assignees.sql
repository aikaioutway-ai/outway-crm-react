-- Keep the legacy primary assignee while all task behavior uses the full participant list.
alter table public.v2_tasks add column assignee_ids text[], add column assignment_department text;
update public.v2_tasks set assignee_ids=array[assignee_id];
alter table public.v2_tasks alter column assignee_ids set not null;
alter table public.v2_tasks add constraint v2_tasks_assignees_nonempty check (cardinality(assignee_ids)>0 and assignee_id=assignee_ids[1] and array_position(assignee_ids,null) is null),
  add constraint v2_tasks_assignment_department check (assignment_department is null or assignment_department in ('logistics','management','finance','leadership'));
create index v2_tasks_assignees_open on public.v2_tasks using gin(assignee_ids) where deleted_at is null;

-- Old clients may still submit one assignee; preserve their single-person semantics.
create function public.v2_sync_task_assignees() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.assignee_ids is null then new.assignee_ids:=array[new.assignee_id];
  elsif tg_op='UPDATE' then
    if new.assignee_id is distinct from old.assignee_id and new.assignee_ids is not distinct from old.assignee_ids then
      new.assignee_ids:=array[new.assignee_id]; new.assignment_department:=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.v2_sync_task_assignees() from public,anon,authenticated;
create trigger v2_tasks_sync_assignees before insert or update on public.v2_tasks for each row execute function public.v2_sync_task_assignees();

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
  next_ids text[];
  department_roles text[];
begin
  select * into actor from public.v2_employees where id=p_actor_id and status='active';
  if not found or actor.role not in ('admin','gen_director','director','manager','logist','senior_logist','cashier','b2b_manager','b2b_logist') then raise exception 'Нет доступа к задачам'; end if;
  leader := actor.role in ('admin','gen_director','director');
  if p_action in ('create','edit') and (p_input ? 'assigneeIds' or nullif(p_input->>'assignmentDepartment','') is not null) then
    if nullif(p_input->>'assignmentDepartment','') is not null then
      department_roles := case p_input->>'assignmentDepartment'
        when 'logistics' then array['logist','b2b_logist']
        when 'management' then array['manager','b2b_manager']
        when 'finance' then array['cashier']
        when 'leadership' then array['admin','gen_director','director','senior_logist'] end;
      if department_roles is null then raise exception 'Неизвестный отдел'; end if;
      select array_agg(id order by id) into next_ids from public.v2_employees where status='active' and role=any(department_roles);
    else
      if jsonb_typeof(p_input->'assigneeIds') is distinct from 'array' then raise exception 'Выберите исполнителей'; end if;
      if exists(select 1 from jsonb_array_elements(p_input->'assigneeIds') v where jsonb_typeof(v)<>'string') then raise exception 'Некорректный список исполнителей'; end if;
      select array_agg(distinct value order by value) into next_ids from jsonb_array_elements_text(p_input->'assigneeIds');
    end if;
    if coalesce(cardinality(next_ids),0)=0 or cardinality(next_ids)>500 then raise exception 'Выберите от 1 до 500 исполнителей'; end if;
    if exists(select 1 from unnest(next_ids) selected(id) where not exists(select 1 from public.v2_employees e where e.id=selected.id and e.status='active' and e.role in ('admin','gen_director','director','manager','logist','senior_logist','cashier','b2b_manager','b2b_logist'))) then raise exception 'Выберите действующих сотрудников'; end if;
    p_input := p_input || jsonb_build_object('assigneeId',next_ids[1]);
  end if;
  if p_action='create' then
    if not exists(select 1 from public.v2_employees where id=p_input->>'assigneeId' and status='active' and role<>'driver') then raise exception 'Выберите действующего сотрудника'; end if;
    if nullif(p_input->>'observerId','') is not null and not exists(select 1 from public.v2_employees where id=p_input->>'observerId' and status='active' and role in ('gen_director','director','senior_logist','cashier')) then raise exception 'Выберите наблюдателя: гендиректора, директора, начальника логистики или кассира'; end if;
    insert into public.v2_tasks(title,description,creator_id,assignee_id,assignee_ids,assignment_department,observer_id,due_at,priority,requires_review,target)
    values(trim(p_input->>'title'),coalesce(p_input->>'description',''),actor.id,p_input->>'assigneeId',coalesce(next_ids,array[p_input->>'assigneeId']),nullif(p_input->>'assignmentDepartment',''),nullif(p_input->>'observerId',''),
      (p_input->>'dueAt')::timestamptz,coalesce(p_input->>'priority','normal'),coalesce((p_input->>'requiresReview')::boolean,true),
      coalesce(p_input->'target','{"type":"general","id":"","label":"Общая задача"}'::jsonb)) returning * into task;
  else
    select * into task from public.v2_tasks where id=p_task_id for update;
    if task.deleted_at is not null then raise exception 'Задача удалена'; end if;
    if not found or not(leader or task.creator_id=actor.id or actor.id=any(task.assignee_ids) or coalesce(task.observer_id=actor.id,false)) then raise exception 'Задача не найдена или нет доступа'; end if;
    if (p_input->>'version')::integer is distinct from task.version then raise exception 'Задача уже изменена. Обновите список и повторите действие'; end if;
    previous := to_jsonb(task);
    editor := leader or task.creator_id=actor.id;
    if p_action='delete' then
      if not editor then raise exception 'Удалить задачу может постановщик или руководитель'; end if;
      if note='' then raise exception 'Укажите причину удаления'; end if;
      task.deleted_at:=now(); task.deleted_by:=actor.id;
    elsif p_action='comment' then
      if note='' then raise exception 'Введите комментарий'; end if;
    elsif p_action='edit' then
      if task.status in ('done','cancelled') then raise exception 'Сначала верните задачу в работу'; end if;
      next_due := coalesce((p_input->>'dueAt')::timestamptz,task.due_at);
      if next_due<>task.due_at and note='' then raise exception 'Укажите причину переноса срока'; end if;
      if editor then
        if not exists(select 1 from public.v2_employees where id=coalesce(p_input->>'assigneeId',task.assignee_id) and status='active' and role<>'driver') then raise exception 'Выберите действующего сотрудника'; end if;
        if (next_ids is not null and not(next_ids @> task.assignee_ids and next_ids <@ task.assignee_ids)) or (next_ids is null and p_input ? 'assigneeId' and p_input->>'assigneeId'<>task.assignee_id) then task.status:='new'; task.accepted_at:=null; task.result:=''; end if;
        if p_input ? 'observerId' then
          if nullif(p_input->>'observerId','') is not null and not exists(select 1 from public.v2_employees where id=p_input->>'observerId' and status='active' and role in ('gen_director','director','senior_logist','cashier')) then raise exception 'Выберите действующего наблюдателя из руководителей или кассиров'; end if;
          task.observer_id:=nullif(p_input->>'observerId','');
        end if;
        task.title:=coalesce(trim(p_input->>'title'),task.title);
        task.description:=coalesce(p_input->>'description',task.description);
        if next_ids is not null then
          task.assignee_ids:=next_ids;
          task.assignee_id:=next_ids[1];
        elsif p_input ? 'assigneeId' and p_input->>'assigneeId'<>task.assignee_id then
          task.assignee_id:=p_input->>'assigneeId'; task.assignee_ids:=array[task.assignee_id];
        end if;
        if p_input ? 'assignmentDepartment' then task.assignment_department:=nullif(p_input->>'assignmentDepartment','');
        elsif p_input ? 'assigneeId' or p_input ? 'assigneeIds' then task.assignment_department:=null; end if;
        task.priority:=coalesce(p_input->>'priority',task.priority);
        task.requires_review:=coalesce((p_input->>'requiresReview')::boolean,task.requires_review);
        task.target:=coalesce(p_input->'target',task.target);
      elsif not(actor.id=any(task.assignee_ids)) then raise exception 'Недостаточно прав';
      end if;
      task.due_at:=next_due;
    elsif p_action='accept' then
      if not(actor.id=any(task.assignee_ids)) or task.status<>'new' then raise exception 'Принять новую задачу может только ответственный'; end if;
      task.status:='in_progress'; task.accepted_at:=now();
    elsif p_action='submit' then
      if not(actor.id=any(task.assignee_ids)) or task.status<>'in_progress' then raise exception 'Завершить задачу может ответственный после принятия в работу'; end if;
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
    update public.v2_tasks set deleted_at=task.deleted_at,deleted_by=task.deleted_by,title=task.title,description=task.description,assignee_id=task.assignee_id,assignee_ids=task.assignee_ids,assignment_department=task.assignment_department,observer_id=task.observer_id,due_at=task.due_at,
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

create or replace function public.v2_task_summary(p_actor_id text)
returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
  'open',count(*) filter(where assignee_ids @> array[p_actor_id]),
  'new',count(*) filter(where assignee_ids @> array[p_actor_id] and status='new'),
  'overdue',count(*) filter(where assignee_ids @> array[p_actor_id] and due_at<now()),
  'dueSoon',count(*) filter(where assignee_ids @> array[p_actor_id] and due_at>=now() and due_at<=now()+interval '1 day'),
  'review',count(*) filter(where creator_id=p_actor_id and status='review'),
  'watching',count(*) filter(where observer_id=p_actor_id),
  'attention',count(*) filter(where (assignee_ids @> array[p_actor_id] and (status='new' or due_at<=now()+interval '1 day')) or (creator_id=p_actor_id and status='review') or (observer_id=p_actor_id and (status in ('new','review') or due_at<=now()+interval '1 day')))
) from public.v2_tasks
where deleted_at is null and status in ('new','in_progress','review') and (assignee_ids @> array[p_actor_id] or creator_id=p_actor_id or observer_id=p_actor_id);
$$;
notify pgrst,'reload schema';
