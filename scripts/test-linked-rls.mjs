import console from "node:console";
import fs from "node:fs";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";

const root = new URL("../", import.meta.url);
const poolerTemplate = fs
  .readFileSync(new URL("supabase/.temp/pooler-url", root), "utf8")
  .trim();
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password) throw new Error("SUPABASE_DB_PASSWORD is required");

const connectionUrl = new URL(poolerTemplate);
connectionUrl.password = password;

const client = new pg.Client({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false },
});

const userOne = "11111111-1111-4111-8111-111111111111";
const userTwo = "22222222-2222-4222-8222-222222222222";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

await client.connect();
try {
  await client.query("begin");
  await client.query(
    `insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values
      ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'rls-one@example.invalid', '', now(), '{}', '{}', now(), now()),
      ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'rls-two@example.invalid', '', now(), '{}', '{}', now(), now())`,
    [userOne, userTwo],
  );

  const provisioned = await client.query(
    "select count(*)::integer as count from public.user_profiles where id = any($1::uuid[])",
    [[userOne, userTwo]],
  );
  assert(provisioned.rows[0].count === 2, "auth users receive profiles");

  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userOne,
  ]);

  const profileCount = await client.query(
    "select count(*)::integer as count from public.user_profiles",
  );
  assert(profileCount.rows[0].count === 1, "user one sees only their profile");

  await client.query(
    `insert into public.products (id, user_id, name, description, keywords)
     values ($1, $2, 'One product', 'Owned by user one', array['one'])`,
    [productId, userOne],
  );
  const ownProducts = await client.query(
    "select count(*)::integer as count from public.products",
  );
  assert(ownProducts.rows[0].count === 1, "user one sees their product");

  const trial = await client.query(
    `select entitlement_status,
            extract(epoch from (trial_ends_at - trial_started_at))::integer as duration_seconds
     from public.user_profiles`,
  );
  assert(
    trial.rows[0].entitlement_status === "active",
    "first product activates the verified trial",
  );
  assert(
    trial.rows[0].duration_seconds === 14 * 24 * 60 * 60,
    "trial lasts exactly 14 days",
  );

  await client.query("savepoint product_limit");
  try {
    await client.query(
      `insert into public.products (user_id, name, description, keywords)
       values ($1, 'Second active', 'Over the free plan limit', array['second'])`,
      [userOne],
    );
    throw new Error("second active product unexpectedly succeeded");
  } catch (error) {
    if (error.code !== "P0001" || error.message !== "PRODUCT_LIMIT_REACHED") {
      throw error;
    }
    console.log("PASS: free users cannot create a second active product");
  }
  await client.query("rollback to savepoint product_limit");

  await client.query("savepoint keyword_normalization");
  try {
    await client.query(
      `insert into public.products
        (user_id, name, description, keywords, is_active)
       values ($1, 'Bad keywords', 'Must be normalized', array['Not Normalized'], false)`,
      [userOne],
    );
    throw new Error("non-normalized keyword unexpectedly succeeded");
  } catch (error) {
    if (error.code !== "23514") throw error;
    console.log("PASS: database rejects non-normalized keywords");
  }
  await client.query("rollback to savepoint keyword_normalization");

  await client.query("savepoint forbidden_insert");
  try {
    await client.query(
      `insert into public.products (user_id, name, description, keywords)
       values ($1, 'Stolen', 'Should fail', array['bad'])`,
      [userTwo],
    );
    throw new Error("cross-user insert unexpectedly succeeded");
  } catch (error) {
    if (error.code !== "42501") throw error;
    console.log("PASS: user one cannot insert a product for user two");
  }
  await client.query("rollback to savepoint forbidden_insert");

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userTwo,
  ]);
  const hiddenProducts = await client.query(
    "select count(*)::integer as count from public.products",
  );
  assert(
    hiddenProducts.rows[0].count === 0,
    "user two cannot see user one's product",
  );

  const update = await client.query(
    "update public.products set name = 'Tampered' where id = $1",
    [productId],
  );
  assert(update.rowCount === 0, "user two cannot update user one's product");

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userOne,
  ]);
  const unchanged = await client.query(
    "select name from public.products where id = $1",
    [productId],
  );
  assert(
    unchanged.rows[0].name === "One product",
    "cross-user update changed nothing",
  );

  await client.query("reset role");
  const userTwoProduct = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await client.query(
    "insert into public.products (id, user_id, name, description, keywords) values ($1, $2, 'Two product', 'Owned by user two', array['shared keyword'])",
    [userTwoProduct, userTwo],
  );

  const discoveryParameters = [
    "hackernews",
    "424242",
    null,
    "Shared keyword discussion",
    "Looking for a useful workflow.",
    "hn-user",
    "https://news.ycombinator.com/item?id=424242",
    "2026-08-03T00:00:00.000Z",
    null,
    { fixture: true },
    [productId, userTwoProduct],
  ];
  const persistQuery =
    "select public.persist_scanned_post_matches($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid[]) as result";

  const firstPersistence = await client.query(
    persistQuery,
    discoveryParameters,
  );
  const secondPersistence = await client.query(
    persistQuery,
    discoveryParameters,
  );
  assert(
    firstPersistence.rows[0].result.scanned_post_id ===
      secondPersistence.rows[0].result.scanned_post_id,
    "duplicate platform items reuse one scanned post",
  );

  const sharedCounts = await client.query(
    "select (select count(*)::integer from public.scanned_posts where platform = 'hackernews' and external_id = '424242') as posts, (select count(*)::integer from public.opportunities where scanned_post_id = $1) as opportunities",
    [firstPersistence.rows[0].result.scanned_post_id],
  );
  assert(
    sharedCounts.rows[0].posts === 1,
    "shared post is globally deduplicated",
  );
  assert(
    sharedCounts.rows[0].opportunities === 2,
    "one shared post creates one opportunity per matched product",
  );

  const redditPersistence = await client.query(persistQuery, [
    "reddit",
    "reddit-cleanup-fixture",
    "saas",
    "Shared keyword on Reddit",
    "A live fixture for deletion checks.",
    "reddit-user",
    "https://www.reddit.com/r/saas/comments/reddit-cleanup-fixture/test/",
    "2026-08-03T01:00:00.000Z",
    null,
    { fixture: true },
    [productId],
  ]);
  assert(
    redditPersistence.rows[0].result.scanned_post_id !== null,
    "Reddit fixture persists for source cleanup",
  );

  const liveReconciliation = await client.query(
    "select public.reconcile_reddit_posts($1::text[], $2::text[]) as result",
    [["reddit-cleanup-fixture"], ["reddit-cleanup-fixture"]],
  );
  assert(
    liveReconciliation.rows[0].result.checked_count === 1 &&
      liveReconciliation.rows[0].result.deleted_count === 0,
    "live Reddit content is marked revalidated",
  );

  const deletedReconciliation = await client.query(
    "select public.reconcile_reddit_posts($1::text[], $2::text[]) as result",
    [["reddit-cleanup-fixture"], []],
  );
  assert(
    deletedReconciliation.rows[0].result.deleted_count === 1,
    "missing Reddit content is purged",
  );

  const cleanupCounts = await client.query(
    "select (select count(*)::integer from public.scanned_posts where platform = 'reddit' and external_id = 'reddit-cleanup-fixture') as posts, (select count(*)::integer from public.opportunities) as opportunities",
  );
  assert(
    cleanupCounts.rows[0].posts === 0 &&
      cleanupCounts.rows[0].opportunities === 2,
    "Reddit purge cascades its opportunity without affecting other matches",
  );

  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userOne,
  ]);
  const userOneOpportunities = await client.query(
    "select count(*)::integer as count from public.opportunities",
  );
  const userOnePosts = await client.query(
    "select count(*)::integer as count from public.scanned_posts",
  );
  assert(
    userOneOpportunities.rows[0].count === 1,
    "user one sees only their matching opportunity",
  );
  assert(
    userOnePosts.rows[0].count === 1,
    "user one sees the shared post reachable through their opportunity",
  );

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userTwo,
  ]);
  const userTwoOpportunities = await client.query(
    "select count(*)::integer as count from public.opportunities",
  );
  assert(
    userTwoOpportunities.rows[0].count === 1,
    "user two sees only their matching opportunity",
  );

  await client.query("reset role");
  const scanBucket = "2026-08-03T10:15:00.000Z";
  const firstClaim = await client.query(
    "select public.claim_scan_run($1, $2, $3) as id",
    ["hackernews", scanBucket, "linked-test-worker"],
  );
  const duplicateClaim = await client.query(
    "select public.claim_scan_run($1, $2, $3) as id",
    ["hackernews", scanBucket, "duplicate-worker"],
  );
  assert(firstClaim.rows[0].id !== null, "first worker claims the scan bucket");
  assert(
    duplicateClaim.rows[0].id === null,
    "duplicate scan claim is rejected",
  );

  const completion = await client.query(
    "select public.finish_scan_run($1, 'succeeded', 3, 2, null) as finished",
    [firstClaim.rows[0].id],
  );
  assert(
    completion.rows[0].finished === true,
    "claimed scan run completes once",
  );

  const completedRun = await client.query(
    "select status, query_count, item_count, finished_at from public.scan_runs where id = $1",
    [firstClaim.rows[0].id],
  );
  assert(
    completedRun.rows[0].status === "succeeded" &&
      completedRun.rows[0].query_count === 3 &&
      completedRun.rows[0].item_count === 2 &&
      completedRun.rows[0].finished_at !== null,
    "completed scan run records terminal metrics",
  );

  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userOne,
  ]);
  await client.query("savepoint private_scan_runs");
  try {
    await client.query("select * from public.scan_runs");
    throw new Error("authenticated scan-run read unexpectedly succeeded");
  } catch (error) {
    if (error.code !== "42501") throw error;
    console.log("PASS: scan runs remain service-role only");
  }
  await client.query("rollback to savepoint private_scan_runs");

  await client.query("rollback");
  console.log("RLS_SMOKE_PASS");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
