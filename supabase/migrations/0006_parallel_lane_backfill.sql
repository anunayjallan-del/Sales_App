-- Rebuild active statuses into parallel auction/private lanes from best available history.
-- Keeps lot_actions history intact; only rematerializes lot_active_statuses.

delete from public.lot_active_statuses;

with latest_auction_action as (
  select distinct on (la.lot_id)
    la.lot_id,
    case la.action
      when 'DISPATCH_TO_AUCTION' then 'PENDING_AUCTION_DISPATCH'
      when 'AUCTION_DISPATCHED' then 'IN_TRANSIT'
      when 'HOLD_AWR' then 'AWR_PENDING'
      when 'AWR_RECEIVED' then 'AWR_RECEIVED'
      when 'PRINT' then 'CATALOGUED'
      when 'SET_RESERVE_PRICE' then 'RESERVE_SET'
      when 'SOLD_AUCTION' then 'SOLD_AUCTION'
      when 'OUT' then 'OUT'
      when 'REPRINT' then 'REPRINT'
      when 'HOLD' then 'HOLD'
      when 'WITHDRAW' then 'WITHDRAW'
      else null
    end::public.lot_global_status as status
  from public.lot_actions la
  where la.action in (
    'DISPATCH_TO_AUCTION',
    'AUCTION_DISPATCHED',
    'HOLD_AWR',
    'AWR_RECEIVED',
    'PRINT',
    'SET_RESERVE_PRICE',
    'SOLD_AUCTION',
    'OUT',
    'REPRINT',
    'HOLD',
    'WITHDRAW'
  )
  order by la.lot_id, la.performed_at desc, la.created_at desc, la.id desc
),
latest_private_action as (
  select distinct on (la.lot_id)
    la.lot_id,
    case la.action
      when 'NEGOTIATING' then 'NEGOTIATING'
      when 'SOLD_PENDING_DISPATCH' then 'SOLD_PENDING_DISPATCH'
      when 'SOLD_PRIVATE' then 'SOLD'
      else null
    end::public.lot_global_status as status
  from public.lot_actions la
  where la.action in ('NEGOTIATING', 'SOLD_PENDING_DISPATCH', 'SOLD_PRIVATE')
  order by la.lot_id, la.performed_at desc, la.created_at desc, la.id desc
),
latest_terminal_action as (
  select distinct on (la.lot_id)
    la.lot_id,
    case la.action
      when 'PAYMENT_RECEIVED' then 'CLOSED'
      when 'CANCELLED' then 'CANCELLED'
      when 'REINVOICED' then 'CANCELLED'
      else null
    end::public.lot_global_status as status
  from public.lot_actions la
  where la.action in ('PAYMENT_RECEIVED', 'CANCELLED', 'REINVOICED')
  order by la.lot_id, la.performed_at desc, la.created_at desc, la.id desc
),
fallback_auction as (
  select
    at.lot_id,
    case at.auction_status
      when 'IN_TRANSIT' then 'IN_TRANSIT'
      when 'AWR_PENDING' then 'AWR_PENDING'
      when 'AWR_RECEIVED' then 'AWR_RECEIVED'
      when 'AWR_CATALOGUED' then 'CATALOGUED'
      when 'CATALOGUED' then 'CATALOGUED'
      when 'RESERVE_SET' then 'RESERVE_SET'
      when 'AUCTION_SCHEDULED' then 'RESERVE_SET'
      when 'SOLD_AUCTION' then 'SOLD_AUCTION'
      when 'OUT' then 'OUT'
      when 'HOLD' then 'HOLD'
      when 'REPRINT' then 'REPRINT'
      when 'WITHDRAW' then 'WITHDRAW'
      else null
    end::public.lot_global_status as status
  from public.auction_tracks at
),
private_ranked as (
  select
    pd.lot_id,
    case pd.status
      when 'SOLD' then 'SOLD'
      when 'SOLD_PENDING_DISPATCH' then 'SOLD_PENDING_DISPATCH'
      when 'NEGOTIATING' then 'NEGOTIATING'
      else null
    end::public.lot_global_status as status,
    case pd.status
      when 'SOLD' then 3
      when 'SOLD_PENDING_DISPATCH' then 2
      when 'NEGOTIATING' then 1
      else 0
    end as priority
  from public.private_deals pd
),
fallback_private as (
  select lot_id, status
  from (
    select
      pr.lot_id,
      pr.status,
      row_number() over (partition by pr.lot_id order by pr.priority desc) as rn
    from private_ranked pr
    where pr.status is not null
  ) ranked
  where ranked.rn = 1
),
resolved as (
  select
    l.id as lot_id,
    case
      when lta.status is not null then lta.status
      when l.is_cancelled then 'CANCELLED'::public.lot_global_status
      else null
    end as terminal_status,
    coalesce(laa.status, fa.status) as auction_status,
    coalesce(lpa.status, fp.status) as private_status
  from public.lots l
  left join latest_terminal_action lta on lta.lot_id = l.id
  left join latest_auction_action laa on laa.lot_id = l.id
  left join latest_private_action lpa on lpa.lot_id = l.id
  left join fallback_auction fa on fa.lot_id = l.id
  left join fallback_private fp on fp.lot_id = l.id
),
final_statuses as (
  select
    r.lot_id,
    case
      when r.terminal_status = 'CLOSED' then array['CLOSED'::public.lot_global_status]
      when r.terminal_status = 'CANCELLED' then array['CANCELLED'::public.lot_global_status]
      when r.terminal_status = 'PENDING' then array['PENDING'::public.lot_global_status]
      else
        case
          when r.auction_status is null and (case when r.auction_status = 'SOLD_AUCTION' then null else r.private_status end) is null then array['PENDING'::public.lot_global_status]
          else array_remove(
            array[
              r.auction_status,
              case when r.auction_status = 'SOLD_AUCTION' then null else r.private_status end
            ]::public.lot_global_status[],
            null
          )
        end
    end as statuses
  from resolved r
)
insert into public.lot_active_statuses (lot_id, status, since_at)
select
  fs.lot_id,
  unnest(fs.statuses) as status,
  now()
from final_statuses fs;
