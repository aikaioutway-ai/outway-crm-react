begin;
set local role service_role;
do $$
declare
  task public.v2_tasks%rowtype;
  denied boolean;
  old_version integer;
begin
  insert into public.v2_employees(id,full_name,login,role,status) values
    ('qa-multi-creator','Creator','qa-multi-creator','manager','active'),
    ('qa-multi-manager','Manager','qa-multi-manager','manager','active'),
    ('qa-multi-logist','Logist','qa-multi-logist','logist','active'),
    ('qa-multi-head','Head','qa-multi-head','senior_logist','active'),
    ('qa-multi-outsider','Outsider','qa-multi-outsider','manager','active'),
    ('qa-multi-inactive','Inactive','qa-multi-inactive','logist','dismissed');
  task:=public.v2_mutate_task('qa-multi-creator','create',null,jsonb_build_object('title','Shared task','assigneeIds',jsonb_build_array('qa-multi-manager','qa-multi-logist','qa-multi-manager'),'dueAt',now()-interval '1 hour'));
  if cardinality(task.assignee_ids)<>2 or task.assignee_id<>task.assignee_ids[1] then raise exception 'Participant normalization failed'; end if;
  if (public.v2_task_summary('qa-multi-manager')->>'new')::int<>1 or (public.v2_task_summary('qa-multi-logist')->>'overdue')::int<>1 then raise exception 'Secondary participant counters missing'; end if;
  denied:=false;
  begin perform public.v2_mutate_task('qa-multi-outsider','accept',task.id,jsonb_build_object('version',task.version)); exception when others then denied:=true; end;
  if not denied then raise exception 'Outsider accepted shared task'; end if;
  task:=public.v2_mutate_task('qa-multi-manager','accept',task.id,jsonb_build_object('version',task.version));
  old_version:=task.version;
  task:=public.v2_mutate_task('qa-multi-logist','comment',task.id,jsonb_build_object('version',task.version,'comment','Working together'));
  denied:=false;
  begin perform public.v2_mutate_task('qa-multi-manager','submit',task.id,jsonb_build_object('version',old_version,'result','Stale result')); exception when others then denied:=true; end;
  if not denied then raise exception 'Shared task version conflict bypassed'; end if;
  task:=public.v2_mutate_task('qa-multi-logist','submit',task.id,jsonb_build_object('version',task.version,'result','Joint result'));
  if task.status<>'review' then raise exception 'Shared review skipped'; end if;
  task:=public.v2_mutate_task('qa-multi-creator','approve',task.id,jsonb_build_object('version',task.version));
  if (public.v2_task_summary('qa-multi-manager')->>'open')::int<>0 then raise exception 'Shared completion not reflected'; end if;
  task:=public.v2_mutate_task('qa-multi-creator','reopen',task.id,jsonb_build_object('version',task.version,'comment','Recheck'));
  task:=public.v2_mutate_task('qa-multi-creator','edit',task.id,jsonb_build_object('version',task.version,'assigneeIds',jsonb_build_array('qa-multi-manager')));
  denied:=false;
  begin perform public.v2_mutate_task('qa-multi-logist','comment',task.id,jsonb_build_object('version',task.version,'comment','Removed')); exception when others then denied:=true; end;
  if not denied then raise exception 'Removed participant retained write access'; end if;
  task:=public.v2_mutate_task('qa-multi-creator','create',null,jsonb_build_object('title','Department','assignmentDepartment','logistics','assigneeIds',jsonb_build_array('qa-multi-head'),'dueAt',now()));
  if not('qa-multi-logist'=any(task.assignee_ids)) or 'qa-multi-head'=any(task.assignee_ids) or 'qa-multi-inactive'=any(task.assignee_ids) then raise exception 'Department must resolve active members server-side'; end if;
  task:=public.v2_mutate_task('qa-multi-creator','create',null,jsonb_build_object('title','Leadership','assignmentDepartment','leadership','dueAt',now()));
  if not('qa-multi-head'=any(task.assignee_ids)) then raise exception 'Logistics head missing from leadership'; end if;
  denied:=false;
  begin perform public.v2_mutate_task('qa-multi-creator','create',null,jsonb_build_object('title','Invalid','assigneeIds',jsonb_build_array('qa-multi-inactive'),'dueAt',now())); exception when others then denied:=true; end;
  if not denied then raise exception 'Inactive participant allowed'; end if;
  denied:=false;
  begin perform public.v2_mutate_task('qa-multi-creator','create',null,jsonb_build_object('title','Empty','assigneeIds','[]'::jsonb,'dueAt',now())); exception when others then denied:=true; end;
  if not denied then raise exception 'Empty participant list allowed'; end if;
  task:=public.v2_mutate_task('qa-multi-creator','delete',task.id,jsonb_build_object('version',task.version,'comment','QA cleanup'));
  if task.deleted_at is null then raise exception 'Shared soft deletion failed'; end if;
end;
$$;
select 'PASS: shared lifecycle, counters, version conflicts, removal, department resolution, leadership, invalid participants, soft deletion' as result;
rollback;
