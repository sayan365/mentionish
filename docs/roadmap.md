# Local-first implementation roadmap

## Status — 2026-08-07

Mentionish is now a single-user local-first open-source application. The hosted prototype runtime has been removed.

Completed:

- local-first product decision and canonical documentation;
- Agent Reach/upstream boundary;
- typed bounded local connector diagnostics;
- local readiness command;
- Phase 1 embedded SQLite foundation and persistence tests;
- Phase 2 local API, no-login dashboard, and one-command startup;
- Phase 3 universal AI provider gateway and phrase recommendations;
- Phase 4 manual Hacker News scan engine and durable conversation feed.

No phase is complete merely because the hosted equivalent exists.

## Phase 1 — embedded data foundation — complete 2026-08-07

- pinned `better-sqlite3` 12.10.0 with TypeScript declarations;
- implemented Windows/macOS/Linux application-data paths plus `MENTIONISH_DATA_DIR` override;
- implemented checksum-verified migration runner, schema version guard, foreign keys, WAL, and busy timeout;
- implemented local product and first-class phrase repositories with normalization, update, archive, and restore;
- implemented integrity-checked online backups;
- added temporary-database, migration idempotency, restart persistence, lifecycle, duplicate, backup, and future-schema tests;
- kept hosted exports temporarily until Phase 2 local parity passed; Phase 9 has now removed them.

Exit evidence: 10 database tests pass, including close/reopen persistence with no Supabase call.

## Phase 2 — local API and no-login shell — complete 2026-08-07

- added the credential-free local runtime, which is now the only supported mode;
- bound local API to `127.0.0.1` and enforced the configured dashboard origin;
- created a persistent private installation token and exact-origin loopback bootstrap;
- protected local routes with timing-safe installation-token verification and a fixed local owner;
- wired status, settings, products, analytics, and empty conversation routes to local implementations;
- removed the Supabase session redirect, sign-out UI, plan/quota presentation, and account requirement;
- removed temporary hosted authentication and repository compatibility after local parity passed;
- added `npm start` orchestration for shared builds, API, dashboard, readiness checks, and browser opening;
- verified clean startup and product creation/readback over HTTP with temporary local data.

Exit evidence: database 10/10, API 27/27, and dashboard 10/10 tests pass; the clean-start API and dashboard both return HTTP 200 without Supabase or Redis.

## Phase 3 â€” provider settings and phrase recommendations â€” complete 2026-08-07

- added a SecretStore boundary with AES-256-GCM encrypted local-file storage and private key/file permissions where supported;
- kept plaintext provider keys out of SQLite, API reads, browser state after save, logs, and provider request bodies;
- added provider-neutral OpenAI Responses and Anthropic Messages adapters with current structured-output contracts;
- added recommended editable defaults (`gpt-5.6-terra` and `claude-sonnet-5`), custom model entry, masked suffixes, validation time, and explicit connection testing;
- expanded the provider gateway to OpenRouter and arbitrary OpenAI-compatible endpoints, including keyless local servers;
- added live model discovery, recommended fallback catalogs, custom model IDs, and separate classification/analysis versus drafting roles;
- added local provider save/read/test/delete routes and sanitized provider errors;
- added a Settings screen plus explicit phrase generation from unsaved product context;
- made every suggestion individually reviewable before adding it to the ordinary editable phrase field;
- exposed provider, model, latency, and returned token usage for each suggestion request;
- added OpenAI/Anthropic request fixtures, encrypted-vault tests, and non-secret metadata tests.

Exit evidence: AI 8/8, API 29/29, database 10/10, and dashboard 10/10 tests pass; API and dashboard production builds pass. No live provider call was made because no user key is required for automated verification.

## Phase 4 — manual scan engine — complete 2026-08-07

- replaced scheduler/Redis semantics with explicitly started in-process operations;
- added Scan all and per-product Scan controls plus authenticated APIs;
- added the first bounded query planner, cancellation, progress, and sanitized failures; Phase 5 later replaced its seven-day/context-reducing behavior after live-result review;
- added recent HN story and comment search through the HN Search API;
- added SQLite source, opportunity, and scan-run persistence with global source and per-product opportunity deduplication;
- added boundary-aware positive phrase matching, exclusions, and explainable baseline scores.

Exit evidence: database 10/10 and API 30/30 tests pass, including fixture-backed story/comment ingestion and repeat-scan deduplication. Manual HN scans produce durable ranked candidates without a worker, scheduler, Redis, or platform credentials.

## Phase 5 — relevance and conversations — in progress 2026-08-23

- [complete] provider-neutral classification through OpenAI, Anthropic, OpenRouter, and OpenAI-compatible endpoints;
- [complete] deterministic prefiltering, per-product/source deduplication, and a precision-first AI persistence gate;
- [complete] deterministic multi-dimensional classification that separates `worth_helping` from `potential_buyer` and persists both with concise explanations;
- [complete] fail-closed behavior when classification is not configured or the provider fails;
- [complete] durable per-source scan funnel counters for reviewed, phrase-matched, AI-rejected, qualified, and newly added items;
- [complete] bounded candidate audit with qualified/rejected scores, concise reasons, matched phrases, native source links, and a dashboard review panel;
- [complete] post/comment type plus five dimension scores in the retained decision audit and conversation labels;
- [complete] balanced 20-phrase AI recommendations, full-set query sampling, compact query expansion, and bounded natural-wording matching;
- [complete] versioned 24-case offline tier-policy benchmark with balanced coverage, precision/recall thresholds, and zero non-actionable reply-queue leakage;
- [complete] bounded parent-thread context for Reddit and Hacker News comment classification;
- [complete] live-scan retrieval correction: context-preserving phrase queries, high-intent AI anchor families, Reddit-primary 10-query allocation, 30-day standard discovery, and 90-day deep discovery;
- [complete] remove broad-context collapse such as turning `where do founders find customers` into `find customers`; retain audience/domain terms that prevent unrelated results;
- [complete] product-understanding-first discovery: enhancement now models the user, before-state, trigger, workaround, core job, outcome, and non-fit boundary before producing a canonical profile;
- [complete] balanced demand-lane planning across direct tool/category need, current pain, trigger situation, failed workaround, help questions, and audience-stage context instead of repeating one outcome with synonyms;
- [complete] Reddit relevance-ordered search within the freshness window; live verification showed it retrieves the same high-intent SaaS conversations visible through manual Reddit search, while newest-first search returned unrelated incidental-word matches;
- [complete] query-balanced Reddit thread expansion so comment reads cover distinct demand hypotheses before any one search lane receives additional depth;
- [complete] preserve AI phrase kind, source, and rationale through local product save/reload so a balanced set is not flattened into anonymous category keywords;
- [complete] append-only human review for qualified and rejected scan candidates with correction history;
- [complete] real-result agreement, actionable precision/recall, false-positive/false-negative metrics, and privacy-minimized export;
- [in progress] accumulate provider-specific evidence from human-reviewed real scan results;
- New/Saved/Drafted/Replied/Skipped workflow;
- [complete] append-only useful/not-relevant feedback with structured reasons, optional notes, correction history, and reversible workflow status;
- [complete] local 7/30-day feedback analytics with usefulness rate and top negative reason;
- [complete] conservative feedback calibration with minimum evidence thresholds and bounded source/phrase score adjustments; approved phrases are never silently changed;
- [pending] grow the acceptance set from sanitized real false positives/negatives and tune only when those cases demonstrate a policy error.

Exit: curated top-result quality reaches the acceptance threshold.

## Phase 6 — experimental Reddit — expedited/in progress 2026-08-07

- [complete] Agent Reach/OpenCLI setup diagnostics and Windows launcher detection;
- [in progress] OpenCLI is wired into the local scan engine; legacy rdt-cli remains diagnostic fallback only;
- [complete] accepted-risk flag and explicit no-safety-guarantee guidance;
- [complete] canonical Account Safety Center with Unknown/Caution/Paused/Blocked evidence states, recent sanitized evidence, local read volume, and no fabricated Safe state;
- [complete] append-only 24-hour user-native community-rule snapshots, verified-account context, and an advisory preflight before manual replying;
- [complete] one active Reddit browser command, Retry-After cooldown enforcement, manual pause, and no-bypass stop conditions;
- [complete] profile-pinned `whoami` readiness, persistent kill switch, and auth/rate-limit failure handling;
- [complete] bounded newest post search, bounded thread comments, public optional metrics, normalization, and deduplication;
- authentic-account bounded smoke acceptance with no claim of approval or safety.

Exit: explicit Reddit scan works locally, fails closed on enforcement signals, exposes community/account warnings, and never exposes a write command.

## Phase 7 — drafting and manual reply — complete 2026-08-25

- [complete] provider-neutral local drafting with the user-selected drafting model;
- [complete] durable idempotent operations, current drafts, append-only versions, optimistic edit conflicts, and restart recovery;
- [complete] inline draft review/editing with explicit Copy draft and Open source actions for every platform;
- [complete] no Mentionish browser extension, editor insertion, or platform write surface;
- [complete] no-submit/no-write audits.

Exit: user can generate, review, edit, and copy a draft, then open the source and paste/submit it manually.

## Phase 8 — experimental X

Begin only after Reddit is reliable:

- twitter-cli/OpenCLI adapters;
- X posts/replies/thread context;
- X risk/setup/live read UI;
- source parsing and the same copy/open manual-reply workflow;
- failure isolation and acceptance fixtures.

Exit: optional X scans meet the same read-only and quality gates.

## Phase 9 — packaging and open-source release

- [complete 2026-08-25] remove Redis, BullMQ, the scheduler/worker workspaces, queue job contracts, and obsolete hosted live-smoke scripts;
- [complete 2026-08-25] remove Supabase, PostgreSQL adapters, hosted auth, entitlements/quotas, hosted migrations/tests, and obsolete linked scripts;
- remove unused packages and generated artifacts;
- finalize MIT versus AGPL-3.0 license;
- clean installation and upgrade docs;
- [complete 2026-08-26] add integrity-checked backup/download, recoverable workspace reset, offline restore/move guidance, and uninstall docs;
- Windows/macOS/Linux CI and clean-machine tests;
- security, privacy, dependency, and license review;
- screenshots/demo and contributor guide.

Exit: a new user can clone, install, start, configure, scan, review, and reply manually from a polished local application.

## Scope rules

- No background scheduler.
- No automatic platform action.
- No X work before Reddit acceptance.
- No hosted runtime compatibility in the public local release.
- No broad platform expansion before conversation quality is strong.
