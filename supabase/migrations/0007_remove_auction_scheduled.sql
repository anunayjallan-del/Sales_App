-- Remove AUCTION_SCHEDULED from DB enums by remapping data and recreating enum types.

-- 1) Normalize existing data first.
update public.auction_tracks
set auction_status = 'RESERVE_SET'
where auction_status = 'AUCTION_SCHEDULED';

update public.lot_status_events
set status = 'RESERVE_SET'
where status = 'AUCTION_SCHEDULED';

update public.lot_actions
set resulting_status = 'RESERVE_SET'
where resulting_status = 'AUCTION_SCHEDULED';

-- Avoid PK conflicts before remapping lot_active_statuses.
delete from public.lot_active_statuses scheduled
using public.lot_active_statuses reserve_set
where scheduled.status = 'AUCTION_SCHEDULED'
  and reserve_set.status = 'RESERVE_SET'
  and reserve_set.lot_id = scheduled.lot_id;

update public.lot_active_statuses
set status = 'RESERVE_SET'
where status = 'AUCTION_SCHEDULED';

-- 2) Recreate auction_status enum without AUCTION_SCHEDULED.
alter type public.auction_status rename to auction_status_old;

create type public.auction_status as enum (
  'IN_TRANSIT',
  'AWR_PENDING',
  'AWR_CATALOGUED',
  'RESERVE_SET',
  'SOLD_AUCTION',
  'OUT',
  'REPRINT',
  'HOLD',
  'WITHDRAW',
  'AWR_RECEIVED',
  'CATALOGUED'
);

alter table public.auction_tracks
  alter column auction_status type public.auction_status
  using auction_status::text::public.auction_status;

drop type public.auction_status_old;

-- 3) Recreate lot_global_status enum without AUCTION_SCHEDULED.
alter type public.lot_global_status rename to lot_global_status_old;

create type public.lot_global_status as enum (
  'PENDING',
  'IN_TRANSIT',
  'AWR_PENDING',
  'AWR_RECEIVED',
  'CATALOGUED',
  'RESERVE_SET',
  'SOLD_AUCTION',
  'OUT',
  'HOLD',
  'REPRINT',
  'WITHDRAW',
  'SAMPLING_SENT',
  'NEGOTIATING',
  'SOLD_PENDING_DISPATCH',
  'SOLD',
  'CANCELLED',
  'CLOSED',
  'PENDING_AUCTION_DISPATCH'
);

alter table public.lot_status_events
  alter column status type public.lot_global_status
  using status::text::public.lot_global_status;

alter table public.lot_active_statuses
  alter column status type public.lot_global_status
  using status::text::public.lot_global_status;

alter table public.lot_actions
  alter column resulting_status type public.lot_global_status
  using resulting_status::text::public.lot_global_status;

drop type public.lot_global_status_old;
