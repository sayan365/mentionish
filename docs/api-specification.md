# Loopback API specification

## Conventions

Base URL is loopback-only. JSON is used for requests and responses. The dashboard requires an installation-scoped request token; the extension requires its own paired token.

Errors use:

    {
      "error": {
        "code": "CONNECTOR_SETUP_REQUIRED",
        "message": "Reddit needs a successful live read test.",
        "details": {}
      }
    }

Secrets are accepted only by dedicated settings endpoints and never returned.

## System and setup

- POST /api/local/bootstrap — exact-Origin, loopback-only, no-store delivery of the local installation token to the configured dashboard.
- GET /api/local/status — database, first-run, version, active scan, and safe health data.
- GET /api/settings — non-secret settings and masked provider metadata.
- GET /api/ai/settings — masked provider metadata only.
- PUT /api/ai/settings — encrypt and store or replace a provider credential.
- DELETE /api/ai/settings — remove the active provider secret and metadata.
- GET /api/ai/models — discover models from the saved provider or compatible gateway.
- POST /api/ai/test — explicit provider validation with sanitized errors.
- GET /api/connectors — enabled state, detected backend, last live check, and risk state.
- GET /api/connectors/:platform/account-safety — evidence-derived Unknown/Caution/Paused/Blocked state, cooldown, rules coverage, local activity, and recovery action.
- POST /api/connectors/:platform/account-safety/acknowledge — records review of a user-actionable warning; it cannot clear a platform cooldown or denial.
- GET /api/connectors/:platform/policy — official policy links and last-reviewed date.
- PUT /api/connectors/:platform — enable/disable and backend preference.
- POST /api/connectors/:platform/test — explicit bounded live read test.
- POST /api/backups — create a local database backup.

## Products and phrase suggestions

- GET /api/products
- POST /api/products
- GET /api/products/:id
- PATCH /api/products/:id
- DELETE /api/products/:id
- POST /api/products/:id/restore
- GET /api/products/:id/phrases
- PUT /api/products/:id/phrases — replace approved editable phrase set.
- POST /api/ai/phrase-suggestions — explicit AI request using unsaved product context.
- POST /api/ai/product-context — returns a reviewable description, audience options, and structured discovery profile; it never mutates the product.

Phrase suggestions return grouped candidates with phrase, kind, rationale, and default-selected state. They do not mutate a product.

## Manual scans

Phase 4 implements `POST /api/scans` with an optional product ID:

    { "product_id": "uuid" }

Omit `product_id` to scan all active products. The response is `202` with `{ "data": { "status": "started", "scan_id": "uuid" } }`.

- `GET /api/scans` — recent durable scan records.
- `GET /api/scans/:id` — query progress, per-source funnel counts, status, and sanitized errors.
- `GET /api/scans/:id/candidates` — retained candidate evidence with overall fit, five dimension scores, discovery tier, need scope, author state, market-research value, source-query lineage, concise reason, matched phrases, item type, and source context.
- `POST /api/scans/candidates/:id/review` — appends a human tier label and optional note to any qualified or rejected scan candidate.
- `GET /api/scans/evaluation` — human/AI agreement, actionable precision/recall, and false-positive/false-negative counts for 7 or 30 days.
- `GET /api/scans/evaluation/export` — exports only platform, item type, predicted/human tiers, and numeric scores; source text, authors, URLs, queries, and notes are excluded.
- `POST /api/scans` accepts optional `mode: standard|deep`; deep scans use a 30-day source window while ordinary recurring scans use seven days. A product's first adaptive scan also receives the 30-day baseline automatically.
- `POST /api/scans/:id/cancel` — abort the currently active scan.

- `GET /api/scans/reddit/config` — current profile metadata, persistent kill-switch state, and the canonical Unknown/Caution/Paused/Blocked safety snapshot. The response is `no-store` and contains no cookies or password material.
- `POST /api/scans/reddit/test` — run one bounded native account read for the selected OpenCLI profile. A current cooldown returns 429 and a concurrent Reddit command returns 409.
- `POST /api/scans/reddit/pause` — persistently pause Reddit reads until a later successful bounded profile test.

The current local engine allows one active scan globally and one active Reddit browser command. It uses adaptive product-specific queries and bounded source budgets. Scan responses include new-hypothesis and memory-guided query counts plus a plain-language plan summary. Reddit authentication failure, 403 denial, restriction, challenge/CAPTCHA, and 429 rate limiting persist a fail-closed stop state; a reported Retry-After becomes a local cooldown. Community-rule preflight remains a later-phase contract.

## Opportunities

GET /api/opportunities filters by product_id, platform, content_type, status, min_score, date, and cursor.

- GET /api/opportunities/:id
- GET /api/opportunities/:id/reply-preflight — community-rule freshness, known eligibility, repetition/link warnings, disclosures, and native-review requirement.
- POST /api/opportunities/:id/feedback — appends `useful` or `not_relevant` with a verdict-compatible reason and optional note; corrections create a new event.
- POST /api/opportunities/:id/save
- POST /api/opportunities/:id/skip
- POST /api/opportunities/:id/mark-replied
- POST /api/opportunities/:id/draft
- GET /api/operations/:id
- PATCH /api/drafts/:id

Lifecycle actions are idempotent. Mark replied is explicitly self-reported and never calls a platform.

## Analytics

GET /api/analytics/summary supports window=7d|30d and product_id. It returns qualified, drafted, skipped, replied, conversion, source breakdown, and latest-feedback quality (`reviewed`, `useful`, `not_relevant`, `useful_percent`, and `top_negative_reason`).

## Extension

- POST /api/extension/pairing/start — creates a short-lived pairing request shown in the dashboard.
- POST /api/extension/pairing/complete — returns a scoped token once.
- GET /api/extension/pairings
- DELETE /api/extension/pairings/:id
- GET /api/extension/opportunity-by-url
- GET /api/extension/drafts/:id

The extension API has no submit/post endpoint.

## Validation and limits

All strings, arrays, URLs, enum values, pagination, freshness, query budget, and result budget are bounded. Platform IDs and executable selection use allowlists. Unexpected origins and non-loopback clients are rejected.
