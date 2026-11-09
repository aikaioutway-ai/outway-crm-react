-- Когда ребёнку поставили «!» (в работе) или «?» (ожидание).
-- Канбан «Новые заявки» считает от этой даты, сколько дней заявка в колонке:
-- больше 3 дней в «В работе» и больше 5 в «Ожидании» — заявка красная.

alter table public.v2_children
  add column if not exists transfer_mark_at timestamptz;

create or replace function public.v2_child_transfer_mark_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transfer_mark is null then
    new.transfer_mark_at := null;
  elsif tg_op = 'INSERT' or new.transfer_mark is distinct from old.transfer_mark then
    new.transfer_mark_at := now();
  end if;
  return new;
end;
$$;

-- Имя после apply_v2_child_transfer_mark_and_comment: триггеры идут по алфавиту,
-- поэтому дата ставится уже после того, как пометка снята или поставлена.
drop trigger if exists apply_v2_child_transfer_mark_zat on public.v2_children;
create trigger apply_v2_child_transfer_mark_zat
  before insert or update on public.v2_children
  for each row execute function public.v2_child_transfer_mark_at();

-- Уже стоящие пометки: от последнего комментария, иначе от сейчас.
update public.v2_children
set transfer_mark_at = coalesce(transfer_comment_at, now())
where transfer_mark is not null and transfer_mark_at is null;
