create table public.scan_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  platform text not null check (platform in ('reddit', 'hackernews')),
  schedule_bucket timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'dead')),
  started_at timestamptz,
  finished_at timestamptz,
  query_count integer not null default 0 check (query_count >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  error_summary text check (
    error_summary is null or char_length(error_summary) <= 1000
  ),
  worker_id text check (
    worker_id is null or char_length(btrim(worker_id)) between 1 and 255
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_runs_platform_bucket_unique unique (platform, schedule_bucket),
  constraint scan_run_lifecycle_valid check (
    (status = 'pending' and started_at is null and finished_at is null)
    or (status = 'running' and started_at is not null and finished_at is null)
    or (
      status in ('succeeded', 'failed', 'dead')
      and started_at is not null
      and finished_at is not null
    )
  ),
  constraint scan_run_error_state check (
    error_summary is null or status in ('failed', 'dead')
  )
);

create index scan_runs_recent_idx
on public.scan_runs (platform, schedule_bucket desc);

create trigger scan_runs_set_updated_at
before update on public.scan_runs
for each row execute function public.set_updated_at();

alter table public.scan_runs enable row level security;
revoke all on public.scan_runs from anon, authenticated;
grant all on public.scan_runs to service_role;

create or replace function public.claim_scan_run(
  p_platform text,
  p_schedule_bucket timestamptz,
  p_worker_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 255 then
    raise exception 'INVALID_WORKER_ID' using errcode = '22023';
  end if;

  insert into public.scan_runs (
    platform,
    schedule_bucket,
    status,
    started_at,
    worker_id
  ) values (
    p_platform,
    p_schedule_bucket,
    'running',
    now(),
    btrim(p_worker_id)
  )
  on conflict (platform, schedule_bucket) do nothing
  returning id into claimed_id;

  return claimed_id;
end;
$$;

create or replace function public.finish_scan_run(
  p_scan_run_id uuid,
  p_status text,
  p_query_count integer,
  p_item_count integer,
  p_error_summary text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'failed', 'dead') then
    raise exception 'INVALID_TERMINAL_SCAN_STATUS' using errcode = '22023';
  end if;

  if p_query_count < 0 or p_item_count < 0 then
    raise exception 'INVALID_SCAN_COUNTS' using errcode = '22023';
  end if;

  if p_status = 'succeeded' and p_error_summary is not null then
    raise exception 'SUCCESSFUL_SCAN_HAS_ERROR' using errcode = '22023';
  end if;

  update public.scan_runs
  set status = p_status,
      finished_at = now(),
      query_count = p_query_count,
      item_count = p_item_count,
      error_summary = p_error_summary
  where id = p_scan_run_id
    and status = 'running';

  return found;
end;
$$;

revoke all on function public.claim_scan_run(text, timestamptz, text)
from public, anon, authenticated;

revoke all on function public.finish_scan_run(uuid, text, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.claim_scan_run(text, timestamptz, text)
to service_role;

grant execute on function public.finish_scan_run(uuid, text, integer, integer, text)
to service_role;

comment on table public.scan_runs
is 'Observable, idempotent platform scan executions keyed by UTC schedule bucket.';

comment on function public.claim_scan_run(text, timestamptz, text)
is 'Atomically claims a platform schedule bucket; duplicate claims return null.';