# Local system architecture

## Goals

- one-command local startup;
- no hosted runtime dependency in default mode;
- high-quality manual discovery of posts and comments;
- replaceable AI and platform adapters;
- explicit user actions for every scan, AI call, and reply insertion;
- failure isolation between platforms;
- local data and credential ownership.

## Processes

The target local release contains two long-lived surfaces:

1. Local API/orchestrator — loopback HTTP API, embedded database, migrations, scan operations, AI providers, connector subprocesses, analytics, and extension pairing.
2. Dashboard — local Next.js interface that calls only the loopback API.

The browser extension is optional. It pairs with the local API and supports browser-backed connector sessions and native reply insertion. It is not an independent scheduler.

The current worker, scheduler, BullMQ, Redis, Supabase authentication, hosted RLS, entitlement, and payment components are transitional and will be removed from default startup after local parity.

## Embedded storage decision

The local database uses pinned `better-sqlite3` 12.10.0. It was selected instead of Node's built-in SQLite module because the built-in API remains release-candidate/experimental across part of the supported Node range. The pinned package supplies supported Node prebuilds and adds about 12 MB in this installation.

Local startup resolves its data root from `MENTIONISH_DATA_DIR` when explicitly set; otherwise it uses LocalAppData on Windows, Application Support on macOS, and XDG data directories on Linux. The repository itself never stores user data.

Startup creates directories, opens `mentionish.sqlite3`, enables foreign keys and WAL, applies checksum-verified ordered migrations, and refuses schemas newer than the running application. Online backups are integrity-checked before being reported successful.

## Component boundaries

### Domain repositories

Products, scans, source items, opportunities, drafts, feedback, and analytics depend on repository interfaces. The embedded implementation is the default. Hosted implementations remain temporarily for migration verification.

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

## Extension communication

The extension initiates a connection to the loopback API using its paired token. This avoids opening a public listener. Browser-backed scan work, when required, is delivered only while the extension and supported browser session are available.

The extension may:

- report supported platform/session readiness;
- execute explicitly requested read-only browser tasks;
- return normalized public content;
- look up the current source URL;
- fetch a selected local draft;
- insert text after user confirmation.

It may not submit, click vote/like/follow controls, send messages, or read unrelated browser history.

## Failure behavior

- One connector failure produces a partial scan result.
- Authentication failure disables further work for that connector until revalidated.
- Rate limiting stops or backs off that connector within the current scan only.
- AI failure preserves retrieved candidates for deterministic/manual review.
- Database migration failure prevents startup and points to backup/recovery instructions.
- Extension absence disables browser-dependent actions without blocking HN or local data.

## Migration strategy

Build local implementations beside hosted code. A feature switches to local mode only when its repository, API, UI, migration, and acceptance tests pass together. Remove hosted dependencies only after no default startup/import path references them.