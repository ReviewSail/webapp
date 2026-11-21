begin;
-- Supports deterministic newest-first reads and keyset navigation, including
-- feedback beyond the old browser-wide 2,000-row ceiling.
create index guest_feedback_created_id_idx on public.guest_feedback(created_at desc, id desc);

create function public.get_inbox_page_v1(
  p_known_version text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_account uuid;
  v_rows jsonb;
  v_more boolean;
  v_version text;
begin
  v_account := public.get_current_account_id();
  if auth.uid() is null or v_account is null then
    raise exception 'Account access unavailable' using errcode = '42501';
  end if;
  if (p_before_created is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields are required' using errcode = '22023';
  end if;

  -- One statement/snapshot: at most 51 scoped rows, not an aggregate over the
  -- complete history. Explicit ownership is additional to existing table RLS.
  with candidates as materialized (
    select f.id, f.request_id, f.location_id, f.kind, f.star_rating,
      f.feedback_text, f.guest_name, f.guest_email, f.is_read, f.created_at,
      l.name as location_name
    from public.guest_feedback f join public.locations l on l.id = f.location_id
    where l.account_id = v_account
      and (p_before_created is null or (f.created_at, f.id) < (p_before_created, p_before_id))
    order by f.created_at desc, f.id desc limit 51
  ), page as (
    select c.id, c.request_id, c.location_id, c.kind, c.star_rating,
      c.feedback_text, c.guest_name, c.guest_email, c.is_read, c.created_at, c.location_name
    from candidates c order by c.created_at desc, c.id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'requestId', p.request_id, 'locationId', p.location_id,
      'locationName', p.location_name, 'kind', p.kind, 'starRating', p.star_rating,
      'feedbackText', p.feedback_text,
      'guestName', coalesce(nullif(btrim(p.guest_name), ''),
        nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'Anonymous'),
      'guestEmail', p.guest_email, 'isRead', p.is_read, 'createdAt', p.created_at
    ) order by p.created_at desc, p.id desc), '[]'::jsonb),
    (select count(*) > 50 from candidates)
  into v_rows, v_more
  from page p
  left join public.review_requests r on r.id = p.request_id
  left join public.orders o on o.id = r.order_id and o.location_id = p.location_id
  left join public.customers c on c.id = o.customer_id and c.account_id = v_account;

  -- This is a cache validator, not an authorization credential. Derive it from
  -- exactly the displayed page; edits/deletes/read changes also invalidate it.
  v_version := encode(sha256(convert_to(jsonb_build_array(v_account, v_rows, v_more)::text, 'UTF8')), 'hex');
  return jsonb_build_object('accountId', v_account, 'version', v_version,
    'hasMore', v_more, 'rows', case when p_known_version = v_version then null else v_rows end);
end;
$$;
revoke all on function public.get_inbox_page_v1(text, timestamptz, uuid) from public, anon;
grant execute on function public.get_inbox_page_v1(text, timestamptz, uuid) to authenticated;
commit;
