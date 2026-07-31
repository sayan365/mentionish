# Analytics and Observability

## User-facing v1 analytics

For a selected product or all owned products:

| Metric | Definition |
|---|---|
| Opportunities found (7d/30d) | Count of distinct qualified opportunities with `intent_score >= 60` and `classified_at` in the window |
| Drafts generated | Count of distinct opportunities with at least one successful draft in the window |
| Marked posted | Count of distinct opportunities whose user-declared `posted_at` is in the window |
| Draft-to-post conversion | Distinct drafted opportunities later marked posted divided by distinct drafted opportunities, with zero-safe display |
| Usage | Consumed classification/draft units versus entitlement limit and reset/expiry |

`DEC-013` confirms/proposes distinct opportunities as the funnel unit. Label “posted” as user-reported. Do not display upvotes, views, replies, or platform engagement sync in v1.

## Operational telemetry

### API

- request count, latency, and error rate by normalized route/status;
- auth/authorization failures;
- quota rejections;
- checkout and extension-token operations;
- correlation/request ID.

### Jobs and discovery

- last successful scan per platform;
- scan duration and item counts;
- upstream response codes/rate-limit remaining;
- queue depth, oldest-job age, retries, dead jobs;
- duplicates and product matches.

### AI

- calls and success rate by operation/model/prompt version;
- input/output tokens, latency, retry count;
- estimated cost by user/product/day;
- classifier qualification rate;
- output-schema and policy-validation failures.

### Payments

- signature failures;
- event lag, duplicates, processing failures;
- checkout-to-activation latency;
- reconciliation mismatches.

## Structured logging

Include timestamp, level, service, environment, request/job ID, user ID in internal non-public form, operation/resource ID, event name, duration, and safe error class. Never log bearer tokens, cookies, webhook signatures/secrets, full payment details, or unbounded raw prompts/payloads.

## Alerting

Launch alerts should cover:

- no successful platform scan beyond two expected intervals;
- growing/old queue or dead jobs;
- sustained provider 401/403/429/5xx;
- AI spend/token anomaly;
- elevated API 5xx;
- webhook processing failure or signature-failure spike;
- database connection/storage pressure.

Thresholds should be based on early baseline traffic and tuned to avoid noisy paging.

## Health endpoints

- Liveness: process event loop is responsive; no external dependency checks.
- Readiness: required database/Redis connectivity and worker configuration.
- Detailed dependency health: protected operator endpoint, not public.

## Product-event minimization

Prefer deriving v1 funnel metrics from authoritative database state rather than introducing a separate analytics vendor. If event analytics is later added, define a privacy-reviewed event dictionary and never send post bodies/drafts by default.
