-- Each row saves atomically. RLS remains active: this is NOT a privileged RPC.
begin;
alter table public.orders add column import_key text;
alter table public.orders add column external_reference text;
create unique index orders_location_import_key on public.orders(location_id, import_key)
  where import_key is not null;
create index orders_import_calendar_lookup on public.orders
  (location_id, ((checkout_date at time zone 'UTC')::date));

create function public.import_guest_batch(p_location_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_account uuid;
  v_row jsonb;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_first text; v_last text; v_email text; v_phone text; v_contact text;
  v_source text; v_ref text; v_key text;
  v_status text; v_blocked_refs text[];
  v_checkout date; v_checkin date;
  v_customer uuid; v_order uuid; v_existing record;
  v_existing_email text; v_existing_phone text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select l.account_id into v_account from public.locations l
    join public.users u on u.account_id = l.account_id
    where l.id = p_location_id and u.id = auth.uid();
  if v_account is null then
    raise exception 'Property is not accessible' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 or octet_length(p_rows::text) > 524288 then
    raise exception 'Import batch is too large' using errcode = '22023';
  end if;

  -- Serialize imports for this property, including checks against legacy stays.
  -- Short, bounded transaction; no HTTP calls or provider side effects here.
  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text, 7281));
  -- Independently validate supplied statuses, including contradictory copies
  -- of a reference in this batch. The client checks across all batches too.
  select coalesce(array_agg(jsonb_build_array(coalesce(nullif(r->>'source', ''), 'direct'), btrim(r->>'externalReference'))::text), '{}'::text[])
    into v_blocked_refs from jsonb_array_elements(p_rows) r
    where nullif(btrim(r->>'externalReference'), '') is not null
      and r->>'reservationStatus' is not null
      and regexp_replace(lower(btrim(r->>'reservationStatus')), '[[:space:]_-]+', '', 'g')
        not in ('confirmed', 'ok', 'booked', 'accepted', 'completed', 'checkedin', 'checkedout');
  for v_row in select value from jsonb_array_elements(p_rows) loop
    begin
      if jsonb_typeof(v_row) <> 'object' then raise invalid_parameter_value; end if;
      v_first := btrim(coalesce(v_row->>'firstName', ''));
      v_last := btrim(coalesce(v_row->>'lastName', ''));
      v_email := nullif(lower(btrim(v_row->>'email')), '');
      v_phone := nullif(regexp_replace(v_row->>'phone', '[^0-9]', '', 'g'), '');
      v_ref := nullif(btrim(v_row->>'externalReference'), '');
      v_source := coalesce(nullif(v_row->>'source', ''), 'direct');
      v_status := regexp_replace(lower(btrim(v_row->>'reservationStatus')), '[[:space:]_-]+', '', 'g');
      if (v_status is not null and v_status not in ('confirmed', 'ok', 'booked', 'accepted', 'completed', 'checkedin', 'checkedout'))
        or (v_ref is not null and jsonb_build_array(v_source, v_ref)::text = any(v_blocked_refs)) then
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed',
          'reason', 'Booking status is ineligible, unrecognized or conflicting. Nothing was created; previously imported stays were not changed.'));
        v_index := v_index + 1;
        continue;
      end if;
      if v_first = '' and v_last = '' then raise invalid_parameter_value; end if;
      if length(v_first) > 200 or length(v_last) > 200 or length(v_email) > 320
        or length(v_phone) > 15 or length(v_ref) > 200 then raise invalid_parameter_value; end if;
      if v_email is null and v_phone is null then raise invalid_parameter_value; end if;
      if (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
        or (v_phone is not null and length(v_phone) < 7) then raise invalid_parameter_value; end if;
      if v_source not in ('direct', 'airbnb', 'booking_com', 'other') then raise invalid_parameter_value; end if;
      if coalesce(v_row->>'checkoutDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or (nullif(v_row->>'checkinDate', '') is not null and (v_row->>'checkinDate') !~ '^\d{4}-\d{2}-\d{2}$')
        then raise invalid_parameter_value; end if;
      v_checkout := (v_row->>'checkoutDate')::date;
      v_checkin := nullif(v_row->>'checkinDate', '')::date;
      if v_checkin > v_checkout then raise invalid_parameter_value; end if;
      v_contact := coalesce(v_email, v_phone);
      v_key := case when v_ref is not null
        then jsonb_build_array('reference', v_source, v_ref)::text
        else jsonb_build_array('contact', v_contact, v_checkout)::text end;

      -- EGRESS-COST: low — database-side lookup, one outcome per input row.
      -- No browser-wide history fetch or 2,000-row deduplication ceiling.
      select o.id, o.checkout_date, o.checkin_date, o.customer_id, o.external_reference into v_existing from public.orders o
        where o.location_id = p_location_id and o.import_key = v_key;
      if not found then
        select o.id, o.checkout_date, o.checkin_date, o.customer_id, o.external_reference into v_existing from public.orders o
          join public.customers c on c.id = o.customer_id
          where o.location_id = p_location_id and c.account_id = v_account
            and (o.checkout_date at time zone 'UTC')::date = v_checkout
            and coalesce(nullif(lower(btrim(c.email)), ''), nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '')) = v_contact
            and (v_ref is null or o.external_reference is null)
          order by o.id limit 1;
      end if;
      if v_existing.id is not null then
        select nullif(lower(btrim(c.email)), ''), nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '')
          into v_existing_email, v_existing_phone from public.customers c where c.id = v_existing.customer_id;
        if (v_existing.checkout_date at time zone 'UTC')::date is distinct from v_checkout
          or (v_existing.checkin_date at time zone 'UTC')::date is distinct from v_checkin
          or v_existing_email is distinct from v_email or v_existing_phone is distinct from v_phone then
          v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed',
            'reason', 'Existing stay has different dates or contact details. Review it manually; nothing was changed.'));
        else
          -- Attach a newly supplied reference to an unchanged legacy stay only.
          if v_ref is not null and v_existing.external_reference is null then
            update public.orders set import_key = v_key, external_reference = v_ref where id = v_existing.id;
          end if;
          v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'duplicate'));
        end if;
      else
        insert into public.customers(account_id, first_name, last_name, email, phone)
          values (v_account, v_first, v_last, v_email, nullif(btrim(v_row->>'phone'), '')) returning id into v_customer;
        insert into public.orders(location_id, customer_id, checkout_date, checkin_date, source, status, import_key, external_reference)
          values (p_location_id, v_customer, v_checkout::timestamp at time zone 'UTC', v_checkin::timestamp at time zone 'UTC',
            v_source, 'completed', v_key, v_ref) returning id into v_order;
        -- Existing suppression trigger still applies. No contact list is exposed.
        insert into public.review_requests(order_id, status) values (v_order, 'pending');
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'imported'));
      end if;
    exception
      when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed', 'reason', 'Invalid name, contact, source, reference or stay dates.'));
      when others then
        -- This block rolls back ALL writes for this row, not earlier rows.
        -- Never return raw SQL errors containing guest data.
        v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index, 'status', 'failed', 'reason', 'Could not save this stay. No partial guest or request was kept for this row.'));
    end;
    v_index := v_index + 1;
  end loop;
  return v_results;
end;
$$;
revoke all on function public.import_guest_batch(uuid, jsonb) from public, anon;
grant execute on function public.import_guest_batch(uuid, jsonb) to authenticated;
commit;
