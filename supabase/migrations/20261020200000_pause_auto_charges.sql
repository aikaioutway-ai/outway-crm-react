-- Автоначисления временно отключены: начисления создаются вручную.
--
-- 1. Ежемесячная задача monthly-charges-job (1-го числа в 06:00) выключена.
-- 2. Начисление при посадке (trg_v2_children_charge_on_boarding) выключено.
--
-- Функции и задача не удаляются. Вернуть:
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'monthly-charges-job'), active := true);
--   alter table public.v2_children enable trigger trg_v2_children_charge_on_boarding;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from cron.job where jobname = 'monthly-charges-job') then
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'monthly-charges-job'),
      active := false
    );
  end if;
end $$;

alter table public.v2_children disable trigger trg_v2_children_charge_on_boarding;
