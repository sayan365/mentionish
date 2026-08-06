# Reddit Cookie-Backed Discovery Fallback

## Status

**Legacy fallback, implemented and fixture-tested but not active.** The live
Windows test on 2026-08-05 returned `403 forbidden`, and automatic browser
cookie extraction found no credentials. Use the live-verified OpenCLI desktop
path in [`reddit-opencli-fallback.md`](reddit-opencli-fallback.md) for supervised
local validation. Keep this adapter disabled unless a later server environment
proves it works.
## Why this backend exists

Mentionish needs to validate its Reddit-first discovery loop before official
Reddit application credentials are available. Agent Reach currently selects
[rdt-cli](https://github.com/public-clis/rdt-cli) as its server-capable Reddit
fallback. Agent Reach is an installer and backend selector rather than a data
service, so Mentionish integrates only the pinned rdt-cli read transport and
does not install the full multi-platform Agent Reach stack in the application.

rdt-cli uses a logged-in Reddit session cookie and Reddit's web JSON routes.
This is a reverse-engineered, best-effort access path. It may be rate limited,
blocked, changed, or invalidated without notice. It is appropriate only for the
owner-approved, low-volume validation period described here.

## Architecture

    dedicated Reddit account session
                 |
                 v
    rdt-cli read-only subprocess adapter
                 |
                 v
    singleton BullMQ discovery worker
                 |
                 v
    Redis query cache + global query budget
                 |
                 v
    Supabase scanned_posts + opportunities
                 |
                 v
    Mentionish API/dashboard/extension

Frontend and API requests never cause live Reddit requests. The scheduler runs
one global scan every 25 minutes, and every user reads persisted Supabase data.
Normalized keyword searches are shared across products and users.

## Transport selection

REDDIT_DATA_BACKEND selects one of two implementations:

| Value | Transport | Intended use |
|---|---|---|
| oauth | Existing application-only OAuth adapter | Preferred when official credentials exist |
| rdt_cli | Temporary cookie-backed CLI adapter | Accepted-risk validation fallback |

Selecting rdt_cli is insufficient by itself. The scheduler and worker require
all gates to be open:

    DISCOVERY_PROCESSING_ENABLED=true
    REDDIT_DISCOVERY_ENABLED=true
    REDDIT_POLICY_RISK_ACCEPTED=true
    REDDIT_COOKIE_BACKEND_RISK_ACCEPTED=true
    REDDIT_KILL_SWITCH=false
    REDDIT_DATA_BACKEND=rdt_cli

The scheduler does not use DISCOVERY_PROCESSING_ENABLED; that variable is
worker-only. Scheduler and worker must otherwise receive the same Reddit
backend, risk, enable, and kill-switch values.

## Conservative defaults

    REDDIT_MAX_QUERIES_PER_SCAN=5
    REDDIT_MAX_RESULTS_PER_QUERY=25
    REDDIT_REVALIDATION_BATCH_SIZE=10
    REDDIT_RDT_EXECUTABLE=rdt
    REDDIT_RDT_HOME=/absolute/path/to/isolated-reddit-home
    REDDIT_RDT_ACCOUNT_USERNAME=dedicated-account-name
    REDDIT_RDT_TIMEOUT_SECONDS=45
    REDDIT_CLEAR_AUTH_HALT=false
    REDDIT_CLEAR_RATE_LIMIT_COOLDOWN=false

Searches use sort=new, time=day, compact JSON, a maximum of 25 results, and a
rotating maximum of five unique keywords per scan. Identical normalized queries
share a five-minute Redis cache. The worker and its Reddit subprocess run
sequentially.

Do not raise these defaults merely because no published quota appears in the
cookie flow. Upstream 429 responses and platform enforcement still apply.

## Credential provisioning

Use a dedicated, disposable Reddit account. Do not use a personal or important
account. Log in manually in a browser and explicitly export only the
reddit_session cookie.

Set REDDIT_RDT_HOME to an absolute directory used only by the Reddit worker.
The subprocess overrides HOME, USERPROFILE, APPDATA, LOCALAPPDATA, and
XDG_CONFIG_HOME so the pinned tool cannot inspect the worker user's normal
browser profile. Place the credential at:

    <REDDIT_RDT_HOME>/.config/rdt-cli/credential.json

The worker validates that this file contains a non-empty reddit_session before
starting the subprocess. It never falls back to anonymous discovery. The
credential shape selected by Agent Reach is:

    {
      "cookies": {
        "reddit_session": "REPLACE_LOCALLY"
      },
      "source": "manual",
      "username": "dedicated-account-name",
      "modhash": null,
      "saved_at": 0,
      "last_verified_at": null
    }

Create this file locally or through the deployment provider's secret
provisioning mechanism. Set directory permissions to owner-only and the file to
mode 0600 where supported. Never paste the cookie into documentation, source
control, logs, Supabase, frontend variables, BullMQ payloads, or a customer
support message.

The Mentionish adapter never runs rdt login or rdt status. The pinned tool contains
automatic browser-cookie discovery internally, so the isolated home and overridden
profile directories prevent it from reaching normal browser data. Credential
creation and rotation remain explicit operator actions.

## Installing the pinned upstream tool

The version evaluated by Agent Reach is pinned to this upstream source:

    git+https://github.com/public-clis/rdt-cli.git@5e4fb3720d5c174e976cd425ccc3b879d52cac66

Install it in an isolated tool environment on the persistent worker host, not
inside the dashboard or API process. Do not install it globally on a developer
machine without an explicit operator decision. Confirm rdt --help resolves for
the same operating-system user that runs the worker.

## Enforced read-only boundary

The subprocess runner uses shell: false and passes arguments directly. It allows
only these first-level commands:

- search
- read

It rejects comment, upvote, save, subscribe, login, logout, and all other
commands before a process can start. Search options and limits are hard-coded,
and an end-of-options delimiter protects keyword values beginning with a
hyphen.

The child process inherits only a small operating-system environment allowlist.
It does not inherit Supabase, Redis, OpenAI, payment, or other application
secrets. Output is capped at 512 KiB and execution is time-bounded.

Mentionish never uses Reddit write APIs. Draft insertion remains a user-clicked
browser-extension action, and the user submits through Reddit's native UI.

## Failure controls

### Authentication failure

A missing, expired, 401, or 403 session creates a persistent Redis authorization
halt keyed by a hash of backend and dedicated account identity. No later Reddit
job runs until the operator fixes the credential and performs a one-shot clear:

    REDDIT_CLEAR_AUTH_HALT=true

Return the variable to false immediately after one worker startup.

### Rate limiting

A 429 or structured rate_limited failure creates a Redis cooldown. The default
cooldown is one hour and is bounded between five minutes and six hours. Jobs do
not call Reddit during the cooldown. Emergency manual clearing requires:

    REDDIT_CLEAR_RATE_LIMIT_COOLDOWN=true

Do not clear a cooldown simply to continue traffic; investigate the query
budget and upstream state first.

### Kill switch

Set the following on both scheduler and worker, then restart them:

    REDDIT_KILL_SWITCH=true

The scheduler removes Reddit scan and revalidation schedules. Hacker News
continues independently.

## Content handling

- Search results normalize into the existing scanned_posts model.
- Global (platform, external_id) uniqueness deduplicates submissions.
- Existing keyword matching creates opportunities only for relevant products.
- Stored posts are revalidated in bounded batches every 12 hours.
- Missing, removed, or deleted posts are purged with dependent opportunities.
- Source data is not treated as permanent truth.
- Search covers submissions, not global comment search or complete coverage.

Post scores, comment counts, author details, and optional enrichment may be
retained as source snapshots in raw_metadata; high-request enrichment must be
added only after a cheap keyword match and with separate caching.

## Observability

Monitor executed versus cached queries, unique posts, authentication halt,
rate-limit cooldown and TTL, command timeouts, invalid JSON, schema drift,
missing executable errors, deletion cleanup, and Hacker News continuation.

Never log cookie values, credential-file contents, full child environments, or
raw authentication responses.

## Activation checklist

Keep REDDIT_DISCOVERY_ENABLED=false until every item is complete:

- [ ] Dedicated Reddit account created and manually logged in.
- [ ] Owner explicitly accepts cookie-backend risk.
- [ ] Pinned rdt-cli installed on the persistent worker host.
- [ ] Absolute isolated REDDIT_RDT_HOME provisioned.
- [ ] Credential file provisioned there with restricted access.
- [ ] A manual low-volume read succeeds from the worker identity.
- [ ] Worker and scheduler configuration values match.
- [ ] Redis, hosted Supabase, worker, and scheduler are healthy.
- [ ] Kill-switch and authentication-halt recovery are understood.
- [ ] No Reddit write command exists in the runtime invocation path.
- [ ] Hacker News continues when Reddit is disabled.

## Rollback and official migration

Immediate rollback is REDDIT_KILL_SWITCH=true. To migrate to official access,
provision the app credentials, set REDDIT_DATA_BACKEND=oauth, remove the cookie
credential from the worker host, clear backend-specific stale halt keys only
when appropriate, and restart scheduler and worker. Supabase content and
opportunity records remain compatible because both transports normalize into
the same platform schema.