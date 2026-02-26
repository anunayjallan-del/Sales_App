create table if not exists public.lot_actions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  action text not null,
  resulting_status lot_global_status not null,
  payload jsonb not null default '{}'::jsonb,
  warning_flags text[] not null default '{}',
  performed_by uuid references auth.users(id),
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_lot_actions_lot_performed on public.lot_actions (lot_id, performed_at desc);

alter table public.lot_actions enable row level security;

create policy lot_actions_ops on public.lot_actions
  for all using (public.current_role() in ('admin', 'operator'))
  with check (public.current_role() in ('admin', 'operator'));

