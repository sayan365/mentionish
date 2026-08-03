begin;
select plan(35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', now(), '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', now(), '{}', '{}', now(), now());

select is((select count(*)::integer from public.user_profiles where id in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
)), 2, 'auth users receive profiles');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is((select count(*)::integer from public.user_profiles), 1, 'user one sees only their profile');

insert into public.products (id, user_id, name, description, keywords)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'One product', 'Owned by user one', array['one']);

select is((select count(*)::integer from public.products), 1, 'user one sees their product');
select is((select entitlement_status from public.user_profiles), 'active', 'first product activates verified trial');
select ok((select trial_ends_at = trial_started_at + interval '14 days' from public.user_profiles), 'trial lasts 14 days');

select throws_ok(
  $$insert into public.products (user_id, name, description, keywords) values ('22222222-2222-4222-8222-222222222222', 'Stolen', 'Should fail', array['bad'])$$,
  '42501',
  'new row violates row-level security policy for table "products"',
  'user one cannot insert for user two'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.products), 0, 'user two cannot see user one product');

update public.products set name = 'Tampered' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select count(*)::integer from public.products), 0, 'user two cannot update user one product');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select name from public.products where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'One product', 'cross-user update changed nothing');

select throws_ok(
  $$insert into public.products (user_id, name, description, keywords) values ('11111111-1111-4111-8111-111111111111', 'Second active', 'Over the free limit', array['second'])$$,
  'P0001',
  'PRODUCT_LIMIT_REACHED',
  'free users cannot create a second active product'
);

select lives_ok(
  $$insert into public.products (user_id, name, description, keywords, is_active) values ('11111111-1111-4111-8111-111111111111', 'Inactive', 'Allowed while inactive', array['inactive'], false)$$,
  'inactive products do not consume the active product limit'
);

select throws_ok(
  $$insert into public.products (user_id, name, description, keywords, is_active) values ('11111111-1111-4111-8111-111111111111', 'Bad keywords', 'Must be normalized', array['Not Normalized'], false)$$,
  '23514',
  'new row for relation "products" violates check constraint "products_keywords_check"',
  'database rejects non-normalized keywords'
);
reset role;

insert into public.products (id, user_id, name, description, keywords)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '22222222-2222-4222-8222-222222222222',
  'Two product',
  'Owned by user two',
  array['shared keyword']
);

select lives_ok(
  $$select public.persist_scanned_post_matches(
    'hackernews',
    '424242',
    null,
    'Shared keyword discussion',
    'Looking for a useful workflow.',
    'hn-user',
    'https://news.ycombinator.com/item?id=424242',
    '2026-08-03T00:00:00Z',
    null,
    '{"fixture":true}'::jsonb,
    array[
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    ]::uuid[]
  )$$,
  'shared post and product matches persist atomically'
);

select is(
  (select count(*)::integer from public.scanned_posts where platform = 'hackernews' and external_id = '424242'),
  1,
  'shared post is stored once'
);

select is(
  (select count(*)::integer from public.opportunities),
  2,
  'one shared post creates one opportunity per product'
);

select lives_ok(
  $$select public.persist_scanned_post_matches(
    'hackernews',
    '424242',
    null,
    'Shared keyword discussion',
    'Looking for a useful workflow.',
    'hn-user',
    'https://news.ycombinator.com/item?id=424242',
    '2026-08-03T00:00:00Z',
    null,
    '{"fixture":true}'::jsonb,
    array[
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    ]::uuid[]
  )$$,
  'reprocessing the same matches is idempotent'
);

select is(
  (select count(*)::integer from public.scanned_posts where platform = 'hackernews' and external_id = '424242'),
  1,
  'reprocessing does not duplicate the shared post'
);

select is(
  (select count(*)::integer from public.opportunities),
  2,
  'reprocessing does not duplicate opportunities'
);

select lives_ok(
  $$select public.persist_scanned_post_matches(
    'reddit',
    'reddit-cleanup-fixture',
    'saas',
    'Shared keyword on Reddit',
    'A live fixture for deletion checks.',
    'reddit-user',
    'https://www.reddit.com/r/saas/comments/reddit-cleanup-fixture/test/',
    '2026-08-03T01:00:00Z',
    null,
    '{"fixture":true}'::jsonb,
    array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[]
  )$$,
  'Reddit cleanup fixture persists'
);

select ok(
  (
    select source_checked_at is not null
    from public.scanned_posts
    where platform = 'reddit'
      and external_id = 'reddit-cleanup-fixture'
  ),
  'persisted Reddit content records its source check'
);

select is(
  (
    public.reconcile_reddit_posts(
      array['reddit-cleanup-fixture'],
      array['reddit-cleanup-fixture']
    )->>'checked_count'
  )::integer,
  1,
  'live Reddit content is marked revalidated'
);

select is(
  (
    public.reconcile_reddit_posts(
      array['reddit-cleanup-fixture'],
      '{}'::text[]
    )->>'deleted_count'
  )::integer,
  1,
  'missing Reddit content is purged'
);

select is(
  (
    select count(*)::integer from public.scanned_posts
    where platform = 'reddit'
      and external_id = 'reddit-cleanup-fixture'
  ),
  0,
  'purged Reddit content is removed'
);

select is(
  (select count(*)::integer from public.opportunities),
  2,
  'purging Reddit content cascades only its opportunity'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is(
  (select count(*)::integer from public.opportunities),
  1,
  'user one sees only their matching opportunity'
);

select is(
  (select count(*)::integer from public.scanned_posts),
  1,
  'user one sees only posts reachable through their opportunities'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

select is(
  (select count(*)::integer from public.opportunities),
  1,
  'user two sees only their matching opportunity'
);

select is(
  (select count(*)::integer from public.scanned_posts),
  1,
  'user two sees only posts reachable through their opportunities'
);

select throws_ok(
  $$update public.opportunities set status = 'skipped'$$,
  '42501',
  'permission denied for table opportunities',
  'authenticated users cannot mutate opportunity state directly'
);
reset role;

select ok(
  public.claim_scan_run(
    'hackernews',
    '2026-08-03T10:15:00Z',
    'database-test-worker'
  ) is not null,
  'first worker claims the scan bucket'
);

select is(
  public.claim_scan_run(
    'hackernews',
    '2026-08-03T10:15:00Z',
    'duplicate-worker'
  ),
  null::uuid,
  'duplicate scan claim returns null'
);

select ok(
  public.finish_scan_run(
    (
      select id from public.scan_runs
      where platform = 'hackernews'
        and schedule_bucket = '2026-08-03T10:15:00Z'
    ),
    'succeeded',
    3,
    2,
    null
  ),
  'running scan transitions to a terminal state once'
);

select is(
  (
    select status from public.scan_runs
    where platform = 'hackernews'
      and schedule_bucket = '2026-08-03T10:15:00Z'
  ),
  'succeeded',
  'completed scan records its terminal status'
);

select is(
  (
    select query_count + item_count from public.scan_runs
    where platform = 'hackernews'
      and schedule_bucket = '2026-08-03T10:15:00Z'
  ),
  5,
  'completed scan records query and item metrics'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select throws_ok(
  $$select * from public.scan_runs$$,
  '42501',
  'permission denied for table scan_runs',
  'scan runs remain service-role only'
);
select * from finish();
rollback;
