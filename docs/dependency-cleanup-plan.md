# Dependency and disk cleanup plan

## Status — 2026-08-27

The release runtime is local-only. The hosted prototype dependencies and processes have been removed after their SQLite and in-process replacements passed their gates.

Removed:

- Supabase CLI, client, migrations, auth callback, hosted repositories, and linked-database scripts;
- PostgreSQL client and TypeScript declarations;
- hosted JWT verification, plans, entitlements, and Mentionish quotas;
- Redis, BullMQ, worker, scheduler, recurring jobs, and hosted live-smoke scripts.

Current long-lived processes are the loopback API/orchestrator and dashboard. `better-sqlite3` 12.10.0 is the only database runtime dependency.

The 2026-08-27 public-release audit traced every declared dependency to source imports, tests, build configuration, or release scripts. No declared package was unused, and `npm ls --depth=0` confirmed that every declared workspace dependency is installed.

The clean-lockfile install subsequently exposed four registry advisories in Next.js transitive dependencies. The release set now pins Next.js 16.3.3 and patched PostCSS, Sharp, NanoID, and SWC helper versions; the remediation required no forced or major upgrade.

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

- [complete 2026-08-27] audit declared packages and remove unused dependencies; none were unused;
- [complete 2026-08-27] remove reproducible `.turbo`, `.next`, and `dist` artifacts plus obsolete Supabase CLI state and local launcher logs;
- [complete 2026-08-27] verify `.gitignore` covers local databases, secrets, `.next`, `.turbo`, `.tmp`, `dist`, logs, and Supabase temporary state;
- [complete 2026-08-27] run `npm audit`, `npm audit signatures`, and `npm run audit:licenses`; remediate four clean-install advisories and confirm zero remaining vulnerabilities, 301 verified signatures, 76 attestations, and an unchanged reviewed license set;
- [complete Windows 2026-08-27; hosted macOS/Linux pending] verify a fresh `npm ci` followed by the real isolated startup, loopback-authentication, SQLite, and backup smoke path on every supported operating system.
