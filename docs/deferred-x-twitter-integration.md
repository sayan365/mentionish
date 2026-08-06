# Deferred X/Twitter Integration

## Status

**Deferred. Do not implement, configure, install, or request X credentials yet.**

Mentionish will remain focused on completing the product loop with Reddit and
Hacker News. X/Twitter becomes eligible for reconsideration only after that
loop works for real users and produces evidence of commercial value.

This document preserves the evaluated approach so the integration can be
revisited without repeating the research. It is not approval to enable X.

## Product sequence

The approved sequence is:

1. A user creates a product and listening phrases.
2. Reddit and Hacker News discovery finds relevant current conversations.
3. Mentionish deduplicates, matches, classifies, and displays opportunities.
4. The user reviews a draft and replies manually on the native platform.
5. We observe whether those replies attract users or generate revenue.
6. Only after this loop is reliable and shows value do we reconsider X as a
   third source.

The first dollars and credible customer acquisition evidence matter more than
adding another platform early. X must not distract from fixing discovery
quality, onboarding, opportunity review, drafting, or manual posting on the
two current sources.

## Entry criteria

Work on X may start only when all of the following are true:

- Reddit and Hacker News run end to end in the deployed environment.
- At least one real product has received genuine, non-demo opportunities.
- A user can review a draft and complete a manual native-platform reply.
- Source failures, authentication failures, deletion cleanup, deduplication,
  caching, and kill switches have been exercised successfully.
- We have evidence that discovered conversations can produce sign-ups,
  qualified interest, or revenue.
- The owner explicitly accepts X-specific cookie/session and enforcement risk.
  Reddit risk acceptance does not automatically cover X.
- The X integration has its own decision record, operating limits, shutdown
  procedure, and secret-management plan.

## Evaluated temporary access path

[Agent Reach](https://github.com/Panniantong/agent-reach) is a capability
selector and installer, not a hosted data API. Its preferred current X backend
is [twitter-cli](https://github.com/public-clis/twitter-cli), with OpenCLI as a
fallback. For Mentionish, the least complicated hosted design would call only
the selected `twitter-cli` read commands from the persistent discovery worker;
the full Agent Reach multi-platform installation would not run inside the API
or dashboard.

The temporary backend authenticates with cookies from a dedicated X account:

- `TWITTER_AUTH_TOKEN`
- `TWITTER_CT0`

These are account-session credentials, not official X developer credentials.
They can expire, be invalidated, trigger account restrictions, or stop working
when X changes private GraphQL operations. The upstream project implements
request jitter, retry behavior, fingerprint alignment, and query-ID recovery;
those mechanisms demonstrate operational fragility and do not create platform
authorization.

## Potential read-only capabilities

The evaluated backend currently supports:

- keyword search using the Latest result tab;
- language, author, date, link, and repost filters;
- tweet text, creation time, author, links, media, and quoted content;
- likes, replies, reposts, quotes, bookmarks, and view-count snapshots;
- author name, username, verification state, bio, account creation time,
  follower count, following count, and tweet count;
- tweet detail and visible replies;
- structured JSON/YAML output and pagination.

Coverage would remain best-effort. Mentionish must not claim complete or
real-time X coverage, and engagement counts must be treated as mutable source
snapshots rather than permanent truth.

## Proposed architecture if activated later

X must use background discovery only:

```text
X cookie-backed read transport
        |
        v
singleton discovery worker
        |
        v
global cache and external-ID deduplication
        |
        v
Supabase scanned content and product opportunities
        |
        v
Mentionish API and dashboard
```

Frontend and API requests must never trigger a live X request. All users read
previously persisted opportunities from Supabase, allowing many users to share
one globally cached source result.

The likely code boundary is a read-only adapter such as
`apps/worker/src/adapters/twitter-cookie.ts`, selected behind the same platform
adapter interface as Reddit and Hacker News. Adding the source will also need a
database migration, shared platform types, scheduler jobs, normalization,
cleanup, UI labels, observability, and tests.

## Mandatory controls if activated

- Use a dedicated, disposable X account rather than a personal account.
- Obtain cookies through an explicit manual export; never scan browser profiles
  automatically in the production worker.
- Store cookies only in the deployment provider's encrypted secret manager.
- Invoke the CLI with direct process arguments, never through a constructed
  shell command.
- Hard-allowlist read operations such as `search`, `tweet`, and `user`.
- Prohibit post, reply, quote, delete, like, repost, bookmark, follow, and all
  other write operations in code and tests.
- Use one global queue with concurrency one.
- Start with at most three shared queries every 30 minutes and 20 results per
  query; change limits only from observed telemetry.
- Search for recent content, deduplicate by tweet ID, and filter promoted posts
  and reposts unless a later requirement explicitly includes them.
- Cache identical normalized queries across all products and users.
- Enrich author profiles only for shortlisted opportunities and cache profile
  snapshots for at least 24 hours.
- Halt immediately on authentication failures and require manual recovery.
- Open a cooldown circuit on rate limiting and repeated upstream failures.
- Provide an independent X kill switch; X failure must not stop Reddit or HN.
- Revalidate displayed source content and remove unavailable/deleted content.
- Never promise an X availability or completeness SLA for the cookie backend.

## Proposed configuration contract

Names may change during implementation, but X must remain separately gated:

```env
X_DISCOVERY_ENABLED=false
X_COOKIE_BACKEND_RISK_ACCEPTED=false
X_AUTH_TOKEN=
X_CT0=
X_ACCOUNT_USERNAME=
X_KILL_SWITCH=false
X_QUERY_BUDGET_PER_RUN=3
X_MAX_RESULTS_PER_QUERY=20
X_POLL_INTERVAL_MINUTES=30
```

No X secret belongs in a `NEXT_PUBLIC_*` variable, the dashboard, browser
extension, repository, logs, job payloads, or Supabase client-readable rows.

## Explicitly out of scope now

- Installing Agent Reach or twitter-cli.
- Adding X database/platform types.
- Requesting or storing X cookies.
- Running live X searches.
- Adding X screens, icons, filters, or product claims.
- Any automatic posting or X write action.
- Treating X as a dependency for the Reddit/HN launch.

## Reconsideration decision

When the entry criteria are satisfied, create a new approved decision that
records the measured Reddit/HN results, expected X value, accepted X-specific
risk, exact pinned backend version, query budget, credential rotation process,
and rollback plan. Until that happens, this integration remains documentation
only.
