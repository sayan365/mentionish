# Manual discovery pipeline

## Principle

A scan exists only because the user clicked Scan all products or Scan this product. Mentionish does not create cron tasks, repeatable jobs, startup scans, hidden timers, or server-side polling.

## Query planning

Each product has approved positive phrases and optional exclusions. The planner:

1. groups phrases by problem, question, alternative, category/use case, and audience;
2. removes duplicates and overly broad standalone tokens;
3. creates platform-appropriate bounded query variants;
4. combines only compatible phrases rather than generating an uncontrolled Cartesian product;
5. applies language, community, freshness, and exclusion settings;
6. records the exact sanitized queries used by the scan.

AI may recommend queries before a scan, but only user-approved product phrases become durable inputs.

## Source coverage

### Hacker News

Search recent stories and comments. Preserve story context for matching comments. Use stable public identifiers and URLs. HN remains usable if every experimental connector is disabled.

### Reddit

Retrieve recent posts and comments/replies through the configured local backend. Preserve subreddit, parent/thread relationships, author, score, comment count, timestamps, and karma/account metadata only when returned by the upstream tool.

### X

After activation, retrieve posts, replies, quoted context, and thread context through the configured local backend. Preserve public engagement metrics when available. Missing metrics are not an error.

## Execution

- One active operation per product/platform.
- One command at a time per session-backed platform by default.
- Cross-platform concurrency is bounded.
- Every command has a deadline and output cap.
- User cancellation propagates to running child processes.
- Authentication failure stops that platform immediately.
- Rate limiting stops or backs off within the explicit scan; it never creates a future schedule.
- Partial success is persisted and clearly reported.
- Session-backed sources obey the stop conditions and evidence states in [account-safety.md](account-safety.md).
- A platform denial cannot be bypassed by rotating accounts, sessions, proxies, user agents, or fallback backends.

## Normalization and deduplication

Normalize every result to platform, external ID, content type, thread/parent IDs, community, title/body, author, URL, source timestamps, public metrics, and metadata.

Deduplicate in this order:

1. exact platform and external ID;
2. same canonical URL;
3. unchanged content hash;
4. product/source opportunity uniqueness.

Re-seeing an item refreshes public fields without erasing user workflow status or draft edits.

## Relevance pipeline

### Stage 0: source validity

Reject deleted, unavailable, malformed, unsupported-language when configured, empty, or obviously promotional/spam content.

### Stage 1: deterministic matching

Match normalized approved phrases against title, body, and limited thread context. Exclusions can reject or reduce a result. Record matched phrase IDs.

### Stage 2: AI classification

When enabled, classify only candidates that survive deterministic matching. Score:

- customer/audience fit;
- problem/use-case fit;
- intent or urgency;
- whether a helpful reply is appropriate;
- recency;
- spam/self-promotion risk.

Return final score, concise reason, and optional evidence snippets. Do not expose hidden chain-of-thought.

### Ranking

Default ranking combines final relevance, recency, explicit help/comparison signals, content completeness, and local feedback calibration. Raw karma/likes are weak supporting features, not the main score.

## Posts and comments

Posts, comments, and replies are first-class source items. A comment result must include enough parent/thread context to understand it. The opportunity URL should open the most specific native item supported by the platform.

## Feedback loop

Useful and not-relevant feedback updates local statistics by product, phrase, platform, and reason. The system may later suggest phrase changes, but it never silently adds/removes phrases or auto-replies.

## Freshness and retention

Default scan freshness is seven days and is user-adjustable within bounded limits. Freshness is not permission to scrape, and no query frequency is described as platform-approved. Source revalidation tombstones deleted items. Retention and cleanup are local settings with safe defaults and backup awareness.
## Implemented Hacker News slice

The local Phase 4 engine uses the public HN Search API `search_by_date` endpoint. For each product it searches at most ten active positive phrases across stories and comments, with 20 results per query and a seven-day freshness cutoff. This is a strict ceiling of 20 source queries per product and 60 source queries for the entire click.

The API creates a durable `scan_runs` record before execution. `POST /api/scans` accepts an optional `product_id`; omitting it scans all active products. `GET /api/scans/:id` reports progress, and `POST /api/scans/:id/cancel` aborts the active HTTP request and marks the operation cancelled. Only one scan may run at a time in the current single-user application.

Results are matched again locally using boundary-aware approved phrases. Active exclusions suppress a candidate. Surviving candidates are deduplicated in memory and passed to the configured classification model. Only candidates scoring 70 or higher are persisted as opportunities, using the model's concise reason. If classification is not configured or fails, the scan stops safely and does not persist unqualified conversations. HN source items are unique by platform and external ID, and opportunities are unique by product and source item, so repeat scans refresh source data without duplicating the conversation feed.
## Implemented experimental Reddit slice

When both `REDDIT_DISCOVERY_ENABLED=true` and `REDDIT_POLICY_RISK_ACCEPTED=true` are configured, the manual scan engine runs Reddit before the Hacker News fallback. Reddit remains disabled until Settings verifies a selected OpenCLI browser profile with `whoami`.

Each product scan searches at most five approved phrases, requests at most ten newest results per phrase from the previous week, and reads comments for at most ten unique result threads. Commands are allowlisted to `whoami`, `search`, and `read`, launched without a shell, bounded to 60 seconds and 2 MiB output, cancellable, and pinned to the selected profile. Posts and returned comments are normalized into the same SQLite source/opportunity tables and deduplicated per product.

Current OpenCLI comment output does not expose native comment IDs. Mentionish therefore derives a stable synthetic identity from thread, author, and bounded text and opens the parent thread URL. This limitation is shown here rather than fabricating a native comment permalink. Reddit candidates pass through the same configured AI qualification gate as Hacker News candidates before they can appear in Conversations. Authentication, authorization, rate-limit, challenge, or restriction signals stop Reddit, persist its kill switch, and allow Hacker News to finish as fallback.