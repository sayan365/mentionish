# Manual discovery pipeline

## Principle

A scan exists only because the user clicked Scan all products or Scan this product. Mentionish does not create cron tasks, repeatable jobs, startup scans, hidden timers, or server-side polling.

## Query planning

Each product has approved positive phrases and optional exclusions. These are durable guidance, not the complete query list. The adaptive planner:

1. groups phrases by problem, question, alternative, category/use case, and audience;
2. removes duplicates and overly broad standalone tokens;
3. creates platform-appropriate bounded query variants;
4. combines only compatible phrases rather than generating an uncontrolled Cartesian product;
5. applies language, community, freshness, and exclusion settings;
6. generates bounded AI search hypotheses from product context when the configured model is available;
7. mixes unseen exploration with cooled-down proven and rotated queries from local scan memory;
8. records the exact sanitized queries and outcomes used by the scan.

AI-generated hypotheses are ephemeral scan inputs. Only user-approved product phrases remain durable product settings; executed hypotheses and aggregate outcomes are retained as local query memory.

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
- Each scan records Reddit/Hacker News source totals, new versus memory-guided searches, and the full reviewed → AI-candidate → AI-rejected → qualified → newly-added funnel.
- Phrase-matched candidates retain their score, concise reason, matched phrases, decision, and source context for the ten most recent scans; older audit rows and orphaned source rows are pruned.
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

Match normalized approved phrases against title, body, and limited thread context. Exclusions reject a result. Exact phrase evidence is prioritized, but bounded conceptual evidence from the product context and active search hypothesis can also admit a candidate to AI review. Record the strongest supporting phrases or adaptive hypothesis.

### Stage 2: AI classification

When enabled, classify only candidates that survive deterministic matching. The model independently scores audience fit, outcome-level problem fit, solution seeking, buying intent, reply appropriateness, and market-research value, while identifying need scope and author state. Application-owned rules then assign direct opportunity, helpful conversation, market signal, or irrelevant; the model cannot choose its own final tier.

A broad request for advice may be worth helping while retaining low buying intent. `potential_buyer` requires clear acquisition signals such as asking for a tool, recommendation, comparison, or workflow replacement. Return a concise reason without hidden chain-of-thought.

Audience membership is not enough by itself. Best opportunities require a current problem the product directly addresses and explicit interest in the same product category. Adjacent software requests and strong customer-acquisition questions can appear only as Possible matches, while unrelated problems and posts promoting competing solutions are rejected. Same-author cross-posts with the same normalized title share one scan identity and one visible feed result; rejection also removes an older matching cross-post from the active feed.

### Ranking

Default ranking combines final relevance, recency, explicit help/comparison signals, content completeness, and local feedback calibration. Raw karma/likes are weak supporting features, not the main score.

## Posts and comments

Posts, comments, and replies are first-class source items. A comment result must include enough parent/thread context to understand it. The opportunity URL should open the most specific native item supported by the platform.

## Feedback loop

Useful and not-relevant feedback updates local statistics by product, phrase, platform, and reason. The system may later suggest phrase changes, but it never silently adds/removes phrases or auto-replies.

## Freshness and retention

Default recurring scan freshness is seven days. A first scan or explicit Deep scan uses a bounded 30-day baseline. Freshness is not permission to scrape, and no query frequency is described as platform-approved. Source revalidation tombstones deleted items. Retention and cleanup are local settings with safe defaults and backup awareness.
## Implemented Hacker News slice

The local discovery engine uses the public HN Search API `search_by_date` endpoint. For each product it selects up to twelve compact queries from AI hypotheses, approved-phrase expansions, and local query memory; searches both stories and comments; requests 20 results per query; and applies a seven-day freshness cutoff. This is a strict ceiling of 24 HN source queries per product and 60 HN source queries for the entire click.

The API creates a durable `scan_runs` record before execution. `POST /api/scans` accepts an optional `product_id`; omitting it scans all active products. `GET /api/scans/:id` reports progress, and `POST /api/scans/:id/cancel` aborts the active HTTP request and marks the operation cancelled. Only one scan may run at a time in the current single-user application.

Long customer-language phrases are expanded into compact source queries without changing saved product settings. The classification model also proposes sixteen source-aware pain, help, workflow, alternative, audience, and buying-intent hypotheses using recent query outcomes as memory. Selection favors unseen hypotheses, ranks productive searches by qualified-per-reviewed conversion, suppresses recently unsuccessful searches, and falls back safely to deterministic phrase queries if planning fails. The approved structured discovery profile supplies positive context and explicit false-positive exclusions. Results receive a bounded local pre-score that requires distinctive query and product-context evidence; generic word overlap is insufficient. Active exclusions suppress a candidate. Reddit uses stricter admission thresholds, each source has a bounded AI-review budget, and no thread may consume more than two candidate positions. Surviving candidates are deduplicated and passed to the configured classification model. Direct and helpful conversations enter the actionable feed, market signals remain visible as research, and irrelevant candidates remain available only for transparent audit/manual review. Reddit items retain the exact query that produced them so local query memory is not credited to the wrong hypothesis. If classification is not configured or fails, the scan stops safely. Source items are unique by platform and external ID, and opportunities are unique by product and source item, so repeat scans refresh source and classification data without duplicating the conversation feed.
## Implemented experimental Reddit slice

When both `REDDIT_DISCOVERY_ENABLED=true` and `REDDIT_POLICY_RISK_ACCEPTED=true` are configured, the manual scan engine runs Reddit before the Hacker News fallback. Reddit remains disabled until Settings verifies a selected OpenCLI browser profile with `whoami`.

Each product scan searches at most six compact adaptive queries selected from the same hypothesis and memory pool, requests at most ten newest results per query from the previous week, and reads comments for at most ten unique result threads. The six-query safety ceiling does not increase; query diversity changes between scans instead. Commands are allowlisted to `whoami`, `search`, and `read`, launched without a shell, bounded to 60 seconds and 2 MiB output, cancellable, and pinned to the selected profile. Posts and returned comments are normalized into the same SQLite source/opportunity tables and deduplicated per product.

Current OpenCLI comment output does not expose native comment IDs. Mentionish therefore derives a stable synthetic identity from thread, author, and bounded text and opens the parent thread URL. This limitation is shown here rather than fabricating a native comment permalink. Reddit candidates pass through the same configured AI qualification gate as Hacker News candidates before they can appear in Conversations. Authentication, authorization, rate-limit, challenge, or restriction signals stop Reddit, persist its kill switch, and allow Hacker News to finish as fallback.
