-- Группы WhatsApp, в которые добавлен бот, и их привязка к трансферам.
-- Одна группа = один трансфер. Бот берёт файлы только из привязанных групп
-- (плюс группы из переменной GREEN_API_ALLOWED_CHATS для тестов).
create table if not exists public.v2_whatsapp_groups (
  chat_id text primary key check (chat_id like '%@g.us'),
  name text,
  provider text not null default 'green_api',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.v2_whatsapp_groups enable row level security;
revoke all on table public.v2_whatsapp_groups from public, anon, authenticated;
grant all on table public.v2_whatsapp_groups to service_role;

-- Группы, из которых уже пришли файлы, сразу попадают в список.
insert into public.v2_whatsapp_groups (chat_id, name, first_seen_at, last_seen_at)
select distinct on (chat_id) chat_id, chat_name, min(message_at) over (partition by chat_id), max(message_at) over (partition by chat_id)
from public.v2_incoming_receipts
where chat_id like '%@g.us'
order by chat_id, message_at desc
on conflict (chat_id) do nothing;

alter table public.v2_transfers
  add column if not exists whatsapp_chat_id text unique
  references public.v2_whatsapp_groups(chat_id) on delete set null;

-- Список чеков: добавлены отбор по трансферу и «без трансфера».
-- Трансфер чека определяется группой, поэтому привязка группы задним числом
-- переносит в трансфер и уже пришедшие из неё чеки.
drop function if exists public.list_incoming_receipts(text, text, uuid[], integer, integer);

create or replace function public.list_incoming_receipts(
  p_filter text,
  p_search text,
  p_branch_ids uuid[],
  p_transfer_id uuid,
  p_unassigned boolean,
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
      t.id as transfer_id,
      t.transfer_number,
      case
        when r.payment_id is not null then 'submitted'
        when r.duplicate_payment_id is not null then 'duplicates'
        when r.status = 'other' then 'other'
        else 'review'
      end as kind
    from public.v2_incoming_receipts r
    left join public.v2_families f on f.id = r.family_id
    left join public.v2_transfers t on t.whatsapp_chat_id = r.chat_id
    where r.status <> 'dismissed'
      and (
        p_branch_ids is null
        or t.branch_id = any(p_branch_ids)
        or (r.family_id is not null and exists (
          select 1 from public.v2_children c
          where c.family_id = r.family_id and c.branch_id = any(p_branch_ids)
        ))
        or (t.id is null and r.family_id is null)
      )
      and (p_transfer_id is null or t.id = p_transfer_id)
      and (not coalesce(p_unassigned, false) or t.id is null)
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
        'transfer_id', p.transfer_id,
        'transfer_number', p.transfer_number,
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

revoke all on function public.list_incoming_receipts(text, text, uuid[], uuid, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.list_incoming_receipts(text, text, uuid[], uuid, boolean, integer, integer) to service_role;

-- Сводка для экрана «школы → трансферы»: все действующие трансферы с привязанной группой
-- и числом чеков, плюс чеки из групп без трансфера.
create or replace function public.incoming_receipts_summary(p_branch_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  with receipts as (
    select
      r.family_id,
      t.id as transfer_id,
      case
        when r.payment_id is not null then 'submitted'
        when r.duplicate_payment_id is not null then 'duplicates'
        when r.status = 'other' then 'other'
        else 'review'
      end as kind
    from public.v2_incoming_receipts r
    left join public.v2_transfers t on t.whatsapp_chat_id = r.chat_id
    where r.status <> 'dismissed'
  ),
  counts as (
    select transfer_id,
      count(*) filter (where kind = 'review') as review,
      count(*) filter (where kind = 'duplicates') as duplicates,
      count(*) filter (where kind = 'other') as other,
      count(*) filter (where kind <> 'other') as total
    from receipts
    where transfer_id is not null
    group by transfer_id
  )
  select jsonb_build_object(
    'transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'transfer_id', t.id,
        'branch_id', t.branch_id,
        'transfer_number', t.transfer_number,
        'chat_id', t.whatsapp_chat_id,
        'group_name', g.name,
        'review', coalesce(c.review, 0),
        'duplicates', coalesce(c.duplicates, 0),
        'other', coalesce(c.other, 0),
        'total', coalesce(c.total, 0)
      ) order by t.transfer_number)
      from public.v2_transfers t
      left join public.v2_whatsapp_groups g on g.chat_id = t.whatsapp_chat_id
      left join counts c on c.transfer_id = t.id
      where t.status = 'active' and not coalesce(t.is_test, false)
        and (p_branch_ids is null or t.branch_id = any(p_branch_ids))
    ), '[]'::jsonb),
    'unassigned', (
      select jsonb_build_object(
        'review', count(*) filter (where kind = 'review'),
        'duplicates', count(*) filter (where kind = 'duplicates'),
        'other', count(*) filter (where kind = 'other'),
        'total', count(*) filter (where kind <> 'other')
      )
      from receipts r
      where r.transfer_id is null
        and (
          p_branch_ids is null
          or r.family_id is null
          or exists (select 1 from public.v2_children c where c.family_id = r.family_id and c.branch_id = any(p_branch_ids))
        )
    )
  );
$$;

revoke all on function public.incoming_receipts_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.incoming_receipts_summary(uuid[]) to service_role;
