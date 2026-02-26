alter type auction_status add value if not exists 'AWR_RECEIVED';
alter type auction_status add value if not exists 'CATALOGUED';
alter type auction_status add value if not exists 'AUCTION_SCHEDULED';

create type lot_global_status as enum (
  'PENDING',
  'IN_TRANSIT',
  'AWR_PENDING',
  'AWR_RECEIVED',
  'CATALOGUED',
  'RESERVE_SET',
  'AUCTION_SCHEDULED',
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
  'CLOSED'
);

create type lot_status_event_source as enum ('IMPORT', 'AUCTION_ACTION', 'PRIVATE_ACTION', 'SYSTEM', 'MANUAL');

create table if not exists public.lot_status_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  status lot_global_status not null,
  source lot_status_event_source not null,
  effective_at timestamptz not null default now(),
  meta jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.lot_active_statuses (
  lot_id uuid not null references public.lots(id) on delete cascade,
  status lot_global_status not null,
  since_at timestamptz not null default now(),
  primary key (lot_id, status)
);

alter table public.auction_tracks
  add column if not exists in_transit_date date,
  add column if not exists print_date date,
  add column if not exists sale_date date;

create index if not exists idx_lot_status_events_lot_effective on public.lot_status_events (lot_id, effective_at desc);
create index if not exists idx_lot_active_statuses_status on public.lot_active_statuses (status);

alter table public.lot_status_events enable row level security;
alter table public.lot_active_statuses enable row level security;

create policy lot_status_events_ops on public.lot_status_events
  for all using (public.current_role() in ('admin', 'operator'))
  with check (public.current_role() in ('admin', 'operator'));

create policy lot_active_statuses_ops on public.lot_active_statuses
  for all using (public.current_role() in ('admin', 'operator'))
  with check (public.current_role() in ('admin', 'operator'));

