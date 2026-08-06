# Agent Reach and platform connector contract

## Role

Agent Reach is an optional MIT-licensed setup and diagnostics layer. It chooses and configures upstream tools; it is not the runtime scraping API. Mentionish invokes allowlisted upstream executables directly and owns normalization, limits, health, cancellation, and read-only enforcement.

Current intended order:

| Source | Backend preference | State |
| --- | --- | --- |
| Hacker News | public API | stable |
| Reddit | OpenCLI, then rdt-cli | experimental |
| X/Twitter | twitter-cli, then OpenCLI | experimental after Reddit |

Upstream preferences may change. Mentionish's source adapter interface remains stable.

## Installation and readiness

Settings shows four distinct facts:

1. Agent Reach installed;
2. upstream backend installed;
3. login/configuration detected;
4. live read verified.

Only the fourth produces Ready. Agent Reach doctor is advisory because it intentionally avoids some live platform commands.

The dashboard provides copyable installation guidance. Mentionish must not silently install system software or extract browser cookies.

## Accepted risk

Before enabling Reddit or X, the user acknowledges:

- the connector is unofficial and may violate or be restricted by platform rules;
- browser/cookie sessions can expire;
- unusual automation can restrict or ban an account;
- no account type, karma level, age, or activity threshold guarantees safety;
- scraping without platform permission can violate current terms even when access works;
- Mentionish and Agent Reach cannot guarantee availability;
- the user can disable the connector immediately.

Acceptance is stored locally with document version and time. It does not imply platform approval.

## Runtime command boundary

Allowed operation families are read-only:

- version/status probes that do not modify credentials;
- search;
- read post/thread;
- fetch comments/replies;
- bounded pagination required for the explicit scan.

Forbidden operation families include post, reply, comment, submit, vote, like, follow, unfollow, message, delete, edit, and media upload.

Commands use executable plus argument arrays, never a composed shell string. Product phrases are passed as individual arguments after validation. Child environments include only required inherited values and explicitly scoped connector values.

## Diagnostic states

- unavailable — no supported executable;
- setup_needed — installed but not live verified;
- ready — bounded live read succeeded;
- degraded — fallback works while preferred backend is unavailable;
- failed — bounded live read failed;
- disabled — user turned the source off.

Authentication failure clears Ready immediately. Timeouts and unexpected output never become Ready.

## Data coverage

Adapters return posts and supported comments/replies, thread/parent context, author, community, URL, timestamps, and optional public metrics. Reddit account age, karma, subreddit karma, scores, and comment counts are optional because availability varies by backend.

Missing data is represented as null/absent, never fabricated.

## Operational controls

- manual scan only;
- query and result budgets;
- per-command timeout/output limit;
- low default concurrency;
- global deduplication;
- sanitized logs;
- content deletion revalidation;
- immediate per-platform kill switch;
- Hacker News continues if an experimental connector fails;
- one active command per authenticated session by default;
- cache reuse and query deduplication before network access;
- enforced Retry-After/cooldowns and immediate pause on 401/403/429, challenge, CAPTCHA, restriction, or explicit denial;
- no account/session/proxy/user-agent rotation or fallback used to bypass enforcement.

Detailed account and community controls are defined in [account-safety.md](account-safety.md).

## Version compatibility

Pin known-good upstream versions where practical and record the detected version in connector checks. CI uses fixtures; release testing uses an owner-approved authentic account outside automated CI. A smoke test is bounded and read-only, and it cannot establish policy approval or future account safety.
## Reddit account binding

Mentionish binds Reddit reads to one OpenCLI Browser Bridge profile alias. Settings asks the user to select an alias from `opencli profile list` and verifies it with the allowlisted read-only `reddit whoami` command. The returned username, public account creation date, karma, and verification time are stored as non-secret readiness evidence; browser cookies and passwords remain inside OpenCLI/the browser profile.

Every Reddit search and thread read includes the selected `--profile` value. Mentionish never rotates profiles, falls back to another account, or chooses an account automatically. A missing login, authorization failure, rate limit, challenge, CAPTCHA, or restriction activates the persistent Reddit kill switch. The user must repair the selected profile and pass another `whoami` read test before the pause is cleared.