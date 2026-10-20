DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.v2_mutate_task(text,text,uuid,jsonb)'::regprocedure);
  definition := replace(definition,
    'if not exists(select 1 from public.v2_employees where id=p_input->>''observerId''',
    'if nullif(p_input->>''observerId'','''') is not null and not exists(select 1 from public.v2_employees where id=p_input->>''observerId''');
  definition := replace(definition, 'actor.id,p_input->>''assigneeId'',p_input->>''observerId'',', 'actor.id,p_input->>''assigneeId'',nullif(p_input->>''observerId'',''''),');
  definition := replace(definition, 'task.observer_id:=p_input->>''observerId'';', 'task.observer_id:=nullif(p_input->>''observerId'','''');');
  EXECUTE definition;
END
$migration$;
