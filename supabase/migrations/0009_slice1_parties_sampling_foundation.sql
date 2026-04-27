begin;

create or replace function public.normalize_party_name(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select nullif(
    regexp_replace(lower(btrim(input)), '[[:space:]]+', ' ', 'g'),
    ''
  )
$$;

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  normalized_name text generated always as (public.normalize_party_name(name)) stored,
  is_buyer boolean not null default false,
  is_broker boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parties_normalized_name_key unique (normalized_name)
);

create table if not exists public.sampling_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  sampled_on date not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table if not exists public.sampling_event_parties (
  sampling_event_id uuid not null references public.sampling_events(id) on delete cascade,
  party_id uuid not null references public.parties(id),
  follow_up_due_date date not null,
  primary key (sampling_event_id, party_id)
);

create index if not exists idx_sampling_events_lot_sampled_on
  on public.sampling_events (lot_id, sampled_on desc, created_at desc);

create index if not exists idx_sampling_event_parties_follow_up_due
  on public.sampling_event_parties (follow_up_due_date, party_id);

drop trigger if exists set_parties_updated_at on public.parties;
create trigger set_parties_updated_at
before update on public.parties
for each row
execute procedure public.set_updated_at();

alter table public.parties enable row level security;
alter table public.sampling_events enable row level security;
alter table public.sampling_event_parties enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'parties'
      and policyname = 'parties_ops'
  ) then
    create policy parties_ops on public.parties
      for all
      using (public.current_role() in ('admin', 'operator'))
      with check (public.current_role() in ('admin', 'operator'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sampling_events'
      and policyname = 'sampling_events_ops'
  ) then
    create policy sampling_events_ops on public.sampling_events
      for all
      using (public.current_role() in ('admin', 'operator'))
      with check (public.current_role() in ('admin', 'operator'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sampling_event_parties'
      and policyname = 'sampling_event_parties_ops'
  ) then
    create policy sampling_event_parties_ops on public.sampling_event_parties
      for all
      using (public.current_role() in ('admin', 'operator'))
      with check (public.current_role() in ('admin', 'operator'));
  end if;
end
$$;

commit;
