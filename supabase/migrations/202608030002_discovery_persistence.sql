create table public.scanned_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  platform text not null check (platform in ('reddit', 'hackernews')),
  external_id text not null check (char_length(btrim(external_id)) between 1 and 255),
  subreddit text check (
    subreddit is null
    or (
      char_length(subreddit) between 1 and 100
      and subreddit = lower(btrim(subreddit))
      and subreddit !~ '^r/'
    )
  ),
  title text not null default '',
  body text not null default '',
  author text check (author is null or char_length(btrim(author)) between 1 and 255),
  url text not null check (char_length(btrim(url)) > 0),
  source_created_at timestamptz,
  scanned_at timestamptz not null default now(),
  source_updated_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_metadata) = 'object'),
  constraint scanned_posts_platform_external_unique unique (platform, external_id),
  constraint hackernews_has_no_subreddit check (
    platform = 'reddit' or subreddit is null
  )
);

create index scanned_posts_platform_created_idx
on public.scanned_posts (platform, source_created_at desc);

create index scanned_posts_reddit_subreddit_idx
on public.scanned_posts (subreddit)
where platform = 'reddit';

create table public.opportunities (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  scanned_post_id uuid not null references public.scanned_posts(id) on delete cascade,
  intent_score integer check (intent_score between 0 and 100),
  reasoning text,
  status text not null default 'unclassified'
    check (status in ('unclassified', 'new', 'drafted', 'posted', 'skipped')),
  classified_at timestamptz,
  posted_at timestamptz,
  skipped_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_product_post_unique unique (product_id, scanned_post_id),
  constraint opportunity_classification_state check (
    (
      status = 'unclassified'
      and intent_score is null
      and reasoning is null
      and classified_at is null
    )
    or (
      status <> 'unclassified'
      and intent_score is not null
      and reasoning is not null
      and classified_at is not null
    )
  ),
  constraint opportunity_posted_state check (
    (status = 'posted' and posted_at is not null)
    or (status <> 'posted' and posted_at is null)
  ),
  constraint opportunity_skipped_reason_state check (
    skipped_reason is null or status = 'skipped'
  )
);

create index opportunities_owner_feed_idx
on public.opportunities (user_id, status, intent_score desc, created_at desc);

create index opportunities_product_score_idx
on public.opportunities (product_id, intent_score desc);

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

create or replace function public.enforce_opportunity_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_owner uuid;
begin
  if tg_op = 'UPDATE' and (
    new.user_id <> old.user_id
    or new.product_id <> old.product_id
    or new.scanned_post_id <> old.scanned_post_id
  ) then
    raise exception 'OPPORTUNITY_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;

  select user_id into product_owner
  from public.products
  where id = new.product_id
    and is_active
    and deleted_at is null;

  if product_owner is null then
    raise exception 'PRODUCT_NOT_ACTIVE' using errcode = '23503';
  end if;

  if new.user_id <> product_owner then
    raise exception 'OPPORTUNITY_OWNER_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger opportunities_enforce_ownership
before insert or update of user_id, product_id, scanned_post_id
on public.opportunities
for each row execute function public.enforce_opportunity_ownership();

alter table public.scanned_posts enable row level security;
alter table public.opportunities enable row level security;

create policy "opportunities_select_own"
on public.opportunities for select to authenticated
using ((select auth.uid()) = user_id);

create policy "scanned_posts_select_reachable"
on public.scanned_posts for select to authenticated
using (
  exists (
    select 1
    from public.opportunities
    where opportunities.scanned_post_id = scanned_posts.id
      and opportunities.user_id = (select auth.uid())
  )
);

revoke all on public.scanned_posts from anon, authenticated;
revoke all on public.opportunities from anon, authenticated;
grant select on public.scanned_posts to authenticated;
grant select on public.opportunities to authenticated;
grant all on public.scanned_posts to service_role;
grant all on public.opportunities to service_role;

create or replace function public.persist_scanned_post_matches(
  p_platform text,
  p_external_id text,
  p_subreddit text,
  p_title text,
  p_body text,
  p_author text,
  p_url text,
  p_source_created_at timestamptz,
  p_source_updated_at timestamptz,
  p_raw_metadata jsonb,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  persisted_post_id uuid;
  persisted_opportunity_ids jsonb;
begin
  if cardinality(p_product_ids) is null
    or cardinality(p_product_ids) not between 1 and 100 then
    raise exception 'INVALID_PRODUCT_MATCHES' using errcode = '22023';
  end if;

  insert into public.scanned_posts (
    platform,
    external_id,
    subreddit,
    title,
    body,
    author,
    url,
    source_created_at,
    source_updated_at,
    raw_metadata
  ) values (
    p_platform,
    btrim(p_external_id),
    case when p_subreddit is null then null else lower(btrim(p_subreddit)) end,
    coalesce(p_title, ''),
    coalesce(p_body, ''),
    nullif(btrim(p_author), ''),
    btrim(p_url),
    p_source_created_at,
    p_source_updated_at,
    coalesce(p_raw_metadata, '{}'::jsonb)
  )
  on conflict (platform, external_id) do update
  set subreddit = excluded.subreddit,
      title = excluded.title,
      body = excluded.body,
      author = excluded.author,
      url = excluded.url,
      source_created_at = coalesce(
        excluded.source_created_at,
        scanned_posts.source_created_at
      ),
      source_updated_at = excluded.source_updated_at,
      scanned_at = now(),
      raw_metadata = excluded.raw_metadata
  returning id into persisted_post_id;

  insert into public.opportunities (
    user_id,
    product_id,
    scanned_post_id
  )
  select
    products.user_id,
    products.id,
    persisted_post_id
  from public.products
  where products.id = any(p_product_ids)
    and products.is_active
    and products.deleted_at is null
  on conflict (product_id, scanned_post_id) do nothing;

  select coalesce(jsonb_agg(opportunities.id order by opportunities.product_id), '[]'::jsonb)
  into persisted_opportunity_ids
  from public.opportunities
  where opportunities.scanned_post_id = persisted_post_id
    and opportunities.product_id = any(p_product_ids);

  return jsonb_build_object(
    'scanned_post_id', persisted_post_id,
    'opportunity_ids', persisted_opportunity_ids
  );
end;
$$;

revoke all on function public.persist_scanned_post_matches(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  uuid[]
) from public, anon, authenticated;

grant execute on function public.persist_scanned_post_matches(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  uuid[]
) to service_role;

comment on table public.scanned_posts
is 'Globally deduplicated public platform content with no private product context.';

comment on table public.opportunities
is 'Private product/post matches with explicit denormalized ownership.';

comment on function public.persist_scanned_post_matches(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  uuid[]
)
is 'Atomically upserts one shared platform item and idempotent active-product matches.';