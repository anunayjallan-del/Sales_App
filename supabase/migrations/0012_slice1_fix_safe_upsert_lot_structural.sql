begin;

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

commit;
