-- Входящие фото и PDF из групп родителей. Платёж появляется только после того,
-- как сотрудник нажмёт «На проверку»; сам бот платежи и долги не меняет.
-- other — файл без признаков чека; dismissed — сотрудник отметил «Не чек».
-- Такие файлы удаляются через 30 дней (это делает функция whatsapp-receipts-webhook).
create table if not exists public.v2_incoming_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'green_api',
  provider_message_id text not null,
  chat_id text not null,
  chat_name text,
  message_at timestamptz not null,
  status text not null default 'received'
    check (status in ('received', 'recognized', 'other', 'dismissed', 'failed')),
  sender_id text,
  sender_phone text,
  sender_name text,
  caption text,
  is_forwarded boolean not null default false,
  file_name text,
  mime_type text,
  storage_path text,
  file_sha256 text,
  amount numeric check (amount is null or amount > 0),
  receipt_date date,
  receipt_time text,
  receipt_card_last4 text,
  receipt_bank text,
  receipt_code text,
  match_status text
    check (match_status is null or match_status in ('matched', 'manual', 'none', 'multiple', 'no_phone', 'lookup_failed')),
  family_id text references public.v2_families(id) on delete set null,
  family_match_count integer,
  duplicate_payment_id uuid references public.v2_payments(id) on delete set null,
  duplicate_match_type text,
  payment_id uuid references public.v2_payments(id) on delete set null,
  submitted_by text,
  submitted_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_message_id)
);

create index if not exists v2_incoming_receipts_message_at_idx
  on public.v2_incoming_receipts (message_at desc, id desc)
  where status <> 'dismissed';
create index if not exists v2_incoming_receipts_cleanup_idx
  on public.v2_incoming_receipts (message_at)
  where status in ('other', 'dismissed') and payment_id is null;
create index if not exists v2_incoming_receipts_family_idx
  on public.v2_incoming_receipts (family_id)
  where family_id is not null;

-- Чеки содержат финансовые данные родителей: доступ только у серверной функции.
alter table public.v2_incoming_receipts enable row level security;
revoke all on table public.v2_incoming_receipts from public, anon, authenticated;
grant all on table public.v2_incoming_receipts to service_role;

-- Телефоны в CRM записаны в разных форматах (996…, 0…, 9 цифр),
-- поэтому сравниваются последние 9 цифр.
create or replace function public.find_families_by_phone_suffix(p_suffix text)
returns table (family_id text)
language sql
stable
set search_path = public
as $$
  select f.id
  from public.v2_families f
  where p_suffix ~ '^[0-9]{9}$'
    and (
      right(regexp_replace(coalesce(f.phone, ''), '\D', '', 'g'), 9) = p_suffix
      or right(regexp_replace(coalesce(f.second_phone, ''), '\D', '', 'g'), 9) = p_suffix
      or right(regexp_replace(coalesce(f.contact_phone, ''), '\D', '', 'g'), 9) = p_suffix
    )
  limit 6;
$$;

revoke all on function public.find_families_by_phone_suffix(text) from public, anon, authenticated;
grant execute on function public.find_families_by_phone_suffix(text) to service_role;

-- Страница раздела «Чеки» одним запросом. Сотрудник с ограниченным списком школ видит
-- чеки своих семей и ещё не разобранные чеки, у которых семья пока не определена.
create or replace function public.list_incoming_receipts(
  p_filter text,
  p_search text,
  p_branch_ids uuid[],
  p_limit integer,
  p_offset integer
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with visible as (
    select
      r.*,
      f.parent_name,
      case
        when r.payment_id is not null then 'submitted'
        when r.duplicate_payment_id is not null then 'duplicates'
        when r.status = 'other' then 'other'
        else 'review'
      end as kind
    from public.v2_incoming_receipts r
    left join public.v2_families f on f.id = r.family_id
    where r.status <> 'dismissed'
      and (
        p_branch_ids is null
        or r.family_id is null
        or exists (
          select 1 from public.v2_children c
          where c.family_id = r.family_id and c.branch_id = any(p_branch_ids)
        )
      )
      and (
        coalesce(p_search, '') = ''
        or position(lower(p_search) in lower(concat_ws(' ', r.chat_name, r.sender_name, r.sender_phone, r.caption, r.family_id, f.parent_name))) > 0
      )
  ),
  page as (
    select * from visible
    where (p_filter = 'all' and kind <> 'other') or kind = p_filter
    order by message_at desc, id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'all', count(*) filter (where kind <> 'other'),
        'review', count(*) filter (where kind = 'review'),
        'submitted', count(*) filter (where kind = 'submitted'),
        'duplicates', count(*) filter (where kind = 'duplicates'),
        'other', count(*) filter (where kind = 'other')
      )
      from visible
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'kind', p.kind,
        'status', p.status,
        'chat_name', p.chat_name,
        'message_at', p.message_at,
        'sender_phone', p.sender_phone,
        'sender_name', p.sender_name,
        'caption', p.caption,
        'is_forwarded', p.is_forwarded,
        'file_name', p.file_name,
        'mime_type', p.mime_type,
        'has_file', p.storage_path is not null,
        'amount', p.amount,
        'receipt_date', p.receipt_date,
        'receipt_time', p.receipt_time,
        'receipt_card_last4', p.receipt_card_last4,
        'receipt_bank', p.receipt_bank,
        'receipt_code', p.receipt_code,
        'match_status', p.match_status,
        'family_match_count', p.family_match_count,
        'family_id', p.family_id,
        'parent_name', p.parent_name,
        'children', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', c.child_name,
            'school', coalesce(b.short_name, b.name),
            'transfer', t.transfer_number
          ) order by c.created_at, c.id)
          from public.v2_children c
          left join public.v2_school_branches b on b.id = c.branch_id
          left join public.v2_transfers t on t.id = c.transfer_id
          where c.family_id = p.family_id and c.status <> 'rejected'
        ), '[]'::jsonb),
        'duplicate_payment_id', p.duplicate_payment_id,
        'duplicate_family_id', (select d.family_id from public.v2_payments d where d.id = p.duplicate_payment_id),
        'payment_id', p.payment_id,
        'submitted_by', p.submitted_by,
        'submitted_at', p.submitted_at,
        'error', p.error
      ) order by p.message_at desc, p.id desc)
      from page p
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.list_incoming_receipts(text, text, uuid[], integer, integer) from public, anon, authenticated;
grant execute on function public.list_incoming_receipts(text, text, uuid[], integer, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incoming-receipts',
  'incoming-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;
