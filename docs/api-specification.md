# API Specification

## Conventions

- Base path: `/api`
- JSON request and response bodies, UTF-8.
- UTC timestamps in RFC 3339 format.
- Supabase access token: `Authorization: Bearer <jwt>`.
- Extension endpoint: `Authorization: Bearer <extension-token>`.
- Webhook authentication uses provider signature headers, not bearer auth.
- All mutation requests should accept `Idempotency-Key` where duplicate effects or charges are possible.
- IDs are UUID strings internally; platform IDs remain strings.

Successful single-resource responses use `{ "data": ... }`. Errors use:

```json
{
  "error": {
    "code": "DRAFT_QUOTA_EXCEEDED",
    "message": "Draft limit reached.",
    "request_id": "req_...",
    "details": {}
  }
}
```

Do not expose stack traces, provider secrets, or raw upstream errors.

## Pagination

Use cursor pagination:

```json
{
  "data": [],
  "page": {
    "next_cursor": "opaque-or-null",
    "has_more": false
  }
}
```

The cursor encodes the active sort tuple. Default limit: 20; maximum: 100.

## Endpoints

### `POST /api/products`

Creates a product owned by the authenticated user.

Request:

```json
{
  "name": "Acme",
  "description": "Helps small SaaS teams understand churn.",
  "keywords": ["customer churn", "reduce churn"],
  "voice_persona": "Direct, useful, no hype."
}
```

Validation: non-empty bounded name/description; keyword count/length subject to plan decision; trim, lowercase comparison form, remove duplicates; persona length bounded.

Response: `201` with the product. Errors: `400 VALIDATION_ERROR`, `401`, `403 PRODUCT_LIMIT_REACHED`, `409` if idempotency conflicts.

### `GET /api/products`

Lists current user's active products. This endpoint is required by dashboard navigation even though omitted from the PRD endpoint sketch.

### `GET /api/products/:id/opportunities`

Query parameters:

- `status`: repeatable or comma-separated allowed statuses;
- `platform`: `reddit` or `hackernews`;
- `min_score`: default 60 for feed;
- `limit`, `cursor`;
- `sort`: v1 supports `score_desc` (score descending, then creation descending).

Each item includes opportunity fields and a safe scanned-post projection. It may include the current draft, but not other users' matches or private product data.

Errors: `401`, `404` for absent or non-owned product.

### `POST /api/opportunities/:id/draft`

Requires authenticated ownership, qualified score, allowed status, and available quota. Enqueues or performs Stage 2 generation.

Request:

```json
{
  "regenerate": false
}
```

Recommended response: `202` with an operation/job ID when asynchronous. Repeating the same idempotency key returns the same operation. A successful existing draft may return `200`.

Errors include `404`, `409 DRAFT_ALREADY_EXISTS`, `422 OPPORTUNITY_NOT_QUALIFIED`, `429 DRAFT_QUOTA_EXCEEDED`, and `503 AI_TEMPORARILY_UNAVAILABLE`.

### `GET /api/operations/:id`

Returns safe async-operation status for draft polling. This support endpoint is needed if draft generation is queued.

### `PATCH /api/drafts/:id`

Request:

```json
{
  "edited_text": "A user-reviewed version.",
  "expected_updated_at": "2026-07-29T10:00:00Z"
}
```

Use optimistic concurrency to prevent dashboard/extension overwrite. An `edited_text` value of `null` restores use of generated text. The extension autosaves before enabling insertion, as approved in `DEC-012`.

### `POST /api/opportunities/:id/mark-posted`

Marks an owned `new` or `drafted` opportunity as user-declared posted.

Request may contain `posted_at`; server defaults to current time. The response/UI must not claim platform verification.

Repeated requests are idempotent. It never calls a platform API.

### `POST /api/opportunities/:id/skip`

Required to implement `OPP-005` for user dismissal.

```json
{ "reason": "not_relevant" }
```

### `GET /api/opportunity-by-post?platform=reddit&external_id=...`

Extension-scoped endpoint. It returns only an opportunity owned by the token's user and in `new` or `drafted`.

If multiple active products match the same post, return a list or deterministic selection. Recommended: return a list so the user chooses; this is coupled to `DEC-015`.

Response fields are minimal: opportunity ID, score, reasoning, current draft ID/text, product display name, status, and update timestamp.

Return `404` when no matching owned opportunity exists. Never reveal that another user has a match.

### `GET /api/usage`

Returns authoritative plan and usage:

```json
{
  "data": {
    "plan": "lifetime",
    "entitlement_status": "active",
    "classification": {
      "used": 0,
      "limit": 0,
      "resets_at": null
    },
    "draft": {
      "used": 0,
      "limit": 0,
      "resets_at": null
    }
  }
}
```

Actual limits come from plan configuration; zeroes are placeholders, not plan values.

### `POST /api/checkout`

Creates a hosted Dodo checkout session for an allowlisted server-side product/price mapping.

```json
{
  "plan": "lifetime",
  "success_url": "https://app.example.com/billing/success"
}
```

The client must not provide arbitrary provider product IDs, price, or entitlement limits. Response contains only the checkout URL and local operation ID. Redirect success does not activate access.

### `POST /webhooks/dodopayments`

Reads the raw request body, verifies current Dodo signature requirements and timestamp tolerance, stores the event idempotently, then applies entitlement changes transactionally.

Responses:

- `2xx` for verified events already processed or successfully accepted;
- `4xx` for invalid signature/payload;
- `5xx` only for retryable processing failure.

Unknown verified event types are recorded and acknowledged without granting access.

### Extension token endpoints

- `POST /api/extension-tokens`: creates a scoped token and returns plaintext once.
- `GET /api/extension-tokens`: lists metadata, never hashes/plaintext.
- `DELETE /api/extension-tokens/:id`: revokes a token.

These are required to satisfy `EXT-007`.

### Dashboard summary endpoint

`GET /api/analytics/summary?product_id=&window=7d|30d` returns the v1 metrics defined in the analytics spec.

## Authorization checklist for every user endpoint

1. Validate token and issuer/audience.
2. Derive user identity only from the token.
3. Validate input schema and bounds.
4. Query by resource ID **and** owner ID.
5. Enforce entitlement/quota on the server.
6. Return `404` rather than leaking non-owned resource existence.
7. Write request/audit context without secrets.

## Status transitions

```text
unclassified -> new       score >= 60
unclassified -> skipped   score < 60
new          -> drafted   successful draft
new          -> skipped   user action
drafted      -> skipped   user action
new/drafted  -> posted    user action
```

No platform event automatically changes status to `posted`. Regeneration does not change a posted opportunity back to drafted.
