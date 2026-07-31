# Traceability Matrix

This matrix maps requirements to their primary implementation specification and verification area. It is intentionally compact; individual tests should include the requirement ID in their name or metadata.

| Requirement(s) | Primary design | Primary verification |
|---|---|---|
| AUTH-001–002 | `authentication-and-security.md`, `database-schema.md` | Auth integration, profile idempotency, two-user RLS |
| PROD-001–003 | `api-specification.md`, `database-schema.md`, `discovery-and-jobs.md` | Product API validation/ownership, keyword unit tests |
| DISC-001–007 | `discovery-and-jobs.md`, `architecture.md` | Adapter fixtures, rate-limit/retry tests, global dedupe |
| AI-001–009 | `ai-pipeline.md`, `database-schema.md` | AI schema/evaluation, usage logging, prompt-injection fixtures |
| OPP-001–006 | `api-specification.md`, `product-overview.md` | API contracts, dashboard E2E, status-transition tests |
| KARMA-001–006 | `karma-gating.md`, `database-schema.md` | Policy table tests, leakage evaluation, seed review |
| EXT-001–008 | `chrome-extension.md`, `authentication-and-security.md` | Manifest, DOM fixtures, token isolation, no-submit invariant |
| HN-001 | `product-overview.md`, `chrome-extension.md` | Dashboard copy/open E2E, absence of HN extension/write code |
| PAY-001–006 | `payments-and-entitlements.md`, `api-specification.md` | Checkout allowlist, signature, duplicate/order/refund tests |
| USAGE-001–003 | `database-schema.md`, `payments-and-entitlements.md` | Concurrent last-unit tests, API/UI quota states |
| AN-001–003 | `analytics-and-observability.md` | Metric query fixtures and dashboard E2E |
| OPS-001–003 | `deployment-and-operations.md`, `analytics-and-observability.md` | Retry/dead jobs, secret scan, log-redaction tests |
| SAFE-001 | `architecture.md`, `chrome-extension.md`, `authentication-and-security.md` | Static review and extension E2E proving no submit/write API |
| SAFE-002 | `discovery-and-jobs.md` | 429/Retry-After and concurrency tests |
| SAFE-003 | `ai-pipeline.md`, `payments-and-entitlements.md` | Model routing, quota concurrency, token/cost assertions |
| SAFE-004 | `authentication-and-security.md`, `database-schema.md` | Cross-tenant API and RLS suite |

## PRD section coverage

| PRD section | Documentation coverage |
|---|---|
| Product summary | `product-overview.md` |
| Goals/non-goals | `product-overview.md`, `requirements.md`, `roadmap.md` |
| Tech stack | `architecture.md`, `deployment-and-operations.md` |
| Data model/RLS | `database-schema.md` |
| Discovery | `discovery-and-jobs.md` |
| Intent scoring/drafting | `ai-pipeline.md` |
| Karma state machine | `karma-gating.md` |
| Approval/posting | `product-overview.md`, `api-specification.md`, `chrome-extension.md` |
| Analytics | `analytics-and-observability.md` |
| Extension | `chrome-extension.md` |
| Payments | `payments-and-entitlements.md` |
| API endpoints | `api-specification.md` |
| Non-functional requirements | `requirements.md`, security/operations/testing documents |
| Build plan | `roadmap.md` |

## Decision dependencies

Implementation work must reference the following decisions:

- schema/quotas: `DEC-001`, `DEC-002`, `DEC-003`, `DEC-004`;
- karma schema/prompts: `DEC-005`, `DEC-006`, `DEC-007`, `DEC-009`;
- discovery/drafting behavior: `DEC-008`, `DEC-010`, `DEC-018`;
- extension: `DEC-011`, `DEC-012`;
- analytics: `DEC-013`;
- lifecycle/limits: `DEC-014`, `DEC-015`, `DEC-020`;
- provider/privacy/deployment: `DEC-016`, `DEC-017`, `DEC-019`.
