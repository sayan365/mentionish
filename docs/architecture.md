# System Architecture

## Architectural goals

- Keep the final post action human-controlled.
- Share fetched platform content while isolating every user's products, opportunities, drafts, usage, and payments.
- Bound AI and platform API costs.
- Make scheduled work retryable, observable, and idempotent.
- Keep v1 deployable by a small team without premature services.

## Logical components

| Component | Responsibility |
|---|---|
| Next.js dashboard | Authentication UI, onboarding, product configuration, opportunity feed, editing, analytics, checkout initiation, extension-token management |
| Express API | Authenticated application API, authorization, quota enforcement, checkout creation, extension endpoints, webhook receiver |
| Scheduler | Starts Reddit scans every 20–30 minutes and HN scans every 15 minutes |
| BullMQ workers | Rate-limited fetch work, classification, draft generation, retries, and dead-letter handling |
| Discovery adapters | Normalize Reddit and Hacker News payloads into platform-neutral scanned posts |
| AI adapter | Implements structured classification and drafting through the OpenAI Responses API with role-specific GPT models |
| Supabase | Auth, Postgres, row-level security, migrations, and shared platform data |
| Upstash Redis | BullMQ queues, locks, retry state, and rate limiting |
| Chrome extension | Authenticated Reddit opportunity lookup and user-initiated insertion into the native editor |
| Dodo Payments | Hosted checkout and payment/subscription lifecycle webhooks |

## Deployment view

```text
Browser
  ├─ Dashboard ─────── HTTPS ────── Express API
  └─ Chrome extension ─ HTTPS ────────┤
                                      ├─ Supabase Auth/Postgres
Dodo Payments ─ webhook HTTPS ────────┤
                                      ├─ Redis/BullMQ
Scheduler/Workers ────────────────────┤
  ├─ Reddit read API                  ├─ OpenAI Responses API
  └─ Hacker News read API
```

The dashboard deploys to Cloudflare Workers with the OpenNext adapter. The Express API, scheduler, and BullMQ workers run as separate Railway processes because they require a long-running Node runtime. Supabase hosts Postgres/Auth and Upstash hosts Redis. This topology is approved in `DEC-019`.

## Trust boundaries

1. **Dashboard browser:** untrusted client; Supabase access token identifies the user, but the server still validates ownership and limits.
2. **Extension:** untrusted client on a third-party origin; uses a revocable, hashed, scoped token. It never receives service-role or payment secrets.
3. **Platform content:** public but untrusted; escape before rendering and never treat it as prompt or HTML instructions.
4. **AI output:** untrusted suggestion; validate structure, scan policy constraints, render as text, and require human review.
5. **Dodo webhook:** unauthenticated until raw-body signature verification succeeds.
6. **Workers/database:** privileged server boundary; service-role credentials are confined here and every job carries explicit ownership context.

## End-to-end discovery flow

1. Scheduler creates a scan run with a deterministic time bucket and platform.
2. Active keywords are normalized and batched.
3. The Reddit adapter performs paced read requests through the single server-side app token; HN uses its public read API.
4. Responses are normalized and upserted into `scanned_posts`.
5. Matching product/post pairs are inserted idempotently.
6. In one transaction, the server checks/reserves usage for each chargeable classification.
7. A classification job calls the cheap model and records usage.
8. Score and reasoning update the opportunity. Scores below 60 become `skipped`; scores at least 60 become `new`.
9. The dashboard reads only qualified/current-user opportunities by default.

## Draft flow

1. User requests a draft for an owned, qualified opportunity.
2. API atomically checks and reserves draft quota.
3. API resolves product context and applicable subreddit policy.
4. Draft job is enqueued with an idempotency key.
5. Worker generates a structured response with the stronger model.
6. Server validates the response and hard policy constraints.
7. Draft is persisted, opportunity becomes `drafted`, and AI usage is recorded.
8. A retry must return/reuse the existing successful draft rather than charge twice.

## Posting assistance flows

### Reddit

1. Dashboard opens the canonical Reddit thread.
2. Extension extracts the post ID from recognized Reddit URL forms.
3. Extension calls the scoped backend lookup.
4. User optionally edits the draft and explicitly clicks “Insert into Reddit.”
5. Extension writes text and dispatches an input event.
6. User reviews the native editor and clicks Reddit's submit control.
7. User separately marks the opportunity posted in Mentionish.

No Mentionish component clicks submit, sends a Reddit write request, or claims posting success.

### Hacker News

The dashboard copies the effective draft (`edited_text` if present, otherwise generated text) and opens the source URL. The user pastes and submits manually.

## Idempotency boundaries

- Platform content: unique `(platform, external_id)`.
- Product/post matching: unique `(product_id, scanned_post_id)`.
- Scheduled run: unique `(platform, schedule_bucket)`.
- AI operation: unique logical operation key, with retry attempts attached to one operation.
- Webhook event: unique provider event ID.
- Checkout creation: client-supplied idempotency key or server operation ID.

## Failure behavior

- External timeouts and 429/5xx responses use exponential backoff with jitter.
- Permanent validation/auth failures do not retry indefinitely.
- Jobs exceeding retry policy enter a dead-letter state visible to operators.
- A failed AI call releases a reserved usage unit unless provider usage was actually incurred; exact reconciliation must be transactionally logged.
- Webhook verification failures return an error and make no state changes.
- Partial discovery failure records per-query status so the next run can safely retry.

## Architecture constraints

- No platform write adapter exists in the codebase.
- Do not put `node-cron` in every horizontally scaled API instance without a distributed lock or dedicated scheduler.
- Do not expose Supabase service-role, OpenAI, Reddit application, Dodo webhook, or Redis credentials to browsers. No user-facing Reddit OAuth flow exists.
- Avoid pgvector and extra microservices in v1.
