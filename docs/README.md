# Mentionish documentation

This directory is the source of truth for the local-first open-source product.

## Reading order

1. [product-overview.md](product-overview.md) — audience, promise, scope, and quality bar.
2. [user-workflows.md](user-workflows.md) — complete first-run, product, scan, review, and reply journeys.
3. [requirements.md](requirements.md) — testable product and engineering requirements.
4. [architecture.md](architecture.md) — local runtime, boundaries, and migration strategy.
5. [database-schema.md](database-schema.md) — embedded data model and migrations.
6. [api-specification.md](api-specification.md) — loopback API contracts.
7. [manual-discovery.md](manual-discovery.md) — user-triggered retrieval, comments, ranking, and feedback.
8. [ai-pipeline.md](ai-pipeline.md) — provider-neutral keyword suggestions, classification, and drafting.
9. [agent-reach-integration.md](agent-reach-integration.md) — Reddit/X capability setup and upstream boundaries.
10. [account-safety.md](account-safety.md) — platform policy, account signals, community rules, throttling, and stop conditions.
11. [dashboard-ui-spec.md](dashboard-ui-spec.md) — navigation, screens, states, and accessibility.
12. [authentication-and-security.md](authentication-and-security.md) — local security, credentials, privacy, and accepted risk.
13. [testing-strategy.md](testing-strategy.md) — release gates and acceptance tests.
14. [quality-benchmark.md](quality-benchmark.md) — versioned conversation-quality gate and interpretation limits.
15. [dependency-cleanup-plan.md](dependency-cleanup-plan.md) — measured disk usage and dependency removal gates.
16. [local-data-lifecycle.md](local-data-lifecycle.md) — backup, offline restore, reset, migration, and uninstall recovery.
17. [roadmap.md](roadmap.md) — implementation sequence and current status.

[theme.css](theme.css) remains the canonical frontend token source until the UI system is intentionally revised.

## Precedence

When documents disagree:

1. requirements and explicit user-approved decisions;
2. security and manual-posting constraints;
3. user workflow and product overview;
4. architecture and subsystem contracts;
5. roadmap and implementation notes.

The local-first documents replace the previous hosted-SaaS specifications. Historical Supabase, RLS, Redis, scheduler, quota, payment, and webhook documents have been removed to prevent accidental implementation against obsolete contracts.

## Documentation rules

- Describe the intended local product and separately label transitional implementation state.
- Do not claim a connector is ready merely because its executable or credentials exist.
- Do not promise uninterrupted Reddit or X access.
- Do not claim an unofficial access frequency is allowed or that an account is safe from enforcement.
- Do not encode karma farming, account warming, identity rotation, challenge bypass, or ban-evasion guidance.
- Do not add automatic posting.
- Do not add a background scheduler to local mode.
- Keep secrets out of examples, fixtures, screenshots, logs, and browser storage.
- Update requirements, workflows, architecture, tests, and roadmap together when a product invariant changes.
