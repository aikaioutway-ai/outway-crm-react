-- «Посажен» ставится автоматически, когда у ребёнка в трансфере появляется
-- месячное начисление (вручную или переносом с прошлого месяца).
-- Отказ и пауза не трогаются; без трансфера статус не меняется.

create or replace function public.v2_charges_board_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.child_id is null
    or new.status = 'cancelled'
    or new.charge_type not in ('monthly', 'may')
    or new.amount <= 0 then
    return null;
  end if;

  update public.v2_children
  set status = 'boarded'
  where id = new.child_id
    and transfer_id is not null
    and status in ('new', 'waiting');

  return null;
end;
$$;

drop trigger if exists trg_v2_charges_board_child on public.v2_charges;
create trigger trg_v2_charges_board_child
after insert or update of status, amount on public.v2_charges
for each row execute function public.v2_charges_board_child();
