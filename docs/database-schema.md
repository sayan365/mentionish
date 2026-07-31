# Database Schema

## Design notes

The PRD schema is a useful domain sketch, but it needs additional ownership, quota, idempotency, audit, and policy fields for safe implementation. This document describes the target logical schema. Final SQL migrations must follow approved answers in the decision register.

Use UUID primary keys, `timestamptz` in UTC, lowercase enum/check values, explicit foreign-key behavior, and `created_at`/`updated_at` on mutable records.

## Enums

- `plan_code`: `free`, `lifetime`, `monthly`
- `platform_code`: `reddit`, `hackernews`
- `opportunity_status`: `new`, `drafted`, `posted`, `skipped`
- `karma_stage`: `newcomer`, `contributor`, `trusted`, `established`
- `job_status`: `pending`, `running`, `succeeded`, `failed`, `dead`
- `usage_type`: `classification`, `draft`

Prefer Postgres check constraints if enum migration flexibility is important.

## Core tables

### `user_profiles`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK, FK `auth.users(id)` with delete handling approved before launch |
| `plan` | text | not null, default `free`, valid plan constraint |
| `entitlement_status` | text | active/inactive/past_due/refunded as normalized application state |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null |

Do not rely only on mutable `scan_used`/`draft_used` counters. `DEC-001` and `DEC-002` determine the usage ledger and period model.

### `products`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, FK `user_profiles` |
| `name` | text | not null |
| `description` | text | not null |
| `keywords` | text[] | not null, non-empty, normalized |
| `voice_persona` | text | nullable |
| `is_active` | boolean | not null, default true |
| `deleted_at` | timestamptz | nullable; subject to `DEC-014` |
| timestamps | timestamptz | not null |

Indexes: `(user_id, is_active)` and optionally GIN on `keywords` only if actual queries benefit.

### `tracked_subreddits`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid | not null, FK `products` |
| `subreddit` | text | not null, normalized without `r/` |
| `karma_stage` | text | not null, default `newcomer` |
| `self_promo_allowed` | boolean | not null, default false |
| `karma_threshold` | integer | not null, default 0, non-negative |
| `non_promotional_comment_count` | integer | proposed by `DEC-005`, non-negative |
| `rules_summary` | text | proposed by `DEC-007` |
| `rules_source_url` | text | proposed by `DEC-007` |
| `rules_verified_at` | timestamptz | nullable |
| `last_scanned_at` | timestamptz | nullable |
| timestamps | timestamptz | not null |

Unique: `(product_id, lower(subreddit))`.

### `scanned_posts`

Shared across users. It must not contain user-private product context.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `platform` | text | not null, valid platform |
| `external_id` | text | not null |
| `subreddit` | text | nullable; Reddit only |
| `title` | text | not null, default empty |
| `body` | text | not null, default empty |
| `author` | text | nullable |
| `url` | text | not null |
| `source_created_at` | timestamptz | nullable, platform timestamp |
| `scanned_at` | timestamptz | not null, default now |
| `source_updated_at` | timestamptz | nullable |
| `raw_metadata` | jsonb | minimal non-sensitive fields only; optional |

Unique: `(platform, external_id)`. Indexes: `(platform, source_created_at desc)` and `(subreddit)` where platform is Reddit.

Using `source_created_at` avoids confusing platform time with database row creation.

### `opportunities`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, denormalized ownership guard |
| `product_id` | uuid | not null, FK `products` |
| `scanned_post_id` | uuid | not null, FK `scanned_posts` |
| `intent_score` | integer | nullable until classified; check 0–100 |
| `reasoning` | text | nullable |
| `status` | text | not null; lifecycle constraint |
| `classified_at` | timestamptz | nullable |
| `posted_at` | timestamptz | nullable, user-declared |
| `skipped_reason` | text | nullable |
| timestamps | timestamptz | not null |

Unique: `(product_id, scanned_post_id)`. Indexes: `(user_id, status, intent_score desc, created_at desc)` and `(product_id, intent_score desc)`.

The explicit `user_id` makes RLS and high-volume filtering reliable. A trigger or service function must ensure it always equals the owning product's `user_id`.

### `drafts`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | not null, ownership guard |
| `opportunity_id` | uuid | not null, FK `opportunities` |
| `draft_text` | text | not null |
| `edited_text` | text | nullable |
| `model_used` | text | not null |
| `prompt_version` | text | not null |
| `policy_snapshot` | jsonb | gating facts used at generation time |
| timestamps | timestamptz | not null |

Decide whether regeneration creates versions or overwrites. Recommended: immutable draft versions with one `is_current` flag or a `current_draft_id` on opportunity.

## Entitlement and usage tables

### `plan_entitlements`

Configuration keyed by plan/version: classification limit, draft limit, reset cadence, active product limit, and effective dates. Prices stay in Dodo; provider product IDs map to plan versions.

### `user_entitlement_periods`

Records the user's plan version, active interval, status, and payment/subscription reference. Supports non-resetting lifetime allowances and renewing periods without erasing history.

### `usage_events`

Append-only rows:

- `id`, `user_id`, `entitlement_period_id`;
- `usage_type`, `quantity`;
- `operation_key` unique per chargeable logical operation;
- `status` (`reserved`, `consumed`, `released`);
- `opportunity_id`, `ai_call_id`, timestamps.

Quota reservation and consumption must occur through a transaction or database function with row locking. Cached counters may be added, but the ledger is auditable truth.

## AI operations

### `ai_calls`

Store `user_id`, opportunity/product references, operation type, provider, model, prompt version, input/output token counts, provider request ID when available, latency, status, error class, attempt number, and estimated cost. Do not store secrets. Raw prompts/responses should be omitted or redacted unless a retention decision explicitly permits them.

## Payments

### `payment_customers`

Maps `user_id` to Dodo customer identity.

### `payments`

Store normalized provider payment/subscription IDs, mapped plan, amount/currency if needed, status, and timestamps. Restrict access to the owning user and server.

### `webhook_events`

Store unique provider event ID, event type, verification/processing status, attempt count, received/processed timestamps, safe payload or encrypted/reduced payload, and last error. Insert before processing to guarantee idempotency.

## Extension authentication

### `extension_tokens`

Store `id`, `user_id`, token prefix, **hash only**, scopes, last-used time, expiry, revoked time, and creation time. Show plaintext exactly once. Token comparison must be constant-time after lookup by prefix.

## Discovery operations

### `scan_runs`

Store platform, schedule bucket, status, started/finished timestamps, query/item counts, error summary, and worker identity. Unique `(platform, schedule_bucket)` prevents duplicate scheduler execution.

Optional `scan_queries` provides per-keyword/batch observability without putting mutable job state in product records.

## RLS policy model

- `user_profiles`: `id = auth.uid()`.
- `products`: `user_id = auth.uid()`.
- `tracked_subreddits`: ownership through product; consider denormalized `user_id` if policy performance requires it.
- `opportunities`, `drafts`, usage, payments, extension tokens: explicit `user_id = auth.uid()`.
- `scanned_posts`: users may select only rows reachable through one of their opportunities; direct anonymous/public select is not required. Server workers can use service-role access.
- Discovery/job/webhook tables: service-role only, except curated user-facing projections.

RLS must cover `select`, `insert`, `update`, and `delete`, and ownership columns must not be user-changeable. API authorization remains mandatory even with RLS.

## Data invariants

- An opportunity's `user_id` equals its product owner's ID.
- A draft's `user_id` equals its opportunity owner's ID.
- Only a score of 60 or higher may transition to `new`/`drafted`.
- `posted_at` is present only for `posted`.
- Newcomer policy snapshots always prohibit links and product names.
- One successful logical AI operation consumes at most one quota unit.
- Payment and webhook provider IDs are unique when present.
