# Deployment and Operations

## Environments

Use at least:

- **local:** developer Supabase/Redis or isolated hosted development resources;
- **staging:** production-like integrations with test/sandbox payment configuration;
- **production:** isolated data, credentials, queues, webhooks, and origins.

Never reuse production service-role, payment, Reddit, AI, or extension credentials in development.

## Deployable processes

- `dashboard`: Next.js web app;
- `api`: stateless Express HTTP server;
- `scheduler`: singleton/logically locked cron producer;
- `worker`: BullMQ consumer(s);
- `extension`: versioned Chrome Web Store package.

The API and worker may share a codebase/image while running as separate process commands.

## Approved topology

- Cloudflare Workers with OpenNext: Next.js dashboard;
- Railway: separate API, singleton scheduler, and BullMQ worker processes;
- Supabase hosted: Postgres/Auth;
- Upstash: Redis;
- Dodo: hosted checkout/webhooks.

Use Cloudflare Pages only for a fully static dashboard; SSR Next.js targets Workers. A serverless-only API is insufficient for persistent BullMQ workers and naive in-process cron.

The dashboard build must use the current supported `@opennextjs/cloudflare` adapter, enable `nodejs_compat`, and pass a Workers-runtime preview test before deployment.

## Configuration

Validate required environment variables on process startup. Categories include:

- application origins and public API URL;
- Supabase URL, publishable/anon value where appropriate, server service role;
- Redis connection;
- server-side Reddit application client ID/secret, token endpoint settings, user agent, global polling budget, and kill switch;
- OpenAI API key/project, Responses API settings, classifier/draft model IDs, reasoning levels, and output-token caps;
- Dodo API key, webhook secret, environment, product mappings;
- logging/error-reporting settings.

Keep a committed `.env.example` with names and descriptions only after the codebase is scaffolded.

## Database changes

- Version all migrations.
- Test forward migration on a staging copy.
- Use additive/expand-contract changes where possible.
- Apply migration before code that requires new fields, or make rollout backward-compatible.
- Seed subreddit rules through versioned, reviewable data with source and verification date.
- Back up before high-risk migrations and practice restore.

## Deployment sequence

1. Lint, type-check, unit/integration/security tests.
2. Build dashboard, server, and extension.
3. Apply staging migrations and run smoke tests.
4. Deploy backward-compatible API/workers.
5. Apply production migration as designed.
6. Deploy dashboard.
7. Verify health, scan, queue, auth, and webhook metrics.
8. Publish extension only after API compatibility is live.

Use immutable version identifiers and support rollback of application code. Never roll back a database by destructive guesswork.

## Backups and recovery

- Enable Supabase/Postgres backups appropriate to plan.
- Define recovery point/time objectives before paid launch.
- Document restore into a separate environment and verify integrity.
- Redis queue loss should be recoverable from database operation state; Redis is not business truth.
- Payment truth can be reconciled from Dodo.

## Minimum runbooks

### Platform scan stopped

Check last run, scheduler lock, credentials, rate limits, queue health, upstream status, then safely enqueue one idempotent run.

### AI cost spike

Pause relevant queue consumption/config flag, inspect call volume/token size/idempotency, preserve queued work, and resume after limits are correct.

### Webhook failure

Inspect verified event status, fix transient dependency/configuration issue, replay through idempotent handler, and reconcile entitlement with provider.

### Extension DOM breakage

Disable insertion through a server-configured compatibility flag if available, preserve copy fallback, patch/test selectors, and publish a versioned update.

### Credential exposure

Revoke/rotate affected secret, inspect logs/access, redeploy, invalidate derived credentials if needed, and document the incident.

## Release readiness

Production launch requires approved decisions for quotas/pricing, verified third-party contracts, two-user RLS tests, webhook replay tests, manual-posting invariant tests, extension permission review, alerting, backups, privacy/terms, and seed-rule review.
