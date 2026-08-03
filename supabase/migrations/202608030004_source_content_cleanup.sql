alter table public.scanned_posts
add column source_checked_at timestamptz not null default now();

create index scanned_posts_revalidation_idx
on public.scanned_posts (platform, source_checked_at asc);

create or replace function public.touch_scanned_post_source_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.source_checked_at = now();
  return new;
end;
$$;

create trigger scanned_posts_touch_source_check
before update of subreddit, title, body, author, url,
  source_created_at, source_updated_at, raw_metadata
on public.scanned_posts
for each row execute function public.touch_scanned_post_source_check();

create or replace function public.purge_scanned_posts(
  p_platform text,
  p_external_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if p_platform not in ('reddit', 'hackernews') then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_external_ids), 0) not between 1 and 100 then
    raise exception 'INVALID_PURGE_BATCH' using errcode = '22023';
  end if;

  delete from public.scanned_posts
  where platform = p_platform
    and external_id = any(p_external_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.reconcile_reddit_posts(
  p_requested_external_ids text[],
  p_live_external_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  checked_count integer;
begin
  if coalesce(cardinality(p_requested_external_ids), 0) not between 1 and 100 then
    raise exception 'INVALID_REVALIDATION_BATCH' using errcode = '22023';
  end if;

  if not coalesce(p_live_external_ids, '{}'::text[])
    <@ p_requested_external_ids then
    raise exception 'INVALID_REVALIDATION_RESULT' using errcode = '22023';
  end if;

  update public.scanned_posts
  set source_checked_at = now()
  where platform = 'reddit'
    and external_id = any(coalesce(p_live_external_ids, '{}'::text[]));

  get diagnostics checked_count = row_count;

  delete from public.scanned_posts
  where platform = 'reddit'
    and external_id = any(p_requested_external_ids)
    and not (
      external_id = any(coalesce(p_live_external_ids, '{}'::text[]))
    );

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'checked_count', checked_count,
    'deleted_count', deleted_count
  );
end;
$$;

revoke all on function public.purge_scanned_posts(text, text[])
from public, anon, authenticated;

revoke all on function public.reconcile_reddit_posts(text[], text[])
from public, anon, authenticated;

grant execute on function public.purge_scanned_posts(text, text[])
to service_role;

grant execute on function public.reconcile_reddit_posts(text[], text[])
to service_role;

comment on column public.scanned_posts.source_checked_at
is 'Last time the source item was fetched or revalidated for deletion compliance.';

comment on function public.purge_scanned_posts(text, text[])
is 'Service-only purge for source-deleted items; opportunity rows cascade.';

comment on function public.reconcile_reddit_posts(text[], text[])
is 'Atomically marks live Reddit posts checked and purges missing/deleted posts.';
