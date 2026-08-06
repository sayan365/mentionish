# Mentionish roadmap

> The hosted SaaS roadmap below is preserved as completed implementation history. The active product direction is now the local-first open-source roadmap in [local-first-open-source-architecture.md](local-first-open-source-architecture.md).

## Active local-first track — started 2026-08-06

- Phase 0 is complete: Agent Reach was verified as an MIT-licensed setup/diagnostics layer, the local security and adapter boundaries are documented, typed connector diagnostics are implemented, and a local readiness command is tested.
- Phase 1 is next: embedded database bootstrap, automatic local migrations, and local product repositories.
- Hosted Supabase remains intact during migration; it is not required by the final default local runtime.

### Local-first phases

1. Embedded database and local repository foundation.
2. No-login first-run setup and local Settings UI.
3. User-triggered in-process scanning; remove the local scheduler/Redis requirement.
4. User-owned OpenAI and Anthropic provider keys.
5. Stable Hacker News and experimental Reddit through Agent Reach-selected upstreams.
6. Experimental X connector after Reddit acceptance passes.
7. Extension pairing and manual-only native editor insertion.
8. Packaging, documentation, license selection, and public release.

## Hosted implementation history

## Current implementation status — 2026-08-06

- Days 1 and 2 are complete.
- Day 3 is complete: discovery transport, pacing controls, classification adapter, atomic usage ledger, prompt versioning, token metadata, hosted database functions, and a live OpenAI classification smoke test all pass.
- Day 4 is complete: the owned opportunity feed, filters, pagination, dashboard cards, explicit Terra drafting, atomic quota ledger, editable versioned drafts, and manual-only lifecycle pass hosted acceptance and live model tests.
- Day 5 is complete: manual workflow states, Hacker News copy/open actions, authoritative usage and quota states, owned 7/30-day analytics, accessibility/error states, and the hosted Week 1 acceptance journey all pass.
- Day 6 extension authentication and safe Reddit editor insertion are next.

## Planning assumptions

The PRD targets two weeks: Week 1 backend/dashboard and Week 2 extension/payments/polish. This is aggressive. The sequence below protects the hardest invariants first and avoids polishing flows whose quotas, ownership, or webhook semantics are not yet correct.

Product decisions and the Reddit operating-risk posture are approved in [`decisions-and-open-questions.md`](decisions-and-open-questions.md). Current wire contracts still require implementation-time verification.

## Pre-build gate

- Product decisions `DEC-001`–`DEC-024` are approved.
- Implement the server-side Reddit app-token adapter, conservative global polling, and kill switch approved in `DEC-021`.
- Verify current official provider wire contracts and establish isolated staging resources, kill switches, and cost/rate-limit alerts.

## Week 1: backend and dashboard

### Day 1 — foundation

- Scaffold dashboard, API, worker, shared types, AI, and database packages.
- Establish formatting, linting, type-checking, test runner, and CI.
- Configure local/staging Supabase and Redis.
- Write initial migrations, enums/checks, indexes, RLS, and two-user policy tests.
- Implement Supabase Google OAuth and email magic-link fallback, JWT verification, verified-email trial activation, and profile provisioning.

Exit: two users can authenticate; cross-user data access fails at API and RLS layers.

### Day 2 — product and discovery foundation

- Product CRUD needed for onboarding.
- Server-side Reddit app-token acquisition/refresh module with secret-manager-only credentials and operator health state.
- Keyword normalization/validation.
- Shared scanned-post/opportunity persistence.
- Scan-run records, scheduler lock/idempotency, BullMQ topology.
- Reddit/HN adapters against fixtures.

Exit: synthetic platform items deduplicate globally and match products deterministically.

### Day 3 — live read discovery and classification

- Connect the server-side Reddit app-token read flow, first against contract fixtures and then staging. Connect HN as the secondary live adapter.
- Add pacing, backoff, retry, dead-job state, and metrics.
- Implement the OpenAI Responses adapter, Luna structured Stage 1 result with no reasoning, prompt versioning, and detailed token/cost logging.
- Implement atomic classification usage.

Exit: scheduled items reach scored/skipped opportunities without duplicate charge.

### Day 4 — opportunity feed and drafting

- Feed/query endpoint with cursor pagination and filters.
- Dashboard cards and detail/edit states.
- Terra Stage 2 draft job with low reasoning, karma policy resolution, structured output, and deterministic leakage checks.
- Draft usage reservation and retry idempotency.

Exit: an owned qualified opportunity can produce and persist a compliant editable draft.

### Day 5 — workflow and analytics (complete)

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
| Reddit policy enforcement, token revocation, or API restriction | Can degrade or stop the primary product | Server-side app read token, conservative adaptive polling, global dedupe/cache, kill switch, clear degraded state, and HN fallback; never scrape or evade limits |
| Other third-party API changes | Blocks live integrations | Verify on Day 0; keep adapters and fixtures |
| Reddit DOM drift | Breaks insertion | Adapter isolation, fallback copy, manual smoke, compatibility flag |
| Plan mispricing or weak result quality | Poor value or unsustainable cost | Version entitlements, cap AI work, measure qualified opportunities and draft-to-post conversion, and change only future plan versions |
| Two-week scope | Quality shortcuts | Treat safety/RLS/payment tests as gates; cut polish first |
| AI leakage/hallucination | Community/user harm | Conservative prompts, deterministic checks, human review |
| Duplicate scheduler/jobs/webhooks | Double cost/access | DB uniqueness, operation keys, transactions, reconciliation |
