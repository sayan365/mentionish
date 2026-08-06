-- Correct the reservation INSERT target while preserving the distinct PL/pgSQL variable name.
create or replace function public.reserve_classification(
  p_opportunity_id uuid,
  p_prompt_version text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_row public.opportunities%rowtype;
  product_row public.products%rowtype;
  post_row public.scanned_posts%rowtype;
  period_id uuid;
  classification_limit integer;
  used_quantity integer;
  logical_operation_key text;
  existing_event public.usage_events%rowtype;
  event_id uuid;
  event_attempt integer;
  new_lease_token uuid := extensions.gen_random_uuid();
  bounded_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
begin
  if char_length(btrim(p_prompt_version)) not between 1 and 100 then
    raise exception 'INVALID_PROMPT_VERSION' using errcode = '22023';
  end if;

  select * into opportunity_row
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if opportunity_row.status <> 'unclassified' then
    return jsonb_build_object('status', 'already_completed');
  end if;

  select * into product_row
  from public.products
  where id = opportunity_row.product_id
    and is_active
    and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'not_eligible');
  end if;

  select * into post_row
  from public.scanned_posts
  where id = opportunity_row.scanned_post_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  logical_operation_key := 'classify:' || opportunity_row.product_id::text || ':' || opportunity_row.scanned_post_id::text || ':v' || btrim(p_prompt_version);

  select * into existing_event
  from public.usage_events
  where usage_events.operation_key = logical_operation_key
  for update;

  if found then
    if existing_event.status = 'consumed' then
      return jsonb_build_object('status', 'already_completed');
    end if;
    if existing_event.status = 'reserved' and existing_event.lease_expires_at > now() then
      return jsonb_build_object('status', 'busy');
    end if;
    if existing_event.status = 'reserved' then
      update public.usage_events
      set status = 'released',
          lease_token = null,
          lease_expires_at = null,
          released_at = now()
      where id = existing_event.id;
    end if;
  end if;

  select periods.id, entitlements.classification_limit
  into period_id, classification_limit
  from public.user_entitlement_periods as periods
  join public.plan_entitlements as entitlements
    on entitlements.id = periods.plan_entitlement_id
  where periods.user_id = opportunity_row.user_id
    and periods.status = 'active'
    and periods.starts_at <= now()
    and (periods.ends_at is null or periods.ends_at > now())
    and entitlements.effective_at <= now()
    and (entitlements.retired_at is null or entitlements.retired_at > now())
  order by periods.starts_at desc
  limit 1
  for update of periods;

  if period_id is null then
    return jsonb_build_object('status', 'no_entitlement');
  end if;

  select coalesce(sum(quantity), 0)::integer into used_quantity
  from public.usage_events
  where entitlement_period_id = period_id
    and usage_type = 'classification'
    and status in ('reserved', 'consumed');

  if used_quantity >= classification_limit then
    return jsonb_build_object('status', 'quota_exhausted');
  end if;

  if existing_event.id is null then
    insert into public.usage_events (
      user_id,
      entitlement_period_id,
      usage_type,
      quantity,
      operation_key,
      status,
      opportunity_id,
      lease_token,
      lease_expires_at
    ) values (
      opportunity_row.user_id,
      period_id,
      'classification',
      1,
      logical_operation_key,
      'reserved',
      opportunity_row.id,
      new_lease_token,
      now() + make_interval(secs => bounded_lease_seconds)
    )
    returning id, attempt_count into event_id, event_attempt;
  else
    update public.usage_events
    set entitlement_period_id = period_id,
        status = 'reserved',
        lease_token = new_lease_token,
        lease_expires_at = now() + make_interval(secs => bounded_lease_seconds),
        attempt_count = attempt_count + 1,
        reserved_at = now(),
        consumed_at = null,
        released_at = null,
        ai_call_id = null
    where id = existing_event.id
    returning id, attempt_count into event_id, event_attempt;
  end if;

  return jsonb_build_object(
    'status', 'claimed',
    'usage_event_id', event_id,
    'lease_token', new_lease_token,
    'attempt_number', event_attempt,
    'target', jsonb_build_object(
      'opportunity_id', opportunity_row.id,
      'user_id', opportunity_row.user_id,
      'product_id', product_row.id,
      'product_name', product_row.name,
      'product_description', product_row.description,
      'platform', post_row.platform,
      'title', post_row.title,
      'body', post_row.body
    )
  );
end;
$$;
