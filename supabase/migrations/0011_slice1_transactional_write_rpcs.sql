begin;

create or replace function public.slice1_current_resulting_status(p_lot_id uuid)
returns public.lot_global_status
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select las.status
      from public.lot_active_statuses las
      where las.lot_id = p_lot_id
      order by case las.status
        when 'CLOSED'::public.lot_global_status then 1
        when 'CANCELLED'::public.lot_global_status then 2
        when 'SOLD'::public.lot_global_status then 3
        when 'SOLD_PENDING_DISPATCH'::public.lot_global_status then 4
        when 'NEGOTIATING'::public.lot_global_status then 5
        when 'SOLD_AUCTION'::public.lot_global_status then 6
        when 'SOLD_AUCTION_PENDING_DETAILS'::public.lot_global_status then 7
        when 'PENDING_AUCTION_DISPATCH'::public.lot_global_status then 8
        when 'WITHDRAW'::public.lot_global_status then 9
        when 'REPRINT'::public.lot_global_status then 10
        when 'HOLD'::public.lot_global_status then 11
        when 'OUT'::public.lot_global_status then 12
        when 'RESERVE_SET'::public.lot_global_status then 13
        when 'CATALOGUED'::public.lot_global_status then 14
        when 'AWR_RECEIVED'::public.lot_global_status then 15
        when 'AWR_PENDING'::public.lot_global_status then 16
        when 'IN_TRANSIT'::public.lot_global_status then 17
        when 'PENDING'::public.lot_global_status then 18
        else 999
      end,
      las.since_at desc
      limit 1
    ),
    'PENDING'::public.lot_global_status
  )
$$;

revoke all on function public.slice1_current_resulting_status(uuid) from public;
revoke all on function public.slice1_current_resulting_status(uuid) from anon;
revoke all on function public.slice1_current_resulting_status(uuid) from authenticated;
grant execute on function public.slice1_current_resulting_status(uuid) to service_role;

create or replace function public.slice1_safe_upsert_lot_structural(
  p_mark text,
  p_invoice_number text,
  p_grade text,
  p_bags integer,
  p_net_weight_kg numeric,
  p_factory text,
  p_date_created date,
  p_is_cancelled boolean
)
returns table (
  lot_id uuid,
  write_kind text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mark text;
  v_invoice_number text;
  v_grade text;
  v_factory text;
  v_lot_id uuid;
  v_existing_id uuid;
  v_initial_status public.lot_global_status;
begin
  v_mark := nullif(btrim(coalesce(p_mark, '')), '');
  v_invoice_number := nullif(btrim(coalesce(p_invoice_number, '')), '');
  v_grade := nullif(btrim(coalesce(p_grade, '')), '');
  v_factory := nullif(btrim(coalesce(p_factory, '')), '');

  if v_mark is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_MARK_REQUIRED';
  end if;

  if v_invoice_number is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_INVOICE_REQUIRED';
  end if;

  if v_grade is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_GRADE_REQUIRED';
  end if;

  if p_bags is null or p_bags < 0 then
    raise exception using errcode = 'P0001', message = 'IMPORT_BAGS_INVALID';
  end if;

  if p_net_weight_kg is null or p_net_weight_kg < 0 then
    raise exception using errcode = 'P0001', message = 'IMPORT_WEIGHT_INVALID';
  end if;

  if p_date_created is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_DATE_CREATED_REQUIRED';
  end if;

  insert into public.lots (
    mark,
    invoice_number,
    grade,
    bags,
    net_weight_kg,
    factory,
    date_created,
    is_cancelled,
    master_status
  )
  values (
    v_mark,
    v_invoice_number,
    v_grade,
    p_bags,
    p_net_weight_kg,
    v_factory,
    p_date_created,
    coalesce(p_is_cancelled, false),
    'ACTIVE'::public.master_status
  )
  on conflict (mark, invoice_number) do nothing
  returning id into v_lot_id;

  if v_lot_id is not null then
    v_initial_status := case
      when coalesce(p_is_cancelled, false) then 'CANCELLED'::public.lot_global_status
      else 'PENDING'::public.lot_global_status
    end;

    insert into public.lot_active_statuses (lot_id, status, since_at)
    values (v_lot_id, v_initial_status, now())
    on conflict on constraint lot_active_statuses_pkey
    do update set since_at = excluded.since_at;

    insert into public.lot_status_events (
      lot_id,
      status,
      source,
      effective_at,
      meta,
      created_by
    )
    values (
      v_lot_id,
      v_initial_status,
      'IMPORT'::public.lot_status_event_source,
      now(),
      jsonb_build_object('imported', true),
      null
    );

    return query
    select v_lot_id as lot_id, 'CREATED'::text as write_kind;

    return;
  end if;

  select l.id
    into v_existing_id
  from public.lots l
  where l.mark = v_mark
    and l.invoice_number = v_invoice_number
  for update;

  if v_existing_id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_LOT_LOOKUP_FAILED';
  end if;

  update public.lots
  set
    grade = v_grade,
    bags = p_bags,
    net_weight_kg = p_net_weight_kg,
    factory = v_factory,
    date_created = p_date_created
  where id = v_existing_id
    and (
      grade is distinct from v_grade
      or bags is distinct from p_bags
      or net_weight_kg is distinct from p_net_weight_kg
      or factory is distinct from v_factory
      or date_created is distinct from p_date_created
    );

  return query
  select v_existing_id as lot_id, 'UPDATED'::text as write_kind;
end;
$$;

revoke all on function public.slice1_safe_upsert_lot_structural(text, text, text, integer, numeric, text, date, boolean) from public;
revoke all on function public.slice1_safe_upsert_lot_structural(text, text, text, integer, numeric, text, date, boolean) from anon;
revoke all on function public.slice1_safe_upsert_lot_structural(text, text, text, integer, numeric, text, date, boolean) from authenticated;
grant execute on function public.slice1_safe_upsert_lot_structural(text, text, text, integer, numeric, text, date, boolean) to service_role;

create or replace function public.slice1_record_sampling(
  p_lot_id uuid,
  p_expected_lot_updated_at timestamptz,
  p_parties text[],
  p_sampling_date date,
  p_follow_up_due_date date default null,
  p_remarks text default null,
  p_performed_by uuid default null,
  p_performed_at timestamptz default now()
)
returns table (
  action_id uuid,
  sampling_event_id uuid,
  resolved_follow_up_due_date date,
  lot_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_updated_at timestamptz;
  v_resulting_status public.lot_global_status;
  v_resolved_follow_up_due_date date;
  v_sampling_event_id uuid;
  v_action_id uuid;
  v_lot_updated_at timestamptz;
  v_notes text;
  v_party_name text;
  v_normalized_party_name text;
  v_clean_parties text[] := '{}'::text[];
  v_normalized_parties text[] := '{}'::text[];
  v_party_ids uuid[] := '{}'::uuid[];
  v_party_id uuid;
  v_idx integer;
begin
  if p_lot_id is null then
    raise exception using errcode = 'P0001', message = 'SAMPLING_LOT_ID_REQUIRED';
  end if;

  if p_expected_lot_updated_at is null then
    raise exception using errcode = 'P0001', message = 'SAMPLING_EXPECTED_UPDATED_AT_REQUIRED';
  end if;

  if p_sampling_date is null then
    raise exception using errcode = 'P0001', message = 'SAMPLING_DATE_REQUIRED';
  end if;

  select l.updated_at
    into v_current_updated_at
  from public.lots l
  where l.id = p_lot_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'SAMPLING_LOT_NOT_FOUND';
  end if;

  if v_current_updated_at is distinct from p_expected_lot_updated_at then
    raise exception using errcode = 'P0001', message = 'STALE_LOT_WRITE';
  end if;

  if exists (
    select 1
    from public.lot_active_statuses las
    where las.lot_id = p_lot_id
      and las.status in ('CANCELLED'::public.lot_global_status, 'CLOSED'::public.lot_global_status)
  ) then
    raise exception using errcode = 'P0001', message = 'SAMPLING_NOT_ALLOWED_FOR_TERMINAL_LOT';
  end if;

  foreach v_party_name in array coalesce(p_parties, '{}'::text[]) loop
    v_party_name := btrim(coalesce(v_party_name, ''));
    v_normalized_party_name := public.normalize_party_name(v_party_name);

    if v_normalized_party_name is null then
      raise exception using errcode = 'P0001', message = 'SAMPLING_PARTY_NAME_REQUIRED';
    end if;

    if v_normalized_party_name = any(v_normalized_parties) then
      raise exception using errcode = 'P0001', message = 'SAMPLING_DUPLICATE_PARTY';
    end if;

    v_clean_parties := array_append(v_clean_parties, v_party_name);
    v_normalized_parties := array_append(v_normalized_parties, v_normalized_party_name);
  end loop;

  if coalesce(array_length(v_clean_parties, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'SAMPLING_AT_LEAST_ONE_PARTY_REQUIRED';
  end if;

  v_resolved_follow_up_due_date := coalesce(p_follow_up_due_date, p_sampling_date + 7);
  v_notes := nullif(btrim(coalesce(p_remarks, '')), '');

  for v_idx in 1 .. array_length(v_clean_parties, 1) loop
    insert into public.parties (
      name,
      is_buyer,
      is_broker
    )
    values (
      v_clean_parties[v_idx],
      true,
      false
    )
    on conflict on constraint parties_normalized_name_key
    do update
      set
        name = excluded.name,
        is_buyer = public.parties.is_buyer or excluded.is_buyer
    returning id into v_party_id;

    v_party_ids := array_append(v_party_ids, v_party_id);
  end loop;

  insert into public.sampling_events (
    lot_id,
    sampled_on,
    remarks
  )
  values (
    p_lot_id,
    p_sampling_date,
    v_notes
  )
  returning id into v_sampling_event_id;

  for v_idx in 1 .. array_length(v_party_ids, 1) loop
    insert into public.sampling_event_parties (
      sampling_event_id,
      party_id,
      follow_up_due_date
    )
    values (
      v_sampling_event_id,
      v_party_ids[v_idx],
      v_resolved_follow_up_due_date
    );
  end loop;

  v_resulting_status := public.slice1_current_resulting_status(p_lot_id);

  insert into public.lot_actions (
    lot_id,
    action,
    resulting_status,
    payload,
    performed_by,
    performed_at
  )
  values (
    p_lot_id,
    'SAMPLING',
    v_resulting_status,
    jsonb_strip_nulls(
      jsonb_build_object(
        'parties', to_jsonb(v_clean_parties),
        'sampling_date', to_jsonb(p_sampling_date),
        'follow_up_due_date', to_jsonb(v_resolved_follow_up_due_date),
        'remarks', to_jsonb(v_notes)
      )
    ),
    coalesce(p_performed_by, auth.uid()),
    coalesce(p_performed_at, now())
  )
  returning id into v_action_id;

  update public.lots
  set updated_at = now()
  where id = p_lot_id
  returning updated_at into v_lot_updated_at;

  return query
  select
    v_action_id,
    v_sampling_event_id,
    v_resolved_follow_up_due_date,
    v_lot_updated_at;
end;
$$;

revoke all on function public.slice1_record_sampling(uuid, timestamptz, text[], date, date, text, uuid, timestamptz) from public;
revoke all on function public.slice1_record_sampling(uuid, timestamptz, text[], date, date, text, uuid, timestamptz) from anon;
revoke all on function public.slice1_record_sampling(uuid, timestamptz, text[], date, date, text, uuid, timestamptz) from authenticated;
grant execute on function public.slice1_record_sampling(uuid, timestamptz, text[], date, date, text, uuid, timestamptz) to service_role;

create or replace function public.slice1_record_negotiating(
  p_lot_id uuid,
  p_expected_lot_updated_at timestamptz,
  p_broker text,
  p_buyers text[],
  p_negotiation_date date,
  p_remarks text default null,
  p_performed_by uuid default null,
  p_performed_at timestamptz default now()
)
returns table (
  action_id uuid,
  created_deal_count integer,
  lot_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_updated_at timestamptz;
  v_action_id uuid;
  v_lot_updated_at timestamptz;
  v_created_deal_count integer := 0;
  v_notes text;
  v_broker_name text;
  v_broker_party_id uuid;
  v_buyer_name text;
  v_normalized_buyer_name text;
  v_clean_buyers text[] := '{}'::text[];
  v_normalized_buyers text[] := '{}'::text[];
  v_buyer_party_ids uuid[] := '{}'::uuid[];
  v_buyer_party_id uuid;
  v_idx integer;
  v_constraint_name text;
  v_has_terminal boolean;
  v_has_auction_sale boolean;
  v_has_blocking_private_status boolean;
  v_has_negotiating boolean;
  v_has_pending boolean;
  v_status_count integer;
  v_removed_pending boolean := false;
begin
  if p_lot_id is null then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_LOT_ID_REQUIRED';
  end if;

  if p_expected_lot_updated_at is null then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_EXPECTED_UPDATED_AT_REQUIRED';
  end if;

  if p_negotiation_date is null then
    raise exception using errcode = 'P0001', message = 'NEGOTIATION_DATE_REQUIRED';
  end if;

  v_broker_name := nullif(btrim(coalesce(p_broker, '')), '');
  if v_broker_name is null then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_BROKER_REQUIRED';
  end if;

  select l.updated_at
    into v_current_updated_at
  from public.lots l
  where l.id = p_lot_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_LOT_NOT_FOUND';
  end if;

  if v_current_updated_at is distinct from p_expected_lot_updated_at then
    raise exception using errcode = 'P0001', message = 'STALE_LOT_WRITE';
  end if;

  select
    coalesce(bool_or(las.status in ('CANCELLED'::public.lot_global_status, 'CLOSED'::public.lot_global_status)), false),
    coalesce(bool_or(las.status in ('SOLD_AUCTION'::public.lot_global_status, 'SOLD_AUCTION_PENDING_DETAILS'::public.lot_global_status)), false),
    coalesce(bool_or(las.status in ('SOLD_PENDING_DISPATCH'::public.lot_global_status, 'SOLD'::public.lot_global_status)), false),
    coalesce(bool_or(las.status = 'NEGOTIATING'::public.lot_global_status), false),
    coalesce(bool_or(las.status = 'PENDING'::public.lot_global_status), false),
    count(*)
  into
    v_has_terminal,
    v_has_auction_sale,
    v_has_blocking_private_status,
    v_has_negotiating,
    v_has_pending,
    v_status_count
  from public.lot_active_statuses las
  where las.lot_id = p_lot_id;

  if v_has_terminal then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_NOT_ALLOWED_FOR_TERMINAL_LOT';
  end if;

  if v_has_auction_sale then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_NOT_ALLOWED_AFTER_AUCTION_SALE';
  end if;

  if v_has_blocking_private_status then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_NOT_ALLOWED_FROM_CURRENT_PRIVATE_LANE';
  end if;

  foreach v_buyer_name in array coalesce(p_buyers, '{}'::text[]) loop
    v_buyer_name := btrim(coalesce(v_buyer_name, ''));
    v_normalized_buyer_name := public.normalize_party_name(v_buyer_name);

    if v_normalized_buyer_name is null then
      raise exception using errcode = 'P0001', message = 'NEGOTIATING_BUYER_REQUIRED';
    end if;

    if v_normalized_buyer_name = any(v_normalized_buyers) then
      raise exception using errcode = 'P0001', message = 'NEGOTIATING_DUPLICATE_BUYER_IN_REQUEST';
    end if;

    v_clean_buyers := array_append(v_clean_buyers, v_buyer_name);
    v_normalized_buyers := array_append(v_normalized_buyers, v_normalized_buyer_name);
  end loop;

  if coalesce(array_length(v_clean_buyers, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'NEGOTIATING_AT_LEAST_ONE_BUYER_REQUIRED';
  end if;

  v_notes := nullif(btrim(coalesce(p_remarks, '')), '');

  insert into public.parties (
    name,
    is_buyer,
    is_broker
  )
  values (
    v_broker_name,
    false,
    true
  )
  on conflict on constraint parties_normalized_name_key
  do update
    set
      name = excluded.name,
      is_broker = public.parties.is_broker or excluded.is_broker
  returning id into v_broker_party_id;

  for v_idx in 1 .. array_length(v_clean_buyers, 1) loop
    insert into public.parties (
      name,
      is_buyer,
      is_broker
    )
    values (
      v_clean_buyers[v_idx],
      true,
      false
    )
    on conflict on constraint parties_normalized_name_key
    do update
      set
        name = excluded.name,
        is_buyer = public.parties.is_buyer or excluded.is_buyer
    returning id into v_buyer_party_id;

    v_buyer_party_ids := array_append(v_buyer_party_ids, v_buyer_party_id);
  end loop;

  if exists (
    select 1
    from public.private_deals pd
    where pd.lot_id = p_lot_id
      and pd.status = 'NEGOTIATING'::public.private_deal_status
      and pd.buyer_party_id = any(v_buyer_party_ids)
  ) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_NEGOTIATING_BUYER';
  end if;

  begin
    for v_idx in 1 .. array_length(v_buyer_party_ids, 1) loop
      insert into public.private_deals (
        lot_id,
        buyer_id,
        buyer_party_id,
        broker_party_id,
        status,
        negotiation_date,
        notes
      )
      values (
        p_lot_id,
        null,
        v_buyer_party_ids[v_idx],
        v_broker_party_id,
        'NEGOTIATING'::public.private_deal_status,
        p_negotiation_date,
        v_notes
      );

      v_created_deal_count := v_created_deal_count + 1;
    end loop;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;

      if v_constraint_name in (
        'uq_private_deals_negotiating_lot_buyer_party',
        'uq_private_deals_negotiating_lot_buyer_legacy'
      ) then
        raise exception using errcode = 'P0001', message = 'DUPLICATE_NEGOTIATING_BUYER';
      end if;

      raise;
  end;

  if not v_has_negotiating then
    if v_has_pending and v_status_count = 1 then
      delete from public.lot_active_statuses
      where lot_id = p_lot_id
        and status = 'PENDING'::public.lot_global_status;

      v_removed_pending := true;
    end if;

    insert into public.lot_active_statuses (
      lot_id,
      status,
      since_at
    )
    values (
      p_lot_id,
      'NEGOTIATING'::public.lot_global_status,
      coalesce(p_performed_at, now())
    )
    on conflict (lot_id, status) do nothing;

    insert into public.lot_status_events (
      lot_id,
      status,
      source,
      effective_at,
      meta,
      created_by
    )
    values (
      p_lot_id,
      'NEGOTIATING'::public.lot_global_status,
      'MANUAL'::public.lot_status_event_source,
      coalesce(p_performed_at, now()),
      jsonb_strip_nulls(
        jsonb_build_object(
          'action', 'NEGOTIATING',
          'broker', to_jsonb(v_broker_name),
          'buyers', to_jsonb(v_clean_buyers),
          'negotiation_date', to_jsonb(p_negotiation_date),
          'remarks', to_jsonb(v_notes)
        )
      ),
      coalesce(p_performed_by, auth.uid())
    );

    if v_removed_pending then
      insert into public.lot_status_events (
        lot_id,
        status,
        source,
        effective_at,
        meta,
        created_by
      )
      values (
        p_lot_id,
        'PENDING'::public.lot_global_status,
        'MANUAL'::public.lot_status_event_source,
        coalesce(p_performed_at, now()),
        jsonb_strip_nulls(
          jsonb_build_object(
            'action', 'NEGOTIATING',
            'removed', true,
            'broker', to_jsonb(v_broker_name),
            'buyers', to_jsonb(v_clean_buyers),
            'negotiation_date', to_jsonb(p_negotiation_date),
            'remarks', to_jsonb(v_notes)
          )
        ),
        coalesce(p_performed_by, auth.uid())
      );
    end if;
  end if;

  insert into public.lot_actions (
    lot_id,
    action,
    resulting_status,
    payload,
    performed_by,
    performed_at
  )
  values (
    p_lot_id,
    'NEGOTIATING',
    'NEGOTIATING'::public.lot_global_status,
    jsonb_strip_nulls(
      jsonb_build_object(
        'broker', to_jsonb(v_broker_name),
        'buyers', to_jsonb(v_clean_buyers),
        'negotiation_date', to_jsonb(p_negotiation_date),
        'remarks', to_jsonb(v_notes)
      )
    ),
    coalesce(p_performed_by, auth.uid()),
    coalesce(p_performed_at, now())
  )
  returning id into v_action_id;

  update public.lots
  set updated_at = now()
  where id = p_lot_id
  returning updated_at into v_lot_updated_at;

  return query
  select
    v_action_id,
    v_created_deal_count,
    v_lot_updated_at;
end;
$$;

revoke all on function public.slice1_record_negotiating(uuid, timestamptz, text, text[], date, text, uuid, timestamptz) from public;
revoke all on function public.slice1_record_negotiating(uuid, timestamptz, text, text[], date, text, uuid, timestamptz) from anon;
revoke all on function public.slice1_record_negotiating(uuid, timestamptz, text, text[], date, text, uuid, timestamptz) from authenticated;
grant execute on function public.slice1_record_negotiating(uuid, timestamptz, text, text[], date, text, uuid, timestamptz) to service_role;

commit;
