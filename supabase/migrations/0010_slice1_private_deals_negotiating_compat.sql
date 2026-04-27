begin;

alter table public.private_deals
  alter column buyer_id drop not null;

alter table public.private_deals
  add column if not exists buyer_party_id uuid,
  add column if not exists broker_party_id uuid,
  add column if not exists negotiation_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'private_deals_buyer_party_id_fkey'
      and conrelid = 'public.private_deals'::regclass
  ) then
    alter table public.private_deals
      add constraint private_deals_buyer_party_id_fkey
      foreign key (buyer_party_id)
      references public.parties(id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'private_deals_broker_party_id_fkey'
      and conrelid = 'public.private_deals'::regclass
  ) then
    alter table public.private_deals
      add constraint private_deals_broker_party_id_fkey
      foreign key (broker_party_id)
      references public.parties(id);
  end if;
end
$$;

create unique index if not exists uq_private_deals_negotiating_lot_buyer_party
  on public.private_deals (lot_id, buyer_party_id)
  where status = 'NEGOTIATING'::public.private_deal_status
    and buyer_party_id is not null;

create unique index if not exists uq_private_deals_negotiating_lot_buyer_legacy
  on public.private_deals (lot_id, buyer_id)
  where status = 'NEGOTIATING'::public.private_deal_status
    and buyer_id is not null
    and buyer_party_id is null;

create index if not exists idx_private_deals_negotiating_lot_date
  on public.private_deals (lot_id, negotiation_date desc, updated_at desc)
  where status = 'NEGOTIATING'::public.private_deal_status;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'private_deals_negotiating_identity_mode_chk'
      and conrelid = 'public.private_deals'::regclass
  ) then
    alter table public.private_deals
      add constraint private_deals_negotiating_identity_mode_chk
      check (
        status <> 'NEGOTIATING'::public.private_deal_status
        or (
          (
            buyer_id is not null
            and buyer_party_id is null
            and broker_party_id is null
            and negotiation_date is null
          )
          or
          (
            buyer_id is null
            and buyer_party_id is not null
            and broker_party_id is not null
            and negotiation_date is not null
          )
        )
      ) not valid;
  end if;
end
$$;

commit;
