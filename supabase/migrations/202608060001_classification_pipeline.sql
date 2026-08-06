create table public.plan_entitlements (
  id text primary key,
  plan text not null check (plan in ('free', 'lifetime', 'monthly')),
  version integer not null check (version > 0),
  classification_limit integer not null check (classification_limit >= 0),
  draft_limit integer not null check (draft_limit >= 0),
  active_product_limit integer not null check (active_product_limit > 0),
  reset_cadence text not null check (reset_cadence in ('never', 'monthly')),
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint plan_entitlements_plan_version_unique unique (plan, version),
  constraint plan_entitlements_window_valid check (
    retired_at is null or retired_at > effective_at
  )
);

insert into public.plan_entitlements (
  id,
  plan,
  version,
  classification_limit,
  draft_limit,
  active_product_limit,
  reset_cadence,
  effective_at
) values
  ('free-v1', 'free', 1, 50, 5, 1, 'never', '2026-08-01T00:00:00Z'),
  ('founder-lifetime-v1', 'lifetime', 1, 3600, 100, 1, 'never', '2026-08-01T00:00:00Z'),
  ('growth-monthly-v1', 'monthly', 1, 1500, 100, 3, 'monthly', '2026-08-01T00:00:00Z');

create table public.user_entitlement_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  plan_entitlement_id text not null references public.plan_entitlements(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null check (status in ('active', 'inactive', 'refunded')),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlement_period_window_valid check (
    ends_at is null or ends_at > starts_at
  ),
  constraint user_entitlement_period_identity_unique unique (
    user_id,
    plan_entitlement_id,
    starts_at
  )
);

create index user_entitlement_periods_active_idx
on public.user_entitlement_periods (user_id, starts_at desc)
where status = 'active';

create trigger user_entitlement_periods_set_updated_at
before update on public.user_entitlement_periods
for each row execute function public.set_updated_at();

insert into public.user_entitlement_periods (
  user_id,
  plan_entitlement_id,
  starts_at,
  ends_at,
  status
)
select
  profiles.id,
  case profiles.plan
    when 'lifetime' then 'founder-lifetime-v1'
    when 'monthly' then 'growth-monthly-v1'
    else 'free-v1'
  end,
  coalesce(profiles.trial_started_at, profiles.created_at),
  case
    when profiles.plan = 'free' then profiles.trial_ends_at
    when profiles.plan = 'monthly' then coalesce(profiles.trial_ends_at, profiles.created_at + interval '1 month')
    else null
  end,
  case when profiles.entitlement_status = 'active' then 'active' else 'inactive' end
from public.user_profiles as profiles
where profiles.trial_started_at is not null or profiles.plan <> 'free'
on conflict (user_id, plan_entitlement_id, starts_at) do nothing;

create table public.usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  entitlement_period_id uuid not null references public.user_entitlement_periods(id),
  usage_type text not null check (usage_type in ('classification', 'draft')),
  quantity integer not null default 1 check (quantity > 0),
  operation_key text not null unique check (char_length(operation_key) between 1 and 500),
  status text not null check (status in ('reserved', 'consumed', 'released')),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  lease_token uuid,
  lease_expires_at timestamptz,
  ai_call_id uuid,
  attempt_count integer not null default 1 check (attempt_count > 0),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_event_lease_state check (
    (status = 'reserved' and lease_token is not null and lease_expires_at is not null and consumed_at is null and released_at is null)
    or (status = 'consumed' and lease_token is null and lease_expires_at is null and consumed_at is not null and released_at is null)
    or (status = 'released' and lease_token is null and lease_expires_at is null and consumed_at is null and released_at is not null)
  )
);

create index usage_events_period_type_status_idx
on public.usage_events (entitlement_period_id, usage_type, status);

create index usage_events_user_created_idx
on public.usage_events (user_id, created_at desc);

create trigger usage_events_set_updated_at
before update on public.usage_events
for each row execute function public.set_updated_at();

create table public.ai_calls (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  usage_event_id uuid references public.usage_events(id) on delete set null,
  operation_type text not null check (operation_type in ('classification', 'draft')),
  provider text not null,
  requested_model text not null,
  returned_model text,
  prompt_version text not null,
  reasoning_effort text not null,
  output_token_cap integer not null check (output_token_cap > 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  provider_response_id text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  status text not null check (status in ('succeeded', 'failed')),
  error_class text,
  attempt_number integer not null check (attempt_number > 0),
  estimated_cost_usd numeric(12, 8),
  created_at timestamptz not null default now(),
  constraint ai_call_error_state check (
    (status = 'succeeded' and error_class is null)
    or status = 'failed'
  )
);

create index ai_calls_user_created_idx
on public.ai_calls (user_id, created_at desc);

create unique index ai_calls_provider_response_unique
on public.ai_calls (provider, provider_response_id)
where provider_response_id is not null and provider_response_id <> 'unknown';

alter table public.usage_events
add constraint usage_events_ai_call_fk
foreign key (ai_call_id) references public.ai_calls(id) on delete set null;

alter table public.plan_entitlements enable row level security;
alter table public.user_entitlement_periods enable row level security;
alter table public.usage_events enable row level security;
alter table public.ai_calls enable row level security;

create policy "plan_entitlements_select_all"
on public.plan_entitlements for select to authenticated
using (true);

create policy "entitlement_periods_select_own"
on public.user_entitlement_periods for select to authenticated
using ((select auth.uid()) = user_id);

create policy "usage_events_select_own"
on public.usage_events for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_calls_select_own"
on public.ai_calls for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.plan_entitlements from anon, authenticated;
revoke all on public.user_entitlement_periods from anon, authenticated;
revoke all on public.usage_events from anon, authenticated;
revoke all on public.ai_calls from anon, authenticated;
grant select on public.plan_entitlements to authenticated;
grant select on public.user_entitlement_periods to authenticated;
grant select on public.usage_events to authenticated;
grant select on public.ai_calls to authenticated;
grant all on public.plan_entitlements to service_role;
grant all on public.user_entitlement_periods to service_role;
grant all on public.usage_events to service_role;
grant all on public.ai_calls to service_role;

create or replace function public.activate_verified_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_at timestamptz;
  activated_at timestamptz := now();
begin
  if not new.is_active or new.deleted_at is not null then
    return new;
  end if;

  select email_confirmed_at into verified_at from auth.users where id = new.user_id;
  if verified_at is null then
    raise exception 'A verified email is required before activating a product'
      using errcode = '23514';
  end if;

  update public.user_profiles
  set entitlement_status = 'active',
      trial_started_at = activated_at,
      trial_ends_at = activated_at + interval '14 days'
  where id = new.user_id and trial_started_at is null and plan = 'free';

  if found then
    insert into public.user_entitlement_periods (
      user_id,
      plan_entitlement_id,
      starts_at,
      ends_at,
      status
    ) values (
      new.user_id,
      'free-v1',
      activated_at,
      activated_at + interval '14 days',
      'active'
    ) on conflict (user_id, plan_entitlement_id, starts_at) do nothing;
  end if;
  return new;
end;
$$;

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
      logical_operation_key,
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

create or replace function public.complete_classification(
  p_usage_event_id uuid,
  p_lease_token uuid,
  p_ai_call_id uuid,
  p_intent_score integer,
  p_reasoning text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.usage_events%rowtype;
begin
  if p_intent_score is null
    or p_reasoning is null
    or p_intent_score not between 0 and 100
    or char_length(btrim(p_reasoning)) not between 1 and 500 then
    raise exception 'INVALID_CLASSIFICATION_RESULT' using errcode = '22023';
  end if;

  select * into usage_row
  from public.usage_events
  where id = p_usage_event_id
  for update;

  if p_lease_token is null
    or not found
    or usage_row.status <> 'reserved'
    or usage_row.lease_token <> p_lease_token
    or usage_row.lease_expires_at <= now() then
    return false;
  end if;

  update public.opportunities
  set intent_score = p_intent_score,
      reasoning = btrim(p_reasoning),
      status = case when p_intent_score >= 60 then 'new' else 'skipped' end,
      classified_at = now(),
      skipped_reason = case when p_intent_score < 60 then 'Below qualification threshold.' else null end
  where id = usage_row.opportunity_id
    and status = 'unclassified';

  if not found then
    return false;
  end if;

  update public.usage_events
  set status = 'consumed',
      lease_token = null,
      lease_expires_at = null,
      ai_call_id = p_ai_call_id,
      consumed_at = now(),
      released_at = null
  where id = usage_row.id;

  return true;
end;
$$;

create or replace function public.release_classification(
  p_usage_event_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usage_events
  set status = 'released',
      lease_token = null,
      lease_expires_at = null,
      released_at = now()
  where id = p_usage_event_id
    and status = 'reserved'
    and lease_token = p_lease_token;
  return found;
end;
$$;

revoke all on function public.reserve_classification(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_classification(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.release_classification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_classification(uuid, text, integer) to service_role;
grant execute on function public.complete_classification(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function public.release_classification(uuid, uuid) to service_role;

comment on table public.usage_events
is 'Auditable quota reservations and consumption with one unique logical operation key.';
comment on table public.ai_calls
is 'Reduced AI provider metadata only; prompts and raw responses are intentionally excluded.';
comment on function public.reserve_classification(uuid, text, integer)
is 'Atomically checks entitlement/quota and leases one unique product/post classification.';
comment on function public.complete_classification(uuid, uuid, uuid, integer, text)
is 'Atomically consumes reserved usage and transitions an unclassified opportunity.';