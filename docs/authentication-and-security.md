# Authentication and Security

## Security objectives

- Isolate every user's private application data.
- Prevent quota, entitlement, and ownership bypasses.
- Keep service credentials out of browsers and logs.
- Treat platform content and AI output as untrusted.
- Preserve the manual-posting compliance boundary.

## Dashboard authentication

Use Supabase Auth. The dashboard obtains a short-lived access token and sends it to the Express API. The API verifies signature, issuer, audience, expiry, and subject using supported Supabase/JWT mechanisms.

The server derives `user_id` from the verified token only. It must never accept an owner ID from a client as authority. On first authenticated use, create the application profile idempotently through a database trigger or server transaction.

Dashboard sign-in uses Supabase Google OAuth as the primary v1 method and email magic links as fallback. Password authentication remains out of scope. Trial activation requires an email verified by Google or Supabase.

## Reddit discovery credential

- Use one server-side Reddit application credential/read token for all discovery work.
- Store the client secret and token only in the Railway secret manager; never in Postgres, the dashboard, or the extension.
- Cache and refresh the app token server-side and redact it from logs, errors, traces, and analytics.
- Apply a conservative global request budget, query batching, schedule jitter, returned rate-limit/retry headers, and a kill switch.
- Stop all Reddit discovery on revoked credentials or persistent authorization failure and expose only a generic degraded state to users.
- Users never connect their Reddit account. The extension manipulates the DOM only after a deliberate click inside the user’s already authenticated Reddit tab and does not read, store, or transmit Reddit cookies/tokens.

## API authorization

Every resource query combines resource ID with authenticated `user_id`, then applies action-specific checks. RLS is defense in depth, not a replacement for service authorization.

Authorization checks include:

- product/opportunity/draft ownership;
- active entitlement;
- atomic quota availability;
- allowed lifecycle transition;
- extension token scope;
- admin/service-only access for discovery and webhook records.

Return `404` for non-owned resources to reduce enumeration.

## Extension tokens

- Generate at least 256 bits of cryptographically secure randomness.
- Store a lookup prefix and a slow/appropriate cryptographic hash, never plaintext.
- Display plaintext once.
- Scope to extension actions; do not make it equivalent to a Supabase session.
- Support expiry, last-use metadata, and immediate revocation.
- Rate-limit validation and lookup by token/IP without relying on IP as identity.
- Rotate by creating a new token and revoking the old token.

Never pass the token in URL query strings. Keep it in the Authorization header and `chrome.storage.local`.

## Database security

- Enable RLS on every exposed application table.
- Revoke broad grants before adding minimum required policies.
- Keep service-role access only in server/worker environments.
- Protect ownership columns from client mutation.
- Use parameterized queries and validated database functions.
- Test policy behavior with two-user fixtures and anonymous access.
- Restrict shared `scanned_posts` visibility to content reachable by the current user's opportunity where direct client access exists.

## Secrets

Server-only secrets include:

- Supabase service-role key;
- Reddit client credentials;
- OpenAI API key/project credentials;
- Dodo API and webhook secrets;
- Redis credentials.

Use the hosting provider's secret manager/environment injection. Maintain separate values by environment. Never commit `.env` files containing secrets. Logs must redact authorization headers, cookies, webhook signatures, checkout payload secrets, and token-like strings.

## Input/output security

- Validate all API payloads with shared schemas and strict bounds.
- Render platform and AI text as escaped text.
- Sanitize any HN HTML before conversion/display; do not preserve executable markup.
- Defend prompts from instruction injection by delimiting external content and using fixed system policy.
- Allowlist outbound hosts to reduce SSRF risk.
- Validate redirect URLs against configured application origins.
- Configure CORS only for dashboard/extension origins that require API access.
- Use security headers and a restrictive CSP.

## Webhook security

Signature verification must use the raw body and current official Dodo algorithm/library. Enforce a timestamp tolerance to reduce replay, compare signatures safely, store unique event IDs, and perform no entitlement mutation until verification succeeds.

## Abuse and availability

- Per-user/IP rate limits for login-adjacent, checkout, token, and draft endpoints.
- Global/provider-aware limits for Reddit and AI calls.
- Payload/body size limits and timeouts.
- Bounded queues with backpressure.
- Idempotency keys for chargeable or repeatable mutations.
- Alert on token-validation attacks, signature failures, quota anomalies, and unexpected AI spend.

## Privacy and retention

The system stores public usernames/content, product descriptions, drafts, payment references, and operational metadata. Before launch:

- publish a privacy policy and terms appropriate to platform/API obligations;
- enforce the retention periods approved in `DEC-020`;
- provide account deletion and extension-token revocation;
- minimize raw webhook and AI prompt retention;
- document subprocessors and data regions;
- verify Reddit, HN, OpenAI, Supabase, Dodo, and hosting terms.

## Manual-posting invariant

Code review and tests must reject:

- Reddit/HN write API clients;
- programmatic submit-button activation;
- automatic form submission;
- status changes claiming verified posting based solely on text insertion.

The extension is permitted to insert text only after a deliberate user click.
