# Agent Reach integration contract

## Supported local channels

| Mentionish source | Agent Reach setup role | Runtime backend order | Release state |
| --- | --- | --- | --- |
| Hacker News | None required | Public HN API | Stable |
| Reddit | Install/check dependencies | OpenCLI, then `rdt` | Experimental |
| X/Twitter | Install/check dependencies | `twitter`, then OpenCLI | Experimental |

## Rules

- Read/search only. Do not expose or call posting, commenting, liking, following, or messaging commands.
- A scan is started by an explicit dashboard action and has a bounded query count.
- Run one connector operation at a time per platform.
- Enforce an execution timeout and maximum stdout/stderr size.
- Stop immediately on authentication failure and show reconfiguration guidance.
- Deduplicate globally by platform and external ID before classification.
- Never log cookies, tokens, authorization headers, or raw credential files.
- Do not infer readiness only from installation. A user-approved live read smoke test is required.

## Diagnostic states

```text
unavailable  executable not installed
setup_needed installed but missing login/configuration
ready        explicit live read test succeeded
degraded     fallback works or primary is unhealthy
failed       bounded live test failed
disabled     user turned the source off
```

Agent Reach `doctor` is advisory because its current Reddit and X checks intentionally avoid live commands and can report configured credentials without proving a read. Mentionish owns the final live-read state.

## Normalized source result

Every backend must produce:

```json
{
  "platform": "reddit",
  "external_id": "...",
  "community": "startups",
  "title": "...",
  "body": "...",
  "author": "...",
  "url": "https://...",
  "source_created_at": "2026-08-06T00:00:00Z",
  "metadata": {}
}
```

Platform-specific metadata may contain public engagement values such as score, comment count, author karma, or subreddit name when the upstream returns them. Such fields are optional and must never determine ownership or authentication.

## Compatibility policy

Pin and test known-good upstream versions where Agent Reach itself pins them. Connector breakage must disable only that connector; Hacker News and the rest of the local application continue working.

