# Decisions and Open Questions

This register prevents ambiguous PRD language from becoming accidental product behavior. A proposed default is an implementation recommendation, not an approved decision.

## Open decisions

| ID | Topic | PRD ambiguity or gap | Proposed default | Needed before |
|---|---|---|---|---|
| DEC-001 | Scan quota unit | The schema counts scans, while lifetime pricing says “300 total scanned opportunities/month equivalent.” It is unclear whether a unit is a fetched item, keyword match, classification call, or qualified opportunity. | Count one Stage 1 classification per product/post pair. Name it `classifications_used`; do not count globally fetched or deduplicated posts. | Schema migration and quota code |
| DEC-002 | Usage periods | `scan_used` and `draft_used` have no reset period fields. Lifetime drafts are described as 100 total; monthly scans appear renewable. | Use an append-only usage ledger and plan entitlements with explicit period start/end. Lifetime draft limit never resets; renewable limits get billing periods. | Schema migration |
| DEC-003 | Free plan | `free` exists but its limits and access are not defined. | Allow onboarding and a small trial such as 20 classifications and 3 drafts; final numbers require owner approval. | Public launch and plan gating |
| DEC-004 | Lifetime limits and price | PRD provides example ranges, not final values. | Keep price and caps in server-side plan configuration; do not hard-code examples. | Dodo product creation |
| DEC-005 | Contributor evidence | Contributor gating requires 3+ prior non-promotional comments, but no table or workflow records them. | Add a per-product/subreddit manual counter plus audit timestamps; user attests and can update it. | Draft gating |
| DEC-006 | Karma stage ownership | `tracked_subreddits` belongs to a product, while karma normally belongs to a Reddit identity. Multi-account is out of scope. | Treat it as product/user-specific community standing in v1 and document that one user maps to one Reddit identity operationally. | Schema and UI |
| DEC-007 | Subreddit rules | Boolean and threshold cannot represent detailed rules that trusted drafts must follow. | Add `rules_summary`, `rules_source_url`, and `rules_verified_at`; humans seed and review them. | Seed data and prompts |
| DEC-008 | HN coverage | Polling story lists finds submissions, not comment conversations. | V1 indexes top-level story/Ask HN items only. Call them “HN items,” not all HN conversations. | UI copy and discovery code |
| DEC-009 | Reddit search scope | Global keyword search can return communities that are not in `tracked_subreddits`, leaving no karma rule. | Default unknown subreddits to newcomer safety; let users track/seed them later. | Scoring/drafting |
| DEC-010 | Automatic drafting | PRD describes Stage 2 after Stage 1, while API says user triggers draft generation. | Make Stage 2 user-triggered to control cost. Qualified items enter as `new`; drafting moves them to `drafted`. | Queue and dashboard |
| DEC-011 | Extension lookup | One section says the URL carries `opportunity_id`; another says extract external post ID. | Extract Reddit post ID and call the current-user-scoped lookup endpoint. Never put a trusted opportunity ID in an arbitrary Reddit URL. | Extension/API |
| DEC-012 | Extension draft persistence | Sidebar draft is editable, but persistence behavior is unspecified. | Save edits explicitly through the same draft PATCH API before/after insertion; insertion alone does not mark posted. | Extension UX |
| DEC-013 | Posted metrics denominator | “Drafts generated vs posted” can mean draft records or opportunities. | Count distinct opportunities with a draft versus distinct opportunities marked posted. | Analytics |
| DEC-014 | Product deletion | Retention/cascade behavior is unspecified. | Soft-delete products and exclude them from scans; retain payment/audit records. | CRUD API |
| DEC-015 | Product limits | Number of products, keywords, and tracked subreddits per user is undefined. | Configure per-plan limits; initially allow one active product for founder MVP. | Validation and pricing |
| DEC-016 | AI input retention | Provider retention and whether full post bodies may be sent are unstated. | Send only needed public post content and product context; disable provider training/retention where supported. | Provider setup |
| DEC-017 | Notifications | Payment failure says “notify,” but channel is unspecified. | In-app state plus transactional email if email infrastructure is available; at minimum record and expose the failure. | Payments |
| DEC-018 | `summarizeThread()` | Wrapper is required by stack text but no v1 feature invokes it. | Define the interface but do not call or bill it until a thread-summary feature is approved. | AI package |
| DEC-019 | Final hosting | PRD permits VPS/Railway/Render and Vercel but does not choose one. | Vercel for dashboard, Railway for API/worker, Upstash for Redis, Supabase hosted DB/Auth. | Deployment |
| DEC-020 | Data retention | No deletion/retention period exists for platform content, AI logs, or extension tokens. | Define retention before production; support account deletion and token revocation from launch. | Security review |

## External contracts requiring verification

Before integration, verify against current official documentation:

- Reddit OAuth grant type, API access eligibility, search behavior, rate-limit headers, and required user agent.
- Hacker News item fields and deleted/dead item handling.
- Anthropic model identifiers, token usage response fields, data-retention controls, and structured-output support.
- Dodo checkout request/response shapes, exact webhook event names, signature verification algorithm/library, timestamp tolerance, and retry behavior.
- Chrome Web Store Manifest V3 policies and Reddit DOM variants.

The PRD currently states HMAC SHA-256 headers and specific Dodo event names. Treat those as desired behavior but validate the exact wire contract before writing production code.

## Confirmed decisions from the PRD

- DEC-C01: Node.js/Express backend; no Python service.
- DEC-C02: Next.js, Tailwind, and shadcn/ui dashboard.
- DEC-C03: Supabase Postgres/Auth with RLS.
- DEC-C04: `node-cron` scheduling and BullMQ over Upstash Redis.
- DEC-C05: Anthropic behind a model-agnostic wrapper.
- DEC-C06: Manifest V3 Reddit extension.
- DEC-C07: Humans edit and submit all platform responses.
- DEC-C08: Keyword plus LLM classification; no vector search in v1.
- DEC-C09: Manually seed subreddit rules; no automatic detection.
- DEC-C10: Founder lifetime UI precedes monthly-plan UI.
