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

const userId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const productId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function persistOpportunity(externalId) {
  const persisted = await client.query(
    `select public.persist_scanned_post_matches(
      'hackernews', $1, null, 'Looking for a monitoring tool',
      'What products should I compare?', 'fixture-user',
      $2, now(), null, '{"fixture":true}'::jsonb, array[$3]::uuid[]
    ) as result`,
    [
      externalId,
      `https://news.ycombinator.com/item?id=${externalId}`,
      productId,
    ],
  );
  return persisted.rows[0].result.opportunity_ids[0];
}

await client.connect();
try {
  await client.query("begin");
  await client.query(
    `insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values
      ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'classification@example.invalid', '', now(), '{}', '{}', now(), now()),
      ($2, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'classification-other@example.invalid', '', now(), '{}', '{}', now(), now())`,
    [userId, otherUserId],
  );
  await client.query(
    `insert into public.products (id, user_id, name, description, keywords)
     values ($1, $2, 'Fixture product', 'Community monitoring software', array['monitoring tool'])`,
    [productId, userId],
  );

  const periods = await client.query(
    "select count(*)::integer as count from public.user_entitlement_periods where user_id = $1 and status = 'active'",
    [userId],
  );
  assert(
    periods.rows[0].count === 1,
    "verified trial creates one active entitlement period",
  );

  const opportunityId = await persistOpportunity("classification-9001");
  const firstClaim = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [opportunityId],
  );
  assert(
    firstClaim.rows[0].result.status === "claimed",
    "first worker claims classification quota and lease",
  );

  const duplicateClaim = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [opportunityId],
  );
  assert(
    duplicateClaim.rows[0].result.status === "busy",
    "concurrent duplicate cannot call the provider",
  );

  const claim = firstClaim.rows[0].result;
  const aiCall = await client.query(
    `insert into public.ai_calls (
      user_id, opportunity_id, product_id, usage_event_id, operation_type,
      provider, requested_model, returned_model, prompt_version,
      reasoning_effort, output_token_cap, input_tokens, output_tokens,
      total_tokens, provider_response_id, latency_ms, status, attempt_number
    ) values (
      $1, $2, $3, $4, 'classification', 'openai', 'gpt-5.6-luna',
      'gpt-5.6-luna', 'intent-v1', 'none', 250, 100, 20, 120,
      'resp_classification_fixture', 25, 'succeeded', 1
    ) returning id`,
    [userId, opportunityId, productId, claim.usage_event_id],
  );
  const completion = await client.query(
    "select public.complete_classification($1, $2, $3, 60, 'Explicit recommendation request.') as completed",
    [claim.usage_event_id, claim.lease_token, aiCall.rows[0].id],
  );
  assert(
    completion.rows[0].completed === true,
    "score and quota consumption commit atomically",
  );

  const finalState = await client.query(
    "select status, intent_score from public.opportunities where id = $1",
    [opportunityId],
  );
  assert(
    finalState.rows[0].status === "new" &&
      finalState.rows[0].intent_score === 60,
    "score 60 is qualified as a new opportunity",
  );

  const completedDuplicate = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [opportunityId],
  );
  assert(
    completedDuplicate.rows[0].result.status === "already_completed",
    "completed opportunity cannot consume quota twice",
  );

  const lowOpportunityId = await persistOpportunity("classification-9002");
  const lowClaimQuery = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [lowOpportunityId],
  );
  const lowClaim = lowClaimQuery.rows[0].result;
  const lowAiCall = await client.query(
    `insert into public.ai_calls (
      user_id, opportunity_id, product_id, usage_event_id, operation_type,
      provider, requested_model, returned_model, prompt_version,
      reasoning_effort, output_token_cap, input_tokens, output_tokens,
      total_tokens, provider_response_id, latency_ms, status, attempt_number
    ) values (
      $1, $2, $3, $4, 'classification', 'openai', 'gpt-5.6-luna',
      'gpt-5.6-luna', 'intent-v1', 'none', 250, 100, 20, 120,
      'resp_classification_fixture_low', 25, 'succeeded', 1
    ) returning id`,
    [userId, lowOpportunityId, productId, lowClaim.usage_event_id],
  );
  await client.query(
    "select public.complete_classification($1, $2, $3, 59, 'Problem is real but solution-seeking intent is unclear.')",
    [lowClaim.usage_event_id, lowClaim.lease_token, lowAiCall.rows[0].id],
  );
  const lowState = await client.query(
    "select status, intent_score from public.opportunities where id = $1",
    [lowOpportunityId],
  );
  assert(
    lowState.rows[0].status === "skipped" &&
      lowState.rows[0].intent_score === 59,
    "score 59 is skipped below the qualification threshold",
  );

  const retryOpportunityId = await persistOpportunity("classification-9003");
  const retryClaim = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [retryOpportunityId],
  );
  const released = await client.query(
    "select public.release_classification($1, $2) as released",
    [
      retryClaim.rows[0].result.usage_event_id,
      retryClaim.rows[0].result.lease_token,
    ],
  );
  assert(
    released.rows[0].released === true,
    "provider failure releases reserved quota",
  );
  const reclaimed = await client.query(
    "select public.reserve_classification($1, 'intent-v1', 600) as result",
    [retryOpportunityId],
  );
  assert(
    reclaimed.rows[0].result.status === "claimed" &&
      reclaimed.rows[0].result.attempt_number === 2,
    "released operation can retry without a second ledger row",
  );
  await client.query("select public.release_classification($1, $2)", [
    reclaimed.rows[0].result.usage_event_id,
    reclaimed.rows[0].result.lease_token,
  ]);

  const ledger = await client.query(
    "select count(*)::integer as rows, count(*) filter (where status = 'consumed')::integer as consumed from public.usage_events where user_id = $1",
    [userId],
  );
  assert(
    ledger.rows[0].rows === 3 && ledger.rows[0].consumed === 2,
    "ledger keeps one row per logical operation without duplicate consumption",
  );

  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    otherUserId,
  ]);
  const hidden = await client.query(
    "select (select count(*)::integer from public.usage_events) as usage, (select count(*)::integer from public.ai_calls) as calls",
  );
  assert(
    hidden.rows[0].usage === 0 && hidden.rows[0].calls === 0,
    "classification usage and AI metadata are isolated by RLS",
  );
  await client.query("reset role");

  await client.query("rollback");
  console.log("Linked classification transaction rolled back cleanly.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
