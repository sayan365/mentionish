# Dependency and disk cleanup plan

## Snapshot — 2026-08-07

Approximate generated/dependency sizes in this workspace before cleanup:

| Path | Size |
| --- | ---: |
| .turbo | 2,016 MB |
| node_modules | 447 MB |
| apps/dashboard/.next | 390 MB |
| all compiled dist folders | under 1 MB |

The documentation folder is tiny by comparison. Removing obsolete Markdown improves correctness, not disk usage.

## Safe generated cleanup now

These directories are build caches or outputs and can be regenerated:

- .turbo
- apps/dashboard/.next
- package/app dist directories

Deleting .turbo and .next currently recovers roughly 2.4 GB. The next build/start will recreate smaller current caches.

Do not delete node_modules while active development still depends on the hosted prototype. A clean npm install recreates it from package-lock.json.

## Transitional dependencies

The following are required by current hosted code but targeted for removal after their replacing local phase passes.

### Root

- supabase CLI — remove after all linked migrations/tests and hosted scripts are retired.

### Dashboard

- @supabase/supabase-js — remove after no-login local status/settings/products replace session auth.

### API

- bullmq and ioredis — remove after in-process manual scan/draft operations.
- jose — remove after hosted JWT verification is removed; the local dashboard request token uses local primitives.
- @mentionish/database's hosted implementation — replace with embedded repository package.
- dotenv may remain for development overrides but must not be required for ordinary startup.
- express, cors, helmet, and zod remain useful unless the local API framework changes deliberately.

### Worker and scheduler

- apps/scheduler is removed entirely after manual scan orchestration exists.
- apps/worker is merged into the local API/orchestrator after discovery, classification, and drafting operations have local equivalents.
- BullMQ, ioredis, Redis configuration, and queue-specific tests are then removed.

### Database package

- @supabase/supabase-js, pg, and @types/pg are removed after embedded repositories and migrations pass.
- Supabase migrations and linked-test scripts move to a clearly historical branch/archive or are removed before public release.

### AI package

- openai remains for the OpenAI provider.
- add the official Anthropic client only when the provider adapter and tests are implemented.
- zod remains for provider output validation.

## Selected local foundation dependency

- `better-sqlite3` 12.10.0 is pinned for embedded storage; its installed package is approximately 11.72 MB plus negligible declarations.
- It remains while the local repository is the default storage path.

## Planned additions

Do not install these until their phase begins and a small proof passes:

- OS credential-vault library;
- Anthropic provider client;
- optional browser-opening/startup orchestrator helper only if Node APIs are insufficient.

Selection criteria include clean Windows/macOS/Linux install, supported Node LTS binaries or no native build, license compatibility, maintenance, package size, and testability.

## Removal gate

A dependency can be removed only when:

1. source/import search has no default-runtime references;
2. replacement unit/integration/acceptance tests pass;
3. clean installation and startup pass;
4. package-lock is regenerated intentionally;
5. docs and environment examples no longer reference it.

Do not remove packages merely because the new design will eventually replace them; that would break the working reference before local parity.

## Public-release cleanup

Before publishing:

- remove all unused packages and scripts;
- remove hosted .env examples and secret names;
- remove scheduler/worker workspaces if fully merged;
- remove generated files from the repository;
- verify .gitignore covers local database, backups, secrets, .next, .turbo, and dist;
- run npm audit and a direct-dependency license inventory;
- verify clean install on all supported operating systems.
