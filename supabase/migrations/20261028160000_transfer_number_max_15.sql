-- Номер трансфера в школе — только 1–15 (решение владельца 2026-10-28).
--
-- Проверка в базе, чтобы 16-й и выше нельзя было завести ни из CRM, ни из
-- ботов, ни из скрипта регистрации. Существующие трансферы с номером > 15
-- (на 2026-10-28 их 17, все без детей) не блокируются: их можно менять и
-- переводить в архив, пока номер не меняется.
--
-- Откат:
--   drop trigger if exists v2_transfers_number_max_15 on public.v2_transfers;
--   drop function if exists public.v2_check_transfer_number_max_15();

create or replace function public.v2_check_transfer_number_max_15()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or new.transfer_number is distinct from old.transfer_number)
     and (new.transfer_number < 1 or new.transfer_number > 15) then
    raise exception 'Номер трансфера должен быть от 1 до 15 (получено %)', new.transfer_number
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists v2_transfers_number_max_15 on public.v2_transfers;
create trigger v2_transfers_number_max_15
  before insert or update of transfer_number on public.v2_transfers
  for each row execute function public.v2_check_transfer_number_max_15();
