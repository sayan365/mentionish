# Requirements

Requirement IDs are stable references for code, migrations, tickets, and tests. “Must” means required for v1. Proposed behavior is kept out of this file until approved.

## Account and product setup

- **AUTH-001:** The system must authenticate dashboard users with Supabase Auth.
- **AUTH-002:** Every authenticated user must have exactly one application profile linked to `auth.users`.
- **AUTH-003:** V1 dashboard authentication must use Supabase Google OAuth as the primary method, retain email magic links as fallback, and require a verified email before trial activation.
- **AUTH-004:** Users must not be required or offered to connect a Reddit account in v1; Reddit discovery credentials remain server-only and the extension uses only Mentionish authentication plus the user’s existing Reddit page session.
- **PROD-001:** A user must be able to create a product with a name, description, keywords, and optional voice persona.
- **PROD-002:** A user must only read or modify products they own.
- **PROD-003:** Product keywords must be normalized and validated before use in discovery.

## Discovery

- **DISC-001:** The system must discover new Reddit submissions with active product keywords through the selected server-side read transport. Reddit OAuth2 search remains preferred. The live-verified `opencli` desktop fallback is allowed only for supervised validation under `DEC-026`; the `rdt_cli` path remains a legacy fallback under `DEC-025`.
- **DISC-002:** Reddit discovery must run approximately every 20–30 minutes and respect platform rate limits through pacing, queues, backoff, and retry.
- **DISC-003:** The system must poll Hacker News `newstories` and `askstories` approximately every 15 minutes.
- **DISC-004:** Hacker News item details must be keyword-filtered by title/text before AI processing.
- **DISC-005:** Platform items must be deduplicated globally by `(platform, external_id)`.
- **DISC-006:** A shared scanned post may match multiple user products without duplicating platform content.
- **DISC-007:** Discovery must not scrape in the Chrome extension or use platform write APIs.
- **DISC-008:** Live Reddit ingestion must use one server-side identity through the selected read-only backend, with conservative global query budgets, jitter, batching, caching, and global deduplication. Temporary browser/cookie backends must use one dedicated account and sequential bounded subprocess calls.
- **DISC-009:** Reddit ingestion must have an operator kill switch and must never rotate credentials or identities to evade platform enforcement or limits, invoke Reddit write commands, or imply Reddit approval. The only temporary non-OAuth transports permitted are the documented `DEC-025` and `DEC-026` fallbacks.
- **DISC-010:** Losing authorization for the selected server-side Reddit backend must stop all scheduled Reddit work and surface a degraded operator/user state without exposing credential details. An explicit operator action is required to clear the persistent authentication halt.

## Intent and drafting

- **AI-001:** Every eligible new product/post match must be scored through OpenAI Responses using the configured `gpt-5.6-luna` classifier role with reasoning effort `none`.
- **AI-002:** Classification must return an integer score from 0 through 100 and concise reasoning.
- **AI-003:** Opportunities below 60 must be marked skipped and must not proceed automatically to drafting.
- **AI-004:** User-requested draft generation must use OpenAI Responses with the configured `gpt-5.6-terra` draft role and reasoning effort `low`, only for qualified opportunities.
- **AI-005:** Draft prompts must include post content, product context, voice persona, and applicable subreddit promotion state.
- **AI-006:** Newcomer drafts must contain neither a link nor the product name.
- **AI-007:** Provider details must remain behind the `classifyIntent()` and `generateDraft()` adapter contracts; thread summarization is excluded from v1.
- **AI-008:** Every AI call must record token usage and attribution sufficient for per-user cost monitoring.
- **AI-009:** AI output must be treated as untrusted content and remain human-reviewed.
- **AI-010:** Every OpenAI call must use `store: false`, strict structured output where applicable, explicit reasoning effort, and a configured output-token cap.
- **AI-011:** A model-role change must pass the labeled quality, policy-leakage, structured-output, latency, and cost evaluation set before production rollout.

## Opportunity workflow

- **OPP-001:** The dashboard must list opportunities for a selected product, paginated and ordered by intent score.
- **OPP-002:** Each opportunity view must show platform, source content/context, score, reasoning, lifecycle status, and draft when available.
- **OPP-003:** A user must be able to generate a draft for a qualified opportunity, subject to ownership and quota.
- **OPP-004:** A user must be able to edit and persist draft text.
- **OPP-005:** A user must be able to mark an opportunity posted or skipped.
- **OPP-006:** “Posted” is user-declared in v1; the system must not imply verified platform posting.

## Karma gating

- **KARMA-001:** Tracked Reddit communities must have a karma stage and manually maintained promotion rules.
- **KARMA-002:** Newcomer output must be pure value-add with no product name or link.
- **KARMA-003:** Contributor output may include a link only when self-promotion is allowed and the user has at least three prior non-promotional comments in that subreddit.
- **KARMA-004:** Trusted and established output may mention/link according to manually recorded subreddit rules.
- **KARMA-005:** The system must not automatically infer subreddit promotion rules in v1.
- **KARMA-006:** Launch data must cover 20–30 target subreddits.
- **KARMA-007:** Community standing must be keyed by Mentionish user and subreddit rather than by product or an OAuth-verified Reddit identity.
- **KARMA-008:** Missing or more-than-90-day-old community rules must force newcomer-safe output.

## Chrome extension and posting boundary

- **EXT-001:** The Chrome extension must use Manifest V3, a content script, and a service worker.
- **EXT-002:** The content script must only match Reddit pages.
- **EXT-003:** On a supported Reddit thread, the extension must securely look up the current user's matching opportunity by external post ID.
- **EXT-004:** For a `new` or `drafted` opportunity, the extension must render an isolated sidebar with score, reasoning, and editable draft text.
- **EXT-005:** The extension may insert text into Reddit's native comment editor and dispatch the required input event.
- **EXT-006:** The extension must never submit the comment or invoke Reddit's write API.
- **EXT-007:** The extension must authenticate with a user-generated, revocable backend token rather than reading dashboard session cookies.
- **EXT-008:** The extension must not scrape in the background or access Reddit cookies beyond normal page context.
- **HN-001:** Hacker News posting assistance must be limited to copying a draft and opening the native thread.

## Payments and quotas

- **PAY-001:** The dashboard must create a hosted Dodo checkout session for the Founder Lifetime product.
- **PAY-002:** The backend must treat verified webhook state—not a checkout redirect—as the source of entitlement truth.
- **PAY-003:** The webhook endpoint must verify Dodo's required signature before processing an event.
- **PAY-004:** Payment success must activate the corresponding plan and limits.
- **PAY-005:** Failure, renewal, cancellation, and refund event types must be handled or safely recorded as specified by the supported products.
- **PAY-006:** Webhook processing must be idempotent.
- **USAGE-001:** Scan and draft limits must be enforced atomically on the server.
- **USAGE-002:** Users must be able to view current usage and limits.
- **USAGE-003:** Exhausted quota must prevent the chargeable operation with a structured error.
- **USAGE-004:** Plan prices and limits must use versioned server configuration so a future offer change does not alter an existing buyer’s entitlement.

## Analytics and operations

- **AN-001:** The dashboard must show opportunities found for 7-day and 30-day periods.
- **AN-002:** The dashboard must show drafts generated, items marked posted, and draft-to-post conversion.
- **AN-003:** V1 must not synchronize platform engagement metrics.
- **OPS-001:** Scheduled and asynchronous work must be observable and retryable where appropriate.
- **OPS-002:** Secrets must remain server-side, except for the scoped extension credential stored by the extension.
- **OPS-003:** Production data, logs, and errors must not expose raw credentials or unnecessary personal data.
- **OPS-004:** The Next.js dashboard must target Cloudflare Workers through the supported OpenNext adapter and pass a Workers-runtime preview test.
- **OPS-005:** The Express API, singleton scheduler, and BullMQ worker must run as independently deployable Railway processes.
- **PRIV-001:** Raw prompts and raw model responses must not be retained in application AI logs.
- **PRIV-002:** Account, platform-content, log, AI-metadata, and extension-token deletion must follow `DEC-020`.

## Hard constraints

- **SAFE-001:** No code path may automatically publish a Reddit or Hacker News response.
- **SAFE-002:** Reddit calls must respect current platform rate limits.
- **SAFE-003:** Cost control is a release blocker: model routing and backend quota enforcement must be tested.
- **SAFE-004:** All user-owned data access must be protected by both API authorization and database row-level security.
