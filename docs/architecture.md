# Local system architecture

## Goals

- one-command local startup;
- no hosted runtime dependency in default mode;
- high-quality manual discovery of posts and comments;
- replaceable AI and platform adapters;
- explicit user actions for every scan, AI call, draft copy, and self-reported reply;
- failure isolation between platforms;
- local data and credential ownership.

## Processes

The target local release contains two long-lived surfaces:

1. Local API/orchestrator — loopback HTTP API, embedded database, migrations, scan operations, AI providers, connector subprocesses, and analytics.
2. Dashboard — local Next.js interface that calls only the loopback API.

Mentionish ships no browser extension. OpenCLI owns any browser integration required for supervised Reddit reads. Replying uses Copy draft and Open source, followed by a manual paste and submission on the platform.

Discovery, classification, and drafting execute as bounded user-started operations inside the local API. The legacy worker, scheduler, BullMQ, Redis, Supabase authentication, hosted repositories, RLS, entitlements, and payment-era runtime have been removed.

## Embedded storage decision

The local database uses pinned `better-sqlite3` 12.10.0. It was selected instead of Node's built-in SQLite module because the built-in API remains release-candidate/experimental across part of the supported Node range. The pinned package supplies supported Node prebuilds and adds about 12 MB in this installation.

Local startup resolves its data root from `MENTIONISH_DATA_DIR` when explicitly set; otherwise it uses LocalAppData on Windows, Application Support on macOS, and XDG data directories on Linux. The repository itself never stores user data.

Startup creates directories, opens `mentionish.sqlite3`, enables foreign keys and WAL, applies checksum-verified ordered migrations, and refuses schemas newer than the running application. Online backups are integrity-checked before being reported successful.

## Component boundaries

### Domain repositories

Products, scans, source items, opportunities, drafts, feedback, and analytics depend on repository interfaces backed by the embedded SQLite implementation.

### AI providers

KeywordSuggestionProvider, RelevanceProvider, and DraftProvider isolate provider-specific request/response formats. OpenAI and Anthropic implement the same domain outputs. Provider selection and models are local settings.

### Source adapters

Each source implements:

- diagnose;
- liveReadTest;
- search;
- readThread when supported;
- normalize;
- cancel.

There is deliberately no write method.

### Connector runner

The connector runner starts allowlisted executables directly with argument arrays, a fixed working directory, sanitized child environment, deadline, output cap, and cancellation signal. It never evaluates shell text assembled from product or source content.

## Manual scan sequence

1. Dashboard sends a scan request with product IDs and platform IDs.
2. API validates local settings and creates a scan operation.
3. Query planner builds bounded queries from approved phrases and exclusions.
4. Platform adapters execute sequentially per platform with bounded cross-platform concurrency.
5. Results are normalized into source items and thread relationships.
6. Global platform/external-ID deduplication removes repeated items.
7. Deterministic product matching removes obvious noise.
8. Optional AI classification scores remaining matches.
9. Qualified opportunities and reasons are stored transactionally.
10. Dashboard receives/polls progress and renders partial source failures.
11. The scan ends. Nothing schedules another run.

## Manual reply boundary

Mentionish can generate, edit, and copy a draft and open its source URL. It does not inspect or modify a platform reply editor. The user pastes, reviews, and submits through the platform's native interface. OpenCLI browser access is isolated to supervised read/search operations and is not a Mentionish posting bridge.

## Failure behavior

- One connector failure produces a partial scan result.
- Authentication failure disables further work for that connector until revalidated.
- Rate limiting stops or backs off that connector within the current scan only.
- AI failure preserves retrieved candidates for deterministic/manual review.
- Database migration failure prevents startup and points to backup/recovery instructions.
- OpenCLI absence disables supervised Reddit reads without blocking Hacker News, drafting, copying, or local data.

## Change strategy

A feature is complete only when its repository, API, UI, migration, and acceptance tests pass together. New runtime dependencies must preserve one-command local startup and local data ownership.
