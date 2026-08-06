# Reddit OpenCLI Desktop Fallback

## Status

Live-verified on 2026-08-05 with OpenCLI 1.8.6 and Browser Bridge extension
1.0.22. A read-only search returned current Reddit submissions through the
owner-controlled, logged-in Chrome session. This remains an accepted-risk
desktop validation backend, not Reddit approval and not the final production
hosting design.

The earlier `rdt-cli` cookie test returned `403 forbidden`, and its automatic
browser-cookie extractor found no usable cookies on this Windows installation.
Agent Reach now prioritizes OpenCLI for desktops and treats `rdt-cli` as its
legacy/server fallback.

## Architecture

```text
logged-in Chrome + OpenCLI Browser Bridge extension
                         |
                         v
OpenCLI local daemon on 127.0.0.1:19825
                         |
                         v
Mentionish read-only subprocess adapter
                         |
                         v
Redis cache -> BullMQ worker -> hosted Supabase
```

Chrome must be open, Reddit must remain logged in, the extension must be
enabled, and the local OpenCLI daemon must be reachable. The frontend never
calls OpenCLI or Reddit directly.

## Required local configuration

Worker:

```env
REDDIT_DATA_BACKEND=opencli
REDDIT_BROWSER_BACKEND_RISK_ACCEPTED=true
REDDIT_ACCOUNT_USERNAME=dedicated-account-name
REDDIT_OPENCLI_SCRIPT=C:\absolute\path\to\@jackwener\opencli\dist\src\main.js
REDDIT_OPENCLI_TIMEOUT_SECONDS=60
```

The existing discovery, policy-risk, kill-switch, query-budget, caching,
authentication-halt, rate-cooldown, and revalidation controls also apply.

## Enforced command boundary

The subprocess runner accepts exactly these command prefixes:

- `opencli reddit search`
- `opencli reddit read`

It rejects comment, upvote, save, subscribe, and every other OpenCLI command
before starting a process. It invokes Node directly with the installed
OpenCLI JavaScript entrypoint, uses `shell: false`, strips application secrets
from the child environment, caps output at 2 MiB, and enforces a 60-second
timeout.

Searches are newest-first, limited to the last day, capped at 25 results per
keyword, limited to five rotating keywords per scan, sequential, and cached
globally for five minutes. Revalidation reads at most ten stored IDs with one
small comment response each.

## Data returned

The verified search response includes post ID, title, subreddit, author,
score, comment count, canonical URL, creation timestamp, full self-text, and
media routing metadata. `read` can return the post and bounded comments.

Mentionish normalizes this into the same `scanned_posts` and `opportunities`
schema used by OAuth and Hacker News. Posting remains manual through Reddit's
native UI; OpenCLI write commands are never available to the worker.

## Operational limits

This desktop bridge is suitable for local validation only:

- Chrome and the extension must remain running.
- A sleeping or disconnected extension halts Reddit work.
- It cannot be deployed as an ordinary headless Cloudflare function.
- It is not a reliable multi-tenant production dependency.
- Official Reddit OAuth remains the migration target.

Keep `REDDIT_DISCOVERY_ENABLED=false` whenever the browser bridge is not being
actively supervised. Set `REDDIT_KILL_SWITCH=true` for immediate shutdown;
Hacker News continues independently.

## Verification record

The following checks passed locally on 2026-08-05:

- OpenCLI daemon 1.8.6 reachable on loopback.
- Browser Bridge extension 1.0.22 connected.
- One Chrome profile connected.
- Read-only `reddit search` returned three structured submissions.
- No OpenCLI write command was executed.
