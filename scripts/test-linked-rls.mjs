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

  await client.query("rollback");
  console.log("RLS_SMOKE_PASS");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
