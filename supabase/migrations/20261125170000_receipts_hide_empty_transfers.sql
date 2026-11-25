-- «Чеки»: показываются только трансферы, которые есть в справочнике (в них есть дети),
-- либо к ним уже привязана группа WhatsApp или пришли чеки. Пустые активные трансферы
-- (например, KAS 8, 10, 15, 17, 30 без детей) больше не появляются.
create or replace function public.incoming_receipts_summary(p_branch_ids uuid[], p_date_from date, p_date_to date)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
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
      and (p_date_from is null or coalesce(r.receipt_date, (r.message_at at time zone 'Asia/Bishkek')::date) >= p_date_from)
      and (p_date_to is null or coalesce(r.receipt_date, (r.message_at at time zone 'Asia/Bishkek')::date) < p_date_to)
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
        and (
          t.whatsapp_chat_id is not null
          or coalesce(c.total, 0) + coalesce(c.other, 0) > 0
          or exists (select 1 from public.v2_children ch where ch.transfer_id = t.id and ch.status <> 'rejected')
        )
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
$function$;
