# Requirements

Requirements use stable identifiers so implementation and tests can reference them.

## Local runtime

- LOC-001: Default mode is single-user and requires no Mentionish authentication.
- LOC-002: First startup creates and migrates an embedded local database automatically.
- LOC-003: Default startup requires no Docker, external PostgreSQL, Supabase, Redis, or cloud deployment.
- LOC-004: API and dashboard bind to loopback by default.
- LOC-005: One start command eventually starts the local runtime and opens the dashboard.
- LOC-006: Existing hosted code remains isolated until the equivalent local contract passes acceptance tests.

## Settings and secrets

- SET-001: Settings shows AI provider, platform/source, local data, appearance, privacy, and diagnostics sections.
- SET-002: OpenAI and Anthropic are supported through one provider interface.
- SET-003: Plaintext AI keys never return to the dashboard after submission.
- SET-004: Secrets are stored through an OS credential-store boundary with a documented encrypted fallback.
- SET-005: Every provider and connector has a user-triggered live validation action.
- SET-006: Reddit and X are disabled by default and display accepted-risk guidance.
- SET-007: Every experimental connector has an immediate local kill switch.

## Products and phrases

- PRO-001: Local mode allows unlimited products subject only to machine capacity.
- PRO-002: A product stores name, description, optional audience, optional URL, optional voice guidance, and active state.
- PRO-003: Product phrases are editable, normalized, deduplicated, and grouped by intent.
- PRO-004: With a configured AI provider, the user can explicitly request phrase suggestions from product context.
- PRO-005: Suggestions include problems, questions, alternatives, categories/use cases, audiences, and exclusions.
- PRO-006: Suggested phrases are never activated until the user accepts or edits them.
- PRO-007: Product creation works without AI suggestions.

## Manual discovery

- SCAN-001: No recurring scheduler or implicit background scan exists.
- SCAN-002: The user can scan all active products or one product.
- SCAN-003: A scan specifies products, enabled platforms, freshness window, and bounded result/query budgets.
- SCAN-004: The UI shows progress and per-platform results/errors.
- SCAN-005: Closing the only running local process stops the scan and must be explained.
- SCAN-006: Source operations run with timeouts, output limits, concurrency limits, and cancellation.
- SCAN-007: Authentication failure stops that connector immediately without disabling other sources.
- SCAN-008: Platform/external ID deduplication occurs before paid AI work.
- SCAN-009: Deleted/unavailable source content is removed or tombstoned after revalidation.
- SCAN-010: Session-backed connectors allow one active command by default, reuse cached results, and deduplicate queries before retrieval.
- SCAN-011: A connector obeys upstream cooldown/Retry-After signals and stops on authentication denial, access denial, challenge/CAPTCHA, restriction, or repeated incompatible responses.
- SCAN-012: Mentionish never rotates accounts, proxies, sessions, user agents, or backends to bypass platform controls.

## Sources

- SRC-001: Hacker News supports recent post and comment discovery without credentials.
- SRC-002: Reddit supports read/search of posts and comments through an Agent Reach-selected local backend.
- SRC-003: X supports read/search of posts, replies, and thread context only after Reddit acceptance is stable.
- SRC-004: Agent Reach is setup/diagnostics; runtime reads call allowlisted upstream executables directly.
- SRC-005: Installed/configured does not equal Ready; Ready requires an explicit bounded live read.
- SRC-006: Source adapters normalize content, context, author, URL, timestamps, public metrics, and metadata when available.
- SRC-007: Missing optional metrics never invalidates otherwise useful content.
- SRC-008: No source adapter exposes a write, post, vote, like, follow, or message operation.

## Relevance quality

- REL-001: Retrieval uses approved product phrases and platform-appropriate query variants.
- REL-002: Deterministic phrase matching precedes optional AI classification.
- REL-003: Classification evaluates audience fit, problem fit, intent/urgency, reply opportunity, recency, and spam/noise.
- REL-004: Every qualified result includes a bounded score and concise user-visible reason.
- REL-005: Results below the configurable qualification threshold do not enter the default active feed.
- REL-006: User feedback reasons are stored locally and can improve later recommendations without silently changing settings.
- REL-007: Ranking favors useful recent conversations, not raw engagement volume.
- REL-008: Posts and comments are first-class content types with thread/parent context.

## Drafting and manual reply

- DRAFT-001: Draft generation requires an explicit user action and a validated provider.
- DRAFT-002: Draft prompts include source context, product context, voice guidance, and applicable community risk guidance.
- DRAFT-003: Draft text is editable and versioned locally.
- DRAFT-004: Mentionish provides Copy draft and Open source but never reads from or inserts into a platform editor.
- DRAFT-005: Copy draft is available for every generated draft regardless of source.
- DRAFT-006: Replied is user-declared and never inferred from copying or opening a source.
- DRAFT-007: AI output and source content are untrusted and human-reviewed.
- DRAFT-008: Reddit draft generation, editing, copying, and Open source remain available before native review because the checklist is advisory and Mentionish does not control the native editor.
- DRAFT-009: Local mode has no Mentionish classification or draft quota; usage limits apply only to hosted entitlements.

## Dashboard and analytics

- UI-001: Navigation contains Overview, Products, Conversations, Scans, Analytics, and Settings.
- UI-002: Every data screen has loading, honest empty, success, partial failure, permission/setup, and retry states.
- UI-003: Connector risk and readiness are visible before scanning.
- UI-004: The interface is keyboard accessible and announces asynchronous progress.
- AN-001: Analytics shows locally found, qualified, drafted, useful, skipped, and manually replied counts for 7/30 days.
- AN-002: Analytics can filter by product and platform.
- AN-003: No claim is made about verified posting or downstream engagement.

## Privacy and security

- SEC-001: Platform cookies are not copied into Mentionish's database.
- SEC-002: The local API rejects unexpected origins and non-loopback exposure by default.
- SEC-003: Mentionish ships no browser extension or extension-pairing API; OpenCLI browser integration remains an isolated upstream read-only dependency.
- SEC-004: Executables are allowlisted and spawned without a shell using argument arrays.
- SEC-005: Logs and errors exclude credentials and unnecessary raw personal data.
- SEC-006: Local backup/export is explicit and warns that content may contain public usernames and text.
- SEC-007: The application clearly states Reddit/X enforcement risk and never promises that an unofficial connector or numeric activity threshold is safe or approved.
- SEC-008: Account safety uses Unknown, Caution, Paused, and Blocked evidence states; successful access is never labeled Safe.
- SEC-009: Karma, account age, community karma, and eligibility are context only and never drive farming, account-warming, or restriction-bypass recommendations.
- SEC-010: Community rules and native eligibility must be reviewed before assisted replies; stale or missing rules require explicit native review.
- SEC-011: Mentionish never creates, rotates, or recommends alternate accounts to evade restrictions or bans.
- SEC-012: Policy links and last-reviewed dates are visible for experimental connectors.
