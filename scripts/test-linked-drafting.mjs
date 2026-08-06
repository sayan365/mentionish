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
const user = "55555555-5555-4555-8555-555555555555";
const other = "66666666-6666-4666-8666-666666666666";
const product = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const requestKey = "77777777-7777-4777-8777-777777777777";
function assert(value, message) {
  if (!value) throw new Error(message);
  console.log(`PASS: ${message}`);
}
async function asUser(userId) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userId,
  ]);
}
async function service() {
  await client.query("reset role");
}
async function opportunity(external) {
  const persisted = await client.query(
    `select public.persist_scanned_post_matches('hackernews',$1,null,'Need a community monitoring tool','Which options should I compare?','fixture',$2,now(),null,'{}'::jsonb,array[$3]::uuid[]) result`,
    [external, `https://news.ycombinator.com/item?id=${external}`, product],
  );
  const id = persisted.rows[0].result.opportunity_ids[0];
  await client.query(
    "update public.opportunities set intent_score=85, reasoning='Explicit comparison request.', status='new', classified_at=now() where id=$1",
    [id],
  );
  return id;
}
await client.connect();
try {
  await client.query("begin");
  await client.query(
    `insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft-owner@example.invalid','',now(),'{}','{}',now(),now()),
    ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft-other@example.invalid','',now(),'{}','{}',now(),now())`,
    [user, other],
  );
  await client.query(
    "insert into public.products(id,user_id,name,description,keywords,voice_persona) values($1,$2,'Fixture product','Community monitoring',array['monitoring tool'],'Helpful and direct')",
    [product, user],
  );
  const opportunityId = await opportunity("draft-9101");
  await asUser(user);
  const first = await client.query(
    "select public.request_draft_generation($1,'draft-v1',$2,false) result",
    [opportunityId, requestKey],
  );
  assert(
    first.rows[0].result.status === "queued",
    "explicit owner request reserves and queues one draft",
  );
  const operationId = first.rows[0].result.operation_id;
  const duplicate = await client.query(
    "select public.request_draft_generation($1,'draft-v1',$2,false) result",
    [opportunityId, requestKey],
  );
  assert(
    duplicate.rows[0].result.operation_id === operationId,
    "same request key is idempotent",
  );
  const active = await client.query(
    "select public.request_draft_generation($1,'draft-v1','88888888-8888-4888-8888-888888888888',false) result",
    [opportunityId],
  );
  assert(
    active.rows[0].result.operation_id === operationId,
    "double click reuses the active operation without another charge",
  );
  await asUser(other);
  const hidden = await client.query(
    "select count(*)::integer count from public.operations",
  );
  const denied = await client.query(
    "select public.request_draft_generation($1,'draft-v1','99999999-9999-4999-8999-999999999999',false) result",
    [opportunityId],
  );
  assert(
    hidden.rows[0].count === 0 && denied.rows[0].result.status === "not_found",
    "another user cannot see or draft the opportunity",
  );
  await service();
  const claim = await client.query(
    "select public.begin_draft_operation($1) result",
    [operationId],
  );
  assert(
    claim.rows[0].result.status === "claimed",
    "worker atomically claims the queued operation",
  );
  const target = claim.rows[0].result;
  const ai = await client.query(
    `insert into public.ai_calls(user_id,opportunity_id,product_id,usage_event_id,operation_type,provider,requested_model,returned_model,prompt_version,reasoning_effort,output_token_cap,input_tokens,output_tokens,total_tokens,provider_response_id,latency_ms,status,attempt_number)
    values($1,$2,$3,$4,'draft','openai','gpt-5.6-terra','gpt-5.6-terra','draft-v1','low',800,120,40,160,'resp_draft_fixture',25,'succeeded',1) returning id`,
    [user, opportunityId, product, target.usage_event_id],
  );
  const completed = await client.query(
    "select public.complete_draft_operation($1,$2,$3,'A narrow phrase set and a daily review loop are a good starting point.') id",
    [operationId, target.lease_token, ai.rows[0].id],
  );
  assert(
    Boolean(completed.rows[0].id),
    "draft, operation, opportunity, and quota commit atomically",
  );
  await asUser(user);
  const draft = await client.query("select * from public.drafts where id=$1", [
    completed.rows[0].id,
  ]);
  const edited = await client.query(
    "select public.update_draft_text($1,1,'Start narrow, review false positives weekly, and expand only after the signal is consistent.') result",
    [completed.rows[0].id],
  );
  const stale = await client.query(
    "select public.update_draft_text($1,1,'Stale overwrite') result",
    [completed.rows[0].id],
  );
  assert(
    draft.rows.length === 1 &&
      edited.rows[0].result.status === "updated" &&
      stale.rows[0].result.status === "conflict",
    "owner can edit while stale versions cannot overwrite newer text",
  );
  await service();
  const ledger = await client.query(
    "select status from public.usage_events where operation_key=$1",
    [`draft-request:${requestKey}`],
  );
  assert(
    ledger.rows[0].status === "consumed",
    "successful generation consumes exactly one reserved draft unit",
  );
  const secondOpportunity = await opportunity("draft-9102");
  await asUser(user);
  const second = await client.query(
    "select public.request_draft_generation($1,'draft-v1','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',false) result",
    [secondOpportunity],
  );
  await service();
  await client.query(
    "select public.fail_draft_operation($1,'PROVIDER_UNAVAILABLE')",
    [second.rows[0].result.operation_id],
  );
  const released = await client.query(
    "select status from public.usage_events where operation_key='draft-request:aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'",
  );
  assert(
    released.rows[0].status === "released",
    "failed generation releases quota for a later retry",
  );
  await client.query("rollback");
  console.log("Linked drafting transaction rolled back cleanly.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
