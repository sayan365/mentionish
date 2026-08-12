# Local-first implementation roadmap

## Status — 2026-08-07

The hosted prototype through opportunity workflow and analytics exists and remains the visual/domain reference. The active direction is a single-user local-first open-source application.

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
- kept every hosted Supabase export and caller intact for the Phase 2 migration.

Exit evidence: 10 database tests pass, including close/reopen persistence with no Supabase call.

## Phase 2 — local API and no-login shell — complete 2026-08-07

- added explicit local/hosted runtime modes with local as the credential-free default;
- bound local API to `127.0.0.1` and enforced the configured dashboard origin;
- created a persistent private installation token and exact-origin loopback bootstrap;
- protected local routes with timing-safe installation-token verification and a fixed local owner;
- wired status, settings, products, usage, analytics, and empty conversation routes to local-mode implementations;
- removed the Supabase session redirect, sign-out UI, plan/quota presentation, and account requirement from local mode;
- retained hosted authentication and repositories only behind explicit hosted mode;
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
- added a seven-day query planner, ten-phrase-per-product budget, cancellation, progress, and sanitized failures;
- added recent HN story and comment search through the HN Search API;
- added SQLite source, opportunity, and scan-run persistence with global source and per-product opportunity deduplication;
- added boundary-aware positive phrase matching, exclusions, and explainable baseline scores.

Exit evidence: database 10/10 and API 30/30 tests pass, including fixture-backed story/comment ingestion and repeat-scan deduplication. Manual HN scans produce durable ranked candidates without a worker, scheduler, Redis, or platform credentials.

## Phase 5 — relevance and conversations — in progress 2026-08-07

- [complete] provider-neutral classification through OpenAI, Anthropic, OpenRouter, and OpenAI-compatible endpoints;
- [complete] deterministic prefiltering, per-product/source deduplication, and a precision-first AI persistence gate;
- [complete] deterministic multi-dimensional classification that separates `worth_helping` from `potential_buyer` and persists both with concise explanations;
- [complete] fail-closed behavior when classification is not configured or the provider fails;
- [complete] durable per-source scan funnel counters for reviewed, phrase-matched, AI-rejected, qualified, and newly added items;
- [complete] bounded candidate audit with qualified/rejected scores, concise reasons, matched phrases, native source links, and a dashboard review panel;
- [complete] post/comment type plus five dimension scores in the retained decision audit and conversation labels;
- [complete] balanced 20-phrase AI recommendations, full-set query sampling, compact query expansion, and bounded natural-wording matching;
- [in progress] curated real-result quality evaluation and richer thread context;
- New/Saved/Drafted/Replied/Skipped workflow;
- useful/not-relevant feedback reasons;
- local analytics.

Exit: curated top-result quality reaches the acceptance threshold.

## Phase 6 — experimental Reddit — expedited/in progress 2026-08-07

- [complete] Agent Reach/OpenCLI setup diagnostics and Windows launcher detection;
- [in progress] OpenCLI is wired into the local scan engine; legacy rdt-cli remains diagnostic fallback only;
- [complete] accepted-risk flag and explicit no-safety-guarantee guidance;
- Account Safety Center with Unknown/Caution/Paused/Blocked evidence states;
- community-rule snapshots, eligibility context, and reply preflight;
- conservative session concurrency, cache reuse, cooldown enforcement, and no-bypass stop conditions;
- [complete] profile-pinned `whoami` readiness, persistent kill switch, and auth/rate-limit failure handling;
- [complete] bounded newest post search, bounded thread comments, public optional metrics, normalization, and deduplication;
- authentic-account bounded smoke acceptance with no claim of approval or safety.

Exit: explicit Reddit scan works locally, fails closed on enforcement signals, exposes community/account warnings, and never exposes a write command.

## Phase 7 — drafting and extension

- provider-neutral drafting;
- local draft versions;
- loopback extension pairing;
- Reddit editor lookup/sidebar;
- copy and explicit insert;
- no-submit/no-write audits.

Exit: user can review and insert a draft, with submission remaining fully manual.

## Phase 8 — experimental X

Begin only after Reddit is reliable:

- twitter-cli/OpenCLI adapters;
- X posts/replies/thread context;
- X risk/setup/live read UI;
- source parsing and extension support where feasible;
- failure isolation and acceptance fixtures.

Exit: optional X scans meet the same read-only and quality gates.

## Phase 9 — packaging and open-source release

- remove Supabase, Redis, BullMQ, scheduler, hosted auth, entitlements, payments, and obsolete scripts from default code;
- remove unused packages and generated artifacts;
- finalize MIT versus AGPL-3.0 license;
- clean installation and upgrade docs;
- data backup/restore and uninstall docs;
- Windows/macOS/Linux CI and clean-machine tests;
- security, privacy, dependency, and license review;
- screenshots/demo and contributor guide.

Exit: a new user can clone, install, start, configure, scan, review, and reply manually from a polished local application.

## Scope rules

- No background scheduler.
- No automatic platform action.
- No X work before Reddit acceptance.
- No hosted rewrite during local parity work.
- No deleting the hosted implementation until the replacing local slice passes.
- No broad platform expansion before conversation quality is strong.