alter table public.v2_payments add column if not exists receipt_sha256 text;

create or replace function public.receipt_unique_key(code text, bank text default null)
returns text language sql immutable set search_path=public as $$
 select case
 when code ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then lower(substring(code from '(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'))
 when trim(code) ~* '^(MBIZ_S_|QR_)[a-z0-9_-]+$' then lower(trim(code))
 when trim(code) ~ '^[0-9]{6,}$' and nullif(trim(bank),'') is not null then lower(regexp_replace(bank,'[^a-zA-Zа-яА-Я0-9]','','g')) || ':' || trim(code)
 else null end
$$;

create or replace function public.receipt_bank_key(bank text)
returns text language sql immutable set search_path=public as $$
 select case when lower(bank) ~ '(optima|оптима)' then 'optima'
 when lower(bank) ~ '(bakai|бакай)' then 'bakai'
 when lower(bank) ~ '(demir|демир)' then 'demir'
 when lower(bank) ~ '(mbank|мбанк|м-банк)' then 'mbank'
 else nullif(lower(regexp_replace(bank,'[^a-zA-Zа-яА-Я0-9]','','g')),'') end
$$;

create or replace function public.find_receipt_duplicate(
 p_code text default null,p_hash text default null,p_bank text default null,p_time text default null,
 p_card text default null,p_amount numeric default null,p_date date default null,p_exclude uuid default null)
returns table(payment_id uuid,family_id text,parent_name text,amount numeric,payment_date date,match_type text)
language sql volatile security invoker set search_path=public as $$
 select p.id,p.family_id,f.parent_name,p.amount,p.payment_date,
 case when p_hash is not null and p.receipt_sha256=p_hash then 'file'
 when public.receipt_unique_key(p_code,p_bank) is not null and public.receipt_unique_key(p.receipt_code,p.receipt_bank)=public.receipt_unique_key(p_code,p_bank) then 'code'
 else 'details' end
 from public.v2_payments p join public.v2_families f on f.id=p.family_id
 where p.status in ('pending','confirmed') and (p_exclude is null or p.id<>p_exclude) and (
 (nullif(p_hash,'') is not null and p.receipt_sha256=p_hash)
 or (public.receipt_unique_key(p_code,p_bank) is not null and public.receipt_unique_key(p.receipt_code,p.receipt_bank)=public.receipt_unique_key(p_code,p_bank))
 or (public.receipt_bank_key(p_bank) is not null and public.receipt_bank_key(p.receipt_bank)=public.receipt_bank_key(p_bank)
 and p_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 and (p.receipt_time=p_time or (length(p.receipt_time)=5 or length(p_time)=5) and left(p.receipt_time,5)=left(p_time,5))
 and p_card ~ '^[0-9]{4}$' and p.receipt_card_last4=p_card and p.amount=p_amount and p.payment_date=p_date))
 order by case when p.receipt_sha256=p_hash then 0 when public.receipt_unique_key(p.receipt_code,p.receipt_bank)=public.receipt_unique_key(p_code,p_bank) then 1 else 2 end,p.created_at
 limit 1
$$;

create or replace function public.guard_receipt_duplicate()
returns trigger language plpgsql security invoker set search_path=public as $$
declare duplicate record;
begin
 if new.status not in ('pending','confirmed') then return new; end if;
 if tg_op='UPDATE' then
  if row(old.receipt_code,old.receipt_sha256,old.receipt_bank,old.receipt_time,old.receipt_card_last4,old.amount,old.payment_date) is not distinct from row(new.receipt_code,new.receipt_sha256,new.receipt_bank,new.receipt_time,new.receipt_card_last4,new.amount,new.payment_date)
   and old.status in ('pending','confirmed') then return new; end if;
 end if;
 if new.receipt_sha256 is not null and new.receipt_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Неверный цифровой отпечаток чека'; end if;
 -- Serialize receipt claims, including requests arriving from different clients.
 perform pg_advisory_xact_lock(hashtextextended('outway_receipt_duplicate_guard',0));
 select * into duplicate from public.find_receipt_duplicate(new.receipt_code,new.receipt_sha256,new.receipt_bank,new.receipt_time,new.receipt_card_last4,new.amount,new.payment_date,new.id);
 if found then
  raise exception using errcode='P0001',message=format('Дубль чека: уже есть платёж %s у семьи «%s» (%s), сумма %s, дата %s. Повторная отправка на проверку запрещена.',duplicate.payment_id,duplicate.parent_name,duplicate.family_id,duplicate.amount,duplicate.payment_date),detail=duplicate.match_type;
 end if;
 return new;
end $$;

drop trigger if exists v2_receipt_duplicate_guard on public.v2_payments;
create trigger v2_receipt_duplicate_guard before insert or update of receipt_code,receipt_sha256,receipt_bank,receipt_time,receipt_card_last4,amount,payment_date,status
on public.v2_payments for each row execute function public.guard_receipt_duplicate();
create unique index if not exists v2_receipt_hash_lookup on public.v2_payments(receipt_sha256) where status in ('pending','confirmed');
create index if not exists v2_receipt_code_lookup on public.v2_payments(public.receipt_unique_key(receipt_code,receipt_bank)) where status in ('pending','confirmed');
create index if not exists v2_receipt_details_lookup on public.v2_payments(public.receipt_bank_key(receipt_bank),payment_date,amount,receipt_card_last4) where status in ('pending','confirmed');
