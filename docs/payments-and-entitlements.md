# Payments and Entitlements

## V1 commercial scope

The launch UI supports the USD 49 Founder Lifetime Deal first, limited to 100 purchases. Growth Monthly is represented in the backend model and webhook handler, but its customer-facing UI is deferred until the lifetime offer validates demand.

Do not hard-code example prices or limits in frontend code.

## Plan catalog

Maintain a server-side mapping:

```text
Dodo product/price identifier
  -> internal plan code and version
  -> entitlement limits and reset rules
```

The client sends an allowlisted internal plan code. The server selects the provider product and never trusts client-supplied price, currency, caps, or provider product ID.

Approved plan versions from `DEC-003` and `DEC-004` are:

- free trial: 14 days, 1 product, 5 keywords, 5 subreddits, 50 one-time classifications, 5 one-time drafts;
- Founder Lifetime: USD 49, lifetime product access, 1 product, 10 keywords, 20 subreddits, 3,600 total classifications, and 100 total drafts; AI credits do not replenish;
- Growth Monthly (UI deferred): USD 19/month, 3 products, 25 keywords and 50 subreddits per product, 1,500 classifications/month, 100 drafts/month.

## Checkout flow

1. Authenticated user chooses Founder Lifetime.
2. Dashboard calls `POST /api/checkout` with an idempotency key.
3. API verifies the plan is available and checks for an already-active/non-duplicable entitlement.
4. API creates a Dodo Checkout Session using the server-side product mapping and safe redirect URL.
5. API returns the hosted `checkout_url`.
6. Browser redirects to Dodo.
7. Return page shows “payment processing” and polls/refetches server entitlement.
8. Only a verified webhook activates access.

Avoid multiple lifetime purchases by detecting current entitlement while still handling provider-side duplicate/race outcomes safely.

## Webhook flow

1. Receive raw body and signature headers.
2. Verify signature and timestamp according to current Dodo documentation.
3. Parse only after verification.
4. Insert provider event ID into `webhook_events`.
5. If already processed, return success without duplicate effects.
6. Map provider product/customer to an internal user and plan.
7. Transactionally update payment record, entitlement period, and profile projection.
8. Mark event processed.
9. Return success; retry only truly transient failures.

Never identify the user solely from editable client metadata without validating the provider object and local mapping.

## Event behavior

Exact external event names must be verified. Required semantic handling:

| Semantic event | Application effect |
|---|---|
| Payment succeeded | Record payment and activate mapped entitlement/limits |
| Payment failed | Record failure; do not activate; notify through approved channel |
| Subscription renewed | Create/extend a new entitlement period and resetting allowance |
| Subscription canceled | Keep access through paid period if provider semantics require, then deactivate renewal |
| Refund succeeded | Record refund and revoke or adjust entitlement according to refund policy |

Out-of-order events are resolved using provider timestamps/status precedence and reconciliation—not arrival order alone.

## Usage enforcement

Payment state and quota are separate checks:

1. Is the entitlement active for this operation?
2. Does the relevant usage period have available units?

Reserve units atomically before queueing chargeable work. Consume on provider use/success per approved accounting semantics. Release safe failures. Unique operation keys prevent retries from double-consuming.

`DEC-001` and `DEC-002` approve classifications as the usage unit and the append-only period ledger as entitlement truth.

## Refund and revocation policy

An accepted refund has the following approved behavior:

- deactivate paid operations;
- preserve account and user-created data for the 30-day retention period in `DEC-020`;
- keep legally/accountingly required payment audit records;
- revoke/limit extension use consistently;
- do not delete data directly inside webhook handling.

Publish this behavior in the customer-facing refund and retention policy before checkout is enabled.

## Reconciliation

A periodic server job should compare unresolved/recent local payments with provider state, repair missed webhook outcomes idempotently, and alert on unknown products/customers. Manual operator replay must re-run the same idempotent handler, not edit entitlements ad hoc.

## Test-critical cases

- forged signature and stale timestamp;
- duplicate event delivery;
- events delivered out of order;
- checkout return before webhook;
- duplicate checkout attempts;
- payment success for unknown product/customer;
- refund after usage;
- renewal/cancel boundary;
- atomic quota use under concurrent draft requests.
