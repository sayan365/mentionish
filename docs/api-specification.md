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

Phrase suggestions return grouped candidates with phrase, kind, rationale, and default-selected state. They do not mutate a product.

## Manual scans

Phase 4 implements `POST /api/scans` with an optional product ID:

    { "product_id": "uuid" }

Omit `product_id` to scan all active products. The response is `202` with `{ "data": { "status": "started", "scan_id": "uuid" } }`.

- `GET /api/scans` — recent durable scan records.
- `GET /api/scans/:id` — query progress, per-source funnel counts, status, and sanitized errors.
- `GET /api/scans/:id/candidates` — retained candidate evidence with overall fit, five dimension scores, deterministic `worth_helping`/`potential_buyer`/`rejected` label, concise reason, matched phrases, item type, and source context.
- `POST /api/scans/:id/cancel` — abort the currently active scan.

The current HN slice allows one active scan globally, uses a fixed seven-day freshness window, at most ten phrases per product, 20 results per query, and 60 queries per scan. Configurable platforms, budgets, per-platform partial retry, and Account Safety rejection are later-phase contracts and are not exposed by the current endpoint.

## Opportunities

GET /api/opportunities filters by product_id, platform, content_type, status, min_score, date, and cursor.

- GET /api/opportunities/:id
- GET /api/opportunities/:id/reply-preflight — community-rule freshness, known eligibility, repetition/link warnings, disclosures, and native-review requirement.
- POST /api/opportunities/:id/useful
- POST /api/opportunities/:id/save
- POST /api/opportunities/:id/skip
- POST /api/opportunities/:id/mark-replied
- POST /api/opportunities/:id/draft
- GET /api/operations/:id
- PATCH /api/drafts/:id

Lifecycle actions are idempotent. Mark replied is explicitly self-reported and never calls a platform.

## Analytics

GET /api/analytics/summary supports window=7d|30d, product_id, and platform. It returns found, qualified, useful, drafted, skipped, replied, conversion, source breakdown, and content-type breakdown.

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