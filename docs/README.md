# Mentionish Product and Engineering Documentation

This folder converts [`PRD-community-intel-saas.md`](PRD-community-intel-saas.md) into implementation-ready product and engineering specifications for the v1 AI Customer Discovery Engine.

## Source of truth and precedence

1. [`decisions-and-open-questions.md`](decisions-and-open-questions.md) records explicit owner-approved amendments and resolutions.
2. The PRD defines product intent and v1 scope where it does not conflict with a later approved decision.
3. [`requirements.md`](requirements.md) normalizes that intent into testable requirements.
4. The remaining documents describe implementation contracts.

If documents conflict, apply the explicit approved decision and update downstream documents before implementation. Do not silently choose a new interpretation. Items still marked **Proposed** are not approved requirements.

## Document map

| Document | Purpose |
|---|---|
| [`product-overview.md`](product-overview.md) | Product value, users, journeys, goals, and boundaries |
| [`requirements.md`](requirements.md) | Traceable functional and non-functional requirements |
| [`glossary.md`](glossary.md) | Canonical terms and status meanings |
| [`architecture.md`](architecture.md) | Components, trust boundaries, and end-to-end flows |
| [`database-schema.md`](database-schema.md) | Logical schema, constraints, indexes, and RLS design |
| [`api-specification.md`](api-specification.md) | HTTP contracts, authentication, errors, and pagination |
| [`discovery-and-jobs.md`](discovery-and-jobs.md) | Reddit/HN ingestion, scheduling, queues, retries, and deduplication |
| [`ai-pipeline.md`](ai-pipeline.md) | Classification, drafting, safety rules, and AI cost logging |
| [`karma-gating.md`](karma-gating.md) | Subreddit promotion policy state machine |
| [`chrome-extension.md`](chrome-extension.md) | Manifest V3 extension behavior and security |
| [`authentication-and-security.md`](authentication-and-security.md) | Auth, extension tokens, RLS, secrets, abuse protection |
| [`payments-and-entitlements.md`](payments-and-entitlements.md) | Dodo checkout, webhook processing, plans, and caps |
| [`analytics-and-observability.md`](analytics-and-observability.md) | Product metrics, logs, alerts, and cost monitoring |
| [`deployment-and-operations.md`](deployment-and-operations.md) | Environments, deployment topology, configuration, and runbooks |
| [`testing-strategy.md`](testing-strategy.md) | Test levels, critical cases, fixtures, and acceptance gates |
| [`roadmap.md`](roadmap.md) | Dependency-aware two-week MVP plan and post-MVP boundary |
| [`decisions-and-open-questions.md`](decisions-and-open-questions.md) | Owner-approved product decisions, rationale, external constraints, and accepted risks |
| [`traceability-matrix.md`](traceability-matrix.md) | Mapping from requirements to designs and verification |

## Documentation rules

- Use requirement IDs when implementing code, migrations, tickets, or tests.
- Use UTC in storage and APIs; localize only for display.
- Treat all platform IDs as strings.
- Never implement automatic posting. Humans always perform the final platform submit action.
- Server-side enforcement is authoritative for quotas, ownership, and entitlements.
- Verify external API details against current official documentation before implementation. The PRD, not these docs, is the source for product intent; external documentation is the source for third-party wire formats.

## Proposed repository shape

```text
apps/
  dashboard/          Next.js dashboard
  api/                Express API and scheduled-job entrypoints
  extension/          Chrome Manifest V3 extension
packages/
  shared/             Shared types, schemas, constants
  ai/                 Model-agnostic AI adapters and prompts
  database/           Migrations, generated types, seeds
docs/                 Product and engineering specifications
```

This structure is a proposed implementation default, not a PRD requirement.
