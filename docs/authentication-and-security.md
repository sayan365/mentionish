# Local security and privacy

## Threat model

Local-first reduces central data collection but does not make the application automatically safe. Relevant threats include:

- malicious websites calling localhost;
- exposed API listeners on the local network;
- leaked AI keys or platform cookies;
- command injection through product/source text;
- compromised or changed upstream CLI tools;
- malicious public post content and AI output;
- over-broad permissions or session access in upstream browser tooling;
- accidental backups containing public usernames/text;
- platform account enforcement.

## Network boundary

- Bind API and dashboard to 127.0.0.1 by default.
- Do not bind to 0.0.0.0 without an explicit advanced override and warning.
- Require an installation request token for dashboard API calls.
- Enforce exact local origins, request content types, and CSRF protections.
- Health endpoints reveal no secrets or unnecessary paths.

No user login is needed because the product is single-owner local software; local request authentication still protects the browser boundary.

On first local startup, the API creates a random installation token in the application-data directory with owner-only permissions where the operating system supports them. The configured loopback dashboard obtains it through an exact-Origin, loopback-only, no-store bootstrap response and keeps it in memory. Protected requests use the token as a bearer credential and compare it in constant time. The token never enters the embedded database, URLs, logs, or browser persistent storage.

## Secret storage

AI keys and connector secrets use a SecretStore interface. Phase 3 implements a dependency-free AES-256-GCM encrypted file vault with a separate random 256-bit key. Both files request owner-only permissions where the operating system supports POSIX-style modes. Operating-system credential-vault adapters remain a future hardening option, not a current claim.

The encrypted fallback prevents accidental plaintext disclosure in SQLite, backups, logs, API responses, and ordinary file inspection. It does not protect against malware or another process already running with the same operating-system user privileges. The embedded database stores only masked metadata, and the dashboard cannot retrieve a saved plaintext key.

Mentionish does not copy Agent Reach/upstream cookie files. Connector child processes receive an explicit operating-system path/configuration allowlist; AI keys, cookies, `NODE_OPTIONS`, and unrelated parent variables are not forwarded.

## Command execution

- fixed executable allowlist;
- argument arrays and shell disabled;
- bounded input lengths;
- fixed/safe working directory;
- sanitized environment;
- timeout, cancellation, and output cap;
- no execution of source-provided links or code;
- version recording and compatibility warnings.

## Content handling

Platform content and AI output are untrusted. Validate schemas, escape rendering, limit size, and avoid rendering arbitrary HTML. URLs must match the expected platform before opening them.

Source, rules, and dashboard-origin URLs are restricted to HTTP or HTTPS. Custom AI provider URLs require HTTPS unless the endpoint is loopback-only (`localhost`, `127.0.0.1`, or `::1`). Platform-specific adapters should additionally prefer native source hosts.

Logs use structured event names and sanitized error categories. Raw cookies, authorization values, AI keys, full child environments, and credential-file contents are forbidden.

## Privacy

All products, source results, drafts, feedback, and analytics remain local by default. Data sent externally is limited to:

- queries required by the selected platform connector;
- product/source context required by an explicit AI operation;
- optional update checks if later added and disclosed.

No Mentionish telemetry is enabled by default. Any future telemetry is opt-in, minimal, documented, and contains no product/source text.

## Reddit and X risk

These experimental connectors can rely on unofficial tools and authenticated sessions. The UI requires accepted-risk acknowledgement, documents that access can break or accounts can be restricted, links current official policies, and provides an immediate kill switch.

Mentionish never describes this access as approved by Reddit or X. It does not promise that an account is safe, publish supposed ban-avoidance thresholds, recommend burner accounts, or help bypass platform controls. Account age, karma, and community eligibility are context only. The evidence states, read budgets, rule checks, reply preflight, and stop conditions are defined in [account-safety.md](account-safety.md).

## Manual-posting invariant

No backend, dashboard, or connector contract contains a platform write operation. Copying text is not posting. Mentionish never inserts text into a platform editor. Only an explicit user confirmation records Replied locally.

A static/manual audit for write-like commands is a release blocker.

## Backup and deletion

Users can locate the data directory, create backups, and delete local data. Backup UI warns that the database can contain product descriptions, public usernames/text, and drafts. Secret-store entries are backed up only through their platform mechanism, not copied into database backups.
