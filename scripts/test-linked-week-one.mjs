import console from "node:console";
import fs from "node:fs";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";

const root = new URL("../", import.meta.url);
const template = fs
  .readFileSync(new URL("supabase/.temp/pooler-url", root), "utf8")
  .trim();
if (!process.env.SUPABASE_DB_PASSWORD)
  throw new Error("SUPABASE_DB_PASSWORD is required");
const url = new URL(template);
url.password = process.env.SUPABASE_DB_PASSWORD;
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});
const owner = "77777777-7777-4777-8777-777777777771";
const other = "77777777-7777-4777-8777-777777777772";
const product = "77777777-7777-4777-8777-777777777773";
const requestKey = "77777777-7777-4777-8777-777777777774";

function assert(value, message) {
  if (!value) throw new Error(message);
  console.log("PASS: " + message);
}
async function asUser(id) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    id,
  ]);
}
async function service() {
  await client.query("reset role");
}

await client.connect();
try {
  await client.query("begin");
  await client.query(
    "insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','week-one-owner@example.invalid','',now(),'{}','{}',now(),now()),($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','week-one-other@example.invalid','',now(),'{}','{}',now(),now())",
    [owner, other],
  );
  await client.query(
    "insert into public.products(id,user_id,name,description,keywords,voice_persona) values($1,$2,'Week one fixture','Find founders asking for marketing help',array['marketing issue'],'Helpful and direct')",
    [product, owner],
  );
  const persisted = await client.query(
    "select public.persist_scanned_post_matches('reddit','week-one-acceptance','startups','How do I find early users?','I have a product but distribution is difficult.','fixture','https://reddit.com/r/startups/comments/week-one',now(),null,'{}'::jsonb,array[$1]::uuid[]) result",
    [product],
  );
  const opportunity = persisted.rows[0].result.opportunity_ids[0];
  await client.query(
    "update public.opportunities set intent_score=86,reasoning='Founder asks for distribution help.',status='new',classified_at=now() where id=$1",
    [opportunity],
  );

  await asUser(owner);
  const requested = await client.query(
    "select public.request_draft_generation($1,'draft-v1',$2,false) result",
    [opportunity, requestKey],
  );
  assert(
    requested.rows[0].result.status === "queued",
    "owner explicitly queues a qualified Reddit draft",
  );
  const operation = requested.rows[0].result.operation_id;

  await service();
  const claimed = await client.query(
    "select public.begin_draft_operation($1) result",
    [operation],
  );
  const target = claimed.rows[0].result;
  const ai = await client.query(
    "insert into public.ai_calls(user_id,opportunity_id,product_id,usage_event_id,operation_type,provider,requested_model,returned_model,prompt_version,reasoning_effort,output_token_cap,input_tokens,output_tokens,total_tokens,provider_response_id,latency_ms,status,attempt_number) values($1,$2,$3,$4,'draft','openai','gpt-5.6-terra','gpt-5.6-terra','draft-v1','low',800,100,30,130,'resp_week_one_fixture',20,'succeeded',1) returning id",
    [owner, opportunity, product, target.usage_event_id],
  );
  const completed = await client.query(
    "select public.complete_draft_operation($1,$2,$3,'Start with the communities where your target users already ask for help, then answer those questions directly.') id",
    [operation, target.lease_token, ai.rows[0].id],
  );
  assert(
    Boolean(completed.rows[0].id),
    "draft completion atomically consumes one unit",
  );

  await asUser(owner);
  const edited = await client.query(
    "select public.update_draft_text($1,1,'Start with one community, answer real questions, and review which conversations lead to useful follow-ups.') result",
    [completed.rows[0].id],
  );
  assert(
    edited.rows[0].result.status === "updated",
    "owner edits the generated guidance",
  );
  const posted = await client.query(
    "select public.mark_opportunity_posted($1,now()) posted",
    [opportunity],
  );
  assert(
    posted.rows[0].posted === true,
    "owner self-reports a manual reply without a write API",
  );

  const usage = (await client.query("select public.get_my_usage() result"))
    .rows[0].result;
  assert(
    usage.draft.used === 1 && usage.draft.remaining === usage.draft.limit - 1,
    "usage endpoint reports authoritative consumed and remaining draft quota",
  );
  const analytics = (
    await client.query("select public.get_my_analytics_summary($1,7) result", [
      product,
    ])
  ).rows[0].result;
  assert(
    analytics.qualified === 1 &&
      analytics.drafted === 1 &&
      analytics.posted === 1 &&
      Number(analytics.draft_to_post_percent) === 100,
    "7-day analytics reports the complete manual funnel",
  );
  assert(
    analytics.platforms.reddit === 1,
    "analytics attributes the qualified opportunity to Reddit",
  );

  await asUser(other);
  const hidden = await client.query(
    "select count(*)::integer count from public.opportunities",
  );
  const deniedAnalytics = (
    await client.query("select public.get_my_analytics_summary($1,7) result", [
      product,
    ])
  ).rows[0].result;
  assert(
    hidden.rows[0].count === 0 && deniedAnalytics.status === "not_found",
    "RLS and analytics hide another user's workspace",
  );

  await client.query("rollback");
  console.log("Week 1 hosted acceptance transaction rolled back cleanly.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
