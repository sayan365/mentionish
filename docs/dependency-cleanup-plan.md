# Dependency and disk cleanup plan

## Status — 2026-08-25

The release runtime is local-only. The hosted prototype dependencies and processes have been removed after their SQLite and in-process replacements passed their gates.

Removed:

- Supabase CLI, client, migrations, auth callback, hosted repositories, and linked-database scripts;
- PostgreSQL client and TypeScript declarations;
- hosted JWT verification, plans, entitlements, and Mentionish quotas;
- Redis, BullMQ, worker, scheduler, recurring jobs, and hosted live-smoke scripts.

Current long-lived processes are the loopback API/orchestrator and dashboard. `better-sqlite3` 12.10.0 is the only database runtime dependency.

## Safe generated cleanup

These build outputs and caches are reproducible and may be deleted when the development servers are stopped:

- `.turbo`;
- `apps/dashboard/.next`;
- package and app `dist` directories.

Do not manually edit `node_modules`. `npm install` recreates it from `package-lock.json`, and `npm prune` removes packages no longer declared.

## Dependencies intentionally retained

- Express, CORS, Helmet, Zod, and dotenv support the loopback API and development overrides.
- Next.js, React, and React DOM implement the dashboard.
- `better-sqlite3` provides embedded storage.
- AI SDK/runtime code supports user-selected OpenAI, Anthropic, OpenRouter, and OpenAI-compatible providers.

## Removal gate

A dependency can be removed only when:

1. source/import search has no runtime references;
2. replacement unit, integration, and acceptance tests pass;
3. clean installation and startup pass;
4. `package-lock.json` is regenerated intentionally;
5. documentation and environment examples no longer reference it.

## Public-release checks

- prune unused packages and generated artifacts;
- verify `.gitignore` covers local databases, backups, secrets, `.next`, `.turbo`, and `dist`;
- run `npm audit`, `npm audit signatures`, and `npm run audit:licenses`; review any new install script or license before release;
- verify clean install and startup on Windows, macOS, and Linux.
