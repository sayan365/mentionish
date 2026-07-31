# MVP Roadmap

## Planning assumptions

The PRD targets two weeks: Week 1 backend/dashboard and Week 2 extension/payments/polish. This is aggressive. The sequence below protects the hardest invariants first and avoids polishing flows whose quotas, ownership, or webhook semantics are not yet correct.

Items marked “decision gate” require answers from [`decisions-and-open-questions.md`](decisions-and-open-questions.md).

## Pre-build gate

- Approve scan unit/usage periods (`DEC-001`, `DEC-002`).
- Approve free/lifetime price and limits (`DEC-003`, `DEC-004`).
- Approve contribution tracking and subreddit rule fields (`DEC-005`–`DEC-007`).
- Confirm HN item scope, user-triggered drafts, and product limits (`DEC-008`, `DEC-010`, `DEC-015`).
- Verify current official third-party contracts.
- Select deployment provider.

## Week 1: backend and dashboard

### Day 1 — foundation

- Scaffold dashboard, API, worker, shared types, AI, and database packages.
- Establish formatting, linting, type-checking, test runner, and CI.
- Configure local/staging Supabase and Redis.
- Write initial migrations, enums/checks, indexes, RLS, and two-user policy tests.
- Implement Supabase JWT verification and profile provisioning.

Exit: two users can authenticate; cross-user data access fails at API and RLS layers.

### Day 2 — product and discovery foundation

- Product CRUD needed for onboarding.
- Keyword normalization/validation.
- Shared scanned-post/opportunity persistence.
- Scan-run records, scheduler lock/idempotency, BullMQ topology.
- Reddit/HN adapters against fixtures.

Exit: synthetic platform items deduplicate globally and match products deterministically.

### Day 3 — live read discovery and classification

- Connect verified Reddit OAuth read flow and HN Firebase API.
- Add pacing, backoff, retry, dead-job state, and metrics.
- Implement AI adapter, structured Stage 1 result, prompt versioning, and token/cost logging.
- Implement atomic classification usage.

Exit: scheduled items reach scored/skipped opportunities without duplicate charge.

### Day 4 — opportunity feed and drafting

- Feed/query endpoint with cursor pagination and filters.
- Dashboard cards and detail/edit states.
- Stronger-model Stage 2 job, karma policy resolution, deterministic leakage checks.
- Draft usage reservation and retry idempotency.

Exit: an owned qualified opportunity can produce and persist a compliant editable draft.

### Day 5 — workflow and analytics

- Mark posted/skip and HN copy/open actions.
- Usage endpoint and quota states.
- 7/30-day analytics summary.
- Error/loading/empty states and accessibility pass.
- End-to-end Week 1 acceptance test.

Exit: complete dashboard journey works in staging; no platform posting exists.

## Week 2: extension, payments, launch

### Day 6 — extension authentication and lookup

- Manifest V3 scaffold with minimal permissions.
- Token create/list/revoke backend and dashboard UI.
- Secure extension onboarding/storage.
- Reddit URL parsing, SPA navigation, scoped opportunity lookup.

Exit: extension displays only the connected user's matching data.

### Day 7 — sidebar and safe insertion

- Shadow DOM sidebar and editing.
- Textarea/contenteditable adapters with fixtures.
- Save concurrency, existing-text handling, and copy fallback.
- Explicit no-submit tests.

Exit: user-clicked insertion works on supported Reddit layouts and stops before submit.

### Day 8 — payment foundation

- Configure final Dodo Founder Lifetime product.
- Checkout endpoint with server allowlist/idempotency.
- Raw-body signature verification and webhook-event ledger.
- Success/failure/refund semantic handlers.

Exit: verified sandbox success activates once; redirect/forgery does not.

### Day 9 — entitlements and launch data

- Integrate plan/usage UI with webhook-derived entitlement.
- Payment reconciliation and operator visibility.
- Seed and review 20–30 subreddit rule records with sources/dates.
- Security/privacy review and rate limits.

Exit: access and quotas reflect server truth; rule data is reviewable.

### Day 10 — hardening and launch candidate

- Full acceptance, RLS, concurrency, webhook replay, AI policy, and extension smoke tests.
- Production deployment, monitoring, alerts, backup/restore verification.
- Chrome package/store materials.
- Product copy and launch content, including the founder story requested in the PRD.

Exit: all release gates pass; unresolved non-blocking items are documented.

## Scope protection

Do not pull into these two weeks:

- Twitter/X;
- auto-posting;
- teams or multiple Reddit accounts;
- vector search;
- rule auto-detection;
- engagement sync;
- competitor/GEO monitoring;
- monthly-plan UI.

## Post-MVP, only after paying-user evidence

Potential work must be revalidated rather than assumed:

- Growth Monthly UI and renewal lifecycle;
- better rules/contribution evidence workflow;
- HN comment-level discovery;
- platform engagement analytics;
- more platforms;
- team/workspace model;
- semantic retrieval.

## Delivery risks

| Risk | Impact | Mitigation |
|---|---|---|
| Third-party API access/contract changes | Blocks live integrations | Verify on Day 0; keep adapters and fixtures |
| Reddit DOM drift | Breaks insertion | Adapter isolation, fallback copy, manual smoke, compatibility flag |
| Ambiguous quotas | Incorrect billing/cost | Resolve decision gate before schema/code |
| Two-week scope | Quality shortcuts | Treat safety/RLS/payment tests as gates; cut polish first |
| AI leakage/hallucination | Community/user harm | Conservative prompts, deterministic checks, human review |
| Duplicate scheduler/jobs/webhooks | Double cost/access | DB uniqueness, operation keys, transactions, reconciliation |
