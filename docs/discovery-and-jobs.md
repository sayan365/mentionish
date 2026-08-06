# Discovery and Background Jobs

## Objectives

Continuously fetch recent public items, avoid duplicate storage/work, respect upstream limits, and spend AI quota only on eligible product/post matches.

## Scheduling

| Job | Target cadence | Notes |
|---|---:|---|
| Reddit discovery | Every 20–30 minutes | Use one dedicated scheduler or distributed lock |
| Hacker News discovery | Every 15 minutes | Poll new and Ask HN story ID lists |
| Dead-job/health check | Every few minutes | Alert; do not create an infinite retry loop |
| Usage/payment reconciliation | Periodic | Exact cadence decided during payments implementation |

Cadences are targets, not guarantees. A prior run still executing should not be duplicated.

## Keyword normalization

Before scheduling:

- trim whitespace and Unicode-normalize;
- maintain a display value and normalized comparison/query value;
- remove case-insensitive duplicates per product;
- reject empty, overly broad, or overlong values according to validation limits;
- escape/encode upstream queries through official clients or URL APIs;
- never interpolate keywords into SQL or prompts without structured boundaries.

Multiple products may share a keyword. Fetch each normalized query once per scan window where practical, then evaluate matches for all eligible products.

## Reddit pipeline

1. Select one server-side read transport. Official Reddit OAuth is preferred. The live-verified `opencli` desktop transport is permitted for supervised validation under `DEC-026` and [`reddit-opencli-fallback.md`](reddit-opencli-fallback.md); the `rdt_cli` cookie transport remains a legacy fallback under `DEC-025`.
2. Keep the selected credential only in the runtime secret store or the worker-owned `rdt-cli` credential file; never expose or persist it in the dashboard, extension, application database, queue payloads, or logs.
3. Query recent submissions with the normalized keyword, newest-first ordering, and the configured conservative result limit. The temporary CLI transport may execute only its allowlisted `search` and `read` commands.
4. Refresh OAuth tokens when applicable. For either transport, stop all Reddit polling on revocation, expired session, or persistent authorization failure.
5. For OAuth, apply a recognizable user agent and observe live rate-limit headers. For the cookie transport, treat any explicit rate-limit response as a global cooldown and reduce traffic before resuming.
6. Normalize submission ID, subreddit, title, self-text, author, canonical URL, and source creation time.
7. Upsert `scanned_posts` by `(reddit, external_id)`.
8. Determine matching active products from the scan query and deterministic content match.
9. Upsert one opportunity per product/post and enqueue classification only if not previously completed.

Do not poll every subreddit per keyword unless a later design proves it necessary. Apply one conservative global request budget, stagger schedules with jitter, batch shared keywords, obey returned rate-limit/retry headers, and reuse globally deduplicated results. Unknown subreddits follow `DEC-009`.

Runtime controls require discovery enablement (`REDDIT_DISCOVERY_ENABLED`), the explicit owner risk acknowledgement (`REDDIT_POLICY_RISK_ACCEPTED`), and a disabled kill switch (`REDDIT_KILL_SWITCH=false`). Selecting `rdt_cli` additionally requires `REDDIT_COOKIE_BACKEND_RISK_ACCEPTED=true`; selecting `opencli` requires `REDDIT_BROWSER_BACKEND_RISK_ACCEPTED=true`. The default remains `oauth`. Authentication failure creates a persistent per-backend Redis halt, and changing credentials or an explicit one-shot operator clear is required before calls resume. A five-minute Redis cache keyed by a keyword hash absorbs retry/duplicate-worker searches without becoming business truth. A bounded maintenance scan revalidates stored Reddit submission IDs through the selected read-only transport and atomically purges missing or deleted source content plus dependent opportunities.

## Hacker News pipeline

1. Fetch ID lists from `newstories.json` and `askstories.json`.
2. Deduplicate IDs across both lists and recent scan runs.
3. Fetch item details with bounded concurrency.
4. Ignore missing, deleted, dead, or unsupported item types.
5. Convert HN HTML `text` safely to a plain-text representation for matching and AI, while preserving the source URL.
6. Match keywords against title and text before storage/classification as required by the PRD.
7. Upsert shared post and product opportunity.

`DEC-008` limits secondary HN coverage to top-level items; it does not recursively fetch comments.

## Queue topology

Suggested BullMQ queues:

- `platform-fetch`: rate-limited upstream requests;
- `classify-intent`: cheap-model Stage 1 jobs;
- `generate-draft`: stronger-model Stage 2 jobs;
- `payment-events`: optional verified-webhook processing;
- `maintenance`: reconciliation and cleanup.

Every job payload contains IDs, not full secrets or large post bodies. Workers reload authoritative records and recheck eligibility before side effects.

## Idempotency

Suggested job IDs:

```text
reddit:{normalized-keyword}:{schedule-bucket}
hn:{list-name}:{schedule-bucket}
classify:{product-id}:{scanned-post-id}:v{prompt-version}
draft:{opportunity-id}:v{prompt-version}:{generation-number}
```

Database unique constraints remain the final defense; Redis job uniqueness alone is insufficient.

## Retry policy

- Retry network timeouts, 429, and most 5xx responses with exponential backoff and jitter.
- Honor `Retry-After` and upstream rate-limit reset signals.
- Refresh credentials once on an upstream 401, then fail visibly if still unauthorized.
- Do not retry schema validation, ownership, quota, or permanent 4xx failures.
- Limit attempts and move exhausted jobs to a dead state with redacted error context.

Exact attempts and delays should be configurable per adapter.

## Quota sequence

`DEC-001` approves this charging sequence:

1. Create the unique product/post opportunity.
2. Atomically reserve one classification unit for the user.
3. Enqueue the classification using the reservation/operation key.
4. On success, consume reservation and persist AI usage.
5. On pre-provider failure, release it.
6. On uncertain provider outcome, reconcile from the AI operation record rather than blindly retrying/charging.

One user's exhausted quota must not block shared storage or another eligible user's classification.

## Freshness and backfill

The PRD defines polling but no initial backfill window. Default to newly observed items and avoid a costly historical crawl until approved. Store per-adapter cursors/recent-ID sets only as optimizations; uniqueness constraints guarantee correctness.

## Operational metrics

- scan runs started/succeeded/failed and duration;
- upstream requests by status and rate-limit remaining;
- fetched, new, duplicate, keyword-matched, and classified counts;
- queue depth, age of oldest job, retry/dead counts;
- classification pass rate and cost;
- last successful scan per platform.
