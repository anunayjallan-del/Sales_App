create extension if not exists pgcrypto;

create type auction_status as enum (
  'IN_TRANSIT',
  'AWR_PENDING',
  'AWR_CATALOGUED',
  'RESERVE_SET',
  'SOLD_AUCTION',
  'OUT',
  'REPRINT',
  'HOLD',
  'WITHDRAW'
);

create type private_deal_status as enum (
  'SAMPLING_SENT',
  'NEGOTIATING',
  'SOLD_PENDING_DISPATCH',
  'SOLD',
  'CANCELLED'
);

create type payment_term as enum ('CD', 'DUE');
create type master_status as enum ('ACTIVE', 'SOLD_PENDING_DISPATCH', 'SOLD_PRIVATE', 'SOLD_AUCTION', 'IN_TRANSIT', 'HOLD', 'OUT');
create type dispatch_advice_status as enum ('GENERATED', 'SHARED', 'BILLED');
create type app_role as enum ('admin', 'operator');

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'operator',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'operator')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  mark text not null,
  invoice_number text not null,
  grade text not null,
  bags int not null check (bags >= 0),
  net_weight_kg numeric(12,3) not null check (net_weight_kg >= 0),
  factory text,
  date_created date not null,
  is_cancelled boolean not null default false,
  repacked_from_lot_id uuid references public.lots(id),
  repacked_to_lot_id uuid references public.lots(id),
  master_status master_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mark, invoice_number)
);

create table if not exists public.auction_tracks (
  lot_id uuid primary key references public.lots(id) on delete cascade,
  auction_status auction_status,
  sale_number text,
  reserve_price_inr numeric(14,2),
  hammer_price_inr numeric(14,2),
  auction_sold_date date,
  out_date date,
  settlement_due_date date,
  payment_received_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_info jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_deals (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  buyer_id uuid not null references public.buyers(id),
  status private_deal_status not null,
  offered_price_inr numeric(14,2),
  final_sale_price_inr numeric(14,2),
  payment_term payment_term,
  payment_term_days int,
  due_date date,
  payment_received_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_term <> 'DUE' or payment_term_days is not null)
);

create table if not exists public.dispatch_advices (
  id uuid primary key default gen_random_uuid(),
  private_deal_id uuid not null references public.private_deals(id) on delete cascade,
  mark text not null,
  invoice_number text not null,
  grade text not null,
  bags int not null,
  weight numeric(12,3) not null,
  buyer_name text not null,
  sale_price_inr numeric(14,2) not null,
  payment_term payment_term not null,
  total_value_inr numeric(14,2) not null,
  status dispatch_advice_status not null default 'GENERATED',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  status text not null,
  total_rows int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  error_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_row_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  row_number int not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawal_prompts (
  id uuid primary key default gen_random_uuid(),
  private_deal_id uuid not null references public.private_deals(id) on delete cascade,
  action text not null check (action in ('WITHDRAW_NOW', 'REMIND_LATER', 'NO')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_lots_updated_at before update on public.lots for each row execute procedure public.set_updated_at();
create trigger set_auction_tracks_updated_at before update on public.auction_tracks for each row execute procedure public.set_updated_at();
create trigger set_buyers_updated_at before update on public.buyers for each row execute procedure public.set_updated_at();
create trigger set_private_deals_updated_at before update on public.private_deals for each row execute procedure public.set_updated_at();
create trigger set_dispatch_advices_updated_at before update on public.dispatch_advices for each row execute procedure public.set_updated_at();
create trigger set_sync_runs_updated_at before update on public.sync_runs for each row execute procedure public.set_updated_at();

create or replace function public.current_role()
returns app_role
language sql
stable
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.lots enable row level security;
alter table public.auction_tracks enable row level security;
alter table public.buyers enable row level security;
alter table public.private_deals enable row level security;
alter table public.dispatch_advices enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_row_errors enable row level security;
alter table public.withdrawal_prompts enable row level security;

create policy profiles_read_self on public.profiles for select using (auth.uid() = user_id);
create policy profiles_admin_manage on public.profiles for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy lots_ops on public.lots for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy auction_tracks_ops on public.auction_tracks for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy buyers_ops on public.buyers for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy private_deals_ops on public.private_deals for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy dispatch_advices_ops on public.dispatch_advices for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy sync_runs_ops on public.sync_runs for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy sync_row_errors_ops on public.sync_row_errors for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
create policy withdrawal_prompts_ops on public.withdrawal_prompts for all using (public.current_role() in ('admin', 'operator')) with check (public.current_role() in ('admin', 'operator'));
